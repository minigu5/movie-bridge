// app/api/group-invite/route.ts
// 단체 예매 리더가 멤버들에게 초대 메일을 보낸다. 요청은 groupId와 멤버 예매 id만 받고,
// 리더 본인 확인 후 멤버 이름·좌석·이메일과 회차 정보는 DB에서 읽는다.
import { NextResponse } from 'next/server';
import { sendMail } from '@/lib/mailer';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/api-auth';
import { escapeHtml } from '@/lib/escapeHtml';
import { fetchSafeImage } from '@/lib/safeImageFetch';
import { emailIconImg, emailIconAttachment } from '@/lib/emailIcons';
import { loadTicketMailMovie } from '@/lib/ticketMail';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });

    const { groupId, memberIds } = await req.json() as { groupId?: string; memberIds?: string[] };
    if (!groupId || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ success: false, error: 'groupId와 memberIds가 필요합니다.' }, { status: 400 });
    }

    const { data: leader } = await supabaseAdmin.from('reservations')
      .select('student_name, movie_settings_id')
      .eq('group_id', groupId).eq('is_group_leader', true).eq('user_id', user.id)
      .maybeSingle();
    if (!leader) return NextResponse.json({ success: false, error: '단체 예매 리더만 초대 메일을 보낼 수 있습니다.' }, { status: 403 });

    // 이 단체에 속한, 아직 확정하지 않은 멤버에게만 보낸다.
    const { data: memberRows } = await supabaseAdmin.from('reservations')
      .select('id, email, student_name, seat_number')
      .eq('group_id', groupId).eq('payment_status', 'group_pending').in('id', memberIds);
    const members = (memberRows || []).map(r => ({ memberId: r.id as string, email: r.email as string | null, name: r.student_name as string, seat: r.seat_number as string }));

    const movie = await loadTicketMailMovie(leader.movie_settings_id);
    const leaderName = leader.student_name;
    const movieTitle = movie?.title ?? '';
    const movieDate = movie?.date_string ?? '';
    const venue = movie?.venue ?? '';
    const posterUrl = movie?.poster_cdn_url || movie?.poster_url || null;
    const baseUrl = new URL(req.url).origin;
    const posterImage = posterUrl ? await fetchSafeImage(posterUrl) : null;
    const posterAttachment = posterImage?.ok
      ? { filename: 'poster.jpg', content: Buffer.from(posterImage.body), cid: 'posterImage', contentType: posterImage.contentType }
      : null;
    const posterSrc = escapeHtml(posterAttachment ? 'cid:posterImage' : `${baseUrl}/next.svg`);
    const safeMovieTitle = escapeHtml(movieTitle);
    const safeMovieDate = escapeHtml(movieDate);
    const safeVenue = escapeHtml(venue);
    const safeLeaderName = escapeHtml(leaderName);

    const sendPromises = members.map((member) => {
      const email = member.email;
      if (!email) return Promise.resolve();

      const confirmUrl = `${baseUrl}/group-confirm?groupId=${groupId}&memberId=${member.memberId}`;
      const safeMemberName = escapeHtml(member.name);
      const safeMemberSeat = escapeHtml(member.seat);

      const htmlContent = `
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

              <div style="margin-bottom: 26px;">
                <div style="font-family: 'Song Myung', serif; color: #f5f5f5; font-size: 28px; line-height: 1.15; letter-spacing: 0.1em; text-shadow: 0 0 18px rgba(255,255,255,0.25);">
                  영화<br/>대교
                </div>
              </div>

              <div style="margin: 0 auto; width: 100%; max-width: 380px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 45px rgba(0,0,0,0.55); text-align: left; background-color:#161616;">

                <img src="${posterSrc}" alt="${safeMovieTitle}" width="380" style="display:block; width:100%; height:210px; object-fit:cover; object-position:top; background-color:#0a0a0a;" />

                <div style="padding: 18px 22px 26px 22px;">
                  <span style="display:inline-block; background-color:rgba(255,255,255,0.08); padding:4px 9px; border-radius:6px; color:#e5e5e5; font-size:11px; font-weight:600; letter-spacing:0.5px;">${emailIconImg('clapperboardWhite', 11, 'margin-right:3px;')} 단체 관람 초대장</span>

                  <div style="color:#ffffff; font-size:20px; font-weight:800; line-height:1.4; margin-top: 16px; margin-bottom: 20px;">${safeMemberName}님, 단체 관람에<br/>초대되었습니다</div>

                  <div style="color:#f5f5f5; font-size:15px; font-weight:700; margin-bottom: 4px;">${safeMovieTitle}</div>
                  <div style="color:#a3a3a3; font-size:13px; font-weight:600; margin-bottom: 4px;">${safeMovieDate}</div>
                  ${venue ? `<div style="color:#a3a3a3; font-size:13px; font-weight:600;">${emailIconImg('mapPinGray', 12, 'margin-right:3px;')} ${safeVenue}</div>` : ''}
                  <div style="color:#a3a3a3; font-size:13px; font-weight:600; margin-top:4px;">리더 ${safeLeaderName}님</div>

                  <div style="margin: 18px 0; padding: 12px 14px; background-color: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.4); border-radius: 10px;">
                    <div style="color:#fbbf24; font-size:13px; font-weight:700; margin-bottom: 4px;">${emailIconImg('hourglassAmber', 13, 'margin-right:3px;')} 1시간 내로 예매를 확정해주세요</div>
                    <div style="color:#e5c07b; font-size:12px; font-weight:600;">미응답 시 좌석이 자동으로 해제됩니다.</div>
                  </div>

                  <div style="font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #737373; margin-bottom: 4px;">YOUR SEAT</div>
                  <div style="font-size: 44px; font-weight: 800; color: #ff5a1f; line-height: 1; font-variant-numeric: tabular-nums;">${safeMemberSeat}</div>
                </div>

                <div style="height:16px; background: radial-gradient(circle at 8px 8px, #0a0a0a 8px, transparent 8.5px) 0 0 / 16px 16px repeat-x; background-color: #161616;"></div>
              </div>

              <div style="margin-top: 30px;">
                <a href="${confirmUrl}" style="display: inline-block; background-color: #ff5a1f; color: #ffffff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 800;">${emailIconImg('circleCheckWhite', 15, 'margin-right:4px;')} 예매 확정하러 가기</a>
              </div>

              <p style="color: #525252; font-size: 10px; margin-top: 24px; letter-spacing: 2px;">
                Powered by 영화대교
              </p>
            </div>
        </body>
        </html>
      `;

      return sendMail({
        to: email,
        subject: `[영화대교] ${member.name}님, 단체 관람에 초대되었습니다 - ${member.seat} 좌석`,
        html: htmlContent,
        attachments: [
          ...(posterAttachment ? [posterAttachment] : []),
          emailIconAttachment('clapperboardWhite', 'clapperboardWhite'),
          ...(venue ? [emailIconAttachment('mapPinGray', 'mapPinGray')] : []),
          emailIconAttachment('hourglassAmber', 'hourglassAmber'),
          emailIconAttachment('circleCheckWhite', 'circleCheckWhite'),
        ],
      });
    });

    await Promise.all(sendPromises);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Group invite email error:', error);
    return NextResponse.json({ success: false, error: 'Mail Failed' }, { status: 500 });
  }
}
