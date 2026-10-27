// app/api/reservations/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/api-auth';
import { bookableEmails } from '@/lib/bookingAccess';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { action, payload } = await req.json();

    switch (action) {
      case 'CREATE_GROUP': {
        const { movieDate, movieSettingsId, leaderSeat, memberSeats, groupId, expiresAt } = payload as {
          movieDate: string; movieSettingsId: number; leaderSeat: string;
          memberSeats: { profileId: string; seat: string }[];
          groupId: string; expiresAt: string;
        };

        if (!Array.isArray(memberSeats) || memberSeats.length === 0 || memberSeats.length > 9) {
          return NextResponse.json({ success: false, error: '단체 예매는 리더를 포함하여 2~10명까지 가능합니다.' }, { status: 400 });
        }

        const { data: leaderProfile, error: leaderProfileError } = await supabaseAdmin
          .from('profiles').select('*').eq('id', user.id).single();
        if (leaderProfileError || !leaderProfile) {
          return NextResponse.json({ success: false, error: '프로필을 찾을 수 없습니다.' }, { status: 400 });
        }

        // 초대 명단(동아리원/관리자 포함)에 있는 사람만 예매할 수 있다. 리더와 모든 멤버를 확인한다.
        const memberProfileIds = memberSeats.map(m => m.profileId);
        const { data: memberProfiles, error: memberProfileError } = await supabaseAdmin
          .from('profiles').select('*').in('id', memberProfileIds);
        if (memberProfileError) throw memberProfileError;

        const bookable = await bookableEmails([leaderProfile.email, ...(memberProfiles || []).map(p => p.email)]);
        if (!bookable.has(leaderProfile.email.toLowerCase())) {
          return NextResponse.json({ success: false, error: '초대받은 분만 예매할 수 있습니다.' }, { status: 403 });
        }
        const notInvited = (memberProfiles || []).filter(p => !bookable.has(p.email.toLowerCase()));
        if (notInvited.length > 0) {
          return NextResponse.json({ success: false, error: `초대받지 않은 멤버가 있어 예매할 수 없습니다.\n(${notInvited.map(p => p.name).join(', ')})` }, { status: 403 });
        }

        const { data: leaderTicket, error: leaderError } = await supabaseAdmin.from('reservations').insert([{
          movie_date: movieDate, movie_settings_id: movieSettingsId, user_id: leaderProfile.id, student_id: leaderProfile.student_id,
          student_name: leaderProfile.name, email: leaderProfile.email, seat_number: leaderSeat,
          popcorn_order: 'none', payment_status: 'confirmed', group_id: groupId,
          is_group_leader: true, group_expires_at: expiresAt
        }]).select('*').single();
        if (leaderError) {
          // P0001: reservations 가드 트리거(마감/블랙리스트/동아리석 등)가 던진 사용자용 사유
          const error = leaderError.code === 'P0001' ? leaderError.message : '리더 좌석 예매 중 오류가 발생했습니다.\n(이미 선점된 좌석이거나 이미 예매한 상태일 수 있습니다.)';
          return NextResponse.json({ success: false, error }, { status: 400 });
        }

        const profileById = new Map((memberProfiles || []).map(p => [p.id, p]));
        const memberInserts = memberSeats.map(m => {
          const p = profileById.get(m.profileId);
          return {
            movie_date: movieDate, movie_settings_id: movieSettingsId, user_id: m.profileId, student_id: p?.student_id ?? null,
            student_name: p?.name ?? '', email: p?.email ?? '', seat_number: m.seat,
            popcorn_order: 'none', payment_status: 'group_pending', group_id: groupId,
            is_group_leader: false, group_expires_at: expiresAt
          };
        });

        const { data: memberTickets, error: memberError } = await supabaseAdmin.from('reservations')
          .insert(memberInserts).select('id, student_id, student_name, seat_number');
        if (memberError) {
          await supabaseAdmin.from('reservations').delete().eq('id', leaderTicket.id);
          const error = memberError.code === 'P0001' ? memberError.message : '멤버 좌석 예매 중 오류가 발생했습니다.\n(이미 선점된 좌석이나 이미 예매한 멤버가 포함되어 있을 수 있습니다.)';
          return NextResponse.json({ success: false, error }, { status: 400 });
        }

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: leaderProfile.student_id, student_name: leaderProfile.name,
          description: `단체 예매 생성 (리더: ${leaderSeat}, 멤버 ${memberSeats.length}명)`
        }]);

        return NextResponse.json({ success: true, leaderTicket, memberTickets });
      }

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

        return NextResponse.json({ success: true, ticket });
      }

      case 'CONFIRM_GROUP': {
        const { reservationId, popcornOrder } = payload;
        const { data: ticket, error: fetchError } = await supabaseAdmin.from('reservations').select('*').eq('id', reservationId).single();
        if (fetchError || !ticket) return NextResponse.json({ success: false, error: '존재하지 않거나 이미 처리된 초대입니다.' }, { status: 404 });
        if (ticket.user_id !== user.id) return NextResponse.json({ success: false, error: '본인 초대만 확정할 수 있습니다.' }, { status: 403 });
        if (ticket.payment_status !== 'group_pending') return NextResponse.json({ success: false, error: '이미 처리된 초대입니다.' }, { status: 400 });
        if (ticket.group_expires_at && new Date(ticket.group_expires_at) < new Date()) {
          return NextResponse.json({ success: false, error: '초대 시간이 만료되었습니다.' }, { status: 400 });
        }

        const finalStatus = popcornOrder && popcornOrder !== 'none' ? 'pending' : 'confirmed';
        const { data: updated, error: updateError } = await supabaseAdmin.from('reservations')
          .update({ popcorn_order: popcornOrder || 'none', payment_status: finalStatus })
          .eq('id', reservationId)
          .select('*').single();
        if (updateError) throw updateError;

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: ticket.student_id, student_name: ticket.student_name,
          description: popcornOrder && popcornOrder !== 'none'
            ? `단체 예매 확정 + 팝콘 주문 (${ticket.seat_number})`
            : `단체 예매 확정 (${ticket.seat_number})`
        }]);

        return NextResponse.json({ success: true, ticket: updated });
      }

      case 'LEAVE_GROUP': {
        const { reservationId } = payload;
        const { data: ticket, error: fetchError } = await supabaseAdmin.from('reservations').select('*').eq('id', reservationId).single();
        if (fetchError || !ticket) return NextResponse.json({ success: false, error: '존재하지 않거나 이미 처리된 초대입니다.' }, { status: 404 });
        if (ticket.user_id !== user.id) return NextResponse.json({ success: false, error: '본인 초대만 거절할 수 있습니다.' }, { status: 403 });

        const { error: deleteError } = await supabaseAdmin.from('reservations').delete().eq('id', reservationId);
        if (deleteError) throw deleteError;

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: ticket.student_id, student_name: ticket.student_name,
          description: `단체 예매 거절 (${ticket.seat_number})`
        }]);

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Reservations API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
