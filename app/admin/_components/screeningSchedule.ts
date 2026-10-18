// 관리자 폼의 상영 일정 입력(캘린더)과 DB 저장 형식(date_string / db_date / deadline_date) 사이 변환.
// _start / _end / _deadline 은 폼 안에서만 쓰는 입력값이고 서버 payload에는 포함되지 않는다.
//   _start    "YYYY-MM-DDTHH:mm"  (datetime-local, 한국 시간)
//   _end      "HH:mm"             (time)
//   _deadline "YYYY-MM-DDTHH:mm"  (datetime-local, 한국 시간)

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

export interface Schedule {
  start: string;
  end: string;
  deadline: string;
}

// "2026년 8월 22일 (토) 10:00 ~ 11:40" → 시작 / 종료. 형식이 다르면 가능한 부분만 읽는다.
function parseDateString(dateString: string | undefined): { start: string; end: string } {
  const m = (dateString ?? '').match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일[^\d]*(?:(\d{1,2}):(\d{2}))?(?:\s*~\s*(\d{1,2}):(\d{2}))?/);
  if (m) {
    const date = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    return {
      start: m[4] ? `${date}T${pad(Number(m[4]))}:${m[5]}` : '',
      end: m[6] ? `${pad(Number(m[6]))}:${m[7]}` : '',
    };
  }
  return { start: '', end: '' };
}

// ISO(타임존 포함) → 한국 시간 "YYYY-MM-DDTHH:mm"
function isoToKstLocal(iso: string | undefined | null): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const k = new Date(t.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

export function getSchedule(form: any): Schedule {
  const parsed = parseDateString(form.date_string);
  return {
    start: form._start ?? parsed.start,
    end: form._end ?? parsed.end,
    deadline: form._deadline ?? isoToKstLocal(form.deadline_date),
  };
}

export function formatDateString(start: string, end: string): string {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const head = `${y}년 ${mo}월 ${d}일 (${weekday}) ${m[4]}:${m[5]}`;
  return end ? `${head} ~ ${end}` : head;
}

// 입력값 → 폼에 같이 저장할 DB 필드 3개
export function buildDerivedFields(s: Schedule) {
  return {
    _start: s.start,
    _end: s.end,
    _deadline: s.deadline,
    date_string: formatDateString(s.start, s.end),
    db_date: s.start ? s.start.slice(0, 10) : '',
    deadline_date: s.deadline ? `${s.deadline}:00+09:00` : '',
  };
}

// 저장 전 검증. 문제 없으면 null, 하드 오류면 { error }, 확인이 필요한 경고면 { warn }.
export function validateMovieForm(form: any): { error?: string; warn?: string } | null {
  if (!String(form.title ?? '').trim()) return { error: '영화 제목을 입력하세요.' };

  const s = getSchedule(form);
  const touched = form._start !== undefined || form._end !== undefined || form._deadline !== undefined;
  const complete = !!(s.start && s.end && s.deadline);

  if (touched && !complete) {
    if (!s.start) return { error: '상영 시작 날짜와 시간을 입력하세요.' };
    if (!s.end) return { error: '상영 종료 시간을 입력하세요.' };
    return { error: '예매 마감 날짜와 시간을 입력하세요.' };
  }
  // 옛 형식이라 읽을 수 없고 건드리지도 않았다면 기존 값을 그대로 둔다.
  if (!complete) return null;

  if (s.end <= s.start.slice(11)) return { error: '상영 종료 시간이 시작 시간보다 늦어야 합니다.' };
  if (s.deadline > s.start) return { warn: '예매 마감이 상영 시작보다 늦습니다. 그래도 저장할까요?' };
  return null;
}
