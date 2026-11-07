// lib/ticketMailHtml.ts
// 티켓 메일 본문 HTML. 상태와 상관없이 언제나 같은 레이아웃이다(예전에는 배경 템플릿/포스터/없음 3갈래라 회차마다 모양이 달랐다).
// 메일 앱 호환을 위해 table + 인라인 스타일만 쓴다. flex·position·background-image는 앱마다 깨진다.
// 의존성이 없는 순수 함수라 node --test lib/ticketMailHtml.test.mjs 로 바로 검증한다.
// 디자인: docs/superpowers/specs/2026-11-07-brand-stage2-tickets-design.md

export type TicketMailStatus = 'confirmed' | 'pending' | 'changed' | 'canceled';

export type TicketMailView = {
  status: TicketMailStatus;
  displayId: string;
  movieTitle: string;
  ageRating: string;
  movieDate: string;
  venue: string;
  /** 팝콘 종류별 한 줄씩. 비어 있으면 팝콘 줄을 뺀다. */
  popcornLines: string[];
  priceText: string;
  seat: string;
  name: string;
  /** 포스터를 cid:poster 로 첨부했는지. 아니면 같은 크기의 빈 칸을 둔다. */
  hasPoster: boolean;
  totalPrice: number;
  baseUrl: string;
  account: string;
};

export const TICKET_POSTER_CID = 'poster';

const C = {
  bg: '#0F0F10',
  card: '#18181A',
  posterEmpty: '#26262A',
  fg: '#F2F2F0',
  fg2: '#A1A1A6',
  fg3: '#8E8E93',
  muted: '#6E6E73',
  line: '#2A2A2E',
  dash: '#3A3A40',
  red: '#E0443B',
};
const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const POSTER_W = 104;
const POSTER_H = 148;

const STATUS: Record<TicketMailStatus, { line: string; lineColor: string; stamp: string; stampColor: string; note: string }> = {
  confirmed: { line: '예매가 확정되었어요', lineColor: C.fg, stamp: '확정', stampColor: C.red, note: '상영 당일 이 화면을 보여주세요' },
  changed: { line: '좌석이 바뀌었어요', lineColor: C.fg, stamp: '변경', stampColor: C.red, note: '상영 당일 이 화면을 보여주세요' },
  pending: { line: '입금을 기다리고 있어요', lineColor: C.fg, stamp: '입금 대기', stampColor: C.fg2, note: '입금이 확인되면 확정 메일을 보내요' },
  canceled: { line: '예매가 취소되었어요', lineColor: C.fg2, stamp: '취소', stampColor: C.muted, note: '이 좌석은 다른 분이 예매할 수 있어요' },
};

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function infoRow(label: string, valueHtml: string, first: boolean): string {
  return `<tr>
    <td width="52" valign="top" style="padding:11px 0; border-top:1px solid ${first ? C.fg : C.line}; font-size:13px; color:${C.fg3};">${label}</td>
    <td valign="top" style="padding:11px 0; border-top:1px solid ${first ? C.fg : C.line}; font-size:14px; font-weight:500; color:${C.fg};">${valueHtml}</td>
  </tr>`;
}

