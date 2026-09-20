"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ensureProfile, signInWithGoogle, signOutAndClear, authFetch, authFetchGet, DomainNotAllowedError, type AppProfile } from '../lib/supabase-auth';
import Link from 'next/link'; // 🌟[추가] Next.js Link 임포트
import { Crown, Check, Ban, Siren, Popcorn, CircleCheck, Sparkles, PartyPopper, Mail, BookOpen, Settings, Printer, LogOut, History, MapPin, Lock, ArrowRight, Hourglass, RefreshCw, User, Users, Lightbulb, ClipboardList, CircleHelp, Ticket } from 'lucide-react';

import AccountInfo from '@/components/AccountInfo';
import MovieReviews from '@/components/MovieReviews';
import { getGridRows, getGridCols, computeSeatId, computeVipSeats } from '@/lib/seatGrid';

// 🌟 [로그인 리다이렉트 복원] 비로그인 좌석 클릭 -> 구글 로그인 -> 복귀 사이에 풀 페이지
// 리다이렉트로 예매 진행 state가 초기화되는 것을 막기 위한 임시 저장 키
const PENDING_SEAT_KEY = 'pending_seat_selection';

interface SeatData {
  status: string;
  name: string;
  ticketId: string;
  popcorn?: string;
}

// 🌟 [과거 상영 회차 열람] movie_settings 이력 행 (is_active=false)
interface PastMovie {
  id: number;
  title: string;
  date_string: string;
  db_date: string;
  venue: string;
  age_rating: string;
  poster_url: string;
  mid_vip_start_row?: string; mid_vip_end_row?: string; mid_vip_start_col?: number; mid_vip_end_col?: number;
  grand_vip_start_row?: string; grand_vip_end_row?: string; grand_vip_start_col?: number; grand_vip_end_col?: number;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const[selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const[isModalOpen, setIsModalOpen] = useState(false);
  const [popcornList, setPopcornList] = useState<string[]>(['none']); // 🍿 팝콘 선택 리스트 복구
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false); // 💸 송금 모달 복구
  
  const [seatStatuses, setSeatStatuses] = useState<Record<string, SeatData>>({});
  const [blacklistedUsers, setBlacklistedUsers] = useState<string[]>([]);
  
  const [isClosed, setIsClosed] = useState(false);

  const[movieInfo, setMovieInfo] = useState({
    title: "로딩 중...", date_string: "로딩 중...", db_date: "", venue: "대구과학고등학교 중강당",
    age_rating: "전체관람가", // 🌟 [추가됨]
    poster_url: "/poster.jpg", deadline_date: "2099-12-31T23:59:00+09:00",
    mid_vip_start_row: "A", mid_vip_end_row: "C", mid_vip_start_col: 5, mid_vip_end_col: 10,
    grand_vip_start_row: "A", grand_vip_end_row: "C", grand_vip_start_col: 10, grand_vip_end_col: 18
  });
  
