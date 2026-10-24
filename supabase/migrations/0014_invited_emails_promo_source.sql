-- supabase/migrations/0014_invited_emails_promo_source.sql
-- 홍보(초대) 메일 발송에 성공한 수신자는 별도 단계로 초대 명단에 자동 추가한다.
-- 수동 추가(manual)와 구분하려고 source에 'promo_mail'을 허용한다.
alter table public.invited_emails drop constraint if exists invited_emails_source_check;
alter table public.invited_emails
  add constraint invited_emails_source_check check (source in ('manual', 'backfill', 'promo_mail'));
