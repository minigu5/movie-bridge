import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import build_logo  # noqa: E402

DOT_DARK = "#F2B544"   # 어두운 바탕용 '화' 점(노랑)
DOT_LIGHT = "#B07A12"  # 밝은 바탕용 '화' 점(진한 호박색)
INK_DARK = "#F4F1EA"   # 어두운 바탕용 글씨
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

    def test_dot_appears_once_where_hwa_exists(self):
        for p in self.files:
            svg = open(p, encoding="utf-8").read()
            dot = DOT_LIGHT if "light" in p else DOT_DARK
            expected = 0 if ("yeong" in p or "mono" in p) else 1
            self.assertEqual(svg.count(dot), expected, p)

    def test_dot_colors(self):
        for name in ("logo-horizontal-dark.svg", "logo-square-dark.svg", "icon-hwa-dark.svg"):
            svg = self.svg(name)
            self.assertIn(DOT_DARK, svg, name)
            self.assertIn(INK_DARK, svg, name)
            for old in OLD_COLORS:
                self.assertNotIn(old, svg, name)
        for name in ("logo-horizontal-light.svg", "logo-square-light.svg"):
            self.assertIn(DOT_LIGHT, self.svg(name), name)
        # 흑백 영수증용은 점도 검정: 빨강·노랑 둘 다 없어야 한다
        mono = self.svg("logo-horizontal-mono.svg")
        for c in ("#E0443B", DOT_DARK, DOT_LIGHT):
            self.assertNotIn(c, mono)
        # 어떤 파일에도 옛 색이 남지 않는다
        for p in self.files:
            svg = open(p, encoding="utf-8").read()
            for old in OLD_COLORS:
                self.assertNotIn(old, svg, p)

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
