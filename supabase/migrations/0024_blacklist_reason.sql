-- 0024_blacklist_reason.sql
-- 예매 제한(blacklist)에 관리자가 적은 사유를 남긴다. 제한 안내 메일에 그대로 들어간다.
-- 비어 있어도 된다(사유 없이 보낸 경우와 이전 행).
-- 배포 순서: 이 마이그레이션을 먼저 적용한 뒤 reason을 쓰는 프론트/API를 배포한다
-- (반대 순서면 ADD_BLACKLIST_BULK upsert와 FETCH_INITIAL_DATA select가 없는 열 때문에 실패한다).
alter table public.blacklist add column if not exists reason text;
