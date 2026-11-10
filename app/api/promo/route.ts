import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { sendMail } from '@/lib/mailer';
import { fetchSafeImage } from '@/lib/safeImageFetch';
import { brandMailAttachment } from '@/lib/brandMailAssets';
import { parsePromoHeadlines } from '@/lib/promoHeadlineAttach';
import { buildPromoMailHtml, buildPromoSubject, PROMO_POSTER_CID, type PromoMovieInfo } from '@/lib/promoMailHtml';

type Recipient = { email: string; name?: string | null };

type MovieInfo = PromoMovieInfo & {
  poster_url?: string;
};

export async function POST(req: Request) {
  try {
    // 받는 사람 목록을 요청이 정하는 대량 발송이라 관리자만 쓸 수 있다.
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { chunk, movieInfo, headlines: rawHeadlines } = (await req.json()) as {
      chunk: Recipient[];
      movieInfo: MovieInfo;
      /** 관리자 브라우저가 함렛으로 그린 큰 날짜·제목 PNG. 없거나 이상하면 글자로 보낸다. */
      headlines?: unknown;
    };
    const baseUrl = new URL(req.url).origin;

    if (!Array.isArray(chunk) || chunk.length === 0) {
      return NextResponse.json({ success: false, error: '수신자가 없습니다.' }, { status: 400 });
    }

    // 포스터는 요청당 1회만 가져와 CID 첨부로 공유한다 (hotlink 반복 실패 방지).
    const posterImage = movieInfo?.poster_url ? await fetchSafeImage(movieInfo.poster_url) : null;
    const posterAttachment = posterImage?.ok
      ? {
          filename: 'poster.jpg',
          content: Buffer.from(posterImage.body),
          cid: PROMO_POSTER_CID,
          contentType: posterImage.contentType,
        }
      : null;

    // 함렛 제목 그림: 검사를 통과한 것만 CID 첨부로 붙인다. 아니면 기본 고딕 글자로 간다.
    const headlines = parsePromoHeadlines(rawHeadlines);

    // 본문은 받는 사람과 상관없이 같다(인사말에 이름을 넣지 않는다).
    const html = buildPromoMailHtml({ movieInfo: movieInfo ?? {}, baseUrl, hasPoster: !!posterAttachment, headlines: headlines?.refs });
    const subject = buildPromoSubject(movieInfo?.title);
    const attachments = [
      ...(posterAttachment ? [posterAttachment] : []),
      brandMailAttachment('logoMoon'),
      ...(headlines?.attachments ?? []),
    ];

    const results = await Promise.allSettled(
      chunk.map((r) =>
        sendMail({
          to: r.email,
          subject,
          html,
          attachments,
        }),
      ),
    );

    const failedEmails = results
      .map((res, i) => (res.status === 'rejected' ? chunk[i].email : null))
      .filter((e): e is string => e !== null);

    return NextResponse.json({
      success: true,
      sent: chunk.length - failedEmails.length,
      failed: failedEmails.length,
      failedEmails,
    });
  } catch (error) {
    console.error('Promo mail error:', error);
    return NextResponse.json({ success: false, error: 'Mail Failed' }, { status: 500 });
  }
}
