"use client";

import { useEffect } from 'react';
import { analyzePopcorn } from './reservationView';
import { Archive, Crown, Hourglass, Popcorn, Printer, ScrollText, Star } from 'lucide-react';

interface Props {
  onLoad: () => void;
  movieHistory: any[];
  selectedHistoryMovie: any;
  onSelectHistoryMovie: (movie: any) => void;
  historyReservations: any[];
  historyReviews: any[];
  onDeleteReview: (review: any) => void;
  logs: any[];
}

export default function HistoryTab(props: Props) {
  const { onLoad, movieHistory, selectedHistoryMovie, onSelectHistoryMovie, historyReservations, historyReviews, onDeleteReview, logs } = props;

  useEffect(() => { onLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700">
        <h2 className="text-xl font-bold text-neutral-300 mb-4 flex items-center gap-1.5"><Archive className="w-5 h-5" /> 회차 이력 (지난 상영 목록)</h2>
        <div className="space-y-2 mb-6">
          {movieHistory.length === 0 && <p className="text-neutral-500 text-sm">지난 회차 이력이 없습니다.</p>}
          {movieHistory.map((movie) => (
            <button
              key={movie.id}
              onClick={() => onSelectHistoryMovie(movie)}
              className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${selectedHistoryMovie?.id === movie.id ? 'bg-neutral-700 border-neutral-400' : 'bg-neutral-900/60 border-neutral-700 hover:bg-neutral-700/60'}`}
            >
              <span className="font-bold text-white">{movie.title}</span>
              <span className="text-neutral-400 text-sm ml-2">{movie.date_string} · {movie.venue}</span>
            </button>
          ))}
        </div>

        {selectedHistoryMovie && (
          <div className="bg-neutral-900 rounded-xl overflow-x-auto border border-neutral-700">
            <h3 className="text-lg font-bold text-neutral-200 p-4 border-b border-neutral-700">
              [{selectedHistoryMovie.title}] 예매 내역 <span className="text-sm text-neutral-500 font-normal ml-2">(읽기 전용)</span>
            </h3>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-neutral-700 text-neutral-300">
                <tr>
                  <th className="p-4">상태</th>
                  <th className="p-4">좌석</th>
                  <th className="p-4">학번/이름</th>
                  <th className="p-4">결제/팝콘</th>
                  <th className="p-4 text-center">발권 여부</th>
                </tr>
              </thead>
              <tbody>
                {historyReservations.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-neutral-500">예매 내역이 없습니다.</td></tr>}
                {historyReservations.map((ticket) => {
                  const { arr, totalPrice, summary } = analyzePopcorn(ticket.popcorn_order);
                  return (
                    <tr key={ticket.id} className="border-b border-neutral-800 hover:bg-neutral-800">
                      <td className="p-4">
                        {ticket.payment_status === 'group_pending' ? (
                          <span className="bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded border border-yellow-600 font-bold text-xs inline-flex items-center gap-1"><Hourglass className="w-3.5 h-3.5" /> 단체 대기</span>
                        ) : (
                          <span className="bg-green-600/20 text-green-500 px-2 py-1 rounded border border-green-600 font-bold">확정됨</span>
                        )}
                        {ticket.is_group_leader && <span className="ml-1 text-emerald-400 text-xs font-bold inline-flex items-center"><Crown className="w-3.5 h-3.5" /></span>}
                      </td>
                      <td className="p-4 font-bold text-lg">{ticket.seat_number}</td>
                      <td className="p-4">{ticket.student_id ?? '교직원'} <span className="text-orange-300 font-bold">{ticket.student_name}</span></td>
                      <td className="p-4">
                        {arr.length > 0 ? (
                          <div className="flex flex-col">
                            <span className="text-yellow-400 font-bold text-sm tracking-widest">{totalPrice.toLocaleString()}원</span>
                            <span className="text-neutral-400 text-xs mt-1 flex items-center gap-1.5"><Popcorn className="w-3.5 h-3.5" /> {summary}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-500 text-sm">무료 관람 (0원)</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {ticket.is_printed ? (
                          <span className="text-orange-400 font-bold border border-orange-600 bg-orange-900/30 px-3 py-1 rounded-lg text-xs tracking-wider inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> 발권 완료</span>
                        ) : (
                          <span className="text-neutral-500 font-bold text-sm">미발권</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedHistoryMovie && (
          <div className="bg-neutral-900 rounded-xl overflow-x-auto border border-neutral-700 mt-4">
            <h3 className="text-lg font-bold text-neutral-200 p-4 border-b border-neutral-700">
              [{selectedHistoryMovie.title}] 평점/후기 <span className="text-sm text-neutral-500 font-normal ml-2">(관리자 삭제 가능)</span>
            </h3>
            {historyReviews.length === 0 ? (
              <p className="p-8 text-center text-neutral-500 text-sm">등록된 후기가 없습니다.</p>
            ) : (
              <div className="divide-y divide-neutral-800">
                {historyReviews.map((review: any) => (
                  <div key={review.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold text-sm">{review.user_name ?? review.profiles?.email ?? '알 수 없음'}</span>
                        <span className="text-amber-400 font-bold text-sm flex items-center gap-1"><Star className="w-4 h-4" fill="currentColor" /> {review.rating}</span>
                      </div>
                      <p className="text-neutral-300 text-sm whitespace-pre-wrap">{review.content}</p>
                    </div>
                    <button onClick={() => onDeleteReview(review)} className="shrink-0 text-red-400 hover:text-red-300 font-bold text-xs border border-red-800 hover:border-red-600 rounded px-2 py-1">삭제</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-xl max-h-[500px] overflow-y-auto">
        <h2 className="text-xl font-bold text-orange-400 mb-4 sticky top-0 bg-neutral-900 py-2 border-b border-neutral-800 flex items-center gap-1.5">
          <ScrollText className="w-5 h-5" /> 시스템 활동 로그 <span className="text-sm text-neutral-500 font-normal ml-2">(최근 100건)</span>
        </h2>
        <div className="space-y-1 font-mono text-[13px] md:text-sm">
          {logs.length === 0 && <p className="text-neutral-500">기록된 로그가 없습니다.</p>}
          {logs.map((log) => {
            const d = new Date(log.created_at);
            const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            return (
              <div key={log.id} className="text-neutral-300 border-b border-neutral-800 py-2 hover:bg-neutral-800 flex flex-wrap gap-2">
                <span className="text-neutral-500 min-w-[150px]">{dateStr}</span>
                <span className="text-yellow-400 w-[45px] font-bold">{log.student_id ?? '교직원'}</span>
                <span className="text-orange-300 w-[60px]">{log.student_name}</span>
                <span className="text-white font-bold">{log.description}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
