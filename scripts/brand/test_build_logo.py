import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import build_logo  # noqa: E402

MOON_DARK = "#F0DC3A"   # 어두운 바탕용 달(노랑)
MOON_LIGHT = "#D7BE32"  # 밝은 바탕용 달(원본 로고의 연노랑)
INK_DARK = "#F4F1EA"    # 어두운 바탕용 글씨
OLD_COLORS = ("#E0443B", "#F2F2F0")  # 빨강 시절 점·글씨


def text_nodes(svg: str) -> str:
    # 태그를 지우고 남는 글자(제목 등)만
    return re.sub(r"<[^>]+>", "", svg)


class BuildLogoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp()
        cls.files = build_logo.build(cls.out)

    def test_all_files_written(self):
        names = sorted(os.path.basename(p) for p in self.files)
        self.assertEqual(names, sorted([
            "logo-square-dark.svg", "logo-square-light.svg",
            "logo-horizontal-dark.svg", "logo-horizontal-light.svg", "logo-horizontal-mono.svg",
            "icon-hwa-dark.svg", "icon-yeong-dark.svg",
            "icon-hwa-dark-small.svg", "icon-yeong-dark-small.svg",
        ]))

    def svg(self, name: str) -> str:
        return open(os.path.join(self.out, name), encoding="utf-8").read()

    def test_moon_only_on_square_and_icons(self):
        for p in self.files:
            svg = open(p, encoding="utf-8").read()
            name = os.path.basename(p)
            if "horizontal" in name:
                # 가로형엔 달이 없다(사이트 위의 큰 빛이 달 역할)
                self.assertNotIn("radialGradient", svg, name)
                for c in (MOON_DARK, MOON_LIGHT):
                    self.assertNotIn(c, svg, name)
            else:
                self.assertEqual(svg.count("<radialGradient"), 1, name)
                self.assertIn(MOON_LIGHT if "light" in name else MOON_DARK, svg, name)

    def test_colors(self):
        for name in ("logo-horizontal-dark.svg", "logo-square-dark.svg", "icon-hwa-dark.svg"):
            self.assertIn(INK_DARK, self.svg(name), name)
        for p in self.files:
            svg = open(p, encoding="utf-8").read()
            for old in OLD_COLORS:
                self.assertNotIn(old, svg, p)

    def test_square_has_no_frame(self):
        # 옛 로고처럼 테두리 없이 두 줄 + 달
        self.assertNotIn("stroke", self.svg("logo-square-dark.svg"))

    def test_no_english_text(self):
        for p in self.files:
            self.assertIsNone(re.search(r"[A-Za-z]", text_nodes(open(p, encoding="utf-8").read())), p)

    def test_deterministic(self):
        again = tempfile.mkdtemp()
        for p in build_logo.build(again):
            a = open(p, "rb").read()
            b = open(os.path.join(self.out, os.path.basename(p)), "rb").read()
            self.assertEqual(a, b, p)

    def test_font_download_failure_is_clear(self):
        with tempfile.TemporaryDirectory() as cache:
            with mock.patch.object(build_logo, "CACHE_DIR", cache), \
                 mock.patch.object(build_logo, "http_get", side_effect=OSError("network down")):
                with self.assertRaises(SystemExit) as cm:
                    build_logo.ensure_font()
        self.assertIn("폰트", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
