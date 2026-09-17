import { NextResponse } from 'next/server';
import { sendMail } from '@/lib/mailer';
import { escapeHtml } from '@/lib/escapeHtml';
import { fetchSafeImage } from '@/lib/safeImageFetch';
import { emailIconImg, emailIconAttachment } from '@/lib/emailIcons';

// lib/ticketBackgroundCanvas.ts가 만드는 템플릿의 레이아웃과 반드시 일치해야 한다.
const DISPLAY_CARD_WIDTH = 380;
const DISPLAY_CARD_HEIGHT = 521;
const DISPLAY_CARD_TOP = 141;
const DISPLAY_CARD_LEFT = 76;
const DISPLAY_OUTER_WIDTH = 532;
const DISPLAY_OUTER_HEIGHT = 711;
const DISPLAY_CARD_RIGHT_GAP = DISPLAY_OUTER_WIDTH - DISPLAY_CARD_LEFT - DISPLAY_CARD_WIDTH;

function buildCardContentHtml(params: {
  displayId: string;
  movieTitle: string;
  ageRating: string;
  movieDate: string;
  venue: string;
  popcornText: string;
  priceText: string;
  seat: string;
  name: string;
  statusType: string;
  badgeColor: string;
  badgeText: string;
}): string {
  const { displayId, movieTitle, ageRating, movieDate, venue, popcornText, priceText, seat, name, statusType, badgeColor, badgeText } = params;
  return `
    <span style="display:inline-block; background-color:rgba(0,0,0,0.45); padding:4px 10px; border-radius:7px; color:#e5e5e5; font-size:12px; font-weight:600; font-variant-numeric: tabular-nums;">판매번호 ${displayId}</span>
    <div style="color:#ffffff; font-size:25px; font-weight:800; line-height:1.25; text-shadow:0 2px 8px rgba(0,0,0,0.6); margin-top:119px; margin-bottom:7px;">${movieTitle}</div>
    <div style="color:#d4d4d4; font-size:13px; font-weight:600; text-shadow:0 2px 6px rgba(0,0,0,0.6); margin-bottom:20px;">2D · ${ageRating || '전체관람가'}</div>
    <div style="margin-bottom:17px;">
      <div style="color:#f5f5f5; font-size:16px; font-weight:700; text-shadow:0 2px 6px rgba(0,0,0,0.6); font-variant-numeric: tabular-nums;">${movieDate}</div>
      ${venue ? `<div style="color:#e5e5e5; font-size:14px; font-weight:600; text-shadow:0 2px 6px rgba(0,0,0,0.6); margin-top:4px;">${venue}</div>` : ''}
    </div>
    <div style="background-color:rgba(0,0,0,0.42); padding:13px 15px; border-radius:11px; margin-bottom:20px;">
      <div style="color:#e5e5e5; font-size:14px; font-weight:600;">${popcornText}</div>
      <div style="color:#a3a3a3; font-size:13px; font-weight:700; margin-top:4px; font-variant-numeric: tabular-nums;">결제 금액 ${priceText}</div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:bottom;">
        <span style="font-size:48px; font-weight:800; color:#ff5a1f; text-decoration:${statusType === 'canceled' ? 'line-through' : 'none'}; line-height:1; font-variant-numeric: tabular-nums;">${seat}</span>
        <span style="color:#e5e5e5; font-size:14px; font-weight:600; text-shadow:0 2px 4px rgba(0,0,0,0.6); margin-left:9px;">${name} 님</span>
      </td>
      <td style="vertical-align:bottom; text-align:right; white-space:nowrap;">
        <span style="display:inline-block; padding:4px 10px; background-color:rgba(0,0,0,0.5); border-radius:7px; font-weight:700; font-size:12px; color:${badgeColor}; border:1px solid ${badgeColor};">${badgeText}</span>
      </td>
    </tr></table>
  `;
}

