// node --test lib/promoRecipients.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPromoExclusions, removePromoRecipient, restorePromoRecipient } from "./promoRecipients.ts";

const a = { email: "a@ts.hs.kr", name: "가" };
const b = { email: "b@ts.hs.kr", name: null };
const c = { email: "c@ts.hs.kr", name: "다" };

test("X로 뺀 사람은 받는 사람을 다시 세도 빠진 채로 남는다", () => {
  const removed = removePromoRecipient(new Map(), b);
  // 처음 센 명단
  assert.deepEqual(applyPromoExclusions([a, b], removed), [a]);
  // 체크를 바꿔 서버가 새로 센 명단(b가 다시 들어 있음)
  assert.deepEqual(applyPromoExclusions([a, b, c], removed), [a, c]);
});

test("대소문자가 달라도 같은 사람으로 뺀다", () => {
  const removed = removePromoRecipient(new Map(), { email: "B@TS.HS.KR", name: null });
  assert.deepEqual(applyPromoExclusions([a, b], removed), [a]);
});

test("다시 넣으면 명단에 돌아온다", () => {
  const removed = restorePromoRecipient(removePromoRecipient(new Map(), b), "B@ts.hs.kr");
  assert.equal(removed.size, 0);
  assert.deepEqual(applyPromoExclusions([a, b], removed), [a, b]);
});

test("원래 Map은 바꾸지 않는다", () => {
  const base = new Map();
  removePromoRecipient(base, a);
  assert.equal(base.size, 0);
});
