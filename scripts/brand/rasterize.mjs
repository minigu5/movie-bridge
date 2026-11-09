// public/brand/*.svg → public/brand/png/*.png
// 메일처럼 SVG를 믿을 수 없는 곳에 쓸 로고 PNG(@2x·@3x)와 파비콘·앱 아이콘 후보를 만든다.
// 먼저 scripts/brand/build_logo.py 로 SVG를 만든 다음 실행한다.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = join(HERE, "..", "..", "public", "brand");
const LOGOS = ["logo-square-dark", "logo-square-light", "logo-horizontal-dark", "logo-horizontal-light"];
const ICON_SIZES = [16, 32, 48, 180, 512];
// 16·32px는 테두리를 굵게 만든 small 버전을 써야 테두리가 사라지지 않는다
const iconSource = (name, n) => `icon-${name}-dark${n <= 32 ? "-small" : ""}.svg`;

export function svgSize(svg) {
  const w = Number(svg.match(/\swidth="([\d.]+)"/)[1]);
  const h = Number(svg.match(/\sheight="([\d.]+)"/)[1]);
  return { w, h };
}

export async function rasterize(srcDir = SRC_DIR, outDir = join(SRC_DIR, "png")) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const name of LOGOS) {
    const buf = readFileSync(join(srcDir, `${name}.svg`));
    const { w, h } = svgSize(buf.toString("utf8"));
    for (const s of [2, 3]) {
      const file = join(outDir, `${name}@${s}x.png`);
      // density 72 = SVG 1단위가 1px. 배율만큼 올리고 정확한 크기로 맞춘다
      await sharp(buf, { density: 72 * s })
        .resize(Math.round(w * s), Math.round(h * s), { fit: "fill" })
        .png()
        .toFile(file);
      written.push(file);
    }
  }
  for (const name of ["hwa", "yeong"]) {
    for (const n of ICON_SIZES) {
      const buf = readFileSync(join(srcDir, iconSource(name, n)));
      const file = join(outDir, `icon-${name}-${n}.png`);
      // 아이콘은 투명이면 탭 색에 묻히므로 브랜드 바탕색을 깐다
      await sharp(buf, { density: 600 })
        .resize(n, n)
        .flatten({ background: "#0E0D0B" })
        .png()
        .toFile(file);
      written.push(file);
    }
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await rasterize();
  for (const f of files) console.log(f.replace(join(HERE, "..", "..") + "/", ""));
}
