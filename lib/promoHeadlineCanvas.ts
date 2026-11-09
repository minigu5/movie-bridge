// lib/promoHeadlineCanvas.ts
// 홍보 메일의 큰 날짜("11.14 토")와 영화 제목을 함렛으로 그린 PNG로 만든다(관리자 브라우저에서, 보내는 순간).
// Gmail 등은 웹 글꼴을 막아 함렛이 기기 명조/고딕으로 바뀐다 → 그림으로 붙이면 어느 앱에서나 같은 모양.
// 함렛을 확실히 못 쓰면 null을 돌려준다. 그러면 메일은 기본 고딕 글자(lib/promoMailHtml.ts)로 나간다.
// 잘못된 글꼴로 구운 그림은 절대 만들지 않는다(예전에 canvas 로고가 대체 글꼴로 구워진 사고가 있었다).
// DOM이 필요 없는 계산(줄 나누기·자간 배치)은 node --test lib/promoHeadlineCanvas.test.mjs 로 검증한다.

export type HeadlineImage = {
  /** data:image/png;base64,... (3배 해상도) */
  dataUri: string;
  /** <img>에 쓸 CSS px 크기. */
  width: number;
  height: number;
};

export type PromoHeadlines = { date: HeadlineImage; title: HeadlineImage };

export const HEADLINE_BG = '#0E0D0B';
export const HEADLINE_FG = '#F4F1EA';
export const HEADLINE_SCALE = 3;
/** 메일 본문 폭 440 − 좌우 여백 28×2. */
export const HEADLINE_MAX_W = 384;
/** 포스터(168) + 간격(18) 옆 제목 칸 폭. */
export const TITLE_MAX_W_WITH_POSTER = HEADLINE_MAX_W - 168 - 18;

export const DATE_FONT = { weight: 900, size: 64, spacing: -2, height: 72 };
export const TITLE_FONT = { weight: 700, size: 24, lineHeight: 1.2, maxLines: 3 };

type Measure = (text: string) => number;

/** 자간을 준 글자별 x 위치와 전체 폭(마지막 글자 뒤 자간은 빼고). */
export function layoutSpaced(text: string, measure: Measure, spacing: number): { xs: number[]; chars: string[]; width: number } {
  const chars = Array.from(text);
  const xs: number[] = [];
  let x = 0;
  chars.forEach((ch, i) => {
    xs.push(x);
    x += measure(ch) + (i < chars.length - 1 ? spacing : 0);
  });
  return { xs, chars, width: Math.max(0, x) };
}

