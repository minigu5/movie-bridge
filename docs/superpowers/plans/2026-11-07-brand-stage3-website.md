# 브랜드 3단계: 웹사이트(예매 홈 · 관리자) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예매 홈과 관리자 화면에 1단계 브랜드를 입히고, 폰 좌석을 "구역 배치도" 방식으로 바꾸며, 관리자를 "하는 일" 단위(예매·상영·메일·사람·기록) + 한 번 누르기 규칙으로 다시 짠다.

**Architecture:**
- 색은 `app/globals.css`의 Tailwind v4 `@theme` 토큰으로 한 곳에서 정의한다.
- 좌석 구역·남은 좌석 계산은 순수 함수(`lib/seatZones.ts`)로 빼서 `node --test`로 검증한다. 홈 좌석 UI는 `components/home/*`로 분리한다.
- 관리자는 `app/admin/page.tsx`가 데이터와 핸들러를 계속 들고, 화면은 `app/admin/_components/*`의 메뉴별 컴포넌트가 그린다. 되돌리기 가능한 동작은 공용 훅 하나로 처리한다.
- DB는 `movie_settings.vip_enabled` 컬럼 하나만 더한다.

**Tech Stack:** Next.js 16.2.2(App Router, 학습 데이터와 다름: `node_modules/next/dist/docs/` 먼저 읽기), React 19.2, Tailwind v4, Supabase(supabase-js, SQL 마이그레이션), lucide-react, Node 26 `node --test`(타입 제거로 `.ts` 직접 import), Cloudflare Workers(opennext) 배포.

**Spec:** `docs/superpowers/specs/2026-11-07-brand-stage3-website-design.md`. 시안 원본은 `docs/superpowers/specs/assets/2026-11-07-stage3-mockups/*.dc.html`이다. 크기·색·간격 값을 여기서 읽는다. 시안과 스펙이 다르면 스펙이 우선이다.

## Global Constraints

- 색 값(스펙 §3):
  - 바탕 `#0F0F10`, 카드 `#18181A`, 글씨 `#F2F2F0`
  - 보조 `#A1A1A6`·`#8E8E93`, 흐림 `#6E6E73`
  - 선 `#2A2A2E`·`#3A3A3F`·`#4A4A50`
  - 좌석 바탕 `#1A1A1C`, 선택 강조 `#1E1E21`, 빨강 `#E0443B`
- 빨강은 로고 점, 고른 좌석, "이번 상영" 점, 관리자 승인 대기 숫자, 위험 동작 글씨에만 쓴다.
- 주버튼은 흰 바탕 + 검은 글씨, 각진 모서리다. 보조버튼은 테두리만이다.
- 금지 사항:
  - 영문 브랜드 문구("SCREEN", "MOVIE BRIDGE" 등)
  - 아이보리·크림 바탕, 이모지
  - `orange-*` `amber-*` `emerald-*` `sky-*` `teal-*` `yellow-*` `pink-*` `purple-*` `rose-*` `green-*` 클래스(작업이 끝나면 `app/`·`components/`에 0개)
- 로고는 `public/brand/logo-horizontal-dark.svg`를 `<img>`로만 쓴다. 본문 글꼴은 Noto Sans KR(`--font-noto-sans-kr`)이다.
- 아이콘은 lucide-react다.
- 관리자에 "⋯" 메뉴와 `window.confirm`을 두지 않는다. 되돌리기 어려운 동작은 5초 되돌리기다.
- 좌석 번호 계산은 `lib/seatGrid.ts` `computeSeatId`만 쓴다. 구역은 화면에서 거르기만 한다.
- 이미 고친 홈 지뢰를 유지한다.
  - `fetchSeqRef`
  - anon `user_id` 가드
  - `PENDING_SEAT_KEY` 복원
  - 비로그인 좌석 클릭 시 즉시 로그인
  - 불편 좌석 경고
  - 후기 필수 창
  - 개인정보 동의 게이트
  - RPC 좌석 현황
- 커밋은 태스크마다 한다. 메시지 끝에 다음을 붙인다.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WQMn45yHsDPBijYWHDPvHx
  ```
- `git push`, `supabase db push`, `npm run deploy`는 이 계획에서 하지 않는다(사용자 확인 후 별도).

## Review Focus

1. **대강당 + 폰 + 뒤쪽 구역에 내 좌석이 있을 때**: 처음 열면 그 구역(뒤쪽, 해당 열)이 선택돼 있어야 한다. → Task 3 `initialZone` 테스트.
2. **동아리 전용을 끈 회차**: 홈에 굵은 테두리 좌석이 0개, 남은 좌석에 원래 VIP 칸이 포함되고, DB 가드도 막지 않는다. → Task 2 테스트 + Task 14 확인.
3. **취소 되돌리기 중 다른 줄도 취소**: 두 타이머가 서로 덮어쓰지 않고 각각 되돌릴 수 있어야 한다. → Task 8 `scheduleUndoable` 테스트.
4. **로그인 전 방문자·일반 학생·동아리원**: 같은 구역의 "n석"이 VIP 칸만큼 다르다. 예매된 좌석과 결제 대기는 모두에게 빠진다. → Task 3 `countBookable` 테스트.
5. **좁은 폭(360px)에서 관리자 표와 홈 좌석**: 글자가 한 자씩 세로로 쪼개지거나 가로 스크롤이 생기면 안 된다. → Task 14 브라우저 확인.

---

### Task 1: 브랜드 토큰 · Song Myung 제거 · 파비콘

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Delete: `app/fonts/SongMyung-logo.woff2`
- Replace: `public/icon.png` (← `public/brand/png/icon-hwa-48.png`)
- Create: `public/icon-16.png`, `public/icon-32.png`, `public/apple-touch-icon.png` (← `icon-hwa-16/32/180.png` 복사)

**Interfaces:**
- Produces: Tailwind 색 토큰이다. 이후 모든 태스크가 이 클래스 이름을 쓴다.
  - `bg-ground`(#0F0F10), `bg-card`(#18181A), `text-ink`(#F2F2F0), `text-sub`(#A1A1A6), `text-dim`(#8E8E93), `text-mute`(#6E6E73)
  - `border-line`(#2A2A2E), `border-line-strong`(#3A3A3F), `border-line-bold`(#4A4A50)
  - `bg-seat`(#1A1A1C), `bg-taken`(#2A2A2E), `bg-raised`(#1E1E21), `text-accent`/`bg-accent`(#E0443B)
  - 같은 이름으로 `bg-*`/`text-*`/`border-*`가 모두 생긴다.

- [ ] **Step 1:** `app/globals.css`의 `@theme inline`에 위 토큰을 `--color-ground: #0F0F10;` 형식으로 추가한다. `:root`의 `--background`/`--foreground`를 `#0F0F10`/`#F2F2F0`로 고정하고, `prefers-color-scheme` 분기는 지운다(사이트는 항상 어둡다).
- [ ] **Step 2:** `app/layout.tsx`에서 `songMyung` localFont, import, `className`의 변수를 지운다. 주석은 Noto 관련만 남긴다. `metadata.icons`를 다음으로 바꾼다.
  ```ts
  { icon: [{ url: "/icon-16.png", sizes: "16x16" }, { url: "/icon-32.png", sizes: "32x32" }, { url: "/icon.png", sizes: "48x48" }], apple: "/apple-touch-icon.png" }
  ```
  `public/`에 둔다는 주석은 유지한다.
