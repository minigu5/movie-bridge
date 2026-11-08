// node --test lib/adminPeople.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePeople, filterPeople, countByFilter } from "./adminPeople.ts";

const empty = { profiles: [], invited: [], club: [], admins: [], blacklist: [] };

test("여러 명단의 같은 사람은 한 줄", () => {
  const r = mergePeople({ ...empty, profiles: [{ email: "A@ts.hs.kr", name: "가", student_id: "2101", role: "student" }], invited: [{ email: "a@ts.hs.kr" }], club: [{ email: "a@ts.hs.kr" }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].club, true);
  assert.equal(r[0].canBookDirect, true);
  assert.equal(r[0].email, "a@ts.hs.kr");
  assert.equal(r[0].name, "가");
  assert.equal(r[0].studentId, "2101");
});

test("로그인 안 한 사람은 이름 null", () => {
  const r = mergePeople({ ...empty, invited: [{ email: "b@ts.hs.kr" }] });
  assert.equal(r[0].name, null);
  assert.equal(r[0].profileId, null);
});

test("교직원은 isStaff", () => {
  const r = mergePeople({ ...empty, profiles: [{ id: "p1", email: "t@ts.hs.kr", name: "선생", student_id: null, role: "staff" }] });
  assert.equal(r[0].isStaff, true);
  assert.equal(r[0].profileId, "p1");
});

test("차단된 사람은 canBook에서 빠짐", () => {
  const rows = mergePeople({ ...empty, invited: [{ email: "c@x" }], blacklist: [{ email: "c@x" }] });
  assert.equal(filterPeople(rows, "canBook", "").length, 0);
  assert.equal(filterPeople(rows, "blocked", "").length, 1);
  assert.equal(filterPeople(rows, "cannotBook", "").length, 1);
});

test("동아리원·관리자는 초대 명단 없이도 canBook", () => {
  const rows = mergePeople({ ...empty, club: [{ email: "d@x" }], admins: [{ email: "e@x" }], profiles: [{ email: "f@x", name: "바", student_id: "1101", role: "student" }] });
  assert.deepEqual(filterPeople(rows, "canBook", "").map((r) => r.email).sort(), ["d@x", "e@x"]);
  assert.deepEqual(filterPeople(rows, "cannotBook", "").map((r) => r.email), ["f@x"]);
});

test("검색은 학번도 찾음", () => {
  const rows = mergePeople({ ...empty, profiles: [{ email: "a@ts.hs.kr", name: "가", student_id: "2101", role: "student" }, { email: "b@ts.hs.kr", name: "나", student_id: "2202", role: "student" }] });
  assert.equal(filterPeople(rows, "all", "2101").length, 1);
  assert.equal(filterPeople(rows, "all", "나").length, 1);
  assert.equal(filterPeople(rows, "all", "B@TS").length, 1);
});

test("정렬: 관리자 → 동아리원 → 이름(없으면 이메일)", () => {
  const rows = mergePeople({
    ...empty,
    profiles: [{ email: "z@x", name: "가", student_id: null, role: "staff" }],
    invited: [{ email: "a@x" }],
    club: [{ email: "c@x" }],
    admins: [{ email: "m@x" }],
  });
  // a@x는 이름이 없어 이메일로, z@x는 이름 "가"로 비교한다(ko 정렬: 한글 이름이 이메일보다 앞).
  assert.deepEqual(rows.map((r) => r.email), ["m@x", "c@x", "z@x", "a@x"]);
});

test("countByFilter 합계", () => {
  const rows = mergePeople({ ...empty, invited: [{ email: "a@x" }, { email: "b@x" }], club: [{ email: "c@x" }], admins: [{ email: "c@x" }], blacklist: [{ email: "b@x" }], profiles: [{ email: "d@x", name: "라", student_id: "1101", role: "student" }] });
  const c = countByFilter(rows);
  assert.equal(c.all, rows.length);
  assert.equal(c.all, 4);
  assert.equal(c.canBook, 2);
  assert.equal(c.club, 1);
  assert.equal(c.admin, 1);
  assert.equal(c.blocked, 1);
  assert.equal(c.cannotBook, 2);
});

test("차단 사유: 있으면 blockReason, 없거나 공백이면 null", () => {
  const rows = mergePeople({ ...empty, blacklist: [{ email: "a@x", reason: "  자리 정리 안 함 " }, { email: "b@x", reason: null }, { email: "c@x" }, { email: "d@x", reason: "   " }] });
  const by = Object.fromEntries(rows.map((r) => [r.email, r.blockReason]));
  assert.deepEqual(by, { "a@x": "자리 정리 안 함", "b@x": null, "c@x": null, "d@x": null });
  // 같은 사람이 사유 없이 한 번 더 들어와도(되돌리기 대기 중 등) 사유를 지우지 않는다.
  const dup = mergePeople({ ...empty, blacklist: [{ email: "a@x", reason: "사유" }, { email: "a@x" }] });
  assert.equal(dup[0].blockReason, "사유");
  assert.equal(mergePeople({ ...empty, invited: [{ email: "e@x" }] })[0].blockReason, null);
});
