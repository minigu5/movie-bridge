// app/api/ticket/route.ts
// 예매/좌석 변경/팝콘 추가/관리자 승인 직후 티켓 메일을 보낸다.
// 요청은 예매 id만 받고, 받는 사람·이름·좌석·팝콘·회차 정보는 전부 DB에서 읽는다.
// 본인 예매이거나 관리자일 때만 보낸다. 취소 메일은 행이 지워진 뒤라 여기서 검증할 수 없어
// 취소를 처리하는 라우트(/api/reservations CANCEL_OWN, /api/admin/action)가 직접 보낸다.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest, isAdminEmail } from '@/lib/api-auth';
import { sendTicketMail, type TicketMailReservation } from '@/lib/ticketMail';

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { ticketId, changed } = await req.json() as { ticketId?: string; changed?: boolean };
    if (!ticketId) return NextResponse.json({ success: false, error: 'ticketId가 필요합니다.' }, { status: 400 });

    const { data: reservation } = await getSupabaseAdmin()
      .from('reservations')
      .select('id, user_id, email, student_name, seat_number, popcorn_order, payment_status, movie_settings_id')
      .eq('id', ticketId)
      .maybeSingle();
    if (!reservation) return NextResponse.json({ success: false, error: '예매 내역이 없습니다.' }, { status: 404 });

    if (reservation.user_id !== user.id && !(await isAdminEmail(user.email as string))) {
      return NextResponse.json({ success: false, error: '본인 예매만 메일을 받을 수 있습니다.' }, { status: 403 });
    }
    if (reservation.payment_status !== 'confirmed' && reservation.payment_status !== 'pending') {
      return NextResponse.json({ success: false, error: '확정 또는 결제 대기 상태의 예매만 메일을 보낼 수 있습니다.' }, { status: 400 });
    }

    await sendTicketMail({
      reservation: reservation as TicketMailReservation,
      statusType: changed ? 'changed' : reservation.payment_status,
      baseUrl: new URL(req.url).origin,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ticket mail error:', error);
    return NextResponse.json({ success: false, error: 'Mail Failed' }, { status: 500 });
  }
}
