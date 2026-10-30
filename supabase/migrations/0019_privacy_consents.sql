-- supabase/migrations/0019_privacy_consents.sql
-- 개인정보 수집·이용 동의 기록. 로그인 후 동의가 없거나 처리방침 버전이 바뀌었으면
-- 동의 모달(components/PrivacyConsentGate.tsx)이 뜬다. 버전/필수 항목은 lib/privacyConsent.ts.
-- 사용자당 한 행: 다시 동의하면 덮어쓰고, 철회하면 withdrawn_at만 남긴다.

create table if not exists public.privacy_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version text,
  items jsonb not null default '{}'::jsonb,
  agreed_at timestamptz,
  withdrawn_at timestamptz
);

alter table public.privacy_consents enable row level security;

-- 조회는 본인 행만. 쓰기는 아래 RPC로만 한다(동의 일시를 클라이언트가 정하지 못하게).
drop policy if exists privacy_consents_select_own on public.privacy_consents;
create policy privacy_consents_select_own on public.privacy_consents
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.record_privacy_consent(p_version text, p_items jsonb)
returns public.privacy_consents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.privacy_consents;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if coalesce(trim(p_version), '') = '' then
    raise exception '동의 버전이 없습니다.' using errcode = 'P0001';
  end if;
  -- lib/privacyConsent.ts REQUIRED_CONSENT_ITEMS와 같아야 한다.
  if (p_items->>'privacy') is distinct from 'true' or (p_items->>'overseas') is distinct from 'true' then
    raise exception '필수 항목에 모두 동의해야 합니다.' using errcode = 'P0001';
  end if;

  insert into public.privacy_consents (user_id, version, items, agreed_at, withdrawn_at)
  values (auth.uid(), trim(p_version), jsonb_build_object('privacy', true, 'overseas', true), now(), null)
  on conflict (user_id) do update
    set version = excluded.version, items = excluded.items, agreed_at = excluded.agreed_at, withdrawn_at = null
  returning * into v_row;
  return v_row;
end;
$$;

-- 철회: 동의 기록만 지운다. 예매·후기 등 이미 저장된 정보의 파기는 보호책임자에게 요청.
create or replace function public.withdraw_privacy_consent()
returns public.privacy_consents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.privacy_consents;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  insert into public.privacy_consents (user_id, version, items, agreed_at, withdrawn_at)
  values (auth.uid(), null, '{}'::jsonb, null, now())
  on conflict (user_id) do update
    set version = null, items = '{}'::jsonb, agreed_at = null, withdrawn_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.record_privacy_consent(text, jsonb) from public, anon;
revoke all on function public.withdraw_privacy_consent() from public, anon;
grant execute on function public.record_privacy_consent(text, jsonb) to authenticated;
grant execute on function public.withdraw_privacy_consent() to authenticated;

-- 브라우저에서 직접 하는 새 예매·후기 작성은 동의가 있어야 한다. 화면 모달을 건너뛰어도 DB에서 막는다.
-- 버전은 보지 않는다(개정 후 재동의는 화면에서 받는다). 관리자/API(service_role) 경로는 대상 아님.
create or replace function public.require_privacy_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if not exists (
    select 1 from public.privacy_consents
    where user_id = auth.uid() and agreed_at is not null and withdrawn_at is null
  ) then
    raise exception '개인정보 수집·이용에 동의해야 이용할 수 있습니다. 새로고침 후 동의해주세요.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.require_privacy_consent() from public, anon, authenticated;

drop trigger if exists reservations_require_consent on public.reservations;
create trigger reservations_require_consent
  before insert on public.reservations
  for each row execute function public.require_privacy_consent();

drop trigger if exists movie_reviews_require_consent on public.movie_reviews;
create trigger movie_reviews_require_consent
  before insert on public.movie_reviews
  for each row execute function public.require_privacy_consent();
