"use client";

// 개인정보처리방침 페이지의 "내 동의 내역" 카드. 페이지는 비로그인도 볼 수 있고,
// 이 카드만 로그인한 사람에게 보인다. 철회하면 동의 기록을 지우고 바로 로그아웃한다.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { signOutAndClear } from '@/lib/supabase-auth';
import {
  CONSENT_DOCS,
  PRIVACY_CONSENT_VERSION,
  fetchMyConsent,
  isConsentValid,
  withdrawConsent,
  type PrivacyConsentRecord,
} from '@/lib/privacyConsent';

type Phase = 'loading' | 'hidden' | 'ready' | 'confirming' | 'working' | 'withdrawn' | 'error';

function formatKst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-t border-neutral-800 text-sm">
      <span className="w-20 shrink-0 font-semibold text-neutral-400">{label}</span>
      <span className="text-neutral-200">{children}</span>
    </div>
  );
}

export default function ConsentStatusCard() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [consent, setConsent] = useState<PrivacyConsentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) setPhase('hidden'); return; }
      try {
        const c = await fetchMyConsent(session.user.id);
        if (!active) return;
        setConsent(c);
        setPhase('ready');
      } catch {
        if (active) setPhase('error');
      }
    })();
    return () => { active = false; };
  }, []);

  const withdraw = async () => {
    setPhase('working');
    setError(null);
    try {
      await withdrawConsent();
      // 동의 없이 로그인 상태가 남지 않게 바로 끊는다.
      await signOutAndClear().catch(() => {});
      setPhase('withdrawn');
    } catch {
      setError('동의 철회에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setPhase('confirming');
    }
  };

  if (phase === 'loading' || phase === 'hidden') return null;

  const card = 'bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-6';

  if (phase === 'error') {
    return (
      <section className={card}>
        <h2 className="text-base font-bold text-white mb-2">내 동의 내역</h2>
        <p className="text-sm text-neutral-400">지금은 동의 내역을 불러올 수 없습니다. 잠시 후 새로고침해주세요.</p>
      </section>
    );
  }

  if (phase === 'withdrawn') {
    return (
      <section className={`${card} border-amber-500/40`}>
        <h2 className="text-base font-bold text-white mb-2">동의를 철회했습니다</h2>
        <p className="text-sm text-neutral-300 leading-relaxed">
          로그아웃되었습니다. 다시 예매하려면 로그인한 뒤 다시 동의해주세요.
          이미 저장된 예매·후기 정보의 삭제를 원하시면 아래 개인정보 보호책임자에게 요청해주세요.
        </p>
      </section>
    );
  }

  const valid = isConsentValid(consent);
  const agreed = !!consent?.agreed_at && !consent.withdrawn_at;
  const agreedTitles = CONSENT_DOCS.filter(d => consent?.items?.[d.key]).map(d => d.title);

  return (
    <section className={card}>
      <h2 className="text-base font-bold text-white mb-0.5">내 동의 내역</h2>
      <p className="text-xs text-neutral-500 mb-3">로그인한 본인에게만 보입니다.</p>

      {agreed ? (
        <>
          <Row label="동의 일시"><strong>{formatKst(consent?.agreed_at)}</strong></Row>
          <Row label="동의 항목">{agreedTitles.length ? agreedTitles.join(' · ') : '—'}</Row>
          <Row label="버전">
            {consent?.version}
            {!valid && <span className="ml-2 text-amber-400">— 현재 버전({PRIVACY_CONSENT_VERSION})과 달라 다음 접속 때 다시 동의를 받습니다</span>}
          </Row>
        </>
      ) : (
        <Row label="동의 일시">
          아직 동의 기록이 없습니다{consent?.withdrawn_at ? ` (${formatKst(consent.withdrawn_at)}에 철회함)` : ''}
        </Row>
      )}

      {agreed && (
        <div className="mt-4 pt-4 border-t border-neutral-800">
          {phase === 'ready' ? (
            <>
              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                언제든 동의를 철회할 수 있습니다. 필수 항목이라 철회하면 예매·후기 작성을 할 수 없습니다.
              </p>
              <button
                type="button"
                onClick={() => setPhase('confirming')}
                className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-bold transition-colors"
              >
                동의 철회
              </button>
            </>
          ) : (
            <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/5">
              <p className="text-sm font-bold text-white mb-2">정말 철회하시겠습니까?</p>
              <ul className="text-xs text-neutral-300 leading-relaxed list-disc pl-4 space-y-1 mb-3">
                <li>바로 로그아웃되고, 다시 동의하기 전까지 예매·후기 작성을 할 수 없습니다.</li>
                <li>이미 한 예매와 작성한 후기는 자동으로 지워지지 않습니다(삭제는 보호책임자에게 요청).</li>
                <li>다시 로그인해서 동의하면 바로 이용할 수 있습니다.</li>
              </ul>
              {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={withdraw}
                  disabled={phase === 'working'}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {phase === 'working' ? '처리 중…' : '철회합니다'}
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setPhase('ready'); }}
                  disabled={phase === 'working'}
                  className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-sm font-bold transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
