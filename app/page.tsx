"use client";

import { useState, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentProps } from 'react';
import { supabase } from '../lib/supabase';
import { ensureProfile, signInWithGoogle, signOutAndClear, authFetch, authFetchGet, DomainNotAllowedError, type AppProfile } from '../lib/supabase-auth';
import Link from 'next/link'; // 🌟[추가] Next.js Link 임포트
import { Crown, Popcorn, Sparkles, PartyPopper, Mail, BookOpen, LogOut, Hourglass, RefreshCw, User, Users, Lightbulb, ClipboardList, CircleHelp, Ticket, PenLine, TriangleAlert, Minus, Plus } from 'lucide-react';

import AccountInfo from '@/components/AccountInfo';
import MovieReviews from '@/components/MovieReviews';
import PrivacyConsentGate, { type ConsentStatus } from '@/components/PrivacyConsentGate';
import RequiredReviewModal, { type PendingReview } from '@/components/RequiredReviewModal';
import { getGridRows, getGridCols, computeVipSeats } from '@/lib/seatGrid';
import { countBookable, getZones, initialZone, zoneOf, type ZoneKey } from '@/lib/seatZones';
import SeatGrid, { type SeatState } from '@/components/home/SeatGrid';
import ZoneMap from '@/components/home/ZoneMap';
import SeatLegend from '@/components/home/SeatLegend';
import BookingBar from '@/components/home/BookingBar';
import MovieInfo from '@/components/home/MovieInfo';

// 🌟 [로그인 리다이렉트 복원] 비로그인 좌석 클릭 -> 구글 로그인 -> 복귀 사이에 풀 페이지
// 리다이렉트로 예매 진행 state가 초기화되는 것을 막기 위한 임시 저장 키
const PENDING_SEAT_KEY = 'pending_seat_selection';

// 폰(md 미만)은 좌석을 구역 하나씩 보여 준다.
const PHONE_QUERY = '(max-width: 767px)';
// 창(모달) 공통 모양: 덮개, 상자, 흰 주버튼(각진 모서리), 테두리 보조버튼
const OVERLAY = 'fixed inset-0 bg-ground/90 flex items-center justify-center p-4';
const BOX = 'bg-card border border-line rounded-lg';
// 팝콘 맛(예매 popcorn_order에 저장되는 키와 같음)
const POPCORN_FLAVORS = [
  { key: 'original', label: '오리지널 버터' },
  { key: 'consomme', label: '콘소메' },
  { key: 'caramel', label: '카라멜' },
] as const;
const BTN_PRIMARY = 'h-12 px-4 bg-ink text-ground font-bold hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_SECONDARY = 'h-12 px-4 border border-line-strong text-ink font-bold hover:border-line-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

