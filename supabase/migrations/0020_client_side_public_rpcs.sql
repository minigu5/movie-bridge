-- supabase/migrations/0020_client_side_public_rpcs.sql
-- Cloudflare Workers 무료 플랜 CPU 한도(요청당 10ms) 때문에, 보안상 서버를 거칠 이유가 없는 조회는
-- 브라우저가 Supabase를 직접 부르게 한다. 지금까지 Worker의 service-role API가 하던 일을
-- security definer 함수로 옮기고, 함수가 돌려주는 컬럼은 기존 API 응답과 똑같이 제한한다.
--   /api/current-seats  -> current_seat_status()
--   /api/past-seats     -> past_seat_status(integer)
--   /api/admin/check    -> is_admin()
--   /api/cron/group-check 호출 전 사전 확인 -> has_due_group_reports()

-- 활성 회차 좌석 현황. 반환 컬럼은 0015와 같다(seat_number / payment_status / group_expires_at).
-- anon이 reservations RLS에 막히지 않도록 security definer로 바꾼다.
create or replace function public.current_seat_status()
returns table (
  seat_number public.reservations.seat_number%type,
  payment_status public.reservations.payment_status%type,
  group_expires_at public.reservations.group_expires_at%type
)
language sql
stable
security definer
set search_path = public
as $$
  select r.seat_number, r.payment_status, r.group_expires_at
  from public.reservations r
  -- movie_settings.db_date는 text, reservations.movie_date는 date다. 활성 회차 행만 캐스팅해
  -- 형식이 다른 과거 회차 행 때문에 캐스트가 실패하지 않게 하고, movie_date 인덱스도 그대로 쓴다.
  where r.movie_date = any (
    select m.db_date::date from public.movie_settings m where m.is_active
  )
$$;

-- 보관 중인(is_active=false) 회차 좌석 현황. 기존 /api/past-seats처럼 활성 회차는 이 경로로 주지 않는다.
create or replace function public.past_seat_status(p_movie_settings_id integer)
returns table (
  seat_number public.reservations.seat_number%type,
  payment_status public.reservations.payment_status%type
)
language sql
stable
security definer
set search_path = public
as $$
  select r.seat_number, r.payment_status
  from public.reservations r
  join public.movie_settings m on m.id = r.movie_settings_id and not m.is_active
  where r.movie_settings_id = p_movie_settings_id
$$;

-- 로그인 사용자가 관리자인지(본인 것만). 화면에 관리자 버튼을 띄울지 정하는 용도이고,
-- 실제 관리자 작업은 계속 /api/admin/action의 requireAdmin이 막는다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_school_user()
     and exists (select 1 from public.admins where lower(email) = lower(auth.jwt()->>'email'));
$$;

-- 결과 메일을 보내야 하는(만료됐는데 리포트 미발송) 단체 예매가 있는지만 알려준다.
-- 방문자 브라우저가 이걸 먼저 보고, true일 때만 Worker의 /api/cron/group-check를 부른다.
create or replace function public.has_due_group_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reservations
    where is_group_leader and not group_report_sent and group_expires_at < now()
  );
$$;

revoke all on function public.current_seat_status() from public, anon, authenticated;
revoke all on function public.past_seat_status(integer) from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.has_due_group_reports() from public, anon, authenticated;
grant execute on function public.current_seat_status() to anon, authenticated, service_role;
grant execute on function public.past_seat_status(integer) to anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_due_group_reports() to anon, authenticated, service_role;
