-- supabase/migrations/0013_invited_emails.sql
-- 예매는 "초대 명단"에 있는 사람만 가능하다. 동아리원(club_members)과 관리자(admins)는
-- 명단에 복사하지 않고 항상 허용 대상에 포함시킨다(추가/삭제가 즉시 반영되도록).
-- 명단 추가는 메일 발송 코드 안이 아니라 별도 단계(ADD_INVITED_EMAILS)로 처리한다.

create table if not exists public.invited_emails (
  email text primary key,
  added_by text,
  source text not null default 'manual' check (source in ('manual', 'backfill')),
  created_at timestamptz not null default now()
);

alter table public.invited_emails enable row level security;
-- 정책을 일부러 만들지 않는다: 명단 조회/수정은 service-role(API)만, 일반 사용자는 can_book()으로만 확인.

-- 현재 로그인 계정(profiles)을 1회 백필. 마이그레이션은 한 번만 실행되므로 이후 자동 추가는 없다.
insert into public.invited_emails (email, added_by, source)
select lower(email), 'migration', 'backfill'
from public.profiles
on conflict (email) do nothing;

-- 호출자(JWT 이메일)가 예매 가능한지. RLS 정책과 클라이언트가 같은 기준을 쓰도록 함수 하나로 통일.
-- invited_emails/admins는 일반 사용자에게 select 정책이 없으므로 security definer로 조회한다.
create or replace function public.can_book()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.club_members where lower(email) = lower(auth.jwt()->>'email'))
      or exists (select 1 from public.admins where lower(email) = lower(auth.jwt()->>'email'))
      or exists (select 1 from public.invited_emails where email = lower(auth.jwt()->>'email'));
$$;

revoke all on function public.can_book() from public;
grant execute on function public.can_book() to authenticated;

-- 신규 예매(insert)는 초대된 사람만. 기존 예매의 변경/취소(update, API)는 영향 없음.
drop policy if exists reservations_insert_authenticated on public.reservations;

do $$ begin
  create policy reservations_insert_invited on public.reservations
    for insert to authenticated with check (public.can_book());
exception when duplicate_object then null; end $$;
