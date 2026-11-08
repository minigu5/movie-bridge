// node --test lib/promoHeadlineAttach.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePromoHeadlines, HEADLINE_MAX_BYTES } from "./promoHeadlineAttach.ts";
import { PROMO_DATE_CID, PROMO_TITLE_CID } from "./promoMailHtml.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const uri = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
const img = (over = {}) => ({ dataUri: uri(PNG), width: 200, height: 72, ...over });

test("올바른 두 그림 → CID 첨부와 크기", () => {
  const r = parsePromoHeadlines({ date: img(), title: img({ width: 198, height: 58 }) });
  assert.ok(r);
  assert.deepEqual(r.attachments.map((a) => [a.cid, a.contentType, a.filename]), [
    [PROMO_DATE_CID, "image/png", "date.png"],
    [PROMO_TITLE_CID, "image/png", "title.png"],
  ]);
  assert.ok(r.attachments[0].content.equals(PNG));
  assert.deepEqual(r.refs.title, { cid: PROMO_TITLE_CID, width: 198, height: 58 });
});

test("없거나 하나만 있으면 null", () => {
  assert.equal(parsePromoHeadlines(undefined), null);
  assert.equal(parsePromoHeadlines({ date: img() }), null);
  assert.equal(parsePromoHeadlines("x"), null);
});

test("PNG data URI만 받는다", () => {
  assert.equal(parsePromoHeadlines({ date: img({ dataUri: uri(PNG).replace("image/png", "image/jpeg") }), title: img() }), null);
  assert.equal(parsePromoHeadlines({ date: img({ dataUri: "https://evil.test/a.png" }), title: img() }), null);
  // 머리가 PNG가 아니면 거른다
  assert.equal(parsePromoHeadlines({ date: img({ dataUri: uri(Buffer.from("not a png at all")) }), title: img() }), null);
});

test("크기 제한: 300KB, 폭 440, 높이 400, 양수", () => {
  const big = Buffer.concat([PNG, Buffer.alloc(HEADLINE_MAX_BYTES)]);
  assert.equal(parsePromoHeadlines({ date: img({ dataUri: uri(big) }), title: img() }), null);
  assert.equal(parsePromoHeadlines({ date: img({ width: 441 }), title: img() }), null);
  assert.equal(parsePromoHeadlines({ date: img({ height: 401 }), title: img() }), null);
  assert.equal(parsePromoHeadlines({ date: img({ width: 0 }), title: img() }), null);
  assert.equal(parsePromoHeadlines({ date: img({ width: "200" }), title: img() }), null);
  assert.equal(parsePromoHeadlines({ date: img({ height: Infinity }), title: img() }), null);
  assert.ok(parsePromoHeadlines({ date: img({ width: 440, height: 400 }), title: img() }));
});
