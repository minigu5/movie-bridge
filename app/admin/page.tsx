"use client";

import { useState, useEffect, useMemo } from 'react';
import { ensureProfile, signInWithGoogle, signOutAndClear, authFetch, DomainNotAllowedError, type AppProfile } from '../../lib/supabase-auth';
import Link from 'next/link';
import { extractSchoolEmails } from '../../lib/parseEmails';
import { renderTicketBackground, renderTicketBackgroundFromFile, blobToDataUri, fetchPosterDataUri } from '../../lib/ticketBackgroundCanvas';
import AdminTabs, { type TabKey } from './_components/AdminTabs';
import ReservationsTab from './_components/ReservationsTab';
import SettingsTab from './_components/SettingsTab';
import MembersTab from './_components/MembersTab';
import HistoryTab from './_components/HistoryTab';
import { Ban, Lock, LogOut, Home, Printer, Crown, RefreshCw } from 'lucide-react';

export default function AdminPage() {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [movieInfo, setMovieInfo] = useState<any>(null);
  const [isLoadingUI, setIsLoadingUI] = useState(true); // 🌟 [추가됨] 로딩 상태 관리
  const [activeTab, setActiveTab] = useState<TabKey>('reservations');

  const [editForm, setEditForm] = useState<any>({});
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgStatus, setBgStatus] = useState<string | null>(null);

  const [isStartingNewMovie, setIsStartingNewMovie] = useState(false);
  const [newMovieForm, setNewMovieForm] = useState<any>({});

  const [movieHistory, setMovieHistory] = useState<any[]>([]);
  const [selectedHistoryMovie, setSelectedHistoryMovie] = useState<any>(null);
  const [historyReservations, setHistoryReservations] = useState<any[]>([]);
  const [historyReviews, setHistoryReviews] = useState<any[]>([]);

  const [logs, setLogs] = useState<any[]>([]);

  const [blacklist, setBlacklist] = useState<{email: string, created_at: string}[]>([]);
  const [newBlacklistText, setNewBlacklistText] = useState('');

  const [admins, setAdmins] = useState<{email: string, added_by: string | null, created_at: string}[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [clubMembers, setClubMembers] = useState<{email: string, added_by: string | null, created_at: string}[]>([]);
  const [newClubMembersText, setNewClubMembersText] = useState('');
  const [kioskPasswordInput, setKioskPasswordInput] = useState('');
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [profileSearchResults, setProfileSearchResults] = useState<{id: string, email: string, student_id: string | null, name: string, role: string}[]>([]);
  const [editingProfile, setEditingProfile] = useState<{id: string, email: string, student_id: string, name: string, role: string} | null>(null);

  const [baseUrl, setBaseUrl] = useState('');
  useEffect(() => setBaseUrl(window.location.origin), []);

  // 상영작 홍보 메일
  const [promoSources, setPromoSources] = useState({ club: true, profilesAll: false, g1: false, g2: false, g3: false });
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
  const blacklistEmailPreviewCount = useMemo(() => extractSchoolEmails(newBlacklistText).length, [newBlacklistText]);
  const promoManualPreviewCount = useMemo(() => extractSchoolEmails(promoManualText).length, [promoManualText]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const p = await ensureProfile();
        if (active) setProfile(p);
      } catch (err) {
        if (err instanceof DomainNotAllowedError) alert('학교(@ts.hs.kr) 구글 계정으로만 로그인할 수 있습니다.');
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

  const fetchAdminData = async (): Promise<boolean> => {
    setIsLoadingUI(true);
    try {
      const res = await authFetch('/api/admin/action', { action: 'FETCH_INITIAL_DATA' });
      const { data, success, error } = await res.json();

      if (!success) {
        if (res.status === 401 || res.status === 403) return false;
        alert(`데이터 불러오기 실패: ${error}`);
        console.error("데이터 로드 실패:", error);
        return true;
      }

      const { movieData, resData, blData, logData, adminData, clubData, kioskPassword } = data;
      if (movieData) {
        setMovieInfo(movieData);
        setEditForm({
          ...movieData,
          age_rating: movieData.age_rating || '전체관람가',
          mid_vip_start_row: movieData.mid_vip_start_row || 'A',
          mid_vip_end_row: movieData.mid_vip_end_row || 'C',
          mid_vip_start_col: movieData.mid_vip_start_col || 5,
          mid_vip_end_col: movieData.mid_vip_end_col || 10,
          grand_vip_start_row: movieData.grand_vip_start_row || 'A',
          grand_vip_end_row: movieData.grand_vip_end_row || 'C',
          grand_vip_start_col: movieData.grand_vip_start_col || 10,
          grand_vip_end_col: movieData.grand_vip_end_col || 18,
        });
      }
      if (resData) setReservations(resData);
      if (blData) setBlacklist(blData);
      if (logData) setLogs(logData);
      if (adminData) setAdmins(adminData);
      if (clubData) setClubMembers(clubData);
      if (typeof kioskPassword === 'string') setKioskPasswordInput(kioskPassword);
      return true;
    } catch (err) {
      console.error("데이터 불러오기 오류:", err);
      return true;
    } finally {
      setIsLoadingUI(false);
    }
  };

  const handleGenerateTicketBackground = async (posterFile?: File) => {
    const posterSource = editForm.poster_url || editForm.poster_cdn_url;
    if (!posterFile && !posterSource) { alert('포스터 주소를 먼저 입력하세요.'); return; }
    if (!editForm.id) { alert('영화 정보를 먼저 불러와야 합니다.'); return; }

    setBgGenerating(true);
    setBgStatus(null);
    try {
      const blob = posterFile
        ? await renderTicketBackgroundFromFile(posterFile)
        : await renderTicketBackground(posterSource);
      const dataUri = await blobToDataUri(blob);
      const res = await authFetch('/api/admin/action', {
        action: 'UPLOAD_TICKET_BACKGROUND',
        payload: { movieId: editForm.id, imageBase64: dataUri },
      });
      const data = await res.json();
      if (!data.success) {
        setBgStatus(`실패: ${data.error}`);
        return;
      }
      setEditForm((prev: any) => ({ ...prev, background_template_url: data.url }));
      setMovieInfo((prev: any) => ({ ...prev, background_template_url: data.url }));

      // 원본 포스터도 Cloudinary에 복사해 둔다 (원본 호스트가 프로덕션에서
      // 서버발 요청을 막는 경우가 있어, 메일은 이 CDN URL을 우선 사용한다).
      // 파일을 직접 올린 경우 이미 로컬에 있는 바이트를 그대로 쓰고, 다시
      // 원본 호스트로 프록시 fetch를 시도하지 않는다.
      try {
        const posterDataUri = posterFile ? await blobToDataUri(posterFile) : await fetchPosterDataUri(posterSource);
        const posterRes = await authFetch('/api/admin/action', {
          action: 'UPLOAD_POSTER_CDN',
          payload: { movieId: editForm.id, imageBase64: posterDataUri },
        });
        const posterData = await posterRes.json();
        if (posterData.success) {
          setEditForm((prev: any) => ({ ...prev, poster_cdn_url: posterData.url }));
          setMovieInfo((prev: any) => ({ ...prev, poster_cdn_url: posterData.url }));
          setBgStatus('생성 완료 (배경 + 포스터 CDN)');
        } else {
          setBgStatus('배경 생성 완료 (포스터 CDN 저장 실패 — 다시 시도해보세요)');
        }
      } catch {
        setBgStatus('배경 생성 완료 (포스터 CDN 저장 실패 — 다시 시도해보세요)');
      }
    } catch (err: any) {
      setBgStatus(`실패: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setBgGenerating(false);
    }
  };

  const handleSaveSettingsClick = async () => {
    const payload = {
      title: editForm.title, date_string: editForm.date_string, db_date: editForm.db_date,
      venue: editForm.venue, poster_url: editForm.poster_url, deadline_date: editForm.deadline_date, age_rating: editForm.age_rating,
      mid_vip_start_row: editForm.mid_vip_start_row, mid_vip_end_row: editForm.mid_vip_end_row,
      mid_vip_start_col: editForm.mid_vip_start_col, mid_vip_end_col: editForm.mid_vip_end_col,
      grand_vip_start_row: editForm.grand_vip_start_row, grand_vip_end_row: editForm.grand_vip_end_row,
      grand_vip_start_col: editForm.grand_vip_start_col, grand_vip_end_col: editForm.grand_vip_end_col
    };

    const res = await authFetch('/api/admin/action', { action: 'UPDATE_SETTINGS', payload });

    const data = await res.json();
    if (!data.success) {
      alert("설정 저장 실패: " + data.error);
    } else {
      alert("설정이 성공적으로 저장되었습니다!");
      fetchAdminData();
    }
  };

  const handleStartNewMovieClick = () => {
    if (!confirm(`현재 회차 [${movieInfo?.title}]를 이력으로 보존하고 새로운 영화 예매를 시작합니다.\n계속하시겠습니까?`)) return;
    setNewMovieForm({
      ...movieInfo,
      title: '', poster_url: '',
    });
    setIsStartingNewMovie(true);
  };

  const handleSubmitNewMovie = async () => {
    const payload = {
      title: newMovieForm.title, date_string: newMovieForm.date_string, db_date: newMovieForm.db_date,
      venue: newMovieForm.venue, poster_url: newMovieForm.poster_url, deadline_date: newMovieForm.deadline_date, age_rating: newMovieForm.age_rating,
      mid_vip_start_row: newMovieForm.mid_vip_start_row, mid_vip_end_row: newMovieForm.mid_vip_end_row,
      mid_vip_start_col: newMovieForm.mid_vip_start_col, mid_vip_end_col: newMovieForm.mid_vip_end_col,
      grand_vip_start_row: newMovieForm.grand_vip_start_row, grand_vip_end_row: newMovieForm.grand_vip_end_row,
      grand_vip_start_col: newMovieForm.grand_vip_start_col, grand_vip_end_col: newMovieForm.grand_vip_end_col
    };

    const res = await authFetch('/api/admin/action', { action: 'START_NEW_MOVIE', payload });

    const data = await res.json();
    if (!data.success) {
      alert("새 회차 시작 실패: " + data.error);
    } else {
      alert("새 회차가 시작되었습니다!");
      setIsStartingNewMovie(false);
      fetchAdminData();
    }
  };

  const loadMovieHistory = async () => {
    const res = await authFetch('/api/admin/action', { action: 'LIST_MOVIE_HISTORY' });
    const data = await res.json();
    if (!data.success) return alert("회차 이력 조회 실패: " + data.error);
    setMovieHistory(data.data);
  };

  const handleSelectHistoryMovie = async (movie: any) => {
    const res = await authFetch('/api/admin/action', { action: 'FETCH_HISTORY_RESERVATIONS', payload: { movieSettingsId: movie.id } });
    const data = await res.json();
    if (!data.success) return alert("예매 내역 조회 실패: " + data.error);
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
    if (!data.success) return alert("후기 삭제 실패: " + data.error);
    setHistoryReviews(prev => prev.filter(r => r.id !== review.id));
  };

  const handleApprove = async (ticket: any) => {
    const popcorns = ticket.popcorn_order !== 'none' ? ticket.popcorn_order.split(',') : [];
    const totalPrice = popcorns.length * 2500;

    if (!confirm(`${ticket.student_name}님의 예매를 확정하시겠습니까?\n(입금 확인 금액: ${totalPrice.toLocaleString()}원)`)) return;

    const res = await authFetch('/api/admin/action', {
      action: 'APPROVE_RESERVATION',
      payload: { id: ticket.id, studentId: ticket.student_id, studentName: ticket.student_name, seatNumber: ticket.seat_number }
    });

    const data = await res.json();
    if (!data.success) return alert("승인 실패: " + data.error);

    if (ticket.email) {
      fetch('/api/ticket', { method: 'POST', body: JSON.stringify({ email: ticket.email, name: ticket.student_name, seat: ticket.seat_number, movieTitle: movieInfo.title, movieDate: movieInfo.date_string, venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: movieInfo.poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: movieInfo.background_template_url, statusType: 'confirmed', popcorn: ticket.popcorn_order, ticketId: ticket.id, baseUrl }) });
    }
    setReservations(prev => prev.map(r => r.id === ticket.id ? { ...r, payment_status: 'confirmed' } : r));
    fetchAdminData();
    alert("승인 완료 및 이메일 발송됨!");
  };

  const handleCancel = async (ticket: any) => {
    if (!confirm(`정말 ${ticket.student_name}님의 예매를 취소하시겠습니까?`)) return;

    const res = await authFetch('/api/admin/action', {
      action: 'CANCEL_RESERVATION',
      payload: { id: ticket.id, studentId: ticket.student_id, studentName: ticket.student_name, seatNumber: ticket.seat_number }
    });

    const data = await res.json();
    if (!data.success) return alert("취소 실패: " + data.error);

    if (ticket.email) {
      const isRefundNeeded = ticket.popcorn_order !== 'none' && ticket.payment_status === 'confirmed';
      fetch('/api/ticket', {
        method: 'POST',
        body: JSON.stringify({ email: ticket.email, name: ticket.student_name, seat: ticket.seat_number, movieTitle: movieInfo.title, movieDate: movieInfo.date_string, venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: movieInfo.poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: movieInfo.background_template_url, statusType: 'canceled', popcorn: ticket.popcorn_order, ticketId: ticket.id, baseUrl, isRefundNeeded })
      });
    }
    setReservations(prev => prev.filter(r => r.id !== ticket.id));
    fetchAdminData();
    alert("취소 완료 및 이메일 발송됨!");
  };

  const handleResetPrint = async (ticket: any) => {
    if (!confirm(`${ticket.student_name}님의 티켓 발권 상태를 '미발권'으로 초기화하시겠습니까?\n(학생이 현장 키오스크에서 다시 티켓을 출력할 수 있게 됩니다.)`)) return;

    const res = await authFetch('/api/admin/action', {
      action: 'RESET_PRINT',
      payload: { id: ticket.id, studentId: ticket.student_id, studentName: ticket.student_name, seatNumber: ticket.seat_number }
    });

    const data = await res.json();
    if (!data.success) {
      alert("초기화 실패: " + data.error);
      return;
    }

    setReservations(prev => prev.map(r => r.id === ticket.id ? { ...r, is_printed: false } : r));
    fetchAdminData();
    alert("발권 상태가 초기화되었습니다.");
  };

  const handleAddBlacklistBulk = async () => {
    const emails = extractSchoolEmails(newBlacklistText);
    if (emails.length === 0) return alert("추가할 @ts.hs.kr 이메일이 없습니다.");
    if (!confirm(`${emails.length}명을 블랙리스트에 추가하시겠습니까?\n(주의: 현재 진행 중이거나 완료된 예매 내역이 있다면 자동으로 취소됩니다.)`)) return;

    const res = await authFetch('/api/admin/action', { action: 'ADD_BLACKLIST_BULK', payload: { emails, movieDate: movieInfo.db_date } });
    const data = await res.json();
    if (!data.success) return alert("추가 실패: " + (data.error || ''));

    data.results.forEach((r: any) => {
      if (r.canceledTicket) {
        const ticket = r.canceledTicket;
        const isRefundNeeded = ticket.popcorn_order !== 'none' && ticket.payment_status === 'confirmed';
        fetch('/api/ticket', {
          method: 'POST',
          body: JSON.stringify({ email: r.email, name: r.name, seat: ticket.seat_number, movieTitle: movieInfo.title, movieDate: movieInfo.date_string, venue: movieInfo.venue, ageRating: movieInfo.age_rating, posterUrl: movieInfo.poster_cdn_url || movieInfo.poster_url, backgroundTemplateUrl: movieInfo.background_template_url, statusType: 'canceled', popcorn: ticket.popcorn_order, ticketId: ticket.id, baseUrl, isRefundNeeded })
        });
      }
      fetch('/api/blacklist', { method: 'POST', body: JSON.stringify({ email: r.email, name: r.name, action: 'added' }) });
    });

    setNewBlacklistText('');
    fetchAdminData();
    alert(`${emails.length}명 블랙리스트 추가 및 예매 자동 취소 처리가 완료되었습니다!`);
  };

  const handleRemoveBlacklist = async (email: string) => {
    if (!confirm(`${email} 블랙리스트를 해제하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_BLACKLIST', payload: { email } });
    const data = await res.json();
    if (!data.success) return alert("해제 실패");
    fetch('/api/blacklist', { method: 'POST', body: JSON.stringify({ email, name: data.name, action: 'removed' }) });
    fetchAdminData();
    alert("해제 완료 및 안내 메일 발송!");
  };

  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email.endsWith('@ts.hs.kr')) return alert("@ts.hs.kr 이메일만 등록할 수 있습니다.");
    const res = await authFetch('/api/admin/action', { action: 'ADD_ADMIN', payload: { email } });
    const data = await res.json();
    if (!data.success) return alert("추가 실패: " + data.error);
    setAdmins(prev => [{ email, added_by: profile!.email, created_at: new Date().toISOString() }, ...prev]);
    setNewAdminEmail('');
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === profile!.email) return alert("본인 계정은 스스로 제거할 수 없습니다.");
    if (!confirm(`${email}의 관리자 권한을 제거하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_ADMIN', payload: { email } });
    const data = await res.json();
    if (!data.success) return alert("제거 실패: " + data.error);
    setAdmins(prev => prev.filter(a => a.email !== email));
  };

  const handleAddClubMembers = async () => {
    const emails = extractSchoolEmails(newClubMembersText);
    if (emails.length === 0) return alert("추가할 @ts.hs.kr 이메일이 없습니다.");
    const res = await authFetch('/api/admin/action', { action: 'ADD_CLUB_MEMBERS', payload: { emails } });
    const data = await res.json();
    if (!data.success) return alert("추가 실패: " + data.error);
    setNewClubMembersText('');
    fetchAdminData();
    alert(`${emails.length}명 동아리원(VIP)으로 추가되었습니다.`);
  };

  const handleRemoveClubMember = async (email: string) => {
    if (!confirm(`${email} 학생을 동아리원(VIP)에서 제거하시겠습니까?`)) return;
    const res = await authFetch('/api/admin/action', { action: 'REMOVE_CLUB_MEMBER', payload: { email } });
    const data = await res.json();
    if (!data.success) return alert("제거 실패: " + data.error);
    fetchAdminData();
  };

  const handleUpdateKioskPassword = async () => {
    if (!kioskPasswordInput.trim()) return alert("키오스크 비밀번호를 입력해주세요.");
    const res = await authFetch('/api/admin/action', { action: 'UPDATE_KIOSK_PASSWORD', payload: { password: kioskPasswordInput.trim() } });
    const data = await res.json();
    if (!data.success) return alert("변경 실패: " + data.error);
    alert("키오스크 잠금 비밀번호가 변경되었습니다.");
  };

  const handleSearchProfile = async () => {
    const res = await authFetch('/api/admin/action', { action: 'SEARCH_PROFILE', payload: { query: profileSearchQuery } });
    const data = await res.json();
    if (data.success) setProfileSearchResults(data.data);
  };

  const handleSaveProfile = async () => {
    if (!editingProfile) return;
    if (editingProfile.role === 'student' && !/^\d{4}$/.test(editingProfile.student_id)) {
      return alert("학생은 학번 4자리가 필요합니다.");
    }
    const res = await authFetch('/api/admin/action', {
      action: 'UPDATE_PROFILE',
      payload: { id: editingProfile.id, studentId: editingProfile.student_id, name: editingProfile.name, role: editingProfile.role }
    });
    const data = await res.json();
    if (!data.success) return alert("저장 실패: " + data.error);
    alert("저장되었습니다.");
    setEditingProfile(null);
    setProfileSearchResults([]);
    setProfileSearchQuery('');
  };

  const handleResolvePromoClick = async () => {
    const grades = (['g1', 'g2', 'g3'] as const).filter((g) => promoSources[g]);
    const hasTarget =
      promoSources.club || promoSources.profilesAll || grades.length > 0 || promoManualPreviewCount > 0;
    if (!hasTarget) return alert('발송 대상을 하나 이상 선택하세요.');
    if (!movieInfo?.title) return alert('현재 상영작 정보가 없습니다. 회차 설정을 먼저 저장하세요.');

    setIsResolvingPromo(true);
    try {
      const res = await authFetch('/api/admin/action', {
        action: 'RESOLVE_PROMO_RECIPIENTS',
        payload: {
          club: promoSources.club,
          profilesAll: promoSources.profilesAll,
          grades,
          manualText: promoManualText,
        },
      });
      const data = await res.json();
      if (!data.success) return alert('명단 조회 실패: ' + data.error);
      if (data.data.count === 0) return alert('발송 대상이 없습니다. (블랙리스트 제외 후 0명)');
      setPromoRecipients(data.data.recipients);
      setShowPromoConfirm(true);
    } catch (err) {
      console.error(err);
      alert('명단 조회 중 오류가 발생했습니다.');
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
    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      try {
        const r = await fetch('/api/promo', {
          method: 'POST',
          body: JSON.stringify({ chunk, movieInfo: movieInfoPayload, baseUrl }),
        });
        const d = await r.json();
        if (d.success) {
          sent += d.sent;
          failed += d.failed;
        } else {
          failed += chunk.length;
        }
      } catch (err) {
        console.error(err);
        failed += chunk.length;
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
    alert(`홍보 메일 발송 완료!\n성공 ${sent}명 / 실패 ${failed}명`);
    fetchAdminData();
  };

  if (authLoading) return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <p className="text-white font-bold animate-pulse">로그인 확인 중...</p>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div className="bg-neutral-800 p-8 rounded-xl max-w-sm w-full text-center border border-neutral-700 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-1.5"><Lock className="w-5 h-5" /> 관리자 로그인</h1>
        <p className="text-neutral-400 text-sm mb-6">학교(@ts.hs.kr) 구글 계정으로 로그인해주세요.</p>
        <button
          onClick={() => signInWithGoogle().catch(() => alert('로그인에 실패했습니다.'))}
          className="w-full py-3 bg-white hover:bg-neutral-100 text-neutral-900 rounded-lg font-bold transition-colors"
        >
          구글 계정으로 로그인
        </button>
      </div>
    </div>
  );

  if (checkingAdmin) return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <p className="text-white font-bold animate-pulse">권한 확인 중...</p>
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div className="bg-neutral-800 p-8 rounded-xl max-w-sm w-full text-center border border-red-700 shadow-2xl">
        <h1 className="text-2xl font-bold text-red-400 mb-4 flex items-center justify-center gap-1.5"><Ban className="w-5 h-5" /> 권한 없음</h1>
        <p className="text-neutral-400 text-sm">{profile.email} 계정은 관리자로 등록되어 있지 않습니다.</p>
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="w-full flex flex-wrap justify-end items-center gap-3 mb-6">
          <span className="text-xs md:text-sm text-neutral-500">{profile.email}</span>
          <button onClick={() => signOutAndClear().then(() => window.location.reload())} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded-lg text-xs md:text-sm text-neutral-400 font-bold transition-colors flex items-center gap-1.5">
            <LogOut className="w-4 h-4" /> 로그아웃
          </button>
          <Link href="/" className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded-lg text-xs md:text-sm text-neutral-300 font-bold transition-colors flex items-center gap-1.5"><Home className="w-4 h-4" /> 메인 홈</Link>
          <Link href="/print" className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded-lg text-xs md:text-sm text-neutral-300 font-bold transition-colors flex items-center gap-1.5"><Printer className="w-4 h-4" /> 현장 발권기</Link>
        </div>

        {isLoadingUI && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="flex flex-col items-center bg-neutral-900/80 p-8 rounded-2xl shadow-2xl border border-neutral-700 w-80">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-orange-500 mb-6 shadow-[0_0_15px_rgba(249,115,22,0.6)]"></div>
              <p className="text-white font-bold text-xl tracking-wider mb-2">서버 동기화 중...</p>
              <p className="text-neutral-400 text-sm">최신 데이터를 로드 중입니다.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-orange-400 flex items-center gap-1.5"><Crown className="w-6 h-6" /> 영화대교 관리자 대시보드</h1>
          <button onClick={() => { fetchAdminData(); alert("데이터가 새로고침 되었습니다."); }} className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-lg font-bold transition-colors whitespace-nowrap flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
        </div>

        <AdminTabs
          active={activeTab}
          onChange={setActiveTab}
          pendingCount={reservations.filter(r => r.payment_status === 'pending').length}
        />

        {activeTab === 'reservations' && (
          <ReservationsTab
            reservations={reservations}
            popcornStats={popcornStats}
            onApprove={handleApprove}
            onCancel={handleCancel}
            onResetPrint={handleResetPrint}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            movieInfo={movieInfo}
            editForm={editForm}
            setEditForm={setEditForm}
            onSaveSettings={handleSaveSettingsClick}
            bgGenerating={bgGenerating}
            bgStatus={bgStatus}
            onGenerateBg={handleGenerateTicketBackground}
            onStartNewMovieClick={handleStartNewMovieClick}
            isStartingNewMovie={isStartingNewMovie}
            newMovieForm={newMovieForm}
            setNewMovieForm={setNewMovieForm}
            onSubmitNewMovie={handleSubmitNewMovie}
            onCancelNewMovie={() => setIsStartingNewMovie(false)}
            promo={{
              sources: promoSources,
              setSources: setPromoSources,
              manualText: promoManualText,
              setManualText: setPromoManualText,
              manualPreviewCount: promoManualPreviewCount,
              isResolving: isResolvingPromo,
              isSending: isSendingPromo,
              progress: promoProgress,
              recipientCount: promoRecipients.length,
              showConfirm: showPromoConfirm,
              onResolveClick: handleResolvePromoClick,
              onConfirmSend: executeSendPromo,
              onCancelConfirm: () => setShowPromoConfirm(false),
            }}
          />
        )}

        {activeTab === 'members' && (
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
            kioskPasswordInput={kioskPasswordInput}
            setKioskPasswordInput={setKioskPasswordInput}
            onUpdateKioskPassword={handleUpdateKioskPassword}
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

        {activeTab === 'history' && (
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
      </div>
    </div>
  );
}
