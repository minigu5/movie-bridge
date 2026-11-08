// app/api/reservations/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/api-auth';
import { sendTicketMail } from '@/lib/ticketMail';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { action, payload } = await req.json();

    switch (action) {
      case 'CANCEL_OWN': {
        const { reservationId } = payload;
        const { data: ticket, error: fetchError } = await supabaseAdmin.from('reservations').select('*').eq('id', reservationId).single();
        if (fetchError || !ticket) return NextResponse.json({ success: false, error: '존재하지 않거나 이미 취소된 예매 내역입니다.' }, { status: 404 });
        if (ticket.user_id !== user.id) return NextResponse.json({ success: false, error: '본인 예약만 취소할 수 있습니다.' }, { status: 403 });

        const { error: deleteError } = await supabaseAdmin.from('reservations').delete().eq('id', reservationId);
        if (deleteError) throw deleteError;

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: ticket.student_id, student_name: ticket.student_name,
          description: `본인 예매 취소 (${ticket.seat_number})`
        }]);

        // 행을 지운 뒤에는 /api/ticket이 본인 예매인지 확인할 수 없어 취소 메일은 여기서 보낸다.
        try {
          await sendTicketMail({ reservation: ticket, statusType: 'canceled', baseUrl: new URL(req.url).origin });
        } catch (e) {
          console.error('Cancel mail error:', e);
        }

        return NextResponse.json({ success: true, ticket });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Reservations API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
