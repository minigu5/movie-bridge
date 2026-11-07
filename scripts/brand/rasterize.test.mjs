import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { rasterize, SRC_DIR, svgSize } from "./rasterize.mjs";

const out = mkdtempSync(join(tmpdir(), "brand-png-"));
const files = await rasterize(SRC_DIR, out);

test("로고 4종 × @2x·@3x, 아이콘 2종 × 5크기", () => {
  assert.equal(files.length, 4 * 2 + 2 * 5);
});

test("@2x·@3x 크기는 SVG 크기의 정확히 2배·3배(반올림)", async () => {
  for (const name of ["logo-square-dark", "logo-horizontal-light"]) {
    const { w, h } = svgSize(readFileSync(join(SRC_DIR, `${name}.svg`), "utf8"));
    for (const s of [2, 3]) {
      const m = await sharp(join(out, `${name}@${s}x.png`)).metadata();
      assert.equal(m.width, Math.round(w * s), `${name}@${s}x width`);
      assert.equal(m.height, Math.round(h * s), `${name}@${s}x height`);
      assert.equal(m.hasAlpha, true);
    }
  }
});

test("아이콘은 정해진 정사각형 크기", async () => {
  for (const n of [16, 32, 48, 180, 512]) {
    const m = await sharp(join(out, `icon-hwa-${n}.png`)).metadata();
    assert.deepEqual([m.width, m.height], [n, n]);
  }
});
