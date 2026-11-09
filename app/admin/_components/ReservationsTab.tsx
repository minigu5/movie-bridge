"use client";

import { useMemo, useState } from 'react';
import { analyzePopcorn, parseSeat, POPCORN_NAMES, STATUS_WEIGHT, type AdminReservation } from './reservationView';

type SortKey = 'seat' | 'name' | 'status' | 'printed';
type SortDir = 'asc' | 'desc';
type FilterKey = 'pending' | 'confirmed' | 'unprinted';

interface PopcornStats {
  original: number; consomme: number; caramel: number; none: number; cash: number;
}

interface Props {
  reservations: AdminReservation[];
  popcornStats: PopcornStats;
  clubMembers: { email: string }[];
  nameByEmail: Record<string, string>;
  movieTitle?: string;
  deadline?: string | null;
  onApprove: (ticket: AdminReservation) => void;
  onCancel: (ticket: AdminReservation) => void;
  onResetPrint: (ticket: AdminReservation) => void;
  // 취소를 누르고 5초 되돌리기 중인 예약
  pendingCancelIds: Set<string>;
  cancelSecondsLeft: (id: string) => number;
  onUndoCancel: (id: string) => void;
}

const TABLE_COLS = 'grid-cols-[56px_120px_minmax(160px,1fr)_100px_64px_220px]';

const STATUS_VIEW: Record<string, { label: string; cls: string }> = {
  pending: { label: '승인 대기', cls: 'text-accent' },
  confirmed: { label: '확정', cls: 'text-ink' },
};

// "예매 마감까지 n일 n시간". 마감이 없으면 null.
function deadlineText(deadline?: string | null): string | null {
  if (!deadline) return null;
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return null;
  const left = t - Date.now();
  if (left <= 0) return '예매 마감됨';
  const hours = Math.floor(left / 3600000);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  if (d > 0) return `예매 마감까지 ${d}일 ${h}시간`;
  if (h > 0) return `예매 마감까지 ${h}시간`;
  return `예매 마감까지 ${Math.max(1, Math.floor(left / 60000))}분`;
}

function popcornText(order: string | null | undefined, withPrice: boolean) {
  const { arr, counts, totalPrice } = analyzePopcorn(order);
  if (arr.length === 0) return '팝콘 없음';
  const kinds = Object.entries(counts).map(([k, c]) => `${POPCORN_NAMES[k] ?? k} ${c}`).join(', ');
  return withPrice ? `${kinds} · ${totalPrice.toLocaleString()}원` : kinds;
}

