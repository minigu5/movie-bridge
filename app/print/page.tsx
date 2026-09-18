"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { CircleX, Printer, Popcorn } from 'lucide-react';


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
      const { data: ticket } = await supabase.from('reservations')
        .select('*')
        .eq('student_id', cleanId)
        .eq('student_name', formData.name)
        .eq('movie_date', movieInfo.db_date)
        .single();

      if (!ticket) return alert("예매 내역이 존재하지 않습니다. 학번/이름을 다시 확인해주세요.");

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
    if (!popcornString || popcornString === 'none') return (
      <span className="flex items-center gap-1.5">
        <CircleX className="w-4 h-4" />
        {"팝콘 배부 대상이 아님\n(무료 관람권 예매자)"}
      </span>
    );

    const popcornArray = popcornString.split(',');
    const POPCORN_NAMES: Record<string, string> = { original: '오리지널 버터 팝콘', consomme: '콘소메맛 팝콘', caramel: '카라멜맛 팝콘' };
    const counts: Record<string, number> = {};
    
    popcornArray.forEach((p: string) => { counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).map(([k, c]) => `[ ${POPCORN_NAMES[k]} ]  x  ${c}개`).join('\n');
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
          <div className="w-[80mm] mx-auto bg-white text-black font-mono print:w-full print:m-0 print:px-4">

            <div className="text-center text-2xl font-black mb-1 tracking-widest pt-2">영화대교 입장권</div>
            <div className="text-[11px] text-center text-gray-700 mb-2">{new Date().toLocaleString()} (현장_KIOSK_1)</div>

            <div className="border-b-2 border-dashed border-black my-2"></div>

            {/* 🌟 [수정됨] DB에 저장된 관람가(age_rating)를 동적으로 반영합니다. 기본값은 전체관람가 */}
            <div className="text-[13px] font-bold">2D, {movieInfo?.age_rating || '전체관람가'}</div>
            <div className="text-3xl font-black leading-tight tracking-tighter my-1">{movieInfo?.title}</div>

            {/* 🌟 [수정됨] 배경 반전을 지우고 검은색 두꺼운 테두리와 굵은 글씨로 흐려짐(연하게 찍힘) 문제 해결 */}
            <div className="text-[15px] font-extrabold border-[3px] border-black inline-block px-2 py-1 mb-2 mt-1">상영일시: {movieInfo?.date_string}</div>

            <div className="flex justify-between items-end mt-4 mb-4">
              <div>
                <div className="text-sm font-bold">{movieInfo?.venue}</div>
                <div className="text-sm font-bold mt-1">예매자: {ticketData.student_name} ({ticketData.student_id})</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-bold">관람석</div>
                <div className="text-4xl font-black">{ticketData.seat_number}</div>
              </div>
            </div>

            <div className="border-b-2 border-dashed border-black my-3"></div>

            <div className="text-lg font-black mb-1 flex items-center gap-1.5">
              <Popcorn className="w-4 h-4" />
              팝콘 수령 정보
            </div>
            <div className="text-sm font-bold whitespace-pre-wrap leading-relaxed">
              {getPopcornReceiptText(ticketData.popcorn_order)}
            </div>

            <div className="border-b-2 border-dashed border-black my-3"></div>

            <div className="text-center font-bold text-sm mb-2 mt-4">대구과학고등학교 영화대교</div>
            <div className="text-[11px] leading-relaxed mb-6 text-left font-bold">
              * 본 티켓은 1인 1매 한정으로 1회만 출력됩니다.<br />
              * 티켓 분실 시 재발권 및 팝콘 수령이 불가합니다.<br />
              * 팝콘 배부처에 본 티켓을 반드시 제시해 주세요.<br />
              * 원활한 관람을 위해 시작 전 입장 바랍니다.
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
                <div className="flex flex-col items-center mt-2 mb-4 w-full">
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