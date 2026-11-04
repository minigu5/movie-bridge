import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMail } from '@/lib/mailer';
import { escapeHtml } from '@/lib/escapeHtml';
import { emailIconImg, emailIconAttachment, brandLogoImg } from '@/lib/emailIcons';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();
    // 1. 결과 메일이 발송되지 않았고 만료 시간이 지난 단체 리더 조회
    const { data: leadersToReport } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('is_group_leader', true)
      .eq('group_report_sent', false)
      .lt('group_expires_at', now);

    if (!leadersToReport || leadersToReport.length === 0) {
      return NextResponse.json({ message: 'No groups to report found', processed: 0 });
    }

    let processedGroups = 0;

    for (const leader of leadersToReport) {
      const gid = leader.group_id;

      // 2. 해당 그룹의 모든 멤버 조회
      const { data: allMembers } = await supabaseAdmin
        .from('reservations')
        .select('*')
        .eq('group_id', gid);

      if (!allMembers) continue;

      const confirmedMembers = allMembers.filter(m => m.payment_status === 'confirmed');
      const expiredMembers = allMembers.filter(m => m.payment_status === 'group_pending');

      // 3. 만료된 멤버 삭제
      if (expiredMembers.length > 0) {
        const expiredIds = expiredMembers.map(m => m.id);
        await supabaseAdmin.from('reservations').delete().in('id', expiredIds);
      }

      // 4. 리더 및 확정된 멤버 전원에게 결과 리포트 발송
      const recipients = confirmedMembers; // 리더도 confirmed 상태이므로 포함됨
      const reportHtml = buildResultEmail(leader.student_name, confirmedMembers, expiredMembers);
      const reportAttachments = [
        emailIconAttachment('brandLogo', 'brandLogo'),
        emailIconAttachment(expiredMembers.length === 0 ? 'partyPopperWhite' : 'clipboardListWhite', expiredMembers.length === 0 ? 'partyPopperWhite' : 'clipboardListWhite'),
        ...(confirmedMembers.length > 0 ? [emailIconAttachment('sparklesGreen', 'sparklesGreen')] : []),
        ...(expiredMembers.length > 0 ? [emailIconAttachment('hourglassRed', 'hourglassRed')] : []),
        emailIconAttachment('clapperboardRed', 'clapperboardRed'),
      ];

      for (const member of recipients) {
        const email = getEmail(member);
        if (email) {
          try {
            await sendMail({
              to: email,
              subject: `[영화대교] 단체 예매 최종 결과 안내 (${confirmedMembers.length}명 확정)`,
              html: reportHtml,
              attachments: reportAttachments
            });
          } catch (e) { console.error('Report email error:', e); }
        }
      }

      // 5. 만료된 멤버들에게 취소 안내 메일 발송
      for (const expired of expiredMembers) {
        const email = getEmail(expired);
        if (email) {
          try {
            await sendMail({
              to: email,
              subject: `[영화대교] ${expired.student_name}님의 단체 예매가 시간 초과로 취소되었습니다`,
              html: buildCancelEmail(expired.student_name, expired.seat_number, leader.student_name),
              attachments: [emailIconAttachment('brandLogo', 'brandLogo'), emailIconAttachment('hourglassRed', 'hourglassRed')]
            });
          } catch (e) { console.error('Cancel email error:', e); }
        }
      }

      // 6. 리더의 리포트 발송 상태 업데이트
      await supabaseAdmin.from('reservations')
        .update({ group_report_sent: true })
        .eq('id', leader.id);

      // 7. 로그 기록
      await supabaseAdmin.from('activity_logs').insert([{
        student_id: leader.student_id,
        student_name: leader.student_name,
        description: `단체 예매 리포트 발송 완료: ${confirmedMembers.length}명 성공, ${expiredMembers.length}명 취소`
      }]);

      processedGroups++;
    }

    return NextResponse.json({ message: 'Group check completed', processedGroups });
  } catch (error) {
    console.error('Group check error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function getEmail(reservation: any): string | null {
  return reservation.email || null;
}

function buildCancelEmail(name: string, seat: string, leaderName: string): string {
  const safeName = escapeHtml(name);
  const safeSeat = escapeHtml(seat);
  const safeLeaderName = escapeHtml(leaderName);
  return `
    <!DOCTYPE html><html><head><meta name="color-scheme" content="light">
      <style>
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
      </style>
    </head>
    <body style="margin:0;padding:0; -webkit-font-smoothing: antialiased;">
      <div style="background-color:#0a0a0a;padding:40px 12px;font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;text-align:center;">

        <div style="margin-bottom: 14px;">
          ${brandLogoImg()}
        </div>

        <div style="max-width:380px;margin:0 auto;background-color:#161616;border:1px solid #2a2a2a;border-radius:20px;overflow:hidden;box-shadow:0 20px 45px rgba(0,0,0,0.55);text-align:left;">
          <div style="padding:26px 24px;color:white;">
            <p style="color:#f87171;font-weight:700;font-size:12px;letter-spacing:1px;margin:0 0 8px 0;">${emailIconImg('hourglassRed', 12, 'margin-right:3px;')} 시간 초과</p>
            <h1 style="margin:0 0 14px 0;font-size:20px;font-weight:800;line-height:1.4;">${safeName}님의 단체 예매가<br/>시간 초과로 취소되었습니다</h1>
            <p style="color:#a3a3a3;font-size:14px;font-weight:600;line-height:1.5;">리더 ${safeLeaderName}님의 단체 관람 초대에<br/>1시간 이내에 응답하지 않아 좌석(${safeSeat})이 해제되었습니다.</p>
          </div>
          <div style="background-color:#eef0f4;padding:24px;text-align:center;">
            <div style="font-size:44px;font-weight:800;color:#ef4444;text-decoration:line-through; font-variant-numeric: tabular-nums;">${safeSeat}</div>
            <div style="margin:12px auto 0 auto;padding:8px;max-width:150px;background-color:#FEE2E2;border-radius:8px;font-weight:700;font-size:13px;color:#991B1B;border:1px solid #991B1B;">예매 취소됨</div>
          </div>
        </div>
      </div>
    </body></html>
  `;
}

function buildResultEmail(leaderName: string, confirmed: any[], expired: any[]): string {
  const isFullSuccess = expired.length === 0;

  const confirmedList = confirmed.map(m => `
    <li style="margin:8px 0;padding:0;list-style:none;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);border-radius:10px;"><tr>
        <td style="padding:12px 14px; color:#34d399;font-weight:700;">${escapeHtml(m.student_name)}</td>
        <td style="padding:12px 14px; text-align:right; white-space:nowrap;"><span style="background:#34d399;color:#052e1f;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700; font-variant-numeric: tabular-nums;">${escapeHtml(m.seat_number)}</span></td>
      </tr></table>
    </li>
  `).join('');

  const expiredList = expired.map(m => `
    <li style="margin:8px 0;padding:0;list-style:none;opacity:0.8;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:10px;"><tr>
        <td style="padding:12px 14px; color:#f87171;font-weight:600;">${escapeHtml(m.student_name)}</td>
        <td style="padding:12px 14px; text-align:right; white-space:nowrap;"><span style="background:#ef4444;color:white;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700; font-variant-numeric: tabular-nums;">${escapeHtml(m.seat_number)}</span></td>
      </tr></table>
    </li>
  `).join('');

  return `
    <!DOCTYPE html><html><head><meta name="color-scheme" content="light">
      <style>
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
      </style>
    </head>
    <body style="margin:0;padding:0; -webkit-font-smoothing: antialiased;">
      <div style="background-color:#0a0a0a;padding:40px 12px;font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;text-align:center;">

        <div style="margin-bottom: 14px;">
          ${brandLogoImg()}
        </div>

        <div style="max-width:440px;margin:0 auto;background-color:#161616;border:1px solid #2a2a2a;border-radius:20px;overflow:hidden;box-shadow:0 20px 45px rgba(0,0,0,0.55);text-align:left;">
          <div style="padding:28px 25px;color:white;">
            <div style="text-align:center;margin-bottom:18px;">
              ${isFullSuccess ? emailIconImg('partyPopperWhite', 40) : emailIconImg('clipboardListWhite', 40)}
            </div>
            <p style="color:${isFullSuccess ? '#34d399' : '#fbbf24'};font-weight:700;font-size:12px;letter-spacing:2px;margin:0 0 10px 0;text-align:center;text-transform:uppercase;">
              ${isFullSuccess ? 'Mission Accomplished' : 'Group Status Report'}
            </p>
            <h1 style="margin:0 0 10px 0;font-size:22px;font-weight:800;text-align:center;line-height:1.4;">
              ${escapeHtml(leaderName)}님의 단체 예매<br/>최종 결과 안내
            </h1>
            <p style="color:#a3a3a3;font-size:14px;font-weight:600;text-align:center;margin-bottom:28px;">
              주어진 1시간의 유효 시간이 만료되었습니다.<br/>최종 확정된 멤버 명단을 확인해 주세요.
            </p>

            ${confirmed.length > 0 ? `
              <div style="margin-bottom:22px;">
                <p style="color:#34d399;font-weight:700;font-size:14px;margin-bottom:10px;">
                  ${emailIconImg('sparklesGreen', 14, 'margin-right:3px;')} 확정된 멤버 (${confirmed.length}명)
                </p>
                <ul style="padding:0;margin:0;">${confirmedList}</ul>
              </div>
            ` : ''}

            ${expired.length > 0 ? `
              <div style="margin-bottom:10px;">
                <p style="color:#f87171;font-weight:700;font-size:14px;margin-bottom:10px;">
                  ${emailIconImg('hourglassRed', 14, 'margin-right:3px;')} 시간 초과 (${expired.length}명)
                </p>
                <ul style="padding:0;margin:0;">${expiredList}</ul>
                <p style="color:#737373;font-size:11px;font-weight:600;margin-top:10px;">* 위 좌석은 시간 초과로 인해 자동으로 예매가 취소 및 해제되었습니다.</p>
              </div>
            ` : ''}
          </div>

          <div style="background-color:rgba(0,0,0,0.25);padding:18px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="color:#737373;font-size:12px;margin:0;">본 메일은 시스템에 의해 자동으로 발송되었습니다.</p>
            <p style="color:#ef4444;font-weight:700;font-size:13px;margin:5px 0 0 0;">${emailIconImg('clapperboardRed', 13, 'margin-right:3px;')} 영화대교</p>
          </div>
        </div>
      </div>
    </body></html>
  `;
}