/** 한 단어가 줄보다 길면 글자 단위로 자른다. */
function splitLongWord(word: string, measure: Measure, maxWidth: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of Array.from(word)) {
    if (cur && measure(cur + ch) > maxWidth) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** 끝에 "…"를 붙여 폭 안에 맞춘다. */
function withEllipsis(line: string, measure: Measure, maxWidth: number): string {
  let chars = Array.from(line.trimEnd());
  while (chars.length > 0 && measure(chars.join('').trimEnd() + '…') > maxWidth) chars = chars.slice(0, -1);
  return chars.join('').trimEnd() + '…';
}

/**
 * 제목을 줄로 나눈다. 띄어쓰기 단위(word-break: keep-all처럼)로 나누고, 한 단어가 너무 길면 글자 단위로 자른다.
 * maxLines를 넘으면 마지막 줄 끝을 "…"로 줄인다.
 */
export function wrapTitle(text: string, measure: Measure, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const tryLine = cur ? `${cur} ${word}` : word;
    if (measure(tryLine) <= maxWidth) { cur = tryLine; continue; }
    if (cur) lines.push(cur);
    if (measure(word) <= maxWidth) { cur = word; continue; }
    const pieces = splitLongWord(word, measure, maxWidth);
    lines.push(...pieces.slice(0, -1));
    cur = pieces[pieces.length - 1] ?? '';
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = withEllipsis(`${kept[maxLines - 1]} ${lines[maxLines]}`, measure, maxWidth);
  return kept;
}

/** "--font-hahmlet" 값('Hahmlet', 'Hahmlet Fallback' 같은 목록)에서 진짜 글꼴 이름(첫 항목)만 꺼낸다. */
export function firstFamily(cssValue: string): string | null {
  const first = cssValue.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').trim();
  return first ? first : null;
}

// ---- 아래부터 브라우저 전용 ----

function resolveHahmletFamily(): string | null {
  if (typeof document === 'undefined') return null;
  const fromVar = getComputedStyle(document.documentElement).getPropertyValue('--font-hahmlet');
  const fam = firstFamily(fromVar);
  if (fam) return fam;
  // 변수를 못 읽으면 font-title 클래스가 실제로 받는 글꼴에서 찾는다.
  const probe = document.createElement('span');
  probe.className = 'font-title';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const ff = getComputedStyle(probe).fontFamily;
  probe.remove();
  const fromClass = firstFamily(ff);
  return fromClass && /hahmlet/i.test(fromClass) ? fromClass : null;
}

/** 그 글자들에 쓸 함렛 글꼴 파일을 정말로 받았는지 확인한다. 하나라도 아니면 false. */
async function ensureFont(font: string, family: string, text: string): Promise<boolean> {
  try {
    const faces = await document.fonts.load(font, text);
    const norm = (f: string) => f.replace(/^['"]|['"]$/g, '');
    // load()는 해당 이름의 @font-face가 하나도 없어도 빈 배열로 성공한다 → 실제 함렛 face가 있어야 한다.
    if (faces.length === 0 || !faces.every((f) => f.status === 'loaded' && norm(f.family) === family)) return false;
    return document.fonts.check(font, text);
  } catch {
    return false;
  }
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * HEADLINE_SCALE);
  canvas.height = Math.round(height * HEADLINE_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(HEADLINE_SCALE, HEADLINE_SCALE);
  ctx.fillStyle = HEADLINE_BG;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = HEADLINE_FG;
  return { canvas, ctx };
}

function measureCtx(font: string): CanvasRenderingContext2D | null {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) ctx.font = font;
  return ctx;
}

function drawDate(text: string, font: string): HeadlineImage | null {
  const m = measureCtx(font);
  if (!m) return null;
  const lay = layoutSpaced(text, (ch) => m.measureText(ch).width, DATE_FONT.spacing);
  const metrics = m.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || DATE_FONT.size * 0.8;
  const descent = metrics.actualBoundingBoxDescent || DATE_FONT.size * 0.1;
  const height = Math.max(DATE_FONT.height, Math.ceil(ascent + descent + 8));
  // 글자 모양이 자리(advance) 밖으로 조금 나가기도 해서(토의 가로획 등) 실제 잉크 경계로 폭을 잡는다.
  let minX = 0;
  let maxX = lay.width;
  lay.chars.forEach((ch, i) => {
    const cm = m.measureText(ch);
    minX = Math.min(minX, lay.xs[i] - (cm.actualBoundingBoxLeft || 0));
    maxX = Math.max(maxX, lay.xs[i] + (cm.actualBoundingBoxRight || cm.width));
  });
  const width = Math.min(HEADLINE_MAX_W, Math.ceil(maxX - minX + 2));
  const c = makeCanvas(width, height);
  if (!c) return null;
  c.ctx.font = font;
  c.ctx.textBaseline = 'alphabetic';
  // 글자 묶음을 세로 가운데에 둔다.
  const baseline = (height - (ascent + descent)) / 2 + ascent;
  lay.chars.forEach((ch, i) => c.ctx.fillText(ch, lay.xs[i] - minX, baseline));
  return { dataUri: c.canvas.toDataURL('image/png'), width, height };
}

function drawTitle(text: string, font: string, maxWidth: number): HeadlineImage | null {
  const m = measureCtx(font);
  if (!m) return null;
  const measure = (s: string) => m.measureText(s).width;
  const lines = wrapTitle(text, measure, maxWidth, TITLE_FONT.maxLines);
  if (lines.length === 0) return null;
  const lh = TITLE_FONT.size * TITLE_FONT.lineHeight;
  const inkRight = (line: string) => { const tm = m.measureText(line); return Math.max(tm.width, tm.actualBoundingBoxRight || 0); };
  const width = Math.min(maxWidth, Math.ceil(Math.max(...lines.map(inkRight)) + 2));
  const height = Math.ceil(lines.length * lh);
  const c = makeCanvas(width, height);
  if (!c) return null;
  c.ctx.font = font;
  c.ctx.textBaseline = 'middle';
  lines.forEach((line, i) => c.ctx.fillText(line, 0, i * lh + lh / 2));
  return { dataUri: c.canvas.toDataURL('image/png'), width, height };
}

/**
 * 큰 날짜와 제목을 함렛 PNG로 그린다. 함렛을 확실히 쓸 수 없거나 그리다 실패하면 null(→ 메일은 글자로 나간다).
 * dateText는 메일과 같은 formatBigDate() 결과를 넘겨야 둘이 어긋나지 않는다.
 */
export async function renderPromoHeadlines(opts: { dateText: string; title: string; hasPoster?: boolean }): Promise<PromoHeadlines | null> {
  const dateText = opts.dateText.trim();
  const title = opts.title.trim();
  if (!dateText || !title || typeof document === 'undefined' || !document.fonts) return null;
  try {
    const family = resolveHahmletFamily();
    if (!family) return null;
    const dateFont = `${DATE_FONT.weight} ${DATE_FONT.size}px "${family}"`;
    const titleFont = `${TITLE_FONT.weight} ${TITLE_FONT.size}px "${family}"`;
    // 그릴 글자 그대로 넘겨야 그 글자가 든 조각(유니코드 범위) 파일을 받는다.
    const [dateOk, titleOk] = await Promise.all([ensureFont(dateFont, family, dateText), ensureFont(titleFont, family, title)]);
    if (!dateOk || !titleOk) return null;
    const date = drawDate(dateText, dateFont);
    const titleImg = drawTitle(title, titleFont, opts.hasPoster === false ? HEADLINE_MAX_W : TITLE_MAX_W_WITH_POSTER);
    if (!date || !titleImg) return null;
    return { date, title: titleImg };
  } catch (err) {
    console.error('promo headline render failed', err);
    return null;
  }
}
