# 브랜드 로고 생성

영화대교 로고는 글꼴로 타이핑하지 않고, 송명(Song Myung, OFL) 글자 윤곽을 가져와 배치한 SVG를 쓴다. 1년 동안 쓴 옛 로고(송명 두 줄 + 뒤에 둥근 노란 달)를 이어받았다(2026-11-10, 구기 워드마크에서 되돌림).

## 다시 만들기

```bash
python3 -m venv .venv-brand && .venv-brand/bin/pip install fonttools pytest
.venv-brand/bin/python scripts/brand/build_logo.py     # public/brand/*.svg
node scripts/brand/rasterize.mjs                       # public/brand/png/*.png
node scripts/brand/gen-mail-assets.mjs                 # lib/brandMailAssets.ts (메일 로고·절취선 홈)
```

- 폰트는 커밋하지 않는다. 처음 실행할 때 Google Fonts에서 "영화대교" 네 글자 서브셋만 받아 `scripts/brand/.cache/`에 둔다.
- PNG는 저장소에 이미 있는 `sharp`로 만든다.

## 결과물 (`public/brand/`)

| 파일 | 쓰는 곳 |
|---|---|
| `logo-square-{dark,light}.svg` | 네모형. 영화 / 대교 두 줄 + 뒤에 달. 프로필, 오프닝 |
| `logo-horizontal-{dark,light,mono}.svg` | 가로형. 한 줄 + 위아래 선, 달 없음. 웹 상단, 메일 머리, 발권기(mono) |
| `icon-{hwa,yeong}-dark.svg` | 한 글자 + 뒤에 달(48px 이상) |
| `icon-{hwa,yeong}-dark-small.svg` | 같은 것, 글자를 크게(16·32px) |
| `png/*@2x.png`, `png/*@3x.png` | 메일처럼 SVG를 못 쓰는 곳 |
| `png/icon-*-{16,32,48,180,512}.png` | 파비콘·앱 아이콘. 지금은 `icon-hwa-*`를 `public/icon*.png`·`apple-touch-icon.png`로 복사해 씀 |

`dark`는 어두운 바탕에 올리는 버전(글씨 #F4F1EA, 달 노랑 #F0DC3A(강조색보다 노랗게)), `light`는 밝은 바탕용(글씨 #111111, 달 연노랑 #D7BE32, 가장자리 없이 스러짐)이다. 색은 달 하나뿐이고 가로형엔 달이 없다. `mono`(감열 영수증)는 검정 한 색이다. 아이콘 PNG와 메일 자산의 바탕은 #0E0D0B, 티켓 카드는 #1A1916이다. 색 규칙은 `docs/superpowers/specs/2026-11-09-warm-tone-design.md`를 따른다.

## 테스트

```bash
.venv-brand/bin/python -m unittest scripts/brand/test_build_logo.py
node --test scripts/brand/rasterize.test.mjs
```
