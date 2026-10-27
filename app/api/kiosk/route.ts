// app/api/kiosk/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { action, payload } = await req.json();

    if (action === 'KIOSK_LOGIN') {
      const { password } = payload;
      const { data: settings, error } = await supabaseAdmin.from('kiosk_settings').select('password').eq('id', 1).single();
      if (error) throw error;

      if (!settings || settings.password !== password) {
        return NextResponse.json({ success: false, error: 'Unauthorized: Invalid kiosk password' }, { status: 401 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'LOOKUP_TICKET') {
      const { studentId, studentName, movieDate } = payload;

      // 교직원은 학번이 없다(student_id null). 발권기에서 교직원을 고르면 학번 없이 이름으로만 찾는다.
      let lookup = supabaseAdmin.from('reservations')
        .select('id, student_id, student_name, seat_number, popcorn_order, is_printed')
        .eq('student_name', studentName)
        .eq('movie_date', movieDate);
      lookup = studentId ? lookup.eq('student_id', studentId) : lookup.is('student_id', null);
      const { data: tickets, error: fetchError } = await lookup.limit(2);

      // 학번이 없는 교직원끼리 이름이 같으면 이름만으로는 누구 티켓인지 알 수 없다.
      if (!fetchError && tickets && tickets.length > 1) {
        return NextResponse.json({ success: false, error: '같은 이름의 예매가 여러 건 있어 발권기에서 구분할 수 없습니다.\n관리자에게 문의해주세요.' }, { status: 409 });
      }
      const ticket = tickets?.[0];
      if (fetchError || !ticket) {
        return NextResponse.json({ success: false, error: '예매 내역이 존재하지 않습니다. 학번/이름을 다시 확인해주세요.' }, { status: 404 });
      }

      return NextResponse.json({ success: true, ticket });
    }

    if (action === 'PRINT_TICKET') {
      const { ticketId, studentId, studentName, seatNumber } = payload;

      const { data: ticket, error: fetchError } = await supabaseAdmin.from('reservations')
        .select('id, student_id, student_name')
        .eq('id', ticketId)
        .single();

      if (fetchError || !ticket || (ticket.student_id ?? '') !== (studentId ?? '') || ticket.student_name !== studentName) {
        return NextResponse.json({ success: false, error: 'Unauthorized: 학번/이름이 예약 내역과 일치하지 않습니다.' }, { status: 401 });
      }

      const { error: e1 } = await supabaseAdmin.from('reservations').update({ is_printed: true }).eq('id', ticketId);
      if (e1) throw e1;

      const { error: e2 } = await supabaseAdmin.from('activity_logs').insert([{
        student_id: studentId || null,
        student_name: studentName,
        description: `현장 KIOSK 티켓 발권 완료 (${seatNumber})`
      }]);
      if (e2) throw e2;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Kiosk API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
