"use client";

import { useMemo } from 'react';
import { getGridRows, getGridCols, computeSeatId } from '@/lib/seatGrid';

interface Props {
  hall: 'mid' | 'grand';
  onHallChange: (h: 'mid' | 'grand') => void;
  seats: string[];
  onSeatsChange: (seats: string[]) => void;
}

export default function DefectiveSeatPicker({ hall, onHallChange, seats, onSeatsChange }: Props) {
  const isGrand = hall === 'grand';
  const rows = useMemo(() => getGridRows(isGrand), [isGrand]);
  const cols = useMemo(() => getGridCols(isGrand), [isGrand]);
  const selected = useMemo(() => new Set(seats), [seats]);

  // 중강당 ID(A01)와 대강당 ID(A001)는 자릿수가 달라 겹치지 않는다.
  const hallSeats = seats.filter((id) => id.length === (isGrand ? 4 : 3));

  const toggle = (seatId: string) => {
    onSeatsChange(selected.has(seatId) ? seats.filter((id) => id !== seatId) : [...seats, seatId]);
  };

  return (
    <div className="bg-neutral-900/60 rounded-lg border border-neutral-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => onHallChange('mid')}
          className={`px-3 py-1.5 rounded text-xs font-bold ${hall === 'mid' ? 'bg-amber-600 text-white' : 'bg-neutral-700 text-neutral-300'}`}
        >
          중강당 (14×9)
        </button>
        <button
          type="button"
          onClick={() => onHallChange('grand')}
          className={`px-3 py-1.5 rounded text-xs font-bold ${hall === 'grand' ? 'bg-pink-600 text-white' : 'bg-neutral-700 text-neutral-300'}`}
        >
          대강당 (27×18)
        </button>
        <span className="text-xs text-neutral-500 ml-auto">좌석을 클릭해 하자 좌석 지정/해제</span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-block">
          <div className="flex">
            <div className="w-5 shrink-0" />
            {cols.map((c) => (
              <div key={c} className="w-[22px] shrink-0 text-center text-[9px] text-neutral-500 leading-4">{c}</div>
            ))}
          </div>
          {rows.map((rowChar, ri) => (
            <div key={rowChar} className="flex">
              <div className="w-5 shrink-0 text-center text-[10px] text-neutral-500 leading-[22px]">{rowChar}</div>
              {cols.map((colNum, ci) => {
                const seatId = computeSeatId(isGrand, ri, ci);
                const isDefective = !!seatId && selected.has(seatId);
                return (
                  <button
                    key={colNum}
                    type="button"
                    disabled={!seatId}
                    onClick={() => seatId && toggle(seatId)}
                    className={[
                      'w-[22px] h-[22px] shrink-0 border border-neutral-800 text-[0px]',
                      !seatId ? 'bg-transparent cursor-default' : isDefective ? 'bg-red-500/80' : 'bg-neutral-700 hover:bg-neutral-600',
                    ].join(' ')}
                    aria-label={seatId ? `${seatId}${isDefective ? ' (하자)' : ''}` : undefined}
                    aria-pressed={isDefective}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 text-sm">
        <span className="font-bold text-white">하자 좌석 {hallSeats.length}석</span>
        {hallSeats.length > 0 && (
          <span className="text-neutral-400"> · {[...hallSeats].sort().join(', ')}</span>
        )}
      </div>
    </div>
  );
}
