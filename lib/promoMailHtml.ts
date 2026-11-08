// lib/promoMailHtml.ts
// 홍보(초청) 메일 제목과 본문 HTML. 티켓 메일(lib/ticketMailHtml.ts)과 같은 어두운 바탕·흰 버튼·가로 로고를 쓴다.
// 메일 앱 호환을 위해 table + 인라인 스타일만 쓴다. flex·position·background-image는 앱마다 깨진다.
// 의존성이 없는 순수 함수라 node --test lib/promoMailHtml.test.mjs 로 바로 검증한다.

export type PromoMovieInfo = {
  title?: string | null;
  venue?: string | null;
  /** "2026년 11월 14일 (토) 10:10 ~ 12:00" (관리자 폼이 만드는 형식). 형식이 다르면 그대로 쓴다. */
  date_string?: string | null;
  /** ISO 문자열(타임존 포함). */
  deadline_date?: string | null;
};

export type PromoMailParams = {
  movieInfo: PromoMovieInfo;
  baseUrl: string;
  /** 포스터를 cid:posterImage 로 첨부했는지. 아니면 포스터 칸을 아예 뺀다. */
  hasPoster: boolean;
};

export const PROMO_POSTER_CID = 'posterImage';

// 발신 주체 정보 (정보통신망법 광고성 정보 표시 의무).
export const PROMO_SENDER_ORG = '대구과학고등학교 자율동아리 영화대교';

export const PROMO_GREETING = [
  '안녕하세요, 대구과학고 자율동아리 영화대교예요.',
  '외출주 토요일 아침마다 강당을 극장으로 바꿔 함께 영화를 봐요.',
] as const;

const C = {
  bg: '#0F0F10',
  card: '#18181A',
  fg: '#F2F2F0',
  fg2: '#A1A1A6',
  fg3: '#8E8E93',
  muted: '#6E6E73',
  line: '#2A2A2E',
};
const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const POSTER_W = 200;

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "(광고)"는 정보통신망법상 제목 맨 앞에 와야 한다. */
export function buildPromoSubject(title?: string | null): string {
  const t = (title ?? '').trim();
  return t ? `(광고) [영화대교] 「${t}」 상영에 초대합니다` : `(광고) [영화대교] 상영에 초대합니다`;
}

