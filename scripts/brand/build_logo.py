"""영화대교 로고 생성기.

구기(Gugi, OFL) 글꼴의 "영화대교" 글리프 윤곽을 가져와 로고 SVG를 만든다.
규칙은 docs/superpowers/specs/2026-11-07-brand-identity-design.md 를 따른다.

    python scripts/brand/build_logo.py          # public/brand/ 에 SVG 생성
    node scripts/brand/rasterize.mjs            # 그다음 PNG·아이콘 생성

필요: fontTools (pip install fonttools). 폰트 파일은 커밋하지 않고 Google Fonts에서
"영화대교" 네 글자 서브셋만 받아 scripts/brand/.cache/ 에 둔다.
"""
import os
import re
import sys
import urllib.parse
import urllib.request

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

TEXT = "영화대교"
INK_DARK = "#F2F2F0"  # 어두운 바탕용 글씨
INK_LIGHT = "#111111"  # 밝은 바탕용 글씨
RED = "#E0443B"
HWA, HWA_DOT = 1, 3  # "화" 글리프와 그 안의 ㅏ 점 컨투어 번호

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, ".cache")
OUT_DIR = os.path.join(HERE, "..", "..", "public", "brand")
# 오래된 안드로이드 UA로 요청하면 Google Fonts가 woff2 대신 ttf 주소를 준다
UA = "Mozilla/5.0 (Linux; U; Android 2.2)"


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def ensure_font() -> str:
    path = os.path.join(CACHE_DIR, "Gugi-subset.ttf")
    if os.path.exists(path):
        return path
    css_url = "https://fonts.googleapis.com/css2?" + urllib.parse.urlencode({"family": "Gugi", "text": TEXT})
    try:
        css = http_get(css_url).decode("utf-8")
        m = re.search(r"url\((https://[^)]+)\)", css)
        if not m:
            raise OSError("CSS에 폰트 주소가 없음")
        data = http_get(m.group(1))
    except OSError as e:
        raise SystemExit(f"구기 폰트를 받지 못했어요({e}). 네트워크를 확인하고 다시 실행하세요.")
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def num(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def load_glyphs(path: str) -> list:
    font = TTFont(path)
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    glyphs = []
    for ch in TEXT:
        rec = DecomposingRecordingPen(gs)
        gs[cmap[ord(ch)]].draw(rec)
        contours, cur = [], []
        for op, args in rec.value:
            cur.append((op, args))
            if op in ("closePath", "endPath"):
                contours.append(cur)
                cur = []
        ds, boxes = [], []
        for c in contours:
            sp = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}")
            tp = TransformPen(sp, (1, 0, 0, -1, 0, 0))  # 글꼴 좌표는 y가 위로, SVG는 아래로
            bp = BoundsPen(gs)
            for op, args in c:
                getattr(tp, op)(*args)
                getattr(bp, op)(*args)
            ds.append(sp.getCommands())
            boxes.append(bp.bounds)
        bb = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        glyphs.append({"ds": ds, "bb": bb})
    return glyphs


def place(g: dict, idx: int, x: float, y: float, k: float, ink: str, red: str) -> str:
    """글리프 외곽 상자의 왼쪽 위를 (x, y)에 두고 배율 k로 그린다."""
    x0, _, _, y1 = g["bb"]
    tr = f'translate({num(x - x0 * k)} {num(y + y1 * k)}) scale({k:.5f})'
    if idx == HWA:
        body = " ".join(d for j, d in enumerate(g["ds"]) if j != HWA_DOT)
        return (f'<path transform="{tr}" fill="{ink}" d="{body}"/>'
                f'<path transform="{tr}" fill="{red}" d="{g["ds"][HWA_DOT]}"/>')
    return f'<path transform="{tr}" fill="{ink}" d="{" ".join(g["ds"])}"/>'


def wrap(body: str, x: float, y: float, w: float, h: float) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(x)} {num(y)} {num(w)} {num(h)}" '
            f'width="{num(w)}" height="{num(h)}"><title>영화대교</title>{body}</svg>\n')


