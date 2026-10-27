-- supabase/migrations/0018_staff_without_student_id.sql
-- 교직원(profiles.student_id null)도 예매 대상이다. 본인 확인은 user_id(로그인)로 하므로
-- 학번은 표시/키오스크 조회용일 뿐 필수일 이유가 없다. NOT NULL 때문에 교직원 예매와
-- 교직원 관련 활동 로그가 전부 23502로 실패하고 있었다.

alter table public.reservations alter column student_id drop not null;
alter table public.activity_logs alter column student_id drop not null;

-- 로그도 학번이 없으면 null로 둔다(화면에서 '교직원'으로 표시).
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
  new.student_id := v_profile.student_id;
  new.student_name := v_profile.name;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.activity_logs_fill_actor() from public, anon, authenticated;