- [ ] **Step 3:** 파일을 복사하고 지운다. `git rm app/fonts/SongMyung-logo.woff2`. `app/fonts/`가 비면 폴더도 지운다.
- [ ] **Step 4:** `grep -rn "song-myung\|SongMyung" app components lib`로 남은 참조를 확인한다. `app/page.tsx`와 `lib/ticketBackgroundCanvas.ts`만 남아야 하고, 이 둘은 Task 4·10에서 지운다. `npm run build`가 성공해야 한다.
- [ ] **Step 5:** 커밋 `feat(brand): 색 토큰 정의, Song Myung 글꼴 제거, 파비콘 "화"로 교체`

### Task 2: 동아리 전용 켜고 끄기(DB + seatGrid)

**Files:**
- Create: `supabase/migrations/0022_vip_enabled.sql`
- Modify: `lib/seatGrid.ts` (`VipConfig`, `computeVipSeats`)
- Create: `lib/seatGrid.test.mjs`

**Interfaces:**
- Produces: `movie_settings.vip_enabled boolean not null default true`. `VipConfig`에 `vip_enabled?: boolean`이 생긴다. `computeVipSeats`는 `vip_enabled === false`면 빈 Set을 돌려준다. `undefined`/`null`은 켜짐으로 본다(옛 행·과거 회차 호환).

- [ ] **Step 1: 실패하는 테스트** `lib/seatGrid.test.mjs`(import `./seatGrid.ts`)
  ```js
  test("vip_enabled false면 VIP 0석", () => { assert.equal(computeVipSeats(false, getGridRows(false), getGridCols(false), { vip_enabled: false }).size, 0); });
  test("vip_enabled 없으면 기본 A~C열 5~10번", () => { const s = computeVipSeats(false, getGridRows(false), getGridCols(false), {}); assert.equal(s.size, 18); assert.ok(s.has("A05")); });
  test("대강당 기본 VIP는 B구역 A~C열", () => { const s = computeVipSeats(true, getGridRows(true), getGridCols(true), {}); assert.equal(s.size, 27); assert.ok(s.has("B001")); });
  ```
  "A05"는 중강당 왼쪽 블록 A행 5번 칸(colIndex 4)이다. 기댓값이 다르면 `computeSeatId`로 실제 ID를 확인해 고친다. 기존 동작은 바꾸지 않는다.
- [ ] **Step 2:** `node --test lib/seatGrid.test.mjs`를 실행한다. 첫 테스트만 FAIL해야 한다.
- [ ] **Step 3:** `computeVipSeats` 맨 앞에서 `if (vipConfig.vip_enabled === false) return new Set()`로 처리한다.
- [ ] **Step 4:** 마이그레이션을 쓴다.
  - `alter table public.movie_settings add column if not exists vip_enabled boolean not null default true;`
  - `is_vip_seat`를 `create or replace`한다. 본문은 0016과 같고, `select coalesce(p_ms.vip_enabled, true) and exists (...)` 형태다.
  - 파일 머리 주석에 "lib/seatGrid.ts computeVipSeats와 같은 판정"을 적는다.
- [ ] **Step 5:** 테스트가 전부 PASS해야 한다. 마이그레이션은 적용하지 않는다(배포 때 db push).
- [ ] **Step 6:** 커밋 `feat(seats): 회차별로 동아리 전용 좌석을 끌 수 있게(vip_enabled)`

### Task 3: 좌석 구역·남은 좌석 순수 함수

**Files:**
- Create: `lib/seatZones.ts`
- Create: `lib/seatZones.test.mjs`

**Interfaces:**
- Consumes: `getGridRows`, `getGridCols`, `computeSeatId`(`lib/seatGrid.ts`). import 경로는 `./seatGrid`다. 테스트가 `.ts`를 바로 불러오려면 `seatZones.ts`의 import도 확장자가 필요할 수 있다. Node가 확장자 없는 import를 못 찾으면, 순수 계산에 필요한 부분을 인자로 받는 방식으로 의존을 끊는다.
- Produces:
  ```ts
  export type ZoneKey = 'L' | 'R' | 'FL' | 'FC' | 'FR' | 'BL' | 'BC' | 'BR';
  export type Zone = { key: ZoneKey; rowStart: number; rowEnd: number; colStart: number; colEnd: number; gridRow: 0 | 1; gridCol: 0 | 1 | 2 };
  export function getZones(isGrandHall: boolean): Zone[];          // 중강당 L(col0-6)/R(col7-13) 전체 행. 대강당 F*=row0-7(A~H), B*=row8-17(I~R), *L/C/R=col 0-8/9-17/18-26
  export function zoneOf(isGrandHall: boolean, seatId: string): ZoneKey | null;
  export function seatsInZone(isGrandHall: boolean, zone: Zone): { rowIndex: number; colIndex: number; seatId: string | null }[][]; // 화면용 행 배열, null은 빈 칸(B63)
  export function countBookable(isGrandHall: boolean, zone: Zone | null, taken: Set<string>, vipSeats: Set<string>, viewerIsClubMember: boolean): number; // zone null = 전체
  export function initialZone(isGrandHall: boolean, mySeat: string | null, pendingSeat: string | null): ZoneKey; // mySeat > pendingSeat > 첫 구역('L' / 'FL')
  ```

