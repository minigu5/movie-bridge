-- supabase/migrations/0016_reservation_guards_and_schema_cleanup.sql
-- 2026-10-27 DB 점검 후속 (1/2). 예매 규칙을 클라이언트가 아니라 DB가 강제하게 한다.
-- anon key는 공개돼 있어 브라우저 코드의 검사(결제 상태, 블랙리스트, 마감, VIP석, 1인 1좌석,
-- 본인 명의)는 supabase-js 직접 호출로 전부 우회할 수 있었다.
-- 이 파일은 기존 클라이언트와도 호환된다(값을 덮어쓰거나 막을 뿐 조회 범위는 그대로).
-- 조회 범위 축소는 새 클라이언트 배포 후 0017에서 한다.

-- =========================================================
-- 1. 스키마 정리
-- =========================================================

-- 날짜를 text로 두면 비교할 때마다 캐스팅이 필요하고 형식 검증도 안 된다.
-- 운영 데이터는 전부 ISO 형식(YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss+09:00)이라 그대로 변환된다.
alter table public.movie_settings alter column deadline_date drop default;
alter table public.movie_settings
  alter column db_date type date using db_date::date,
  alter column deadline_date type timestamptz using nullif(deadline_date, '')::timestamptz;

-- 기본값에 따옴표가 문자로 들어가 있었다('''전체관람가''').
alter table public.movie_settings alter column age_rating set default '전체관람가';

-- 원본 movie_settings.id(integer)와 타입을 맞춘다.
alter table public.reservations alter column movie_settings_id type integer;
alter table public.reservations alter column movie_settings_id set not null;
-- 컬럼을 참조하는 정책이 있으면 타입을 못 바꾸므로 잠시 내렸다가 같은 조건으로 다시 만든다.
drop policy if exists movie_reviews_insert_club_member on public.movie_reviews;
alter table public.movie_reviews alter column movie_settings_id type integer;
create policy movie_reviews_insert_club_member on public.movie_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.club_members cm where cm.email = (select auth.jwt()->>'email'))
    and exists (select 1 from public.movie_settings ms where ms.id = movie_reviews.movie_settings_id and ms.is_active = false)
  );

update public.reservations set payment_status = 'pending' where payment_status is null;
update public.reservations set is_printed = false where is_printed is null;
update public.reservations set is_group_leader = false where is_group_leader is null;
update public.reservations set group_report_sent = false where group_report_sent is null;
alter table public.reservations
  alter column payment_status set not null,
  alter column is_printed set not null,
  alter column is_group_leader set not null,
  alter column group_report_sent set not null;

do $$ begin
  alter table public.reservations add constraint reservations_payment_status_check
    check (payment_status in ('pending', 'confirmed', 'group_pending'));
exception when duplicate_object then null; end $$;

-- 좌석 중복 방지 기준을 상영일이 아니라 회차로. 같은 날 두 회차가 생겨도 안전하다.
-- 1인 1좌석도 클라이언트 검사뿐이었다(스크립트로 좌석 전체 선점 가능).
create unique index if not exists reservations_movie_settings_id_seat_number_key
  on public.reservations (movie_settings_id, seat_number);
create unique index if not exists reservations_movie_settings_id_user_id_key
  on public.reservations (movie_settings_id, user_id);
alter table public.reservations drop constraint if exists reservations_movie_date_seat_number_key;
-- 위 unique 인덱스의 선두 컬럼이 movie_settings_id라 단일 인덱스는 중복이다.
drop index if exists public.reservations_movie_settings_id_idx;

-- user_id FK가 NO ACTION이라 예매 이력이 있는 사용자는 auth에서 삭제할 수 없었다.
-- movie_reviews와 같게 cascade로 맞추고, cascade/조회용 인덱스를 둔다.
alter table public.reservations drop constraint if exists reservations_user_id_fkey;
alter table public.reservations
  add constraint reservations_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
