-- supabase/migrations/0015_current_seat_status_rpc.sql
-- /api/current-seats는 활성 회차의 db_date를 조회한 뒤 그 날짜로 reservations를 다시 조회해,
-- Worker -> Supabase 왕복이 직렬로 2번 발생했다. 조인을 DB 안에서 처리해 1번으로 줄인다.
--
-- 노출 범위는 기존과 같다: seat_number / payment_status / group_expires_at 3개 컬럼만 반환한다.
-- security invoker(기본값)라 RLS를 우회하지 않으며, 실행 권한도 service_role에만 준다
-- (anon/authenticated가 /rpc/current_seat_status로 직접 호출하는 것은 막는다).
create or replace function public.current_seat_status()
returns table (
  seat_number public.reservations.seat_number%type,
  payment_status public.reservations.payment_status%type,
  group_expires_at public.reservations.group_expires_at%type
)
language sql
stable
as $$
  select r.seat_number, r.payment_status, r.group_expires_at
  from public.reservations r
  -- movie_settings.db_date는 text, reservations.movie_date는 date다. 활성 회차 행만 캐스팅해
  -- 형식이 다른 과거 회차 행 때문에 캐스트가 실패하지 않게 하고, movie_date 인덱스도 그대로 쓴다.
  where r.movie_date = any (
    select m.db_date::date from public.movie_settings m where m.is_active
  )
$$;

revoke all on function public.current_seat_status() from public, anon, authenticated;
grant execute on function public.current_seat_status() to service_role;
