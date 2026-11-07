// 좌석 배치 계산 로직(현재/과거 상영 + 관리자 VIP 존 지정 공용)
// venue의 대강당 여부만 입력받는 순수 함수. app/page.tsx에서 추출.

export function getGridRows(isGrandHall: boolean): string[] {
  return isGrandHall
    ? ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R']
    : ['A','B','C','D','E','F','G','H','I'];
}

export function getGridCols(isGrandHall: boolean): number[] {
  return isGrandHall
    ? Array.from({ length: 27 }, (_, i) => i + 1)
    : Array.from({ length: 14 }, (_, i) => i + 1);
}

export function computeSeatId(isGrandHall: boolean, rowIndex: number, colIndex: number): string | null {
  if (!isGrandHall) {
    if (colIndex < 7) {
      const num = rowIndex * 7 + colIndex + 1;
      return `A${String(num).padStart(2, '0')}`;
    } else {
      const num = rowIndex * 7 + (colIndex - 7) + 1;
      if (num === 63) return null;
      return `B${String(num).padStart(2, '0')}`;
    }
  } else {
    if (colIndex < 9) {
      const num = rowIndex * 9 + colIndex + 1;
      return `A${String(num).padStart(3, '0')}`;
    } else if (colIndex < 18) {
      const num = rowIndex * 9 + (colIndex - 9) + 1;
      return `B${String(num).padStart(3, '0')}`;
    } else {
      const num = rowIndex * 9 + (colIndex - 18) + 1;
      return `C${String(num).padStart(3, '0')}`;
    }
  }
}

export type VipConfig = {
  mid_vip_start_row?: string; mid_vip_end_row?: string; mid_vip_start_col?: number; mid_vip_end_col?: number;
  grand_vip_start_row?: string; grand_vip_end_row?: string; grand_vip_start_col?: number; grand_vip_end_col?: number;
  // false면 이 회차는 동아리 전용 좌석이 없다. undefined/null은 켜짐(옛 행·과거 회차 호환).
  vip_enabled?: boolean;
};

export function computeVipSeats(
  isGrandHall: boolean,
  rows: string[],
  cols: number[],
  vipConfig: VipConfig
): Set<string> {
  if (vipConfig.vip_enabled === false) return new Set();
  const vips = new Set<string>();
  rows.forEach((rowChar, rowIndex) => {
    cols.forEach((colNum, colIndex) => {
      const isVip = isGrandHall
        ? rowChar.charCodeAt(0) >= (vipConfig.grand_vip_start_row || 'A').charCodeAt(0) &&
          rowChar.charCodeAt(0) <= (vipConfig.grand_vip_end_row || 'C').charCodeAt(0) &&
          colNum >= (vipConfig.grand_vip_start_col || 10) &&
          colNum <= (vipConfig.grand_vip_end_col || 18)
        : rowChar.charCodeAt(0) >= (vipConfig.mid_vip_start_row || 'A').charCodeAt(0) &&
          rowChar.charCodeAt(0) <= (vipConfig.mid_vip_end_row || 'C').charCodeAt(0) &&
          colNum >= (vipConfig.mid_vip_start_col || 5) &&
          colNum <= (vipConfig.mid_vip_end_col || 10);

      if (isVip) {
        const seatId = computeSeatId(isGrandHall, rowIndex, colIndex);
        if (seatId) vips.add(seatId);
      }
    });
  });
  return vips;
}
