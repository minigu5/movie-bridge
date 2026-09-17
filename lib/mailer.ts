import nodemailer from 'nodemailer';

type SendMailParams = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; cid: string; contentType: string }[];
};

const MAX_ATTEMPTS = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * [제로 코스트 이메일 로드 밸런싱]
 * Gmail SMTP의 500개/일 제한을 우회하기 위해 여러 계정을 랜덤하게 선택합니다.
 * 환경 변수: GMAIL_USER_1, GMAIL_APP_PASSWORD_1, GMAIL_USER_2... 순으로 로드합니다.
 */
function getAccounts(): { user: string; pass: string }[] {
  const accounts: { user: string; pass: string }[] = [];
  let i = 1;

  while (process.env[`GMAIL_USER_${i}`]) {
    accounts.push({
      user: process.env[`GMAIL_USER_${i}`]!,
      pass: process.env[`GMAIL_APP_PASSWORD_${i}`]!,
    });
    i++;
  }

  // 만약 번호가 매겨진 계정이 없으면 기존 GMAIL_USER 환경 변수 확인 (하위 호환성)
  if (accounts.length === 0 && process.env.GMAIL_USER) {
    accounts.push({
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD!,
    });
  }

  if (accounts.length === 0) {
    console.error('❌ 이메일 계정이 설정되지 않았습니다. (GMAIL_USER_1 등)');
    throw new Error('No Gmail accounts configured for mailing.');
  }

  return accounts;
}

export async function sendMail({ to, subject, html, attachments }: SendMailParams): Promise<void> {
  const accounts = getAccounts();

  let lastError: unknown;

  // Cloudflare Workers(workerd)의 raw TCP 소켓 지원이 불완전해 Gmail SMTP 연결이
  // 간헐적으로 "Failed to resolve IPv4 addresses" 등으로 실패한다. 계정을 바꿔가며
  // 백오프 재시도하면 대부분 다음 시도에서 성공한다.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const account = accounts[Math.floor(Math.random() * accounts.length)];

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: account.user, pass: account.pass },
      });

      await transporter.sendMail({
        from: `"영화대교" <${account.user}>`,
        to,
        subject,
        html,
        // cid로 참조하는 이미지는 contentDisposition: 'inline'을 명시해야 한다.
        // 기본값(attachment)이면 Content-ID로만 매칭하는 관대한 클라이언트(데스크톱 Gmail, iOS Mail)에서는
        // 문제없이 보이지만, Content-Disposition을 그대로 따르는 Android Gmail 앱에서는
        // 본문엔 이미지가 안 뜨고 별도 첨부파일 목록에만 나타난다.
        attachments: attachments?.map((a) => ({ ...a, contentDisposition: 'inline' as const })),
      });
      return;
    } catch (error) {
      lastError = error;
      console.error(`❌ 메일 발송 실패 (시도 ${attempt}/${MAX_ATTEMPTS}, 계정: ${account.user}):`, error);

      if (attempt === MAX_ATTEMPTS) break;
      await sleep(300 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Mail send failed after retries.');
}
