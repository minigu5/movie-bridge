// lib/promoMailHtml.ts
// 홍보(초청) 메일 제목과 본문 HTML. 방향 "다 · 날짜가 먼저, 곧 상영": 큰 날짜 → 포스터와 제목 → 인사말 → 흰 버튼.
// 티켓 메일(lib/ticketMailHtml.ts)과 같은 어두운 바탕·빨강은 꼭 필요한 곳(상영까지 N일)만.
// 메일 앱 호환을 위해 table + 인라인 스타일만 쓴다. flex·position·background-image는 앱마다 깨진다.
// 의존성이 없는 순수 함수라 node --test lib/promoMailHtml.test.mjs 로 바로 검증한다.

export type PromoMovieInfo = {
  title?: string | null;
  venue?: string | null;
  /** "2026년 11월 14일 (토) 10:10 ~ 12:00" (관리자 폼이 만드는 형식). */
  date_string?: string | null;
  /** "YYYY-MM-DD". 있으면 상영 날짜는 이것을 먼저 쓴다. */
  db_date?: string | null;
  /** ISO 문자열(타임존 포함). */
  deadline_date?: string | null;
};

export type PromoMailParams = {
  movieInfo: PromoMovieInfo;
  baseUrl: string;
  /** 포스터를 cid:posterImage 로 첨부했는지. 아니면 제목 칸이 줄 전체를 쓴다. */
  hasPoster: boolean;
  /** "상영까지 N일" 기준 시각. 기본은 보내는 순간. */
  now?: Date;
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
  fg: '#F2F2F0',
  fg2: '#A1A1A6',
  fg3: '#8E8E93',
  muted: '#6E6E73',
  rule: '#1E1E21',
  red: '#E0443B',
};
// 큰 날짜·제목도 본문과 같은 고딕을 쓴다. Gmail 등은 웹 글꼴(함렛)을 막아 기기 명조로 바뀌면서
// 숫자와 한글 서체가 따로 놀아 깨져 보였다(2026-11-08). 기본 고딕은 어느 기기에서나 모양이 비슷하다.
const FONT = "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const POSTER_W = 168;
const POSTER_H = 239;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const KST_MS = 9 * 60 * 60 * 1000;

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "(광고)"는 정보통신망법상 제목 맨 앞에 와야 한다. */
export function buildPromoSubject(title?: string | null): string {
  const t = (title ?? '').trim();
  return t ? `(광고) [영화대교] 「${t}」 상영에 초대합니다` : `(광고) [영화대교] 상영에 초대합니다`;
}

export type Screening = {
  year: number | null;
  month: number;
  day: number;
  weekday: string | null;
  hour: number | null;
  minute: number | null;
};

/** date_string(+db_date)에서 상영 날짜·시각을 읽는다. 날짜를 못 읽으면 null. */
export function parseScreening(info: Pick<PromoMovieInfo, 'date_string' | 'db_date'>): Screening | null {
  const raw = (info.date_string ?? '').trim();
  const m = raw.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\(\s*([일월화수목금토])\s*\))?\s*(?:(\d{1,2}):(\d{2}))?/);
  const db = (info.db_date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m && !db) return null;
  const year = db ? Number(db[1]) : m?.[1] ? Number(m[1]) : null;
  const month = db ? Number(db[2]) : Number(m![2]);
  const day = db ? Number(db[3]) : Number(m![3]);
  const weekday = year ? WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] : m?.[4] ?? null;
  return {
    year, month, day, weekday,
    hour: m?.[5] ? Number(m[5]) : null,
    minute: m?.[6] ? Number(m[6]) : null,
  };
}

/** "11.14 토" */
export function formatBigDate(s: Screening): string {
  return `${s.month}.${s.day}${s.weekday ? ` ${s.weekday}` : ''}`;
}

/** 12시 전은 "아침 10시 10분", 이후는 "오후 2시". 0분이면 분을 뺀다. */
export function formatTimePhrase(hour: number, minute: number): string {
  const word = hour < 12 ? '아침' : '오후';
  const h = hour <= 12 ? hour : hour - 12;
  return `${word} ${h}시${minute ? ` ${minute}분` : ''}`;
}

/** 한국 날짜 기준 "상영까지 N일" / "내일 상영" / "오늘 상영". 지났거나 연도를 모르면 null. */
export function formatDday(s: Screening | null, now: Date): string | null {
  if (!s || !s.year) return null;
  const k = new Date(now.getTime() + KST_MS);
  const today = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  const n = Math.round((Date.UTC(s.year, s.month - 1, s.day) - today) / 86400000);
  if (Number.isNaN(n) || n < 0) return null;
  if (n === 0) return '오늘 상영';
  if (n === 1) return '내일 상영';
  return `상영까지 ${n}일`;
}

function partOfDay(hour: number): string {
  if (hour < 6) return '새벽';
  if (hour < 12) return '오전';
  if (hour < 18) return '오후';
  if (hour < 21) return '저녁';
  return '밤';
}

/**
 * 예매 마감(ISO) → "13일(금) 밤 11시" (한국 시간). 상영 달과 같으면 달을 뺀다.
 * 자정(00:00)은 전날 "밤 12시"로 쓴다(그날 안에 하라는 뜻이 잘 읽히게).
 */