- [ ] **Step 1: 실패하는 테스트**
  ```js
  test("중강당은 2구역, 대강당은 6구역", () => { assert.deepEqual(getZones(false).map(z => z.key), ["L","R"]); assert.deepEqual(getZones(true).map(z => z.key), ["FL","FC","FR","BL","BC","BR"]); });
  test("zoneOf", () => { assert.equal(zoneOf(false, "B31"), "R"); assert.equal(zoneOf(true, "B050"), "FC"); assert.equal(zoneOf(true, "C150"), "BR"); assert.equal(zoneOf(false, "Z99"), null); });
  test("중강당 R구역 마지막 행 마지막 칸은 빈 칸(B63 없음)", () => { const rows = seatsInZone(false, getZones(false)[1]); assert.equal(rows.length, 9); assert.equal(rows[8][6].seatId, null); });
  test("countBookable: 예매·대기 빼고, 불편 좌석은 셈, VIP는 동아리원만", () => {
    const z = getZones(false)[0]; const vip = new Set(["A05","A06"]); const taken = new Set(["A01"]);
    assert.equal(countBookable(false, z, taken, vip, false), 63 - 1 - 2);
    assert.equal(countBookable(false, z, taken, vip, true), 63 - 1);
  });
  test("전체 남은 좌석(중강당 125석)", () => { assert.equal(countBookable(false, null, new Set(), new Set(), true), 125); });
  test("initialZone 우선순위", () => { assert.equal(initialZone(true, "C150", "A001"), "BR"); assert.equal(initialZone(true, null, "A001"), "FL"); assert.equal(initialZone(false, null, null), "L"); });
  ```
  `C150`의 위치가 맞는지 `computeSeatId(true, r, c)`로 역산해 확인한다. 150 = 16*9+6 → row16, C블록 → BR.
- [ ] **Step 2:** `node --test lib/seatZones.test.mjs`가 FAIL해야 한다(모듈 없음).
- [ ] **Step 3:** 구현한다. `zoneOf`는 구역들의 칸을 돌며 `computeSeatId`가 같은 칸을 찾는다(좌석 수 486 이하라 단순 탐색으로 충분).
- [ ] **Step 4:** PASS해야 한다.
- [ ] **Step 5:** 커밋 `feat(seats): 폰 좌석 구역과 남은 좌석 계산 함수`

### Task 4: 홈 상단 · 영화 정보 · 로딩 화면

**Files:**
- Modify: `app/page.tsx` (로딩 두 화면 ~764-795, 상단 바·로고·영화 카드 ~797-930, 후기 필수 배너)
- Create: `components/home/MovieInfo.tsx`

**Interfaces:**
- Produces: `MovieInfo` props다.
  ```ts
  { movie: { title: string; date_string: string; venue: string; age_rating: string; poster_url?: string; poster_cdn_url?: string; deadline_date?: string | null }; isPast: boolean; canGoOlder: boolean; canGoNewer: boolean; onOlder(): void; onNewer(): void; remainingSeats: number | null }
  ```
  `remainingSeats`가 null이면 숫자를 숨긴다(지난 회차).

- [ ] **Step 1:** 로딩·로그인 확인 화면을 바꾼다. `bg-ground` 가운데에 로고 `<img src="/brand/logo-horizontal-dark.svg" alt="영화대교">`(폭 160)와 `text-dim` "로그인 확인 중..."/"불러오는 중..."을 둔다. 주황 번짐과 Song Myung을 지운다.
- [ ] **Step 2:** 상단 바를 바꾼다.
  - 전체 폭 `border-b border-line`. 왼쪽 로고(폰 96px, PC 148px).
  - 오른쪽: "이용 안내"(글자 링크), 관리자면 "관리자"·"발권기" 글자 링크, 프로필 동그라미(32px). 프로필 메뉴는 `bg-card border-line`.
  - 지금의 큰 "영화/대교" 로고 블록은 지운다.
- [ ] **Step 3:** `MovieInfo`를 만들고 영화 카드를 대체한다. 값은 시안 `W3Desktop`(PC), `W3PhoneBlock`(폰) 기준이다.
  - "● 이번 상영"은 빨간 7px 점과 넓은 자간이다. 지난 회차면 "지난 상영작"이고 점이 없다.
  - 오른쪽에 "‹ 지난 상영작" / "다음 상영 ›" 글자 버튼을 둔다. 지금의 `goToOlderMovie`/`goToNewerMovie`와 숨김 조건, 슬라이드 애니메이션 클래스는 그대로다.
  - PC는 포스터 260×372, 제목 56px/900, 2열 정보표(일시 / 장소 / 관람 등급 / 예매 마감), "좌석 선택하기" 흰 버튼(`#seats`로 스크롤), "남은 좌석 n석"이다.
  - 폰은 포스터 84×120 옆에 제목 24px과 3줄 표(일시 / 장소 · 등급 / 마감)다.
  - 마감 표시는 표의 한 줄이다. 지난 회차면 마감 줄 대신 "좌석 배치만 볼 수 있어요"를 쓴다.
- [ ] **Step 4:** 후기 필수 배너를 `border-line bg-card`, 흰 "후기 쓰기" 버튼으로 바꾼다.
- [ ] **Step 5:** `npm run build` 성공, `npx eslint app/page.tsx components/home/MovieInfo.tsx` 경고가 늘지 않아야 한다.
- [ ] **Step 6:** 커밋 `feat(home): 새 로고 상단 바, 극장 프로그램식 영화 정보`

### Task 5: 홈 좌석표 (PC 전체 · 폰 구역 · 지난 회차)

**Files:**
- Create: `components/home/SeatGrid.tsx`, `components/home/ZoneMap.tsx`, `components/home/SeatLegend.tsx`
- Modify: `app/page.tsx` (지난 회차 좌석 ~935-1015, 현재 좌석 ~1018-1115, 범례)

**Interfaces:**
- Consumes: Task 3 `getZones`, `seatsInZone`, `countBookable`, `initialZone`, `zoneOf`, `ZoneKey`. Task 2 `computeVipSeats`.
- Produces:
  ```ts
  type SeatVisual = 'empty' | 'selected' | 'taken' | 'pending' | 'groupPending' | 'groupLeader' | 'groupMember';
  // SeatGrid
  { isGrandHall: boolean; zone: Zone | null /* null = 전체(PC) */; seatState(seatId: string): { visual: SeatVisual; label: string; vip: boolean; defective: boolean }; onSeatClick?(seatId: string): void /* 없으면 읽기 전용 */; disabled?: boolean; size: 'pc' | 'phone' }
  // ZoneMap
  { isGrandHall: boolean; active: ZoneKey; counts: Record<ZoneKey, number> | null /* null = 숫자 숨김 */; onSelect(k: ZoneKey): void }
  ```

