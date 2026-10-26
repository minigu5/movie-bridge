// lib/ticketBackgroundCanvas.ts
// 관리자 브라우저에서 티켓 카드의 "outer 배경"(블러 확산 배경 + 로고 + 카드
// 프레임 + 절취선, 텍스트는 없음)을 미리 JPEG로 합성한다. 이 무거운 합성을
// 이메일 발송 시점(Cloudflare Workers, CPU 예산 있음)이 아니라 관리자가 포스터를
// 등록할 때 브라우저(CPU 무제한)에서 한 번만 처리해서, 발송 시엔 이 JPEG 위에
// app/api/ticket/route.ts가 순수 이메일 HTML로 텍스트만 오버레이하면 되게 한다.
// 레이아웃 상수는 route.ts의 DISPLAY_* 좌표 계산과 반드시 일치해야 한다.

const CARD_WIDTH = 700;
const CARD_HEIGHT = 960;
const SIDE_MARGIN = 140;
const TOP_MARGIN = 90;
const LOGO_BLOCK_HEIGHT = 170;
const BOTTOM_MARGIN = 90;
const OUTER_WIDTH = CARD_WIDTH + SIDE_MARGIN * 2;
const OUTER_HEIGHT = TOP_MARGIN + LOGO_BLOCK_HEIGHT + CARD_HEIGHT + BOTTOM_MARGIN;
const SCALLOP_COUNT = 13;
const CARD_RADIUS = 28;
const SCALE = 2;

// 카드 영역은 700px 폭(SCALE 적용 시 1400px)이라 이보다 훨씬 작은 포스터는
// 확대되면서 눈에 띄게 뭉개진다. 나무위키는 Cloudflare Workers 발신 요청에
// 200x285 썸네일만 돌려줘서 "포스터 주소로 배경 생성"이 이 함정에 걸린다.
export const MIN_POSTER_WIDTH = 400;

export type TicketBackgroundResult = { blob: Blob; posterWidth: number; posterHeight: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    img.src = src;
  });
}

