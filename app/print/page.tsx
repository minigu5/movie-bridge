"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import logoDark from '@/public/brand/logo-horizontal-dark.svg';
import logoMono from '@/public/brand/logo-horizontal-mono.svg';


export default function KioskPrintPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  const [formData, setFormData] = useState({ studentId: '', name: '' });
  // 교직원은 학번이 없다(student_id null). 교직원을 고르면 학번 칸을 숨기고 이름으로만 조회한다.
  const [isStaff, setIsStaff] = useState(false);
  const [movieInfo, setMovieInfo] = useState<any>(null);

  const [ticketData, setTicketData] = useState<any>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('skip_auth') === 'true') {
      setIsAdminAuth(true);
    }
  }, []);

  useEffect(() => {
    const fetchMovie = async () => {
      // 🌟 [수정됨] DB에서 age_rating(관람가)도 함께 불러옵니다.
      const { data } = await supabase.from('movie_settings').select('title, date_string, db_date, venue, age_rating').eq('is_active', true).single();
      if (data) setMovieInfo(data);
    };
    fetchMovie();
  }, []);

  useEffect(() => {
    if (ticketData) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [ticketData]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setTicketData(null);
      setFormData({ studentId: '', name: '' });
      setIsStaff(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAdminLogin = async () => {
    try {
      const res = await fetch('/api/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'KIOSK_LOGIN', payload: { password: adminPasswordInput } })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdminAuth(true);
      } else {
        alert("관리자 비밀번호가 틀렸습니다.");
        setAdminPasswordInput('');
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    }
  };

  const handlePrintSubmit = async () => {
    const cleanId = isStaff ? '' : formData.studentId.replace(/['"]/g, '').trim();
    if (!isStaff && !cleanId) return alert("학번을 입력해주세요.\n(교직원은 위에서 '교직원'을 선택해주세요)");
    if (!formData.name) return alert("이름을 입력해주세요.");

    if (isPrinting) return;
    setIsPrinting(true);

    try {
      const lookupRes = await fetch('/api/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOOKUP_TICKET',
          payload: { studentId: cleanId, studentName: formData.name, movieDate: movieInfo.db_date }
        })
      });
      const lookupData = await lookupRes.json();

      if (!lookupData.success) return alert(lookupData.error || "예매 내역이 존재하지 않습니다. 학번/이름을 다시 확인해주세요.");

      const ticket = lookupData.ticket;

      if (ticket.is_printed) {
        return alert("이미 현장에서 발권이 완료된 티켓입니다! (1인 1매 원칙)\n오류인 경우 관리자에게 문의하세요.");
      }

      const apiRes = await fetch('/api/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PRINT_TICKET',
          payload: { ticketId: ticket.id, studentId: cleanId, studentName: formData.name, seatNumber: ticket.seat_number }
        })
      });
      const apiData = await apiRes.json();

      if (!apiData.success) {
        alert("서버 오류로 발권 기록 업데이트에 실패했습니다. 관리자에게 문의하세요.");
        return;
      }

      ticket.is_printed = true;
      setTicketData(ticket);

    } catch (err) {
      alert("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsPrinting(false);
    }
  };

  // 메일 티켓과 같은 이름으로 종류별 한 줄씩 (예: 오리지널 버터 팝콘 2개)
  const getPopcornReceiptLines = (popcornString: string): string[] => {
    const POPCORN_NAMES: Record<string, string> = { original: '오리지널 버터 팝콘', consomme: '콘소메맛 팝콘', caramel: '카라멜맛 팝콘' };
    const counts: Record<string, number> = {};
    popcornString.split(',').forEach((p: string) => { counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).map(([k, c]) => `${POPCORN_NAMES[k] ?? k} ${c}개`);
  };

  if (!isAdminAuth) {
    // ... (기존 로그인 UI 화면 동일하므로 생략하지 않고 그대로 포함합니다.)
    return (
      <div className="min-h-screen bg-[#0E0D0B] text-[#F4F1EA] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <img src={logoDark.src} alt="영화대교" className="w-[150px] h-auto" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-black tracking-tight">발권기 열기</h1>
            <p className="text-[#ABA69C] text-sm">현장 발권을 시작하려면 관리자 비밀번호를 입력해 주세요.</p>
          </div>
          <input
            type="password"
            value={adminPasswordInput}
            onChange={(e) => setAdminPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            className="w-full h-14 px-4 rounded-xl bg-[#1A1916] text-[#F4F1EA] border border-[#2C2A26] text-center text-lg outline-none focus:border-[#F4F1EA]"
            placeholder="비밀번호"
          />
          <button
            onClick={handleAdminLogin}
            className="w-full h-14 rounded-xl bg-[#F4F1EA] text-[#0E0D0B] font-black text-lg hover:bg-white transition-colors"
          >
            발권기 열기
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page { margin: 5mm; size: auto; }
          body { background-color: #fff !important; color: #000 !important; }
        }
      `}} />

      <div className="min-h-screen bg-[#0E0D0B] text-[#F4F1EA] flex flex-col items-center justify-center p-4 print:bg-white print:text-black print:min-h-0 print:p-0 print:block select-none">

        {!ticketData ? (
          <div className="w-full max-w-[420px] flex flex-col gap-7 print:hidden">
            <div className="flex flex-col items-center gap-[18px] text-center">
              <img src={logoDark.src} alt="영화대교" className="w-[170px] h-auto" />
              <div className="flex flex-col gap-1.5">
                <h1 className="text-[32px] font-black tracking-tight">현장 발권</h1>
                <p className="text-[#ABA69C] text-[15px]">예매한 티켓을 영수증으로 뽑아요.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1A1916] border border-[#2C2A26]">
              {([['학생', false], ['교직원', true]] as const).map(([label, staff]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setIsStaff(staff)}
                  className={`h-[52px] rounded-[9px] text-lg font-bold transition-colors ${isStaff === staff ? 'bg-[#F4F1EA] text-[#0E0D0B]' : 'text-[#938E84] hover:text-[#F4F1EA]'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3.5">
              {!isStaff && (
                <label className="flex flex-col gap-1.5 text-[13px] font-bold text-[#ABA69C]">
                  학번
                  <input type="text" name="studentId" value={formData.studentId} onChange={handleInputChange} className="h-[58px] px-[18px] rounded-xl bg-[#1A1916] text-[#F4F1EA] border border-[#2C2A26] outline-none focus:border-[#F4F1EA] text-xl font-medium" placeholder="예: 2703" />
                </label>
              )}
              <label className="flex flex-col gap-1.5 text-[13px] font-bold text-[#ABA69C]">
                이름
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} onKeyDown={(e) => e.key === 'Enter' && handlePrintSubmit()} className="h-[58px] px-[18px] rounded-xl bg-[#1A1916] text-[#F4F1EA] border border-[#2C2A26] outline-none focus:border-[#F4F1EA] text-xl font-medium" placeholder="이름" />
              </label>
            </div>

            <button onClick={handlePrintSubmit} disabled={isPrinting} className="h-[62px] rounded-xl bg-[#F4F1EA] text-[#0E0D0B] font-black text-[19px] hover:bg-white disabled:opacity-60 transition-colors flex items-center justify-center gap-2.5">
              {isPrinting ? '티켓을 찾는 중…' : (
                <>
                  <Printer className="w-5 h-5" strokeWidth={2.2} />
                  티켓 출력하기
                </>
              )}
            </button>
          </div>
        ) : (
          // 72mm 흑백 감열 영수증: 검정 한 가지 색만 쓴다(회색·빨강 금지)
          <div className="w-[72mm] mx-auto bg-white text-black px-1 pt-2 pb-1 flex flex-col gap-2.5 print:w-full print:m-0 print:px-4">

            <div className="flex flex-col items-center gap-2">
              <img src={logoMono.src} alt="영화대교" className="w-[150px] h-auto" />
              <div className="text-[13px] font-black tracking-[0.5em] pl-[0.5em]">입장권</div>
              <div className="text-[11px] tabular-nums">{new Date().toLocaleString('ko-KR')} · 현장 발권</div>
            </div>

            <div className="border-t-2 border-dashed border-black"></div>

            <div className="flex flex-col gap-0.5">
              <div className="text-[26px] font-black leading-tight tracking-tighter">{movieInfo?.title}</div>
              <div className="text-xs font-bold">2D · {movieInfo?.age_rating || '전체관람가'}</div>
            </div>

            <div className="flex justify-between items-end gap-2">
              <div className="flex flex-col gap-[3px] text-[13px] font-medium leading-snug">
                <div><b className="font-black">상영</b> {movieInfo?.date_string}</div>
                {movieInfo?.venue && <div><b className="font-black">장소</b> {movieInfo.venue}</div>}
                <div><b className="font-black">예매</b> {ticketData.student_name} ({ticketData.student_id ?? '교직원'})</div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-[11px] font-bold">관람석</span>
                <span className="text-[46px] font-black leading-none tracking-tighter tabular-nums">{ticketData.seat_number}</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-black"></div>

            {ticketData.popcorn_order && ticketData.popcorn_order !== 'none' && (
              <div className="flex flex-col gap-[3px]">
                <div className="text-sm font-black">팝콘 수령</div>
                {getPopcornReceiptLines(ticketData.popcorn_order).map((line) => (
                  <div key={line} className="text-[13px] font-medium">{line}</div>
                ))}
              </div>
            )}

            <div className="text-[11px] leading-normal font-medium border-[1.5px] border-black px-2 py-1.5">
              1인 1매 한정 출력이에요. 잃어버리면 다시 뽑거나 팝콘을 받을 수 없어요. 팝콘 배부처에 이 티켓을 보여주세요.
            </div>

            {/* 🌟 [수정됨] 외부 API 접속 차단(CORS/Adblock) 환경을 대비해 순수 React CSS 바코드 렌더러로 완전 대체 */}
            {(() => {
              const CODE39_MAP: Record<string, string> = {
                '0': 'bwbWBwBwb', '1': 'BwbWbwbwB', '2': 'bwBWbwbwB', '3': 'BwBWbwbwb',
                '4': 'bwbWBwbwB', '5': 'BwbWBwbwb', '6': 'bwBWBwbwb', '7': 'bwbWbwBwB',
                '8': 'BwbWbwBwb', '9': 'bwBWbwBwb', 'A': 'BwbwbWbwB', 'B': 'bwBwbWbwB',
                'C': 'BwBwbWbwb', 'D': 'bwbwBWbwB', 'E': 'BwbwBWbwb', 'F': 'bwBwBWbwb',
                'G': 'bwbwbWBwB', 'H': 'BwbwbWBwb', 'I': 'bwBwbWBwb', 'J': 'bwbwBWBwb',
                'K': 'BwbwbwbWB', 'L': 'bwBwbwbWB', 'M': 'BwBwbwbWb', 'N': 'bwbwBwbWB',
                'O': 'BwbwBwbWb', 'P': 'bwBwBwbWb', 'Q': 'bwbwbwBWB', 'R': 'BwbwbwBWb',
                'S': 'bwBwbwBWb', 'T': 'bwbwBwBWb', 'U': 'BWbwbwbwB', 'V': 'bWBwbwbwB',
                'W': 'BWBwbwbwb', 'X': 'bWbwBwbwB', 'Y': 'BWbwBwbwb', 'Z': 'bWBwBwbwb',
                '-': 'bWbwbwBwB', '.': 'BWbwbwBwb', ' ': 'bWBwbwBwb', '*': 'bWbwBwBwb'
              };
              const cleanId = ticketData.id.toString().replace(/-/g, '').toUpperCase();
              const displayId = cleanId.length > 16 ? cleanId.substring(0, 16) : cleanId.padStart(16, '0');
              const formattedId = displayId.match(/.{1,4}/g)?.join(' ') || displayId;
              
              const upper = `*${displayId}*`;
              const bars: string[] = [];
              for (let i = 0; i < upper.length; i++) {
                const char = upper[i];
                const pattern = CODE39_MAP[char] || CODE39_MAP['-'];
                for (let p=0; p<pattern.length; p++) bars.push(pattern[p]);
                if (i < upper.length - 1) bars.push('w');
              }
              
              let currentX = 0;
              const svgElements = bars.map((v, i) => {
                const isBlack = v.toLowerCase() === 'b';
                const isWide = v === 'B' || v === 'W';
                const width = isWide ? 3.5 : 1.5;
                
                const rect = isBlack ? (
                  <rect key={i} x={currentX} y="0" width={width} height="50" fill="#000" />
                ) : null;
                
                currentX += width;
                return rect;
              });

              return (
                <div className="flex flex-col items-center mt-1 mb-2 w-full">
                  <div className="flex justify-center h-[50px] w-full overflow-hidden">
                    <svg width={currentX} height="50" viewBox={`0 0 ${currentX} 50`} style={{ maxWidth: '100%' }}>
                      {svgElements}
                    </svg>
                  </div>
                  <div className="text-center text-[11px] font-bold tracking-[0.2em] mt-1 tabular-nums">
                    {formattedId}
                  </div>
                </div>
              );
            })()}

            <div className="text-center text-[11px] font-bold tracking-[0.12em] pb-1">대구과학고등학교 영화대교</div>
          </div>
        )}

      </div>
    </>
  );
}