- [ ] **Step 1:** `SeatGrid`를 만든다.
  - 줄 글자는 없다.
  - 스크린: 70% 폭 3px 흰 막대 + "스크린"(자간 0.6em, `text-dim`). 대강당 구역 화면에서는 100% 폭이다. 중강당 오른쪽 구역이면 왼쪽이 밝은 그라데이션 + "← 스크린 가운데", 왼쪽 구역이면 반대다.
  - 칸 크기:
    - PC 48×56(대강당 PC는 36×44)
    - 폰 중강당 46×46, 폰 대강당 37×44
    - 폭이 모자라면 `min(…, calc((100vw - 32px - gaps)/cols))`로 줄이되 36px 아래로 내리지 않는다.
  - 모서리는 `rounded-t-[10px] rounded-b-[5px]`이다.
  - PC 통로 간격: 중강당 7번째 칸 뒤 44px, 대강당 9·18번째 칸 뒤 24px. 대강당 H행 뒤 행 간격 18px.
  - 시각(스펙 §4.2 표):
    - empty: `bg-seat border border-line-bold text-sub`
    - selected: `bg-accent text-white`
    - taken: `bg-taken text-mute`(이름 11px)
    - vip: 2px `border-ink`
    - defective: 1px dashed `border-dim`
  - 단체·대기 시각:
    - groupLeader: `bg-accent`
    - groupMember: 2px `border-accent` + 빨간 글씨
    - pending: `bg-taken` + 대각선 빗금(`repeating-linear-gradient(135deg, #2A2A2E 0 4px, #333338 4px 8px)`)
    - groupPending: `bg-taken` + 1px dashed `border-line-bold`
  - 색만으로 구분하지 않는다.
  - 칸 안 글자는 `seatState().label`이다(좌석 번호 또는 예매자 이름).
- [ ] **Step 2:** `ZoneMap`을 만든다(시안 `W3PhoneBlock`/`W3PhoneGrand`).
  - 위에 72% 폭 3px `#8E8E93` 막대.
  - 중강당은 2열 64px 높이 버튼. 대강당은 3열×2행(앞 52px, 뒤 60px, 행 사이 6px 추가)이다.
  - 버튼 글자는 `"{n}석"`만이다. 활성이면 `bg-ink text-ground font-black`, 아니면 `border-line-strong text-sub`이다.
  - `aria-label="{왼쪽|오른쪽|앞쪽 왼쪽…} 구역 · {n}석 남음"`, `aria-pressed`를 단다. `counts`가 null이면 글자는 구역 이름이다(지난 회차).
- [ ] **Step 3:** `SeatLegend`를 만든다. 동아리 전용(2px 흰 테두리)과 불편 좌석(점선) 2개다. 동아리 전용을 끈 회차면 동아리 전용 항목을 숨긴다. 단체 모드나 대기 좌석이 있을 때만 해당 항목(결제 대기, 단체 확인 중, 리더, 멤버)을 덧붙인다.
- [ ] **Step 4:** `app/page.tsx`에 연결한다.
  - `const [zone, setZone] = useState<ZoneKey | null>(null)`.
  - 폰 판정은 `matchMedia('(max-width: 767px)')`로 하고, md 기준이다.
  - 데이터가 로드되면 `initialZone(isGrandHall, myReservation?.seat ?? null, selectedSeat)`로 초기화한다. 회차·상영관이 바뀌면 다시 계산한다.
  - 로그인 복원(`PENDING_SEAT_KEY`)으로 좌석이 선택되면 그 구역으로 맞춘다.
  - 폰은 `ZoneMap` + `SeatGrid zone={…}`, PC는 `SeatGrid zone={null}`이다.
  - 지난 회차도 같은 구성이다. `onSeatClick` 없음, `counts={null}`.
  - `"SCREEN"` 글자, "옆으로 밀어서 확인" 안내, 마감 도장(→ 좌석표 위 `bg-ground/80` 덮개 + 가운데 "예매가 마감되었어요" `text-sub`)을 정리한다.
  - `viewerIsClubMember = !!profile && clubMemberIds.includes(profile.email)`. 남은 좌석 `taken`은 `seatStatuses` 키 전체다.
  - `MovieInfo.remainingSeats`에 `countBookable(..., null, ...)`을 넘긴다.
- [ ] **Step 5:** `npm run build` 성공. `npm run dev`로 375px·1280px에서 홈을 띄운다. 좌석 클릭, 구역 전환, 지난 회차 이동이 되고 가로 스크롤이 없어야 한다.
- [ ] **Step 6:** 커밋 `feat(home): 줄 글자 없는 새 좌석표, 폰은 극장 배치도로 구역 고르기`

### Task 6: 홈 예매 영역 (PC 띠 · 폰 고정 바 · 내 예매 · 단체 모드)

**Files:**
- Create: `components/home/BookingBar.tsx`
- Modify: `app/page.tsx` (예매 패널 ~1124-1220)

**Interfaces:**
- Produces: `BookingBar` props다. `{ seatLabel: string | null; hint?: string; primary: { label: string; onClick(): void; disabled?: boolean } | null; secondary?: { label: string; onClick(): void; danger?: boolean }[] }`. PC는 좌석표 아래 `border-t border-line` 띠, 폰은 `fixed bottom-0` 바(`bg-card border-t border-line`, `pb-[env(safe-area-inset-bottom)]`)다. 폰에서는 본문 아래 여백을 바 높이만큼 준다.

- [ ] **Step 1:** 상태별 내용을 정한다(기존 분기 그대로, 버튼만 매핑).

| 상태 | 왼쪽 글 | 주버튼 | 보조 |
|---|---|---|---|
| 아무것도 안 고름 | "좌석을 골라 주세요" | 없음 | |
| 좌석 고름 | "선택한 좌석 B31" | "예매하기"(비로그인이면 로그인) | |
| 내 예매(확정/대기) | "내 좌석 B31 · 예매 확정/입금 대기" | "자리 이동" | "예매 취소"(빨강) 또는 비활성 "취소 불가" |
| 자리 이동 중 | "이동할 좌석 B12" 또는 "이동할 좌석을 골라 주세요" | "이 자리로 이동" | "이동 취소" |
| 단체 모드 | 리더·멤버 요약 | "완료하기" | "단체 예매 취소" |
| 마감 | "예매가 마감되었어요" | 없음 | |

