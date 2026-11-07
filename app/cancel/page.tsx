"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ensureProfile, signInWithGoogle, authFetch, DomainNotAllowedError, type AppProfile } from '@/lib/supabase-auth';
import { Ban, Siren } from 'lucide-react';

function CancelForm() {
  const searchParams = useSearchParams();
  const ticketId = searchParams.get('ticketId');
  const router = useRouter();

  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCanceling, setIsCanceling] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (active) { setProfile(null); setAuthLoading(false); }
        return;
      }
      // 🌟 콜백은 exclusive lock을 쥔 채 실행됨 — 안에서 getSession()을 다시 await하면
      // 데드락(새로고침 시 무한 로딩). setTimeout(0)으로 락 밖에서 실행되게 미룬다.
      setTimeout(async () => {
        try {
          const p = await ensureProfile();
          if (active) setProfile(p);
        } catch (err) {
          if (err instanceof DomainNotAllowedError) alert('학교(@ts.hs.kr) 구글 계정으로만 로그인할 수 있습니다.');
          if (active) setProfile(null);
        } finally {
          if (active) setAuthLoading(false);
        }
      }, 0);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (ticketId) {
      supabase.from('reservations').select('*').eq('id', ticketId).single().then(({ data }) => {
        setTicket(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [ticketId]);

  const handleCancel = async () => {
    if (isCanceling) return;
    setIsCanceling(true);
    try {
      const res = await authFetch('/api/reservations', { action: 'CANCEL_OWN', payload: { reservationId: ticketId } });
      const data = await res.json();
      if (!data.success) { alert(`${data.error || '취소 중 오류가 발생했습니다.'}`); return; }

      // 취소 메일은 /api/reservations(CANCEL_OWN)가 취소 직후 서버에서 보낸다.
      alert("예매가 정상적으로 취소되었습니다.");
      router.push('/');
    } finally {
      setIsCanceling(false);
    }
  };

  if (authLoading || loading) return <div className="min-h-screen bg-ground text-sub text-center pt-20 font-bold">데이터를 불러오는 중...</div>;

  if (!profile) {
    return (
      <div className="min-h-screen bg-ground flex flex-col items-center justify-center p-4 text-center">
        <p className="text-ink font-bold mb-6 break-keep">예매를 취소하려면 학교(@ts.hs.kr) 구글 계정으로 로그인해주세요.</p>
        <button onClick={() => signInWithGoogle()} className="h-12 px-8 bg-ink hover:bg-white text-ground font-bold transition-colors">구글 계정으로 로그인</button>
      </div>
    );
  }

  if (!ticket) return <div className="min-h-screen bg-ground text-sub text-center pt-20 px-4 font-bold">존재하지 않거나 이미 취소된 예매 내역입니다.</div>;

  if (ticket.user_id !== profile.id) {
    return (
      <div className="min-h-screen bg-ground flex items-center justify-center p-4">
        <p className="text-ink font-bold text-center"><span className="inline-flex items-center gap-1.5"><Ban className="w-4 h-4" /> 본인 예약이 아닙니다.</span><br/>이 링크는 {ticket.student_name}님의 예매 취소 링크입니다.</p>
      </div>
    );
  }

  const isPaidPopcorn = ticket.popcorn_order !== 'none' && ticket.payment_status === 'confirmed';

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="bg-card p-8 rounded-lg max-w-sm w-full text-center border border-line">
        <h1 className="text-2xl font-black text-ink mb-2">예매 취소</h1>
        <p className="text-sub text-sm mb-6 bg-raised border border-line p-3">
          좌석: <span className="font-bold text-ink">{ticket.seat_number}</span><br/>
          예매자: <span className="font-bold text-ink">{ticket.student_id ?? '교직원'} {ticket.student_name}</span>
        </p>

        {isPaidPopcorn && (
          <div className="mb-6 bg-raised border border-line-strong p-4 text-ink text-sm font-bold">
            <span className="inline-flex items-center gap-1.5"><Siren className="w-4 h-4" /> 결제가 확정된 팝콘 예매가 포함되어 있습니다.</span><br/>
            온라인상으로는 예매 내역이 즉시 취소되지만,<br/>
            <span className="text-sub">환불 금액은 영화 상영 당일 현장에서<br/>학생회 스태프를 찾아와 직접 수령하셔야 합니다.</span>
          </div>
        )}

        <button onClick={handleCancel} disabled={isCanceling} className="w-full h-12 border border-line-strong hover:border-line-bold disabled:opacity-50 text-accent font-bold transition-colors">
          {isCanceling ? '취소 처리 중...' : '예매 취소하기'}
        </button>
      </div>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ground text-sub text-center pt-20">로딩 중...</div>}>
      <CancelForm />
    </Suspense>
  );
}
