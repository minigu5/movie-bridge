// 메일 티켓에 CID로 붙일 브랜드 PNG를 만들어 lib/brandMailAssets.ts 에 base64로 쓴다.
// (Cloudflare Workers에서는 public/ 파일을 읽을 수 없어서 lib/emailIcons.ts 처럼 소스에 박는다)
// 먼저 build_logo.py → rasterize.mjs 를 실행한 뒤 실행한다.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "lib", "brandMailAssets.ts");

const BG = "#0E0D0B";   // 메일 바탕
const CARD = "#1A1916"; // 티켓 카드
const LOGO_W = 150;     // 메일에서 로고 표시 폭(px)
const NOTCH = { w: 14, h: 28 }; // 절취선 홈 표시 크기(px)

async function logo() {
  const src = readFileSync(join(ROOT, "public", "brand", "logo-horizontal-dark.svg"));
  const meta = await sharp(src).metadata();
  const h = Math.round((LOGO_W * meta.height) / meta.width);
  const buf = await sharp(src, { density: 600 }).resize(LOGO_W * 3, h * 3).png().toBuffer();
  return { buf, size: [LOGO_W, h] };
}

// 가로 로고 + 위에서 번지는 큰 달(사이트 홈의 .home-glow와 같은 빛). 메일 맨 위에 붙여 빛이 바탕 윗변에서 시작한다.
// 메일 앱 대부분이 CSS 그라데이션을 못 그려서 반투명 PNG로 굽는다. 빛은 그림 안에서 0으로 스러져 가장자리가 안 보인다.
const MOON = { w: 400, h: 150, cy: 8, fade: 142, logoTop: 36 };
async function logoMoon() {
  const s = 3, W = MOON.w * s, H = MOON.h * s;
  const r = (MOON.fade / 0.7) * s; // 70% 지점에서 0
  const glow = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="${W / 2}" cy="${MOON.cy * s}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F0DC3A" stop-opacity="0.34"/><stop offset="0.38" stop-color="#F0DC3A" stop-opacity="0.13"/><stop offset="0.7" stop-color="#F0DC3A" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
  const { buf: logoBuf, size: [lw] } = await logo();
  const buf = await sharp(Buffer.from(glow))
    .composite([{ input: logoBuf, left: Math.round(((MOON.w - lw) / 2) * s), top: MOON.logoTop * s }])
    .png().toBuffer();
  return { buf, size: [MOON.w, MOON.h] };
}

// 카드 가장자리에 파인 반원: 카드색 바탕에 바탕색 반원. side는 홈이 붙는 카드 쪽('left'|'right')
async function notch(side) {
  const s = 3, w = NOTCH.w * s, h = NOTCH.h * s, r = h / 2;
  const cx = side === "left" ? 0 : w;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${CARD}"/><circle cx="${cx}" cy="${r}" r="${r}" fill="${BG}"/></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buf, size: [NOTCH.w, NOTCH.h] };
}

const assets = { logoH: await logo(), logoMoon: await logoMoon(), notchL: await notch("left"), notchR: await notch("right") };

const lines = Object.entries(assets).map(([k, v]) => `  ${k}: "${v.buf.toString("base64")}",`).join("\n");
const sizes = Object.entries(assets).map(([k, v]) => `  ${k}: [${v.size[0]}, ${v.size[1]}],`).join("\n");

writeFileSync(OUT, `// lib/brandMailAssets.ts
// 메일 티켓용 브랜드 PNG(가로형 로고, 달 붙은 가로형 로고, 절취선 홈). 생성: node scripts/brand/gen-mail-assets.mjs — 직접 고치지 말 것.
// 메일 앱은 SVG와 data: 이미지를 막으므로 CID 첨부로 넣는다(lib/emailIcons.ts와 같은 방식).

const ASSETS_B64 = {
${lines}
} as const;

export type BrandMailAsset = keyof typeof ASSETS_B64;

/** 메일 본문에서 쓰는 표시 크기 [폭, 높이](px). 원본은 3배 해상도. */
export const BRAND_MAIL_SIZE: Record<BrandMailAsset, [number, number]> = {
${sizes}
};

export function brandMailAttachment(name: BrandMailAsset) {
  return { filename: \`\${name}.png\`, content: Buffer.from(ASSETS_B64[name], 'base64'), cid: name, contentType: 'image/png' };
}
`);
console.log("lib/brandMailAssets.ts", Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, v.size])));
