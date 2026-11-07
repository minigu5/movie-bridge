"use client";

import { type Dispatch, type SetStateAction } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { activeAdmissionYears } from '../../../lib/schoolEmails';

export type PromoSources = { club: boolean; invited: boolean; g1: boolean; g2: boolean; g3: boolean };

export interface PromoProps {
  sources: PromoSources;
  setSources: Dispatch<SetStateAction<PromoSources>>;
  manualText: string;
  setManualText: (v: string) => void;
  manualPreviewCount: number;
  isResolving: boolean;
  isSending: boolean;
  progress: { current: number; total: number };
  recipients: { email: string; name: string | null }[];
  showConfirm: boolean;
  onResolveClick: () => void;
  onConfirmSend: () => void;
  onRemoveRecipient: (email: string) => void;
  onCancelConfirm: () => void;
}

export default function PromoMailSection({ promo, movieTitle }: { promo: PromoProps; movieTitle: string | undefined }) {
  const p = promo;
  const [yy3, yy2, yy1] = activeAdmissionYears();
  const toggle = (key: keyof PromoSources) => p.setSources((prev) => ({ ...prev, [key]: !prev[key] }));
  const pct = p.progress.total > 0 ? Math.round((p.progress.current / p.progress.total) * 100) : 0;

  return (
    <section className="bg-neutral-800 p-6 rounded-xl border border-orange-600">
      <h2 className="text-xl font-bold text-orange-400 mb-1 flex items-center gap-1.5"><Mail className="w-5 h-5" /> 상영작 홍보 메일 발송</h2>
      <p className="text-neutral-400 text-sm mb-4">
        현재 상영작(<span className="text-neutral-200">{movieTitle || '미설정'}</span>) 기준으로 (광고) 초청 메일을 보냅니다.
        블랙리스트는 자동 제외됩니다.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.club} onChange={() => toggle('club')} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-amber-300 font-bold">동아리원(VIP)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.invited} onChange={() => toggle('invited')} className="w-4 h-4 accent-sky-500" />
          <span className="text-sm text-sky-300 font-bold">초대 명단</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.g1} onChange={() => toggle('g1')} className="w-4 h-4 accent-orange-500" />
          <span className="text-sm text-neutral-200 font-bold">1학년 ({yy1}학번)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.g2} onChange={() => toggle('g2')} className="w-4 h-4 accent-orange-500" />
          <span className="text-sm text-neutral-200 font-bold">2학년 ({yy2}학번)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.g3} onChange={() => toggle('g3')} className="w-4 h-4 accent-orange-500" />
          <span className="text-sm text-neutral-200 font-bold">3학년 ({yy3}학번)</span>
        </label>
      </div>
      <p className="text-neutral-500 text-xs mb-4">
        학년별 발송은 각 학년 001~110번(25학번은 0001~0110번) 학생 이메일(<code>ts{yy1}{yy1 === 25 ? '0001' : '001'}@ts.hs.kr</code> 형식)로 보냅니다. 학년도(3월 2일) 기준 자동 갱신.
      </p>

      <div className="mb-4">
        <label className="block text-neutral-300 mb-1 text-sm font-bold">추가 수동 발송 (선택)</label>
        <textarea
          value={p.manualText}
          onChange={(e) => p.setManualText(e.target.value)}
          placeholder={'이름과 이메일을 붙여넣으면 @ts.hs.kr 이메일만 자동 인식됩니다.\n예) 2208 신민규 <ts250024@ts.hs.kr>'}
          rows={3}
          className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm resize-none"
        />
        <span className="text-neutral-500 text-xs">{p.manualPreviewCount}개 이메일 인식됨</span>
      </div>

      {p.isSending ? (
        <div className="w-full bg-neutral-700 rounded-full h-8 relative overflow-hidden border border-neutral-600">
          <div className="bg-orange-600 h-8 transition-all duration-300" style={{ width: `${pct}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
            안전 발송 중... ({p.progress.current} / {p.progress.total})
          </span>
        </div>
      ) : (
        <button
          onClick={p.onResolveClick}
          disabled={p.isResolving}
          className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition-colors flex items-center justify-center gap-1.5"
        >
          {p.isResolving ? '명단 계산 중...' : (<><Send className="w-4 h-4" /> 체크한 대상에게 홍보 메일 발송하기</>)}
        </button>
      )}

      {p.showConfirm && (
        <div className="fixed inset-0 bg-orange-900/90 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-neutral-900 p-8 rounded-2xl max-w-md w-full border-4 border-orange-500 shadow-[0_0_50px_rgba(249,115,22,0.5)] text-center">
            <h3 className="text-2xl font-black text-white mb-4 flex items-center justify-center gap-1.5"><Mail className="w-6 h-6" /> 대량 메일 발송 확인</h3>
            <div className="bg-orange-950 p-5 rounded-xl text-white border border-orange-800 mb-4">
              <p className="text-sm text-orange-300 mb-1">발송 예정 총 인원 (블랙리스트/중복 제외)</p>
              <p className="text-5xl text-yellow-400 font-black">{p.recipients.length}<span className="text-xl text-white ml-2">명</span></p>
            </div>
            <div className="bg-neutral-950 rounded-xl border border-neutral-700 mb-4 max-h-56 overflow-y-auto text-left">
              <p className="sticky top-0 bg-neutral-950 px-4 py-2 text-xs text-neutral-400 border-b border-neutral-800">
                수신자 목록 (로그인 이력 있으면 이름, 없으면 이메일)
              </p>
              <ul className="divide-y divide-neutral-800">
                {p.recipients.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2 px-4 py-1.5 text-sm text-neutral-200">
                    <span className="truncate" title={r.email}>{r.name || r.email}</span>
                    <button
                      type="button"
                      onClick={() => p.onRemoveRecipient(r.email)}
                      aria-label={`${r.name || r.email} 발송 대상에서 제외`}
                      className="shrink-0 p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-orange-300 text-sm mb-2">발송에 성공한 수신자는 초대 명단에 자동으로 추가되어 예매할 수 있게 됩니다.</p>
            <p className="text-neutral-400 text-sm mb-6">발송 중에는 창을 닫거나 새로고침하지 마세요. 진행 바가 다 찰 때까지 기다려 주세요.</p>
            <div className="flex gap-3">
              <button onClick={p.onCancelConfirm} className="flex-1 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-white font-bold">돌아가기</button>
              <button onClick={p.onConfirmSend} disabled={p.recipients.length === 0} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold flex items-center justify-center gap-1.5"><Send className="w-4 h-4" /> 발송 시작</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