create index if not exists reservations_user_id_idx on public.reservations (user_id);
create index if not exists movie_reviews_user_id_idx on public.movie_reviews (user_id);

-- 0002에서 PK를 email로 바꾸면서 남은 고아 컬럼/시퀀스.
alter table public.blacklist drop column if exists id;
drop sequence if exists public.blacklist_id_seq;

alter table public.activity_logs alter column id set default gen_random_uuid();

-- movie_settings에 같은 내용의 select 정책이 두 개(public / authenticated) 있었다.
drop policy if exists movie_settings_select_authenticated on public.movie_settings;

-- =========================================================
-- 2. 공용 헬퍼
-- =========================================================

-- 도메인 제한은 클라이언트(hd 파라미터 + 즉시 로그아웃)에만 있었다. 다른 구글 계정도
-- 로그아웃 전에 토큰을 가로채면 authenticated로 요청할 수 있으므로 DB에서도 확인한다.
create or replace function public.is_school_user()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt()->>'email') like '%@ts.hs.kr', false);
$$;

create or replace function public.popcorn_count(p_order text)
returns integer
language sql
immutable
as $$
  select case when p_order is null or p_order in ('', 'none') then 0
              else cardinality(array_remove(string_to_array(p_order, ','), 'none')) end;
$$;

-- lib/seatGrid.ts computeSeatId의 역함수. 존재하지 않는 좌석이면 행이 없다.
--   중강당: A01~A63(왼쪽 7열), B01~B62(오른쪽 7열), 9행
--   대강당: A001/B001/C001~(블록당 9열), 18행
create or replace function public.seat_grid_position(p_seat text, p_grand boolean)
returns table (row_idx integer, col_num integer)
language plpgsql
immutable
as $$
declare
  v_width integer;
  v_rows integer;
  v_num integer;
begin
  if p_grand then
    if p_seat is null or p_seat !~ '^[ABC][0-9]{3}$' then return; end if;
    v_width := 9; v_rows := 18;
  else
    if p_seat is null or p_seat !~ '^[AB][0-9]{2}$' then return; end if;
    v_width := 7; v_rows := 9;
  end if;
  v_num := substring(p_seat from 2)::integer;
  if v_num < 1 or (v_num - 1) / v_width >= v_rows then return; end if;
  if not p_grand and p_seat = 'B63' then return; end if;
  row_idx := (v_num - 1) / v_width;
  col_num := (ascii(p_seat) - 65) * v_width + (v_num - 1) % v_width + 1;
  return next;
end;
$$;

create or replace function public.is_grand_hall(p_ms public.movie_settings)
returns boolean
language sql
immutable
as $$
  select coalesce(p_ms.venue like '%대강당%', false);
$$;

-- lib/seatGrid.ts computeVipSeats와 같은 판정. JS의 `||` 기본값(빈 문자열/0도 기본값)을 따른다.
create or replace function public.is_vip_seat(p_ms public.movie_settings, p_seat text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.seat_grid_position(p_seat, public.is_grand_hall(p_ms)) p
    where case when public.is_grand_hall(p_ms) then
        65 + p.row_idx between ascii(coalesce(nullif(p_ms.grand_vip_start_row, ''), 'A'))
                           and ascii(coalesce(nullif(p_ms.grand_vip_end_row, ''), 'C'))
        and p.col_num between coalesce(nullif(p_ms.grand_vip_start_col, 0), 10)
                          and coalesce(nullif(p_ms.grand_vip_end_col, 0), 18)
      else
        65 + p.row_idx between ascii(coalesce(nullif(p_ms.mid_vip_start_row, ''), 'A'))
                           and ascii(coalesce(nullif(p_ms.mid_vip_end_row, ''), 'C'))
        and p.col_num between coalesce(nullif(p_ms.mid_vip_start_col, 0), 5)
                          and coalesce(nullif(p_ms.mid_vip_end_col, 0), 10)
      end
  );
$$;

