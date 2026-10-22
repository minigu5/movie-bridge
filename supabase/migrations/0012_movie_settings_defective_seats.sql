-- supabase/migrations/0012_movie_settings_defective_seats.sql
-- 하자(고장/파손 등)가 있는 의자 목록. 평소 좌석표에는 표시하지 않고, 예매자가 해당
-- 좌석을 누르는 순간에만 경고를 띄운다. 좌석 ID는 중강당 A01~, 대강당 A001~ 로 자릿수가
-- 달라 서로 겹치지 않으므로 한 컬럼에 같이 저장한다.
alter table public.movie_settings
  add column if not exists defective_seats text[] not null default '{}';