// reservations 가드 트리거(0016)는 사용자에게 보여줄 수 있는 사유를 P0001로 던진다.
// 그 외 오류(중복 좌석 등)는 화면별 기본 문구를 쓴다.
function dbErrorMessage(error: { code?: string; message: string }, fallback: string) {
  return error.code === 'P0001' ? error.message : fallback;
}

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
  defective_seats?: string[];
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
    grand_vip_start_row: "A", grand_vip_end_row: "C", grand_vip_start_col: 10, grand_vip_end_col: 18,
    defective_seats: [] as string[]
  });
  
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>('checking');
  // 🌟 [버그 수정] 비로그인(anon) 첫 fetch와 로그인 확인 후 fetch가 겹칠 때, 늦게 끝난
  // anon 응답(이름 없음)이 나중 setState로 덮어써서 로그인해도 예매자 이름이 안 보이는
  // race condition을 막기 위한 순번 가드.
  const fetchSeqRef = useRef(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [clubMemberIds, setClubMemberIds] = useState<string[]>([]);
  // 예매 자격(초대 명단/동아리원/관리자). null = 아직 확인 전. DB의 can_book()과 같은 기준.
  const [canBook, setCanBook] = useState<boolean | null>(null);
  // 직전 상영작을 보고 아직 후기를 안 썼으면 그 영화(0021 my_pending_review). undefined = 확인 전, null = 해당 없음.
  const [pendingReview, setPendingReview] = useState<PendingReview | null | undefined>(undefined);
  // 후기 작성 창을 띄운 뒤 등록이 끝나면 이어서 할 일(보통 고르려던 좌석 선택). null이면 창 닫힘.
  const [reviewResume, setReviewResume] = useState<{ next: () => void } | null>(null);
  // 내가 예매했던 회차 id. 지난 상영작 후기 작성 자격(동아리원 또는 예매자) 표시용.
  const [myBookedMovieIds, setMyBookedMovieIds] = useState<number[]>([]);

  // 🌟 [예매 후 UI] 내 예매 정보 + 자리 이동 모드
  const [myReservation, setMyReservation] = useState<{id: string, seat: string, status: string, popcorn?: string} | null>(null);
  const [isMovingSeat, setIsMovingSeat] = useState(false);
  const [isAddPopcornMode, setIsAddPopcornMode] = useState(false); // 🍿 결제 대기 중 팝콘 추가 모드

  const [alertInfo, setAlertInfo] = useState<{message: string, isError: boolean} | null>(null);
  const [confirmInfo, setConfirmInfo] = useState<{message: string, onConfirm: () => void, danger?: boolean} | null>(null);
  const [successInfo, setSuccessInfo] = useState<{title: string, message: string} | null>(null);

  const showAlert = (message: string, isError = true) => setAlertInfo({ message, isError });
  const NOT_INVITED_MESSAGE = "초대받은 분만 예매할 수 있습니다.\n초대가 필요하면 '영화대교' 동아리에 문의해주세요.";
  // danger: 확인 버튼을 위험 동작(빨간 글씨)으로 보여 준다(예매 취소 등).
  const showConfirm = (message: string, onConfirm: () => void, danger = false) => setConfirmInfo({ message, onConfirm, danger });
  const showSuccess = (title: string, message: string) => setSuccessInfo({ title, message });

  const isGrandHall = movieInfo.venue.includes('대강당');

  const rows = useMemo(() => getGridRows(isGrandHall), [isGrandHall]);

  const cols = useMemo(() => getGridCols(isGrandHall), [isGrandHall]);

  const vipSeats = useMemo(
    () => computeVipSeats(isGrandHall, rows, cols, movieInfo),
    [movieInfo, isGrandHall, rows, cols]
  );

  // 남은 좌석 = 보는 사람이 지금 고를 수 있는 좌석 수. 예매 행이 있는 좌석은 빼고, 동아리 전용은 동아리원에게만 센다(DB 가드와 같은 기준).
  const viewerIsClubMember = !!profile && clubMemberIds.includes(profile.email);
  const takenSeats = useMemo(() => new Set(Object.keys(seatStatuses)), [seatStatuses]);
  const remainingSeats = countBookable(isGrandHall, null, takenSeats, vipSeats, viewerIsClubMember);

  // 하자 좌석은 좌석표에 점선으로 표시하고, 클릭 시점에도 경고한다.
  const defectiveSeats = useMemo(() => new Set(movieInfo.defective_seats ?? []), [movieInfo]);
  const warnIfDefective = (seatId: string, proceed: () => void) => {
    if (!defectiveSeats.has(seatId)) return proceed();
    showConfirm(`${seatId}번 좌석은 의자에 하자가 있습니다.\n그래도 이 좌석을 선택하시겠습니까?`, proceed);
  };

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
    setZone(null);
    setNavDirection('older');
    setPastIndex(prev => {
      if (prev === null) return 0;
      return prev < pastMovies.length - 1 ? prev + 1 : prev;
    });
  };

  // 현재 상영작 방향으로 이동(오른쪽 화살표)
  const goToNewerMovie = () => {
    setSelectedSeat(null);
    setZone(null);
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

  // 🌟 [폰 좌석 구역] zone이 null이면 자동: 내 예매 좌석 > 고른 좌석(로그인 복원 포함) > 첫 구역.
  // 회차를 옮기면 null로 되돌리고, 상영관이 바뀌어 맞지 않는 구역이면 자동 구역을 쓴다.
  const isPhone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  const [zone, setZone] = useState<ZoneKey | null>(null);
  const gridZones = getZones(viewingPast ? isPastGrandHall : isGrandHall);
  const autoZone = viewingPast ? gridZones[0].key : initialZone(isGrandHall, myReservation?.seat ?? null, selectedSeat);
  const activeZone = gridZones.find(z => z.key === zone) ?? gridZones.find(z => z.key === autoZone) ?? gridZones[0];

  const zoneCounts = useMemo(() => {
    const counts = {} as Record<ZoneKey, number>;
    for (const z of getZones(isGrandHall)) counts[z.key] = countBookable(isGrandHall, z, takenSeats, vipSeats, viewerIsClubMember);
    return counts;
  }, [isGrandHall, takenSeats, vipSeats, viewerIsClubMember]);

  const hasPendingSeats = Object.values(seatStatuses).some(s => s.status === 'pending');
  const showGroupPendingLegend = isGroupMode || Object.values(seatStatuses).some(s => s.status === 'group_pending');

  const currentSeatState = (seatId: string): SeatState => {
    const vip = vipSeats.has(seatId);
    const defective = defectiveSeats.has(seatId);
    // 🌟 [단체 예매] 로컬 그룹 좌석이 먼저
    if (isGroupMode && groupLeader?.seat === seatId) return { visual: 'groupLeader', label: groupLeader.name, vip, defective };
    const member = isGroupMode ? groupMembers.find(m => m.seat === seatId) : undefined;
    if (member) return { visual: 'groupMember', label: member.name, vip, defective };
    const data = seatStatuses[seatId];
    if (data) {
      const visual = data.status === 'pending' ? 'pending' : data.status === 'group_pending' ? 'groupPending' : 'taken';
      return { visual, label: data.name || seatId, vip, defective };
    }
    if (selectedSeat === seatId) return { visual: 'selected', label: seatId, vip, defective };
    return { visual: 'empty', label: seatId, vip, defective };
  };

  // 🌟 개인정보 보호: pastSeatMap은 seat_number -> payment_status만 담고 있으며
  // 예매자 이름/학번 등은 절대 조회/표시하지 않는다. 좌석엔 seatId만 표시한다.
  const pastDefectiveSeats = useMemo(() => new Set(pastMovie?.defective_seats ?? []), [pastMovie]);
  const pastSeatState = (seatId: string): SeatState => {
    const status = pastSeatMap[seatId];
    const visual = status === 'confirmed' ? 'taken' : status === 'pending' ? 'pending' : status === 'group_pending' ? 'groupPending' : 'empty';
    return { visual, label: seatId, vip: pastVipSeats.has(seatId), defective: pastDefectiveSeats.has(seatId) };
  };


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

  // 로그인 확인이 끝난 뒤에 불러온다. 확인 전에 익명으로 먼저 불러오면 로그인 사용자는
  // 쓸모없는 current_seat_status RPC 호출을 하고 그 결과는 seq 가드에 버려진다.
  useEffect(() => {
    if (authLoading) return;
    fetchInitialData();
  }, [profile, authLoading]);

  // 🌟 [로그인 리다이렉트 복원] 좌석 클릭 -> 구글 로그인 -> 복귀 직후, 남겨둔 좌석을
  // seatStatuses(로그인 후 fetchInitialData 완료분)로 재검증하고 팝콘 선택 모달을 바로 연다.
  // 개인정보 동의 전에는 복원하지 않는다(동의 모달 뒤에서 팝콘 모달이 열리지 않게).
  useEffect(() => {
    if (!profile || isLoading || canBook === null || pendingReview === undefined || consentStatus !== 'valid') return;
    let pending: string | null = null;
    try { pending = sessionStorage.getItem(PENDING_SEAT_KEY); } catch { /* sessionStorage unavailable: skip */ }
    if (!pending) return;
    try { sessionStorage.removeItem(PENDING_SEAT_KEY); } catch { /* sessionStorage unavailable: skip */ }

    if (!canBook) {
      showAlert(NOT_INVITED_MESSAGE);
      return;
    }
    if (isClosed || myReservation || seatStatuses[pending]) {
      showAlert('선택하신 좌석은 로그인하는 동안 마감되었거나 이미 예약되었습니다.');
      return;
    }
    const openSeat = () => warnIfDefective(pending, () => {
      setZone(zoneOf(isGrandHall, pending));
      setSelectedSeat(pending);
      setIsModalOpen(true);
    });
    if (pendingReview) return setReviewResume({ next: openSeat });
    openSeat();
  }, [profile, isLoading, canBook, pendingReview, consentStatus]);

  // 후기 필수 대상이면 들어오자마자 후기 작성 창을 띄운다(페이지당 한 번). '나중에'로 닫으면 배너와 좌석 클릭으로 다시 연다.
  // 위 좌석 복원 effect가 먼저 열었으면 그 이어갈 일을 유지한다.
  const reviewAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (reviewAutoOpenedRef.current || !pendingReview || myReservation || isClosed || isLoading || consentStatus !== 'valid') return;
    reviewAutoOpenedRef.current = true;
    setReviewResume(prev => prev ?? { next: () => {} });
  }, [pendingReview, myReservation, isClosed, isLoading, consentStatus]);

  useEffect(() => {
    if (!profile) { setCanBook(null); return; }
    let active = true;
    supabase.rpc('can_book').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        // 확인 실패 시 UI는 막지 않는다. 실제 차단은 reservations insert RLS가 담당한다.
        console.error('can_book 확인 실패:', error);
        setCanBook(true);
        return;
      }
      setCanBook(!!data);
    });
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    if (!profile) { setPendingReview(undefined); setMyBookedMovieIds([]); return; }
    refreshPendingReview();
    let active = true;
    supabase.from('reservations').select('movie_settings_id').eq('user_id', profile.id).then(({ data }) => {
      if (active && data) setMyBookedMovieIds(data.map(r => r.movie_settings_id));
    });
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    if (!profile) { setIsAdmin(false); return; }
    let active = true;
    // 버튼 노출용 확인만 브라우저에서 RPC로 한다. 관리자 작업 자체는 /api/admin/action이 다시 검사한다.
    supabase.rpc('is_admin').then(({ data, error }) => { if (active && !error) setIsAdmin(!!data); });
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
  // (개인정보 보호: past_seat_status RPC(security definer)가 seat_number/payment_status만 반환 —
  //  reservations는 anon RLS select가 막혀있어 비로그인도 이 RPC로만 열람 가능. student_name 등은 절대 노출 안 함)
  useEffect(() => {
    if (!viewingPast || !pastMovie) { setPastSeatMap({}); setPastHasReservations(true); return; }
    let active = true;
    setIsPastSeatLoading(true);
    supabase.rpc('past_seat_status', { p_movie_settings_id: pastMovie.id })
      .then(({ data, error }) => {
        if (!active) return;
        const success = !error && !!data;
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

  const refreshPendingReview = () => {
    supabase.rpc('my_pending_review').then(({ data, error }) => {
      // 확인 실패 시 화면은 막지 않는다. 실제 차단은 reservations_require_review 트리거가 한다.
      if (error) { console.error('my_pending_review 확인 실패:', error); setPendingReview(null); return; }
      setPendingReview((data as PendingReview[] | null)?.[0] ?? null);
    });
  };

  // 화면 확인을 지나쳐 DB 트리거(reservations_require_review)에 막혔을 때도 경고 대신 후기 작성 창을 연다.
  const isReviewRequiredError = (error: { code?: string; message: string }) =>
    error.code === 'P0001' && error.message.includes('후기를 남겨야');
  const openRequiredReview = () => {
    refreshPendingReview();
    setReviewResume({ next: () => {} });
  };

  const fetchInitialData = async () => {
    const seq = ++fetchSeqRef.current;
    try {
      // 비로그인 열람은 current_seat_status RPC가 활성 회차(db_date)를 스스로 조회하므로 설정 쿼리 결과를
      // 기다릴 필요가 없다. 4개 쿼리 뒤에 직렬로 부르던 것을 같이 출발시킨다.
      const anonSeatsReq = profile ? null : supabase.rpc('current_seat_status');
      const [{ data: settingsData }, { data: bgData }, { data: clubData }, { data: pastData }] = await Promise.all([
        supabase.from('movie_settings').select('*').eq('is_active', true).single(),
        supabase.from('blacklist').select('email'),
        supabase.from('club_members').select('email'),
        // 🌟 [과거 상영 회차 열람] 과거 회차 목록(최신순) — movie_settings 자체 정보라 민감정보 아님
        supabase.from('movie_settings').select('*').eq('is_active', false).order('created_at', { ascending: false }),
      ]);
      if (clubData) setClubMemberIds(clubData.map(c => c.email));
      if (pastData) setPastMovies(pastData);

      if (settingsData) {
        setMovieInfo(settingsData);
        if (settingsData.deadline_date && new Date() > new Date(settingsData.deadline_date)) setIsClosed(true);
      }
      if (bgData) setBlacklistedUsers(bgData.map(b => b.email));

      // 🌟 [비로그인 열람] reservations는 RLS로 anon select가 막혀있어(개인정보 보호),
      // 로그인 전에는 이름/학번 없이 좌석 점유 현황만 주는 current_seat_status RPC로 대신 조회한다.
      // 로그인 후에도 reservations select는 본인 행뿐이라 active_seat_map RPC로 좌석표를 받는다
      // (다른 사람 행은 좌석/상태/이름만, 내 행만 id/팝콘/user_id 포함. 이메일·학번은 안 내려옴).
      type ResRow = { id?: string; seat_number: string; payment_status: string; student_name?: string; group_expires_at?: string | null; popcorn_order?: string; user_id?: string };
      let resData: ResRow[] | null = null;
      if (profile) {
        const { data } = await supabase.rpc('active_seat_map');
        resData = data;
      } else if (anonSeatsReq) {
        const { data, error } = await anonSeatsReq;
        resData = error ? [] : data;
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

      // 🌟 [단체 예매] 만료된 단체 예매 정리 — 세션당 최대 10분에 1회만 확인하고,
      // 처리할 그룹이 있을 때만 Worker를 부른다(대부분의 방문은 Supabase RPC 1번으로 끝난다).
      try {
        const KEY = 'group_check_last_run';
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 10 * 60 * 1000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          supabase.rpc('has_due_group_reports').then(({ data }) => {
            if (data) fetch('/api/cron/group-check').catch(() => {});
          });
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

    // 초대 명단/동아리원/관리자가 아니면 새 예매 불가 (이미 예매한 사람의 자리 이동은 허용)
    if (canBook === false && !myReservation) return showAlert(NOT_INVITED_MESSAGE);

    // 직전 상영작을 봤으면 후기부터. 등록하면 고른 좌석으로 바로 이어간다(이미 예매한 사람의 자리 이동은 제외).
    if (pendingReview && !myReservation && !isGroupMode) {
      if (seatStatuses[seatId]) return;
      setReviewResume({ next: () => warnIfDefective(seatId, () => setSelectedSeat(seatId)) });
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
      warnIfDefective(seatId, () => {
        setSelectedSeat(seatId);
        setMemberSearchQuery('');
        setMemberSearchResults([]);
        setSelectedMember(null);
        setIsGroupMemberModal(true);
      });
      return;
    }

    // 🌟 [예매 완료 좌석] 클릭해도 아무 효과 없음 (본인/타인 무관)
    if (seatStatuses[seatId]) return;

    // 🌟 [예매 후 UI] 이미 예매한 사람은 "자리 이동" 버튼을 눌러야만 새 좌석을 고를 수 있음
    if (myReservation && !isMovingSeat) return;

    warnIfDefective(seatId, () => setSelectedSeat(seatId));
  };

  // 맛별 개수를 한 번 눌러 늘리고 줄인다. 기존 순서를 지키려고 늘릴 땐 끝에 붙이고 줄일 땐 마지막 하나를 뺀다
  // (팝콘 추가 모드의 "변경 없음" 판정이 문자열 비교라 순서가 바뀌면 안 된다).
  const changePopcornCount = (flavor: string, delta: 1 | -1) => {
    const picked = popcornList.filter(p => p !== 'none');
    if (delta === 1) {
      picked.push(flavor);
    } else {
      const last = picked.lastIndexOf(flavor);
      if (last === -1) return;
      picked.splice(last, 1);
    }
    setPopcornList([...picked, 'none']);
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
      if (error) return showAlert(dbErrorMessage(error, "팝콘 추가 중 오류가 발생했습니다."));

      await supabase.from('activity_logs').insert([{ student_id: profile.student_id, student_name: profile.name, description: `팝콘 추가 주문 (${myReservation.seat})` }]);

      setMyReservation(prev => prev ? { ...prev, popcorn: finalPopcornString, status: newStatus } : prev);
      setSeatStatuses(prev => ({ ...prev, [myReservation.seat]: { ...prev[myReservation.seat], popcorn: finalPopcornString, status: newStatus } }));
      setIsModalOpen(false);
      setIsAddPopcornMode(false);

      authFetch('/api/ticket', { ticketId: myReservation.id });

      showSuccess("팝콘 주문이 갱신되었습니다!", "QR코드로 갱신된 금액을 입금해주세요.");
    });
  };

  const handleSubmit = async () => {
    if (!profile) return showAlert("로그인이 필요합니다.");

    if (blacklistedUsers.includes(profile.email)) return showAlert("블랙리스트에 등록되어 예매가 제한되었습니다.");
    if (canBook === false && !myReservation) return showAlert(NOT_INVITED_MESSAGE);
    if (pendingReview && !myReservation) return setReviewResume({ next: () => {} });

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

            if (updateError) return showAlert(dbErrorMessage(updateError, "변경 중 오류 발생 (이미 선점된 좌석일 수 있습니다)."));

            await supabase.from('activity_logs').insert([{ student_id: profile.student_id, student_name: profile.name, description: `좌석 변경 (${myOldTicket.seat_number} → ${selectedSeat}) 및 팝콘 갱신` }]);

            if (userEmail && updatedTicket) {
              authFetch('/api/ticket', { ticketId: updatedTicket.id, changed: true });
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
          // 42501 = RLS 위반 (예매 도중 초대 명단에서 빠진 경우 등)
          if (insertError.code === '42501') return showAlert(NOT_INVITED_MESSAGE);
          if (isReviewRequiredError(insertError)) return openRequiredReview();
          if (insertError.code === 'P0001') return showAlert(insertError.message);
          showAlert("앗! 다른 분이 먼저 예매했습니다.\n다른 좌석을 선택해주세요.");
          fetchInitialData(); return;
        }

        const logDesc = finalStatus === 'confirmed' ? `무료 예매 (${selectedSeat})` : `팝콘 포함 예매 대기 (${selectedSeat})`;
        await supabase.from('activity_logs').insert([{ student_id: profile.student_id, student_name: profile.name, description: logDesc }]);

        setSeatStatuses((prev) => ({ ...prev,[selectedSeat as string]: { status: finalStatus, name: profile.name, ticketId: newTicket?.id || '' } }));
        setMyReservation({ id: newTicket?.id || '', seat: selectedSeat as string, status: finalStatus, popcorn: finalPopcornString });
        setIsModalOpen(false);

        if (userEmail && newTicket) {
          authFetch('/api/ticket', { ticketId: newTicket.id });
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

        // 취소 메일은 /api/reservations(CANCEL_OWN)가 취소 직후 서버에서 보낸다.
        showAlert("예매가 정상적으로 취소되었습니다.", false);
        setMyReservation(null);
        setIsMovingSeat(false);
        setSelectedSeat(null);
        fetchInitialData();
      } catch {
        showAlert("네트워크 오류가 발생했습니다.");
      }
    }, true);
  };

  const handleLogout = async () => {
    setIsProfileMenuOpen(false);
    await signOutAndClear();
  };

  // ===== 🌟 [단체 예매] Handler Functions =====

  const handleGroupStart = async () => {
    if (!profile) return showAlert("로그인이 필요합니다.");

    if (blacklistedUsers.includes(profile.email)) return showAlert("블랙리스트에 등록되어 예매가 제한되었습니다.");
    if (canBook === false) return showAlert(NOT_INVITED_MESSAGE);
    if (pendingReview) return setReviewResume({ next: () => {} });
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
    if (groupLeader?.profileId === selectedMember.id) return showAlert("리더 본인은 추가할 수 없습니다.");
    if (groupMembers.some(m => m.profileId === selectedMember.id)) return showAlert("이미 단체에 추가된 사람입니다.");

    // 다른 사람의 예매/블랙리스트/동아리 여부는 RLS로 직접 읽을 수 없어 DB 함수가 판정한다.
    // 반환값은 추가할 수 없는 이유(가능하면 null).
    const { data: blockReason, error: checkError } = await supabase.rpc('group_member_check', { p_user_id: selectedMember.id, p_seat: selectedSeat });
    if (checkError) return showAlert("멤버 확인 중 오류가 발생했습니다.");
    if (blockReason) return showAlert(blockReason);

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

    authFetch('/api/ticket', { ticketId: leaderTicket.id });

    setGroupSendingProgress({ current: 0, total: memberTickets.length, sending: true });
    const emailPayloads: string[] = memberTickets.map((t: any) => t.id);
    const CHUNK_SIZE = 5;
    for (let i = 0; i < emailPayloads.length; i += CHUNK_SIZE) {
      const chunk = emailPayloads.slice(i, i + CHUNK_SIZE);
      try {
        await authFetch('/api/group-invite', { groupId, memberIds: chunk });
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
    }, true);
  };

  // 🌟 [예매 영역] 상태별 하단 바 내용. 분기 순서는 예전 예매 패널과 같다(단체 > 마감 > 내 예매 > 자리 이동 > 고른 좌석).
  const myPopcorns = myReservation?.popcorn && myReservation.popcorn !== 'none' ? myReservation.popcorn.split(',') : [];
  const cancelLocked = myReservation?.status === 'confirmed' && myPopcorns.length > 0;
  // 팝업은 한 번에 하나만 보인다. 여러 개가 동시에 열려 있어도(예: 팝콘 창 위의 확인 창, 후기 등록 알림 뒤의 팝콘 창)
  // 가장 위의 것만 그리고, 그것을 닫으면 아래 것이 나타난다. 각 팝업 상태는 그대로 두므로 흐름은 바뀌지 않는다.
  const reviewDialogOpen = !!(reviewResume && profile && pendingReview && consentStatus === 'valid');
  const topDialog =
    profile && consentStatus === 'needed' ? 'consent'
    : groupSendingProgress.sending ? 'groupSending'
    : confirmInfo ? 'confirm'
    : alertInfo ? 'alert'
    : successInfo ? 'success'
    : reviewDialogOpen ? 'review'
    : isPaymentModalOpen ? 'payment'
    : isGroupSummaryOpen && groupLeader ? 'groupSummary'
    : isGroupMemberModal && selectedSeat ? 'groupMember'
    : isGroupSoloConfirmOpen && groupLeader ? 'groupSolo'
    : isModalOpen ? 'popcorn'
    : isManualOpen ? 'manual'
    : null;

  const bookingBar: ComponentProps<typeof BookingBar> = isGroupMode ? {
    seatLabel: groupLeader?.seat ?? null,
    hint: `리더 · 멤버 ${groupMembers.length}명`,
    primary: { label: '완료하기', onClick: () => { if (groupMembers.length === 0) { setIsGroupSoloConfirmOpen(true); } else { setIsGroupSummaryOpen(true); } } },
    secondary: [{ label: '단체 예매 취소', onClick: handleCancelGroupMode }],
  } : isClosed ? {
    seatLabel: null, hint: '예매가 마감되었어요', primary: null,
  } : myReservation && !isMovingSeat ? {
    seatLabel: myReservation.seat,
    hint: `내 좌석 · ${myReservation.status === 'pending' ? '입금 대기' : '예매 확정'}`,
    primary: { label: '자리 이동', onClick: () => {
      setPopcornList([...myPopcorns, 'none']);
      setIsMovingSeat(true);
      setSelectedSeat(null);
    } },
    secondary: [cancelLocked
      ? { label: '취소 불가', onClick: () => {}, disabled: true }
      : { label: '예매 취소', onClick: handleCancelMyReservation, danger: true }],
  } : isMovingSeat ? {
    seatLabel: selectedSeat,
    hint: selectedSeat ? '이동할 좌석' : '이동할 좌석을 골라 주세요',
    primary: { label: '이 자리로 이동', onClick: handleSubmit, disabled: !selectedSeat },
    secondary: [{ label: '이동 취소', onClick: () => { setIsMovingSeat(false); setSelectedSeat(null); } }],
  } : selectedSeat ? {
    seatLabel: selectedSeat,
    hint: '선택한 좌석',
    primary: { label: '예매하기', onClick: () => profile ? setIsModalOpen(true) : signInWithGoogle().catch(() => showAlert('로그인에 실패했습니다.')) },
  } : {
    seatLabel: null, hint: '좌석을 골라 주세요', primary: null,
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-ground flex items-center justify-center select-none">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="영화대교" className="w-40 h-auto block" />
          <p className="text-dim text-sm">{authLoading ? '로그인 확인 중...' : '불러오는 중...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-ground text-ink select-none overflow-x-hidden ${viewingPast ? '' : 'pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0'}`}>
      <header className="border-b border-line">
        <div className="max-w-[1120px] mx-auto px-4 md:px-10 py-2.5 md:py-4 flex items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="영화대교" className="w-24 md:w-[148px] h-auto block shrink-0" />
          <nav className="flex items-center gap-4 md:gap-7 text-[13px] md:text-sm font-medium">
            <button type="button" onClick={() => setIsManualOpen(true)} className="py-2.5 text-ink hover:text-sub transition-colors whitespace-nowrap">이용 안내</button>
            {isAdmin && (
              <>
                <Link href="/admin" className="py-2.5 text-ink hover:text-sub transition-colors whitespace-nowrap">관리자</Link>
                <Link href="/print" className="py-2.5 text-ink hover:text-sub transition-colors whitespace-nowrap">발권기</Link>
              </>
            )}
            {profile && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen(v => !v)}
                  aria-label="프로필 메뉴"
                  className="w-8 h-8 rounded-full overflow-hidden border border-line-strong bg-raised hover:border-line-bold transition-colors flex items-center justify-center shrink-0"
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-sub font-bold text-sm">{profile.name.charAt(0)}</span>
                  )}
                </button>

                {isProfileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsProfileMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-card border border-line z-30">
                      <div className="px-3 py-3 border-b border-line">
                        <p className="text-ink text-sm font-bold truncate">{profile.name}</p>
                        <p className="text-dim text-xs truncate">{profile.email}</p>
                      </div>
                      <button type="button" onClick={handleLogout} className="w-full text-left px-3 py-2.5 text-sm text-sub hover:text-ink hover:bg-raised font-bold transition-colors flex items-center gap-1.5">
                        <LogOut className="w-4 h-4" /> 로그아웃
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-4 md:px-10 pt-[18px] md:pt-14 pb-20 flex flex-col gap-7 md:gap-[72px]">
      <div className="flex flex-col gap-6">
        <div key={viewingPast ? `past-${pastIndex}` : 'current'} className={navDirection === 'older' ? 'movie-card-enter-from-left' : 'movie-card-enter-from-right'}>
          <MovieInfo
            movie={displayMovie}
            isPast={viewingPast}
            canGoOlder={pastMovies.length > 0 && !(pastIndex !== null && pastIndex >= pastMovies.length - 1)}
            canGoNewer={pastIndex !== null}
            onOlder={goToOlderMovie}
            onNewer={goToNewerMovie}
            remainingSeats={viewingPast ? null : remainingSeats}
            mySeat={!viewingPast && myReservation ? { seat: myReservation.seat, pending: myReservation.status === 'pending' } : null}
            closed={isClosed}
          />
        </div>

        {/* 직전 상영작을 본 사람은 후기를 남겨야 다음 영화를 예매할 수 있다(0021). */}
        {!viewingPast && profile && pendingReview && !myReservation && !isClosed && (
          <div className="border border-line bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-ink text-sm md:text-base font-bold flex items-center gap-2 break-keep">
              <PenLine className="w-4 h-4 shrink-0 text-dim" /> 지난 상영작 「{pendingReview.title}」 후기를 남겨야 예매할 수 있어요.
            </p>
            <button type="button" onClick={() => setReviewResume({ next: () => {} })} className="h-10 px-4 bg-ink text-ground hover:bg-white text-sm font-bold transition-colors shrink-0">
              후기 쓰기
            </button>
          </div>
        )}
      </div>

      {/* 🌟 [영화 평점/후기] 보관 중인(과거) 회차에 한해 열람은 전체 공개, 작성/수정/삭제는 동아리원·예매자만 */}
      {viewingPast && pastMovie && (
        <MovieReviews
          movieSettingsId={pastMovie.id}
          profile={profile}
          canWrite={!!profile && (clubMemberIds.includes(profile.email) || myBookedMovieIds.includes(pastMovie.id))}
          onChange={refreshPendingReview}
        />
      )}

      {/* 🌟 [과거 상영 회차 열람] 과거 회차를 보고 있을 때는 읽기 전용 좌석 배치도를 렌더링한다(onSeatClick 없음).
          예매/팝콘/자리이동 등 인터랙션은 전부 제거되어 있고, 좌석 점유 표시에는 이름/학번 등 개인정보를 절대 노출하지 않는다. */}
      {viewingPast && pastMovie && isPastSeatLoading ? (
        <div className="w-full py-16 flex items-center justify-center">
          <span className="text-dim text-sm">좌석 정보를 불러오는 중...</span>
        </div>
      ) : viewingPast && pastMovie && !pastHasReservations ? null : viewingPast && pastMovie ? (
        <section className="flex flex-col gap-3.5 md:gap-7">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink pb-2 md:pb-3.5">
            <h2 className="m-0 text-[17px] md:text-[22px] font-black">좌석 배치</h2>
            {!isPhone && <SeatLegend showVip={pastVipSeats.size > 0} />}
          </div>
          {isPhone && (
            <>
              <ZoneMap isGrandHall={isPastGrandHall} active={activeZone.key} counts={null} onSelect={setZone} />
              <SeatLegend showVip={pastVipSeats.size > 0} className="justify-end" />
            </>
          )}
          <SeatGrid isGrandHall={isPastGrandHall} zone={isPhone ? activeZone : null} seatState={pastSeatState} size={isPhone ? 'phone' : 'pc'} />
        </section>
      ) : (
      <>
      <section id="seats" className="flex flex-col gap-3.5 md:gap-7 scroll-mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink pb-2 md:pb-3.5">
          <h2 className="m-0 text-[17px] md:text-[22px] font-black">좌석 선택</h2>
          {isPhone ? (
            <span className="text-xs text-dim">남은 좌석 <b className="text-ink">{remainingSeats}</b>석</span>
          ) : (
            <SeatLegend showVip={vipSeats.size > 0} showPending={hasPendingSeats} showGroupPending={showGroupPendingLegend} showGroup={isGroupMode} />
          )}
        </div>
        {isPhone && (
          <>
            <ZoneMap isGrandHall={isGrandHall} active={activeZone.key} counts={zoneCounts} onSelect={setZone} />
            <SeatLegend showVip={vipSeats.size > 0} showPending={hasPendingSeats} showGroupPending={showGroupPendingLegend} showGroup={isGroupMode} className="justify-end" />
          </>
        )}
        <div className="relative">
          <SeatGrid
            isGrandHall={isGrandHall}
            zone={isPhone ? activeZone : null}
            seatState={currentSeatState}
            onSeatClick={handleSeatClick}
            disabled={isClosed}
            size={isPhone ? 'phone' : 'pc'}
          />
          {isClosed && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ground/80">
              <span className="text-sub text-base md:text-lg font-bold">예매가 마감되었어요</span>
            </div>
          )}
        </div>
      </section>

      {/* 예매 영역 위 본문 카드: 단체 멤버 목록, 내 예매의 팝콘·입금 안내 */}
      {isGroupMode ? (
        <div className="bg-card border border-line p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
            <span className="font-bold flex items-center gap-1.5"><Crown className="w-4 h-4" /> 리더: {groupLeader?.name} ({groupLeader?.seat})</span>
            <span className="text-dim">멤버: {groupMembers.length}명 / 9명</span>
          </div>
          {groupMembers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {groupMembers.map(m => (
                <span key={m.seat} className="border border-line-strong pl-3 pr-1 py-1 text-sm flex items-center gap-1">
                  {m.name} ({m.seat})
                  <button type="button" aria-label={`${m.name} 빼기`} onClick={() => setGroupMembers(prev => prev.filter(member => member.seat !== m.seat))} className="w-6 h-6 flex items-center justify-center text-dim hover:text-accent font-bold transition-colors">×</button>
                </span>
              ))}
            </div>
          )}
          <p className="text-dim text-xs">빈 좌석을 클릭하여 멤버를 추가하세요 (최대 10명)</p>
        </div>
      ) : !isClosed && myReservation && !isMovingSeat ? (
        <section className="flex flex-col gap-4">
          {myReservation.status === 'pending' ? (
            <>
              <div className="flex items-baseline justify-between flex-wrap gap-2 border-b border-ink pb-2.5 md:pb-3.5">
                <h2 className="m-0 text-[17px] md:text-[22px] font-black flex items-center gap-2"><Hourglass className="w-5 h-5 shrink-0" /> 입금 안내</h2>
                <span className="text-sm text-dim">QR이나 계좌로 입금해 주세요</span>
              </div>
              <div className="flex flex-col md:flex-row gap-5 md:gap-8 md:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="bg-white p-2.5 shrink-0 self-center md:self-start"><img src="/qr.jpeg" alt="송금 QR" loading="lazy" decoding="async" className="w-32 h-32 object-contain" /></div>
                <dl className="flex-1 min-w-0 m-0 text-sm">
                  <div className="py-3 border-b border-line flex items-center gap-4"><dt className="w-16 shrink-0 text-dim">결제 금액</dt><dd className="m-0 text-lg font-black tabular-nums">{(myPopcorns.length * 2500).toLocaleString()}원</dd></div>
                  <div className="py-3 border-b border-line flex items-center gap-4"><dt className="w-16 shrink-0 text-dim">입금자명</dt><dd className="m-0 font-bold">{profile?.student_id ?? ''} {profile?.name}</dd></div>
                  <div className="py-2 border-b border-line flex items-center gap-4"><dt className="w-16 shrink-0 text-dim">계좌</dt><dd className="m-0 flex-1 min-w-0 flex"><AccountInfo inline /></dd></div>
                  <div className="py-2 border-b border-line flex items-center gap-4"><dt className="w-16 shrink-0 text-dim">팝콘</dt><dd className="m-0 flex-1 flex items-center justify-between gap-3"><span className="font-bold">{myPopcorns.length}개</span>
                    <button type="button" onClick={() => {
                      setPopcornList([...myPopcorns, 'none']);
                      setIsAddPopcornMode(true);
                      setIsModalOpen(true);
                    }} className="shrink-0 h-8 px-3 border border-line-strong hover:border-line-bold text-ink text-xs font-bold transition-colors flex items-center gap-1"><Popcorn className="w-3.5 h-3.5" /> 더 고르기</button>
                  </dd></div>
                </dl>
              </div>
            </>
          ) : (
            <>
              {myPopcorns.length > 0 && (
                <p className="text-sub text-sm flex items-center gap-1.5"><Popcorn className="w-4 h-4" /> 팝콘 {myPopcorns.length}개 주문됨</p>
              )}
              {cancelLocked && <p className="text-dim text-xs">팝콘 결제가 완료된 예매는 취소할 수 없습니다.</p>}
              {myPopcorns.length === 0 && (
                <button type="button" onClick={() => {
                  setPopcornList(['none']);
                  setIsAddPopcornMode(true);
                  setIsModalOpen(true);
                }} className="w-full md:w-auto md:self-start h-11 px-5 border border-line-strong hover:border-line-bold text-ink font-bold transition-colors text-sm flex items-center justify-center gap-1.5"><Popcorn className="w-4 h-4" /> 팝콘 추가 (결제 필요)</button>
              )}
            </>
          )}
        </section>
      ) : null}

      <BookingBar {...bookingBar} />
      </>
      )}

      </main>

      <footer className="border-t border-line">
        <div className="max-w-[1120px] mx-auto px-4 md:px-10 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-dim">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="영화대교" className="w-[68px] md:w-[88px] h-auto block opacity-80" />
          <div className="flex items-center gap-2.5 flex-wrap">
            <a href="/privacy" className="hover:text-sub transition-colors">개인정보처리방침</a>
            <span className="opacity-40">·</span>
            <span>© 2026 영화대교</span>
          </div>
        </div>
      </footer>

      {topDialog === 'popcorn' && (
        <div className={`${OVERLAY} z-50 overflow-y-auto`}>
          <div className={`${BOX} p-6 w-full max-w-md my-8`}>
            <h2 className="text-2xl font-black text-ink mb-6 flex items-center gap-2">{isAddPopcornMode ? <><Popcorn className="w-5 h-5" /> 팝콘 추가</> : '예매 정보 입력'}</h2>
            <div className="space-y-4 text-left">
              {!isAddPopcornMode && (
                <div className="bg-raised p-4 border border-line">
                  <p className="text-dim text-xs mb-1">예매자 (구글 계정으로 확인됨)</p>
                  <p className="text-ink font-bold text-lg">{profile?.name} <span className="text-sub font-normal text-sm">{profile?.student_id ?? '교직원'}</span></p>
                  <p className="text-dim text-xs mt-1">{profile?.email}</p>
                </div>
              )}

              <div className="bg-raised p-4 border border-line">
                <label className="flex items-center gap-1.5 text-ink mb-3 text-sm font-bold"><Popcorn className="w-4 h-4" /> 팝콘 <span className="font-normal text-dim">· 고르면 입금이 필요해요</span></label>

                <div className="flex flex-col border-t border-line">
                  {POPCORN_FLAVORS.map(({ key, label }) => {
                    const count = popcornList.filter(p => p === key).length;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 min-h-[52px] border-b border-line">
                        <span className="text-sm text-ink">{label}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => changePopcornCount(key, -1)} disabled={count === 0} aria-label={`${label} 하나 빼기`} className="w-9 h-9 flex items-center justify-center border border-line-strong text-ink disabled:text-mute disabled:border-line"><Minus className="w-4 h-4" /></button>
                          <span className="w-8 text-center text-base font-bold tabular-nums" aria-live="polite">{count}</span>
                          <button type="button" onClick={() => changePopcornCount(key, 1)} aria-label={`${label} 하나 더`} className="w-9 h-9 flex items-center justify-center border border-line-strong text-ink"><Plus className="w-4 h-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-dim mt-3">팝콘은 하나에 2,500원이고, 음료는 없어요.</p>

                {(popcornList.filter(p => p !== 'none').length * 2500) > 0 && (
                  <div className="mt-4 pt-3 border-t border-ink flex justify-between items-center">
                    <span className="text-ink font-bold">총 결제 예정 금액</span>
                    <span className="text-xl font-black text-ink">{(popcornList.filter(p => p !== 'none').length * 2500).toLocaleString()}원</span>
                  </div>
                )}
              </div>

            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => { setIsModalOpen(false); setIsAddPopcornMode(false); }} className={`${BTN_SECONDARY} text-sm`}>취소</button>
              {isAddPopcornMode ? (
                <button onClick={handleAddPopcornSubmit} className={`${BTN_PRIMARY} flex-1 text-sm`}>추가하기</button>
              ) : (
                <>
                  <button onClick={handleSubmit} className={`${BTN_PRIMARY} flex-1 text-sm`}>예매 확정하기</button>
                  <button onClick={handleGroupStart} className={`${BTN_SECONDARY} flex-1 text-sm`}>단체 예매하기</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {topDialog === 'payment' && (
        <div className={`${OVERLAY} z-[60]`}>
          <div className={`${BOX} p-8 max-w-sm w-full text-center`}>
            <h2 className="text-2xl font-black text-ink mb-2">결제 대기 중</h2>
            <p className="text-sub mb-6 text-sm">QR코드로 30분 내에 입금을 완료해주세요.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="bg-white p-4 mb-4 inline-block"><img src="/qr.jpeg" alt="QR" loading="lazy" decoding="async" className="w-48 h-48 object-contain" /></div>
            <div className="mb-6"><AccountInfo /></div>
            <dl className="border-t border-ink text-left text-sm mb-6">
              <div className="py-2.5 border-b border-line flex items-baseline gap-4"><dt className="w-16 shrink-0 text-dim">결제 금액</dt><dd className="font-black text-xl">{(popcornList.filter(p => p !== 'none').length * 2500).toLocaleString()}원</dd></div>
              <div className="py-2.5 border-b border-line flex gap-4"><dt className="w-16 shrink-0 text-dim">입금자명</dt><dd className="font-bold">{profile?.student_id ?? ''} {profile?.name}</dd></div>
            </dl>
            <button onClick={() => { setIsPaymentModalOpen(false); setSelectedSeat(null); }} className={`${BTN_PRIMARY} w-full text-sm`}>닫기</button>
          </div>
        </div>
      )}

      {/* 🌟 [신규] 단체 멤버 없이 완료 시 선택 모달 */}
      {topDialog === 'groupSolo' && groupLeader && (
        <div className={`${OVERLAY} z-50`}>
          <div className={`${BOX} p-8 w-full max-w-sm text-center`}>
            <CircleHelp className="w-10 h-10 text-sub mx-auto mb-4" />
            <h2 className="text-xl font-black text-ink mb-2">어떻게 하시겠습니까?</h2>
            <p className="text-sub text-sm mb-6">
              추가된 멤버가 없습니다.<br/>
              <span className="text-ink font-bold">{groupLeader.name}</span>님의 좌석({groupLeader.seat})만 혼자 예매하거나,<br/>
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
                className={`${BTN_PRIMARY} w-full flex items-center justify-center gap-2`}
              >
                <User className="w-5 h-5" /> 혼자 예매하기
              </button>
              <button
                onClick={() => setIsGroupSoloConfirmOpen(false)}
                className={`${BTN_SECONDARY} w-full flex items-center justify-center gap-2`}
              >
                <Users className="w-5 h-5" /> 계속 단체 추가하기
              </button>
              <button
                onClick={() => { setIsGroupSoloConfirmOpen(false); setIsGroupMode(false); setGroupLeader(null); setGroupMembers([]); setSelectedSeat(null); }}
                className="w-full py-3 text-accent hover:opacity-80 font-bold transition-opacity text-sm"
              >
                단체 예매 전체 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {topDialog === 'manual' && (
        <div className={`${OVERLAY} z-50`}>
          <div className={`${BOX} p-6 md:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
            <h2 className="text-2xl font-black text-ink mb-6 flex items-center gap-2"><BookOpen className="w-6 h-6" /> 영화대교 예매 가이드</h2>

            <div className="space-y-6 text-sub text-sm md:text-base">
              <div>
                <h3 className="font-bold text-ink text-lg mb-1">1. 좌석 선택 및 예매</h3>
                <p>배치도에서 원하는 좌석을 누른 후, 화면 하단의 <span className="text-ink font-bold">예매하기</span> 버튼을 클릭하면, 로그인된 구글 계정 정보로 바로 예약이 확정됩니다.</p>
                <div className="mt-3 bg-raised border border-line p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-dim shrink-0" />
                    <p className="text-sub leading-relaxed">
                      <span className="font-bold text-ink">학번/이름은 구글 계정 이름에서 자동으로 인식됩니다.</span><br/>
                      정보가 잘못 표시되면 동아리 관리자에게 문의해주세요.
                    </p>
                  </div>
                </div>

                {/* 🌟 [디자인 개선] 좌석 변경 안내 섹션 */}
                <div className="mt-3 bg-raised border border-line p-4 text-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full border border-line-strong flex items-center justify-center text-ink"><RefreshCw className="w-4 h-4" /></div>
                    <span className="font-bold text-ink text-base">좌석 변경 방법</span>
                  </div>
                  <p className="text-sub leading-relaxed ml-11">
                    예매되지 않은 빈 좌석을 선택하여 예매를 다시 진행하면, <span className="text-ink">기존 좌석은 자동으로 취소</span>되고 즉시 새로운 좌석으로 변경됩니다.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-ink text-lg mb-1">2. 모바일 티켓 (이메일 수신)</h3>
                <p>성공적으로 예매가 완료되면, 입력하신 인적 사항에 해당하는 <span className="text-ink font-bold">학교 이메일</span>로 모바일 티켓(예매 내역)이 즉시 발송됩니다.</p>
              </div>

              <div>
                <h3 className="font-bold text-ink text-lg mb-1">3. 좌석 범례 안내</h3>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-2 text-xs bg-raised p-2 border border-line">
                    <div className="w-5 h-6 bg-seat border border-line-bold rounded-t-md rounded-b-sm flex-shrink-0"></div>
                    <span className="text-sub">예매 가능</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-raised p-2 border border-line">
                    <div className="w-5 h-6 bg-seat border-2 border-ink rounded-t-md rounded-b-sm flex-shrink-0"></div>
                    <span className="text-sub">동아리 전용</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-raised p-2 border border-line">
                    <div className="w-5 h-6 bg-taken rounded-t-md rounded-b-sm flex-shrink-0"></div>
                    <span className="text-sub">예매 완료</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-raised p-2 border border-line">
                    <div className="w-5 h-6 bg-taken rounded-t-md rounded-b-sm flex-shrink-0" style={{ backgroundImage: 'repeating-linear-gradient(135deg, #2A2A2E 0 3px, #333338 3px 6px)' }}></div>
                    <span className="text-sub">팝콘 결제 대기</span>
                  </div>
                </div>
              </div>

              {/* 🌟 [신규 추가] 팝콘 선택 안내 */}
              <div>
                <h3 className="font-bold text-ink text-lg mb-1 flex items-center gap-1.5">4. 팝콘 선택 안내 <Popcorn className="w-4 h-4" /></h3>
                <p className="text-sub">예매 시 팝콘을 선택하면 현장에서 수령할 수 있습니다.</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-sub ml-2 leading-relaxed">
                  <li>팝콘 1개당 <span className="text-ink font-bold">2,500원</span> (현장 결제)</li>
                  <li>종류: 오리지널 버터, 콘소메맛, 카라멜맛</li>
                  <li>팝콘 선택 시 좌석은 <span className="text-ink font-bold">결제 대기(빗금 무늬)</span>로 표시</li>
                  <li>결제 확인 후 관리자가 <span className="text-ink font-bold">예매 확정</span>으로 변경</li>
                  <li>팝콘 없이 <span className="text-ink font-bold">무료로 예매 확정</span>된 이후에도 <span className="text-ink font-bold">팝콘 추가</span> 버튼으로 언제든 팝콘을 추가 주문할 수 있음 (추가 시 결제 대기로 전환)</li>
                </ul>
              </div>

              {/* 🌟 [신규 추가] 단체 예매 안내 */}
              <div>
                <h3 className="font-bold text-ink text-lg mb-1">5. 단체 예매 안내 (최대 10명)</h3>
                <p className="text-sub">리더는 본인을 포함해 <span className="text-ink font-bold">최대 10명</span>까지 한 번에 예매할 수 있습니다.</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-sub ml-2 leading-relaxed">
                  <li>리더가 멤버들의 좌석을 지정하여 예매</li>
                  <li>멤버들에게 즉시 <span className="text-ink">초대 이메일</span>이 발송됨</li>
                  <li>멤버는 <span className="text-ink font-bold underline underline-offset-4">1시간 이내</span>에 수락 및 확정 필수</li>
                  <li>미확정 시 해당 좌석은 자동으로 취소됨</li>
                </ul>
              </div>

            </div>

            <button onClick={() => setIsManualOpen(false)} className={`${BTN_PRIMARY} w-full mt-8`}>
              닫기
            </button>
          </div>
        </div>
      )}

      {topDialog === 'groupMember' && selectedSeat && (
        <div className={`${OVERLAY} z-50`}>
          <div className={`${BOX} p-6 w-full max-w-md`}>
            <h2 className="text-2xl font-black text-ink mb-2">단체 멤버 추가</h2>
            <p className="text-sub text-sm mb-6">좌석 <span className="text-ink font-bold">{selectedSeat}</span>에 앉을 사람을 검색하세요. <span className="text-ink">한 번이라도 로그인한 적이 있어야</span> 검색됩니다.</p>
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-sub mb-1 text-sm">이름 또는 학번으로 검색</label>
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={e => { setMemberSearchQuery(e.target.value); setSelectedMember(null); }}
                  className="w-full p-3 bg-ground text-ink border border-line-strong focus:border-ink outline-none transition-colors"
                  placeholder="예: 신민규 또는 2208"
                />
              </div>
              {memberSearchQuery.trim().length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {memberSearchResults.length === 0 && (
                    <p className="text-dim text-xs px-1">검색 결과가 없습니다. 아직 로그인한 적이 없는 사람일 수 있어요.</p>
                  )}
                  {memberSearchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setSelectedMember(r); setMemberSearchQuery(r.name); setMemberSearchResults([]); }}
                      className={`w-full text-left p-3 border transition-colors ${selectedMember?.id === r.id ? 'bg-raised border-ink' : 'bg-ground border-line hover:border-line-bold'}`}
                    >
                      <span className="text-ink font-bold">{r.name}</span>
                      {r.student_id && <span className="text-dim text-sm ml-2">{r.student_id}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => { setIsGroupMemberModal(false); setSelectedSeat(null); setMemberSearchQuery(''); setMemberSearchResults([]); setSelectedMember(null); }} className={`${BTN_SECONDARY} text-sm`}>취소</button>
              <button onClick={() => handleAddGroupMember(false)} disabled={!selectedMember} className={`${BTN_SECONDARY} flex-1 text-sm`}>계속하기</button>
              <button onClick={() => handleAddGroupMember(true)} disabled={!selectedMember} className={`${BTN_PRIMARY} flex-1 text-sm`}>완료하기</button>
            </div>
          </div>
        </div>
      )}

      {topDialog === 'groupSummary' && groupLeader && (
        <div className={`${OVERLAY} z-50 overflow-y-auto`}>
          <div className={`${BOX} p-6 md:p-8 w-full max-w-lg my-8`}>
            <h2 className="text-2xl font-black text-ink mb-6 flex items-center gap-2"><ClipboardList className="w-6 h-6" /> 단체 예매 최종 확인</h2>
            <div className="space-y-3 mb-6">
              <div className="bg-raised border border-line-strong p-4 flex items-center gap-3">
                <Crown className="w-5 h-5 text-ink shrink-0" />
                <div>
                  <p className="text-ink font-bold">{groupLeader.name} <span className="text-dim text-xs">(리더)</span></p>
                  <p className="text-sub text-sm">좌석: {groupLeader.seat} · {groupLeader.studentId ?? '교직원'}</p>
                </div>
              </div>
              {groupMembers.map((m, i) => (
                <div key={m.seat} className="border border-line p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-dim font-bold text-lg">{i + 1}</span>
                    <div>
                      <p className="text-ink font-bold">{m.name}</p>
                      <p className="text-sub text-sm">좌석: {m.seat} · {m.studentId ?? '교직원'}</p>
                    </div>
                  </div>
                  <button onClick={() => setGroupMembers(prev => prev.filter(member => member.seat !== m.seat))} className="w-8 h-8 flex items-center justify-center text-accent hover:opacity-80 transition-opacity" title="멤버 제거">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-raised border border-line p-4 mb-6">
              <p className="text-ink text-sm font-bold flex items-center gap-1.5"><Hourglass className="w-4 h-4" /> 1시간 안에 초대 이메일에 응답한 사람만 예매가 확정됩니다.</p>
              <p className="text-dim text-xs mt-1">미응답 시 해당 좌석은 자동으로 해제됩니다.</p>
            </div>
            <p className="text-sub text-sm text-center mb-6">단체의 모든 사람에게 초대 이메일을 발송하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setIsGroupSummaryOpen(false)} className={`${BTN_SECONDARY} flex-1`}>돌아가기</button>
              <button onClick={handleGroupFinalize} className={`${BTN_PRIMARY} flex-1`}>확정 및 이메일 발송</button>
            </div>
          </div>
        </div>
      )}

      {topDialog === 'groupSending' && (
        <div className={`${OVERLAY} z-[100]`}>
          <div className={`${BOX} p-8 w-full max-w-md text-center`}>
            <div className="mb-4 flex justify-center text-ink"><Mail className="w-12 h-12" /></div>
            <h3 className="text-xl font-black text-ink mb-4">초대 이메일 발송 중...</h3>
            <div className="w-full bg-raised h-2 mb-4 overflow-hidden">
              <div className="bg-ink h-2 transition-all duration-500" style={{ width: `${(groupSendingProgress.current / groupSendingProgress.total) * 100}%` }}></div>
            </div>
            <p className="text-ink font-bold">{groupSendingProgress.current} / {groupSendingProgress.total}명 완료</p>
            <p className="text-dim text-xs mt-2">창을 닫지 마세요. 이메일 발송이 완료될 때까지 기다려주세요.</p>
          </div>
        </div>
      )}

      {/* ===== 웹 자체 팝업 UI ===== */}

      {topDialog === 'alert' && alertInfo && (
        <div className={`${OVERLAY} z-[80]`}>
          <div className={`${BOX} p-6 w-full max-w-sm text-center`}>
            <div className="mb-4 flex justify-center text-sub">
               {alertInfo.isError ? <TriangleAlert className="w-10 h-10" /> : <Sparkles className="w-10 h-10" />}
            </div>
            <p className="text-ink text-lg font-bold mb-6 whitespace-pre-line leading-relaxed">{alertInfo.message}</p>
            <button onClick={() => setAlertInfo(null)} className={`${BTN_PRIMARY} w-full`}>확인</button>
          </div>
        </div>
      )}

      {topDialog === 'confirm' && confirmInfo && (
        <div className={`${OVERLAY} z-[90]`}>
          <div className={`${BOX} p-6 w-full max-w-sm text-center`}>
            <div className="mb-4 flex justify-center text-sub"><CircleHelp className="w-10 h-10" /></div>
            <p className="text-ink text-lg font-bold mb-6 whitespace-pre-line leading-relaxed">{confirmInfo.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmInfo(null)}
                className={`${BTN_SECONDARY} flex-1`}>취소</button>
              <button
                onClick={() => {
                  setConfirmInfo(null);
                  confirmInfo.onConfirm();
                }}
                className={confirmInfo.danger ? `${BTN_SECONDARY.replace('text-ink', 'text-accent')} flex-1` : `${BTN_PRIMARY} flex-1`}>확인</button>
            </div>
          </div>
        </div>
      )}

      {topDialog === 'success' && successInfo && (
        <div className={`${OVERLAY} z-[100]`}>
          <div className={`${BOX} p-8 w-full max-w-md text-center`}>
            <div className="mb-4 flex justify-center text-ink"><PartyPopper className="w-14 h-14" /></div>
            <h3 className="text-2xl font-black text-ink mb-2">{successInfo.title}</h3>
            <p className="text-sub text-base mb-8 whitespace-pre-line leading-relaxed">{successInfo.message}</p>
            <div className="flex flex-col gap-3">
              <a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer"
                 onClick={() => setSuccessInfo(null)}
                 className={`${BTN_PRIMARY} w-full text-lg flex items-center justify-center gap-2`}>
                <Ticket className="w-5 h-5" /> 티켓 확인하러 가기
              </a>
              <button onClick={() => setSuccessInfo(null)} className="w-full py-3 text-sub hover:text-ink font-bold transition-colors mt-2">그냥 닫기</button>
            </div>
          </div>
        </div>
      )}

      {topDialog === 'review' && reviewResume && profile && pendingReview && (
        <RequiredReviewModal
          movie={pendingReview}
          profile={profile}
          onClose={() => setReviewResume(null)}
          onDone={() => {
            const { next } = reviewResume;
            setReviewResume(null);
            setPendingReview(null);
            showAlert('후기가 등록되었습니다. 감사합니다!', false);
            next();
          }}
        />
      )}

      <PrivacyConsentGate profile={profile} onStatusChange={setConsentStatus} />

    </div>
  );
}