-- =========================================================
-- 3. reservations 가드 트리거
-- =========================================================
-- 모든 API 요청(authenticated, service_role)에 공통 규칙을 적용하고,
-- authenticated(브라우저 직접 호출)에는 본인 명의/결제 상태/변경 가능 컬럼을 추가로 강제한다.
-- JWT가 없는 직접 접속(SQL 편집기, 마이그레이션)은 건드리지 않는다.
-- 사용자에게 그대로 보여줄 수 있는 메시지는 errcode P0001로 던진다.
create or replace function public.reservations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.role();
  v_ms public.movie_settings;
  v_profile public.profiles;
  v_seat_changed boolean;
begin
  if v_role is null or v_role not in ('authenticated', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_role = 'authenticated' then
      select * into v_profile from public.profiles where id = auth.uid();
      if not found then
        raise exception '프로필이 없습니다. 다시 로그인해주세요.' using errcode = '42501';
      end if;
      -- 클라이언트가 보낸 명의/회차/상태 값은 믿지 않고 서버 값으로 덮어쓴다.
      new.user_id := v_profile.id;
      new.email := v_profile.email;
      new.student_id := v_profile.student_id;
      new.student_name := v_profile.name;
      new.movie_settings_id := (select id from public.movie_settings where is_active);
      new.popcorn_order := coalesce(nullif(new.popcorn_order, ''), 'none');
      new.payment_status := case when public.popcorn_count(new.popcorn_order) = 0 then 'confirmed' else 'pending' end;
      new.is_printed := false;
      new.group_id := null;
      new.is_group_leader := false;
      new.group_expires_at := null;
      new.group_report_sent := false;
      new.created_at := now();
    end if;

    select * into v_ms from public.movie_settings where id = new.movie_settings_id;
    if not found or not v_ms.is_active then
      raise exception '현재 예매 중인 회차가 아닙니다.' using errcode = 'P0001';
    end if;
    new.movie_date := v_ms.db_date;

    if v_ms.deadline_date is not null and now() > v_ms.deadline_date then
      raise exception '예매가 마감되었습니다.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.seat_grid_position(new.seat_number, public.is_grand_hall(v_ms))) then
      raise exception '존재하지 않는 좌석입니다.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.blacklist where lower(email) = lower(new.email)) then
      raise exception '블랙리스트에 등록되어 예매가 제한되었습니다.' using errcode = 'P0001';
    end if;
    if public.is_vip_seat(v_ms, new.seat_number)
       and not exists (select 1 from public.club_members where lower(email) = lower(new.email)) then
      raise exception '선택하신 좌석은 ''영화대교'' 동아리 전용석입니다.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE: 결제 승인/발권/단체 정리는 service_role(API)만 한다.
  if v_role <> 'authenticated' then
    return new;
  end if;

  -- 사용자가 직접 바꿀 수 있는 건 좌석과 팝콘뿐이다.
  new.id := old.id;
  new.user_id := old.user_id;
  new.email := old.email;
  new.student_id := old.student_id;
  new.student_name := old.student_name;
  new.movie_date := old.movie_date;
  new.movie_settings_id := old.movie_settings_id;
  new.is_printed := old.is_printed;
  new.group_id := old.group_id;
  new.is_group_leader := old.is_group_leader;
  new.group_expires_at := old.group_expires_at;
  new.group_report_sent := old.group_report_sent;
  new.created_at := old.created_at;

  if old.payment_status = 'group_pending' then
    raise exception '단체 예매 초대는 초대 메일의 확정 화면에서 처리해주세요.' using errcode = 'P0001';
  end if;

  select * into v_ms from public.movie_settings where id = old.movie_settings_id;
  if not found or not v_ms.is_active then
    raise exception '이미 종료된 회차의 예매는 변경할 수 없습니다.' using errcode = 'P0001';
  end if;

  new.popcorn_order := coalesce(nullif(new.popcorn_order, ''), 'none');
  if public.popcorn_count(new.popcorn_order) < public.popcorn_count(old.popcorn_order) then
    raise exception '결제 혼선 방지를 위해 기존에 주문한 팝콘 수량을 취소/삭제할 수 없습니다.' using errcode = 'P0001';
  end if;
  -- 결제 확정(confirmed)은 관리자 승인으로만. 사용자는 결제 대기로 되돌리는 것만 가능하다.
  if new.payment_status is distinct from old.payment_status and new.payment_status <> 'pending' then
    raise exception '결제 상태는 직접 변경할 수 없습니다.' using errcode = '42501';
  end if;
  if public.popcorn_count(new.popcorn_order) > public.popcorn_count(old.popcorn_order) then
    new.payment_status := 'pending';
  end if;

  v_seat_changed := new.seat_number is distinct from old.seat_number;
  if v_seat_changed then
    if v_ms.deadline_date is not null and now() > v_ms.deadline_date then
      raise exception '예매가 마감되어 좌석을 변경할 수 없습니다.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.seat_grid_position(new.seat_number, public.is_grand_hall(v_ms))) then
      raise exception '존재하지 않는 좌석입니다.' using errcode = 'P0001';
    end if;
    if public.is_vip_seat(v_ms, new.seat_number)
       and not exists (select 1 from public.club_members where lower(email) = lower(old.email)) then
      raise exception '선택하신 좌석은 ''영화대교'' 동아리 전용석입니다.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_guard on public.reservations;
create trigger reservations_guard
  before insert or update on public.reservations
  for each row execute function public.reservations_guard();

-- =========================================================
-- 4. profiles / activity_logs / movie_reviews 명의 고정
-- =========================================================

-- 최초 로그인 시 클라이언트가 보낸 이름/학번/역할 대신 auth.users의 구글 이름으로 만든다.
-- lib/supabase-auth.ts parseGoogleIdentity와 같은 규칙. 관리자 수정(service_role)은 그대로 허용.
create or replace function public.profiles_fill_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_full_name text;
  v_match text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select u.email, trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email))
    into v_email, v_full_name
  from auth.users u where u.id = auth.uid();

  new.id := auth.uid();
  new.email := v_email;
  new.created_at := now();
  v_match := regexp_match(v_full_name, '^([0-9]{4})\s?(.+)$');
  if v_match is not null and length(trim(v_match[2])) > 0 then
    new.student_id := v_match[1];
    new.name := trim(v_match[2]);
    new.role := 'student';
  else
    new.student_id := null;
    new.name := v_full_name;
    new.role := 'staff';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_fill_from_auth on public.profiles;
