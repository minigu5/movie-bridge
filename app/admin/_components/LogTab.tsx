"use client";

import { useEffect, type ReactNode } from 'react';
import { Star } from 'lucide-react';
import { analyzePopcorn, POPCORN_NAMES, type AdminReservation } from './reservationView';

export type HistoryMovie = { id: number; title: string; date_string?: string | null; venue?: string | null };
export type HistoryReview = { id: string | number; user_name?: string | null; profiles?: { email?: string | null } | null; rating: number; content: string };
export type AdminLog = { id: string | number; created_at: string; student_id?: string | null; student_name?: string | null; description: string };

interface Props {
  onLoad: () => void;
  movieHistory: HistoryMovie[];
  selectedHistoryMovie: HistoryMovie | null;
  onSelectHistoryMovie: (movie: HistoryMovie) => void;
  historyReservations: AdminReservation[];
  historyReviews: HistoryReview[];
  onDeleteReview: (review: HistoryReview) => void;
  // 지우기를 누르고 5초 되돌리기 중인 후기
  pendingDeleteIds: Set<string>;
  deleteSecondsLeft: (id: string) => number;
  onUndoDelete: (id: string) => void;
  logs: AdminLog[];
}

const COLS = 'grid-cols-[56px_120px_minmax(120px,1fr)_100px_64px]';
const STATUS_LABEL: Record<string, string> = { confirmed: '확정', pending: '승인 대기' };

const popcornText = (order: string | null | undefined) => {
  const { arr, counts, totalPrice } = analyzePopcorn(order);
  if (arr.length === 0) return '팝콘 없음';
  return `${Object.entries(counts).map(([k, c]) => `${POPCORN_NAMES[k] ?? k} ${c}`).join(', ')} · ${totalPrice.toLocaleString()}원`;
};

const pad = (n: number) => String(n).padStart(2, '0');
const logTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function Heading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <h2 className="text-base font-black border-b border-ink pb-2.5">
      {children} {sub !== undefined && <span className="text-xs font-medium text-dim">{sub}</span>}
    </h2>
  );
}