- [ ] **Step 2:** 결제 대기 안내(QR `/qr.jpeg`, `AccountInfo`, 금액·입금자명, 팝콘 추가)와 확정 후 팝콘 추가는 바 위 본문 카드(`bg-card border-line`)로 옮긴다. 문구는 그대로이고, 흰 주버튼과 테두리 보조버튼을 쓴다. 단체 모드의 리더·멤버 칩 목록도 같은 카드 스타일이다.
- [ ] **Step 3:** `npm run build` 성공. dev에서 375px로 좌석 고르기 → 바 내용 변경, 내 예매 상태 바를 확인한다(테스트 계정이 없으면 상태 분기를 코드 리뷰로 확인).
- [ ] **Step 4:** 커밋 `feat(home): 폰 하단 고정 예매 바와 PC 예매 띠`

### Task 7: 홈 창(모달)·공용 컴포넌트·별도 페이지 옷 바꾸기

**Files:**
- Modify: `app/page.tsx` (팝콘, 단체 멤버·요약·완료, 알림·확인·성공, 이용 안내 모달 ~1222-1610)
- Modify: `components/MovieReviews.tsx`, `components/RequiredReviewModal.tsx`, `components/PrivacyConsentGate.tsx`, `components/AccountInfo.tsx`
- Modify: `app/group-confirm/page.tsx`, `app/cancel/page.tsx`, `app/privacy/page.tsx`

**Interfaces:** 동작·문구·props는 바꾸지 않는다. 클래스만 Task 1 토큰으로 바꾼다.

- [ ] **Step 1:** 모달 공통 모양을 맞춘다. 덮개 `bg-ground/90`, 상자 `bg-card border border-line`(모서리 0~8px), 제목 `text-ink font-black`, 주버튼 흰색, 보조 테두리, 위험 동작 `text-accent`. 그림자 빛 번짐(`shadow-[0_0_…rgba(색)]`)은 지운다. `warnIfDefective` 문구의 "⚠️" 이모지는 lucide `TriangleAlert`로 바꾸거나 지운다.
- [ ] **Step 2:** 3개 페이지와 4개 컴포넌트를 같은 규칙으로 바꾼다. 로고가 있는 페이지는 가로형 로고를 쓴다.
- [ ] **Step 3:** `grep -rnE "(orange|amber|emerald|sky|teal|yellow|pink|purple|rose|green)-[0-9]" app/page.tsx app/group-confirm app/cancel app/privacy components`이 0줄이어야 한다. `npm run build` 성공.
- [ ] **Step 4:** 커밋 `feat(home): 창과 별도 페이지를 새 브랜드로`

### Task 8: 관리자 뼈대 · 되돌리기 · 알림

**Files:**
- Create: `lib/undoable.ts`, `lib/undoable.test.mjs`
- Create: `app/admin/_components/AdminShell.tsx` (← `AdminTabs.tsx` 대체·삭제), `app/admin/_components/Toasts.tsx`
- Modify: `app/admin/page.tsx` (탭 상태 → URL, 로그인·권한 없음 화면, 새로고침 버튼 제거, `alert` → 토스트)

**Interfaces:**
- Produces:
  ```ts
  // lib/undoable.ts (React 없음)
  export function scheduleUndoable(run: () => void | Promise<void>, delayMs?: number /* 5000 */): { cancel(): boolean /* 이미 실행됐으면 false */; flushNow(): void };
  // Toasts.tsx
  export type Toast = { id: string; text: string; tone: 'info' | 'error'; undo?: { secondsLeft: number; onUndo(): void } };
  export function useToasts(): { toasts: Toast[]; notify(text: string, tone?: 'info' | 'error'): void; undoable(text: string, run: () => Promise<void>, delayMs?: number): void };
  export function ToastStack({ toasts }: { toasts: Toast[] }): JSX.Element;
  // AdminShell.tsx
  export type AdminSection = 'reservations' | 'movie' | 'mail' | 'people' | 'log';
  { active: AdminSection; onChange(s: AdminSection): void; pendingCount: number; children: ReactNode }
  ```
  `undoable`의 알림에는 남은 초가 1초마다 줄어드는 "되돌리기 · n" 버튼이 있다. info 알림은 4초 뒤 사라지고, error는 닫기 전까지 남는다.

- [ ] **Step 1: 실패하는 테스트** (`node:test`의 `mock.timers` 사용)
  ```js
  test("5초 뒤 실행", () => { mock.timers.enable({ apis: ["setTimeout"] }); let n = 0; scheduleUndoable(() => { n++; }); mock.timers.tick(4999); assert.equal(n, 0); mock.timers.tick(1); assert.equal(n, 1); });
  test("cancel하면 실행 안 됨", () => { …; const h = scheduleUndoable(() => { n++; }); assert.equal(h.cancel(), true); mock.timers.tick(6000); assert.equal(n, 0); });
  test("두 개는 서로 독립", () => { …; const a = scheduleUndoable(() => { log.push("a"); }); scheduleUndoable(() => { log.push("b"); }); a.cancel(); mock.timers.tick(5000); assert.deepEqual(log, ["b"]); });
  test("실행 뒤 cancel은 false", () => { …; mock.timers.tick(5000); assert.equal(h.cancel(), false); });
  ```
- [ ] **Step 2:** FAIL 확인 → 구현 → `node --test lib/undoable.test.mjs` PASS.
- [ ] **Step 3:** `AdminShell`을 만든다(시안 `W3AdminMovie` 등의 왼쪽 메뉴, `W3AdminPhone` 하단 메뉴).
  - md 이상: 220px 왼쪽 메뉴. 로고 120px + "관리"(자간 0.2em) → 예매 / 상영 / 메일 / 사람 / 기록(44px 높이, 활성 `bg-raised text-ink font-bold`). 예매 옆 `text-accent` "대기 n". 아래에 "예매 화면 열기 ↗"(`/`), "발권기 열기 ↗"(`/print`).
  - md 미만: 상단 로고 바 + 화면 아래 5칸 고정 메뉴(활성 칸 위 18px 흰 막대).
  - 본문은 `children`이다.
- [ ] **Step 4:** `page.tsx`를 바꾼다.
  - 탭 상태를 `useSearchParams`의 `tab`(기본 `reservations`)과 `router.replace`로 동기화한다. Next 16 문서에서 `useSearchParams`의 Suspense 요구사항을 확인한다.
  - 옛 키 매핑: `settings`→`movie`, `members`→`people`, `history`→`log`.
  - "새로고침" 버튼을 지운다.
  - `alert(...)`는 `notify(...)`로 바꾼다. 실패는 `'error'`다.
  - 관리자 로그인·권한 없음 화면: `bg-ground` 가운데 로고, 흰 "구글로 로그인" 버튼, 권한 없음은 `text-sub` 문장 + "로그아웃" 테두리 버튼.
  - `AdminTabs.tsx`를 지운다.
  - 이 태스크에서는 기존 탭 컴포넌트를 그대로 `AdminShell` 안에 넣는다(내용 교체는 Task 9~13).
