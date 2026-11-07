// node --test lib/undoable.test.mjs
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { scheduleUndoable } from "./undoable.ts";

afterEach(() => mock.timers.reset());

test("5초 뒤 실행", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  scheduleUndoable(() => { n++; });
  mock.timers.tick(4999);
  assert.equal(n, 0);
  mock.timers.tick(1);
  assert.equal(n, 1);
});

test("cancel하면 실행 안 됨", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  const h = scheduleUndoable(() => { n++; });
  assert.equal(h.cancel(), true);
  mock.timers.tick(6000);
  assert.equal(n, 0);
});

test("두 개는 서로 독립", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const log = [];
  const a = scheduleUndoable(() => { log.push("a"); });
  scheduleUndoable(() => { log.push("b"); });
  a.cancel();
  mock.timers.tick(5000);
  assert.deepEqual(log, ["b"]);
});

test("실행 뒤 cancel은 false", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  const h = scheduleUndoable(() => { n++; });
  mock.timers.tick(5000);
  assert.equal(h.cancel(), false);
  assert.equal(n, 1);
});

test("flushNow는 바로 한 번만 실행", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  const h = scheduleUndoable(() => { n++; });
  h.flushNow();
  assert.equal(n, 1);
  mock.timers.tick(5000);
  assert.equal(n, 1);
  assert.equal(h.cancel(), false);
});

test("delayMs를 따름", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  scheduleUndoable(() => { n++; }, 1000);
  mock.timers.tick(1000);
  assert.equal(n, 1);
});
