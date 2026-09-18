// 학교(@ts.hs.kr) 이메일 규칙 유틸.
//
// 학생 이메일 형식: ts{입학년도 2자리}{일련번호 zero-pad}@ts.hs.kr
//   - 25년 입학만 일련번호 4자리: ts250024@ts.hs.kr  (2025년 입학, 24번)
//   - 24년/26년 이후는 일련번호 3자리: ts24010@ts.hs.kr, ts26010@ts.hs.kr
//
// 학년별 일련번호 범위는 예측하기 어려워 001~110(또는 0001~0110) 고정으로 발송한다.
// "현재 재학 중인 3개 학년"은 학년도 경계(3월 2일)를 기준으로 자동 갱신된다.
//   - 2026-09-04 기준  -> 입학년도 [24, 25, 26]
//   - 2027-03-02 기준  -> 입학년도 [25, 26, 27]

const SCHOOL_DOMAIN = '@ts.hs.kr';
const SERIAL_START = 1;
const SERIAL_END = 110;
// 학년도 경계: 3월 2일 (3월 1일은 삼일절 공휴일이라 신학기 시작은 3월 2일)
const SCHOOL_YEAR_START_MONTH = 3; // 1-indexed
const SCHOOL_YEAR_START_DAY = 2;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** workerd는 UTC로 동작하므로, "지금"을 KST 달력 필드로 환산한다. */
function toKstParts(now: Date): { year: number; month: number; day: number } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

/**
 * 주어진 시점(KST)의 학년도를 반환한다.
 * 3월 2일 00:00(KST) 이전이면 아직 지난 학년도.
 */
export function currentSchoolYear(now: Date = new Date()): number {
  const { year, month, day } = toKstParts(now);
  const afterBoundary =
    month > SCHOOL_YEAR_START_MONTH ||
    (month === SCHOOL_YEAR_START_MONTH && day >= SCHOOL_YEAR_START_DAY);
  return afterBoundary ? year : year - 1;
}

/**
 * 현재 재학 중인 3개 학년의 입학년도 뒤 2자리를 오름차순으로 반환한다.
 * 예) 학년도 2026 -> [24, 25, 26]  (3학년, 2학년, 1학년 순)
 */
export function activeAdmissionYears(now: Date = new Date()): number[] {
  const sy = currentSchoolYear(now);
  return [sy - 2, sy - 1, sy].map((y) => y % 100);
}

/**
 * 상대 학년('g1' | 'g2' | 'g3')을 입학년도 뒤 2자리로 매핑한다.
 * g1 = 1학년(가장 최근 입학), g3 = 3학년(가장 오래된 입학).
 */
export function admissionYearForGrade(grade: 'g1' | 'g2' | 'g3', now: Date = new Date()): number {
  const [g3, g2, g1] = activeAdmissionYears(now);
  return { g1, g2, g3 }[grade];
}

// 25년 입학 학번만 일련번호 4자리, 그 외(24/26/...)는 3자리.
const SERIAL_DIGITS_25 = 4;
const SERIAL_DIGITS_DEFAULT = 3;

/** 입학년도 뒤 2자리(yy)에 해당하는 학년의 학생 이메일 전체를 만든다. */
export function gradeEmails(yy: number): string[] {
  const prefix = `ts${String(yy).padStart(2, '0')}`;
  const serialDigits = yy === 25 ? SERIAL_DIGITS_25 : SERIAL_DIGITS_DEFAULT;
  const emails: string[] = [];
  for (let n = SERIAL_START; n <= SERIAL_END; n++) {
    emails.push(`${prefix}${String(n).padStart(serialDigits, '0')}${SCHOOL_DOMAIN}`);
  }
  return emails;
}
