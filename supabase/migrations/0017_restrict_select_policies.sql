-- supabase/migrations/0017_restrict_select_policies.sql
-- 2026-10-27 DB 점검 후속 (2/2). 0016의 RPC를 쓰는 클라이언트가 배포된 뒤 적용한다.
-- 로그인 사용자 누구나 전체 예약자의 이메일/학번, 블랙리스트, 동아리 명단을 읽을 수 있었다.

-- =========================================================
-- 1. 학교 계정만 (restrictive: 아래 permissive 정책과 AND로 결합)
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array['reservations', 'profiles', 'blacklist', 'club_members',
                           'movie_settings', 'movie_reviews', 'activity_logs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_school_only', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.is_school_user())) with check ((select public.is_school_user()))',
      t || '_school_only', t);
  end loop;
end $$;

-- =========================================================
-- 2. reservations: 본인 행 + 내가 속한 단체의 행만
-- =========================================================
-- 좌석표는 active_seat_map(), 단체 멤버 확인은 group_member_check()로 조회한다.
drop policy if exists reservations_select_authenticated on public.reservations;
drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own on public.reservations
  for select to authenticated
  using (user_id = (select auth.uid()) or group_id in (select public.my_group_ids()));

drop policy if exists reservations_update_own on public.reservations;
create policy reservations_update_own on public.reservations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =========================================================
-- 3. blacklist / club_members: 본인 등록 여부만
-- =========================================================
-- 클라이언트는 `목록.includes(내 이메일)`로만 쓰므로 본인 행만 보여도 동작이 같다.
drop policy if exists blacklist_select_authenticated on public.blacklist;
drop policy if exists blacklist_select_own on public.blacklist;
create policy blacklist_select_own on public.blacklist
  for select to authenticated
  using (lower(email) = lower((select auth.jwt()->>'email')));

drop policy if exists club_members_select_authenticated on public.club_members;
drop policy if exists club_members_select_own on public.club_members;
create policy club_members_select_own on public.club_members
  for select to authenticated
  using (lower(email) = lower((select auth.jwt()->>'email')));

-- =========================================================
-- 4. profiles: 사용자가 직접 수정하는 경로가 없다(관리자 수정은 service_role API).
-- =========================================================
-- 남아 있으면 role/student_id/name을 마음대로 바꿀 수 있었다.
drop policy if exists profiles_update_own on public.profiles;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

-- =========================================================
-- 5. movie_reviews: auth.uid()를 initplan으로 (행마다 재평가 방지)
-- =========================================================
drop policy if exists movie_reviews_update_own on public.movie_reviews;
create policy movie_reviews_update_own on public.movie_reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists movie_reviews_delete_own on public.movie_reviews;
create policy movie_reviews_delete_own on public.movie_reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));
