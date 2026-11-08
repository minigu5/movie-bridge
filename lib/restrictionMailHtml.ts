// lib/restrictionMailHtml.ts
// 예매 제한/해제 안내 메일 제목과 본문 HTML. 티켓 메일(lib/ticketMailHtml.ts)과 같은 어두운 바탕·가로 로고.
// 메일 앱 호환을 위해 table + 인라인 스타일만 쓴다. flex·position·background-image는 앱마다 깨진다.
// 의존성이 없는 순수 함수라 node --test lib/restrictionMailHtml.test.mjs 로 바로 검증한다.

export type RestrictionMailParams = {
  name: string;
  added: boolean;
  /** 관리자가 적은 사유. 비어 있으면 사유 줄을 뺀다. */
  reason?: string | null;
};

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

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildRestrictionSubject(added: boolean): string {
  return added ? '[영화대교] 예매 제한 안내' : '[영화대교] 예매 제한 해제 안내';
}

export function buildRestrictionMailHtml(p: RestrictionMailParams): string {
  const name = esc((p.name ?? '').trim());
  const reason = (p.reason ?? '').trim();

  const body = p.added
    ? `<tr><td style="padding:24px 22px 0 22px; font-size:17px; font-weight:700; line-height:1.5; color:${C.fg}; word-break:keep-all;">${name} 님, 당분간 영화대교 예매가 제한돼요.</td></tr>
    ${reason ? `<tr><td style="padding:18px 22px 0 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="44" valign="top" style="padding:12px 0; border-top:1px solid ${C.line}; font-size:13px; color:${C.fg3};" data-reason-row>사유</td>
        <td valign="top" style="padding:12px 0; border-top:1px solid ${C.line}; font-size:14px; line-height:1.6; color:${C.fg}; word-break:keep-all;">${esc(reason).replace(/\r?\n/g, '<br>')}</td>
      </tr></table>
    </td></tr>` : ''}
    <tr><td style="padding:${reason ? '6px' : '14px'} 22px 24px 22px; font-size:13px; line-height:1.6; color:${C.fg2}; word-break:keep-all;">문의는 영화대교 동아리로 연락해 주세요.</td></tr>`
    : `<tr><td style="padding:24px 22px 0 22px; font-size:17px; font-weight:700; line-height:1.5; color:${C.fg}; word-break:keep-all;">${name} 님, 다시 영화대교 예매를 할 수 있어요.</td></tr>
    <tr><td style="padding:14px 22px 24px 22px; font-size:13px; line-height:1.6; color:${C.fg2}; word-break:keep-all;">다음 상영에서 반갑게 만나요.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>영화대교 안내</title>
  <style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:${C.bg}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr><td align="center" style="padding:40px 12px;">
      <table role="presentation" width="400" cellpadding="0" cellspacing="0" style="width:100%; max-width:400px; font-family:${FONT}; color:${C.fg};">
        <tr><td align="center"><img src="cid:logoH" width="150" height="58" alt="영화대교" style="display:block; border:0; width:150px; height:58px;" /></td></tr>
        <tr><td style="padding-top:28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="background-color:${C.card}; border-radius:16px;">
            ${body}
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:36px;">
          <div style="border-top:1px solid ${C.line}; padding-top:18px; font-size:12px; letter-spacing:1px; color:${C.muted};">영화대교 · 중강당 상영관</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
