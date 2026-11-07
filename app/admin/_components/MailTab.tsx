"use client";

import { type Dispatch, type SetStateAction } from 'react';
import { X } from 'lucide-react';
import { activeAdmissionYears, gradeEmails } from '../../../lib/schoolEmails';
import type { PromoRecipient } from '../../../lib/promoRecipients';

export type PromoSources = { club: boolean; invited: boolean; g1: boolean; g2: boolean; g3: boolean };

export interface MailTabProps {
  movieTitle: string | undefined;
  sourceCounts: { club: number; invited: number };
  sources: PromoSources;
  setSources: Dispatch<SetStateAction<PromoSources>>;
  manualText: string;
  setManualText: (v: string) => void;
  manualPreviewCount: number;
  isSending: boolean;
  progress: { current: number; total: number };
  recipients: PromoRecipient[]; // X로 뺀 사람은 이미 걸러져 있다
  onRemoveRecipient: (r: PromoRecipient) => void;
  // X로 뺀 사람(다시 세도 남는다). "다시 넣기"로 돌린다.
  removedRecipients: PromoRecipient[];
  onRestoreRecipient: (email: string) => void;
  recipientCount: number | null;
  // 겹침·차단으로 빠진 수(서버가 계산해 준 경우만)
  excluded: { overlap: number; blocked: number } | null;
  isResolving: boolean;
  onSend(): void;
  sendCountdown: number | null;
  onStopCountdown(): void;
  showRecipients: boolean;
  onToggleRecipients(): void;
}

