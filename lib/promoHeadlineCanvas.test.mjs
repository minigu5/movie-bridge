// node --test lib/promoHeadlineCanvas.test.mjs  (DOM 없이 계산 부분만)
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutSpaced, wrapTitle, firstFamily, renderPromoHeadlines, TITLE_MAX_W_WITH_POSTER, HEADLINE_MAX_W } from "./promoHeadlineCanvas.ts";

// 글자당 10px(띄어쓰기 5px)로 재는 가짜 측정
const measure = (s) => Array.from(s).reduce((w, ch) => w + (ch === " " ? 5 : 10), 0);

test("제목 칸 폭: 포스터 옆 198, 없으면 384", () => {
  assert.equal(TITLE_MAX_W_WITH_POSTER, 198);
  assert.equal(HEADLINE_MAX_W, 384);
});

test("자간 배치: 마지막 글자 뒤 자간은 빼고 폭을 잰다", () => {
  const l = layoutSpaced("11.14 토", measure, -2);
  assert.deepEqual(l.chars, ["1", "1", ".", "1", "4", " ", "토"]);
  assert.deepEqual(l.xs, [0, 8, 16, 24, 32, 40, 43]);
  assert.equal(l.width, 53);
});

test("줄 나누기: 띄어쓰기 단위, 폭 안이면 한 줄", () => {
  assert.deepEqual(wrapTitle("악마는 프라다를 입는다", measure, 200, 3), ["악마는 프라다를 입는다"]);
  assert.deepEqual(wrapTitle("악마는 프라다를 입는다", measure, 80, 3), ["악마는 프라다를", "입는다"]);
});

test("한 단어가 너무 길면 글자 단위로 자른다", () => {
  assert.deepEqual(wrapTitle("가나다라마바사", measure, 30, 3), ["가나다", "라마바", "사"]);
});

test("3줄을 넘으면 마지막 줄을 …로 줄인다", () => {
  const lines = wrapTitle("가나 다라 마바 사아 자차", measure, 25, 3);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith("…"));
  assert.ok(measure(lines[2]) <= 25);
});

test("빈 제목은 줄이 없다", () => {
  assert.deepEqual(wrapTitle("   ", measure, 100, 3), []);
});

test("--font-hahmlet 값에서 첫 글꼴 이름만", () => {
  assert.equal(firstFamily("'Hahmlet', 'Hahmlet Fallback'"), "Hahmlet");
  assert.equal(firstFamily(' "__Hahmlet_a1b2c3", "__Hahmlet_Fallback_a1b2c3"'), "__Hahmlet_a1b2c3");
  assert.equal(firstFamily(""), null);
});

test("DOM이 없으면 null(→ 글자로 보냄)", async () => {
  assert.equal(await renderPromoHeadlines({ dateText: "11.14 토", title: "제목" }), null);
});
