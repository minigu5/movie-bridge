"use client";

// 로그인 사용자 개인정보 동의 게이트 — 동의 기록이 없거나 처리방침 버전이 바뀌었으면
// 화면 전체를 막는 모달을 띄운다. 동의하지 않으면 로그아웃(비로그인 열람은 계속 가능).
// 실제 차단은 DB(require_privacy_consent 트리거)도 하므로 이 모달은 동의를 받는 창구 역할.

import { useEffect, useState } from 'react';
import { ShieldCheck, ChevronDown, Megaphone } from 'lucide-react';
import { signOutAndClear, type AppProfile } from '../lib/supabase-auth';
import {
  CONSENT_DOCS,
  fetchMyConsent,
  isConsentValid,
  recordConsent,
  type ConsentDoc,
  type ConsentItemKey,
} from '../lib/privacyConsent';

export type ConsentStatus = 'checking' | 'valid' | 'needed';

function ConsentItem({ doc, checked, onChange }: { doc: ConsentDoc; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="border border-neutral-800 rounded-xl bg-neutral-950/40">
      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 shrink-0 accent-orange-500"
        />
        <span className="text-sm font-bold text-white">
          <span className="text-orange-400">[필수]</span> {doc.title}
        </span>
      </label>
      <details className="group border-t border-neutral-800">
        <summary className="flex items-center gap-1 px-4 py-2 text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer select-none list-none">
          내용 보기 <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="px-4 pb-4 space-y-3 max-h-56 overflow-y-auto">
          {doc.rows.map(row => (
            <div key={row.label}>
              <dt className="text-[11px] font-bold text-neutral-400 mb-1">{row.label}</dt>
              <dd>
                <ul className="space-y-1 text-xs text-neutral-400 leading-relaxed list-disc pl-4">
                  {row.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function ConsentSheet({ updated, onComplete }: { updated: boolean; onComplete: () => void }) {
  const [checked, setChecked] = useState<Record<ConsentItemKey, boolean>>({ privacy: false, overseas: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = CONSENT_DOCS.every(d => checked[d.key]);
  const setAll = (v: boolean) => setChecked({ privacy: v, overseas: v });

  const submit = async () => {
    if (!allChecked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordConsent();
      onComplete();
    } catch {
      setError('동의 기록에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setSubmitting(true);
    await signOutAndClear().catch(() => {});
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/95 flex items-center justify-center p-4 z-[100]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-consent-title"
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col max-h-[calc(100dvh-2rem)]"
      >
        <header className="px-6 pt-6 pb-4 text-center">
          <div className="w-14 h-14 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-orange-400" />
          </div>
          <h2 id="privacy-consent-title" className="text-xl font-bold text-white">개인정보 이용 동의</h2>
        </header>

        <div className="px-6 overflow-y-auto space-y-3">
          {updated && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10">
              <Megaphone className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-neutral-200 leading-relaxed">
                <strong className="text-amber-300">개인정보처리방침이 바뀌었습니다.</strong> 바뀐 내용을 확인하고 한 번 더 동의해주세요.
              </p>
            </div>
          )}
          <p className="text-sm text-neutral-400 leading-relaxed">
            예매와 후기 작성을 위해 아래 항목에 동의가 필요합니다. 동의하지 않으면 로그아웃되며, 상영 정보와 좌석 현황은 로그인 없이 볼 수 있습니다.{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
              개인정보처리방침 전문
            </a>
          </p>

          <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-orange-500/50 bg-orange-500/5 cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={e => setAll(e.target.checked)}
              className="w-4 h-4 shrink-0 accent-orange-500"
            />
            <span className="text-sm font-black text-white">전체 동의</span>
          </label>

          {CONSENT_DOCS.map(doc => (
            <ConsentItem
              key={doc.key}
              doc={doc}
              checked={checked[doc.key]}
              onChange={v => setChecked(prev => ({ ...prev, [doc.key]: v }))}
            />
          ))}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <footer className="px-6 pt-4 pb-6 flex flex-col gap-2">
          <button
            onClick={submit}
            disabled={!allChecked || submitting}
            className="w-full py-3.5 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-500 border border-orange-500 transition-colors disabled:bg-neutral-800 disabled:border-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed"
          >
            {submitting ? '처리 중…' : allChecked ? '동의하고 계속하기' : '필수 항목에 모두 동의해주세요'}
          </button>
          <button
            onClick={decline}
            disabled={submitting}
            className="w-full py-2.5 text-sm font-bold text-neutral-500 hover:text-neutral-300 transition-colors disabled:cursor-not-allowed"
          >
            동의하지 않음 (로그아웃)
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function PrivacyConsentGate({
  profile,
  onStatusChange,
}: {
  profile: AppProfile | null;
  onStatusChange?: (status: ConsentStatus) => void;
}) {
  // 확인 결과를 사용자 id와 함께 둔다 → 계정이 바뀌면 새 결과가 올 때까지 자동으로 'checking'.
  const [result, setResult] = useState<{ userId: string; needed: boolean; updated: boolean } | null>(null);
  const userId = profile?.id ?? null;
  const status: ConsentStatus = !userId || result?.userId !== userId ? 'checking' : result.needed ? 'needed' : 'valid';

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchMyConsent(userId)
      .then(c => {
        // 동의한 적은 있는데 무효 = 처리방침 개정으로 재동의
        if (active) setResult({ userId, needed: !isConsentValid(c), updated: !!c?.agreed_at });
      })
      .catch(err => {
        // 조회 실패 시 화면은 막지 않는다(예매 차단은 DB 트리거가 담당).
        console.error('개인정보 동의 확인 실패:', err);
        if (active) setResult({ userId, needed: false, updated: false });
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

  if (!userId || !result || status !== 'needed') return null;
  return <ConsentSheet updated={result.updated} onComplete={() => setResult({ ...result, needed: false })} />;
}
