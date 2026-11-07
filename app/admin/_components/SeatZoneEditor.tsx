"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getGridRows, getGridCols, computeSeatId, computeVipSeats } from '@/lib/seatGrid';

export type Zone = { startRow: string; endRow: string; startCol: number; endCol: number };
type Cell = { row: string; col: number };
type Tool = 'vip' | 'defective';

interface Props {
  isGrandHall: boolean;
  vipEnabled: boolean;
  onVipEnabledChange(v: boolean): void;
  zone: Zone;
  onZoneChange(z: Zone): void;
  defective: string[];
  onDefectiveChange(ids: string[]): void;
}

const clampRow = (r: string | undefined) => (r && /^[A-Z]$/.test(r) ? r : 'A');
const clampCol = (c: number | undefined) => (Number.isFinite(c) && (c as number) > 0 ? (c as number) : 1);

// 두 모서리 칸 → 네모 하나(동아리 전용은 네모 하나로 저장한다)
const zoneFromCorners = (a: Cell, b: Cell): Zone => {
  const [sr, er] = a.row.charCodeAt(0) <= b.row.charCodeAt(0) ? [a.row, b.row] : [b.row, a.row];
  return { startRow: sr, endRow: er, startCol: Math.min(a.col, b.col), endCol: Math.max(a.col, b.col) };
};

const inZone = (z: Zone, row: string, col: number) =>
  row.charCodeAt(0) >= z.startRow.charCodeAt(0) &&
  row.charCodeAt(0) <= z.endRow.charCodeAt(0) &&
  col >= z.startCol && col <= z.endCol;

