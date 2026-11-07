"use client";

import { useState, useEffect, useMemo, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ensureProfile, signInWithGoogle, signOutAndClear, authFetch, DomainNotAllowedError, type AppProfile } from '../../lib/supabase-auth';
import { extractSchoolEmails } from '../../lib/parseEmails';
import { blobToDataUri, readImageSize, lowResWarning } from '../../lib/posterUpload';
import AdminShell, { ADMIN_SECTIONS, type AdminSection } from './_components/AdminShell';
import { useToasts, ToastStack } from './_components/Toasts';
import { buildDerivedFields } from './_components/screeningSchedule';
import ReservationsTab from './_components/ReservationsTab';
import MovieTab from './_components/MovieTab';
import PromoMailSection from './_components/MailTab';
import MembersTab from './_components/MembersTab';
import HistoryTab from './_components/HistoryTab';

// 옛 탭 키(?tab=settings 등)로 들어와도 같은 메뉴를 연다.
// movie_settings 행 → 상영 폼. VIP 칸이 비어 있으면 기본 네모를 채운다(lib/seatGrid.ts와 같은 기본값).
const formFromMovie = (m: any) => ({
  ...m,
  age_rating: m.age_rating || '전체관람가',
  mid_vip_start_row: m.mid_vip_start_row || 'A',
  mid_vip_end_row: m.mid_vip_end_row || 'C',
  mid_vip_start_col: m.mid_vip_start_col || 5,
  mid_vip_end_col: m.mid_vip_end_col || 10,
  grand_vip_start_row: m.grand_vip_start_row || 'A',
  grand_vip_end_row: m.grand_vip_end_row || 'C',
  grand_vip_start_col: m.grand_vip_start_col || 10,
  grand_vip_end_col: m.grand_vip_end_col || 18,
  defective_seats: m.defective_seats ?? [],
  vip_enabled: m.vip_enabled ?? true,
});

// UPDATE_SETTINGS / START_NEW_MOVIE 공용 페이로드
const moviePayload = (f: any) => ({
  title: f.title, date_string: f.date_string, db_date: f.db_date,
  venue: f.venue, poster_url: f.poster_url, deadline_date: f.deadline_date, age_rating: f.age_rating,
  mid_vip_start_row: f.mid_vip_start_row, mid_vip_end_row: f.mid_vip_end_row,
  mid_vip_start_col: f.mid_vip_start_col, mid_vip_end_col: f.mid_vip_end_col,
  grand_vip_start_row: f.grand_vip_start_row, grand_vip_end_row: f.grand_vip_end_row,
  grand_vip_start_col: f.grand_vip_start_col, grand_vip_end_col: f.grand_vip_end_col,
  defective_seats: f.defective_seats ?? [],
  vip_enabled: f.vip_enabled ?? true,
});

const LEGACY_TAB: Record<string, AdminSection> = { settings: 'movie', members: 'people', history: 'log' };
const parseSection = (raw: string | null): AdminSection => {
  const key = raw ? (LEGACY_TAB[raw] ?? raw) : 'reservations';
  return ADMIN_SECTIONS.some((s) => s.key === key) ? (key as AdminSection) : 'reservations';
};

