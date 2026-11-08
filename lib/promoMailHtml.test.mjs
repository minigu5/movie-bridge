// node --test lib/promoMailHtml.test.mjs  (Node 22.6+ 타입 제거로 .ts를 바로 불러온다)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPromoMailHtml, buildPromoSubject, parseScreening, formatBigDate, formatTimePhrase, formatDday, formatDeadlineShort,
} from "./promoMailHtml.ts";

const movieInfo = {
  title: "악마는 프라다를 입는다",
  venue: "대구과학고등학교 중강당",
  date_string: "2026년 11월 14일 (토) 10:10 ~ 12:00",
  deadline_date: "2026-11-13T23:00:00+09:00",
};
// 2026-11-08 오후 1시(한국 시간)
const NOW = new Date("2026-11-08T13:00:00+09:00");
const html = (over = {}, hasPoster = true, now = NOW) =>
  buildPromoMailHtml({ movieInfo: { ...movieInfo, ...over }, baseUrl: "https://example.test", hasPoster, now });

test("인사말 두 줄이 그대로 들어간다", () => {
  const h = html();
  assert.ok(h.includes("안녕하세요, 대구과학고 자율동아리 영화대교예요."));
  assert.ok(h.includes("외출주 토요일 아침마다 강당을 극장으로 바꿔 함께 영화를 봐요."));
});

test("큰 날짜: 11.14 토", () => {
  const s = parseScreening(movieInfo);
  assert.equal(formatBigDate(s), "11.14 토");
  assert.ok(html().includes(">11.14 토<"));
  // db_date가 있으면 그것으로 날짜·요일을 정한다.
  assert.equal(formatBigDate(parseScreening({ db_date: "2026-12-05" })), "12.5 토");
  assert.equal(parseScreening({ date_string: "미정" }), null);
});

test("시각 문구: 아침/오후, 0분은 뺀다", () => {
  assert.equal(formatTimePhrase(10, 10), "아침 10시 10분");
  assert.equal(formatTimePhrase(9, 0), "아침 9시");
  assert.equal(formatTimePhrase(12, 30), "오후 12시 30분");
  assert.equal(formatTimePhrase(14, 0), "오후 2시");
  assert.ok(html().includes("아침 10시 10분 · 중강당"));
});

test("상영까지 N일 / 내일 / 오늘 / 지났으면 없음", () => {
  const s = parseScreening(movieInfo);
  assert.equal(formatDday(s, NOW), "상영까지 6일");
  assert.equal(formatDday(s, new Date("2026-11-13T23:59:00+09:00")), "내일 상영");
  assert.equal(formatDday(s, new Date("2026-11-14T00:30:00+09:00")), "오늘 상영");
  assert.equal(formatDday(s, new Date("2026-11-15T09:00:00+09:00")), null);
  // 연도를 모르면 셀 수 없다.
  assert.equal(formatDday(parseScreening({ date_string: "11월 14일 (토) 10:10" }), NOW), null);
  // UTC로는 아직 전날이어도 한국 날짜로 센다.
  assert.equal(formatDday(s, new Date("2026-11-13T15:30:00Z")), "오늘 상영");

  assert.ok(html().includes("상영까지 6일"));
  assert.ok(!html({}, true, new Date("2026-11-20T09:00:00+09:00")).includes("data-dday"));
});

test("예매 마감: 요일 포함, 없으면 줄을 뺀다", () => {
  assert.equal(formatDeadlineShort(movieInfo.deadline_date, 11), "13일(금) 밤 11시");
  assert.equal(formatDeadlineShort("2026-10-31T21:30:00+09:00", 11), "10월 31일(토) 밤 9시 30분");
  assert.equal(formatDeadlineShort("2026-11-14T00:00:00+09:00", 11), "13일(금) 밤 12시");
  assert.equal(formatDeadlineShort("not a date", 11), null);
  assert.ok(html().includes("예매 마감 13일(금) 밤 11시"));
  assert.ok(!html({ deadline_date: null }).includes("예매 마감"));
});

test("제목: (광고)가 맨 앞, 제목 없으면 일반 문구", () => {
  assert.equal(buildPromoSubject("악마는 프라다를 입는다"), "(광고) [영화대교] 「악마는 프라다를 입는다」 상영에 초대합니다");
  assert.equal(buildPromoSubject(""), "(광고) [영화대교] 상영에 초대합니다");
  assert.equal(buildPromoSubject(undefined), "(광고) [영화대교] 상영에 초대합니다");
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

test("포스터가 없으면 포스터 칸 없이 제목이 줄 전체", () => {
  assert.ok(html().includes("cid:posterImage"));
  const h = html({}, false);
  assert.ok(!h.includes("cid:posterImage"));
  assert.ok(h.includes("이번 상영"));
});

test("버튼·광고 고지·로고", () => {
  const h = html();
  assert.ok(h.includes('href="https://example.test"'));
  assert.ok(h.includes("좌석 고르러 가기"));
  assert.ok(h.includes("광고성 정보 · 발신: 대구과학고등학교 자율동아리 영화대교 · 더 받고 싶지 않으면 관리자에게 알려 주세요."));
  assert.ok(h.includes("cid:logoH"));
  assert.ok(h.includes("관람 무료 · 선착순"));
});