- [ ] **Step 5:** `npm run build` 성공, dev에서 메뉴 전환·새로고침 유지를 확인한다.
- [ ] **Step 6:** 커밋 `feat(admin): 왼쪽 메뉴 뼈대, URL 탭 유지, 되돌리기 알림`

### Task 9: 관리자 · 예매

**Files:**
- Modify: `app/admin/_components/ReservationsTab.tsx`
- Modify: `app/admin/page.tsx` (`handleCancel`, `handleApprove`, `handleResetPrint`의 confirm 제거·되돌리기 연결)

**Interfaces:**
- Consumes: Task 8 `useToasts().undoable`, `notify`.
- Produces: `ReservationsTab` props에 `onCancel(ticket)`이 남는다. 되돌리기는 page에서 감싼다. 취소 대기 중인 예약 id 집합 `pendingCancelIds: Set<string>`과 `onUndoCancel(id)`를 넘겨, 그 줄을 "A07 오태윤 예매를 취소했어요. 취소 메일은 5초 뒤 나가요 · 되돌리기 · n" 줄로 그린다.

- [ ] **Step 1:** 시안 `W3AdminBookings`대로 그린다.
  - 제목 + "「제목」 · 예매 마감까지 n일 n시간"(마감이 없으면 생략).
  - 숫자 4칸(`border-t border-ink`, 칸 사이 `border-l border-line`, 승인 대기 숫자만 `text-accent`, 누르면 기존 `toggleFilter`). 이름은 승인 대기 / 확정 / 단체 확인 중 / 아직 발권 안 함.
  - 검색 240px.
  - 표 열은 `56px 120px minmax(160px,1fr) 100px 64px 220px`이다. 동작은 승인 대기면 흰 "승인", 발권했으면 테두리 "발권 되돌리기", 전부 `border-l border-line` 뒤 빨간 "취소"다.
  - 기본 정렬: 상태(승인 대기 먼저) → 좌석. 열 머리 정렬은 유지한다.
  - 표 아래 2열: 팝콘 집계(오리지널 / 콘소메 / 카라멜 / 받을 돈) | 아직 예매 안 한 동아리원.
  - md 미만은 한 줄 목록(`W3AdminPhone`)이다.
- [ ] **Step 2:** page 핸들러를 바꾼다.
  - `handleCancel`: `confirm` 제거 → `undoable("{좌석} {이름} 예매를 취소했어요", () => 기존 CANCEL_RESERVATION 호출)`.
  - `handleApprove`, `handleResetPrint`: `confirm` 제거, 바로 실행 + `notify`.
- [ ] **Step 3:** `npm run build` 성공. dev에서 1280px·375px 표를 확인한다(글자 세로 쪼개짐 없음).
- [ ] **Step 4:** 커밋 `feat(admin): 예매 화면, 취소는 5초 되돌리기`

### Task 10: 관리자 · 상영 (+ 새 회차, 배경 템플릿 정리)

**Files:**
- Modify: `app/admin/_components/SettingsTab.tsx` → 이름을 `MovieTab.tsx`로 바꾼다(홍보 메일 부분은 Task 11로 옮긴다)
- Create: `app/admin/_components/SeatZoneEditor.tsx` (← `VipZonePicker.tsx` + `DefectiveSeatPicker.tsx` 합침, 둘 다 삭제)
- Create: `app/admin/_components/PosterPicker.tsx`
- Modify: `app/admin/page.tsx` (`handleGenerateTicketBackground` 삭제, 포스터 업로드 함수 분리, 저장 페이로드에 `vip_enabled`, 새 회차, 키오스크 비번 props 이동)
- Modify: `app/api/admin/action/route.ts` (`UPLOAD_TICKET_BACKGROUND` 삭제, `background_template_url = null` 줄 삭제)
- Delete: `lib/ticketBackgroundCanvas.ts`. 단 `fetchPosterDataUri`·`blobToDataUri`·`MIN_POSTER_WIDTH`가 필요하면 `lib/posterUpload.ts`로 옮긴다.

**Interfaces:**
- Consumes: Task 2 `vip_enabled`, Task 8 `notify`.
- Produces:
  ```ts
  // SeatZoneEditor
  { isGrandHall: boolean; vipEnabled: boolean; onVipEnabledChange(v: boolean): void; zone: { startRow: string; endRow: string; startCol: number; endCol: number }; onZoneChange(z): void; defective: string[]; onDefectiveChange(ids: string[]): void }
  // PosterPicker
  { posterUrl: string; posterCdnUrl?: string; onUrlChange(url: string): void; onFile(file: File): Promise<void>; status: string | null }
  ```

- [ ] **Step 1:** `SeatZoneEditor`를 만든다(시안 `W3AdminMovie` 좌석 칸).
  - 맨 위 스위치 "동아리 전용 좌석 두기 / 끄면 이번 회차는 0석".
  - 도구 2개("동아리 전용 좌석" 흰 채움 활성 / "불편 좌석"). 동아리 전용은 끌어서 네모, 불편은 칸 토글이다.
  - 격자 칸 28px(대강당은 18px), 줄 글자 없음. 상영관은 prop만 따른다(자체 토글 없음).
  - 스위치가 꺼지면 동아리 전용 도구와 굵은 테두리를 숨긴다.
  - 기존 `VipZonePicker`의 드래그→`Zone` 변환 로직을 재사용한다.
- [ ] **Step 2:** `PosterPicker`를 만든다.
  - 포스터 168×240 + "포스터 바꾸기" 버튼. 누르면 주소 입력칸과 "파일 고르기"가 펼쳐진다. 지금 페이지 안에서 펼침이고 모달이 아니다.
  - 파일이면 `UPLOAD_POSTER_CDN`으로 `poster_cdn_url`을 채운다. 저해상도(`MIN_POSTER_WIDTH` 미만)면 경고 문구를 띄운다.
  - 주소면 `poster_url`만 바꾼다(저장 시 서버 재호스팅).
  - 템플릿·CDN 문구는 없다.
