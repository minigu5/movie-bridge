// node --test lib/seatZones.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { getZones, zoneOf, seatsInZone, countBookable, initialZone } from "./seatZones.ts";

test("중강당은 2구역, 대강당은 6구역", () => {
  assert.deepEqual(getZones(false).map((z) => z.key), ["L", "R"]);
  assert.deepEqual(getZones(true).map((z) => z.key), ["FL", "FC", "FR", "BL", "BC", "BR"]);
});

test("zoneOf", () => {
  assert.equal(zoneOf(false, "B31"), "R");
  assert.equal(zoneOf(true, "B050"), "FC");
  assert.equal(zoneOf(true, "C150"), "BR");
  assert.equal(zoneOf(false, "Z99"), null);
});

test("중강당 R구역 마지막 행 마지막 칸은 빈 칸(B63 없음)", () => {
  const rows = seatsInZone(false, getZones(false)[1]);
  assert.equal(rows.length, 9);
  assert.equal(rows[8][6].seatId, null);
});

test("countBookable: 예매·대기 빼고, 불편 좌석은 셈, VIP는 동아리원만", () => {
  const z = getZones(false)[0];
  const vip = new Set(["A05", "A06"]);
  const taken = new Set(["A01"]);
  assert.equal(countBookable(false, z, taken, vip, false), 63 - 1 - 2);
  assert.equal(countBookable(false, z, taken, vip, true), 63 - 1);
});

test("전체 남은 좌석(중강당 125석)", () => {
  assert.equal(countBookable(false, null, new Set(), new Set(), true), 125);
});

test("전체 남은 좌석(대강당 486석)", () => {
  assert.equal(countBookable(true, null, new Set(), new Set(), true), 486);
});

test("대강당 구역 경계(A~H / I~R, 열 3분할)", () => {
  const zs = Object.fromEntries(getZones(true).map((z) => [z.key, z]));
  assert.deepEqual([zs.FL.rowStart, zs.FL.rowEnd, zs.FL.colStart, zs.FL.colEnd], [0, 7, 0, 8]);
  assert.deepEqual([zs.BR.rowStart, zs.BR.rowEnd, zs.BR.colStart, zs.BR.colEnd], [8, 17, 18, 26]);
  assert.deepEqual([zs.BC.gridRow, zs.BC.gridCol], [1, 1]);
});

test("initialZone 우선순위", () => {
  assert.equal(initialZone(true, "C150", "A001"), "BR");
  assert.equal(initialZone(true, null, "A001"), "FL");
  assert.equal(initialZone(false, null, null), "L");
});
