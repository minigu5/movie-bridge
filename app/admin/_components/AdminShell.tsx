"use client";

import type { ReactNode } from 'react';
import logoDark from '@/public/brand/logo-horizontal-dark.svg';

export type AdminSection = 'reservations' | 'movie' | 'mail' | 'people' | 'log';

export const ADMIN_SECTIONS: { key: AdminSection; label: string }[] = [
  { key: 'reservations', label: '예매' },
  { key: 'movie', label: '상영' },
  { key: 'mail', label: '메일' },
  { key: 'people', label: '사람' },
  { key: 'log', label: '기록' },
];

interface Props {
  active: AdminSection;
  onChange(s: AdminSection): void;
  pendingCount: number;
  email?: string;
  onSignOut?(): void;
  children: ReactNode;
}

// 관리자 뼈대: md 이상은 220px 왼쪽 메뉴, md 미만은 위 로고 바 + 아래 5칸 메뉴.
export default function AdminShell({ active, onChange, pendingCount, email, onSignOut, children }: Props) {
  return (
    <div className="min-h-screen bg-ground text-ink md:flex">
      <aside className="hidden md:flex md:flex-col md:gap-7 md:w-[220px] md:shrink-0 md:sticky md:top-0 md:h-screen border-r border-line px-4 py-6">
        <div className="flex flex-col gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDark.src} alt="영화대교" className="w-[120px] h-auto block" />
          <span className="text-xs text-dim tracking-[0.2em]">관리</span>
        </div>
        <nav className="flex flex-col gap-0.5 text-[15px]">
          {ADMIN_SECTIONS.map((s) => {
            const on = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onChange(s.key)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center justify-between h-11 px-3 rounded-lg text-left ${on ? 'bg-raised text-ink font-bold' : 'text-sub font-medium hover:text-ink'}`}
              >
                <span>{s.label}</span>
                {s.key === 'reservations' && pendingCount > 0 && (
                  <span className="text-xs font-bold text-accent">대기 {pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 text-[13px] px-3">
          <a href="/" className="py-2 text-sub hover:text-ink">예매 화면 열기</a>
          <a href="/print" className="py-2 text-sub hover:text-ink">발권기 열기</a>
          {email && <span className="pt-3 mt-2 border-t border-line text-xs text-mute truncate" title={email}>{email}</span>}
          {onSignOut && (
            <button type="button" onClick={onSignOut} className="py-2 text-left text-sub hover:text-ink">로그아웃</button>
          )}
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDark.src} alt="영화대교" className="w-[88px] h-auto block" />
          <span className="text-[11px] text-dim tracking-[0.2em]">관리</span>
        </div>
        {onSignOut && (
          <button type="button" onClick={onSignOut} className="text-xs text-dim hover:text-ink">로그아웃</button>
        )}
      </header>

      <main className="flex-1 min-w-0 px-4 pt-5 pb-32 md:px-12 md:pt-10 md:pb-20">{children}</main>

      <nav className="md:hidden fixed left-0 right-0 bottom-0 z-[150] grid grid-cols-5 bg-card border-t border-line pb-[max(14px,env(safe-area-inset-bottom))]">
        {ADMIN_SECTIONS.map((s) => {
          const on = s.key === active;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange(s.key)}
              aria-current={on ? 'page' : undefined}
              className={`relative h-[58px] flex flex-col items-center justify-center gap-[3px] text-xs ${on ? 'text-ink font-bold' : 'text-dim font-medium'}`}
            >
              <span className={`block w-[18px] h-[2px] ${on ? 'bg-ink' : 'bg-transparent'}`} />
              {s.label}
              {s.key === 'reservations' && pendingCount > 0 && (
                <span className="absolute top-2 right-[18px] text-[10px] font-bold text-accent">{pendingCount}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