export async function POST(req: Request) {
  try {
    const { email, name, seat, movieTitle, movieDate, venue, ageRating, posterUrl, backgroundTemplateUrl, statusType, popcorn, ticketId, baseUrl, isRefundNeeded } = await req.json();

    // 🌟 [추가됨] 다중 팝콘 분석 및 총액 계산
    const popcornArray = popcorn && popcorn !== 'none' ? popcorn.split(',') :[];
    const totalPrice = popcornArray.length * 2500;
    const formattedPrice = totalPrice.toLocaleString();

    let badgeColor = '#34d399'; let badgeText = '예매 완료';
    let priceText = '0 원 (무료)'; let subject = `[영화대교] ${name}님의 티켓 예매 안내 - ${seat} 좌석`;

    if (statusType === 'pending') {
      badgeColor = '#fbbf24'; badgeText = '결제 대기중'; priceText = `${formattedPrice} 원`;
    } else if (statusType === 'changed') {
      badgeColor = '#60a5fa'; badgeText = '좌석 변경됨';
      subject = `[영화대교] ${name}님의 좌석 변경 안내 - ${seat} 좌석`;
      priceText = popcornArray.length > 0 ? `${formattedPrice} 원` : '0 원 (무료)';
    } else if (statusType === 'canceled') {
      badgeColor = '#f87171'; badgeText = '예매 취소됨';
      subject = `[영화대교] ${name}님의 예매 취소 안내`;
      if (popcornArray.length > 0) {
        priceText = isRefundNeeded ? `${formattedPrice} 원 (환불 요망)` : `${formattedPrice} 원 (미결제 취소)`;
      } else {
        priceText = '0 원 (무료)';
      }
    } else {
      if(popcornArray.length > 0) priceText = `${formattedPrice} 원 (결제완료)`;
    }

    // 🌟 [추가됨] 팝콘 종류별 개수 요약 생성 (예: 오리지널 버터 2개, 카라멜맛 1개)
    const popcornNames: Record<string, string> = { original: '오리지널 버터 팝콘', consomme: '콘소메맛 팝콘', caramel: '카라멜맛 팝콘' };
    let popcornText = '음료/팝콘 없음';

    if (popcornArray.length > 0) {
      const counts: Record<string, number> = {};
      popcornArray.forEach((p: string) => { counts[p] = (counts[p] || 0) + 1; });
      popcornText = Object.entries(counts).map(([key, count]) => `${emailIconImg('popcornGray', 13)} ${popcornNames[key]} ${count}개`).join('<br/>');
    }

    const displayId = ticketId ? ticketId.split('-')[0].toUpperCase() : 'UNKNOWN';

    const templateImage = backgroundTemplateUrl ? await fetchSafeImage(backgroundTemplateUrl) : null;
    const posterImage = templateImage?.ok ? null : posterUrl ? await fetchSafeImage(posterUrl) : null;

    const cardBackground = templateImage?.ok
      ? { body: templateImage.body, contentType: templateImage.contentType, outer: true as const }
      : posterImage?.ok
      ? { body: posterImage.body, contentType: posterImage.contentType, outer: false as const }
      : null;

    const safeBaseUrl = escapeHtml(baseUrl);
    const safeMovieTitle = escapeHtml(movieTitle);
    const safeMovieDate = escapeHtml(movieDate);
    const safeVenue = escapeHtml(venue);
    const safeAgeRating = escapeHtml(ageRating);
    const safeSeat = escapeHtml(seat);
    const safeName = escapeHtml(name);

    const cardContentHtml = buildCardContentHtml({
      displayId: escapeHtml(displayId),
      movieTitle: safeMovieTitle,
      ageRating: safeAgeRating,
      movieDate: safeMovieDate,
      venue: safeVenue,
      popcornText,
      priceText: escapeHtml(priceText),
      seat: safeSeat,
      name: safeName,
      statusType,
      badgeColor,
      badgeText: escapeHtml(badgeText),
    });

    const cardMarkup = !cardBackground
      ? `<table role="presentation" width="${DISPLAY_CARD_WIDTH}" cellpadding="0" cellspacing="0" style="width:${DISPLAY_CARD_WIDTH}px; max-width:100%; margin:0 auto;">
          <tr><td bgcolor="#161616" style="background-color:#161616; padding:24px 24px 27px 24px; border-radius:20px; text-align:left;">
            ${cardContentHtml}
          </td></tr>
        </table>`
      : cardBackground.outer
      ? `<table role="presentation" width="${DISPLAY_OUTER_WIDTH}" cellpadding="0" cellspacing="0" style="width:${DISPLAY_OUTER_WIDTH}px; max-width:100%; margin:0 auto;">
          <tr><td background="cid:cardBg" bgcolor="#0a0a0a" height="${DISPLAY_OUTER_HEIGHT}" style="background-image:url(cid:cardBg); background-size:100% 100%; background-repeat:no-repeat; height:${DISPLAY_OUTER_HEIGHT}px; padding:0;">
            <table role="presentation" width="100%" height="${DISPLAY_OUTER_HEIGHT}" cellpadding="0" cellspacing="0" style="height:${DISPLAY_OUTER_HEIGHT}px;">
              <tr><td style="height:${DISPLAY_CARD_TOP}px; line-height:${DISPLAY_CARD_TOP}px; font-size:1px;">&nbsp;</td></tr>
              <tr>
                <td style="padding-left:${DISPLAY_CARD_LEFT}px; padding-right:${DISPLAY_CARD_RIGHT_GAP}px; vertical-align:top;">
                  <div style="width:${DISPLAY_CARD_WIDTH}px; padding:24px 24px 27px 24px; box-sizing:border-box; text-align:left;">
                    ${cardContentHtml}
                  </div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>`
      : `<table role="presentation" width="${DISPLAY_CARD_WIDTH}" cellpadding="0" cellspacing="0" style="width:${DISPLAY_CARD_WIDTH}px; max-width:100%; margin:0 auto;">
          <tr><td background="cid:cardBg" bgcolor="#161616" height="${DISPLAY_CARD_HEIGHT}" style="background-image:url(cid:cardBg); background-size:100% 100%; background-repeat:no-repeat; height:${DISPLAY_CARD_HEIGHT}px; padding:24px 24px 27px 24px; box-sizing:border-box; border-radius:20px; text-align:left; vertical-align:top;">
            ${cardContentHtml}
          </td></tr>
        </table>`;

    const templateUsed = Boolean(cardBackground?.outer);

    const ticketHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="color-scheme" content="light">
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
          @import url('https://fonts.googleapis.com/css2?family=Song+Myung&display=swap');
        </style>
      </head>
      <body style="margin:0; padding:0; -webkit-font-smoothing: antialiased; background-color:#0a0a0a;">
          <div style="padding: 40px 12px; font-family: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; text-align: center;">

          ${!templateUsed ? `
          <div style="margin-bottom: 26px;">
            <div style="font-family: 'Song Myung', serif; color: #f5f5f5; font-size: 28px; line-height: 1.15; letter-spacing: 0.1em; text-shadow: 0 0 18px rgba(255,255,255,0.25);">
              영화<br/>대교
            </div>
          </div>
          ` : ''}

          ${cardMarkup}

          ${statusType === 'pending' ? `
            <p style="margin-top: 25px; color: #fbbf24; font-weight: bold; font-size: 14px;">${emailIconImg('triangleAlertAmber', 14, 'margin-right:4px;')} 30분 내로 아래 QR코드로 입금해주세요. (총액: ${formattedPrice}원)</p>
            <div style="margin-top: 15px; text-align: center;">
              <img src="${safeBaseUrl}/qr.jpeg" alt="송금 QR" width="150" height="150" style="border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);" />
            </div>
            <div style="margin: 15px auto 0 auto; max-width: 320px; background-color: #161616; border: 1px solid #2a2a2a; border-radius: 10px; padding: 12px 14px; text-align: left;">
              <div style="font-size: 10px; letter-spacing: 2px; color: #737373; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">계좌번호</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-family: monospace; font-size: 13px; color: #f5f5f5; font-weight: bold;">7777028184681 카카오뱅크 신민규</td>
                <td style="text-align:right; white-space:nowrap;"><span style="font-size: 10px; color: #a3a3a3; border: 1px solid #3a3a3a; padding: 4px 8px; border-radius: 6px; background-color: #0a0a0a;">길게 눌러 복사</span></td>
              </tr></table>
            </div>
          ` : statusType === 'changed' ? `
            <p style="margin-top: 25px; color: #60a5fa; font-weight: bold; font-size: 14px;">${emailIconImg('refreshCwBlue', 14, 'margin-right:4px;')} 좌석 변경이 완료되었습니다.</p>
          ` : statusType === 'canceled' ? `
            <p style="margin-top: 25px; color: #f87171; font-weight: bold; font-size: 14px;">${emailIconImg('circleXRed', 14, 'margin-right:4px;')} 예매가 취소되었습니다.</p>
          ` : `
            <p style="margin-top: 25px; color: #34d399; font-weight: bold; font-size: 14px;">${emailIconImg('circleCheckGreen', 14, 'margin-right:4px;')} 예매가 확정되었습니다. 상영 당일 보여주세요!</p>
          `}

          ${statusType !== 'canceled' ? `
            <div style="margin-top: 30px; border-top: 1px dashed #2a2a2a; padding-top: 18px; text-align: center;">
              <p style="font-size: 13px; color: #a3a3a3; margin-bottom: 12px;">예매 내역 확인이나 변경은 아래에서 하실 수 있어요.</p>
              <a href="${safeBaseUrl}" style="display: inline-block; background-color: #ff5a1f; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 700;">${emailIconImg('clapperboardWhite', 14, 'margin-right:4px;')} 웹사이트에서 확인하기</a>
            </div>
          ` : ''}
          </div>
      </body>
      </html>
    `;

    const attachmentExt = cardBackground?.contentType.includes('png')
      ? 'png'
      : cardBackground?.contentType.includes('webp')
      ? 'webp'
      : 'jpg';
    const statusIconCid = statusType === 'pending' ? 'triangleAlertAmber'
      : statusType === 'changed' ? 'refreshCwBlue'
      : statusType === 'canceled' ? 'circleXRed'
      : 'circleCheckGreen';

    const attachments = [
      ...(cardBackground ? [{ filename: `card-bg.${attachmentExt}`, content: Buffer.from(cardBackground.body), cid: 'cardBg', contentType: cardBackground.contentType }] : []),
      ...(popcornArray.length > 0 ? [emailIconAttachment('popcornGray', 'popcornGray')] : []),
      emailIconAttachment(statusIconCid, statusIconCid),
      ...(statusType !== 'canceled' ? [emailIconAttachment('clapperboardWhite', 'clapperboardWhite')] : []),
    ];

    await sendMail({ to: email, subject, html: ticketHTML, attachments });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Mail Failed' }, { status: 500 });
  }
}
