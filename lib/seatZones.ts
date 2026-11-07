// 폰 좌석 화면의 구역 나누기와 남은 좌석 계산(순수 함수).
// 좌석 번호는 seatGrid.ts computeSeatId만 쓴다. 구역은 칸을 거르기만 한다.
import { computeSeatId, getGridCols, getGridRows } from './seatGrid.ts';

export type ZoneKey = 'L' | 'R' | 'FL' | 'FC' | 'FR' | 'BL' | 'BC' | 'BR';
export type Zone = {
  key: ZoneKey;
  rowStart: number; rowEnd: number;
  colStart: number; colEnd: number;
  gridRow: 0 | 1;
  gridCol: 0 | 1 | 2;
};
export type ZoneCell = { rowIndex: number; colIndex: number; seatId: string | null };

export function getZones(isGrandHall: boolean): Zone[] {
  if (!isGrandHall) {
    const lastRow = getGridRows(false).length - 1;
    return [
      { key: 'L', rowStart: 0, rowEnd: lastRow, colStart: 0, colEnd: 6, gridRow: 0, gridCol: 0 },
      { key: 'R', rowStart: 0, rowEnd: lastRow, colStart: 7, colEnd: 13, gridRow: 0, gridCol: 1 },
    ];
  }
  const lastRow = getGridRows(true).length - 1;
  return [
    { key: 'FL', rowStart: 0, rowEnd: 7, colStart: 0, colEnd: 8, gridRow: 0, gridCol: 0 },
    { key: 'FC', rowStart: 0, rowEnd: 7, colStart: 9, colEnd: 17, gridRow: 0, gridCol: 1 },
    { key: 'FR', rowStart: 0, rowEnd: 7, colStart: 18, colEnd: 26, gridRow: 0, gridCol: 2 },
    { key: 'BL', rowStart: 8, rowEnd: lastRow, colStart: 0, colEnd: 8, gridRow: 1, gridCol: 0 },
    { key: 'BC', rowStart: 8, rowEnd: lastRow, colStart: 9, colEnd: 17, gridRow: 1, gridCol: 1 },
    { key: 'BR', rowStart: 8, rowEnd: lastRow, colStart: 18, colEnd: 26, gridRow: 1, gridCol: 2 },
  ];
}

export function seatsInZone(isGrandHall: boolean, zone: Zone): ZoneCell[][] {
  const rows: ZoneCell[][] = [];
  for (let r = zone.rowStart; r <= zone.rowEnd; r++) {
    const row: ZoneCell[] = [];
    for (let c = zone.colStart; c <= zone.colEnd; c++) {
      row.push({ rowIndex: r, colIndex: c, seatId: computeSeatId(isGrandHall, r, c) });
    }
    rows.push(row);
  }
  return rows;
}

export function zoneOf(isGrandHall: boolean, seatId: string): ZoneKey | null {
  for (const zone of getZones(isGrandHall)) {
    for (const row of seatsInZone(isGrandHall, zone)) {
      if (row.some((cell) => cell.seatId === seatId)) return zone.key;
    }
  }
  return null;
}

// zone이 null이면 전체. 예매·대기(taken)는 빼고, VIP는 동아리원만 센다. 불편 좌석은 센다.
export function countBookable(
  isGrandHall: boolean,
  zone: Zone | null,
  taken: Set<string>,
  vipSeats: Set<string>,
  viewerIsClubMember: boolean
): number {
  const zones = zone ? [zone] : getZones(isGrandHall);
  let count = 0;
  for (const z of zones) {
    for (const row of seatsInZone(isGrandHall, z)) {
      for (const { seatId } of row) {
        if (!seatId || taken.has(seatId)) continue;
        if (vipSeats.has(seatId) && !viewerIsClubMember) continue;
        count++;
      }
    }
  }
  return count;
}

// 내 좌석 > 선택 중이던 좌석 > 첫 구역
export function initialZone(isGrandHall: boolean, mySeat: string | null, pendingSeat: string | null): ZoneKey {
  for (const seat of [mySeat, pendingSeat]) {
    if (!seat) continue;
    const key = zoneOf(isGrandHall, seat);
    if (key) return key;
  }
  return getZones(isGrandHall)[0].key;
}
