// node --test lib/seatGrid.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVipSeats, resolveVipZone, getGridRows, getGridCols } from "./seatGrid.ts";

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

test("빈 VIP 칸(null·''·0)은 기본 네모로 채운다", () => {
  assert.deepEqual(resolveVipZone(false, { mid_vip_start_row: "", mid_vip_end_row: null, mid_vip_start_col: 0, mid_vip_end_col: null }), { startRow: "A", endRow: "C", startCol: 5, endCol: 10 });
  assert.deepEqual(resolveVipZone(true, {}), { startRow: "A", endRow: "C", startCol: 10, endCol: 18 });
});

test("저장된 거꾸로 범위(A3~A2)는 기본값으로 바꾸지 않고 0석", () => {
  const cfg = { mid_vip_start_row: "A", mid_vip_end_row: "A", mid_vip_start_col: 3, mid_vip_end_col: 2 };
  assert.deepEqual(resolveVipZone(false, cfg), { startRow: "A", endRow: "A", startCol: 3, endCol: 2 });
  assert.equal(computeVipSeats(false, getGridRows(false), getGridCols(false), cfg).size, 0);
});