export function formatDeadlineShort(deadline: string | null | undefined, screeningMonth = 0): string | null {
  if (!deadline) return null;
  const utc = new Date(deadline);
  if (Number.isNaN(utc.getTime())) return null;
  let kst = new Date(utc.getTime() + KST_MS);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  let label: string;
  if (hour === 0 && minute === 0) {
    kst = new Date(kst.getTime() - 60 * 1000);
    label = '밤 12시';
  } else {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    label = `${partOfDay(hour)} ${h}시${minute ? ` ${minute}분` : ''}`;
  }
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const wd = WEEKDAYS[kst.getUTCDay()];
  const date = month === screeningMonth ? `${day}일(${wd})` : `${month}월 ${day}일(${wd})`;
  return `${date} ${label}`;
}

export function shortVenue(venue: string | null | undefined): string {
  return (venue ?? '').replace(/^\s*대구과학고등학교\s*/, '').trim();
}

export function buildPromoMailHtml(p: PromoMailParams): string {
  const info = p.movieInfo;
  const title = (info.title ?? '').trim();
  const safeTitle = esc(title || '상영작 미정');
  const baseUrl = esc(p.baseUrl || '');
  const s = parseScreening(info);
  const dday = formatDday(s, p.now ?? new Date());
  const venue = shortVenue(info.venue);
  const timeLine = [s && s.hour !== null ? formatTimePhrase(s.hour, s.minute ?? 0) : '', venue].filter(Boolean).join(' · ');
  const deadline = formatDeadlineShort(info.deadline_date, s?.month ?? 0);

  const top = `<tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle"><img src="cid:logoH" width="100" height="39" alt="영화대교" style="display:block; border:0; width:100px; height:39px;" /></td>
      ${dday ? `<td valign="middle" align="right" style="text-align:right; font-size:12px; font-weight:700; letter-spacing:1.2px; color:${C.red}; white-space:nowrap;" data-dday>${dday}</td>` : ''}
    </tr></table>
  </td></tr>`;

  const bigDate = s || timeLine
    ? `<tr><td style="padding-top:22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-bottom:18px; border-bottom:1px solid ${C.fg};">
          ${s ? `<div style="font-family:${FONT}; font-size:64px; font-weight:800; line-height:1; letter-spacing:-2px; color:${C.fg}; font-variant-numeric:tabular-nums;">${esc(formatBigDate(s))}</div>` : ''}
          ${timeLine ? `<div style="padding-top:${s ? '4px' : '0'}; font-size:16px; line-height:1.5; color:${C.fg2};">${esc(timeLine)}</div>` : ''}
        </td>
      </tr></table>
    </td></tr>`
    : '';

  const titleBlock = `<div style="font-size:12px; color:${C.fg3};">이번 상영</div>
          <div style="padding-top:10px; font-family:${FONT}; font-size:24px; font-weight:700; line-height:1.2; color:${C.fg}; word-break:keep-all;">${safeTitle}</div>
          <div style="padding-top:10px; font-size:12px; color:${C.fg3};">관람 무료 · 선착순</div>`;

  const feature = `<tr><td style="padding-top:22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${p.hasPoster ? `<td width="${POSTER_W}" valign="bottom" style="width:${POSTER_W}px;"><img src="cid:${PROMO_POSTER_CID}" width="${POSTER_W}" height="${POSTER_H}" alt="${esc(title)}" style="display:block; width:${POSTER_W}px; height:${POSTER_H}px; object-fit:cover; border:0;" /></td>` : ''}
      <td valign="bottom" style="${p.hasPoster ? 'padding-left:18px; ' : ''}padding-bottom:4px;">
          ${titleBlock}
      </td>
    </tr></table>
  </td></tr>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>영화대교 상영 초대</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&amp;display=swap">
  <style>
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${C.bg}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr><td align="center" style="padding:0;">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="width:100%; max-width:440px; background-color:${C.bg}; font-family:${FONT}; color:${C.fg}; text-align:left;">
        <tr><td style="padding:32px 28px 28px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${top}
            ${bigDate}
            ${feature}
            <tr><td style="padding-top:22px; font-size:14px; line-height:1.7; color:${C.fg2}; word-break:keep-all;">${PROMO_GREETING[0]}<br>${PROMO_GREETING[1]}</td></tr>
            <tr><td style="padding-top:22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td align="center" bgcolor="${C.fg}" style="background-color:${C.fg};"><a href="${baseUrl}" style="display:block; padding:17px 0; background-color:${C.fg}; color:${C.bg}; font-size:16px; font-weight:700; text-align:center; text-decoration:none;">좌석 고르러 가기</a></td>
              </tr></table>
            </td></tr>
            ${deadline ? `<tr><td align="center" style="padding-top:12px; font-size:12px; color:${C.fg3}; text-align:center;">예매 마감 ${esc(deadline)}</td></tr>` : ''}
            <tr><td style="padding-top:22px;">
              <div style="border-top:1px solid ${C.rule}; padding-top:14px; font-size:11px; line-height:1.6; color:${C.muted}; word-break:keep-all;">광고성 정보 · 발신: ${esc(PROMO_SENDER_ORG)} · 더 받고 싶지 않으면 관리자에게 알려 주세요.</div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
