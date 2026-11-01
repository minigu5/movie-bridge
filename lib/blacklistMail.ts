// lib/blacklistMail.ts
// 블랙리스트 등록/해제 안내 메일. 관리자 작업(/api/admin/action)이 처리 직후 서버에서 보낸다.
import { sendMail } from './mailer';
import { escapeHtml } from './escapeHtml';

export async function sendBlacklistMail(params: { email: string; name: string; added: boolean }): Promise<void> {
  const { email, name } = params;
  const isAdded = params.added;
  const subject = isAdded ? `[영화대교] ${name}님, 블랙리스트 등록 안내` : `[영화대교] ${name}님, 블랙리스트 해제 안내`;
  const safeName = escapeHtml(name);

  const htmlContent = `
    <div style="padding: 30px; background-color: #f8fafc; font-family: sans-serif; text-align: center;">
      <div style="max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; border-top: 5px solid ${isAdded ? '#ef4444' : '#10b981'}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #1e293b; margin-bottom: 20px;">영화대교 알림</h2>
        <p style="font-size: 16px; color: #475569; line-height: 1.6;">
          <strong>${safeName}</strong> 님,<br/><br/>
          ${isAdded
            ? `귀하는 영화대교 <strong><span style="color:#ef4444;">블랙리스트에 등록</span></strong>되었습니다.<br/><span style="font-size: 13px;">(사유: 이전 관람 시 좌석 주변 미정리 등)</span><br/><br/>당분간 영화 예매가 제한되오니, 문의 사항이 있으시면 동아리 관리자에게 연락 바랍니다.`
            : `귀하의 영화대교 <strong><span style="color:#10b981;">블랙리스트가 해제</span></strong>되었습니다.<br/><br/>이제 정상적으로 예매가 가능합니다. 깨끗한 관람 부탁드립니다!`}
        </p>
      </div>
    </div>
  `;

  await sendMail({ to: email, subject, html: htmlContent });
}