create trigger profiles_fill_from_auth
  before insert on public.profiles
  for each row execute function public.profiles_fill_from_auth();

-- 로그의 학번/이름을 남의 것으로 적을 수 없게 한다.
create or replace function public.activity_logs_fill_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    raise exception '프로필이 없습니다.' using errcode = '42501';
  end if;
  new.student_id := coalesce(v_profile.student_id, '교직원');
  new.student_name := v_profile.name;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists activity_logs_fill_actor on public.activity_logs;
create trigger activity_logs_fill_actor
  before insert on public.activity_logs
  for each row execute function public.activity_logs_fill_actor();

do $$ begin
  alter table public.activity_logs add constraint activity_logs_description_length
    check (char_length(description) <= 500);
exception when duplicate_object then null; end $$;

-- 후기 작성자 이름을 프로필 이름으로 고정하고, 수정 시 대상 회차/작성자는 못 바꾸게 한다.
create or replace function public.movie_reviews_fill_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.movie_settings_id := old.movie_settings_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.user_name := (select name from public.profiles where id = new.user_id);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists movie_reviews_fill_author on public.movie_reviews;
create trigger movie_reviews_fill_author
  before insert or update on public.movie_reviews
  for each row execute function public.movie_reviews_fill_author();

-- =========================================================
-- 5. 조회용 RPC (0017에서 reservations/blacklist/club_members 조회를 본인 행으로 줄이기 위한 대체 경로)
-- =========================================================