// 좌석 지정 하나로: 동아리 전용(끌어서 네모) + 불편 좌석(칸 토글). 상영관은 prop만 따른다.
export default function SeatZoneEditor({ isGrandHall, vipEnabled, onVipEnabledChange, zone, onZoneChange, defective, onDefectiveChange }: Props) {
  const rows = useMemo(() => getGridRows(isGrandHall), [isGrandHall]);
  const cols = useMemo(() => getGridCols(isGrandHall), [isGrandHall]);
  const [toolState, setTool] = useState<Tool>('vip');
  const tool: Tool = vipEnabled ? toolState : 'defective';
  const [drag, setDragState] = useState<{ from: Cell; to: Cell } | null>(null);
  const dragRef = useRef<{ from: Cell; to: Cell } | null>(null);
  const setDrag = (d: { from: Cell; to: Cell } | null) => { dragRef.current = d; setDragState(d); };

  const z: Zone = drag ? zoneFromCorners(drag.from, drag.to) : {
    startRow: clampRow(zone.startRow), endRow: clampRow(zone.endRow),
    startCol: clampCol(zone.startCol), endCol: clampCol(zone.endCol),
  };
  const defectiveSet = useMemo(() => new Set(defective), [defective]);
  // 중강당 ID(A01)와 대강당 ID(A001)는 자릿수가 달라 겹치지 않는다.
  const hallDefective = defective.filter((id) => id.length === (isGrandHall ? 4 : 3));

  // 구역(A/B/C)이 바뀌는 열 다음에 통로를 둔다.
  const aisleAfter = useMemo(() => new Set(cols.filter((_, ci) =>
    ci < cols.length - 1 && computeSeatId(isGrandHall, 0, ci)?.[0] !== computeSeatId(isGrandHall, 0, ci + 1)?.[0]
  )), [cols, isGrandHall]);

  // 홈 화면과 같은 계산(computeVipSeats)으로 센다. 끝이 시작보다 앞인 저장값(예: A3~A2)은 0석이다.
  const p = isGrandHall ? 'grand' : 'mid';
  const vipCount = computeVipSeats(isGrandHall, rows, cols, {
    [`${p}_vip_start_row`]: z.startRow, [`${p}_vip_end_row`]: z.endRow,
    [`${p}_vip_start_col`]: z.startCol, [`${p}_vip_end_col`]: z.endCol,
  }).size;
  const vipDetail = vipCount > 0 ? `${vipCount}석 · ${z.startRow}${z.startCol}~${z.endRow}${z.endCol}` : '0석 · 범위 없음';

  const cellFromPoint = (x: number, y: number): Cell | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-cell]') as HTMLElement | null;
    if (!el) return null;
    return { row: el.dataset.row!, col: Number(el.dataset.col) };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (tool !== 'vip') return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: cell, to: cell });
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell && (cell.row !== dragRef.current.to.row || cell.col !== dragRef.current.to.col)) {
      setDrag({ from: dragRef.current.from, to: cell });
    }
  };
  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    onZoneChange(zoneFromCorners(d.from, d.to));
  };

  const toggleDefective = (seatId: string) => {
    onDefectiveChange(defectiveSet.has(seatId) ? defective.filter((id) => id !== seatId) : [...defective, seatId]);
  };

  // 중강당은 폰(sm 미만)에서도 한 화면에 들어오게 칸을 줄인다. 대강당은 가로로 밀어 본다.
  const cell = isGrandHall ? 'w-[18px] h-[18px] rounded-[4px_4px_2px_2px]' : 'w-[19px] h-[19px] rounded-[5px_5px_2px_2px] sm:w-7 sm:h-7 sm:rounded-[7px_7px_3px_3px]';
  const gap = isGrandHall ? 'gap-0.5' : 'gap-[3px] sm:gap-1';
  const aisle = isGrandHall ? 'mr-3' : 'mr-4 sm:mr-5';

  return (
    <div className="flex flex-wrap gap-8 items-start">
      <div className="w-full sm:w-[220px] shrink-0 flex flex-col gap-3">
        <label className="flex items-center justify-between gap-3 px-3.5 py-3 border border-line cursor-pointer">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-bold">동아리 전용 좌석 두기</span>
            <span className="text-xs text-dim">끄면 이번 회차는 0석</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={vipEnabled}
            onChange={(e) => onVipEnabledChange(e.target.checked)}
            className="w-5 h-5 m-0 accent-[#F2F2F0]"
          />
        </label>
        <span className="text-[13px] text-sub">무엇을 지정할까요?</span>
        <div className="flex flex-col gap-1.5">
          {vipEnabled && (
            <ToolButton on={tool === 'vip'} onClick={() => setTool('vip')} swatch="border-2 border-current" label="동아리 전용 좌석" detail={vipDetail} />
          )}
          <ToolButton on={tool === 'defective'} onClick={() => setTool('defective')} swatch="border border-dashed border-current" label="불편 좌석" detail={`${hallDefective.length}석`} />
        </div>
        <span className="text-xs leading-relaxed text-mute break-keep">
          {vipEnabled ? '동아리 전용은 끌어서 네모로 잡아요. ' : ''}불편 좌석은 하나씩 눌러 켜고 끄며, 예매하는 사람에게 경고만 띄워요.
        </span>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="w-max mx-auto flex flex-col items-center gap-1 py-2">
          <div className="w-[70%] flex flex-col items-center gap-1.5 mb-3.5">
            <span className="block w-full h-[3px] bg-dim rounded-sm" />
            <span className="text-[11px] tracking-[0.6em] ml-[0.6em] text-mute">스크린</span>
          </div>
          <div
            className={`flex flex-col ${gap} select-none ${tool === 'vip' ? 'touch-none cursor-crosshair' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {rows.map((rowChar, ri) => (
              <div key={rowChar} className={`flex ${gap}`}>
                {cols.map((colNum, ci) => {
                  const seatId = computeSeatId(isGrandHall, ri, ci);
                  const vip = vipEnabled && inZone(z, rowChar, colNum);
                  const bad = !!seatId && defectiveSet.has(seatId);
                  const border = bad
                    ? `border border-dashed ${vip ? 'border-ink' : 'border-dim'}`
                    : vip ? 'border-2 border-ink' : 'border border-line-strong';
                  return (
                    <button
                      key={colNum}
                      type="button"
                      data-cell={seatId ? '' : undefined}
                      data-row={rowChar}
                      data-col={colNum}
                      disabled={!seatId}
                      tabIndex={tool === 'defective' && seatId ? 0 : -1}
                      onClick={() => { if (tool === 'defective' && seatId) toggleDefective(seatId); }}
                      aria-label={seatId ? `${seatId}${vip ? ' 동아리 전용' : ''}${bad ? ' 불편' : ''}` : undefined}
                      aria-pressed={tool === 'defective' && seatId ? bad : undefined}
                      className={`${cell} shrink-0 box-border bg-seat ${border} ${aisleAfter.has(colNum) ? aisle : ''} ${seatId ? '' : 'invisible'}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ on, onClick, swatch, label, detail }: { on: boolean; onClick(): void; swatch: string; label: string; detail: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-12 flex items-center gap-3 px-3.5 text-left text-sm font-bold border ${on ? 'bg-ink border-ink text-ground' : 'border-line-strong text-sub'}`}
    >
      <span className={`block w-4 h-4 box-border rounded-[5px_5px_2px_2px] shrink-0 ${swatch}`} />
      <span className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="truncate">{label}</span>
        <span className={`text-[11px] font-normal ${on ? 'text-line-bold' : 'text-mute'}`}>{detail}</span>
      </span>
    </button>
  );
}