export function buildTicketMailHtml(v: TicketMailView): string {
  const s = STATUS[v.status];
  const canceled = v.status === 'canceled';
  const baseUrl = esc(v.baseUrl);

  const poster = v.hasPoster
    ? `<img src="cid:${TICKET_POSTER_CID}" width="${POSTER_W}" alt="" style="display:block; width:${POSTER_W}px; height:auto; border:0; border-radius:6px;" />`
    : `<table role="presentation" width="${POSTER_W}" cellpadding="0" cellspacing="0" data-poster-placeholder><tr><td width="${POSTER_W}" height="${POSTER_H}" bgcolor="${C.posterEmpty}" style="width:${POSTER_W}px; height:${POSTER_H}px; background-color:${C.posterEmpty}; border-radius:6px;">&nbsp;</td></tr></table>`;

  const rows = [
    infoRow('일시', esc(v.movieDate), true),
    v.venue ? infoRow('장소', esc(v.venue), false) : '',
    v.popcornLines.length ? infoRow('팝콘', v.popcornLines.map(esc).join('<br>'), false) : '',
    infoRow('결제', `<span style="font-variant-numeric:tabular-nums;">${esc(v.priceText)}</span>`, false),
  ].join('');

  const seatStyle = canceled
    ? `font-size:54px; font-weight:900; line-height:1; letter-spacing:-1px; font-variant-numeric:tabular-nums; color:${C.muted}; text-decoration:line-through`
    : `font-size:54px; font-weight:900; line-height:1; letter-spacing:-1px; font-variant-numeric:tabular-nums; color:${C.red}`;

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="background-color:${C.card}; border-radius:16px;">
    <tr><td style="padding:14px 20px 0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px; font-weight:700; letter-spacing:4px; color:${C.fg3};">입장권</td>
        <td align="right" style="font-size:11px; letter-spacing:1px; color:${C.fg3}; font-variant-numeric:tabular-nums;">판매번호 ${esc(v.displayId)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:14px 20px 20px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="${POSTER_W}" valign="bottom" style="width:${POSTER_W}px;">${poster}</td>
        <td valign="bottom" style="padding-left:16px;">
          <div style="font-size:22px; font-weight:900; line-height:1.25; letter-spacing:-0.4px; color:${C.fg};">${esc(v.movieTitle)}</div>
          <div style="font-size:13px; color:${C.fg2}; margin-top:6px;">2D · ${esc(v.ageRating || '전체관람가')}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </td></tr>
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="14" style="width:14px; line-height:0; font-size:0;"><img src="cid:notchL" width="14" height="28" alt="" style="display:block; border:0;" /></td>
        <td valign="middle" style="padding:0 6px;"><div style="border-top:2px dashed ${C.dash}; height:0; line-height:0; font-size:0;">&nbsp;</div></td>
        <td width="14" style="width:14px; line-height:0; font-size:0;"><img src="cid:notchR" width="14" height="28" alt="" style="display:block; border:0;" /></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:2px 20px 22px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="bottom">
          <div style="font-size:12px; color:${C.fg3};">좌석</div>
          <div style="${seatStyle}">${esc(v.seat)}</div>
        </td>
        <td valign="bottom" align="right" style="text-align:right;">
          <span style="display:inline-block; transform:rotate(-8deg); border:2px solid ${s.stampColor}; border-radius:6px; padding:2px 10px; margin-bottom:6px; font-size:14px; font-weight:900; letter-spacing:3px; color:${s.stampColor}">${s.stamp}</span>
          <div style="font-size:16px; font-weight:700; color:${C.fg};">${esc(v.name)} 님</div>
          <div style="font-size:12px; color:${C.fg3}; margin-top:4px;">${s.note}</div>
        </td>
      </tr></table>
    </td></tr>
  </table>`;

  const payment = v.status === 'pending'
    ? `<tr><td style="padding-top:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="background-color:${C.card}; border-radius:16px;">
          <tr><td align="center" style="padding:22px 20px 0 20px; font-size:15px; font-weight:700; color:${C.fg};">30분 안에 입금해 주세요 · <span style="font-variant-numeric:tabular-nums;">${v.totalPrice.toLocaleString('ko-KR')}원</span></td></tr>
          <tr><td align="center" style="padding:16px 20px;"><img src="${baseUrl}/qr.jpeg" alt="송금 QR" width="148" height="148" style="display:block; border:0; border-radius:10px;" /></td></tr>
          <tr><td style="padding:0 20px 20px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};"><tr>
              <td style="padding-top:14px;">
                <div style="font-size:11px; letter-spacing:2px; color:${C.fg3};">계좌</div>
                <div style="font-size:14px; font-weight:700; color:${C.fg}; font-variant-numeric:tabular-nums;">${esc(v.account)}</div>
              </td>
              <td align="right" valign="bottom" style="padding-top:14px; white-space:nowrap;"><span style="font-size:11px; color:${C.fg2}; border:1px solid ${C.dash}; border-radius:6px; padding:4px 8px;">길게 눌러 복사</span></td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  const cta = canceled
    ? ''
    : `<tr><td align="center" style="padding-top:28px;">
        <div style="font-size:13px; color:${C.fg2}; margin-bottom:14px;">예매 확인이나 변경은 웹사이트에서 할 수 있어요.</div>
        <a href="${baseUrl}" style="display:inline-block; background-color:${C.fg}; color:${C.bg}; padding:13px 24px; border-radius:8px; font-size:14px; font-weight:700; text-decoration:none;">웹사이트에서 확인하기</a>
      </td></tr>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>영화대교 티켓</title>
  <style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:${C.bg}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="400" cellpadding="0" cellspacing="0" style="width:100%; max-width:400px; font-family:${FONT}; color:${C.fg};">
        <tr><td align="center"><img src="cid:logoH" width="150" height="58" alt="영화대교" style="display:block; border:0; width:150px; height:58px;" /></td></tr>
        <tr><td align="center" style="padding-top:28px; font-size:14px; font-weight:700; color:${s.lineColor};">${s.line}</td></tr>
        <tr><td style="padding-top:16px;">${card}</td></tr>
        ${payment}
        ${cta}
        <tr><td align="center" style="padding-top:36px;">
          <div style="border-top:1px solid ${C.line}; padding-top:18px; font-size:12px; letter-spacing:1px; color:${C.muted};">영화대교 · 중강당 상영관</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
