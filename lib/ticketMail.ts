// lib/ticketMail.ts
// 티켓(예매/변경/결제대기/취소) 메일. 받는 사람과 내용은 호출부가 DB에서 읽은 예매 행과 회차 설정으로만 만든다
// (요청 본문 값을 그대로 쓰면 아무 주소로 아무 내용의 학교 메일을 보낼 수 있었다).
import { getSupabaseAdmin } from './supabase-admin';
import { sendMail } from './mailer';
import { fetchSafeImage } from './safeImageFetch';
import { brandMailAttachment } from './brandMailAssets';
import { buildTicketMailHtml, TICKET_POSTER_CID, type TicketMailStatus } from './ticketMailHtml';

export type { TicketMailStatus };

// 결제 대기 메일의 입금 계좌(송금 QR은 public/qr.jpeg)
const PAYMENT_ACCOUNT = '7777028184681 카카오뱅크 신민규';

export type TicketMailReservation = {
  id: string;
  email: string | null;
  student_name: string;
  seat_number: string;
  popcorn_order: string | null;
  payment_status: string;
  movie_settings_id: number | null;
};

type TicketMailMovie = {
  title: string;
  date_string: string;
  venue: string | null;
  age_rating: string | null;
  poster_url: string | null;
  poster_cdn_url: string | null;
};

export async function loadTicketMailMovie(movieSettingsId: number | null): Promise<TicketMailMovie | null> {
  if (movieSettingsId == null) return null;
  const { data } = await getSupabaseAdmin()
    .from('movie_settings')
    .select('title, date_string, venue, age_rating, poster_url, poster_cdn_url')
    .eq('id', movieSettingsId)
    .maybeSingle();
  return data;
}

// baseUrl은 요청이 실제로 들어온 origin(new URL(req.url).origin)을 넘긴다. 클라이언트가 보낸 값을 쓰면
// 메일 속 링크를 피싱 사이트로 바꿀 수 있다. movie를 넘기지 않으면 예매 행의 movie_settings_id로 조회한다.
export async function sendTicketMail(params: {
  reservation: TicketMailReservation;
  statusType: TicketMailStatus;
  baseUrl: string;
  movie?: TicketMailMovie | null;
}): Promise<void> {
  const { reservation, statusType, baseUrl } = params;
  const email = reservation.email;
  if (!email) return;
  const movie = params.movie !== undefined ? params.movie : await loadTicketMailMovie(reservation.movie_settings_id);
  const name = reservation.student_name;
  const seat = reservation.seat_number;
  const popcorn = reservation.popcorn_order;
  // 팝콘 결제까지 확정된 예매를 취소하면 환불이 필요하다(취소 직전 행 기준).
  const isRefundNeeded = statusType === 'canceled' && !!popcorn && popcorn !== 'none' && reservation.payment_status === 'confirmed';

  const popcornArray = popcorn && popcorn !== 'none' ? popcorn.split(',') : [];
  const totalPrice = popcornArray.length * 2500;
  const price = `${totalPrice.toLocaleString('ko-KR')}원`;

  let subject = `[영화대교] ${name}님의 티켓 예매 안내 - ${seat} 좌석`;
  let priceText = popcornArray.length > 0 ? `${price} · 결제 완료` : '무료';
  if (statusType === 'pending') {
    priceText = `${price} · 입금 대기`;
  } else if (statusType === 'changed') {
    subject = `[영화대교] ${name}님의 좌석 변경 안내 - ${seat} 좌석`;
    priceText = popcornArray.length > 0 ? price : '무료';
  } else if (statusType === 'canceled') {
    subject = `[영화대교] ${name}님의 예매 취소 안내`;
    priceText = popcornArray.length === 0 ? '무료' : isRefundNeeded ? `${price} · 환불 필요` : `${price} · 미결제 취소`;
  }

  // 팝콘 종류별 개수 (예: 오리지널 버터 팝콘 2개)
  const popcornNames: Record<string, string> = { original: '오리지널 버터 팝콘', consomme: '콘소메맛 팝콘', caramel: '카라멜맛 팝콘' };
  const counts: Record<string, number> = {};
  popcornArray.forEach((p: string) => { counts[p] = (counts[p] || 0) + 1; });
  const popcornLines = Object.entries(counts).map(([key, count]) => `${popcornNames[key] ?? key} ${count}개`);

  const displayId = reservation.id ? reservation.id.split('-')[0].toUpperCase() : 'UNKNOWN';

  // 포스터는 선명한 작은 사진으로만 쓴다. 못 받아와도 메일 레이아웃은 같고 그 칸만 빈다.
  const posterUrl = movie?.poster_cdn_url || movie?.poster_url || null;
  const poster = posterUrl ? await fetchSafeImage(posterUrl) : null;
  const posterOk = Boolean(poster?.ok);

  const html = buildTicketMailHtml({
    status: statusType,
    displayId,
    movieTitle: movie?.title ?? '',
    ageRating: movie?.age_rating ?? '',
    movieDate: movie?.date_string ?? '',
    venue: movie?.venue ?? '',
    popcornLines,
    priceText,
    seat,
    name,
    hasPoster: posterOk,
    totalPrice,
    baseUrl,
    account: PAYMENT_ACCOUNT,
  });

  const posterExt = poster?.ok ? (poster.contentType.includes('png') ? 'png' : poster.contentType.includes('webp') ? 'webp' : 'jpg') : 'jpg';
  const attachments = [
    brandMailAttachment('logoMoon'),
    brandMailAttachment('notchL'),
    brandMailAttachment('notchR'),
    ...(poster?.ok ? [{ filename: `poster.${posterExt}`, content: Buffer.from(poster.body), cid: TICKET_POSTER_CID, contentType: poster.contentType }] : []),
  ];

  await sendMail({ to: email, subject, html, attachments });
}
