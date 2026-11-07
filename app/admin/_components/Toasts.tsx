"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { scheduleUndoable } from '../../../lib/undoable';

export type Toast = {
  id: string;
  text: string;
  tone: 'info' | 'error';
  undo?: { secondsLeft: number; onUndo(): void };
  onClose?(): void;
};

const INFO_MS = 4000;
let seq = 0;
const nextId = () => `t${++seq}`;

// 화면 아래 짧은 알림. info는 4초 뒤 사라지고 error는 닫기 전까지 남는다.
// undoable은 delayMs 뒤 run을 실행하고, 그동안 "되돌리기 · n" 버튼을 보여 준다.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const intervals = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const remove = useCallback((id: string) => {
    const iv = intervals.current.get(id);
    if (iv) { clearInterval(iv); intervals.current.delete(id); }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const map = intervals.current;
    return () => { map.forEach(clearInterval); map.clear(); };
  }, []);

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    const id = nextId();
    setToasts((prev) => [...prev, { id, text, tone, onClose: () => remove(id) }]);
    if (tone === 'info') setTimeout(() => remove(id), INFO_MS);
  }, [remove]);

  // 되돌리기 핸들을 돌려준다(화면 안 다른 곳에서도 같은 되돌리기를 부를 수 있게).
  const undoable = useCallback((text: string, run: () => Promise<void>, delayMs: number = 5000) => {
    const id = nextId();
    const handle = scheduleUndoable(async () => {
      remove(id);
      try {
        await run();
      } catch (err: any) {
        notify(err?.message || '실패했어요', 'error');
      }
    }, delayMs);
    const onUndo = () => { if (handle.cancel()) remove(id); };
    const started = Date.now();
    const secondsLeftNow = () => Math.max(1, Math.ceil((delayMs - (Date.now() - started)) / 1000));
    setToasts((prev) => [...prev, { id, text, tone: 'info', undo: { secondsLeft: secondsLeftNow(), onUndo } }]);
    intervals.current.set(id, setInterval(() => {
      setToasts((prev) => prev.map((t) => (t.id === id && t.undo ? { ...t, undo: { ...t.undo, secondsLeft: secondsLeftNow() } } : t)));
    }, 1000));
    return { id, undo: onUndo };
  }, [notify, remove]);

  return { toasts, notify, undoable };
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed z-[200] left-3 right-3 bottom-[84px] md:left-auto md:right-8 md:bottom-8 md:w-[420px] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-center justify-between gap-3 py-2.5 pl-3.5 pr-2.5 bg-[#26262A] border border-line-strong ${t.tone === 'error' ? 'border-l-2 border-l-accent' : ''}`}
        >
          <span className="text-[13px] text-ink min-w-0 break-keep">{t.text}</span>
          {t.undo ? (
            <button
              type="button"
              onClick={t.undo.onUndo}
              className="shrink-0 h-9 px-3 border border-ink text-ink text-[13px] font-bold whitespace-nowrap"
            >
              되돌리기 · {t.undo.secondsLeft}
            </button>
          ) : t.tone === 'error' && t.onClose ? (
            <button type="button" onClick={t.onClose} aria-label="알림 닫기" className="shrink-0 p-1.5 text-dim hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
