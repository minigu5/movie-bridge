// lib/promoHeadlineAttach.ts
// /api/promo 요청에 실려 온 함렛 제목 그림(관리자 브라우저가 그린 PNG)을 검사해 CID 첨부로 바꾼다.
// 하나라도 이상하면 null → 메일은 기본 고딕 글자로 나간다. 발송 자체를 막지는 않는다.
// node --test lib/promoHeadlineAttach.test.mjs

import { PROMO_DATE_CID, PROMO_TITLE_CID, type PromoHeadlineRefs } from './promoMailHtml.ts';

export const HEADLINE_MAX_BYTES = 300 * 1024;
export const HEADLINE_MAX_WIDTH = 440;
export const HEADLINE_MAX_HEIGHT = 400;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DATA_URI = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

export type HeadlineAttachment = { filename: string; content: Buffer; cid: string; contentType: 'image/png' };

function decodeOne(raw: unknown): { content: Buffer; width: number; height: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { dataUri, width, height } = raw as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0 || width > HEADLINE_MAX_WIDTH || height > HEADLINE_MAX_HEIGHT) return null;
  if (typeof dataUri !== 'string') return null;
  // 디코드 전에 길이로 먼저 거른다(base64 4글자 = 3바이트).
  if (dataUri.length > 64 + Math.ceil((HEADLINE_MAX_BYTES * 4) / 3)) return null;
  const m = dataUri.match(DATA_URI);
  if (!m || m[1].length % 4 !== 0) return null;
  const content = Buffer.from(m[1], 'base64');
  if (content.length === 0 || content.length > HEADLINE_MAX_BYTES) return null;
  if (!PNG_SIG.every((b, i) => content[i] === b)) return null;
  return { content, width, height };
}

/** 둘 다 올바를 때만 첨부와 본문용 크기를 돌려준다. */
export function parsePromoHeadlines(raw: unknown): { attachments: HeadlineAttachment[]; refs: PromoHeadlineRefs } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { date, title } = raw as Record<string, unknown>;
  const d = decodeOne(date);
  const t = decodeOne(title);
  if (!d || !t) return null;
  return {
    attachments: [
      { filename: 'date.png', content: d.content, cid: PROMO_DATE_CID, contentType: 'image/png' },
      { filename: 'title.png', content: t.content, cid: PROMO_TITLE_CID, contentType: 'image/png' },
    ],
    refs: {
      date: { cid: PROMO_DATE_CID, width: d.width, height: d.height },
      title: { cid: PROMO_TITLE_CID, width: t.width, height: t.height },
    },
  };
}