  const [profile, setProfile] = useState<AppProfile | null>(null);
  // 🌟 [버그 수정] 비로그인(anon) 첫 fetch와 로그인 확인 후 fetch가 겹칠 때, 늦게 끝난
  // anon 응답(이름 없음)이 나중 setState로 덮어써서 로그인해도 예매자 이름이 안 보이는
  // race condition을 막기 위한 순번 가드.
  const fetchSeqRef = useRef(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [clubMemberIds, setClubMemberIds] = useState<string[]>([]);

  // 🌟 [예매 후 UI] 내 예매 정보 + 자리 이동 모드
  const [myReservation, setMyReservation] = useState<{id: string, seat: string, status: string, popcorn?: string} | null>(null);
  const [isMovingSeat, setIsMovingSeat] = useState(false);
  const [isAddPopcornMode, setIsAddPopcornMode] = useState(false); // 🍿 결제 대기 중 팝콘 추가 모드

  const [alertInfo, setAlertInfo] = useState<{message: string, isError: boolean} | null>(null);
  const [confirmInfo, setConfirmInfo] = useState<{message: string, onConfirm: () => void} | null>(null);
  const [successInfo, setSuccessInfo] = useState<{title: string, message: string} | null>(null);

  const showAlert = (message: string, isError = true) => setAlertInfo({ message, isError });
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmInfo({ message, onConfirm });
  const showSuccess = (title: string, message: string) => setSuccessInfo({ title, message });

  const isGrandHall = movieInfo.venue.includes('대강당');

  const rows = useMemo(() => getGridRows(isGrandHall), [isGrandHall]);

  const cols = useMemo(() => getGridCols(isGrandHall), [isGrandHall]);

  const getSeatId = (rowIndex: number, colIndex: number) => computeSeatId(isGrandHall, rowIndex, colIndex);

  const vipSeats = useMemo(
    () => computeVipSeats(isGrandHall, rows, cols, movieInfo),
    [movieInfo, isGrandHall, rows, cols]
  );

  // 🌟 [과거 상영 회차 열람] 과거 회차 목록/현재 보고 있는 인덱스(null=현재 상영작)/좌석 점유(익명) 상태
  const [pastMovies, setPastMovies] = useState<PastMovie[]>([]);
  const [pastIndex, setPastIndex] = useState<number | null>(null); // null: 현재 상영작, 0부터: pastMovies의 최신순 인덱스
  const [pastSeatMap, setPastSeatMap] = useState<Record<string, string>>({}); // seat_number -> payment_status (이름/학번 등 개인정보 없음)
  const [isPastSeatLoading, setIsPastSeatLoading] = useState(false);
  const [pastHasReservations, setPastHasReservations] = useState(true); // 예매 정보가 아예 없는(수동 등록한) 과거 영화는 좌석 배치도 자체를 숨김

  const viewingPast = pastIndex !== null;
  const pastMovie = viewingPast ? pastMovies[pastIndex as number] : null;
  const displayMovie = pastMovie ?? movieInfo;

  const isPastGrandHall = pastMovie ? pastMovie.venue.includes('대강당') : false;
  const pastRows = useMemo(() => getGridRows(isPastGrandHall), [isPastGrandHall]);
  const pastCols = useMemo(() => getGridCols(isPastGrandHall), [isPastGrandHall]);
  const getPastSeatId = (rowIndex: number, colIndex: number) => computeSeatId(isPastGrandHall, rowIndex, colIndex);
  const pastVipSeats = useMemo(
    () => (pastMovie ? computeVipSeats(isPastGrandHall, pastRows, pastCols, pastMovie) : new Set<string>()),
    [pastMovie, isPastGrandHall, pastRows, pastCols]
  );

  // 🌟 카드 전환 슬라이드 애니메이션 방향 ('older': 왼쪽에서 등장, 'newer': 오른쪽에서 등장)
  const [navDirection, setNavDirection] = useState<'older' | 'newer'>('older');

  // 과거 회차로 이동(왼쪽 화살표): 현재 상영작 -> 가장 최근 과거 회차 -> ... -> 가장 오래된 회차
  const goToOlderMovie = () => {
    if (pastMovies.length === 0) return;
    setSelectedSeat(null);
    setNavDirection('older');
    setPastIndex(prev => {
      if (prev === null) return 0;
      return prev < pastMovies.length - 1 ? prev + 1 : prev;
    });
  };

  // 현재 상영작 방향으로 이동(오른쪽 화살표)
  const goToNewerMovie = () => {
    setSelectedSeat(null);
    setNavDirection('newer');
    setPastIndex(prev => {
      if (prev === null) return null;
      return prev === 0 ? null : prev - 1;
    });
  };

  const [isManualOpen, setIsManualOpen] = useState(false);

  // 🌟 [단체 예매] Group Mode 상태 관리
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupLeader, setGroupLeader] = useState<{profileId: string, studentId: string | null, name: string, seat: string, email: string} | null>(null);
  const [groupMembers, setGroupMembers] = useState<{profileId: string, studentId: string | null, name: string, seat: string}[]>([]);
  const [isGroupMemberModal, setIsGroupMemberModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<{id: string, student_id: string | null, name: string, email: string}[]>([]);
  const [selectedMember, setSelectedMember] = useState<{id: string, student_id: string | null, name: string, email: string} | null>(null);
  const [isGroupSummaryOpen, setIsGroupSummaryOpen] = useState(false);
  const [isGroupSoloConfirmOpen, setIsGroupSoloConfirmOpen] = useState(false); // 🌟 [추가] 혼자 예매 선택 모달
  const [groupSendingProgress, setGroupSendingProgress] = useState({current: 0, total: 0, sending: false});
  const [isAdmin, setIsAdmin] = useState(false);

  // 🌟 [버그 수정] onAuthStateChange 콜백은 supabase-js 내부 exclusive lock을 쥔 채로
  // 실행된다. 콜백 안에서 다시 supabase.auth.* (ensureProfile 내부의 getSession())을
  // await하면 같은 락을 재획득하려다 데드락에 빠진다 — 새로고침으로 저장된 세션을
  // 복구하는 경로에서만 이 락이 걸려 있어서 재현되고, URL의 OAuth 토큰으로 로그인하는
  // 경로는 락 밖에서 이벤트가 발생해 문제가 없었던 것. 공식 문서 권장대로 setTimeout(0)으로
  // 콜백 바깥(락 해제 후)에서 실행되게 미룬다.
  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (active) { setProfile(null); setAvatarUrl(null); setAuthLoading(false); }
        return;
      }
      if (active) {
        setAvatarUrl(session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null);
      }
      setTimeout(async () => {
        try {
          const p = await ensureProfile();
          if (active) setProfile(p);
        } catch (err) {
          if (err instanceof DomainNotAllowedError) {
            showAlert('학교(@ts.hs.kr) 구글 계정으로만 로그인할 수 있습니다.');
          }
          if (active) setProfile(null);
        } finally {
          if (active) setAuthLoading(false);
        }
      }, 0);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [profile]);

  // 🌟 [로그인 리다이렉트 복원] 좌석 클릭 -> 구글 로그인 -> 복귀 직후, 남겨둔 좌석을
  // seatStatuses(로그인 후 fetchInitialData 완료분)로 재검증하고 팝콘 선택 모달을 바로 연다.
  useEffect(() => {
    if (!profile || isLoading) return;
    let pending: string | null = null;
    try { pending = sessionStorage.getItem(PENDING_SEAT_KEY); } catch { /* sessionStorage unavailable: skip */ }
    if (!pending) return;
    try { sessionStorage.removeItem(PENDING_SEAT_KEY); } catch { /* sessionStorage unavailable: skip */ }

    if (isClosed || myReservation || seatStatuses[pending]) {
      showAlert('선택하신 좌석은 로그인하는 동안 마감되었거나 이미 예약되었습니다.');
      return;
    }
    setSelectedSeat(pending);
    setIsModalOpen(true);
  }, [profile, isLoading]);

  useEffect(() => {
    if (!profile) { setIsAdmin(false); return; }
    let active = true;
    authFetchGet('/api/admin/check')
      .then(res => res.json())
      .then(data => { if (active && data.success) setIsAdmin(data.isAdmin); })
      .catch(() => {});
    return () => { active = false; };
  }, [profile]);

  // 🌟 [단체 예매] 이메일 발송 중 페이지 이탈 방지
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (groupSendingProgress.sending) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [groupSendingProgress.sending]);

  // 🌟 [과거 상영 회차 열람] 과거 회차를 보고 있을 때만 해당 회차의 좌석 점유 현황을 익명으로 조회
  // (개인정보 보호: /api/past-seats가 service-role로 seat_number/payment_status만 반환 —
  //  reservations는 anon RLS select가 막혀있어 비로그인도 이 API로만 열람 가능. student_name 등은 절대 노출 안 함)
  useEffect(() => {
    if (!viewingPast || !pastMovie) { setPastSeatMap({}); setPastHasReservations(true); return; }
    let active = true;
    setIsPastSeatLoading(true);
    fetch(`/api/past-seats?movieSettingsId=${pastMovie.id}`)
      .then((res) => res.json())
      .then(({ success, data }) => {
        if (!active) return;
        const map: Record<string, string> = {};
        (success ? data : []).forEach((r: { seat_number: string; payment_status: string }) => {
          if (r.payment_status === 'confirmed' || r.payment_status === 'pending' || r.payment_status === 'group_pending') {
            map[r.seat_number] = r.payment_status;
          }
        });
        setPastSeatMap(map);
        setPastHasReservations(success ? data.length > 0 : true);
        setIsPastSeatLoading(false);
      });
    return () => { active = false; };
  }, [viewingPast, pastMovie]);

  const fetchInitialData = async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const [{ data: settingsData }, { data: bgData }, { data: clubData }, { data: pastData }] = await Promise.all([
        supabase.from('movie_settings').select('*').eq('is_active', true).single(),
        supabase.from('blacklist').select('email'),
        supabase.from('club_members').select('email'),
        // 🌟 [과거 상영 회차 열람] 과거 회차 목록(최신순) — movie_settings 자체 정보라 민감정보 아님
        supabase.from('movie_settings').select('*').eq('is_active', false).order('created_at', { ascending: false }),
      ]);
      if (clubData) setClubMemberIds(clubData.map(c => c.email));
      if (pastData) setPastMovies(pastData);

      let currentDbDate = "2026-04-18";

      if (settingsData) {
        setMovieInfo(settingsData);
        currentDbDate = settingsData.db_date;
        if (new Date() > new Date(settingsData.deadline_date)) setIsClosed(true);
      }
      if (bgData) setBlacklistedUsers(bgData.map(b => b.email));

      // 🌟 [비로그인 열람] reservations는 RLS로 anon select가 막혀있어(개인정보 보호),
      // 로그인 전에는 이름/학번 없이 좌석 점유 현황만 주는 /api/current-seats로 대신 조회한다.
      type ResRow = { id?: string; seat_number: string; payment_status: string; student_name?: string; group_expires_at?: string | null; popcorn_order?: string; user_id?: string };
      let resData: ResRow[] | null = null;
      if (profile) {
        const { data } = await supabase.from('reservations')
          .select('id, seat_number, payment_status, student_name, student_id, group_expires_at, popcorn_order, user_id')
          .eq('movie_date', currentDbDate);
        resData = data;
      } else {
        const res = await fetch('/api/current-seats');
        const { success, data } = await res.json();
        resData = success ? data : [];
      }

      // 늦게 끝난 낡은 fetch(예: 로그인 확인 전 anon 요청)는 최신 fetch 결과를 덮어쓰지 못하게 무시
      if (seq !== fetchSeqRef.current) return;

      if (resData) {
        const newStatuses: Record<string, SeatData> = {};
        const now = new Date();
        resData.forEach((res) => {
          if (res.payment_status === 'pending' || res.payment_status === 'confirmed') {
            newStatuses[res.seat_number] = { status: res.payment_status, name: res.student_name || '', ticketId: res.id || '', popcorn: res.popcorn_order };
          } else if (res.payment_status === 'group_pending') {
            if (res.group_expires_at && new Date(res.group_expires_at) > now) {
              newStatuses[res.seat_number] = { status: res.payment_status, name: res.student_name || '', ticketId: res.id || '', popcorn: res.popcorn_order };
            }
          }
        });
        setSeatStatuses(newStatuses);

        // 🌟 [예매 후 UI] 내 예매(확정/결제대기) 찾기 — group_pending(단체 초대 미확정)은 제외
        // profile 없으면(비로그인) user_id 비교 자체를 하지 않는다: anon 응답엔 user_id 필드가 없어
        // undefined === undefined로 아무 예약이나 "내 예매"로 오매칭되는 사고를 막기 위함.
        const mine = profile ? resData.find(r => r.user_id === profile.id && (r.payment_status === 'confirmed' || r.payment_status === 'pending')) : undefined;
        setMyReservation(mine ? { id: mine.id!, seat: mine.seat_number, status: mine.payment_status, popcorn: mine.popcorn_order } : null);
      }

      // 🌟 [단체 예매] 만료된 단체 예매 정리 — 세션당 최대 10분에 1회만 트리거
      try {
        const KEY = 'group_check_last_run';
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 10 * 60 * 1000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          fetch('/api/cron/group-check').catch(() => {});
        }
      } catch { /* sessionStorage unavailable: skip */ }
    } catch (err) {
      console.error("데이터 불러오기 오류:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeatClick = (seatId: string) => {
    if (isClosed) return;

    // 🌟 [비로그인] 좌석 클릭 즉시 구글 로그인으로 이동 (예매하기 버튼까지 갈 필요 없음)
    // 구글 로그인은 풀 페이지 리다이렉트라 복귀 시 컴포넌트가 리마운트되어 selectedSeat가
    // 초기화된다. 어느 좌석을 고르려 했는지 sessionStorage에 남겨 복귀 후 복원한다.
    if (!profile) {
      try { sessionStorage.setItem(PENDING_SEAT_KEY, seatId); } catch { /* sessionStorage unavailable: skip */ }
      signInWithGoogle().catch(() => showAlert('로그인에 실패했습니다.'));
      return;
    }

    // 🌟 [단체 예매] Group Mode에서의 좌석 클릭
    if (isGroupMode) {
      if (seatStatuses[seatId]) return;
      if (groupLeader?.seat === seatId) return;
      const existingMember = groupMembers.find(m => m.seat === seatId);
      if (existingMember) {
        setGroupMembers(prev => prev.filter(m => m.seat !== seatId));
        return;
      }
      if (groupMembers.length >= 9) return showAlert("단체 예매는 리더를 포함하여 최대 10명까지 가능합니다.");
      if (vipSeats.has(seatId) && groupLeader && !clubMemberIds.includes(groupLeader.email)) {
        return showAlert("선택하신 좌석은 '영화대교' 동아리 전용석입니다.");
      }
      setSelectedSeat(seatId);
      setMemberSearchQuery('');
      setMemberSearchResults([]);
      setSelectedMember(null);
      setIsGroupMemberModal(true);
      return;
    }

    // 🌟 [예매 완료 좌석] 클릭해도 아무 효과 없음 (본인/타인 무관)
    if (seatStatuses[seatId]) return;

    // 🌟 [예매 후 UI] 이미 예매한 사람은 "자리 이동" 버튼을 눌러야만 새 좌석을 고를 수 있음
    if (myReservation && !isMovingSeat) return;

    setSelectedSeat(seatId);
  };

  const handlePopcornChange = (index: number, value: string) => {
    let newList = [...popcornList];
    newList[index] = value;
    const filtered = newList.filter(p => p !== 'none');
    filtered.push('none');
    setPopcornList(filtered);
  };

  const handleAddPopcornSubmit = async () => {
    if (!profile || !myReservation) return;
    const finalPopcornString = popcornList.filter(p => p !== 'none').join(',') || 'none';
    const oldPopcorns = myReservation.popcorn && myReservation.popcorn !== 'none' ? myReservation.popcorn.split(',') : [];
    const newPopcorns = finalPopcornString !== 'none' ? finalPopcornString.split(',') : [];

    if (finalPopcornString === (myReservation.popcorn || 'none')) {
      return showAlert("변경된 내용이 없습니다.");
    }
    if (newPopcorns.length < oldPopcorns.length) {
      return showAlert("결제 혼선 방지를 위해 기존에 주문한 팝콘 수량을 취소/삭제할 수 없습니다. (맛 변경 및 추가만 가능)");
    }

    const addedCount = newPopcorns.length - oldPopcorns.length;
    const willNeedPayment = myReservation.status === 'confirmed' && finalPopcornString !== 'none';
    const newStatus = finalPopcornString !== 'none' ? 'pending' : myReservation.status;
    let confirmMsg = addedCount > 0
      ? `팝콘 ${addedCount}개를 추가하시겠습니까?\n(추가 결제 금액: ${(addedCount * 2500).toLocaleString()}원)`
      : `팝콘 주문 내용을 변경하시겠습니까?\n(맛 변경 사항이 저장됩니다)`;
    if (willNeedPayment) {
      confirmMsg += `\n\n결제 대기 상태로 전환되며, 입금 확인 전까지 예매 확정이 취소됩니다.`;
    }

    showConfirm(confirmMsg, async () => {
      const { error } = await supabase.from('reservations')
        .update({ popcorn_order: finalPopcornString, payment_status: newStatus })
        .eq('id', myReservation.id);
      if (error) return showAlert("팝콘 추가 중 오류가 발생했습니다.");

      await supabase.from('activity_logs').insert([{ student_id: profile.student_id, student_name: profile.name, description: `팝콘 추가 주문 (${myReservation.seat})` }]);

      setMyReservation(prev => prev ? { ...prev, popcorn: finalPopcornString, status: newStatus } : prev);
      setSeatStatuses(prev => ({ ...prev, [myReservation.seat]: { ...prev[myReservation.seat], popcorn: finalPopcornString, status: newStatus } }));
      setIsModalOpen(false);
      setIsAddPopcornMode(false);

      const baseUrl = window.location.origin;
      fetch('/api/ticket', { method: 'POST', body: JSON.stringify({
        email: profile.email, name: profile.name, seat: myReservation.seat,
        movieTitle: movieInfo.title, movieDate: movieInfo.date_string,
        venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: (movieInfo as any).poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: (movieInfo as any).background_template_url,
        statusType: 'pending', popcorn: finalPopcornString, ticketId: myReservation.id, baseUrl
      }) });

      showSuccess("팝콘 주문이 갱신되었습니다!", "QR코드로 갱신된 금액을 입금해주세요.");
    });
  };

  const handleSubmit = async () => {
    if (!profile) return showAlert("로그인이 필요합니다.");

    if (blacklistedUsers.includes(profile.email)) return showAlert("블랙리스트에 등록되어 예매가 제한되었습니다.");

    if (selectedSeat && vipSeats.has(selectedSeat)) {
      if (!clubMemberIds.includes(profile.email)) {
        return showAlert("선택하신 좌석은 '영화대교' 동아리 전용석입니다.\n일반 학생은 다른 좌석을 선택해주세요.");
      }
    }

    const processReservation = async () => {
      try {
        const { data: existingTickets } = await supabase.from('reservations')
          .select('*')
          .eq('movie_date', movieInfo.db_date)
          .eq('user_id', profile.id);

        const baseUrl = window.location.origin;
        const userEmail = profile.email;
        const finalPopcornString = popcornList.filter(p => p !== 'none').join(',') || 'none';

        if (existingTickets && existingTickets.length > 0) {
          const myOldTicket = existingTickets[0];
          
          // 기존 팝콘 삭제 불가 로직
          const oldPopcorns = myOldTicket.popcorn_order && myOldTicket.popcorn_order !== 'none' ? myOldTicket.popcorn_order.split(',') : [];
          const newPopcorns = finalPopcornString !== 'none' ? finalPopcornString.split(',') : [];
          
          if (newPopcorns.length < oldPopcorns.length) {
            return showAlert("결제 혼선 방지를 위해 기존에 주문한 팝콘 수량을 취소/삭제할 수 없습니다. (맛 변경 및 추가만 가능)");
          }

          let confirmMsg = `이미 예약된 좌석(${myOldTicket.seat_number})을 새로운 좌석(${selectedSeat})으로 변경하시겠습니까?`;
          if (myOldTicket.popcorn_order !== finalPopcornString) {
            confirmMsg = `팝콘 주문 내역이 변경되었습니다.\n(추가 결제/수령 시 현장에서 문의해주세요.)\n\n` + confirmMsg;
          }
          
          showConfirm(confirmMsg, async () => {
            const { data: updatedTicket, error: updateError } = await supabase.from('reservations')
              .update({ seat_number: selectedSeat, popcorn_order: finalPopcornString })
              .eq('id', myOldTicket.id)
              .select('id')
              .single();

            if (updateError) return showAlert("변경 중 오류 발생 (이미 선점된 좌석일 수 있습니다).");

            await supabase.from('activity_logs').insert([{ student_id: profile.student_id, student_name: profile.name, description: `좌석 변경 (${myOldTicket.seat_number} → ${selectedSeat}) 및 팝콘 갱신` }]);

            if (userEmail && updatedTicket) {
              fetch('/api/ticket', { method: 'POST', body: JSON.stringify({ email: userEmail, name: profile.name, seat: selectedSeat, movieTitle: movieInfo.title, movieDate: movieInfo.date_string, venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: (movieInfo as any).poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: (movieInfo as any).background_template_url, statusType: 'changed', popcorn: finalPopcornString, ticketId: updatedTicket.id, baseUrl }) });
            }
            showSuccess("예매 변경 완료!", "좌석이 성공적으로 변경되었습니다.\n새로운 티켓이 학교 메일로 발송되었습니다.");
            fetchInitialData(); setIsModalOpen(false); setSelectedSeat(null); setIsMovingSeat(false);
          });
          return;
        }

        const finalStatus = finalPopcornString === 'none' ? 'confirmed' : 'pending';
        const { data: newTicket, error: insertError } = await supabase.from('reservations')
          .insert([{ movie_date: movieInfo.db_date, movie_settings_id: (movieInfo as any).id, user_id: profile.id, student_id: profile.student_id, student_name: profile.name, email: profile.email, seat_number: selectedSeat, popcorn_order: finalPopcornString, payment_status: finalStatus }])
          .select('id').single();

        if (insertError) {
          showAlert("앗! 다른 분이 먼저 예매했습니다.\n다른 좌석을 선택해주세요.");
          fetchInitialData(); return;
        }

        const logDesc = finalStatus === 'confirmed' ? `무료 예매 (${selectedSeat})` : `팝콘 포함 예매 대기 (${selectedSeat})`;
        await supabase.from('activity_logs').insert([{ student_id: profile.student_id, student_name: profile.name, description: logDesc }]);

        setSeatStatuses((prev) => ({ ...prev,[selectedSeat as string]: { status: finalStatus, name: profile.name, ticketId: newTicket?.id || '' } }));
        setMyReservation({ id: newTicket?.id || '', seat: selectedSeat as string, status: finalStatus, popcorn: finalPopcornString });
        setIsModalOpen(false);

        if (userEmail && newTicket) {
          fetch('/api/ticket', { method: 'POST', body: JSON.stringify({ email: userEmail, name: profile.name, seat: selectedSeat, movieTitle: movieInfo.title, movieDate: movieInfo.date_string, venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: (movieInfo as any).poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: (movieInfo as any).background_template_url, statusType: finalStatus, popcorn: finalPopcornString, ticketId: newTicket.id, baseUrl }) });
        }

        if (finalStatus === 'confirmed') {
          showSuccess("예매 성공!", `${profile.name}님 귀중한 예매 감사합니다!\n학교 이메일로 VIP 모바일 티켓이 발송되었습니다.`);
          setSelectedSeat(null);
        } else {
          setIsPaymentModalOpen(true);
        }

      } catch (err) {
        showAlert("네트워크 오류가 발생했습니다.");
      }
    };

    showConfirm(`[${selectedSeat}] 좌석 예매를 확정하시겠습니까?`, processReservation);
  };

  // 🌟 [예매 후 UI] 내 예매 취소
  const handleCancelMyReservation = () => {
    if (!myReservation) return;
    if (myReservation.status === 'confirmed' && myReservation.popcorn && myReservation.popcorn !== 'none') {
      return showAlert("팝콘 결제가 완료된 예매는 취소할 수 없습니다.\n취소가 필요하면 현장에서 문의해주세요.");
    }
    showConfirm("정말로 예매를 취소하시겠습니까?", async () => {
      try {
        const res = await authFetch('/api/reservations', { action: 'CANCEL_OWN', payload: { reservationId: myReservation.id } });
        const data = await res.json();
        if (!data.success) return showAlert(data.error || "취소 중 오류가 발생했습니다.");

        const canceledTicket = data.ticket;
        if (canceledTicket.email) {
          const isRefundNeeded = canceledTicket.popcorn_order !== 'none' && canceledTicket.payment_status === 'confirmed';
          fetch('/api/ticket', {
            method: 'POST',
            body: JSON.stringify({
              email: canceledTicket.email, name: canceledTicket.student_name, seat: canceledTicket.seat_number,
              movieTitle: movieInfo.title, movieDate: movieInfo.date_string,
              venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: (movieInfo as any).poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: (movieInfo as any).background_template_url,
              statusType: 'canceled',
              popcorn: canceledTicket.popcorn_order, ticketId: canceledTicket.id, baseUrl: window.location.origin, isRefundNeeded
            })
          });
        }

        showAlert("예매가 정상적으로 취소되었습니다.", false);
        setMyReservation(null);
        setIsMovingSeat(false);
        setSelectedSeat(null);
        fetchInitialData();
      } catch {
        showAlert("네트워크 오류가 발생했습니다.");
      }
    });
  };

  const handleLogout = async () => {
    setIsProfileMenuOpen(false);
    await signOutAndClear();
  };

  // ===== 🌟 [단체 예매] Handler Functions =====

  const handleGroupStart = async () => {
    if (!profile) return showAlert("로그인이 필요합니다.");

    if (blacklistedUsers.includes(profile.email)) return showAlert("블랙리스트에 등록되어 예매가 제한되었습니다.");
    if (selectedSeat && vipSeats.has(selectedSeat) && !clubMemberIds.includes(profile.email)) {
      return showAlert("선택하신 좌석은 '영화대교' 동아리 전용석입니다.\n일반 학생은 다른 좌석을 선택해주세요.");
    }

    const { data: existingTickets } = await supabase.from('reservations')
      .select('id').eq('movie_date', movieInfo.db_date).eq('user_id', profile.id);
    if (existingTickets && existingTickets.length > 0) {
      return showAlert("이미 예매 내역이 존재하는 학생은 단체 예매 리더가 될 수 없습니다.\n기존 예매를 취소한 뒤 다시 시도해주세요.");
    }

    setGroupLeader({ profileId: profile.id, studentId: profile.student_id, name: profile.name, seat: selectedSeat!, email: profile.email });
    setGroupMembers([]);
    setIsGroupMode(true);
    setIsModalOpen(false);
  };

  useEffect(() => {
    const q = memberSearchQuery.trim();
    if (q.length < 1) { setMemberSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await authFetchGet(`/api/profiles/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) setMemberSearchResults(data.results);
      } catch { setMemberSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearchQuery]);

  const handleAddGroupMember = async (andFinalize: boolean) => {
    if (!selectedMember) return showAlert("추가할 사람을 검색해서 선택해주세요!");
    if (blacklistedUsers.includes(selectedMember.email)) return showAlert("블랙리스트에 등록되어 추가할 수 없습니다.");
    if (groupLeader?.profileId === selectedMember.id) return showAlert("리더 본인은 추가할 수 없습니다.");
    if (groupMembers.some(m => m.profileId === selectedMember.id)) return showAlert("이미 단체에 추가된 사람입니다.");

    const { data: existing } = await supabase.from('reservations')
      .select('id').eq('movie_date', movieInfo.db_date).eq('user_id', selectedMember.id);
    if (existing && existing.length > 0) return showAlert("이미 예매가 완료된 학생입니다.");

    if (selectedSeat && vipSeats.has(selectedSeat)) {
      if (!clubMemberIds.includes(selectedMember.email)) {
        return showAlert("선택하신 좌석은 '영화대교' 동아리 전용석입니다.\n이 좌석에는 동아리 부원만 추가할 수 있습니다.");
      }
    }

    const newMembers = [...groupMembers, { profileId: selectedMember.id, studentId: selectedMember.student_id, name: selectedMember.name, seat: selectedSeat! }];
    setGroupMembers(newMembers);
    setIsGroupMemberModal(false);
    setSelectedSeat(null);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    setSelectedMember(null);
    if (andFinalize) {
      setTimeout(() => setIsGroupSummaryOpen(true), 100);
    }
  };

  const handleGroupFinalize = async () => {
    if (!profile) return showAlert("로그인이 필요합니다.");
    setIsGroupSummaryOpen(false);
    const leaderName = groupLeader!.name;
    const leaderSeat = groupLeader!.seat;
    const memberCount = groupMembers.length;
    const groupId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const baseUrl = window.location.origin;

    const res = await authFetch('/api/reservations', {
      action: 'CREATE_GROUP',
      payload: {
        movieDate: movieInfo.db_date,
        movieSettingsId: (movieInfo as any).id,
        leaderSeat,
        memberSeats: groupMembers.map(m => ({ profileId: m.profileId, seat: m.seat })),
        groupId, expiresAt
      }
    });
    const data = await res.json();
    if (!data.success) return showAlert(data.error || "단체 예매 생성 중 오류가 발생했습니다.");

    const { leaderTicket, memberTickets } = data;

    fetch('/api/ticket', {
      method: 'POST',
      body: JSON.stringify({
        email: profile.email, name: leaderName, seat: leaderSeat,
        movieTitle: movieInfo.title, movieDate: movieInfo.date_string,
        venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: (movieInfo as any).poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: (movieInfo as any).background_template_url,
        statusType: 'confirmed', popcorn: 'none', ticketId: leaderTicket.id, baseUrl
      })
    });

    setGroupSendingProgress({ current: 0, total: memberTickets.length, sending: true });
    const emailPayloads = memberTickets.map((t: any) => ({
      memberId: t.id, name: t.student_name, seat: t.seat_number, studentId: t.student_id
    }));
    const CHUNK_SIZE = 5;
    for (let i = 0; i < emailPayloads.length; i += CHUNK_SIZE) {
      const chunk = emailPayloads.slice(i, i + CHUNK_SIZE);
      try {
        await fetch('/api/group-invite', {
          method: 'POST',
          body: JSON.stringify({ members: chunk, leaderName, movieTitle: movieInfo.title, movieDate: movieInfo.date_string, venue: movieInfo.venue, posterUrl: (movieInfo as any).poster_cdn_url || movieInfo.poster_url, groupId, baseUrl })
        });
      } catch (err) { console.error(err); }
      setGroupSendingProgress({ current: Math.min(i + CHUNK_SIZE, emailPayloads.length), total: emailPayloads.length, sending: true });
      if (i + CHUNK_SIZE < emailPayloads.length) await new Promise(r => setTimeout(r, 1000));
    }

    setGroupSendingProgress(prev => ({ ...prev, sending: false }));
    setIsGroupMode(false);
    setGroupLeader(null);
    setGroupMembers([]);
    fetchInitialData();
    showSuccess("단체 예매 완료!", `${leaderName}님의 단체 예매가 등록되었습니다!\n\n리더의 예매는 즉시 확정되었습니다.\n멤버 ${memberCount}명에게 초대 이메일이 발송되었습니다.\n\n멤버들은 1시간 이내에 이메일을 통해 예매를 확정해야 합니다.`);
  };

  const handleCancelGroupMode = () => {
    showConfirm("단체 예매를 취소하시겠습니까?\n추가된 멤버 정보가 모두 삭제됩니다.", () => {
      setIsGroupMode(false);
      setGroupLeader(null);
      setGroupMembers([]);
      setSelectedSeat(null);
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center select-none overflow-hidden">
        <div className="relative flex flex-col items-center justify-center animate-pulse">
          <div className="absolute w-48 h-48 md:w-64 md:h-64 bg-orange-500/20 rounded-full blur-[80px] pointer-events-none"></div>
          <div style={{ fontFamily: "var(--font-song-myung), serif" }} className="text-center flex flex-col leading-tight z-10 text-neutral-100">
            <span className="text-[60px] md:text-[80px] tracking-[0.1em] drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">영화</span>
            <span className="text-[60px] md:text-[80px] tracking-[0.1em] drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">대교</span>
          </div>
          <p className="mt-8 text-amber-500/80 text-[10px] md:text-xs tracking-[0.4em] font-bold z-10 uppercase font-sans">로그인 확인 중...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center select-none overflow-hidden">
        <div className="relative flex flex-col items-center justify-center animate-pulse">
          <div className="absolute w-48 h-48 md:w-64 md:h-64 bg-orange-500/20 rounded-full blur-[80px] pointer-events-none"></div>
          <div style={{ fontFamily: "var(--font-song-myung), serif" }} className="text-center flex flex-col leading-tight z-10 text-neutral-100">
            <span className="text-[60px] md:text-[80px] tracking-[0.1em] drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">영화</span>
            <span className="text-[60px] md:text-[80px] tracking-[0.1em] drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">대교</span>
          </div>
          <p className="mt-8 text-amber-500/80 text-[10px] md:text-xs tracking-[0.4em] font-bold z-10 uppercase font-sans">시스템 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 flex flex-col items-center select-none overflow-x-hidden">
      
      <div className="w-full max-w-4xl flex justify-end gap-3 z-20 mt-2 md:mt-0">
        <button onClick={() => setIsManualOpen(true)} className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 rounded-lg text-xs md:text-sm text-orange-300 font-bold transition-all shadow-lg flex items-center gap-1.5">
          <BookOpen className="w-4 h-4" /> 이용 안내
        </button>
        {isAdmin && (
          <>
            <Link href="/admin" className="px-4 py-2 bg-white/5 backdrop-blur-md hover:bg-white/10 border border-white/10 rounded-lg text-xs md:text-sm text-neutral-300 font-bold transition-all shadow-lg hover:shadow-white/5 flex items-center gap-1.5">
              <Settings className="w-4 h-4" /> 관리자
            </Link>
            <Link href="/print" className="px-4 py-2 bg-white/5 backdrop-blur-md hover:bg-white/10 border border-white/10 rounded-lg text-xs md:text-sm text-neutral-300 font-bold transition-all shadow-lg hover:shadow-white/5 flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> 발권기
            </Link>
          </>
        )}

        {profile && (
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(v => !v)}
              aria-label="프로필 메뉴"
              className="w-9 h-9 md:w-10 md:h-10 rounded-full overflow-hidden border border-white/20 bg-neutral-800 hover:border-orange-400/60 transition-all shadow-lg flex items-center justify-center shrink-0"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-neutral-300 font-bold text-sm">{profile.name.charAt(0)}</span>
              )}
            </button>

            {isProfileMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsProfileMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden">
                  <div className="px-3 py-3 border-b border-white/10">
                    <p className="text-white text-sm font-bold truncate">{profile.name}</p>
                    <p className="text-neutral-500 text-xs truncate">{profile.email}</p>
                  </div>
                  <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 text-sm text-rose-400 hover:bg-white/5 font-bold transition-colors flex items-center gap-1.5">
                    <LogOut className="w-4 h-4" /> 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative flex flex-col items-center justify-center mb-10 mt-4 select-none group">
        <div className="absolute w-32 h-32 md:w-40 md:h-40 bg-orange-500/20 rounded-full blur-[60px] pointer-events-none transition-all duration-1000 group-hover:bg-orange-500/30 group-hover:scale-110"></div>
        <div style={{ fontFamily: "var(--font-song-myung), serif" }} className="text-center flex flex-col leading-tight z-10 text-neutral-100">
          <span className="text-[40px] md:text-[50px] tracking-[0.1em] drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">영화</span>
          <span className="text-[40px] md:text-[50px] tracking-[0.1em] drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">대교</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 mb-12 w-full max-w-4xl">
        {/* 🌟 [과거 상영 회차 열람] 왼쪽 화살표: 더 과거 회차로 이동. 가장 오래된 회차거나 과거 이력이 없으면 숨김 */}
        <button
          type="button"
          onClick={goToOlderMovie}
          disabled={pastMovies.length === 0 || (pastIndex !== null && pastIndex >= pastMovies.length - 1)}
          aria-label="이전 상영 회차 보기"
          className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 text-neutral-300 flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)] transition-[transform,opacity,box-shadow,background-color] duration-200 ease-out hover:bg-white/10 hover:text-white hover:shadow-[0_2px_10px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.16)] hover:-translate-x-0.5 active:scale-[0.96] disabled:opacity-0 disabled:pointer-events-none"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>

        <div
          key={viewingPast ? `past-${pastIndex}` : 'current'}
          className={`flex flex-col md:flex-row items-center gap-6 bg-white/5 backdrop-blur-xl p-6 rounded-2xl w-full shadow-2xl border border-white/10 transition-colors duration-500 hover:border-white/20 hover:bg-white/10 ${navDirection === 'older' ? 'movie-card-enter-from-left' : 'movie-card-enter-from-right'}`}
        >
          <img src={(displayMovie as any).poster_cdn_url || displayMovie.poster_url} alt="영화 포스터" loading="lazy" decoding="async" className="w-40 h-56 md:w-44 md:h-64 object-cover rounded-xl shadow-[0_0_25px_rgba(0,0,0,0.6)] border border-white/10 bg-neutral-800" />
          <div className="flex flex-col text-center md:text-left w-full">
            {viewingPast ? (
              <span className="text-neutral-400 font-bold mb-1 text-sm tracking-wide bg-neutral-700/40 border border-neutral-600/50 px-2 py-0.5 rounded-sm w-fit mx-auto md:mx-0 flex items-center gap-1"><History className="w-3.5 h-3.5" /> 지난 상영작</span>
            ) : (
              <span className="text-orange-400 font-bold mb-1 text-sm tracking-wide">이달의 명작 상영작</span>
            )}
            <div className="flex flex-col md:flex-row md:items-end gap-2 mb-2 justify-center md:justify-start">
              <h2 className="text-2xl md:text-3xl font-bold text-white">{displayMovie.title}</h2>
              <span className="text-neutral-400 border border-neutral-600/50 bg-neutral-800/50 text-[10px] md:text-xs px-2 py-0.5 rounded-sm whitespace-nowrap w-fit mx-auto md:mx-0 mb-1">
                관람가: {displayMovie.age_rating}
              </span>
            </div>
            <p className="text-neutral-300 mt-2 text-sm md:text-base font-light flex items-center justify-center md:justify-start gap-1.5"><MapPin className="w-4 h-4 shrink-0" /> 장소: {displayMovie.venue}</p>
            <p className="text-neutral-300 text-sm md:text-base font-light flex items-center justify-center md:justify-start gap-1.5"><Hourglass className="w-4 h-4 shrink-0" /> 일시: {displayMovie.date_string}</p>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
              {viewingPast ? (
                <span className="text-neutral-400 font-bold text-xs md:text-sm bg-neutral-700/30 px-2 py-1 rounded-md flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> 읽기 전용 · 좌석 배치도만 열람 가능
                </span>
              ) : (
                <span className="text-rose-400 font-bold text-xs md:text-sm bg-rose-500/10 px-2 py-1 rounded-md flex items-center gap-1">
                  <Siren className="w-3.5 h-3.5" /> 마감: {new Date(movieInfo.deadline_date).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 🌟 [과거 상영 회차 열람] 오른쪽 화살표: 더 최근 회차로 이동. 현재 상영작을 보고 있으면 숨김 */}
        <button
          type="button"
          onClick={goToNewerMovie}
          disabled={pastIndex === null}
          aria-label="다음 상영 회차 보기"
          className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 text-neutral-300 flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)] transition-[transform,opacity,box-shadow,background-color] duration-200 ease-out hover:bg-white/10 hover:text-white hover:shadow-[0_2px_10px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.16)] hover:translate-x-0.5 active:scale-[0.96] disabled:opacity-0 disabled:pointer-events-none"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {/* 🌟 [영화 평점/후기] 보관 중인(과거) 회차에 한해 열람은 전체 공개, 작성/수정/삭제는 동아리원만 */}
      {viewingPast && pastMovie && (
        <MovieReviews movieSettingsId={pastMovie.id} profile={profile} isClubMember={!!profile && clubMemberIds.includes(profile.email)} />
      )}

      {/* 🌟 [과거 상영 회차 열람] 과거 회차를 보고 있을 때는 완전히 별도의 읽기 전용 좌석 배치도를 렌더링한다.
          예매/팝콘/자리이동 등 인터랙션은 전부 제거되어 있고, 좌석 점유 표시에는 이름/학번 등 개인정보를 절대 노출하지 않는다. */}
      {viewingPast && pastMovie && isPastSeatLoading ? (
        <div className="w-full py-16 flex items-center justify-center">
          <span className="text-neutral-300 text-sm">좌석 정보를 불러오는 중...</span>
        </div>
      ) : viewingPast && pastMovie && !pastHasReservations ? null : viewingPast && pastMovie ? (
        <>
          <div className="relative w-full overflow-x-auto pb-8">
            <div className="flex flex-col items-center gap-1 md:gap-2 min-w-max px-4 pt-6 w-fit mx-auto relative">

              <div className="w-[70%] h-8 md:h-10 rounded-t-3xl flex items-center justify-center mb-8 md:mb-12 border-t border-white/40 bg-neutral-400/70 shadow-[0_-10px_30px_rgba(255,255,255,0.1)]">
                <span className="font-black text-xs md:text-base ml-2 text-neutral-900 tracking-[0.3em] flex items-center gap-1.5"><History className="w-4 h-4" /> 지난 회차</span>
              </div>

              <div className="md:hidden absolute top-0 left-6 animate-bounce text-amber-400 font-bold text-xs flex items-center gap-1 z-10 pointer-events-none drop-shadow-md">
                옆으로 밀어서 확인 <ArrowRight className="w-4 h-4" />
              </div>

              {pastRows.map((rowChar, rowIndex) => (
                <div key={rowIndex} className={`flex items-center gap-1 md:gap-2 ${isPastGrandHall && rowChar === 'H' ? 'mb-8 md:mb-12' : ''}`}>
                  <span className="w-6 md:w-8 text-center font-bold text-neutral-500 text-xs md:text-sm">{rowChar}</span>

                  <div className="flex gap-0.5 md:gap-1">
                    {pastCols.map((colNum, colIndex) => {

                      const seatId = getPastSeatId(rowIndex, colIndex);

                      const isAisle = isPastGrandHall ? (colNum === 9 || colNum === 18) : (colNum === 7);
                      const aisleMargin = isPastGrandHall ? 'mr-4 md:mr-8' : 'mr-8 md:mr-12';

                      const btnSize = isPastGrandHall ? 'w-8 h-10 md:w-10 md:h-12' : 'w-10 h-12 md:w-12 md:h-14';

                      if (!seatId) {
                        return <div key={`empty-${colNum}`} className={`${isAisle ? aisleMargin : ''} ${btnSize}`} />;
                      }

                      // 🌟 개인정보 보호: pastSeatMap은 seat_number -> payment_status만 담고 있으며
                      // 예매자 이름/학번 등은 절대 조회/표시하지 않는다. 좌석엔 seatId만 표시한다.
                      const pastStatus = pastSeatMap[seatId];
                      const isConfirmed = pastStatus === 'confirmed';
                      const isGroupPending = pastStatus === 'group_pending';
                      const isPending = pastStatus === 'pending';
                      const isVipSeat = pastVipSeats.has(seatId);

                      const textSize = isPastGrandHall ? 'text-[11px] md:text-[12px] tracking-tighter whitespace-nowrap' : 'text-[13px] md:text-[15px] tracking-tighter whitespace-nowrap';

                      return (
                        <div key={seatId} className={`flex ${isAisle ? aisleMargin : ''}`}>
                          <button
                            type="button"
                            disabled
                            aria-label={`${seatId} (읽기 전용)`}
                            className={`${btnSize} ${textSize} rounded-t-xl rounded-b-md flex items-center justify-center font-bold px-0 overflow-hidden cursor-default
                              ${isGroupPending ? 'bg-teal-900/40 text-teal-300 opacity-70'
                                : isPending ? 'bg-yellow-600/20 border-yellow-600 text-yellow-500 opacity-80'
                                : isConfirmed ? 'bg-neutral-800/80 text-neutral-500 opacity-80'
                                : isVipSeat ? 'bg-amber-900/60 text-amber-300'
                                : 'bg-white/10 text-neutral-300'}
                            `}
                          >
                            {seatId}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <span className="w-6 md:w-8 text-center font-bold text-neutral-500 text-xs md:text-sm ml-1 md:ml-2">{rowChar}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm text-neutral-400">
            <div className="flex items-center gap-2"><div className="w-4 h-4 bg-white/10 border border-white/5 rounded-sm"></div>예매 가능했던 좌석</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 border border-amber-500/50 bg-amber-900/60 rounded-sm flex items-center justify-center"><Crown className="w-2.5 h-2.5 text-amber-300" /></div>동아리 전용석</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 bg-neutral-800/80 border border-white/5 rounded-sm flex items-center justify-center"><Check className="w-2.5 h-2.5 text-neutral-500" /></div>예매 완료된 좌석</div>
          </div>

          <div className="mt-8 p-6 bg-white/5 backdrop-blur-xl rounded-2xl w-full max-w-xl text-center shadow-2xl border border-white/10">
            <p className="text-neutral-300 font-bold mb-1 flex items-center justify-center gap-1.5"><Lock className="w-4 h-4" /> 지난 상영 회차 열람 모드</p>
            <p className="text-neutral-500 text-sm font-light">좌석 배치도는 읽기 전용이며 예매자 정보는 표시되지 않습니다.<br/>예매 관련 기능은 현재 상영작에서만 이용할 수 있습니다.</p>
            <button onClick={goToNewerMovie} className="mt-4 py-2.5 px-6 bg-orange-600 hover:bg-orange-500 rounded-lg text-white font-bold text-sm transition-all">현재 상영작으로 돌아가기 ▶</button>
          </div>
        </>
      ) : (
      <>
      <div className="relative w-full overflow-x-auto pb-8">
        <div className="flex flex-col items-center gap-1 md:gap-2 min-w-max px-4 pt-6 w-fit mx-auto relative">
          {isClosed && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/80 rounded-xl">
              <span className="text-4xl font-black text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)] transform -rotate-12 border-4 border-rose-500 p-4 rounded-xl">예매가 마감되었습니다</span>
            </div>
          )}

          <div className={`w-[70%] h-8 md:h-10 rounded-t-3xl flex items-center justify-center mb-8 md:mb-12 border-t border-white/40 ${isGroupMode ? 'bg-emerald-400/90 shadow-[0_-10px_30px_rgba(16,185,129,0.3)]' : 'bg-neutral-200/90 shadow-[0_-10px_30px_rgba(255,255,255,0.15)]'}`}>
            <span className={`font-black text-xs md:text-base ml-2 ${isGroupMode ? 'text-emerald-900 tracking-[0.3em] animate-pulse' : 'text-neutral-800 tracking-[1em]'}`}>
              {isGroupMode ? '단체 예매 중' : 'SCREEN'}
            </span>
          </div>

          <div className="md:hidden absolute top-0 left-6 animate-bounce text-amber-400 font-bold text-xs flex items-center gap-1 z-10 pointer-events-none drop-shadow-md">
            옆으로 밀어서 확인 <ArrowRight className="w-4 h-4" />
          </div>

          {rows.map((rowChar, rowIndex) => (
            <div key={rowIndex} className={`flex items-center gap-1 md:gap-2 ${isGrandHall && rowChar === 'H' ? 'mb-8 md:mb-12' : ''}`}>
              <span className="w-6 md:w-8 text-center font-bold text-neutral-500 text-xs md:text-sm">{rowChar}</span>
              
              <div className="flex gap-0.5 md:gap-1">
                {cols.map((colNum, colIndex) => {
                  
                  const seatId = getSeatId(rowIndex, colIndex);
                  
                  const isAisle = isGrandHall ? (colNum === 9 || colNum === 18) : (colNum === 7);
                  const aisleMargin = isGrandHall ? 'mr-4 md:mr-8' : 'mr-8 md:mr-12';
                  
                  const btnSize = isGrandHall ? 'w-8 h-10 md:w-10 md:h-12' : 'w-10 h-12 md:w-12 md:h-14';

                  if (!seatId) {
                    return <div key={`empty-${colNum}`} className={`${isAisle ? aisleMargin : ''} ${btnSize}`} />;
                  }

                  const isSelected = selectedSeat === seatId;
                  const seatData = seatStatuses[seatId];
                  const isConfirmed = seatData?.status === 'confirmed';
                  const isGroupPending = seatData?.status === 'group_pending';
                  const isPending = seatData?.status === 'pending';
                  const isReserved = isConfirmed || isGroupPending || isPending;
                  
                  const isVipSeat = vipSeats.has(seatId);

                  // 🌟 [단체 예매] 로컬 그룹 좌석 확인
                  const isGroupLeaderSeat = isGroupMode && groupLeader?.seat === seatId;
                  const isGroupMemberSeat = isGroupMode && groupMembers.some(m => m.seat === seatId);

                  const displayText = isGroupLeaderSeat ? groupLeader!.name
                    : isGroupMemberSeat ? groupMembers.find(m => m.seat === seatId)!.name
                    : isReserved ? (seatData.name || seatId) : seatId;

                  const textSize = (isReserved || isGroupLeaderSeat || isGroupMemberSeat)
                    ? (isGrandHall ? 'text-[10px] md:text-[11px] tracking-tighter whitespace-nowrap' : 'text-[12px] md:text-[14px] tracking-tighter whitespace-nowrap') 
                    : (isGrandHall ? 'text-[11px] md:text-[12px] tracking-tighter whitespace-nowrap' : 'text-[13px] md:text-[15px] tracking-tighter whitespace-nowrap');

                  return (
                    <div key={seatId} className={`flex ${isAisle ? aisleMargin : ''}`}>
                      <button
                        onClick={() => handleSeatClick(seatId)}
                        disabled={isClosed} 
                        className={`${btnSize} ${textSize} rounded-t-xl rounded-b-md flex items-center justify-center font-bold px-0 transition-colors overflow-hidden
                          ${isGroupLeaderSeat ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] transform -translate-y-1 z-10 font-black ring-2 ring-emerald-400'
                            : isGroupMemberSeat ? 'bg-sky-600 text-white shadow-[0_0_10px_rgba(14,165,233,0.4)] transform -translate-y-0.5 z-10 font-bold ring-1 ring-sky-400'
                            : isGroupPending ? 'bg-teal-900/40 text-teal-300 cursor-not-allowed opacity-70'
                            : isPending ? 'bg-yellow-600/20 border-yellow-600 text-yellow-500 cursor-not-allowed animate-pulse ring-1 ring-yellow-500'
                            : isConfirmed ? 'bg-neutral-800/80 text-neutral-500 cursor-not-allowed opacity-80'
                            : isSelected ? 'bg-orange-500 text-neutral-900 shadow-[0_0_15px_rgba(249,115,22,0.6)] transform -translate-y-1 z-10 font-black'
                            : isVipSeat ? 'bg-amber-900/60 text-amber-300 hover:bg-amber-600/80'
                            : 'bg-white/10 hover:bg-white/20 text-neutral-300'}
                        `}
                      >
                        {displayText}
                      </button>
                    </div>
                  );
                })}
              </div>
              <span className="w-6 md:w-8 text-center font-bold text-neutral-500 text-xs md:text-sm ml-1 md:ml-2">{rowChar}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm text-neutral-400">
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-white/10 border border-white/5 rounded-sm"></div>예매 가능</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 border border-amber-500/50 bg-amber-900/60 rounded-sm flex items-center justify-center"><Crown className="w-2.5 h-2.5 text-amber-300" /></div>동아리 전용</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-neutral-800/80 border border-white/5 rounded-sm flex items-center justify-center"><Check className="w-2.5 h-2.5 text-neutral-500" /></div>예매 완료</div>
        {(isGroupMode || Object.values(seatStatuses).some(s => s.status === 'group_pending')) && (
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-teal-900/40 border border-teal-500/50 rounded-sm"></div>단체 대기 중</div>
        )}
        {Object.values(seatStatuses).some(s => s.status === 'pending') && (
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-600/20 border border-yellow-600 rounded-sm animate-pulse"></div>결제 대기 중</div>
        )}
        {isGroupMode && (
          <>
            <div className="flex items-center gap-2"><div className="w-4 h-4 bg-emerald-600 rounded-sm"></div>리더 (나)</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 bg-sky-600 rounded-sm"></div>단체 멤버</div>
          </>
        )}
      </div>

      <div className="mt-8 p-6 bg-white/5 backdrop-blur-xl rounded-2xl w-full max-w-xl text-center shadow-2xl border border-white/10">
        {isGroupMode ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400 font-bold flex items-center gap-1"><Crown className="w-4 h-4" /> 리더: {groupLeader?.name} ({groupLeader?.seat})</span>
              <span className="text-neutral-400">멤버: {groupMembers.length}명 / 9명</span>
            </div>
            {groupMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {groupMembers.map(m => (
                  <span key={m.seat} className="bg-sky-600/20 text-sky-300 pl-3 pr-2 py-1 rounded-full text-sm border border-sky-500/30 flex items-center gap-1 transition-all">
                    {m.name} ({m.seat})
                    <button onClick={() => setGroupMembers(prev => prev.filter(member => member.seat !== m.seat))} className="ml-1 text-sky-400 hover:text-rose-400 font-bold transition-colors w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-500/20">×</button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-neutral-400 text-xs">빈 좌석을 클릭하여 멤버를 추가하세요 (최대 10명)</p>
            <div className="flex gap-3">
              <button onClick={handleCancelGroupMode} className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-300 font-bold transition-all">단체 예매 취소</button>
              <button onClick={() => { if (groupMembers.length === 0) { setIsGroupSoloConfirmOpen(true); } else { setIsGroupSummaryOpen(true); } }} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">완료하기 →</button>
            </div>
          </div>
        ) : isClosed ? (
           <div className="py-4 px-8 rounded-xl w-full bg-rose-900/40 border border-rose-800 text-rose-400 font-bold text-lg cursor-not-allowed">예매가 모두 마감되었습니다</div>
        ) : myReservation && !isMovingSeat ? (
          <div className="space-y-4">
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border ${myReservation.status === 'pending' ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600 animate-pulse' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'}`}>
              {myReservation.status === 'pending' ? <><Hourglass className="w-3.5 h-3.5" /> 결제 대기 중</> : <><CircleCheck className="w-3.5 h-3.5" /> 예매 확정</>}
            </span>
            <p className="text-lg text-neutral-200">내 좌석: <span className="text-amber-400 font-bold text-3xl md:text-4xl ml-2 tracking-tighter drop-shadow-md">{myReservation.seat}</span></p>
            {myReservation.popcorn && myReservation.popcorn !== 'none' && (
              <p className="text-neutral-400 text-sm flex items-center justify-center gap-1"><Popcorn className="w-4 h-4" /> 팝콘 {myReservation.popcorn.split(',').length}개 주문됨</p>
            )}
            {myReservation.status === 'confirmed' && (!myReservation.popcorn || myReservation.popcorn === 'none') && (
              <button onClick={() => {
                setPopcornList(['none']);
                setIsAddPopcornMode(true);
                setIsModalOpen(true);
              }} className="w-full py-2.5 bg-amber-600/90 hover:bg-amber-500 border border-amber-500 rounded-lg text-white font-bold transition-all text-sm flex items-center justify-center gap-1.5"><Popcorn className="w-4 h-4" /> 팝콘 추가 (결제 필요)</button>
            )}
            {myReservation.status === 'pending' && (
              <div className="bg-neutral-900/60 border border-amber-500/30 rounded-xl p-4 text-left space-y-3">
                <p className="text-amber-300 text-sm font-bold text-center flex items-center justify-center gap-1.5"><Hourglass className="w-4 h-4" /> 아래 QR코드 또는 계좌로 입금을 완료해주세요.</p>
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-xl inline-block"><img src="/qr.jpeg" alt="QR" loading="lazy" decoding="async" className="w-32 h-32 object-contain" /></div>
                  <div className="w-full"><AccountInfo /></div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3 text-sm">
                  <p className="text-neutral-300 mb-1">결제 금액: <span className="text-amber-400 font-bold">{((myReservation.popcorn && myReservation.popcorn !== 'none' ? myReservation.popcorn.split(',').length : 0) * 2500).toLocaleString()}원</span></p>
                  <p className="text-neutral-300">입금자명: <span className="text-orange-400 font-bold">{profile?.student_id ?? ''} {profile?.name}</span></p>
                </div>
                <button onClick={() => {
                  const existing = myReservation.popcorn && myReservation.popcorn !== 'none' ? myReservation.popcorn.split(',') : [];
                  setPopcornList([...existing, 'none']);
                  setIsAddPopcornMode(true);
                  setIsModalOpen(true);
                }} className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 border border-amber-500 rounded-lg text-white font-bold transition-all text-sm flex items-center justify-center gap-1.5"><Popcorn className="w-4 h-4" /> 팝콘 추가</button>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => {
                const existing = myReservation.popcorn && myReservation.popcorn !== 'none' ? myReservation.popcorn.split(',') : [];
                setPopcornList([...existing, 'none']);
                setIsMovingSeat(true);
                setSelectedSeat(null);
              }} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 border border-orange-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] flex items-center justify-center gap-1.5"><RefreshCw className="w-4 h-4" /> 자리 이동</button>
              {myReservation.status === 'confirmed' && myReservation.popcorn && myReservation.popcorn !== 'none' ? (
                <button disabled title="팝콘 결제가 완료된 예매는 취소할 수 없습니다." className="flex-1 py-3 bg-neutral-700/40 border border-neutral-600 rounded-lg text-neutral-500 font-bold cursor-not-allowed flex items-center justify-center gap-1.5"><Ban className="w-4 h-4" /> 예매 취소 불가</button>
              ) : (
                <button onClick={handleCancelMyReservation} className="flex-1 py-3 bg-rose-600/90 hover:bg-rose-500 border border-rose-500 rounded-lg text-white font-bold transition-all flex items-center justify-center gap-1.5"><Ban className="w-4 h-4" /> 예매 취소</button>
              )}
            </div>
          </div>
        ) : isMovingSeat ? (
          selectedSeat ? (
            <>
              <p className="text-lg md:text-xl mb-6 text-neutral-200">이동할 좌석: <span className="text-amber-400 font-bold text-3xl md:text-4xl ml-2 tracking-tighter drop-shadow-md">{selectedSeat}</span></p>
              <div className="flex gap-3">
                <button onClick={() => { setIsMovingSeat(false); setSelectedSeat(null); }} className="py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 font-bold transition-all">취소</button>
                <button onClick={handleSubmit} className="flex-1 bg-orange-600 hover:bg-orange-500 hover:scale-[1.02] transition-all text-white font-bold py-4 px-8 rounded-xl text-lg border border-orange-500">이 자리로 이동하기</button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-neutral-400 py-2 font-light">이동할 빈 좌석을 선택해주세요.</p>
              <button onClick={() => setIsMovingSeat(false)} className="py-2 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-300 font-bold text-sm transition-all">이동 취소</button>
            </div>
          )
        ) : selectedSeat ? (
          <>
            <p className="text-lg md:text-xl mb-6 text-neutral-200">선택된 좌석: <span className="text-amber-400 font-bold text-3xl md:text-4xl ml-2 tracking-tighter drop-shadow-md">{selectedSeat}</span></p>
            <button onClick={() => profile ? setIsModalOpen(true) : signInWithGoogle().catch(() => showAlert('로그인에 실패했습니다.'))} className="bg-orange-600 hover:bg-orange-500 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(234,88,12,0.5)] transition-all text-white font-bold py-4 px-8 rounded-xl w-full text-lg border border-orange-500">예매하기</button>
          </>
        ) : <p className="text-neutral-400 py-4 font-light">관람하실 좌석을 선택해주세요.</p>}
      </div>
      </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/95 flex items-center justify-center p-4 z-50 overflow-y-auto duration-300">
          <div className="bg-neutral-900/90 backdrop-blur-xl p-6 rounded-2xl w-full max-w-md border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] my-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">{isAddPopcornMode ? <><Popcorn className="w-5 h-5" /> 팝콘 추가</> : '예매 정보 입력'}</h2>
            <div className="space-y-4 text-left">
              {!isAddPopcornMode && (
                <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50">
                  <p className="text-neutral-500 text-xs mb-1">예매자 (구글 계정으로 확인됨)</p>
                  <p className="text-white font-bold text-lg">{profile?.name} <span className="text-neutral-400 font-normal text-sm">{profile?.student_id ?? '교직원'}</span></p>
                  <p className="text-neutral-500 text-xs mt-1">{profile?.email}</p>
                </div>
              )}

              <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50">
                <label className="flex items-center gap-1.5 text-neutral-300 mb-3 text-sm font-bold"><Popcorn className="w-4 h-4" /> 팝콘 선택 (개당 2,500원)</label>
                
                {popcornList.map((pop, idx) => (
                  <div key={idx} className="mb-3 flex items-center gap-2">
                    <span className="text-neutral-400 text-xs w-12 text-center">
                      {pop === 'none' ? '추가' : `선택 ${idx + 1}`}
                    </span>
                    <select 
                      value={pop} 
                      onChange={(e) => handlePopcornChange(idx, e.target.value)}
                      className="flex-1 p-2 rounded-lg bg-neutral-900 border border-neutral-600 outline-none text-sm text-neutral-200"
                    >
                      <option value="none">{pop === 'none' ? '+ 팝콘 추가하기 (선택 시 결제 필요)' : '선택 취소'}</option>
                      <option value="original">오리지널 버터 팝콘 (2,500원)</option>
                      <option value="consomme">콘소메맛 팝콘 (2,500원)</option>
                      <option value="caramel">카라멜맛 팝콘 (2,500원)</option>
                    </select>
                  </div>
                ))}
                
                <p className="text-xs text-neutral-400 mt-2">* 팝콘은 여러 개 추가할 수 있습니다. (음료는 배부하지 않습니다.)</p>
                
                {(popcornList.filter(p => p !== 'none').length * 2500) > 0 && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex justify-between items-center">
                    <span className="text-amber-400 font-bold">총 결제 예정 금액</span>
                    <span className="text-xl font-bold text-amber-400">{(popcornList.filter(p => p !== 'none').length * 2500).toLocaleString()}원</span>
                  </div>
                )}
              </div>

            </div>
            
            <div className="flex gap-3 mt-8">
              <button onClick={() => { setIsModalOpen(false); setIsAddPopcornMode(false); }} className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-300 font-bold transition-all text-sm">취소</button>
              {isAddPopcornMode ? (
                <button onClick={handleAddPopcornSubmit} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 border border-amber-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(217,119,6,0.3)] text-sm">추가하기</button>
              ) : (
                <>
                  <button onClick={handleSubmit} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 border border-orange-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] text-sm">예매 확정하기</button>
                  <button onClick={handleGroupStart} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] text-sm">단체 예매하기</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-neutral-950/95 flex items-center justify-center p-4 z-[60]">
          <div className="bg-neutral-900/90 backdrop-blur-xl p-8 rounded-2xl max-w-sm border border-amber-500/30 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <h2 className="text-2xl font-bold text-amber-400 mb-2">결제 대기 중</h2>
            <p className="text-neutral-300 mb-6 text-sm">QR코드로 30분 내에 입금을 완료해주세요.</p>
            <div className="bg-white p-4 rounded-xl mb-4 inline-block"><img src="/qr.jpeg" alt="QR" loading="lazy" decoding="async" className="w-48 h-48 object-contain" /></div>
            <div className="mb-6"><AccountInfo /></div>
            <div className="bg-neutral-800 rounded-xl p-4 text-left mb-6 border border-neutral-700">
              <p className="text-sm text-neutral-300 mb-1">결제 금액: <span className="text-amber-400 font-bold text-xl">{(popcornList.filter(p => p !== 'none').length * 2500).toLocaleString()}원</span></p>
              <p className="text-sm text-neutral-300">입금자명: <span className="text-orange-400 font-bold">{profile?.student_id ?? ''} {profile?.name}</span></p>
            </div>
            <button onClick={() => { setIsPaymentModalOpen(false); setSelectedSeat(null); }} className="w-full py-3 bg-orange-600 hover:bg-orange-500 rounded-xl text-white font-bold transition-all text-sm">닫기</button>
          </div>
        </div>
      )}

      {/* 🌟 [신규] 단체 멤버 없이 완료 시 선택 모달 */}
      {isGroupSoloConfirmOpen && groupLeader && (
        <div className="fixed inset-0 bg-neutral-950/90 flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-neutral-700 p-8 rounded-2xl w-full max-w-sm shadow-[0_0_40px_rgba(0,0,0,0.8)] text-center">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CircleHelp className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">어떻게 하시겠습니까?</h2>
            <p className="text-neutral-400 text-sm mb-6">
              추가된 멤버가 없습니다.<br/>
              <span className="text-white font-bold">{groupLeader.name}</span>님의 좌석({groupLeader.seat})만 혼자 예매하거나,<br/>
              계속해서 단체 멤버를 추가할 수 있습니다.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  // 혼자 예매: 그룹 모드 해제 후 일반 예매 흐름으로
                  setIsGroupSoloConfirmOpen(false);
                  setIsGroupMode(false);
                  setSelectedSeat(groupLeader.seat);
                  setGroupLeader(null);
                  setGroupMembers([]);
                  setIsModalOpen(true);
                }}
                className="w-full py-4 bg-orange-600 hover:bg-orange-500 rounded-xl text-white font-bold transition-all shadow-[0_0_15px_rgba(249,115,22,0.3)] flex items-center justify-center gap-2"
              >
                <User className="w-5 h-5" /> 혼자 예매하기
              </button>
              <button
                onClick={() => setIsGroupSoloConfirmOpen(false)}
                className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2"
              >
                <Users className="w-5 h-5" /> 계속 단체 추가하기
              </button>
              <button
                onClick={() => { setIsGroupSoloConfirmOpen(false); setIsGroupMode(false); setGroupLeader(null); setGroupMembers([]); setSelectedSeat(null); }}
                className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-neutral-400 font-bold transition-all text-sm"
              >
                단체 예매 전체 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {isManualOpen && (
        <div className="fixed inset-0 bg-neutral-950/90 flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in duration-200">
          <div className="bg-neutral-900 border border-neutral-700 p-6 md:p-8 rounded-2xl w-full max-w-lg shadow-[0_0_40px_rgba(0,0,0,0.8)] max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-orange-400 mb-6 flex items-center gap-2"><BookOpen className="w-6 h-6" /> 영화대교 예매 가이드</h2>
            
            <div className="space-y-6 text-neutral-300 text-sm md:text-base">
              <div>
                <h3 className="font-bold text-white text-lg mb-1">1. 좌석 선택 및 예매</h3>
                <p>배치도에서 원하는 좌석을 누른 후, 화면 하단의 <span className="text-orange-400 font-bold">예매하기</span> 버튼을 클릭하면, 로그인된 구글 계정 정보로 바로 예약이 확정됩니다.</p>
                <div className="mt-3 bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-sm">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-orange-300 shrink-0" />
                    <p className="text-orange-200 leading-relaxed">
                      <span className="font-bold text-orange-300">학번/이름은 구글 계정 이름에서 자동으로 인식됩니다.</span><br/>
                      정보가 잘못 표시되면 동아리 관리자에게 문의해주세요.
                    </p>
                  </div>
                </div>

                {/* 🌟 [디자인 개선] 좌석 변경 안내 섹션 */}
                <div className="mt-3 bg-neutral-800/50 border border-neutral-700 p-4 rounded-xl text-sm group transition-all hover:border-orange-500/50">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-orange-600/20 flex items-center justify-center text-orange-400 font-bold"><RefreshCw className="w-4 h-4" /></div>
                    <span className="font-bold text-orange-300 text-base">좌석 변경 방법</span>
                  </div>
                  <p className="text-neutral-400 leading-relaxed ml-11">
                    예매되지 않은 빈 좌석을 선택하여 예매를 다시 진행하면, <span className="text-white">기존 좌석은 자동으로 취소</span>되고 즉시 새로운 좌석으로 변경됩니다.
                  </p>
                </div>
              </div>
              
              <div>
                <h3 className="font-bold text-white text-lg mb-1">2. 모바일 티켓 (이메일 수신)</h3>
                <p>성공적으로 예매가 완료되면, 입력하신 인적 사항에 해당하는 <span className="text-amber-400 font-bold">학교 이메일</span>로 모바일 티켓(예매 내역)이 즉시 발송됩니다.</p>
              </div>

              <div>
                <h3 className="font-bold text-white text-lg mb-1">3. 좌석 범례 안내</h3>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-2 text-xs bg-neutral-800/30 p-2 rounded-lg border border-white/5">
                    <div className="w-5 h-6 bg-white/10 rounded-t-md rounded-b-sm flex-shrink-0"></div>
                    <span className="text-neutral-400">예매 가능</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-amber-900/40 p-2 rounded-lg border border-amber-500/30">
                    <div className="w-5 h-6 bg-amber-900/60 border border-amber-500/50 rounded-t-md rounded-b-sm flex-shrink-0 flex items-center justify-center"><Crown className="w-3 h-3 text-amber-300" /></div>
                    <span className="text-amber-300">동아리 전용</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-neutral-800 p-2 rounded-lg border border-neutral-700">
                    <div className="w-5 h-6 bg-neutral-800/80 rounded-t-md rounded-b-sm flex-shrink-0 flex items-center justify-center"><Check className="w-3 h-3 text-neutral-500" /></div>
                    <span className="text-neutral-500">예매 완료</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-yellow-600/10 p-2 rounded-lg border border-yellow-600/40">
                    <div className="w-5 h-6 bg-yellow-600/20 border border-yellow-600 rounded-t-md rounded-b-sm animate-pulse flex-shrink-0"></div>
                    <span className="text-yellow-400">팝콘 결제 대기</span>
                  </div>
                </div>
              </div>

              {/* 🌟 [신규 추가] 팝콘 선택 안내 */}
              <div>
                <h3 className="font-bold text-amber-400 text-lg mb-1 flex items-center gap-1.5">4. 팝콘 선택 안내 <Popcorn className="w-4 h-4" /></h3>
                <p className="text-neutral-300">예매 시 팝콘을 선택하면 현장에서 수령할 수 있습니다.</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-neutral-400 ml-2 leading-relaxed">
                  <li>팝콘 1개당 <span className="text-amber-400 font-bold">2,500원</span> (현장 결제)</li>
                  <li>종류: 오리지널 버터, 콘소메맛, 카라멜맛</li>
                  <li>팝콘 선택 시 좌석은 <span className="text-yellow-400 font-bold">결제 대기(노란색)</span>로 표시</li>
                  <li>결제 확인 후 관리자가 <span className="text-white font-bold">예매 확정</span>으로 변경</li>
                  <li>팝콘 없이 <span className="text-white font-bold">무료로 예매 확정</span>된 이후에도 <span className="text-amber-400 font-bold">팝콘 추가</span> 버튼으로 언제든 팝콘을 추가 주문할 수 있음 (추가 시 결제 대기로 전환)</li>
                </ul>
              </div>

              {/* 🌟 [신규 추가] 단체 예매 안내 */}
              <div>
                <h3 className="font-bold text-emerald-400 text-lg mb-1">5. 단체 예매 안내 (최대 10명)</h3>
                <p className="text-neutral-300">리더는 본인을 포함해 <span className="text-white font-bold">최대 10명</span>까지 한 번에 예매할 수 있습니다.</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-neutral-400 ml-2 leading-relaxed">
                  <li>리더가 멤버들의 좌석을 지정하여 예매</li>
                  <li>멤버들에게 즉시 <span className="text-emerald-400">초대 이메일</span>이 발송됨</li>
                  <li>멤버는 <span className="text-amber-400 font-bold underline underline-offset-4">1시간 이내</span>에 수락 및 확정 필수</li>
                  <li>미확정 시 해당 좌석은 자동으로 취소됨</li>
                </ul>
              </div>

            </div>

            <button onClick={() => setIsManualOpen(false)} className="w-full mt-8 py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all border border-neutral-600 shadow-md">
              닫기
            </button>
          </div>
        </div>
      )}

      {isGroupMemberModal && selectedSeat && (
        <div className="fixed inset-0 bg-neutral-950/95 flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900/90 backdrop-blur-xl p-6 rounded-2xl w-full max-w-md border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <h2 className="text-2xl font-bold text-white mb-2">단체 멤버 추가</h2>
            <p className="text-neutral-400 text-sm mb-6">좌석 <span className="text-sky-400 font-bold">{selectedSeat}</span>에 앉을 사람을 검색하세요. <span className="text-amber-400">한 번이라도 로그인한 적이 있어야</span> 검색됩니다.</p>
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-neutral-300 mb-1 text-sm">이름 또는 학번으로 검색</label>
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={e => { setMemberSearchQuery(e.target.value); setSelectedMember(null); }}
                  className="w-full p-3 rounded-lg bg-neutral-800/80 text-white border border-white/10 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                  placeholder="예: 신민규 또는 2208"
                />
              </div>
              {memberSearchQuery.trim().length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {memberSearchResults.length === 0 && (
                    <p className="text-neutral-500 text-xs px-1">검색 결과가 없습니다. 아직 로그인한 적이 없는 사람일 수 있어요.</p>
                  )}
                  {memberSearchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedMember(r); setMemberSearchQuery(r.name); setMemberSearchResults([]); }}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${selectedMember?.id === r.id ? 'bg-sky-600/30 border-sky-500' : 'bg-neutral-800/60 border-white/10 hover:bg-neutral-700/60'}`}
                    >
                      <span className="text-white font-bold">{r.name}</span>
                      {r.student_id && <span className="text-neutral-400 text-sm ml-2">{r.student_id}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => { setIsGroupMemberModal(false); setSelectedSeat(null); setMemberSearchQuery(''); setMemberSearchResults([]); setSelectedMember(null); }} className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-300 font-bold transition-all text-sm">취소</button>
              <button onClick={() => handleAddGroupMember(false)} disabled={!selectedMember} className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed border border-sky-500 rounded-lg text-white font-bold transition-all text-sm">계속하기</button>
              <button onClick={() => handleAddGroupMember(true)} disabled={!selectedMember} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500 rounded-lg text-white font-bold transition-all text-sm">완료하기</button>
            </div>
          </div>
        </div>
      )}

      {isGroupSummaryOpen && groupLeader && (
        <div className="fixed inset-0 bg-neutral-950/95 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-neutral-900 border border-emerald-500/30 p-6 md:p-8 rounded-2xl w-full max-w-lg shadow-[0_0_40px_rgba(16,185,129,0.2)] my-8">
            <h2 className="text-2xl font-bold text-emerald-400 mb-6 flex items-center gap-2"><ClipboardList className="w-6 h-6" /> 단체 예매 최종 확인</h2>
            <div className="space-y-3 mb-6">
              <div className="bg-emerald-900/30 border border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
                <Crown className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-emerald-300 font-bold">{groupLeader.name} <span className="text-emerald-500 text-xs">(리더)</span></p>
                  <p className="text-neutral-400 text-sm">좌석: {groupLeader.seat} · {groupLeader.studentId}</p>
                </div>
              </div>
              {groupMembers.map((m, i) => (
                <div key={m.seat} className="bg-sky-900/20 border border-sky-500/20 p-4 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sky-400 font-bold text-lg">{i + 1}</span>
                    <div>
                      <p className="text-sky-300 font-bold">{m.name}</p>
                      <p className="text-neutral-400 text-sm">좌석: {m.seat} · {m.studentId}</p>
                    </div>
                  </div>
                  <button onClick={() => setGroupMembers(prev => prev.filter(member => member.seat !== m.seat))} className="w-8 h-8 flex items-center justify-center rounded-full bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors" title="멤버 제거">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-xl mb-6">
              <p className="text-amber-300 text-sm font-bold flex items-center gap-1.5"><Hourglass className="w-4 h-4" /> 1시간 안에 초대 이메일에 응답한 사람만 예매가 확정됩니다.</p>
              <p className="text-neutral-400 text-xs mt-1">미응답 시 해당 좌석은 자동으로 해제됩니다.</p>
            </div>
            <p className="text-neutral-300 text-sm text-center mb-6">단체의 모든 사람에게 초대 이메일을 발송하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setIsGroupSummaryOpen(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-300 font-bold transition-all">돌아가기</button>
              <button onClick={handleGroupFinalize} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">확정 및 이메일 발송</button>
            </div>
          </div>
        </div>
      )}

      {groupSendingProgress.sending && (
        <div className="fixed inset-0 bg-neutral-950/95 flex items-center justify-center p-4 z-[100]">
          <div className="bg-neutral-900 border border-emerald-500/30 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl">
            <div className="mb-4 flex justify-center text-emerald-400 animate-bounce"><Mail className="w-12 h-12" /></div>
            <h3 className="text-xl font-bold text-white mb-4">초대 이메일 발송 중...</h3>
            <div className="w-full bg-neutral-800 rounded-full h-4 mb-4 overflow-hidden">
              <div className="bg-emerald-500 h-4 rounded-full transition-all duration-500" style={{ width: `${(groupSendingProgress.current / groupSendingProgress.total) * 100}%` }}></div>
            </div>
            <p className="text-emerald-400 font-bold">{groupSendingProgress.current} / {groupSendingProgress.total}명 완료</p>
            <p className="text-neutral-500 text-xs mt-2">창을 닫지 마세요. 이메일 발송이 완료될 때까지 기다려주세요.</p>
          </div>
        </div>
      )}

      {/* ===== 웹 자체 팝업 UI ===== */}
      
      {alertInfo && (
        <div className="fixed inset-0 bg-neutral-950/80 flex items-center justify-center p-4 z-[80]">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl">
            <div className={`mb-4 flex justify-center ${alertInfo.isError ? 'text-rose-500' : 'text-orange-400'}`}>
               {alertInfo.isError ? <Siren className="w-10 h-10" /> : <Sparkles className="w-10 h-10" />}
            </div>
            <p className="text-white text-lg font-bold mb-6 whitespace-pre-line leading-relaxed">{alertInfo.message}</p>
            <button onClick={() => setAlertInfo(null)} className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold transition-all border border-white/10">확인</button>
          </div>
        </div>
      )}

      {confirmInfo && (
        <div className="fixed inset-0 bg-neutral-950/80 flex items-center justify-center p-4 z-[90]">
          <div className="bg-neutral-900 border border-orange-500/30 p-6 rounded-2xl w-full max-w-sm text-center shadow-[0_0_30px_rgba(234,88,12,0.2)]">
            <div className="mb-4 flex justify-center text-orange-400"><CircleHelp className="w-10 h-10" /></div>
            <p className="text-white text-lg font-bold mb-6 whitespace-pre-line leading-relaxed">{confirmInfo.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmInfo(null)} 
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-neutral-300 font-bold transition-all border border-white/10">취소</button>
              <button 
                onClick={() => {
                  setConfirmInfo(null);
                  confirmInfo.onConfirm();
                }} 
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg text-white font-bold transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)] border border-orange-500">확인</button>
            </div>
          </div>
        </div>
      )}

      {successInfo && (
        <div className="fixed inset-0 bg-neutral-950/90 flex items-center justify-center p-4 z-[100] animate-in fade-in zoom-in duration-300">
          <div className="bg-neutral-900 border border-emerald-500/50 p-8 rounded-2xl w-full max-w-md w-[90%] md:w-full text-center shadow-[0_0_50px_rgba(16,185,129,0.3)]">
            <div className="mb-4 flex justify-center text-emerald-400 animate-bounce"><PartyPopper className="w-14 h-14" /></div>
            <h3 className="text-2xl font-black text-white mb-2">{successInfo.title}</h3>
            <p className="text-neutral-300 text-base mb-8 whitespace-pre-line leading-relaxed">{successInfo.message}</p>
            <div className="flex flex-col gap-3">
              <a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer" 
                 onClick={() => setSuccessInfo(null)}
                 className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-black text-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] border border-emerald-400 flex items-center justify-center gap-2">
<Ticket className="w-5 h-5" /> 티켓 확인하러 가기
              </a>
              <button onClick={() => setSuccessInfo(null)} className="w-full py-3 bg-transparent text-neutral-400 hover:text-white font-bold transition-all mt-2">그냥 닫기</button>
            </div>
          </div>
        </div>
      )}

      <footer className="w-full mt-16 border-t border-neutral-800">
        <div className="bg-neutral-900/50 -mx-4 md:-mx-8 px-4 md:px-8">
          <div className="py-4 flex items-center justify-center gap-2.5 text-[11px] text-neutral-500 flex-wrap">
            <a href="/privacy" className="hover:text-neutral-400 transition-colors">개인정보처리방침</a>
            <span className="opacity-40">·</span>
            <span>© 2026 영화대교. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}