export default function ReservationsTab(props: Props) {
  const { reservations, popcornStats, clubMembers, nameByEmail, movieTitle, deadline, onApprove, onCancel, onResetPrint, pendingCancelIds, cancelSecondsLeft, onUndoCancel } = props;
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [query, setQuery] = useState('');

  const counts = useMemo(() => ({
    pending: reservations.filter(r => r.payment_status === 'pending').length,
    confirmed: reservations.filter(r => r.payment_status === 'confirmed').length,
    unprinted: reservations.filter(r => r.payment_status === 'confirmed' && !r.is_printed).length,
  }), [reservations]);

  // 이번 회차에 예매 행(대기 포함)이 하나도 없는 동아리원. 이름은 로그인 이력(profiles)이 있을 때만 알 수 있다.
  const unbookedMembers = useMemo(() => {
    const booked = new Set(reservations.map(r => String(r.email ?? '').toLowerCase()));
    return clubMembers
      .map(m => m.email.toLowerCase())
      .filter(email => !booked.has(email))
      .map(email => ({ email, name: nameByEmail[email] }))
      .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || (a.name ?? a.email).localeCompare(b.name ?? b.email));
  }, [reservations, clubMembers, nameByEmail]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const q = query.trim().toLowerCase();
    const bySeat = (a: AdminReservation, b: AdminReservation) => {
      const [as, an] = parseSeat(a.seat_number);
      const [bs, bn] = parseSeat(b.seat_number);
      return as.localeCompare(bs) || an - bn;
    };
    const visible = reservations.filter(r => {
      if (filter === 'unprinted' ? !(r.payment_status === 'confirmed' && !r.is_printed) : filter && r.payment_status !== filter) return false;
      if (!q) return true;
      return [r.student_name, r.student_id, r.seat_number, r.email].some(v => String(v ?? '').toLowerCase().includes(q));
    });
    return visible.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'seat') {
        cmp = bySeat(a, b);
      } else if (sortKey === 'name') {
        cmp = String(a.student_id ?? '').localeCompare(String(b.student_id ?? ''))
          || String(a.student_name ?? '').localeCompare(String(b.student_name ?? ''));
      } else if (sortKey === 'status') {
        cmp = (STATUS_WEIGHT[a.payment_status] ?? 9) - (STATUS_WEIGHT[b.payment_status] ?? 9);
      } else if (sortKey === 'printed') {
        cmp = (a.is_printed ? 1 : 0) - (b.is_printed ? 1 : 0);
      }
      // 같은 값끼리는 좌석순
      return cmp * dir || bySeat(a, b);
    });
  }, [reservations, sortKey, sortDir, filter, query]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };
  const toggleFilter = (k: FilterKey) => setFilter(f => (f === k ? null : k));
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const stats: { key: FilterKey; label: string; value: number; accent?: boolean }[] = [
    { key: 'pending', label: '승인 대기', value: counts.pending, accent: true },
    { key: 'confirmed', label: '확정', value: counts.confirmed },
    { key: 'unprinted', label: '아직 발권 안 함', value: counts.unprinted },
  ];
  const subtitle = [movieTitle ? `「${movieTitle}」` : null, deadlineText(deadline)].filter(Boolean).join(' · ');

  const UndoRow = ({ ticket }: { ticket: AdminReservation }) => (
    <div className="flex items-center justify-between gap-3 min-h-[52px] px-3 py-2 bg-card border-b border-line">
      <span className="text-[13px] text-sub min-w-0 break-keep">
        <b className="text-ink">{ticket.seat_number} {ticket.student_name}</b> 예매를 취소했어요. 취소 메일은 5초 뒤 나가요.
      </span>
      <button type="button" onClick={() => onUndoCancel(ticket.id)} className="shrink-0 h-[34px] px-3.5 border border-ink text-ink text-[13px] font-bold whitespace-nowrap">
        되돌리기 · {cancelSecondsLeft(ticket.id)}
      </button>
    </div>
  );

  const Actions = ({ ticket, phone }: { ticket: AdminReservation; phone?: boolean }) => (
    <>
      {ticket.payment_status === 'pending' && (
        <button type="button" onClick={() => onApprove(ticket)} className={`${phone ? 'h-10 px-3.5 text-sm' : 'h-9 px-4 text-[13px]'} bg-ink text-ground font-bold whitespace-nowrap`}>승인</button>
      )}
      {ticket.is_printed && (
        <button type="button" onClick={() => onResetPrint(ticket)} className={`${phone ? 'h-10 px-2.5 text-xs' : 'h-9 px-3 text-[13px]'} border border-line-strong text-ink font-bold whitespace-nowrap`}>발권 되돌리기</button>
      )}
      <button type="button" onClick={() => onCancel(ticket)} className={`${phone ? 'h-10 pl-2.5 pr-1' : 'h-9 pl-3.5 pr-2.5 ml-2.5'} border-l border-line text-danger text-[13px] font-bold whitespace-nowrap`}>취소</button>
    </>
  );

  return (
    <div className="flex flex-col gap-10">
      <section className="min-w-0 flex flex-col gap-[22px]">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl md:text-[28px] font-black tracking-[-0.02em]">예매</h1>
          {subtitle && <p className="text-sm text-dim">{subtitle}</p>}
        </div>

        <div className="grid grid-cols-3 border-t border-ink md:border-b md:border-line">
          {stats.map((s, i) => {
            const on = filter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFilter(s.key)}
                className={[
                  'flex flex-col items-start gap-1 px-3.5 py-3 md:px-4 md:py-3.5 text-left border-b border-line md:border-b-0',
                  i > 0 ? 'border-l border-line' : '',
                  on ? 'bg-raised' : 'hover:bg-card',
                ].join(' ')}
              >
                <span className="text-[11px] md:text-xs text-dim">{s.label}</span>
                <span className={`text-[22px] md:text-[28px] font-black leading-tight ${s.accent ? 'text-accent' : 'text-ink'}`}>{s.value}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
          <span className="text-[13px] text-sub">
            {filter || query
              ? <>{sorted.length} / {reservations.length}건 보는 중 · <button type="button" onClick={() => { setFilter(null); setQuery(''); }} className="underline underline-offset-4 decoration-line-strong text-ink">모두 보기</button></>
              : '승인 대기가 맨 위에 와요. 위 숫자를 누르면 그것만 보여요.'}
          </span>
          <label htmlFor="bk-q" className="sr-only">이름, 학번, 좌석 찾기</label>
          <input
            id="bk-q"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름 · 학번 · 좌석 찾기"
            className="w-full md:w-[240px] h-11 md:h-9 px-3.5 bg-card border border-line text-ink text-sm md:text-[13px] outline-none focus:border-line-bold placeholder:text-mute"
          />
        </div>

        {/* 넓은 화면: 표 */}
        <div className="hidden lg:block overflow-x-auto">
          <div className="min-w-[804px] flex flex-col">
            <div className={`grid ${TABLE_COLS} gap-3 px-3 py-2.5 text-xs text-dim border-b border-line select-none`}>
              <button type="button" onClick={() => toggleSort('seat')} className="text-left hover:text-ink whitespace-nowrap">좌석{arrow('seat')}</button>
              <button type="button" onClick={() => toggleSort('name')} className="text-left hover:text-ink whitespace-nowrap">이름{arrow('name')}</button>
              <span>팝콘</span>
              <button type="button" onClick={() => toggleSort('status')} className="text-left hover:text-ink whitespace-nowrap">상태{arrow('status')}</button>
              <button type="button" onClick={() => toggleSort('printed')} className="text-left hover:text-ink whitespace-nowrap">발권{arrow('printed')}</button>
              <span />
            </div>
            {sorted.length === 0 && <p className="px-3 py-10 text-center text-sm text-mute border-b border-line">예매가 없어요.</p>}
            {sorted.map((ticket) => {
              if (pendingCancelIds.has(ticket.id)) return <UndoRow key={ticket.id} ticket={ticket} />;
              const st = STATUS_VIEW[ticket.payment_status] ?? { label: ticket.payment_status, cls: 'text-sub' };
              return (
                <div key={ticket.id} className={`grid ${TABLE_COLS} gap-3 items-center min-h-14 px-3 border-b border-line`}>
                  <span className="text-[17px] font-black">{ticket.seat_number}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate">{ticket.student_name}</span>
                    <span className="text-xs text-dim">{ticket.student_id ?? '교직원'}</span>
                  </span>
                  <span className="text-[13px] text-sub whitespace-nowrap overflow-hidden text-ellipsis">{popcornText(ticket.popcorn_order, true)}</span>
                  <span className={`text-[13px] font-bold whitespace-nowrap ${st.cls}`}>
                    {st.label}
                  </span>
                  <span className={`text-[13px] whitespace-nowrap ${ticket.is_printed ? 'text-ink' : 'text-mute'}`}>{ticket.is_printed ? '발권함' : '—'}</span>
                  <span className="flex justify-end items-center gap-1.5"><Actions ticket={ticket} /></span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 좁은 화면: 한 줄 목록 */}
        <div className="lg:hidden flex flex-col">
          {sorted.length === 0 && <p className="py-10 text-center text-sm text-mute border-b border-line">예매가 없어요.</p>}
          {sorted.map((ticket) => {
            if (pendingCancelIds.has(ticket.id)) return <UndoRow key={ticket.id} ticket={ticket} />;
            const st = STATUS_VIEW[ticket.payment_status] ?? { label: ticket.payment_status, cls: 'text-sub' };
            return (
              <div key={ticket.id} className="flex items-center gap-3.5 min-h-[72px] border-b border-line">
                <span className="shrink-0 w-[52px] text-lg font-black">{ticket.seat_number}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-bold truncate">{ticket.student_name} <span className="text-xs font-normal text-dim">{ticket.student_id ?? '교직원'}</span></span>
                  <span className={`text-xs truncate ${ticket.payment_status === 'pending' ? 'text-accent' : 'text-sub'}`}>
                    {st.label}{ticket.is_printed ? ' · 발권함' : ''} <span className="text-dim">· {popcornText(ticket.popcorn_order, false)}</span>
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5"><Actions ticket={ticket} phone /></span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-black border-b border-ink pb-2">팝콘 <span className="text-xs font-medium text-dim">· 확정 기준</span></h2>
          <div className="flex flex-col text-[13px]">
            <span className="flex justify-between py-2 border-b border-line"><span className="text-sub">오리지널</span><b>{popcornStats.original}</b></span>
            <span className="flex justify-between py-2 border-b border-line"><span className="text-sub">콘소메</span><b>{popcornStats.consomme}</b></span>
            <span className="flex justify-between py-2 border-b border-line"><span className="text-sub">카라멜</span><b>{popcornStats.caramel}</b></span>
            <span className="flex justify-between py-2.5"><span className="text-sub">받을 돈</span><b className="text-base">{popcornStats.cash.toLocaleString()}원</b></span>
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-black border-b border-ink pb-2">아직 예매 안 한 동아리원 <span className="text-xs font-medium text-dim">{unbookedMembers.length}명</span></h2>
          {unbookedMembers.length === 0 ? (
            <p className="text-[13px] text-mute">{clubMembers.length === 0 ? '등록된 동아리원이 없어요.' : '모든 동아리원이 예매했어요.'}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unbookedMembers.map(m => (
                <span key={m.email} title={m.email} className="h-7 inline-flex items-center px-2.5 border border-line text-xs text-sub max-w-full truncate">
                  {m.name ?? m.email}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