def square(glyphs: list, ink: str, red: str) -> str:
    cell, gap = 100.0, 10.0
    k = min(min(cell / (g["bb"][2] - g["bb"][0]), cell / (g["bb"][3] - g["bb"][1])) for g in glyphs)
    parts = []
    for i, g in enumerate(glyphs):
        gw, gh = (g["bb"][2] - g["bb"][0]) * k, (g["bb"][3] - g["bb"][1]) * k
        parts.append(place(g, i, (i % 2) * (cell + gap) + (cell - gw) / 2, (i // 2) * (cell + gap) + (cell - gh) / 2, k, ink, red))
    size = 2 * cell + gap
    frame = f'<rect x="-26" y="-26" width="{num(size + 52)}" height="{num(size + 52)}" fill="none" stroke="{ink}" stroke-width="2.4"/>'
    return wrap(frame + "".join(parts), -27.2, -27.2, size + 54.4, size + 54.4)


def horizontal(glyphs: list, ink: str, red: str) -> str:
    h = 100.0
    k = h / max(g["bb"][3] - g["bb"][1] for g in glyphs)
    x, parts = 0.0, []
    for i, g in enumerate(glyphs):
        gh = (g["bb"][3] - g["bb"][1]) * k
        parts.append(place(g, i, x, (h - gh) / 2, k, ink, red))
        x += (g["bb"][2] - g["bb"][0]) * k + h * 0.10
    w = x - h * 0.10
    lines = (f'<rect x="0" y="-24.4" width="{num(w)}" height="2.4" fill="{ink}"/>'
             f'<rect x="0" y="{num(h + 22)}" width="{num(w)}" height="2.4" fill="{ink}"/>')
    return wrap(lines + "".join(parts), 0, -24.4, w, h + 48.8)


def single(glyphs: list, idx: int, ink: str, red: str, stroke: float = 7.0, scale: float = 0.86) -> str:
    """작은 크기용 후보: 한 글자 + 테두리. stroke를 키우면 16·32px에서도 테두리가 남는다."""
    g, cell = glyphs[idx], 100.0
    k = min(cell / (g["bb"][2] - g["bb"][0]), cell / (g["bb"][3] - g["bb"][1])) * scale
    gw, gh = (g["bb"][2] - g["bb"][0]) * k, (g["bb"][3] - g["bb"][1]) * k
    m = 14 + stroke / 2
    frame = f'<rect x="{num(-14)}" y="{num(-14)}" width="{num(cell + 28)}" height="{num(cell + 28)}" fill="none" stroke="{ink}" stroke-width="{num(stroke)}"/>'
    return wrap(frame + place(g, idx, (cell - gw) / 2, (cell - gh) / 2, k, ink, red), -m, -m, cell + 2 * m, cell + 2 * m)


def build(out_dir: str = OUT_DIR) -> list:
    glyphs = load_glyphs(ensure_font())
    files = {
        "logo-square-dark.svg": square(glyphs, INK_DARK, RED),
        "logo-square-light.svg": square(glyphs, INK_LIGHT, RED),
        "logo-horizontal-dark.svg": horizontal(glyphs, INK_DARK, RED),
        "logo-horizontal-light.svg": horizontal(glyphs, INK_LIGHT, RED),
        # 흑백 감열 영수증용: 빨간 점도 검정
        "logo-horizontal-mono.svg": horizontal(glyphs, INK_LIGHT, INK_LIGHT),
        "icon-hwa-dark.svg": single(glyphs, HWA, INK_DARK, RED),
        "icon-yeong-dark.svg": single(glyphs, 0, INK_DARK, RED),
        "icon-hwa-dark-small.svg": single(glyphs, HWA, INK_DARK, RED, stroke=12, scale=0.80),
        "icon-yeong-dark-small.svg": single(glyphs, 0, INK_DARK, RED, stroke=12, scale=0.80),
    }
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for name, svg in files.items():
        p = os.path.join(out_dir, name)
        with open(p, "w", encoding="utf-8") as f:
            f.write(svg)
        paths.append(p)
    return paths


if __name__ == "__main__":
    for p in build():
        print(os.path.relpath(p))
