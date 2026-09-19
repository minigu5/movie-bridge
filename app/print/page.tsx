"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Printer, Popcorn, Clapperboard } from 'lucide-react';


export default function KioskPrintPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  const [formData, setFormData] = useState({ studentId: '', name: '' });
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
    if (!formData.studentId || !formData.name) return alert("학번과 이름을 모두 입력해주세요.");
    const cleanId = formData.studentId.replace(/['"]/g, '').trim();

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

  const getPopcornReceiptText = (popcornString: string): React.ReactNode => {
    const popcornArray = popcornString.split(',');
    const POPCORN_NAMES: Record<string, string> = { original: '오리지널', consomme: '콘소메', caramel: '카라멜' };
    const counts: Record<string, number> = {};

    popcornArray.forEach((p: string) => { counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).map(([k, c]) => `${POPCORN_NAMES[k]} x${c}`).join(' / ');
  };

  if (!isAdminAuth) {
    // ... (기존 로그인 UI 화면 동일하므로 생략하지 않고 그대로 포함합니다.)
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
        <div className="bg-neutral-900 p-8 rounded-xl max-w-sm w-full text-center border border-orange-600 shadow-2xl">
          <h1 className="text-2xl font-bold text-orange-500 mb-6 flex items-center justify-center gap-1.5">
            <Printer className="w-6 h-6" />
            KIOSK 발권기 접속
          </h1>
          <p className="text-neutral-400 text-sm mb-6">원활한 현장 발권 준비를 위해<br />관리자 비밀번호를 입력해주세요.</p>
          <input
            type="password"
            value={adminPasswordInput}
            onChange={(e) => setAdminPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            className="w-full p-4 rounded-lg bg-neutral-800 text-white border border-neutral-600 mb-6 text-center outline-none focus:border-orange-500"
            placeholder="비밀번호 입력"
          />
          <button
            onClick={handleAdminLogin}
            className="w-full py-4 bg-orange-600 hover:bg-orange-500 rounded-lg text-black font-bold text-lg"
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

      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 print:bg-white print:text-black print:min-h-0 print:p-0 print:block select-none">

        {!ticketData ? (
          <>
            <div className="w-full max-w-md bg-neutral-900 p-8 rounded-2xl shadow-2xl border border-neutral-600 print:hidden">
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <Clapperboard className="w-4 h-4 text-neutral-400" strokeWidth={2.5} />
                  <span className="text-xs font-black text-neutral-400 tracking-[0.3em]">영화대교</span>
                </div>
                <h1 className="text-3xl font-bold text-orange-500 tracking-wider mb-2">현장 발권기</h1>
                <p className="text-neutral-400 text-sm">현장에서 예매 티켓을 스티커/영수증으로 출력합니다.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-neutral-300 mb-1 text-sm font-bold">학번</label>
                  <input type="text" name="studentId" value={formData.studentId} onChange={handleInputChange} className="w-full p-4 rounded-xl bg-neutral-800 text-white border border-neutral-600 outline-none focus:border-orange-500 text-lg" placeholder="예: 2703" />
                </div>
                <div>
                  <label className="block text-neutral-300 mb-1 text-sm font-bold">이름</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} onKeyDown={(e) => e.key === 'Enter' && handlePrintSubmit()} className="w-full p-4 rounded-xl bg-neutral-800 text-white border border-neutral-600 outline-none focus:border-orange-500 text-lg" placeholder="본명 입력" />
                </div>
              </div>

              <button onClick={handlePrintSubmit} disabled={isPrinting} className="w-full mt-8 py-4 bg-orange-600 hover:bg-orange-500 text-black font-black text-xl rounded-xl shadow-[0_0_20px_rgba(234,88,12,0.4)] transition-all">
                {isPrinting ? '티켓 정보 확인 중...' : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Printer className="w-4 h-4" />
                    영수증 티켓 출력하기
                  </span>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="w-[72mm] mx-auto bg-white text-black font-mono print:w-full print:m-0 print:px-4">

            <div className="text-center text-2xl font-black mb-0.5 tracking-widest pt-1">영화대교 입장권</div>
            <div className="text-[11px] text-center text-gray-700 mb-1">{new Date().toLocaleString()} (현장_KIOSK_1)</div>

            <div className="border-b-2 border-dashed border-black my-1.5"></div>

            {/* 🌟 [수정됨] 좁은 80mm 폭에서 제목이 세로로 쪼개지지 않도록 뱃지 제거, 제목 아래 텍스트로 배치 */}
            <div className="text-3xl font-black leading-tight tracking-tighter mb-0.5">{movieInfo?.title}</div>
            <div className="text-sm font-bold text-gray-800 mb-1.5">{movieInfo?.age_rating || '전체관람가'}</div>

            {/* 🌟 [수정됨] 상영일시를 전체 폭 한 줄로 (기존엔 좁은 컬럼에 갇혀 여러 줄로 쪼개짐) */}
            <div className="text-[13px] font-black tracking-tight border-b-[3px] border-black inline-block pb-0.5 mb-1.5">상영일시: {movieInfo?.date_string}</div>

            <div className="flex justify-between items-end mb-1.5">
              <div className="leading-tight">
                <div className="text-sm font-bold">{movieInfo?.venue}</div>
                <div className="text-sm font-bold mt-0.5">예매자: {ticketData.student_name} ({ticketData.student_id})</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-bold">관람석</div>
                <div className="text-4xl font-black">{ticketData.seat_number}</div>
              </div>
            </div>

            <div className="border-b-2 border-dashed border-black my-1.5"></div>

            {ticketData.popcorn_order && ticketData.popcorn_order !== 'none' && (
              <>
                <div className="text-lg font-black mb-1 flex items-center gap-1.5">
                  <Popcorn className="w-4 h-4" />
                  팝콘 수령 정보
                </div>
                <div className="text-sm font-bold leading-tight">
                  {getPopcornReceiptText(ticketData.popcorn_order)}
                </div>
              </>
            )}

            {/* 🌟 [수정됨] 팝콘/footer 사이 구분선 제거해 구분선 3개→2개로 압축 */}
            <div className="text-center font-bold text-sm mt-2 mb-1">대구과학고등학교 영화대교</div>
            <div className="text-[11px] leading-snug mb-2 text-left font-bold">
              * 1인 1매 한정 출력, 분실 시 재발권/팝콘수령 불가. 팝콘 배부처에 본 티켓을 제시해주세요.
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
                  <div className="text-center font-mono text-[13px] font-bold tracking-[0.2em] mt-1 text-gray-800">
                    {formattedId}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

      </div>
    </>
  );
}