export default function LogTab(props: Props) {
  const { onLoad, movieHistory, selectedHistoryMovie, onSelectHistoryMovie, historyReservations, historyReviews, onDeleteReview, pendingDeleteIds, deleteSecondsLeft, onUndoDelete, logs } = props;

  useEffect(() => { onLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-[1020px] flex flex-col gap-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-[28px] font-black tracking-[-0.02em]">기록</h1>
        <p className="text-sm text-dim">지난 회차의 예매와 후기, 활동 기록을 봅니다.</p>
      </div>

      <section className="flex flex-col gap-3">
        <Heading sub={`${movieHistory.length}회`}>지난 회차</Heading>
        <div className="flex flex-col">
          {movieHistory.length === 0 && <p className="py-8 text-sm text-mute border-b border-line">지난 회차가 없어요.</p>}
          {movieHistory.map((movie) => {
            const on = selectedHistoryMovie?.id === movie.id;
            return (
              <button
                key={movie.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelectHistoryMovie(movie)}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-4 min-h-[52px] px-3 py-2.5 text-left border-b border-line ${on ? 'bg-raised' : 'hover:bg-card'}`}
              >
                <span className={`text-[15px] ${on ? 'font-black' : 'font-bold'}`}>{movie.title}</span>
                <span className="text-[13px] text-dim">{movie.date_string} · {String(movie.venue ?? '').replace('대구과학고등학교 ', '')}</span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedHistoryMovie && (
        <section className="flex flex-col gap-3">
          <Heading sub={`${historyReservations.length}건 · 읽기 전용`}>「{selectedHistoryMovie.title}」 예매</Heading>
          <div className="hidden md:block overflow-x-auto">
            <div className="min-w-[600px] flex flex-col">
              <div className={`grid ${COLS} gap-3 px-3 py-2.5 text-xs text-dim border-b border-line`}>
                <span>좌석</span><span>이름</span><span>팝콘</span><span>상태</span><span>발권</span>
              </div>
              {historyReservations.length === 0 && <p className="py-8 text-center text-sm text-mute border-b border-line">예매가 없어요.</p>}
              {historyReservations.map((t) => (
                <div key={t.id} className={`grid ${COLS} gap-3 items-center min-h-12 px-3 border-b border-line`}>
                  <span className="text-[15px] font-black">{t.seat_number}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate">{t.student_name}</span>
                    <span className="text-xs text-dim">{t.student_id ?? '교직원'}</span>
                  </span>
                  <span className="text-[13px] text-sub truncate">{popcornText(t.popcorn_order)}</span>
                  <span className="text-[13px] text-sub whitespace-nowrap">{STATUS_LABEL[t.payment_status] ?? t.payment_status}</span>
                  <span className={`text-[13px] whitespace-nowrap ${t.is_printed ? 'text-ink' : 'text-mute'}`}>{t.is_printed ? '발권함' : '—'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:hidden flex flex-col">
            {historyReservations.length === 0 && <p className="py-8 text-center text-sm text-mute border-b border-line">예매가 없어요.</p>}
            {historyReservations.map((t) => (
              <div key={t.id} className="flex items-center gap-3.5 min-h-[60px] border-b border-line">
                <span className="shrink-0 w-[52px] text-base font-black">{t.seat_number}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-bold truncate">{t.student_name} <span className="text-xs font-normal text-dim">{t.student_id ?? '교직원'}</span></span>
                  <span className="text-xs text-sub truncate">{STATUS_LABEL[t.payment_status] ?? t.payment_status}{t.is_printed ? ' · 발권함' : ''} <span className="text-dim">· {popcornText(t.popcorn_order)}</span></span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedHistoryMovie && (
        <section className="flex flex-col gap-3">
          <Heading sub={`${historyReviews.length}개`}>「{selectedHistoryMovie.title}」 후기</Heading>
          <div className="flex flex-col">
            {historyReviews.length === 0 && <p className="py-8 text-center text-sm text-mute border-b border-line">후기가 없어요.</p>}
            {historyReviews.map((review) => {
              const who = review.user_name ?? review.profiles?.email ?? '알 수 없음';
              if (pendingDeleteIds.has(String(review.id))) {
                return (
                  <div key={review.id} className="flex items-center justify-between gap-3 min-h-[52px] px-3 py-2 bg-card border-b border-line">
                    <span className="text-[13px] text-sub break-keep"><b className="text-ink">{who}</b>님의 후기를 지웠어요.</span>
                    <button type="button" onClick={() => onUndoDelete(String(review.id))} className="shrink-0 h-[34px] px-3.5 border border-ink text-ink text-[13px] font-bold whitespace-nowrap">
                      되돌리기 · {deleteSecondsLeft(String(review.id))}
                    </button>
                  </div>
                );
              }
              return (
                <div key={review.id} className="flex items-start justify-between gap-4 px-3 py-3.5 border-b border-line">
                  <div className="min-w-0 flex flex-col gap-1">
                    <span className="flex items-center gap-2 text-sm">
                      <b>{who}</b>
                      <span className="inline-flex items-center gap-1 text-sub"><Star className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />{review.rating}</span>
                    </span>
                    <p className="text-[13px] leading-relaxed text-sub whitespace-pre-wrap break-keep">{review.content}</p>
                  </div>
                  <button type="button" onClick={() => onDeleteReview(review)} className="shrink-0 h-9 pl-3.5 border-l border-line text-danger text-[13px] font-bold">지우기</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <Heading sub="최근 100건">활동 기록</Heading>
        <div className="flex flex-col max-h-[500px] overflow-y-auto">
          {logs.length === 0 && <p className="py-8 text-sm text-mute border-b border-line">기록이 없어요.</p>}
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-2.5 border-b border-line text-[13px]">
              <span className="text-dim tabular-nums whitespace-nowrap">{logTime(log.created_at)}</span>
              <span className="text-sub whitespace-nowrap">{log.student_id ?? '교직원'} {log.student_name}</span>
              <span className="text-ink">{log.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
