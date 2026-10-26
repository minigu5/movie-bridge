# 영화대교 🎬

대구과학고등학교 영화 동아리 **영화대교**의 온라인 영화 예매 시스템입니다.

- 서비스 주소: https://영화대교.dshs.dev (기존 `영화대교.omm.run`은 이 주소로 리다이렉트)

## 주요 기능

- **학교 구글 계정 로그인** — `@ts.hs.kr` 구글 계정으로만 로그인 가능. 비로그인 상태에서도 좌석 현황은 볼 수 있고, 좌석을 누르면 로그인으로 이어지며 로그인 후 선택한 좌석이 복원됩니다.
- **좌석 선택 및 예매** — 중강당/대강당 배치도를 실시간으로 표시하고 좌석을 선택해 예매
- **단체 예매** — 리더가 본인 포함 최대 10명의 좌석을 한 번에 잡고, 멤버에게 초대 메일 발송 (1시간 내 수락)
- **팝콘 주문** — 예매 시 팝콘 종류·수량 선택 (개당 2,500원, 현장 결제)
- **이메일 티켓** — 예매 승인 시 포스터 배경의 모바일 티켓을 메일로 발송 (취소 시 취소 메일)
- **동아리 전용석 (VIP)** — 관리자가 지정한 구역은 동아리 부원만 예매 가능
- **하자 좌석** — 관리자가 지정한 좌석은 예매 시 경고 표시
- **관람평** — 로그인한 사용자가 별점과 관람평 작성
- **현장 발권기** (`/print`) — 발권기 비밀번호로 로그인 후 영화 당일 현장에서 티켓 출력
- **관리자 대시보드** (`/admin`) — 탭 구성
  - 예매 관리: 승인/취소, 검색·필터, 발권 상태 초기화
  - 상영 설정: 영화·상영 일정(캘린더 입력), 포스터(URL 또는 파일 업로드), 티켓 배경, VIP 구역/하자 좌석 격자 지정, 홍보(초청) 메일 발송, 새 회차 시작
  - 회원·권한: 관리자·동아리 부원·블랙리스트 관리, 프로필 수정, 발권기 비밀번호
  - 이력·로그: 지난 회차의 예매 내역·좌석·관람평, 활동 로그 조회
- **개인정보처리방침** (`/privacy`)

## 기술 스택

| 분야 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19 |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS 4, lucide-react 아이콘 |
| 데이터베이스 / 인증 | Supabase (PostgreSQL, RLS, Google OAuth) |
| 이메일 | Nodemailer + Gmail SMTP (여러 계정 순환, 재시도) |
| 이미지 호스팅 | Cloudinary (포스터·티켓 배경 재호스팅) |
| 배포 | Cloudflare Workers (OpenNext 어댑터) |
| 분석 | Vercel Analytics |

## 프로젝트 구조

```
app/
  page.tsx                 # 메인 예매 페이지
  admin/
    page.tsx               # 관리자 대시보드
    _components/           # 탭(예매/설정/회원/이력), VIP·하자 좌석 격자 등
  print/page.tsx           # 현장 발권기
  cancel/page.tsx          # 예매 취소 페이지
  group-confirm/page.tsx   # 단체 예매 수락 페이지
  privacy/page.tsx         # 개인정보처리방침
  api/
    admin/action/          # 관리자 전용 API (admins 테이블로 권한 확인)
    admin/check/           # 관리자 여부 확인
    reservations/          # 예매 생성
    current-seats/         # 현재 좌석 현황 (비로그인용, service-role 경유)
    past-seats/            # 지난 회차 좌석
    kiosk/                 # 발권기 로그인·티켓 조회
    ticket/                # 티켓/취소 메일 발송
    promo/                 # 홍보 메일 발송
    blacklist/             # 블랙리스트 알림 메일
    group-invite/          # 단체 예매 초대 메일
    cron/group-check/      # 만료된 단체 예매 정리 (메인 페이지 접속 시 호출)
    poster-image/          # 포스터 이미지 프록시
    profiles/search/       # 프로필 검색
components/
  AccountInfo.tsx          # 계좌 정보 표시
  MovieReviews.tsx         # 관람평
lib/
  supabase.ts              # 공개 Supabase 클라이언트
  supabase-admin.ts        # 서버 전용 Supabase 관리자 클라이언트 (지연 초기화)
  supabase-auth.ts         # 구글 로그인, 프로필 생성, 인증 fetch
  api-auth.ts              # API 요청의 사용자/관리자 검증
  mailer.ts                # Gmail SMTP 발송 (계정 순환, 재시도)
  cloudinary.ts            # Cloudinary 업로드
  safeImageFetch.ts        # 외부 이미지 안전 fetch (메일 CID 첨부용)
  schoolEmails.ts          # 학년별 학교 이메일 규칙
  seatGrid.ts              # 좌석 배치·VIP 좌석 계산
  ticketBackgroundCanvas.ts # 티켓 배경 이미지 생성
supabase/migrations/       # DB 마이그레이션 SQL
docs/                      # 설계 문서, OAuth 설정 가이드
```

## 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 아래 값을 채웁니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 메일 발송 계정 (Gmail 앱 비밀번호). _1, _2, ... 순서로 여러 개 등록 가능
GMAIL_USER_1=
GMAIL_APP_PASSWORD_1=
GMAIL_USER_2=
GMAIL_APP_PASSWORD_2=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### 3. 데이터베이스 / 구글 로그인

- 스키마는 `supabase/migrations/`에 있습니다. Supabase CLI로 링크된 프로젝트에 적용합니다.

  ```bash
  supabase db push --linked
  ```

- 구글 OAuth 설정은 [`docs/superpowers/google-oauth-setup.md`](docs/superpowers/google-oauth-setup.md)를 참고하세요.

### 4. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인하세요.

## 배포

Cloudflare Workers(Worker 이름 `movie-bridge`)에 OpenNext 어댑터로 배포합니다. `main` 브랜치에 푸시하면 Cloudflare Workers Builds가 `npm run deploy`로 자동 배포합니다.

```bash
npm run preview   # 로컬에서 Workers 런타임으로 미리보기
npm run deploy    # 수동 배포
```

- 서버 전용 시크릿(`SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_*`, `CLOUDINARY_*`)은 `.env` 파일이 아니라 Worker 시크릿으로 등록해야 런타임에 읽힙니다.

  ```bash
  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name movie-bridge
  ```

- `NEXT_PUBLIC_*` 값은 빌드할 때 번들에 들어가므로, 바꾼 뒤에는 다시 배포해야 합니다.
- Workers 런타임은 `runtime = 'edge'`를 지원하지 않습니다. 서버 시크릿은 모듈 최상위가 아니라 요청 처리 중에 읽어야 합니다.
- 실시간 로그: `npx wrangler tail movie-bridge --format pretty`

## 라이선스

[MIT](LICENSE)