function SourceRow({ checked, onChange, title, detail, count, disabled }: { checked: boolean; onChange(): void; title: string; detail: string; count: number; disabled: boolean }) {
  return (
    <label className={`flex items-center gap-3.5 min-h-[54px] border-b border-line ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="w-5 h-5 m-0 shrink-0 accent-[#F2F2F0]" />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-xs text-dim break-keep">{detail}</span>
      </span>
      <span className="shrink-0 text-sm text-sub">{count}명</span>
    </label>
  );
}

export default function MailTab(p: MailTabProps) {
  const [yy3, yy2, yy1] = activeAdmissionYears();
  const toggle = (key: keyof PromoSources) => p.setSources((prev) => ({ ...prev, [key]: !prev[key] }));
  const pct = p.progress.total > 0 ? Math.round((p.progress.current / p.progress.total) * 100) : 0;
  const gradeDetail = (yy: number) => `${yy}학번 · 학번 ${yy === 25 ? '0001~0110' : '001~110'} 학교 이메일`;
  // 보내기 직전·보내는 중에는 대상을 못 바꾸게 잠근다(보이는 명단 = 보내는 명단).
  const locked = p.isSending || p.sendCountdown !== null;
  const canSend = !locked && !p.isResolving && !!p.recipientCount;

  return (
    <div className="max-w-[1020px] flex flex-col gap-9">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-[28px] font-black tracking-[-0.02em]">메일</h1>
        <p className="text-sm text-dim break-keep">「{p.movieTitle || '상영작 없음'}」 초대 메일을 보냅니다. 받은 사람은 예매할 수 있게 초대 명단에 들어가요.</p>
      </div>

      <div className="flex flex-wrap gap-10 items-start">
        <section className="flex-[1_1_420px] min-w-0 flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-black border-b border-ink pb-2.5">1 · 누구에게 보낼까요</h2>
            <div className="flex flex-col">
              <SourceRow checked={p.sources.club} onChange={() => toggle('club')} title="동아리원" detail="사람 메뉴의 동아리원 전체" count={p.sourceCounts.club} disabled={locked} />
              <SourceRow checked={p.sources.invited} onChange={() => toggle('invited')} title="초대 명단" detail="전에 초대 메일을 받았거나 직접 넣은 사람" count={p.sourceCounts.invited} disabled={locked} />
              <SourceRow checked={p.sources.g1} onChange={() => toggle('g1')} title="1학년" detail={gradeDetail(yy1)} count={gradeEmails(yy1).length} disabled={locked} />
              <SourceRow checked={p.sources.g2} onChange={() => toggle('g2')} title="2학년" detail={gradeDetail(yy2)} count={gradeEmails(yy2).length} disabled={locked} />
              <SourceRow checked={p.sources.g3} onChange={() => toggle('g3')} title="3학년" detail={gradeDetail(yy3)} count={gradeEmails(yy3).length} disabled={locked} />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <h2 className="text-base font-black border-b border-ink pb-2.5">2 · 더 넣을 사람 <span className="text-xs font-medium text-dim">(선택)</span></h2>
            <label htmlFor="mail-extra" className="text-xs text-dim">이름과 이메일을 아무렇게나 붙여넣어도 학교 이메일만 골라내요.</label>
            <textarea
              id="mail-extra"
              rows={3}
              value={p.manualText}
              onChange={(e) => p.setManualText(e.target.value)}
              placeholder="예) 2208 신민규 <ts250024@ts.hs.kr>"
              disabled={locked}
              className="w-full px-3.5 py-3 bg-card border border-line text-ink text-sm resize-y outline-none focus:border-line-bold placeholder:text-mute disabled:opacity-50"
            />
            <span className="text-xs text-sub">이메일 <b className="text-ink">{p.manualPreviewCount}</b>개 찾음</span>
          </div>
        </section>

        <aside className="w-full md:w-[300px] md:flex-[0_0_300px] flex flex-col gap-4 p-6 bg-card border border-line">
          <span className="text-[13px] text-dim">보낼 사람</span>
          <span className="text-[44px] font-black tracking-[-0.02em] leading-none">
            {p.recipientCount ?? '—'}<span className="text-lg font-bold ml-1">명</span>
            {p.isResolving && <span className="ml-2 text-xs font-normal text-mute align-middle">세는 중</span>}
          </span>
          {p.excluded && (p.excluded.overlap > 0 || p.excluded.blocked > 0) && (
            <div className="flex flex-col gap-1.5 text-[13px] text-sub border-t border-line pt-3.5">
              <span className="flex justify-between"><span>겹치는 사람 빼기</span><span>−{p.excluded.overlap}</span></span>
              <span className="flex justify-between"><span>차단한 사람 빼기</span><span>−{p.excluded.blocked}</span></span>
            </div>
          )}
          <button
            type="button"
            onClick={p.onToggleRecipients}
            aria-expanded={p.showRecipients}
            disabled={p.recipients.length === 0}
            className="h-10 border border-line-strong text-ink text-[13px] font-bold disabled:opacity-40"
          >
            {p.showRecipients ? '받는 사람 목록 접기' : '받는 사람 목록 보기'}
          </button>
          {p.showRecipients && p.recipients.length > 0 && (
            <ul className="max-h-64 overflow-y-auto border border-line divide-y divide-line">
              {p.recipients.map((r) => (
                <li key={r.email} className="flex items-center justify-between gap-2 pl-3 pr-1 py-1 text-[13px] text-sub">
                  <span className="truncate" title={r.email}>{r.name || r.email}</span>
                  <button
                    type="button"
                    onClick={() => p.onRemoveRecipient(r)}
                    disabled={locked}
                    aria-label={`${r.name || r.email} 받는 사람에서 빼기`}
                    className="shrink-0 p-1.5 text-mute hover:text-ink disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {p.removedRecipients.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-3.5">
              <span className="text-[13px] text-sub">직접 뺀 사람 {p.removedRecipients.length}명 · 보내지 않아요</span>
              <ul className="max-h-40 overflow-y-auto border border-line divide-y divide-line">
                {p.removedRecipients.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2 pl-3 pr-1 py-1 text-[13px] text-mute">
                    <span className="truncate" title={r.email}>{r.name || r.email}</span>
                    <button
                      type="button"
                      onClick={() => p.onRestoreRecipient(r.email)}
                      disabled={locked}
                      className="shrink-0 h-8 px-2.5 text-xs font-bold text-sub hover:text-ink disabled:opacity-40"
                    >
                      다시 넣기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.isSending ? (
            <div className="flex flex-col gap-2">
              <div className="h-2 bg-line"><div className="h-2 bg-ink transition-all duration-300" style={{ width: `${pct}%` }} /></div>
              <span className="text-[13px] text-ink">보내는 중 {p.progress.current} / {p.progress.total}</span>
            </div>
          ) : p.sendCountdown !== null ? (
            <button type="button" onClick={p.onStopCountdown} className="h-[52px] border border-ink text-ink text-[15px] font-bold">
              5초 뒤 보내요 · 멈추기 {p.sendCountdown}
            </button>
          ) : (
            <button type="button" onClick={p.onSend} disabled={!canSend} className="h-[52px] bg-ink text-ground text-[15px] font-bold disabled:opacity-40">
              보내기
            </button>
          )}
          <span className="text-xs leading-relaxed text-mute break-keep">누르면 5초 뒤 보내기 시작해요. 그 사이엔 멈출 수 있어요. 다 보낼 때까지 창을 닫지 마세요.</span>
        </aside>
      </div>

      <section className="flex flex-col gap-2.5 border-t border-line pt-5">
        <h2 className="text-sm font-bold text-sub">자동으로 나가는 메일</h2>
        <p className="text-[13px] leading-relaxed text-dim break-keep">예매 확정 · 결제 승인 · 취소 메일은 그 일이 생기면 알아서 보내요. 여기서 따로 할 일은 없어요.</p>
      </section>
    </div>
  );
}
