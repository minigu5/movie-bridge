// 관리자 예매 탭이 읽는 reservations 행의 칸
export type AdminReservation = {
  id: string;
  seat_number: string;
  student_name: string;
  student_id: string | null;
  email?: string | null;
  payment_status: string;
  is_printed?: boolean | null;
  is_group_leader?: boolean | null;
  popcorn_order?: string | null;
};

export const POPCORN_NAMES: Record<string, string> = {
  original: '오리지널',
  consomme: '콘소메',
  caramel: '카라멜',
};

export const POPCORN_UNIT_PRICE = 2500;

// 예매 행의 popcorn_order 문자열을 화면 표시용으로 분석
export function analyzePopcorn(order: string | null | undefined) {
  const arr = order && order !== 'none' ? order.split(',') : [];
  const totalPrice = arr.length * POPCORN_UNIT_PRICE;
  const counts: Record<string, number> = {};
  arr.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
  const summary = arr.length > 0
    ? Object.entries(counts).map(([k, c]) => `${POPCORN_NAMES[k]} ${c}개`).join(', ')
    : '무료 관람';
  return { arr, totalPrice, counts, summary };
}

// 좌석번호 자연 정렬용 파싱: "A03" -> ["A", 3]
export function parseSeat(seat: string | null | undefined): [string, number] {
  if (!seat) return ['', 0];
  const m = String(seat).match(/^([A-Za-z]*)(\d*)$/);
  if (!m) return [String(seat), 0];
  return [m[1], m[2] ? parseInt(m[2], 10) : 0];
}

export const STATUS_WEIGHT: Record<string, number> = {
  pending: 0,
  group_pending: 1,
  confirmed: 2,
};