function clock12(hour: number, minute: number): string {
  const ampm = hour < 12 ? '오전' : '오후';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${ampm} ${h}:${String(minute).padStart(2, '0')}`;
}

type ParsedDate = { month: number; text: string };

/** "2026년 11월 14일 (토) 10:10 ~ 12:00" → { month: 11, text: "11월 14일(토) 오전 10:10" }. 못 읽으면 원문. */
export function formatScreeningShort(dateString: string | null | undefined): ParsedDate | null {
  const raw = (dateString ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/(?:\d{4}\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\(\s*([일월화수목금토])\s*\))?\s*(?:(\d{1,2}):(\d{2}))?/);
  if (!m) return { month: 0, text: raw };
  const month = Number(m[1]);
  let text = `${month}월 ${Number(m[2])}일`;
  if (m[3]) text += `(${m[3]})`;
  if (m[4]) text += ` ${clock12(Number(m[4]), Number(m[5]))}`;
  return { month, text };
}

function partOfDay(hour: number): string {
  if (hour < 6) return '새벽';
  if (hour < 12) return '오전';
  if (hour < 18) return '오후';
  if (hour < 21) return '저녁';
  return '밤';
}

/**
 * 예매 마감(ISO) → "13일 밤 11시" (한국 시간). 상영 달과 같으면 달을 뺀다.
 * 자정(00:00)은 전날 "밤 12시"로 쓴다(그날 안에 하라는 뜻이 잘 읽히게).
 */
export function formatDeadlineShort(deadline: string | null | undefined, screeningMonth = 0): string | null {
  if (!deadline) return null;
  const utc = new Date(deadline);
  if (Number.isNaN(utc.getTime())) return null;
  let kst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
  let hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  let label: string;
  if (hour === 0 && minute === 0) {
    kst = new Date(kst.getTime() - 60 * 1000);
    hour = 24;
    label = '밤 12시';
  } else {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    label = `${partOfDay(hour)} ${h}시${minute ? ` ${minute}분` : ''}`;
  }
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const date = month === screeningMonth ? `${day}일` : `${month}월 ${day}일`;
  return `${date} ${label}`;
}

export function shortVenue(venue: string | null | undefined): string {
  return (venue ?? '').replace(/^\s*대구과학고등학교\s*/, '').trim();
}

/** "11월 14일(토) 오전 10:10 · 중강당 · 예매 마감 13일 밤 11시". 없는 부분은 뺀다. */
export function buildPromoInfoLine(info: PromoMovieInfo): string {
  const when = formatScreeningShort(info.date_string);
  const venue = shortVenue(info.venue);
  const deadline = formatDeadlineShort(info.deadline_date, when?.month ?? 0);
  return [when?.text, venue, deadline ? `예매 마감 ${deadline}` : '']
    .filter((s): s is string => !!s)
    .join(' · ');
}

export function buildPromoMailHtml(p: PromoMailParams): string {
  const title = (p.movieInfo.title ?? '').trim();
  const safeTitle = esc(title || '상영작 미정');
  const infoLine = buildPromoInfoLine(p.movieInfo);
  const baseUrl = esc(p.baseUrl || '');

  const poster = p.hasPoster
    ? `<tr><td align="center" style="padding:24px 20px 0 20px;"><img src="cid:${PROMO_POSTER_CID}" width="${POSTER_W}" alt="${esc(title)}" style="display:block; width:${POSTER_W}px; height:auto; border:0; border-radius:8px;" /></td></tr>`
    : '';

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="background-color:${C.card}; border-radius:16px;">
    ${poster}
    <tr><td align="center" style="padding:20px 20px 0 20px; font-size:22px; font-weight:900; line-height:1.3; letter-spacing:-0.4px; color:${C.fg}; word-break:keep-all;">${safeTitle}</td></tr>
    ${infoLine ? `<tr><td align="center" style="padding:10px 20px 0 20px; font-size:13px; line-height:1.6; color:${C.fg2}; font-variant-numeric:tabular-nums; word-break:keep-all;">${esc(infoLine)}</td></tr>` : ''}
    <tr><td align="center" style="padding:22px 20px 24px 20px;">
      <a href="${baseUrl}" style="display:inline-block; background-color:${C.fg}; color:${C.bg}; padding:13px 28px; border-radius:8px; font-size:14px; font-weight:700; text-decoration:none;">좌석 예매하기</a>
    </td></tr>
  </table>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>영화대교 상영 초대</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${C.bg}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="400" cellpadding="0" cellspacing="0" style="width:100%; max-width:400px; font-family:${FONT}; color:${C.fg};">
        <tr><td align="center"><img src="cid:logoH" width="150" height="58" alt="영화대교" style="display:block; border:0; width:150px; height:58px;" /></td></tr>
        <tr><td align="center" style="padding-top:28px; font-size:14px; line-height:1.7; color:${C.fg}; word-break:keep-all;">${PROMO_GREETING[0]}<br>${PROMO_GREETING[1]}</td></tr>
        <tr><td style="padding-top:20px;">${card}</td></tr>
        <tr><td align="center" style="padding-top:32px;">
          <div style="border-top:1px solid ${C.line}; padding-top:16px; font-size:11px; line-height:1.7; color:${C.muted}; word-break:keep-all;">
            이 메일은 영화대교 상영작을 알리는 광고성 정보예요.<br>
            발신: ${esc(PROMO_SENDER_ORG)}<br>
            더 받고 싶지 않으면 관리자에게 알려 주세요. 발송 대상에서 빼 드려요.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
