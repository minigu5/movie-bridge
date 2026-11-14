-- 발권기 출석 확인 모드. 켜면 발권기가 인쇄창 없이 출석만 확인한다(프린터를 안 물렸을 때).
-- 관리자 화면에서 켜고 끄며, 발권기는 /api/kiosk로 읽는다.
alter table public.kiosk_settings
  add column if not exists attendance_only boolean not null default false;