- [ ] **Step 3:** `MovieTab`을 만든다.
  - "상영" 제목 + 설명 + 오른쪽 "새 회차 시작" 테두리 버튼.
  - `PosterPicker` | "● 이번 상영" + 정보표 = 입력칸(행 52px, 라벨 96px). 기존 `MovieFormFields`의 입력 종류와 `screeningSchedule` 그대로이고, 장소 select 문구는 "중강당"/"대강당"이다.
  - "좌석 · {중강당|대강당}" + `SeatZoneEditor`(상영관 = `editForm.venue`).
  - 맨 아래 "발권기 비밀번호 · 바꾸기"(누르면 입력칸 펼침, 기존 `UPDATE_KIOSK_PASSWORD`).
  - 바뀐 게 있으면 아래 고정 저장 바: "n곳 바뀜" + "되돌리기"(`editForm`을 `movieInfo`로 리셋) + 흰 "저장".
  - `validateMovieForm`의 error는 바 안 빨간 문구다. warn은 바 안 문구 + 버튼이 "그래도 저장"으로 바뀐다.
  - 저장 후 `notify("저장했어요")`.
- [ ] **Step 4:** 새 회차 화면을 만든다. `MovieTab` 안의 별도 모드이고, 위에 "← 지금 상영으로" 링크가 있다.
  - 같은 입력칸 + `SeatZoneEditor` + 위 안내 "지금 회차「{제목}」는 기록으로 옮겨지고, 이 영화로 새 예매가 열려요."
  - 아래 흰 "새 회차 시작" 한 번으로 끝난다(`confirm` 두 번 제거). 끝나면 지금 상영 모드로 돌아가 `notify`.
- [ ] **Step 5:** page에서 다음을 처리한다.
  - `handleGenerateTicketBackground`, `bgGenerating` 류 상태, 저장 후 자동 배경 생성 호출을 지운다.
  - `UPDATE_SETTINGS`/`START_NEW_MOVIE` 페이로드에 `vip_enabled`를 더한다(새 회차 기본 true).
  - route에서 `UPLOAD_TICKET_BACKGROUND` case와 배경 null 처리를 지운다. 컬럼은 둔다.
  - `grep -rn "ticketBackgroundCanvas\|background_template" app lib components`가 0줄이어야 한다. `lib/cloudinary.ts` 주석도 정리한다.
- [ ] **Step 6:** `npm run build` 성공. dev에서 저장 바, 동아리 전용 끄기 → 저장 → 홈에서 굵은 테두리 0개를 확인한다(로컬 DB에 컬럼이 없으면 이 확인은 Task 14로 미룬다).
- [ ] **Step 7:** 커밋 `feat(admin): 상영 화면 재구성, 좌석 지정 하나로, 배경 템플릿 생성 제거`

### Task 11: 관리자 · 메일

**Files:**
- Create: `app/admin/_components/MailTab.tsx` (← `SettingsTab`의 `PromoMailSection`을 옮겨 재구성)
- Modify: `app/admin/page.tsx` (홍보 메일 상태·핸들러: 인원 자동 계산, 확인 모달 제거, 5초 카운트다운)

**Interfaces:**
- Consumes: Task 8 `scheduleUndoable` 또는 `undoable`.
- Produces: `MailTab` props는 기존 `PromoProps`에서 `showConfirm`/`onCancelConfirm`/`onResolveClick`을 빼고 다음을 더한다. `{ recipientCount: number | null; isResolving: boolean; onSend(): void; sendCountdown: number | null; onStopCountdown(): void; showRecipients: boolean; onToggleRecipients(): void }`.

- [ ] **Step 1:** 시안 `W3AdminMail`대로 그린다.
  - "1 · 누구에게 보낼까요": 체크 줄 5개. 동아리원 / 초대 명단 / 1·2·3학년(학번 문구는 `activeAdmissionYears()`로). 오른쪽에 인원.
  - "2 · 더 넣을 사람(선택)": 붙여넣기 + "이메일 n개 찾음".
  - 오른쪽 300px 상자: "보낼 사람 n명"(44px/900), "겹치는 사람 빼기 −n / 차단한 사람 빼기 −n"(계산 가능하면, 아니면 생략), "받는 사람 목록 보기"(펼치면 기존 이름 목록 + 사람별 X), 흰 "보내기".
  - 아래 "자동으로 나가는 메일" 설명.
- [ ] **Step 2:** 체크·붙여넣기가 바뀌면 500ms 디바운스 뒤 기존 `RESOLVE_PROMO_RECIPIENTS`를 호출해 `promoRecipients`를 채운다.
- [ ] **Step 3:** "보내기"를 누르면 버튼이 "5초 뒤 보내요 · 멈추기 n"으로 바뀌고, 5초 뒤 기존 발송 루프를 시작한다. 진행 막대는 `bg-ink`이고 "보내는 중 n / 전체"를 쓴다.
- [ ] **Step 4:** `npm run build` 성공, dev에서 체크 변경 → 인원 갱신을 확인한다. 실제 발송은 하지 않는다.
- [ ] **Step 5:** 커밋 `feat(admin): 메일 화면 분리, 인원 자동 계산, 5초 뒤 발송`

### Task 12: 관리자 · 사람

**Files:**
- Create: `lib/adminPeople.ts`, `lib/adminPeople.test.mjs`
- Create: `app/admin/_components/PeopleTab.tsx` (← `MembersTab.tsx` 대체·삭제)
- Modify: `app/admin/page.tsx` (사람 넣기 핸들러, 차단 되돌리기, 프로필 수정 연결)

**Interfaces:**
- Produces:
  ```ts
  export type PersonRow = { email: string; name: string | null; studentId: string | null; isStaff: boolean; profileId: string | null; canBookDirect: boolean /* invited_emails */; club: boolean; admin: boolean; blocked: boolean };
  export type PeopleFilter = 'all' | 'canBook' | 'club' | 'admin' | 'cannotBook' | 'blocked';
  export function mergePeople(src: { profiles: { id?: string; email: string; name: string; student_id: string | null; role: string }[]; invited: { email: string }[]; club: { email: string }[]; admins: { email: string }[]; blacklist: { email: string }[] }): PersonRow[]; // 이메일 소문자로 합침, 정렬: 관리자 → 동아리원 → 이름(없으면 이메일)
  export function filterPeople(rows: PersonRow[], f: PeopleFilter, q: string): PersonRow[]; // q는 이름·학번·이메일 부분일치, canBook = !blocked && (canBookDirect||club||admin)
  export function countByFilter(rows: PersonRow[]): Record<PeopleFilter, number>;
  ```