// useSearchParams는 정적 빌드에서 Suspense 경계가 있어야 한다(Next 16 문서).
export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ground" />}>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseSection(searchParams.get('tab'));
  const setActiveTab = (s: AdminSection) => router.replace(`/admin?tab=${s}`, { scroll: false });
  const { toasts, notify, undoable } = useToasts();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [movieInfo, setMovieInfo] = useState<any>(null);
  const [isLoadingUI, setIsLoadingUI] = useState(true); // 🌟 [추가됨] 로딩 상태 관리

  const [editForm, setEditForm] = useState<any>({});
  const [posterStatus, setPosterStatus] = useState<string | null>(null);
  const movieBaseline = useMemo(() => (movieInfo ? formFromMovie(movieInfo) : null), [movieInfo]);

  const [isStartingNewMovie, setIsStartingNewMovie] = useState(false);
  const [newMovieForm, setNewMovieForm] = useState<any>({});
  // 새 회차 포스터 파일은 회차 id가 생긴 뒤(START_NEW_MOVIE 성공 후) 올린다.
  const [newPosterFile, setNewPosterFile] = useState<File | null>(null);
  const [newPosterStatus, setNewPosterStatus] = useState<string | null>(null);

  const [movieHistory, setMovieHistory] = useState<any[]>([]);
  const [selectedHistoryMovie, setSelectedHistoryMovie] = useState<any>(null);
  const [historyReservations, setHistoryReservations] = useState<any[]>([]);
  const [historyReviews, setHistoryReviews] = useState<any[]>([]);

  const [logs, setLogs] = useState<any[]>([]);
  // 예약 id → 되돌리기 알림 id. 알림이 살아 있는 동안 그 줄은 "취소했어요 · 되돌리기"로 보인다.
  const [cancelToastIds, setCancelToastIds] = useState<Record<string, string>>({});

  const [blacklist, setBlacklist] = useState<{email: string, created_at: string}[]>([]);
  const [newBlacklistText, setNewBlacklistText] = useState('');

  const [admins, setAdmins] = useState<{email: string, added_by: string | null, created_at: string}[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [clubMembers, setClubMembers] = useState<{email: string, added_by: string | null, created_at: string}[]>([]);
  const [newClubMembersText, setNewClubMembersText] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<{email: string, added_by: string | null, source: string, created_at: string}[]>([]);
  const [newInvitedText, setNewInvitedText] = useState('');
  const [nameByEmail, setNameByEmail] = useState<Record<string, string>>({});
  const [loginProfiles, setLoginProfiles] = useState<{email: string, name: string, student_id: string | null, role: string, created_at: string}[]>([]);
  const [kioskPasswordInput, setKioskPasswordInput] = useState('');
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [profileSearchResults, setProfileSearchResults] = useState<{id: string, email: string, student_id: string | null, name: string, role: string}[]>([]);
  const [editingProfile, setEditingProfile] = useState<{id: string, email: string, student_id: string, name: string, role: string} | null>(null);

  // 상영작 홍보 메일
  const [promoSources, setPromoSources] = useState({ club: true, invited: false, g1: false, g2: false, g3: false });
  const [promoManualText, setPromoManualText] = useState('');
  const [isResolvingPromo, setIsResolvingPromo] = useState(false);
  const [isSendingPromo, setIsSendingPromo] = useState(false);
  const [promoProgress, setPromoProgress] = useState({ current: 0, total: 0 });
  const [promoRecipients, setPromoRecipients] = useState<{ email: string; name: string | null }[]>([]);
  const [showPromoConfirm, setShowPromoConfirm] = useState(false);

  // 🌟 (신규) 팝콘 통계 계산을 위한 함수
  const popcornStats = useMemo(() => {
    let original = 0; let consomme = 0; let caramel = 0; let none = 0; let cash = 0;
    reservations.filter(r => r.payment_status === 'confirmed').forEach(r => {
      if (!r.popcorn_order || r.popcorn_order === 'none') { none++; return; }
      r.popcorn_order.split(',').forEach((p: string) => {
        if (p === 'original') original++;
        else if (p === 'consomme') consomme++;
        else if (p === 'caramel') caramel++;
        cash += 2500;
      });
    });
    return { original, consomme, caramel, none, cash };
  }, [reservations]);

  const clubEmailPreviewCount = useMemo(() => extractSchoolEmails(newClubMembersText).length, [newClubMembersText]);
  const invitedEmailPreviewCount = useMemo(() => extractSchoolEmails(newInvitedText).length, [newInvitedText]);
  const blacklistEmailPreviewCount = useMemo(() => extractSchoolEmails(newBlacklistText).length, [newBlacklistText]);
  const promoManualPreviewCount = useMemo(() => extractSchoolEmails(promoManualText).length, [promoManualText]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const p = await ensureProfile();
        if (active) setProfile(p);
      } catch (err) {
        if (err instanceof DomainNotAllowedError) notify('학교(@ts.hs.kr) 구글 계정으로만 로그인할 수 있습니다.', 'error');
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (profile) checkAdminAndLoad();
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkAdminAndLoad = async () => {
    setCheckingAdmin(true);
    const ok = await fetchAdminData();
    setIsAdmin(ok);
    setCheckingAdmin(false);
  };

  // resetForm: 상영 폼을 서버 값으로 덮는다. 다른 동작 뒤 다시 불러올 때는 저장 안 한 상영 수정을 지키려고 덮지 않는다.
  const fetchAdminData = async ({ resetForm = false }: { resetForm?: boolean } = {}): Promise<boolean> => {
    setIsLoadingUI(true);
    try {
      const res = await authFetch('/api/admin/action', { action: 'FETCH_INITIAL_DATA' });
      const { data, success, error } = await res.json();

      if (!success) {
        if (res.status === 401 || res.status === 403) return false;
        notify(`데이터 불러오기 실패: ${error}`, 'error');
        console.error("데이터 로드 실패:", error);
        return true;
      }

      const { movieData, resData, blData, logData, adminData, clubData, kioskPassword, invitedData, profileNames } = data;
      if (movieData) {
        setMovieInfo(movieData);
        setEditForm((prev: any) => (resetForm || prev.id !== movieData.id ? formFromMovie(movieData) : prev));
      }
      if (resData) setReservations(resData);
      if (blData) setBlacklist(blData);
      if (logData) setLogs(logData);
      if (adminData) setAdmins(adminData);
      if (clubData) setClubMembers(clubData);
      if (invitedData) setInvitedEmails(invitedData);
      if (profileNames) {
        setLoginProfiles(profileNames);
        setNameByEmail(Object.fromEntries(
          (profileNames as { email: string; name: string }[])
            .filter(p => p.name)
            .map(p => [p.email.toLowerCase(), p.name])
        ));
      }
      if (typeof kioskPassword === 'string') setKioskPasswordInput(kioskPassword);
      return true;
    } catch (err) {
      console.error("데이터 불러오기 오류:", err);
      return true;
    } finally {
      setIsLoadingUI(false);
    }
  };

  // 포스터 파일 → Cloudinary(poster_cdn_url). 서버가 못 받는 주소(나무위키·movist)는 이 길이 해법이다.
  const uploadPosterFile = async (file: File, movieId: number): Promise<{ url: string | null; warning: string | null; error?: string }> => {
    const { width, height } = await readImageSize(file).catch(() => ({ width: 0, height: 0 }));
    const res = await authFetch('/api/admin/action', {
      action: 'UPLOAD_POSTER_CDN',
      payload: { movieId, imageBase64: await blobToDataUri(file) },
    });
    const data = await res.json();
    const warning = width > 0 ? lowResWarning(width, height) : null;
    return data.success ? { url: data.url, warning } : { url: null, warning, error: data.error };
  };

  const handlePosterFile = async (file: File) => {
    if (!editForm.id) { notify('영화 정보를 먼저 불러와야 합니다.', 'error'); return; }
    setPosterStatus('올리는 중');
    try {
      const r = await uploadPosterFile(file, editForm.id);
      if (!r.url) { setPosterStatus(null); notify(`포스터 올리기 실패: ${r.error}`, 'error'); return; }
      setEditForm((prev: any) => ({ ...prev, poster_cdn_url: r.url }));
      setMovieInfo((prev: any) => ({ ...prev, poster_cdn_url: r.url }));
      setPosterStatus(r.warning ?? '포스터를 바꿨어요.');
    } catch (err: any) {
      setPosterStatus(null);
      notify(`포스터 올리기 실패: ${err?.message ?? '알 수 없는 오류'}`, 'error');
    }
  };

  const handleNewPosterFile = async (file: File) => {
    const { width, height } = await readImageSize(file).catch(() => ({ width: 0, height: 0 }));
    setNewPosterFile(file);
    setNewMovieForm((prev: any) => ({ ...prev, poster_url: '', poster_cdn_url: URL.createObjectURL(file) }));
    setNewPosterStatus((width > 0 ? lowResWarning(width, height) : null) ?? '새 회차를 시작할 때 올려요.');
  };

  // 검증은 MovieTab이 한다(오류·경고는 저장 바 안 문구).
  const handleSaveSettingsClick = async (): Promise<boolean> => {
    const res = await authFetch('/api/admin/action', { action: 'UPDATE_SETTINGS', payload: moviePayload(editForm) });
    const data = await res.json();
    if (!data.success) {
      notify("설정 저장 실패: " + data.error, 'error');
      return false;
    }
    notify("저장했어요");
    await fetchAdminData({ resetForm: true });
    return true;
  };

  const handleStartNewMovieClick = () => {
    setNewMovieForm({
      ...formFromMovie(movieInfo ?? {}),
      title: '', poster_url: '', poster_cdn_url: null, vip_enabled: true,
      ...buildDerivedFields({ start: '', end: '', deadline: '' }),
    });
    setNewPosterFile(null);
    setNewPosterStatus(null);
    setIsStartingNewMovie(true);
  };

  const handleSubmitNewMovie = async (): Promise<boolean> => {
    const res = await authFetch('/api/admin/action', { action: 'START_NEW_MOVIE', payload: moviePayload(newMovieForm) });
    const data = await res.json();
    if (!data.success) {
      notify("새 회차 시작 실패: " + data.error, 'error');
      return false;
    }
    // 파일을 고른 뒤 주소를 다시 넣었으면(poster_cdn_url이 비워짐) 파일은 버린다.
    if (newPosterFile && newMovieForm.poster_cdn_url && data.data?.id) {
      const r = await uploadPosterFile(newPosterFile, data.data.id).catch((err) => ({ url: null, warning: null, error: err?.message }));
      if (!r.url) notify(`새 회차는 시작했지만 포스터를 올리지 못했어요. 상영 메뉴에서 다시 올려 주세요. (${r.error})`, 'error');
    }
    setIsStartingNewMovie(false);
    setNewPosterFile(null);
    await fetchAdminData({ resetForm: true });
    notify(`새 회차「${newMovieForm.title}」를 시작했어요`);
    return true;
  };

  const loadMovieHistory = async () => {
    const res = await authFetch('/api/admin/action', { action: 'LIST_MOVIE_HISTORY' });
    const data = await res.json();
    if (!data.success) return notify("회차 이력 조회 실패: " + data.error, 'error');
    setMovieHistory(data.data);
  };

  const handleSelectHistoryMovie = async (movie: any) => {
    const res = await authFetch('/api/admin/action', { action: 'FETCH_HISTORY_RESERVATIONS', payload: { movieSettingsId: movie.id } });
    const data = await res.json();
    if (!data.success) return notify("예매 내역 조회 실패: " + data.error, 'error');
    setSelectedHistoryMovie(movie);
    setHistoryReservations(data.data);

    const reviewRes = await authFetch('/api/admin/action', { action: 'FETCH_HISTORY_REVIEWS', payload: { movieSettingsId: movie.id } });
    const reviewData = await reviewRes.json();
    if (reviewData.success) setHistoryReviews(reviewData.data);
  };

  const handleDeleteReview = async (review: any) => {
    if (!confirm(`${review.user_name ?? review.profiles?.email ?? '작성자'}님의 후기를 삭제하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'DELETE_REVIEW', payload: { id: review.id } });
    const data = await res.json();
    if (!data.success) return notify("후기 삭제 실패: " + data.error, 'error');
    setHistoryReviews(prev => prev.filter(r => r.id !== review.id));
  };

  const handleApprove = async (ticket: any) => {
    const res = await authFetch('/api/admin/action', {
      action: 'APPROVE_RESERVATION',
      payload: { id: ticket.id, studentId: ticket.student_id, studentName: ticket.student_name, seatNumber: ticket.seat_number }
    });

    const data = await res.json();
    if (!data.success) return notify("승인 실패: " + data.error, 'error');

    // 확정 메일은 /api/admin/action이 승인 직후 서버에서 보낸다.
    setReservations(prev => prev.map(r => r.id === ticket.id ? { ...r, payment_status: 'confirmed' } : r));
    fetchAdminData();
    if (data.mailSent) notify(`${ticket.seat_number} ${ticket.student_name} 예매를 승인했어요. 확정 메일을 보냈어요.`);
    else notify(`${ticket.seat_number} ${ticket.student_name} 예매를 승인했어요. 확정 메일은 보내지 못했어요.`, 'error');
  };

  // 취소는 5초 되돌리기: 그동안 줄이 "취소했어요 · 되돌리기"로 바뀌고, 시간이 지나야 실제 취소(와 메일)가 나간다.
  const handleCancel = (ticket: any) => {
    const label = `${ticket.seat_number} ${ticket.student_name}`;
    const handle = undoable(`${label} 예매를 취소했어요`, async () => {
      setReservations(prev => prev.filter(r => r.id !== ticket.id));
      const res = await authFetch('/api/admin/action', {
        action: 'CANCEL_RESERVATION',
        payload: { id: ticket.id, studentId: ticket.student_id, studentName: ticket.student_name, seatNumber: ticket.seat_number }
      });
      const data = await res.json();
      fetchAdminData();
      if (!data.success) throw new Error(`${label} 취소 실패: ${data.error}`);
      // 취소 메일은 /api/admin/action이 취소 직후 서버에서 보낸다.
      if (!data.mailSent) notify(`${label} 취소 메일은 보내지 못했어요.`, 'error');
    });
    setCancelToastIds(prev => ({ ...prev, [ticket.id]: handle.id }));
  };

  const handleResetPrint = async (ticket: any) => {
    const res = await authFetch('/api/admin/action', {
      action: 'RESET_PRINT',
      payload: { id: ticket.id, studentId: ticket.student_id, studentName: ticket.student_name, seatNumber: ticket.seat_number }
    });

    const data = await res.json();
    if (!data.success) {
      notify("발권 되돌리기 실패: " + data.error, 'error');
      return;
    }

    setReservations(prev => prev.map(r => r.id === ticket.id ? { ...r, is_printed: false } : r));
    fetchAdminData();
    notify(`${ticket.seat_number} ${ticket.student_name} 발권을 되돌렸어요. 발권기에서 다시 뽑을 수 있어요.`);
  };

  const handleAddBlacklistBulk = async () => {
    const emails = extractSchoolEmails(newBlacklistText);
    if (emails.length === 0) return notify("추가할 @ts.hs.kr 이메일이 없습니다.", 'error');
    if (!confirm(`${emails.length}명을 블랙리스트에 추가하시겠습니까?\n(주의: 현재 진행 중이거나 완료된 예매 내역이 있다면 자동으로 취소됩니다.)`)) return;

    const res = await authFetch('/api/admin/action', { action: 'ADD_BLACKLIST_BULK', payload: { emails, movieDate: movieInfo.db_date } });
    const data = await res.json();
    if (!data.success) return notify("추가 실패: " + (data.error || ''), 'error');

    // 예매 취소 메일과 블랙리스트 안내 메일은 /api/admin/action이 서버에서 보낸다.
    setNewBlacklistText('');
    fetchAdminData();
    notify(`${emails.length}명 블랙리스트 추가 및 예매 자동 취소 처리가 완료되었습니다!`);
  };

  const handleRemoveBlacklist = async (email: string) => {
    if (!confirm(`${email} 블랙리스트를 해제하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_BLACKLIST', payload: { email } });
    const data = await res.json();
    if (!data.success) return notify("해제 실패", 'error');
    fetchAdminData();
    notify("해제 완료 및 안내 메일 발송!");
  };

  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email.endsWith('@ts.hs.kr')) return notify("@ts.hs.kr 이메일만 등록할 수 있습니다.", 'error');
    const res = await authFetch('/api/admin/action', { action: 'ADD_ADMIN', payload: { email } });
    const data = await res.json();
    if (!data.success) return notify("추가 실패: " + data.error, 'error');
    setAdmins(prev => [{ email, added_by: profile!.email, created_at: new Date().toISOString() }, ...prev]);
    setNewAdminEmail('');
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === profile!.email) return notify("본인 계정은 스스로 제거할 수 없습니다.", 'error');
    if (!confirm(`${email}의 관리자 권한을 제거하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_ADMIN', payload: { email } });
    const data = await res.json();
    if (!data.success) return notify("제거 실패: " + data.error, 'error');
    setAdmins(prev => prev.filter(a => a.email !== email));
  };

  const handleAddClubMembers = async () => {
    const emails = extractSchoolEmails(newClubMembersText);
    if (emails.length === 0) return notify("추가할 @ts.hs.kr 이메일이 없습니다.", 'error');
    const res = await authFetch('/api/admin/action', { action: 'ADD_CLUB_MEMBERS', payload: { emails } });
    const data = await res.json();
    if (!data.success) return notify("추가 실패: " + data.error, 'error');
    setNewClubMembersText('');
    fetchAdminData();
    notify(`${emails.length}명 동아리원(VIP)으로 추가되었습니다.`);
  };

  const handleRemoveClubMember = async (email: string) => {
    if (!confirm(`${email} 학생을 동아리원(VIP)에서 제거하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_CLUB_MEMBER', payload: { email } });
    const data = await res.json();
    if (!data.success) return notify("제거 실패: " + data.error, 'error');
    fetchAdminData();
  };

  const handleAddInvitedEmails = async () => {
    const emails = extractSchoolEmails(newInvitedText);
    if (emails.length === 0) return notify("추가할 @ts.hs.kr 이메일이 없습니다.", 'error');
    const res = await authFetch('/api/admin/action', { action: 'ADD_INVITED_EMAILS', payload: { emails } });
    const data = await res.json();
    if (!data.success) return notify("추가 실패: " + data.error, 'error');
    setNewInvitedText('');
    fetchAdminData();
    notify(`${emails.length}명이 초대 명단에 추가되었습니다.`);
  };

  const handleRemoveInvitedEmail = async (email: string) => {
    if (!confirm(`${email}을(를) 초대 명단에서 제거하시겠습니까?\n(이미 한 예매는 유지되고, 새 예매만 막힙니다.)`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_INVITED_EMAIL', payload: { email } });
    const data = await res.json();
    if (!data.success) return notify("제거 실패: " + data.error, 'error');
    fetchAdminData();
  };

  const handleUpdateKioskPassword = async (): Promise<boolean> => {
    if (!kioskPasswordInput.trim()) { notify("발권기 비밀번호를 입력해 주세요.", 'error'); return false; }
    const res = await authFetch('/api/admin/action', { action: 'UPDATE_KIOSK_PASSWORD', payload: { password: kioskPasswordInput.trim() } });
    const data = await res.json();
    if (!data.success) { notify("변경 실패: " + data.error, 'error'); return false; }
    notify("발권기 비밀번호를 바꿨어요.");
    return true;
  };

  const handleSearchProfile = async () => {
    const res = await authFetch('/api/admin/action', { action: 'SEARCH_PROFILE', payload: { query: profileSearchQuery } });
    const data = await res.json();
    if (data.success) setProfileSearchResults(data.data);
  };

  const handleSaveProfile = async () => {
    if (!editingProfile) return;
    if (editingProfile.role === 'student' && !/^\d{4}$/.test(editingProfile.student_id)) {
      return notify("학생은 학번 4자리가 필요합니다.", 'error');
    }
    const res = await authFetch('/api/admin/action', {
      action: 'UPDATE_PROFILE',
      payload: { id: editingProfile.id, studentId: editingProfile.student_id, name: editingProfile.name, role: editingProfile.role }
    });
    const data = await res.json();
    if (!data.success) return notify("저장 실패: " + data.error, 'error');
    notify("저장되었습니다.");
    setEditingProfile(null);
    setProfileSearchResults([]);
    setProfileSearchQuery('');
  };

  const handleResolvePromoClick = async () => {
    const grades = (['g1', 'g2', 'g3'] as const).filter((g) => promoSources[g]);
    const hasTarget =
      promoSources.club || promoSources.invited || grades.length > 0 || promoManualPreviewCount > 0;
    if (!hasTarget) return notify('발송 대상을 하나 이상 선택하세요.', 'error');
    if (!movieInfo?.title) return notify('현재 상영작 정보가 없습니다. 회차 설정을 먼저 저장하세요.', 'error');

    setIsResolvingPromo(true);
    try {
      const res = await authFetch('/api/admin/action', {
        action: 'RESOLVE_PROMO_RECIPIENTS',
        payload: {
          club: promoSources.club,
          invited: promoSources.invited,
          grades,
          manualText: promoManualText,
        },
      });
      const data = await res.json();
      if (!data.success) return notify('명단 조회 실패: ' + data.error, 'error');
      if (data.data.count === 0) return notify('발송 대상이 없습니다. (블랙리스트 제외 후 0명)', 'error');
      setPromoRecipients(data.data.recipients);
      setShowPromoConfirm(true);
    } catch (err) {
      console.error(err);
      notify('명단 조회 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsResolvingPromo(false);
    }
  };

  const executeSendPromo = async () => {
    setShowPromoConfirm(false);
    setIsSendingPromo(true);
    const recipients = promoRecipients;
    setPromoProgress({ current: 0, total: recipients.length });

    const movieInfoPayload = {
      title: movieInfo.title,
      venue: movieInfo.venue,
      date_string: movieInfo.date_string,
      age_rating: movieInfo.age_rating,
      poster_url: movieInfo.poster_cdn_url || movieInfo.poster_url,
      deadline_date: movieInfo.deadline_date,
    };

    const CHUNK_SIZE = 15;
    let sent = 0;
    let failed = 0;
    let invited = 0;
    let inviteFailed = 0;
    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      let delivered: string[] = [];
      try {
        const r = await authFetch('/api/promo', { chunk, movieInfo: movieInfoPayload });
        const d = await r.json();
        if (d.success) {
          sent += d.sent;
          failed += d.failed;
          const failedSet = new Set<string>((d.failedEmails ?? []).map((e: string) => e.toLowerCase()));
          delivered = chunk.map((c) => c.email).filter((e) => !failedSet.has(e.toLowerCase()));
        } else {
          failed += chunk.length;
        }
      } catch (err) {
        console.error(err);
        failed += chunk.length;
      }

      // 메일 발송과는 별도 단계: 발송에 성공한 수신자만 초대 명단에 추가한다. 여기서 실패해도 메일 결과에는 영향 없다.
      if (delivered.length > 0) {
        try {
          const res = await authFetch('/api/admin/action', { action: 'ADD_INVITED_EMAILS', payload: { emails: delivered, source: 'promo_mail' } });
          const addData = await res.json();
          if (addData.success) invited += delivered.length;
          else inviteFailed += delivered.length;
        } catch (err) {
          console.error(err);
          inviteFailed += delivered.length;
        }
      }
      setPromoProgress({ current: Math.min(i + CHUNK_SIZE, recipients.length), total: recipients.length });
      await new Promise((res) => setTimeout(res, 1000));
    }

    try {
      await authFetch('/api/admin/action', { action: 'LOG_PROMO_SENT', payload: { count: sent } });
    } catch (err) {
      console.error(err);
    }

    setIsSendingPromo(false);
    notify(`홍보 메일을 보냈어요. 성공 ${sent}명 / 실패 ${failed}명, 초대 명단 추가 ${invited}명`, failed > 0 ? 'error' : 'info');
    if (inviteFailed > 0) notify(`초대 명단 추가 실패 ${inviteFailed}명. 사람 메뉴에서 직접 넣어 주세요.`, 'error');
    fetchAdminData();
  };

  const cancelUndoToast = (reservationId: string) => {
    const toastId = cancelToastIds[reservationId];
    return toastId ? toasts.find(t => t.id === toastId && t.undo) : undefined;
  };
  const pendingCancelIds = new Set(Object.keys(cancelToastIds).filter(id => cancelUndoToast(id)));

  const signOut = () => signOutAndClear().then(() => window.location.reload());

  const gate = (body: ReactNode) => (
    <div className="min-h-screen bg-ground text-ink flex items-center justify-center p-4">
      <div className="w-full max-w-xs flex flex-col items-center gap-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-horizontal-dark.svg" alt="영화대교" className="w-[160px] h-auto" />
        {body}
      </div>
      <ToastStack toasts={toasts} />
    </div>
  );

  if (authLoading) return gate(<p className="text-sm text-dim">로그인 확인 중</p>);

  if (!profile) return gate(
    <>
      <p className="text-sm text-sub">학교(@ts.hs.kr) 구글 계정으로 로그인해 주세요.</p>
      <button
        type="button"
        onClick={() => signInWithGoogle().catch(() => notify('로그인에 실패했습니다.', 'error'))}
        className="w-full h-12 bg-ink text-ground text-[15px] font-bold"
      >
        구글로 로그인
      </button>
    </>
  );

  if (checkingAdmin) return gate(<p className="text-sm text-dim">권한 확인 중</p>);

  if (!isAdmin) return gate(
    <>
      <p className="text-sm text-sub break-keep">{profile.email} 계정은 관리자로 등록되어 있지 않아요.</p>
      <button type="button" onClick={signOut} className="h-11 px-5 border border-line-strong text-ink text-sm font-bold">
        로그아웃
      </button>
    </>
  );

  return (
    <AdminShell
      active={activeTab}
      onChange={setActiveTab}
      pendingCount={reservations.filter(r => r.payment_status === 'pending').length}
      email={profile.email}
      onSignOut={signOut}
    >
      {isLoadingUI && !movieInfo && (
        <p className="text-sm text-dim">불러오는 중</p>
      )}

      {activeTab === 'reservations' && (
        <ReservationsTab
          reservations={reservations}
          popcornStats={popcornStats}
          clubMembers={clubMembers}
          nameByEmail={nameByEmail}
          movieTitle={movieInfo?.title}
          deadline={movieInfo?.deadline_date}
          onApprove={handleApprove}
          onCancel={handleCancel}
          onResetPrint={handleResetPrint}
          pendingCancelIds={pendingCancelIds}
          cancelSecondsLeft={(id) => cancelUndoToast(id)?.undo?.secondsLeft ?? 5}
          onUndoCancel={(id) => cancelUndoToast(id)?.undo?.onUndo()}
        />
      )}

      {activeTab === 'movie' && (
        <MovieTab
          movieInfo={movieInfo}
          baseline={movieBaseline}
          editForm={editForm}
          setEditForm={setEditForm}
          onResetForm={() => { if (movieInfo) setEditForm(formFromMovie(movieInfo)); }}
          onSave={handleSaveSettingsClick}
          posterStatus={posterStatus}
          onPosterFile={handlePosterFile}
          isStartingNewMovie={isStartingNewMovie}
          onOpenNewMovie={handleStartNewMovieClick}
          onCloseNewMovie={() => setIsStartingNewMovie(false)}
          newMovieForm={newMovieForm}
          setNewMovieForm={setNewMovieForm}
          newPosterStatus={newPosterStatus}
          onNewPosterFile={handleNewPosterFile}
          onSubmitNewMovie={handleSubmitNewMovie}
          kioskPassword={kioskPasswordInput}
          setKioskPassword={setKioskPasswordInput}
          onUpdateKioskPassword={handleUpdateKioskPassword}
        />
      )}

      {activeTab === 'mail' && (
        <PromoMailSection
          movieTitle={movieInfo?.title}
          promo={{
            sources: promoSources,
            setSources: setPromoSources,
            manualText: promoManualText,
            setManualText: setPromoManualText,
            manualPreviewCount: promoManualPreviewCount,
            isResolving: isResolvingPromo,
            isSending: isSendingPromo,
            progress: promoProgress,
            recipients: promoRecipients,
            showConfirm: showPromoConfirm,
            onResolveClick: handleResolvePromoClick,
            onConfirmSend: executeSendPromo,
            onRemoveRecipient: (email: string) => setPromoRecipients((prev) => prev.filter((r) => r.email !== email)),
            onCancelConfirm: () => setShowPromoConfirm(false),
          }}
        />
      )}

      {activeTab === 'people' && (
        <MembersTab
          admins={admins}
          newAdminEmail={newAdminEmail}
          setNewAdminEmail={setNewAdminEmail}
          onAddAdmin={handleAddAdmin}
          onRemoveAdmin={handleRemoveAdmin}
          clubMembers={clubMembers}
          newClubMembersText={newClubMembersText}
          setNewClubMembersText={setNewClubMembersText}
          clubEmailPreviewCount={clubEmailPreviewCount}
          onAddClubMembers={handleAddClubMembers}
          onRemoveClubMember={handleRemoveClubMember}
          nameByEmail={nameByEmail}
          invitedEmails={invitedEmails}
          loginProfiles={loginProfiles}
          newInvitedText={newInvitedText}
          setNewInvitedText={setNewInvitedText}
          invitedEmailPreviewCount={invitedEmailPreviewCount}
          onAddInvitedEmails={handleAddInvitedEmails}
          onRemoveInvitedEmail={handleRemoveInvitedEmail}
          profileSearchQuery={profileSearchQuery}
          setProfileSearchQuery={setProfileSearchQuery}
          onSearchProfile={handleSearchProfile}
          profileSearchResults={profileSearchResults}
          editingProfile={editingProfile}
          setEditingProfile={setEditingProfile}
          onSaveProfile={handleSaveProfile}
          blacklist={blacklist}
          newBlacklistText={newBlacklistText}
          setNewBlacklistText={setNewBlacklistText}
          blacklistEmailPreviewCount={blacklistEmailPreviewCount}
          onAddBlacklistBulk={handleAddBlacklistBulk}
          onRemoveBlacklist={handleRemoveBlacklist}
        />
      )}

      {activeTab === 'log' && (
        <HistoryTab
          onLoad={loadMovieHistory}
          movieHistory={movieHistory}
          selectedHistoryMovie={selectedHistoryMovie}
          onSelectHistoryMovie={handleSelectHistoryMovie}
          historyReservations={historyReservations}
          historyReviews={historyReviews}
          onDeleteReview={handleDeleteReview}
          logs={logs}
        />
      )}

      <ToastStack toasts={toasts} />
    </AdminShell>
  );
}
