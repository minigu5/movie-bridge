import os
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import build_logo  # noqa: E402

RED = build_logo.RED


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
            "logo-horizontal-dark.svg", "logo-horizontal-light.svg",
            "icon-hwa-dark.svg", "icon-yeong-dark.svg",
            "icon-hwa-dark-small.svg", "icon-yeong-dark-small.svg",
        ]))

    def test_red_appears_once_where_hwa_exists(self):
        for p in self.files:
            svg = open(p, encoding="utf-8").read()
            expected = 0 if "yeong" in p else 1
            self.assertEqual(svg.count(RED), expected, p)

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
