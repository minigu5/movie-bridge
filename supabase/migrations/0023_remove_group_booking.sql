-- supabase/migrations/0023_remove_group_booking.sql
-- 단체 예매 기능을 없앤다. 프론트(단체 예매 버튼, /group-confirm, /api/group-invite, /api/cron/group-check)를
-- 먼저 배포한 뒤 적용할 것. 옛 프론트는 아래 함수를 부르므로 순서를 바꾸면 그 사이 오류가 난다.
--
-- 스키마는 그대로 둔다: reservations.group_id / is_group_leader / group_expires_at / group_report_sent 칸과
-- payment_status 'group_pending' 값(check 제약)은 지우지 않는다. 더 이상 쓰지 않을 뿐이다.
-- reservations_guard()는 단체 칸을 서버 값으로 고정하기만 하고 아래에서 지우는 함수를 부르지 않으므로 바꾸지 않는다.
-- 좌석 현황 RPC(current_seat_status, active_seat_map, past_seat_status)도 그대로 둔다(group_pending 행이 없으므로 영향 없음).

-- 1. reservations 본인 행 조회 정책에서 "내가 속한 단체의 행" 조건을 뺀다(0017 정의에서 my_group_ids() 부분만 삭제).
drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own on public.reservations
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 2. 단체 전용 함수 삭제
drop function if exists public.my_group_ids();                     -- 0016: 단체 확정 화면용 정책 헬퍼
drop function if exists public.group_member_check(uuid, text);     -- 0016/0021: 단체 멤버 추가 전 확인
drop function if exists public.has_due_group_reports();            -- 0020: /api/cron/group-check 호출 전 확인
