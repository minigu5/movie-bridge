// node --test lib/ticketMailHtml.test.mjs  (Node 22.6+ 타입 제거로 .ts를 바로 불러온다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTicketMailHtml } from "./ticketMailHtml.ts";

const RED = "#E0443B";
const base = {
  status: "confirmed",
  displayId: "3F2A9C1B",
  movieTitle: "인사이드 아웃 2",
  ageRating: "전체관람가",
  movieDate: "2026년 11월 21일 (토) 오전 9:00",
  venue: "중강당",
  popcornLines: ["오리지널 버터 팝콘 1개"],
  priceText: "2,500원 · 결제 완료",
  seat: "E7",
  name: "홍길동",
  hasPoster: true,
  totalPrice: 2500,
  baseUrl: "https://example.test",
  account: "0000 테스트은행 예금주",
};
const html = (over = {}) => buildTicketMailHtml({ ...base, ...over });

test("확정: 빨간 좌석 번호와 빨간 '확정' 도장", () => {
  const h = html();
  assert.match(h, new RegExp(`color:${RED}[^"]*">E7<`));
  assert.match(h, new RegExp(`color:${RED}[^"]*">확정<`));
  assert.ok(h.includes("예매가 확정되었어요"));
  assert.ok(h.includes("웹사이트에서 확인하기"));
});

test("변경: 빨간 '변경' 도장", () => {
  const h = html({ status: "changed" });
  assert.ok(h.includes("좌석이 바뀌었어요"));
  assert.match(h, new RegExp(`color:${RED}[^"]*">변경<`));
});

test("취소: 빨강이 하나도 없고 좌석에 취소선, 버튼 없음", () => {
  const h = html({ status: "canceled" });
  assert.equal(h.split(RED).length - 1, 0);
  assert.match(h, /line-through[^"]*">E7</);
  assert.ok(!h.includes("웹사이트에서 확인하기"));
  assert.ok(h.includes("예매가 취소되었어요"));
});

test("결제 대기: 입금 안내 칸에 금액, QR, 계좌", () => {
  const h = html({ status: "pending", totalPrice: 5000 });
  assert.ok(h.includes("입금을 기다리고 있어요"));
  assert.ok(h.includes("30분 안에 입금해 주세요"));
  assert.ok(h.includes("5,000원"));
  assert.ok(h.includes('src="https://example.test/qr.jpeg"'));
  assert.ok(h.includes("0000 테스트은행 예금주"));
  assert.ok(h.includes(">입금 대기<"));
});

test("포스터가 없으면 같은 자리에 빈 칸을 남긴다", () => {
  const withPoster = html();
  const without = html({ hasPoster: false });
  assert.ok(withPoster.includes('src="cid:poster"'));
  assert.ok(!without.includes("cid:poster"));
  assert.ok(without.includes('data-poster-placeholder'));
});

test("팝콘이 없으면 팝콘 줄을 빼고, 여러 종류면 줄바꿈", () => {
  assert.ok(!html({ popcornLines: [] }).includes(">팝콘<"));
  assert.ok(html({ popcornLines: ["오리지널 버터 팝콘 1개", "카라멜맛 팝콘 2개"] }).includes("오리지널 버터 팝콘 1개<br>카라멜맛 팝콘 2개"));
});

test("사용자 값은 이스케이프한다", () => {
  const h = html({ movieTitle: "<script>alert(1)</script>", name: 'a"b' });
  assert.ok(!h.includes("<script>alert"));
  assert.ok(h.includes("&lt;script&gt;"));
  assert.ok(h.includes("a&quot;b"));
});

test("레이아웃을 흔들던 배경 이미지·flex·position을 쓰지 않는다", () => {
  for (const status of ["confirmed", "pending", "changed", "canceled"]) {
    const h = html({ status });
    assert.ok(!/background-image|display:\s*flex|position:\s*(absolute|relative)/.test(h), status);
  }
});