- [ ] **Step 1: 실패하는 테스트**
  ```js
  test("여러 명단의 같은 사람은 한 줄", () => { const r = mergePeople({ profiles: [{ email: "A@ts.hs.kr", name: "가", student_id: "2101", role: "student" }], invited: [{ email: "a@ts.hs.kr" }], club: [{ email: "a@ts.hs.kr" }], admins: [], blacklist: [] }); assert.equal(r.length, 1); assert.equal(r[0].club, true); assert.equal(r[0].canBookDirect, true); });
  test("로그인 안 한 사람은 이름 null", () => { const r = mergePeople({ profiles: [], invited: [{ email: "b@ts.hs.kr" }], club: [], admins: [], blacklist: [] }); assert.equal(r[0].name, null); });
  test("차단된 사람은 canBook에서 빠짐", () => { const rows = mergePeople({ profiles: [], invited: [{ email: "c@x" }], club: [], admins: [], blacklist: [{ email: "c@x" }] }); assert.equal(filterPeople(rows, "canBook", "").length, 0); assert.equal(filterPeople(rows, "blocked", "").length, 1); });
  test("검색은 학번도 찾음", () => { … filterPeople(rows, "all", "2101").length === 1 });
  test("countByFilter 합계", () => { … countByFilter(rows).all === rows.length });
  ```
- [ ] **Step 2:** FAIL → 구현 → `node --test lib/adminPeople.test.mjs` PASS.
- [ ] **Step 3:** `PeopleTab`을 만든다(시안 `W3AdminPeople`).
  - 제목 + 설명 + 흰 "사람 넣기".
  - 칩 6개(활성 흰 채움, 둥근 18px) + 검색 220px.
  - 표 열은 `100px 64px minmax(0,1fr) 236px`이다. 이름은 밑줄 버튼(누르면 오른쪽 창), 토글 3개는 32px 높이(켜짐 흰 채움, 꺼짐 `border-line-strong text-mute`).
  - 동아리원·관리자면 "예매"는 켜진 모양 + `disabled` + `title="동아리원·관리자는 자동으로 예매할 수 있어요"`(스펙 §5.6 빌더 결정).
  - 차단된 줄은 빨간 테두리 "차단됨 · 풀기" 하나다.
  - 오른쪽 320px 창: 이름·이메일, 이름·학번 입력(blur 시 `UPDATE_PROFILE`, 학번이 비면 staff), 빨간 "이 사람 차단하기" + 설명. 로그인 이력이 없으면 입력칸 대신 "아직 로그인하지 않은 사람이에요".
  - md 미만은 줄을 2단으로 쌓고, 창은 화면 아래에서 올라오는 시트다.
- [ ] **Step 4:** "사람 넣기"는 지금 페이지 안에서 펼침이다.
  - 붙여넣기 + "이메일 n개 찾음"(`extractSchoolEmails`) + 버튼 4개 "예매 / 동아리원 / 관리자 / 차단에 넣기".
  - 예매·동아리원·관리자는 바로 기존 ADD 액션을 부른다. 관리자는 한 명씩 액션이면 반복 호출한다.
  - 차단은 `undoable("n명을 차단했어요", ADD_BLACKLIST_BULK)`.
- [ ] **Step 5:** 토글을 연결한다. 각 토글은 기존 ADD/REMOVE 액션을 바로 호출하고, 낙관적 갱신 후 실패하면 되돌리고 `notify(error)`한다.
  - 차단(창 버튼)은 `undoable`이다.
  - "풀기"는 바로 `REMOVE_BLACKLIST`다.
  - 자기 자신의 관리자 끄기는 막는다(`profile.email`과 같으면 비활성, title "본인 관리자 권한은 끌 수 없어요"). **(계획 단계 판단: 스스로 잠기는 사고 방지)**
- [ ] **Step 6:** `npm run build` 성공, dev 1280px·375px 확인.
- [ ] **Step 7:** 커밋 `feat(admin): 사람 명단 하나로, 권한은 줄에서 바로 켜고 끄기`

### Task 13: 관리자 · 기록

**Files:**
- Modify: `app/admin/_components/HistoryTab.tsx` (→ `LogTab.tsx`로 이름 변경 가능)
- Modify: `app/admin/page.tsx` (`handleDeleteReview` confirm 제거 → `undoable`)

- [ ] **Step 1:** 지난 회차 목록, 선택 회차의 예매·후기, 활동 로그를 Task 1 토큰과 극장 프로그램식 표(가는 선)로 바꾼다. 후기 삭제는 빨간 글씨 + 되돌리기다.
- [ ] **Step 2:** `grep -rnE "(orange|amber|emerald|sky|teal|yellow|pink|purple|rose|green)-[0-9]|confirm\(" app/admin`이 0줄이어야 한다. `npm run build` 성공.
- [ ] **Step 3:** 커밋 `feat(admin): 기록 화면 새 브랜드, 후기 삭제 되돌리기`

### Task 14: 전체 확인

**Files:** 고칠 것이 나오면 해당 파일.

- [ ] **Step 1:** `node --test lib/*.test.mjs scripts/brand/*.test.mjs`가 전부 PASS여야 한다. `npm run lint`는 새 경고가 없어야 하고, `npm run build`가 성공해야 한다.
- [ ] **Step 2:** `grep -rnE "(orange|amber|emerald|sky|teal|yellow|pink|purple|rose|green)-[0-9]|SCREEN|song-myung" app components`가 0줄이어야 한다(`app/print`의 기존 흑백 인쇄 스타일은 예외로 확인).
- [ ] **Step 3:** `npm run dev`를 띄우고 playwright-cli(스킬 `playwright-cli`)로 375×812와 1280×900 스크린샷을 찍는다. 대상은 홈(현재·지난 회차, 중강당·대강당은 가능한 범위)과 관리자 5개 메뉴다. 확인 기준은 다음과 같다.
  - 글자 세로 쪼개짐 없음
  - 가로 스크롤 없음(`document.documentElement.scrollWidth <= innerWidth`)
  - 주황 없음
  - 로고 표시

  360px에서도 홈 좌석과 관리자 표를 한 번 더 본다. 스크린샷은 스크래치패드에 저장하고 문제 있는 화면은 고친다.
- [ ] **Step 4:** 배포 메모를 정리해 보고한다(실행하지 않음).
  1. `supabase db push --linked`(0022, 기본값 true라 먼저 올려도 옛 프론트 무해)
  2. `pgrep -fl "opennext|wrangler|next build"`로 동시 배포를 확인한다
  3. `npm run deploy`(CLOUDFLARE_ACCOUNT_ID=Seong381400 계정)
  4. 20초 대기 후 퓨니코드 호스트로 라이브 확인
- [ ] **Step 5:** 고친 게 있으면 커밋 `fix: 3단계 전체 확인에서 찾은 화면 문제`
