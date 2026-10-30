"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ensureProfile, signInWithGoogle, authFetch, DomainNotAllowedError, type AppProfile } from '@/lib/supabase-auth';
import AccountInfo from '@/components/AccountInfo';
import PrivacyConsentGate from '@/components/PrivacyConsentGate';
import { Ban, CircleCheck, Hourglass, Popcorn, Clapperboard, ClipboardList, Crown, Ticket, Home } from 'lucide-react';

function GroupConfirmForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupId = searchParams.get('groupId');
  const memberId = searchParams.get('memberId');

  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [myReservation, setMyReservation] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [leader, setLeader] = useState<any>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isAlreadyConfirmed, setIsAlreadyConfirmed] = useState(false);

  // 🍿 팝콘 선택 관련 상태
  const [showPopcornStep, setShowPopcornStep] = useState(false);
  const [popcornList, setPopcornList] = useState<string[]>(['none']);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (groupId && memberId) fetchGroupData();
  }, [groupId, memberId]);

  const fetchGroupData = async () => {
    try {
      const { data: myData } = await supabase.from('reservations')
        .select('*').eq('id', memberId).single();

      if (!myData) { setLoading(false); return; }
      setMyReservation(myData);

      if (myData.payment_status === 'confirmed') {
        setIsAlreadyConfirmed(true);
      }

      if (myData.group_expires_at && new Date(myData.group_expires_at) < new Date()) {
        setIsExpired(true);
      }

      const { data: groupData } = await supabase.from('reservations')
        .select('*').eq('group_id', groupId).order('is_group_leader', { ascending: false });

      if (groupData) {
        const leaderData = groupData.find(r => r.is_group_leader);
        setLeader(leaderData);
        setGroupMembers(groupData.filter(r => !r.is_group_leader));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePopcornChange = (index: number, value: string) => {
    let newList = [...popcornList];
    newList[index] = value;
    const filtered = newList.filter(p => p !== 'none');
    filtered.push('none');
    setPopcornList(filtered);
  };

  const handleSkipPopcorn = async () => {
    await finalizeConfirm('none');
  };

  const handlePopcornConfirm = async () => {
    const finalPopcornString = popcornList.filter(p => p !== 'none').join(',') || 'none';
    if (finalPopcornString !== 'none') {
      await finalizeConfirm(finalPopcornString, true);
    } else {
      await finalizeConfirm('none');
    }
  };

  const finalizeConfirm = async (popcornOrder: string, showQR: boolean = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/reservations', {
        action: 'CONFIRM_GROUP',
        payload: { reservationId: memberId, popcornOrder }
      });
      const data = await res.json();
      if (!data.success) { alert(`${data.error || '확정 중 오류가 발생했습니다.'}`); return; }

      const ticket = data.ticket;

      if (ticket.email) {
        const { data: movieSettings } = await supabase.from('movie_settings').select('*').eq('id', ticket.movie_settings_id).single();
        if (movieSettings) {
          fetch('/api/ticket', {
            method: 'POST',
            body: JSON.stringify({
              email: ticket.email, name: ticket.student_name, seat: ticket.seat_number,
              movieTitle: movieSettings.title, movieDate: movieSettings.date_string,
              statusType: ticket.payment_status, popcorn: popcornOrder, ticketId: memberId,
              baseUrl: window.location.origin
            })
          });
        }
      }

      if (showQR) {
        setShowPaymentQR(true);
      } else {
        alert("예매가 확정되었습니다! 학교 이메일로 티켓이 발송되었습니다.");
        router.push('/');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("정말 단체에서 나가시겠습니까?\n해당 좌석이 해제됩니다.")) return;

    const res = await authFetch('/api/reservations', { action: 'LEAVE_GROUP', payload: { reservationId: memberId } });
    const data = await res.json();
    if (!data.success) { alert(`${data.error || '처리 중 오류가 발생했습니다.'}`); return; }

    alert("단체에서 나갔습니다. 좌석이 해제되었습니다.");
    router.push('/');
  };

  if (authLoading || loading) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><p className="text-white font-bold animate-pulse">데이터를 불러오는 중...</p></div>;

  if (!profile) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
        <p className="text-white font-bold mb-6 text-center">단체 관람 초대를 확인하려면<br/>학교(@ts.hs.kr) 구글 계정으로 로그인해주세요.</p>
        <button onClick={() => signInWithGoogle()} className="py-3 px-8 bg-white text-neutral-900 font-bold rounded-xl">구글 계정으로 로그인</button>
      </div>
    );
  }

  if (!myReservation) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><p className="text-white font-bold">존재하지 않거나 이미 처리된 초대입니다.</p></div>;

  if (myReservation.user_id !== profile.id) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <p className="text-white font-bold text-center">
          <span className="inline-flex items-center justify-center gap-1.5"><Ban className="w-4 h-4" /> 본인 초대가 아닙니다.</span>
          <br/>이 링크는 {myReservation.student_name}님을 위한 초대 링크입니다.
        </p>
      </div>
    );
  }

  // 🍿 팝콘 결제 QR 화면
  if (showPaymentQR) {
    const totalPrice = popcornList.filter(p => p !== 'none').length * 2500;
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="bg-neutral-900/90 backdrop-blur-xl p-8 rounded-2xl max-w-sm w-full border border-amber-500/30 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <h2 className="text-2xl font-bold text-amber-400 mb-2">결제 대기 중</h2>
          <p className="text-neutral-300 mb-6 text-sm">QR코드로 30분 내에 입금을 완료해주세요.</p>
          <div className="bg-white p-4 rounded-xl mb-4 inline-block"><img src="/qr.jpeg" alt="QR" loading="lazy" decoding="async" className="w-48 h-48 object-contain" /></div>
          <div className="mb-6"><AccountInfo /></div>
          <div className="bg-neutral-800 rounded-xl p-4 text-left mb-6 border border-neutral-700">
            <p className="text-sm text-neutral-300 mb-1">결제 금액: <span className="text-amber-400 font-bold text-xl">{totalPrice.toLocaleString()}원</span></p>
            <p className="text-sm text-neutral-300">입금자명: <span className="text-orange-400 font-bold">{myReservation.student_id} {myReservation.student_name}</span></p>
          </div>
          <p className="text-neutral-400 text-xs mb-4">입금 확인 후 관리자가 예매를 확정합니다.<br/>학교 이메일로도 안내가 발송되었습니다.</p>
          <button onClick={() => router.push('/')} className="w-full py-3 bg-orange-600 hover:bg-orange-500 rounded-xl text-white font-bold transition-all text-sm">메인 페이지로 돌아가기</button>
        </div>
      </div>
    );
  }

  // 🍿 팝콘 선택 단계 화면
  if (showPopcornStep) {
    const totalPrice = popcornList.filter(p => p !== 'none').length * 2500;
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 flex flex-col items-center select-none">
        <div className="w-full max-w-lg">
          <h1 className="text-3xl font-bold text-center mb-2 text-amber-400 flex items-center justify-center gap-1.5"><Popcorn className="w-6 h-6" /> 팝콘 선택</h1>
          <p className="text-center text-neutral-400 mb-8 text-sm">
            단체 확정 전, 팝콘을 선택할 수 있습니다.<br/>
            <span className="text-white font-bold">{myReservation.student_name}</span>님 · 좌석 <span className="text-emerald-400 font-bold">{myReservation.seat_number}</span>
          </p>

          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 mb-6">
            <label className="flex items-center gap-1.5 text-neutral-300 mb-3 text-sm font-bold"><Popcorn className="w-4 h-4" /> 팝콘 선택 (개당 2,500원)</label>

            {popcornList.map((pop, idx) => (
              <div key={idx} className="mb-3 flex items-center gap-2">
                <span className="text-neutral-400 text-xs w-12 text-center">
                  {pop === 'none' ? '추가' : `선택 ${idx + 1}`}
                </span>
                <select
                  value={pop}
                  onChange={(e) => handlePopcornChange(idx, e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-neutral-800 border border-neutral-600 outline-none text-sm text-neutral-200"
                >
                  <option value="none">{pop === 'none' ? '+ 팝콘 추가하기 (선택 시 결제 필요)' : '선택 취소'}</option>
                  <option value="original">오리지널 버터 팝콘 (2,500원)</option>
                  <option value="consomme">콘소메맛 팝콘 (2,500원)</option>
                  <option value="caramel">카라멜맛 팝콘 (2,500원)</option>
                </select>
              </div>
            ))}

            <p className="text-xs text-neutral-400 mt-2">* 팝콘은 여러 개 추가할 수 있습니다. (음료는 배부하지 않습니다.)</p>

            {totalPrice > 0 && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex justify-between items-center">
                <span className="text-amber-400 font-bold">총 결제 예정 금액</span>
                <span className="text-xl font-bold text-amber-400">{totalPrice.toLocaleString()}원</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={handleSkipPopcorn} disabled={isSubmitting} className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 font-bold transition-all text-sm disabled:opacity-50">
              팝콘 없이 확정
            </button>
            <button onClick={handlePopcornConfirm} disabled={isSubmitting} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-xl text-white font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] text-sm disabled:opacity-50">
              {totalPrice > 0 ? `팝콘 포함 확정 (${totalPrice.toLocaleString()}원)` : '팝콘 없이 확정'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 flex flex-col items-center select-none">
      <div className="w-full max-w-lg">

        <h1 className="text-3xl font-bold text-center mb-2 text-emerald-400 flex items-center justify-center gap-1.5"><Clapperboard className="w-6 h-6" /> 단체 관람 초대</h1>
        <p className="text-center text-neutral-400 mb-8 text-sm">예매를 확정하여 단체에 합류하세요</p>

        {isExpired && (
          <div className="bg-rose-900/30 border border-rose-500/50 p-4 rounded-xl mb-6 text-center">
            <p className="text-rose-400 font-bold flex items-center justify-center gap-1.5"><Hourglass className="w-4 h-4" /> 초대 시간이 만료되었습니다.</p>
            <p className="text-neutral-400 text-sm mt-1">1시간이 경과하여 이 초대는 더 이상 유효하지 않습니다.</p>
          </div>
        )}

        {isAlreadyConfirmed && (
          <div className="bg-emerald-900/30 border border-emerald-500/50 p-4 rounded-xl mb-6 text-center">
            <p className="text-emerald-400 font-bold flex items-center justify-center gap-1.5"><CircleCheck className="w-4 h-4" /> 이미 예매가 확정된 상태입니다.</p>
            <button onClick={() => router.push('/')} className="mt-3 text-sm text-orange-400 underline">메인 페이지로 돌아가기</button>
          </div>
        )}

        {/* 그룹 현황 */}
        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 mb-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> 단체 현황</h2>
          {leader && (
            <div className="bg-emerald-900/30 border border-emerald-500/30 p-3 rounded-xl mb-3 flex items-center gap-3">
              <span className="text-emerald-400 font-bold"><Crown className="w-4 h-4" /></span>
              <div>
                <p className="text-emerald-300 font-bold text-sm">{leader.student_name} <span className="text-emerald-500 text-xs">(리더)</span></p>
                <p className="text-neutral-400 text-xs">좌석: {leader.seat_number} · <span className="inline-flex items-center gap-1"><CircleCheck className="w-3.5 h-3.5" /> 확정됨</span></p>
              </div>
            </div>
          )}
          {groupMembers.map((m) => (
            <div key={m.id} className={`p-3 rounded-xl mb-2 flex items-center gap-3 ${m.id === memberId ? 'bg-sky-900/30 border border-sky-500/30' : 'bg-neutral-800/50 border border-neutral-700'}`}>
              <span className={`font-bold text-sm ${m.id === memberId ? 'text-sky-400' : 'text-neutral-500'}`}>
                {m.payment_status === 'confirmed' ? <CircleCheck className="w-4 h-4" /> : <Hourglass className="w-4 h-4" />}
              </span>
              <div>
                <p className={`font-bold text-sm ${m.id === memberId ? 'text-sky-300' : 'text-neutral-300'}`}>
                  {m.student_name} {m.id === memberId && <span className="text-sky-500 text-xs">(나)</span>}
                </p>
                <p className="text-neutral-400 text-xs">
                  좌석: {m.seat_number} · {m.payment_status === 'confirmed' ? '확정됨' : '대기 중'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 본인 정보 */}
        {!isExpired && !isAlreadyConfirmed && (
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 mb-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-1.5"><Ticket className="w-4 h-4" /> 내 예매 정보</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-neutral-800 p-3 rounded-lg">
                <p className="text-neutral-500 text-xs mb-1">학번</p>
                <p className="text-white font-bold">{myReservation.student_id ?? '교직원'}</p>
              </div>
              <div className="bg-neutral-800 p-3 rounded-lg">
                <p className="text-neutral-500 text-xs mb-1">이름</p>
                <p className="text-white font-bold">{myReservation.student_name}</p>
              </div>
              <div className="bg-neutral-800 p-3 rounded-lg col-span-2">
                <p className="text-neutral-500 text-xs mb-1">좌석</p>
                <p className="text-emerald-400 font-black text-2xl">{myReservation.seat_number}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleLeave} className="flex-1 py-3 bg-rose-600/80 hover:bg-rose-500 border border-rose-500 rounded-lg text-white font-bold transition-all text-sm">
                단체에서 나가기
              </button>
              <button onClick={() => setShowPopcornStep(true)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] text-sm">
                예매 확정하기
              </button>
            </div>
          </div>
        )}

        <button onClick={() => router.push('/')} className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl transition-all border border-neutral-600 text-sm flex items-center justify-center gap-1.5">
          <Home className="w-4 h-4" /> 메인 페이지로 돌아가기
        </button>
      </div>
      <PrivacyConsentGate profile={profile} />
    </div>
  );
}

export default function GroupConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 flex items-center justify-center"><p className="text-white font-bold">로딩 중...</p></div>}>
      <GroupConfirmForm />
    </Suspense>
  );
}
