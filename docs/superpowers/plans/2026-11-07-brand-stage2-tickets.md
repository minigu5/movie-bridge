# 브랜드 2단계 티켓 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 메일 티켓을 한 가지 고정 레이아웃(검정 바탕, 작은 포스터, 빨간 좌석, 상태 도장)으로 바꾸고, 발권기 입력 화면과 영수증에 새 브랜드를 입힌다.

**Architecture:** 메일 HTML 생성을 의존성 없는 순수 함수(`lib/ticketMailHtml.ts`)로 분리해 `node --test`로 검증한다. 로고·절취선 홈 PNG는 Workers에서 파일을 못 읽으므로 base64 모듈(`lib/brandMailAssets.ts`)로 생성해 CID 첨부한다. `sendTicketMail`은 데이터 준비와 첨부만 맡는다.

**Tech Stack:** TypeScript, Node 26(타입 제거로 .ts 직접 실행), sharp(에셋 생성), Next 16 클라이언트 컴포넌트(발권기).

**Spec:** `docs/superpowers/specs/2026-11-07-brand-stage2-tickets-design.md`

## Global Constraints
- 색: 바탕 #0F0F10, 카드 #18181A, 글씨 #F2F2F0, 보조 #A1A1A6/#8E8E93, 선 #2A2A2E, 점선 #3A3A40, 빨강 #E0443B.
- 메일: table + 인라인 스타일만. flex/position/background-image 금지. 사용자 값은 모두 HTML 이스케이프.
- 빨강은 좌석 번호(취소 제외)와 확정·변경 도장에만.
- 영수증: 검정 한 색.

## Review Focus
- 포스터를 못 받았을 때도 같은 크기의 칸이 남는지.
- 취소 메일에 빨강이 하나도 없는지(로고 PNG 제외).
- 팝콘이 없을 때 팝콘 줄이 빠지는지, 여러 종류일 때 줄바꿈되는지.
- 제목에 `<script>` 같은 값이 들어와도 이스케이프되는지.
- 결제 대기 메일의 계좌·QR이 지금과 같은지.

---

### Task 1: 흑백 로고와 메일 에셋
- [ ] `build_logo.py`에 `logo-horizontal-mono.svg`(빨강→#111111) 추가, 테스트에 반영(빨강 0회)
- [ ] `scripts/brand/gen-mail-assets.mjs`: `logo-horizontal-dark@2x.png`와 절취선 홈 PNG(왼쪽·오른쪽 반원, 표시 14x28, @2x)를 base64로 `lib/brandMailAssets.ts`에 쓴다
- [ ] `export function brandMailAttachment(name: 'logoH'|'notchL'|'notchR')` → `{ filename, content, cid, contentType }`

### Task 2: 순수 HTML 생성 함수
- [ ] 테스트 먼저(`lib/ticketMailHtml.test.mjs`): 상태별 도장 문구·색, 취소는 빨강 0회, 포스터 없음 → 빈 칸 유지, 팝콘 없음 → 줄 없음, 이스케이프, background-image 없음
- [ ] `buildTicketMailHtml(view: TicketMailView): string` 구현

### Task 3: `sendTicketMail` 연결
- [ ] 템플릿·포스터 3갈래 분기를 없애고 포스터만 `cid:poster`로 첨부(실패 시 생략). 기존 아이콘 첨부 제거, 로고·홈 첨부
- [ ] `npx tsc --noEmit`, `npx eslint lib/ticketMail.ts lib/ticketMailHtml.ts`

### Task 4: 발권기
- [ ] 입력 화면·영수증을 시안대로 수정(`app/print/page.tsx`), 흑백 로고는 `/brand/logo-horizontal-mono.svg`
- [ ] `npx tsc --noEmit`, 로컬에서 화면 확인

### Task 5: 확인
- [ ] 샘플 데이터로 메일 HTML 4종을 파일로 뽑아 브라우저 렌더로 시안과 비교
