// lib/restrictionMail.ts
// 예매 제한/해제 안내 메일. 관리자 작업(/api/admin/action)이 처리 직후 서버에서 보낸다.
// 본문은 lib/restrictionMailHtml.ts(순수 함수, 테스트 있음)가 만든다.
import { sendMail } from './mailer';
import { brandMailAttachment } from './brandMailAssets';
import { buildRestrictionMailHtml, buildRestrictionSubject } from './restrictionMailHtml';

export async function sendRestrictionMail(params: { email: string; name: string; added: boolean; reason?: string | null }): Promise<void> {
  const { email, name, added, reason } = params;
  await sendMail({
    to: email,
    subject: buildRestrictionSubject(added),
    html: buildRestrictionMailHtml({ name, added, reason }),
    attachments: [brandMailAttachment('logoMoon')],
  });
}
