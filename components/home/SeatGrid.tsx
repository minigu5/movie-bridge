// 예매 홈 좌석표. zone이 null이면 전체 배치(PC), 있으면 그 구역만(폰). 줄 글자는 쓰지 않는다.
// 좌석 번호는 seatGrid.ts computeSeatId만 쓰고, 구역은 칸을 거르기만 한다.
import type { CSSProperties } from 'react';
import { computeSeatId, getGridCols, getGridRows } from '@/lib/seatGrid';
import type { Zone } from '@/lib/seatZones';

export type SeatVisual = 'empty' | 'selected' | 'taken' | 'pending' | 'groupPending' | 'groupLeader' | 'groupMember';

export type SeatState = { visual: SeatVisual; label: string; vip: boolean; defective: boolean };

type Props = {
  isGrandHall: boolean;
  zone: Zone | null;
  seatState(seatId: string): SeatState;
  onSeatClick?(seatId: string): void;
  disabled?: boolean;
  size: 'pc' | 'phone';
};

type Cell = { key: string; seatId: string | null; aisleAfter: boolean };

const STATE_TEXT: Record<SeatVisual, string> = {
  empty: '',
  selected: '선택함',
  taken: '예매됨',
  pending: '결제 대기',
  groupPending: '단체 확인 중',
  groupLeader: '단체 리더',
  groupMember: '단체 멤버',
};

const PENDING_STRIPES = 'repeating-linear-gradient(135deg, #2A2A2E 0 4px, #333338 4px 8px)';

function seatClass(s: SeatState, interactive: boolean): string {
  const lit = s.visual === 'selected' || s.visual === 'groupLeader';
  if (lit) return 'bg-accent text-white border border-accent font-black';
  if (s.visual === 'groupMember') return 'bg-seat text-accent border-2 border-accent font-black';
  const busy = interactive ? 'cursor-not-allowed' : '';
  if (s.visual === 'taken' || s.visual === 'pending') return `bg-taken text-mute border border-taken font-bold ${busy}`;
  if (s.visual === 'groupPending') return `bg-taken text-mute border border-dashed border-line-bold font-bold ${busy}`;
  // 빈 좌석: 동아리 전용은 2px 흰 테두리, 불편 좌석은 점선(둘 다면 2px 흰 점선)
  const width = s.vip ? 'border-2' : 'border';
  const color = s.vip ? 'border-ink text-ink' : s.defective ? 'border-dim text-dim' : 'border-line-bold text-sub';
  const hover = interactive ? 'hover:bg-raised' : '';
  return `bg-seat font-bold ${width} ${color} ${s.defective ? 'border-dashed' : ''} ${hover}`;
}

