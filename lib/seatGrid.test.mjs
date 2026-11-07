// node --test lib/seatGrid.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVipSeats, getGridRows, getGridCols } from "./seatGrid.ts";

test("vip_enabled false면 VIP 0석", () => {
  assert.equal(computeVipSeats(false, getGridRows(false), getGridCols(false), { vip_enabled: false }).size, 0);
});

test("vip_enabled 없으면 기본 A~C열 5~10번", () => {
  const s = computeVipSeats(false, getGridRows(false), getGridCols(false), {});
  assert.equal(s.size, 18);
  assert.ok(s.has("A05"));
});

test("vip_enabled true/null은 켜짐으로 본다", () => {
  assert.equal(computeVipSeats(false, getGridRows(false), getGridCols(false), { vip_enabled: true }).size, 18);
  assert.equal(computeVipSeats(false, getGridRows(false), getGridCols(false), { vip_enabled: null }).size, 18);
});

test("대강당 기본 VIP는 B구역 A~C열", () => {
  const s = computeVipSeats(true, getGridRows(true), getGridCols(true), {});
  assert.equal(s.size, 27);
  assert.ok(s.has("B001"));
});
