// 되돌리기 가능한 지연 실행. 누르면 바로 된 것처럼 보이고, delayMs가 지나야 실제로 run을 부른다.
// 그 사이 cancel()하면 실행되지 않는다. 창을 닫으면 실행되지 않는 것은 받아들인 한계다(스펙 §5.2).
export function scheduleUndoable(
  run: () => void | Promise<void>,
  delayMs: number = 5000,
): { cancel(): boolean; flushNow(): void } {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    void run();
  };
  const timer = setTimeout(fire, delayMs);
  return {
    // 이미 실행됐거나 취소됐으면 false
    cancel() {
      if (done) return false;
      done = true;
      clearTimeout(timer);
      return true;
    },
    flushNow: fire,
  };
}