export default function SeatGrid({ isGrandHall, zone, seatState, onSeatClick, disabled, size }: Props) {
  const rowCount = getGridRows(isGrandHall).length;
  const colCount = getGridCols(isGrandHall).length;
  const rowStart = zone ? zone.rowStart : 0;
  const rowEnd = zone ? zone.rowEnd : rowCount - 1;
  const colStart = zone ? zone.colStart : 0;
  const colEnd = zone ? zone.colEnd : colCount - 1;
  const cols = colEnd - colStart + 1;

  // 칸 크기와 간격. 통로 간격은 전체 배치(PC)에서만 둔다.
  const cfg = size === 'pc'
    ? (isGrandHall ? { w: 36, h: 44, gap: 3, aisle: 24, font: 11, nameFont: 10 } : { w: 48, h: 56, gap: 4, aisle: 44, font: 15, nameFont: 13 })
    : (isGrandHall ? { w: 37, h: 44, gap: 2, aisle: 0, font: 11, nameFont: 10 } : { w: 46, h: 46, gap: 5, aisle: 0, font: 13, nameFont: 11 });
  const isAisleCol = (c: number) => !zone && (isGrandHall ? c === 8 || c === 17 : c === 6);
  const aisleCount = zone ? 0 : isGrandHall ? 2 : 1;
  const gapsTotal = (cols - 1) * cfg.gap + aisleCount * cfg.aisle;
  // 대강당 전체 배치(27칸)는 본문 폭(1040)보다 넓어 본문 좌우 여백(40씩)까지 쓴다.
  const bleed = size === 'pc' && isGrandHall && !zone;
  // 화면이 좁으면 칸 폭을 줄이되 36px 아래로는 내리지 않는다. PC는 본문 좌우 여백(80) + 스크롤바 여유(16).
  const sidePad = size === 'pc' ? (bleed ? 16 : 96) : 32;
  const cellWidth = `max(36px, min(${cfg.w}px, calc((100vw - ${sidePad + gapsTotal}px) / ${cols})))`;

  const rows: Cell[][] = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    const row: Cell[] = [];
    for (let c = colStart; c <= colEnd; c++) {
      row.push({ key: `${r}-${c}`, seatId: computeSeatId(isGrandHall, r, c), aisleAfter: isAisleCol(c) });
    }
    rows.push(row);
  }
  // 대강당 전체 배치는 H행(8번째 줄) 뒤에 통로를 둔다.
  const rowGapAfter = (r: number) => !zone && isGrandHall && r === 7;

  // 스크린: 전체 배치는 70% 폭, 구역 화면은 100% 폭. 옆 구역이면 가운데 쪽이 밝다.
  const side: 'left' | 'right' | 'center' = !zone
    ? 'center'
    : isGrandHall
      ? (zone.gridCol === 0 ? 'left' : zone.gridCol === 2 ? 'right' : 'center')
      : (zone.gridCol === 0 ? 'left' : 'right');
  const screenBg = side === 'right'
    ? 'linear-gradient(90deg, #F2F2F0 0%, #F2F2F0 40%, rgba(242, 242, 240, 0.15) 100%)'
    : side === 'left'
      ? 'linear-gradient(270deg, #F2F2F0 0%, #F2F2F0 40%, rgba(242, 242, 240, 0.15) 100%)'
      : '#F2F2F0';
  const screenLabel = side === 'right' ? '← 스크린 가운데' : side === 'left' ? '스크린 가운데 →' : '스크린';
  const interactive = !!onSeatClick && !disabled;

  return (
    <div className={`overflow-x-auto ${bleed ? '-mx-10' : 'w-full'}`}>
      <div className="w-max mx-auto flex flex-col items-center py-2" style={{ gap: cfg.gap + 1 }}>
        <div
          className={`flex flex-col gap-2 ${zone ? 'w-full mb-2.5' : 'w-[70%] mb-8'} ${side === 'right' ? 'items-start' : side === 'left' ? 'items-end' : 'items-center'}`}
        >
          <span className="block w-full h-[3px] rounded-sm" style={{ background: screenBg }} />
          <span className={`text-dim ${zone ? 'text-[11px] tracking-[0.3em]' : 'text-xs tracking-[0.6em] ml-[0.6em]'}`}>{screenLabel}</span>
        </div>

        {rows.map((row, ri) => (
          <div key={ri} className="flex items-center" style={{ gap: cfg.gap, marginBottom: rowGapAfter(rowStart + ri) ? 18 : undefined }}>
            {row.map(cell => {
              const cellStyle: CSSProperties = { width: cellWidth, height: cfg.h, marginRight: cell.aisleAfter ? cfg.aisle : undefined };
              if (!cell.seatId) return <div key={cell.key} aria-hidden style={cellStyle} />;
              const seatId = cell.seatId;
              const s = seatState(seatId);
              const isName = s.label !== seatId;
              const style: CSSProperties = {
                ...cellStyle,
                fontSize: isName ? cfg.nameFont : cfg.font,
                backgroundImage: s.visual === 'pending' ? PENDING_STRIPES : undefined,
              };
              const desc = [seatId, STATE_TEXT[s.visual], s.vip ? '동아리 전용' : '', s.defective ? '불편 좌석' : ''].filter(Boolean).join(' · ');
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={!interactive}
                  onClick={interactive ? () => onSeatClick!(seatId) : undefined}
                  aria-label={isName ? `${desc} · ${s.label}` : desc}
                  aria-pressed={s.visual === 'selected' || undefined}
                  style={style}
                  className={`flex items-center justify-center p-0 box-border rounded-t-[10px] rounded-b-[5px] tracking-[-0.04em] whitespace-nowrap overflow-hidden transition-colors disabled:cursor-default ${seatClass(s, interactive)}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
