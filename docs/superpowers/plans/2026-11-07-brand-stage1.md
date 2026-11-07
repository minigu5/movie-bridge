# 영화대교 브랜드 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정된 구기 워드마크를 저장소에서 다시 만들 수 있게 하고, 로고 원본 파일(SVG·PNG)과 작은 크기 후보를 `public/brand/`에 만든 뒤, 브랜드 가이드에 적용 미리보기를 붙인다.

**Architecture:** Python(fontTools)으로 Google Fonts에서 받은 구기 서브셋의 글리프 윤곽을 SVG로 배치하고, Node(sharp)로 PNG를 만든다. 사이트 코드는 이 단계에서 건드리지 않는다(2~5단계).

**Tech Stack:** Python 3 + fontTools(venv), Node 26 + sharp 0.34(이미 `node_modules`에 있음), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-07-brand-identity-design.md`

## Global Constraints

- 색: 바탕 `#0F0F10`, 글씨 `#F2F2F0`, 빨강 `#E0443B`. 밝은 바탕용 글씨 `#111111`(빨강 동일).
- 빨강은 "화" 글리프의 4번째 컨투어(인덱스 3, ㅏ의 점) 하나에만 칠한다. 다른 색·그림자·그라데이션은 없다.
- 영문 텍스트 금지(파일 안 `<title>`·`aria-label`도 한글).
- 네모형: 2x2, 같은 배율(가장 큰 글자가 칸 100에 꽉 차는 배율), 칸 간격 10, 테두리 굵기 2.4·글자 묶음에서 26.
- 가로형: 글자 외곽 간격 = 높이의 10%, 위아래 선 굵기 2.4·글자에서 22.
- 구기 TTF는 커밋하지 않는다(스크립트가 Google Fonts에서 "영화대교" 서브셋만 받음).
- 사이트 코드(`app/`, `lib/`)는 바꾸지 않는다.

## Review Focus

- 생성 SVG에 빨강이 정확히 1번만 나오는지(어두운·밝은 변형 모두).
- PNG가 투명 배경이고, @2x/@3x 픽셀 크기가 SVG 크기의 정확히 2배·3배인지.
- 16px 후보가 실제로 16x16인지, 테두리가 사라지지 않는지(광학 보정 굵기).
- 스크립트를 두 번 돌려도 같은 파일이 나오는지(결정적 출력).
- 네트워크가 막혀 폰트를 못 받으면 알아보기 쉬운 오류로 멈추는지(빈 SVG를 쓰지 않음).

---

### Task 1: 로고 생성 스크립트를 저장소로

**Files:**
- Create: `scripts/brand/build_logo.py`, `scripts/brand/README.md`, `scripts/brand/test_build_logo.py`
- Modify: `.gitignore` (`scripts/brand/.cache/` 추가)

**Interfaces (Produces):**
- `python scripts/brand/build_logo.py` → `public/brand/`에 `logo-square-dark.svg`, `logo-square-light.svg`, `logo-horizontal-dark.svg`, `logo-horizontal-light.svg`, `icon-hwa-dark.svg`, `icon-yeong-dark.svg` 생성. 폰트는 `scripts/brand/.cache/Gugi-subset.ttf`에 캐시.
- 함수: `square(ink: str, red: str) -> str`(SVG 문자열), `horizontal(ink, red) -> str`, `single(index: int, ink, red, stroke: float) -> str`

- [ ] 테스트 작성(`test_build_logo.py`, unittest): 각 SVG에 빨강 hex가 정확히 1번, 영문 알파벳 텍스트 노드 없음, 두 번 생성한 결과가 바이트 단위로 같음, 폰트 다운로드 실패 시 `SystemExit` 메시지에 "폰트"가 들어감.
- [ ] 실행해서 실패 확인: `venv/bin/python -m unittest scripts/brand/test_build_logo.py` → ImportError
- [ ] `build_logo.py` 구현: 기존 시안 코드(`glyphs.py`, `wordmarks.py`, `reddot.py`)의 로직을 한 파일로 합친다. 글리프 추출(DecomposingRecordingPen + y 뒤집기), 외곽 상자 계산, 배치, 빨간 점 컨투어 분리.
- [ ] 테스트 통과 확인
- [ ] 커밋(사용자 요청 시)

### Task 2: PNG·아이콘 래스터화

**Files:**
- Create: `scripts/brand/rasterize.mjs`, `scripts/brand/rasterize.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `public/brand/*.svg`
- Produces: `public/brand/png/{name}@2x.png`, `@3x.png`(로고 4종), `public/brand/png/icon-{hwa,yeong}-{16,32,48,180,512}.png`

- [ ] 테스트(`node --test`): PNG 메타데이터 폭·높이 = SVG viewBox × 배율, 알파 채널 존재, 16px 아이콘 크기 16x16.
- [ ] 실패 확인 → `rasterize.mjs` 구현(sharp, `density`로 배율, 투명 배경) → 통과 확인.
- [ ] 16/32px 아이콘은 테두리 굵기 보정본(`single(..., stroke=…)`)으로 만든다: Task 1에 작은 크기용 굵기 인자를 쓴다.

### Task 3: 적용 미리보기를 브랜드 가이드에 붙이기

**Files:**
- Modify: 브랜드 가이드 아티팩트 원본(`scratchpad/logo-tools/guide/template.html`) — 저장소 밖

- [ ] "적용 미리보기" 섹션 추가: 메일 티켓 머리(가로형), 웹사이트 상단(가로형, 어두운 바탕), 오프닝 첫 장면(네모형, 16:9 검정), 브라우저 탭 파비콘(후보 2종). 생성된 SVG를 그대로 인라인.
- [ ] 가이드 재게시, 사용자에게 사용 규칙·파비콘 후보 확정 요청.