async function ensureSongMyungFont(): Promise<void> {
  if (!document.getElementById('song-myung-font-link')) {
    const link = document.createElement('link');
    link.id = 'song-myung-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Song+Myung&display=swap';
    document.head.appendChild(link);
  }
  await document.fonts.load('700 34px "Song Myung"');
  await document.fonts.ready;
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** object-fit: cover를 흉내 낸다 — 이미지 종횡비를 유지한 채 대상 영역을 꽉 채운다. */
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (imgRatio > targetRatio) {
    sw = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / targetRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawEdgeGradients(ctx: CanvasRenderingContext2D): void {
  const topH = TOP_MARGIN + LOGO_BLOCK_HEIGHT * 0.6;
  const top = ctx.createLinearGradient(0, 0, 0, topH);
  top.addColorStop(0, '#0a0a0a');
  top.addColorStop(1, 'rgba(11,17,32,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, OUTER_WIDTH, topH);

  const bottomH = BOTTOM_MARGIN + 60;
  const bottom = ctx.createLinearGradient(0, OUTER_HEIGHT - bottomH, 0, OUTER_HEIGHT);
  bottom.addColorStop(0, 'rgba(11,17,32,0)');
  bottom.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, OUTER_HEIGHT - bottomH, OUTER_WIDTH, bottomH);

  const sideW = SIDE_MARGIN + 60;
  const left = ctx.createLinearGradient(0, 0, sideW, 0);
  left.addColorStop(0, '#0a0a0a');
  left.addColorStop(1, 'rgba(11,17,32,0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, sideW, OUTER_HEIGHT);

  const right = ctx.createLinearGradient(OUTER_WIDTH - sideW, 0, OUTER_WIDTH, 0);
  right.addColorStop(0, 'rgba(11,17,32,0)');
  right.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = right;
  ctx.fillRect(OUTER_WIDTH - sideW, 0, sideW, OUTER_HEIGHT);
}

function drawLogo(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.font = '700 34px "Song Myung"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5f5f5';
  ctx.shadowColor = 'rgba(255,255,255,0.25)';
  ctx.shadowBlur = 18;
  const cx = OUTER_WIDTH / 2;
  const cy = TOP_MARGIN + LOGO_BLOCK_HEIGHT / 2;
  ctx.fillText('영화', cx, cy - 24);
  ctx.fillText('대교', cx, cy + 24);
  ctx.restore();
}

function drawCardFrame(ctx: CanvasRenderingContext2D, poster: HTMLImageElement, cardLeft: number, cardTop: number): void {
  // 그림자는 클리핑 전에 별도로 그린다 (클립 안에서는 shadow가 카드 내부에 안 보임).
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#161616';
  drawRoundedRectPath(ctx, cardLeft, cardTop, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRectPath(ctx, cardLeft, cardTop, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
  ctx.clip();

  ctx.fillStyle = '#161616';
  ctx.fillRect(cardLeft, cardTop, CARD_WIDTH, CARD_HEIGHT);
  drawImageCover(ctx, poster, cardLeft, cardTop, CARD_WIDTH, CARD_HEIGHT);

  const grad = ctx.createLinearGradient(0, cardTop, 0, cardTop + CARD_HEIGHT);
  grad.addColorStop(0, 'rgba(22,27,38,0)');
  grad.addColorStop(0.3, 'rgba(22,27,38,0.05)');
  grad.addColorStop(0.5, 'rgba(22,27,38,0.35)');
  grad.addColorStop(0.68, 'rgba(22,27,38,0.72)');
  grad.addColorStop(0.85, 'rgba(22,27,38,0.9)');
  grad.addColorStop(1, 'rgba(22,27,38,0.97)');
  ctx.fillStyle = grad;
  ctx.fillRect(cardLeft, cardTop, CARD_WIDTH, CARD_HEIGHT);

  ctx.restore();
}

/**
 * 카드 아래쪽 가장자리를 반원 모양으로 "뚫어서" 절취선처럼 보이게 한다.
 * 원을 아무 색으로 칠하면(예전 고정 단색, 그다음 반투명 검정 덧칠) 구멍
 * 자리만 카드/배경 그라데이션 흐름과 끊긴 채 붕 떠 보였다. 진짜 뚫린 것처럼
 * 보이려면 그 자리의 그라데이션이 끊기지 않고 그대로 이어져야 하므로,
 * 카드를 그리기 *전* 배경(블러+비네트+로고)만 있는 상태를 bgSnapshot으로
 * 떠 둔 뒤, 카드를 다 그린 다음 구멍 모양으로 클리핑해서 그 스냅샷을 다시
 * 얹어 되돌린다 — 카드에 실제로 원형 구멍이 뚫려 뒤 배경이 비치는 것과
 * 동일한 결과다. 가장자리만 옅은 그림자를 살짝 둘러 홈이 파인 형태임을
 * 알아볼 수 있게 한다.
 */
function drawScallops(
  ctx: CanvasRenderingContext2D,
  cardLeft: number,
  cardTop: number,
  bgSnapshot: HTMLCanvasElement,
): void {
  const radius = 14;
  const padding = 16;
  const areaWidth = CARD_WIDTH - padding * 2;
  const gap = SCALLOP_COUNT > 1 ? areaWidth / (SCALLOP_COUNT - 1) : 0;
  const cy = cardTop + CARD_HEIGHT;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < SCALLOP_COUNT; i++) {
    const cx = cardLeft + padding + gap * i;
    ctx.moveTo(cx + radius, cy);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  }
  ctx.clip();
  ctx.drawImage(bgSnapshot, 0, 0, OUTER_WIDTH, OUTER_HEIGHT);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < SCALLOP_COUNT; i++) {
    const cx = cardLeft + padding + gap * i;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * posterUrl(원본 포스터 주소)로부터 텍스트 없는 티켓 카드 배경 JPEG(980×1310, SCALE 적용 시 실제 픽셀은 그 2배)를
 * 만들어 Blob으로 반환한다. same-origin 프록시(/api/poster-image)를 거치므로
 * CORS로 canvas가 오염되지 않는다.
 */
export async function renderTicketBackground(posterUrl: string): Promise<TicketBackgroundResult> {
  const poster = await loadImage(`/api/poster-image?src=${encodeURIComponent(posterUrl)}`);
  return renderTicketBackgroundFromImage(poster);
}

/**
 * 포스터 원본 호스트가 서버(Cloudflare Workers) 발신 요청을 막아 프록시 fetch가
 * 안 되는 경우(예: img.movist.com), 관리자가 로컬에 내려받은 포스터 파일을 직접
 * 올려 같은 결과물을 만들 수 있게 한다. File은 브라우저에서 바로 디코딩하므로
 * 프록시/네트워크를 거치지 않는다.
 */
export async function renderTicketBackgroundFromFile(file: File): Promise<TicketBackgroundResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const poster = await loadImage(objectUrl);
    return await renderTicketBackgroundFromImage(poster);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderTicketBackgroundFromImage(poster: HTMLImageElement): Promise<TicketBackgroundResult> {
  await ensureSongMyungFont();

  const canvas = document.createElement('canvas');
  canvas.width = OUTER_WIDTH * SCALE;
  canvas.height = OUTER_HEIGHT * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context를 가져올 수 없습니다.');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, OUTER_WIDTH, OUTER_HEIGHT);

  ctx.save();
  ctx.filter = 'blur(70px) brightness(0.7) saturate(1.6)';
  drawImageCover(ctx, poster, -80, -80, OUTER_WIDTH + 160, OUTER_HEIGHT + 160);
  ctx.restore();

  ctx.fillStyle = 'rgba(11,17,32,0.15)';
  ctx.fillRect(0, 0, OUTER_WIDTH, OUTER_HEIGHT);

  drawEdgeGradients(ctx);
  drawLogo(ctx);

  // 카드를 그리기 전 배경만 있는 상태를 떠 둔다 — drawScallops가 이걸로
  // 구멍 자리에 카드 밑 배경 그라데이션을 그대로 되살린다.
  const bgSnapshot = document.createElement('canvas');
  bgSnapshot.width = canvas.width;
  bgSnapshot.height = canvas.height;
  const bgSnapshotCtx = bgSnapshot.getContext('2d');
  if (!bgSnapshotCtx) throw new Error('Canvas 2D context를 가져올 수 없습니다.');
  bgSnapshotCtx.drawImage(canvas, 0, 0);

  const cardLeft = SIDE_MARGIN;
  const cardTop = TOP_MARGIN + LOGO_BLOCK_HEIGHT;
  drawCardFrame(ctx, poster, cardLeft, cardTop);
  drawScallops(ctx, cardLeft, cardTop, bgSnapshot);

  // 알파 채널을 안 쓰므로(절취선 구멍도 위에서 배경 스냅샷을 되살려 직접
  // 칠한다) 카드는 전체가 불투명하다 — 무손실 PNG 대신 JPEG로 인코딩하면
  // 이메일 첨부 용량이 크게 줄어 수신자 메일 클라이언트에서 이미지가 더
  // 빨리 뜬다.
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) reject(new Error('이미지 생성에 실패했습니다.'));
      else resolve(result);
    }, 'image/jpeg', 0.87);
  });
  return { blob, posterWidth: poster.naturalWidth, posterHeight: poster.naturalHeight };
}

/**
 * 원본 포스터를 same-origin 프록시(/api/poster-image)로 받아 data URI로 반환한다.
 * 이 프록시 fetch는 서버(프로덕션에선 Cloudflare Workers)에서 일어나며 원본
 * 호스트가 간헐적으로 실패할 수 있으므로, 실패 시 호출부에서 재시도하게 한다.
 * 여기서 받은 data URI는 Cloudinary에 올려 안정적인 URL로 저장한다.
 */
export async function fetchPosterDataUri(posterUrl: string): Promise<string> {
  const res = await fetch(`/api/poster-image?src=${encodeURIComponent(posterUrl)}`);
  if (!res.ok) throw new Error(`포스터를 불러오지 못했습니다 (${res.status})`);
  return blobToDataUri(await res.blob());
}

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('이미지 인코딩에 실패했습니다.'));
    reader.readAsDataURL(blob);
  });
}
