"""영화대교 로고 생성기.

송명(Song Myung, OFL) 글꼴의 "영화대교" 글리프 윤곽을 가져와 로고 SVG를 만든다.
1년 동안 쓴 옛 로고(송명 두 줄 + 뒤에 둥근 노란 달)를 이어받는다(2026-11-10, 구기에서 되돌림).
가로형은 송명 한 줄 + 위아래 선, 달 없음. 네모형·아이콘은 뒤에 달을 깐다.

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
INK_DARK = "#F4F1EA"  # 어두운 바탕용 글씨
INK_LIGHT = "#111111"  # 밝은 바탕용 글씨
MOON_DARK = "#F0DC3A"  # 어두운 바탕용 달. 강조색 #F2B544보다 노랗게(옛 로고처럼)
MOON_LIGHT = "#D7BE32"  # 밝은 바탕용 달. 원본 로고(흰 바탕) 가운데 #F7F2D6에 맞춘 연노랑
HWA = 1  # "화" 글리프 번호
FAMILY, FONT_FILE = "Song Myung", "SongMyung-subset.ttf"

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
    path = os.path.join(CACHE_DIR, FONT_FILE)
    if os.path.exists(path):
        return path
    css_url = "https://fonts.googleapis.com/css2?" + urllib.parse.urlencode({"family": FAMILY, "text": TEXT})
    try:
        css = http_get(css_url).decode("utf-8")
        m = re.search(r"url\((https://[^)]+)\)", css)
        if not m:
            raise OSError("CSS에 폰트 주소가 없음")
        data = http_get(m.group(1))
    except OSError as e:
        raise SystemExit(f"송명 폰트를 받지 못했어요({e}). 네트워크를 확인하고 다시 실행하세요.")
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


def place(g: dict, x: float, y: float, k: float, ink: str) -> str:
    """글리프 외곽 상자의 왼쪽 위를 (x, y)에 두고 배율 k로 그린다."""
    x0, _, _, y1 = g["bb"]
    tr = f'translate({num(x - x0 * k)} {num(y + y1 * k)}) scale({k:.5f})'
    return f'<path transform="{tr}" fill="{ink}" d="{" ".join(g["ds"])}"/>'


MOON_EDGE = ((0, 0.30), (0.62, 0.21), (0.86, 0.14), (0.97, 0.06), (1, 0))  # 어두운 바탕: 오프닝 영상처럼 가장자리가 보이는 달
MOON_SOFT = ((0, 0.20), (0.45, 0.15), (0.8, 0.07), (1, 0.02))  # 밝은 바탕: 원본처럼 가장자리 없이 스러지는 빛


def moon(cx: float, cy: float, r: float, color: str, gid: str, stops: tuple = MOON_EDGE) -> str:
    """옛 로고의 달. 둥근 노란 빛."""
    s = "".join(f'<stop offset="{o}" stop-color="{color}" stop-opacity="{a}"/>' for o, a in stops)
    return (f'<defs><radialGradient id="{gid}">{s}</radialGradient></defs>'
            f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}" fill="url(#{gid})"/>')


def wrap(body: str, x: float, y: float, w: float, h: float) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(x)} {num(y)} {num(w)} {num(h)}" '
            f'width="{num(w)}" height="{num(h)}"><title>영화대교</title>{body}</svg>\n')


# 사용자 원본 네모 로고(2561px 정사각, iCloud 프로젝트/03_영화대교/로고.jpeg)에서 잰 각 글자 외곽 상자의 왼쪽 위.
# 원본은 송명 글꼴 한 배율(1 글꼴 단위 = 0.7117px)로 찍혀 있어서, 같은 자리에 두면 간격이 원본 그대로다.
SQUARE_CANVAS = 2561.0
SQUARE_K = 0.7117
SQUARE_POS = ((700, 649), (1290, 648), (662, 1329), (1279, 1403))  # 영, 화, 대, 교
SQUARE_SIZE = 456.0  # SVG 출력 크기


def square(glyphs: list, ink: str, moon_color: str) -> str:
    """옛 로고 그대로: 영화 / 대교 두 줄, 뒤에 화면을 채우는 달. 테두리 없음."""
    f = SQUARE_SIZE / SQUARE_CANVAS
    parts = [place(g, x * f, y * f, SQUARE_K * f, ink) for g, (x, y) in zip(glyphs, SQUARE_POS)]
    r = SQUARE_SIZE / 2
    stops = MOON_SOFT if moon_color == MOON_LIGHT else MOON_EDGE
    return wrap(moon(r, r, r, moon_color, "moon", stops) + "".join(parts), 0, 0, SQUARE_SIZE, SQUARE_SIZE)


# 가로형 광학 보정(글자 높이 100 기준). 교는 원래 납작해서 획 면적이 다른 글자의 3/4뿐이라 조금 키우고,
# 간격은 상자 사이가 아니라 윤곽 사이 빈 공간이 같아 보이게 글자 쌍마다 따로 준다.
# 다시 잴 때: 윤곽 간격 측정 스크립트로 쌍별 평균 빈 공간(행마다 거리, 40에서 자름)을 맞춘다.
HORIZ_SCALE = (1.0, 1.0, 1.0, 1.08)  # 영, 화, 대, 교
HORIZ_GAP = (16.6, 9.8, 13.8)  # 영-화, 화-대, 대-교 상자 사이 간격


def horizontal(glyphs: list, ink: str) -> str:
    h = 100.0
    k = h / max(g["bb"][3] - g["bb"][1] for g in glyphs)
    x, parts = 0.0, []
    for i, g in enumerate(glyphs):
        kk = k * HORIZ_SCALE[i]
        gh = (g["bb"][3] - g["bb"][1]) * kk
        parts.append(place(g, x, (h - gh) / 2, kk, ink))
        x += (g["bb"][2] - g["bb"][0]) * kk + (HORIZ_GAP[i] if i < len(HORIZ_GAP) else 0)
    w = x
    lines = (f'<rect x="0" y="-24.4" width="{num(w)}" height="2.4" fill="{ink}"/>'
             f'<rect x="0" y="{num(h + 22)}" width="{num(w)}" height="2.4" fill="{ink}"/>')
    return wrap(lines + "".join(parts), 0, -24.4, w, h + 48.8)


def single(glyphs: list, idx: int, ink: str, moon_color: str, scale: float = 0.62) -> str:
    """파비콘·앱 아이콘: 한 글자 + 뒤에 달. scale을 키우면 16·32px에서도 글자가 뭉개지지 않는다."""
    g, cell = glyphs[idx], 100.0
    k = min(cell / (g["bb"][2] - g["bb"][0]), cell / (g["bb"][3] - g["bb"][1])) * scale
    gw, gh = (g["bb"][2] - g["bb"][0]) * k, (g["bb"][3] - g["bb"][1]) * k
    body = moon(cell / 2, cell / 2, cell / 2, moon_color, "moon") + place(g, (cell - gw) / 2, (cell - gh) / 2, k, ink)
    return wrap(body, 0, 0, cell, cell)


def build(out_dir: str = OUT_DIR) -> list:
    glyphs = load_glyphs(ensure_font())
    files = {
        "logo-square-dark.svg": square(glyphs, INK_DARK, MOON_DARK),
        "logo-square-light.svg": square(glyphs, INK_LIGHT, MOON_LIGHT),
        "logo-horizontal-dark.svg": horizontal(glyphs, INK_DARK),
        "logo-horizontal-light.svg": horizontal(glyphs, INK_LIGHT),
        # 흑백 감열 영수증용. 가로형엔 색이 없어서 light와 같지만 쓰는 곳을 나눠 둔다
        "logo-horizontal-mono.svg": horizontal(glyphs, INK_LIGHT),
        "icon-hwa-dark.svg": single(glyphs, HWA, INK_DARK, MOON_DARK),
        "icon-yeong-dark.svg": single(glyphs, 0, INK_DARK, MOON_DARK),
        "icon-hwa-dark-small.svg": single(glyphs, HWA, INK_DARK, MOON_DARK, scale=0.80),
        "icon-yeong-dark-small.svg": single(glyphs, 0, INK_DARK, MOON_DARK, scale=0.80),
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
