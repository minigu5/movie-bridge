-- supabase/migrations/0021_require_previous_review.sql
-- 직전 상영작을 본 사람은 그 영화 후기를 남겨야 다음 영화를 예매할 수 있다.
--   직전 상영작: 보관 중(is_active=false)인 회차 중 상영일이 가장 늦은 것 하나.
--   본 사람: 그 회차 예매가 있고 키오스크에서 티켓을 발권(is_printed)한 사람. 예매만 하고 안 온 사람은 제외.
-- 화면(components/RequiredReviewModal.tsx)이 좌석을 고를 때 후기 작성 창을 먼저 띄우고, DB가 새 예매 insert를 막는다.
-- 이미 잡아 둔 예매의 좌석 이동/팝콘 추가(update)는 막지 않는다.

-- 후기 작성 대상을 동아리원에서 "동아리원 또는 그 회차를 예매했던 사람"으로 넓힌다.
drop policy if exists movie_reviews_insert_club_member on public.movie_reviews;
drop policy if exists movie_reviews_insert_member_or_viewer on public.movie_reviews;
create policy movie_reviews_insert_member_or_viewer on public.movie_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.movie_settings ms where ms.id = movie_reviews.movie_settings_id and ms.is_active = false)
    and (
      exists (select 1 from public.club_members cm where lower(cm.email) = lower((select auth.jwt()->>'email')))
      or exists (select 1 from public.reservations r
                 where r.movie_settings_id = movie_reviews.movie_settings_id and r.user_id = (select auth.uid()))
    )
  );

-- p_user_id가 아직 후기를 안 쓴 직전 상영작(없으면 행 없음).
create or replace function public.pending_review_movie(p_user_id uuid)
returns table (id integer, title text, date_string text, poster_url text, poster_cdn_url text)
language sql
stable
security definer
set search_path = public
as $$
  with prev as (
    select ms.id, ms.title, ms.date_string, ms.poster_url, ms.poster_cdn_url
    from public.movie_settings ms
    where not ms.is_active
    order by ms.db_date desc nulls last, ms.id desc
    limit 1
  )
  select prev.id, prev.title, prev.date_string, prev.poster_url, prev.poster_cdn_url
  from prev
  where exists (select 1 from public.reservations r
                where r.movie_settings_id = prev.id and r.user_id = p_user_id and r.is_printed)
    and not exists (select 1 from public.movie_reviews mr
                    where mr.movie_settings_id = prev.id and mr.user_id = p_user_id);
$$;

-- 화면용: 로그인한 본인 것만.
create or replace function public.my_pending_review()
returns table (id integer, title text, date_string text, poster_url text, poster_cdn_url text)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.pending_review_movie(auth.uid()) where public.is_school_user();
$$;

-- 새 예매 insert 차단. 브라우저 직접 예매(authenticated)와 단체 예매 API(service_role, 리더+멤버) 모두 대상.
-- SQL 편집기 등 JWT 없는 직접 접속은 건드리지 않는다.
create or replace function public.require_previous_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.role();
  v_title text;
begin
  if v_role is null or v_role not in ('authenticated', 'service_role') then
    return new;
  end if;
  select p.title into v_title from public.pending_review_movie(new.user_id) p;
  if v_title is null then
    return new;
  end if;
  if v_role = 'authenticated' then
    raise exception '지난 상영작 「%」 관람 후기를 남겨야 다음 영화를 예매할 수 있습니다.', v_title using errcode = 'P0001';
  end if;
  raise exception '%님은 지난 상영작 「%」 관람 후기를 아직 남기지 않아 예매할 수 없습니다.', new.student_name, v_title using errcode = 'P0001';
end;
$$;

drop trigger if exists reservations_require_review on public.reservations;
create trigger reservations_require_review
  before insert on public.reservations
  for each row execute function public.require_previous_review();

-- 단체 예매 멤버 추가 단계에서 미리 알려준다(0016 정의 + 후기 확인 한 줄).
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
  v_review_title text;
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
  select p.title into v_review_title from public.pending_review_movie(p_user_id) p;
  if v_review_title is not null then
    return format(E'지난 상영작 「%s」 관람 후기를 아직 남기지 않은 학생입니다.\n본인이 후기를 남긴 뒤에 추가할 수 있습니다.', v_review_title);
  end if;
  if p_seat is not null and public.is_vip_seat(v_ms, p_seat)
     and not exists (select 1 from public.club_members where lower(email) = lower(v_email)) then
    return E'선택하신 좌석은 ''영화대교'' 동아리 전용석입니다.\n이 좌석에는 동아리 부원만 추가할 수 있습니다.';
  end if;
  return null;
end;
$$;

revoke all on function public.pending_review_movie(uuid) from public, anon, authenticated;
revoke all on function public.my_pending_review() from public, anon;
revoke all on function public.require_previous_review() from public, anon, authenticated;
revoke all on function public.group_member_check(uuid, text) from public, anon;
grant execute on function public.my_pending_review() to authenticated;
grant execute on function public.group_member_check(uuid, text) to authenticated;
