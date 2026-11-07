# 브랜드 로고 생성

영화대교 로고는 글꼴로 타이핑하지 않고, 구기(Gugi, OFL) 글자 윤곽을 가져와 배치한 SVG를 쓴다. 규칙은 `docs/superpowers/specs/2026-11-07-brand-identity-design.md`, 한눈에 보는 가이드는 https://claude.ai/artifact/TRZ4bP9Lu2RNUBa3vNqz7q

## 다시 만들기

```bash
python3 -m venv .venv-brand && .venv-brand/bin/pip install fonttools
.venv-brand/bin/python scripts/brand/build_logo.py     # public/brand/*.svg
node scripts/brand/rasterize.mjs                       # public/brand/png/*.png
```

- 폰트는 커밋하지 않는다. 처음 실행할 때 Google Fonts에서 "영화대교" 네 글자 서브셋만 받아 `scripts/brand/.cache/`에 둔다.
- PNG는 저장소에 이미 있는 `sharp`로 만든다.

## 결과물 (`public/brand/`)

| 파일 | 쓰는 곳 |
|---|---|
| `logo-square-{dark,light}.svg` | 네모형. 프로필, 티켓, 오프닝 |
| `logo-horizontal-{dark,light}.svg` | 가로형. 웹 상단, 메일 머리 |
| `icon-{hwa,yeong}-dark.svg` | 작은 크기용 후보(48px 이상) |
| `icon-{hwa,yeong}-dark-small.svg` | 작은 크기용 후보, 테두리 굵게(16·32px) |
| `png/*@2x.png`, `png/*@3x.png` | 메일처럼 SVG를 못 쓰는 곳 |
| `png/icon-*-{16,32,48,180,512}.png` | 파비콘·앱 아이콘 후보 |

`dark`는 어두운 바탕에 올리는 버전(글씨 #F2F2F0), `light`는 밝은 바탕용(글씨 #111111)이다. 빨강(#E0443B)은 "화"의 점 하나뿐이다.

## 테스트

```bash
.venv-brand/bin/python -m unittest scripts/brand/test_build_logo.py
node --test scripts/brand/rasterize.test.mjs
```