-- 로그인 좌석표: 다른 사람 행은 좌석/상태/이름만, 내 행만 id/팝콘/user_id까지 준다.
-- (이메일·학번은 내려주지 않는다)
create or replace function public.active_seat_map()
returns table (
  id uuid, seat_number text, payment_status text, student_name text,
  group_expires_at timestamptz, popcorn_order text, user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select case when r.user_id = auth.uid() then r.id end,
         r.seat_number, r.payment_status, r.student_name, r.group_expires_at,
         case when r.user_id = auth.uid() then r.popcorn_order end,
         case when r.user_id = auth.uid() then r.user_id end
  from public.reservations r
  join public.movie_settings m on m.id = r.movie_settings_id and m.is_active
  where public.is_school_user();
$$;

-- 단체 예매 멤버 추가 전 확인. 남의 예매/블랙리스트/동아리 명단을 통째로 읽지 않고
-- 해당 멤버를 그 좌석에 넣을 수 없는 이유(없으면 null)만 돌려준다.
create or replace function public.group_member_check(p_user_id uuid, p_seat text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ms public.movie_settings;
  v_email text;
begin
  if not public.is_school_user() then
    return '로그인이 필요합니다.';
  end if;
  select * into v_ms from public.movie_settings where is_active;
  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    return '존재하지 않는 사용자입니다.';
  end if;
  if exists (select 1 from public.reservations where movie_settings_id = v_ms.id and user_id = p_user_id) then
    return '이미 예매가 완료된 학생입니다.';
  end if;
  if exists (select 1 from public.blacklist where lower(email) = lower(v_email)) then
    return '블랙리스트에 등록되어 추가할 수 없습니다.';
  end if;
  if p_seat is not null and public.is_vip_seat(v_ms, p_seat)
     and not exists (select 1 from public.club_members where lower(email) = lower(v_email)) then
    return E'선택하신 좌석은 ''영화대교'' 동아리 전용석입니다.\n이 좌석에는 동아리 부원만 추가할 수 있습니다.';
  end if;
  return null;
end;
$$;

-- 단체 확정 화면에서 같은 그룹 멤버 행을 볼 수 있게 하는 정책 헬퍼(0017).
-- 정책 안에서 reservations를 직접 서브쿼리하면 RLS가 재귀하므로 security definer로 분리한다.
create or replace function public.my_group_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select group_id from public.reservations where user_id = auth.uid() and group_id is not null;
$$;

-- 활성 회차 기준을 db_date 문자열 비교에서 회차 id로.
create or replace function public.current_seat_status()
returns table (seat_number text, payment_status text, group_expires_at timestamptz)
language sql
stable
as $$
  select r.seat_number, r.payment_status, r.group_expires_at
  from public.reservations r
  join public.movie_settings m on m.id = r.movie_settings_id and m.is_active;
$$;

-- =========================================================
-- 6. 함수 실행 권한
-- =========================================================
-- Supabase는 public 스키마 함수에 anon/authenticated 실행 권한을 기본으로 준다.
-- revoke from public만으로는 그 명시적 grant가 안 지워진다(can_book에 anon이 남아 있었다).
revoke all on function public.can_book() from public, anon;
revoke all on function public.active_seat_map() from public, anon;
revoke all on function public.group_member_check(uuid, text) from public, anon;
revoke all on function public.my_group_ids() from public, anon;
revoke all on function public.current_seat_status() from public, anon, authenticated;
revoke all on function public.reservations_guard() from public, anon, authenticated;
revoke all on function public.profiles_fill_from_auth() from public, anon, authenticated;
revoke all on function public.activity_logs_fill_actor() from public, anon, authenticated;
revoke all on function public.movie_reviews_fill_author() from public, anon, authenticated;
grant execute on function public.can_book() to authenticated;
grant execute on function public.active_seat_map() to authenticated;
grant execute on function public.group_member_check(uuid, text) to authenticated;
grant execute on function public.my_group_ids() to authenticated;
grant execute on function public.current_seat_status() to service_role;
