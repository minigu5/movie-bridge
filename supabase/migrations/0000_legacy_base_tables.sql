-- supabase/migrations/0000_legacy_base_tables.sql
-- 마이그레이션 도입 전 대시보드에서 직접 만들었던 테이블들(reservations, movie_settings,
-- blacklist, activity_logs)의 0001 직전 형태. 새 환경에서 0001부터 순서대로 적용할 수 있게
-- 기록용으로 추가했다. 운영 DB에는 이미 테이블이 있어 `migration repair --status applied`로만 표시한다.
-- 원본 생성 SQL이 남아 있지 않아 이후 마이그레이션이 기대하는 컬럼/제약을 역산해 재구성했다.

create extension if not exists "uuid-ossp" with schema extensions;

create table if not exists public.movie_settings (
  id integer primary key,
  title text not null,
  date_string text not null,
  db_date text not null,
  venue text not null,
  poster_url text not null,
  deadline_date text,
  vip_start_row text default 'A',
  vip_end_row text default 'C',
  vip_start_col integer default 5,
  vip_end_col integer default 10,
  mid_vip_start_row text default 'A',
  mid_vip_end_row text default 'C',
  mid_vip_start_col integer default 5,
  mid_vip_end_col integer default 10,
  grand_vip_start_row text default 'A',
  grand_vip_end_row text default 'C',
  grand_vip_start_col integer default 10,
  grand_vip_end_col integer default 18,
  age_rating text default '전체관람가'
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  movie_date date not null,
  student_id text not null,
  student_name text not null,
  seat_number text not null,
  popcorn_order text not null,
  payment_status text default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  is_printed boolean default false,
  group_id text,
  is_group_leader boolean default false,
  group_expires_at timestamptz,
  group_report_sent boolean default false,
  password text,
  unique (movie_date, seat_number)
);

create table if not exists public.blacklist (
  id serial,
  student_id text primary key,
  student_name text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.activity_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  created_at timestamptz default now(),
  student_id text not null,
  student_name text not null,
  description text not null
);
