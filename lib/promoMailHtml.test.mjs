// node --test lib/promoMailHtml.test.mjs  (Node 22.6+ 타입 제거로 .ts를 바로 불러온다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPromoMailHtml, buildPromoSubject, buildPromoInfoLine, formatDeadlineShort } from "./promoMailHtml.ts";

const movieInfo = {
  title: "인사이드 아웃 2",
  venue: "대구과학고등학교 중강당",
  date_string: "2026년 11월 14일 (토) 10:10 ~ 12:00",
  deadline_date: "2026-11-13T23:00:00+09:00",
};
const html = (over = {}, hasPoster = true) =>
  buildPromoMailHtml({ movieInfo: { ...movieInfo, ...over }, baseUrl: "https://example.test", hasPoster });

test("인사말 두 줄이 그대로 들어간다", () => {
  const h = html();
  assert.ok(h.includes("안녕하세요, 대구과학고 자율동아리 영화대교예요."));
  assert.ok(h.includes("외출주 토요일 아침마다 강당을 극장으로 바꿔 함께 영화를 봐요."));
});

test("정보 줄: 날짜 · 장소 · 마감", () => {
  assert.equal(buildPromoInfoLine(movieInfo), "11월 14일(토) 오전 10:10 · 중강당 · 예매 마감 13일 밤 11시");
  assert.ok(html().includes("11월 14일(토) 오전 10:10 · 중강당 · 예매 마감 13일 밤 11시"));
});

test("정보 줄: 마감이 없으면 뺀다", () => {
  assert.equal(buildPromoInfoLine({ ...movieInfo, deadline_date: null }), "11월 14일(토) 오전 10:10 · 중강당");
  assert.ok(!html({ deadline_date: null }).includes("예매 마감"));
  assert.equal(buildPromoInfoLine({ title: "x" }), "");
});

test("마감: 달이 다르면 달을 쓰고, 자정은 전날 밤 12시", () => {
  assert.equal(formatDeadlineShort("2026-10-31T21:30:00+09:00", 11), "10월 31일 밤 9시 30분");
  assert.equal(formatDeadlineShort("2026-11-14T00:00:00+09:00", 11), "13일 밤 12시");
  assert.equal(formatDeadlineShort("not a date", 11), null);
});

test("제목: (광고)가 맨 앞, 제목 없으면 일반 문구", () => {
  assert.equal(buildPromoSubject("인사이드 아웃 2"), "(광고) [영화대교] 「인사이드 아웃 2」 상영에 초대합니다");
  assert.equal(buildPromoSubject(""), "(광고) [영화대교] 상영에 초대합니다");
  assert.equal(buildPromoSubject(undefined), "(광고) [영화대교] 상영에 초대합니다");
  assert.ok(buildPromoSubject("x").startsWith("(광고)"));
});

test("옛 주황 팔레트와 Pretendard를 쓰지 않는다", () => {
  const h = html().toLowerCase();
  for (const bad of ["#ff5a1f", "fbbf24", "pretendard"]) assert.ok(!h.includes(bad), bad);
});

test("영화 제목 HTML은 이스케이프한다", () => {
  const h = html({ title: '<script>alert("x")</script>' });
  assert.ok(!h.includes("<script>alert"));
  assert.ok(h.includes("&lt;script&gt;"));
});

test("포스터가 없으면 포스터 칸 자체가 없다", () => {
  assert.ok(html().includes("cid:posterImage"));
  assert.ok(!html({}, false).includes("cid:posterImage"));
});

test("버튼과 광고 고지", () => {
  const h = html();
  assert.ok(h.includes('href="https://example.test"'));
  assert.ok(h.includes("좌석 예매하기"));
  assert.ok(h.includes("광고성 정보"));
  assert.ok(h.includes("발신: 대구과학고등학교 자율동아리 영화대교"));
  assert.ok(h.includes("cid:logoH"));
});
