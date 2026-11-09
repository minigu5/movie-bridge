// node --test lib/restrictionMailHtml.test.mjs  (Node 22.6+ 타입 제거로 .ts를 바로 불러온다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRestrictionMailHtml, buildRestrictionSubject } from "./restrictionMailHtml.ts";

test("제목", () => {
  assert.equal(buildRestrictionSubject(true), "[영화대교] 예매 제한 안내");
  assert.equal(buildRestrictionSubject(false), "[영화대교] 예매 제한 해제 안내");
});

test("'블랙리스트'라는 말은 제목·본문 어디에도 없다", () => {
  for (const added of [true, false]) {
    assert.ok(!buildRestrictionSubject(added).includes("블랙리스트"));
    assert.ok(!buildRestrictionMailHtml({ name: "홍길동", added, reason: "자리 정리 안 함" }).includes("블랙리스트"));
  }
});

test("제한: 안내 문구와 문의 문구, 옛 고정 사유 없음", () => {
  const h = buildRestrictionMailHtml({ name: "홍길동", added: true });
  assert.ok(h.includes("홍길동 님, 당분간 영화대교 예매가 제한돼요."));
  assert.ok(h.includes("문의는 영화대교 동아리로 연락해 주세요."));
  assert.ok(!h.includes("미정리"));
  assert.ok(h.includes("cid:logoH"));
});

test("사유 줄은 사유가 있을 때만", () => {
  assert.ok(!buildRestrictionMailHtml({ name: "a", added: true }).includes("data-reason-row"));
  assert.ok(!buildRestrictionMailHtml({ name: "a", added: true, reason: "   " }).includes("data-reason-row"));
  assert.ok(!buildRestrictionMailHtml({ name: "a", added: true, reason: null }).includes("data-reason-row"));
  const h = buildRestrictionMailHtml({ name: "a", added: true, reason: "상영 중 소란" });
  assert.ok(h.includes("data-reason-row"));
  assert.ok(h.includes("상영 중 소란"));
  // 해제 메일에는 사유를 넣지 않는다.
  assert.ok(!buildRestrictionMailHtml({ name: "a", added: false, reason: "x" }).includes("data-reason-row"));
});

test("사유는 이스케이프하고 줄바꿈은 <br>", () => {
  const h = buildRestrictionMailHtml({ name: "<b>이름</b>", added: true, reason: '<img src=x onerror="a">\n둘째 줄' });
  assert.ok(!h.includes("<img src=x"));
  assert.ok(h.includes("&lt;img src=x onerror=&quot;a&quot;&gt;<br>둘째 줄"));
  assert.ok(h.includes("&lt;b&gt;이름&lt;/b&gt; 님"));
});

test("해제: 다시 예매할 수 있다는 문구", () => {
  const h = buildRestrictionMailHtml({ name: "홍길동", added: false });
  assert.ok(h.includes("홍길동 님, 다시 영화대교 예매를 할 수 있어요."));
  assert.ok(!h.includes("제한돼요"));
});

test("옛 색이 남지 않는다", () => {
  for (const added of [true, false]) for (const reason of [null, "사유"]) {
    const h = buildRestrictionMailHtml({ name: "홍길동", added, reason }).toUpperCase();
    for (const bad of ["#E0443B", "#0F0F10", "#F2F2F0"]) assert.ok(!h.includes(bad), `${added} ${bad}`);
    assert.ok(h.includes("#0E0D0B") && h.includes("#F4F1EA"));
  }
});
