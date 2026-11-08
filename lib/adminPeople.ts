// 관리자 "사람" 명단: 로그인 이력(profiles) ∪ 초대 명단 ∪ 동아리원 ∪ 관리자 ∪ 차단을 한 줄씩으로 합친다.
// 예매 가능 규칙은 DB can_book()과 같다: 차단이 아니고 (초대 명단 | 동아리원 | 관리자).

export type PersonRow = {
  email: string;
  name: string | null;
  studentId: string | null;
  isStaff: boolean;
  profileId: string | null;
  canBookDirect: boolean; // invited_emails
  club: boolean;
  admin: boolean;
  blocked: boolean;
  blockReason: string | null; // 차단 사유(관리자가 적은 글, 없으면 null)
};

export type PeopleFilter = 'all' | 'canBook' | 'club' | 'admin' | 'cannotBook' | 'blocked';

type ProfileSrc = { id?: string; email: string; name: string; student_id: string | null; role: string };
type EmailSrc = { email: string };
type BlockSrc = { email: string; reason?: string | null };

export function canBook(r: PersonRow): boolean {
  return !r.blocked && (r.canBookDirect || r.club || r.admin);
}

export function mergePeople(src: { profiles: ProfileSrc[]; invited: EmailSrc[]; club: EmailSrc[]; admins: EmailSrc[]; blacklist: BlockSrc[] }): PersonRow[] {
  const byEmail = new Map<string, PersonRow>();
  const row = (email: string): PersonRow => {
    const key = email.trim().toLowerCase();
    let r = byEmail.get(key);
    if (!r) {
      r = { email: key, name: null, studentId: null, isStaff: false, profileId: null, canBookDirect: false, club: false, admin: false, blocked: false, blockReason: null };
      byEmail.set(key, r);
    }
    return r;
  };
  for (const p of src.profiles) {
    const r = row(p.email);
    r.name = p.name || null;
    r.studentId = p.student_id ?? null;
    r.isStaff = p.role === 'staff';
    r.profileId = p.id ?? null;
  }
  for (const { email } of src.invited) row(email).canBookDirect = true;
  for (const { email } of src.club) row(email).club = true;
  for (const { email } of src.admins) row(email).admin = true;
  for (const { email, reason } of src.blacklist) {
    const r = row(email);
    r.blocked = true;
    if (reason?.trim()) r.blockReason = reason.trim();
  }

  const rank = (r: PersonRow) => (r.admin ? 0 : r.club ? 1 : 2);
  return [...byEmail.values()].sort((a, b) =>
    rank(a) - rank(b) || (a.name ?? a.email).localeCompare(b.name ?? b.email, 'ko'));
}

const MATCH: Record<PeopleFilter, (r: PersonRow) => boolean> = {
  all: () => true,
  canBook,
  club: (r) => r.club,
  admin: (r) => r.admin,
  cannotBook: (r) => !canBook(r),
  blocked: (r) => r.blocked,
};

export function filterPeople(rows: PersonRow[], f: PeopleFilter, q: string): PersonRow[] {
  const query = q.trim().toLowerCase();
  return rows.filter((r) => MATCH[f](r) && (!query ||
    [r.name, r.studentId, r.email].some((v) => (v ?? '').toLowerCase().includes(query))));
}

export function countByFilter(rows: PersonRow[]): Record<PeopleFilter, number> {
  const out = { all: 0, canBook: 0, club: 0, admin: 0, cannotBook: 0, blocked: 0 } as Record<PeopleFilter, number>;
  for (const r of rows) for (const f of Object.keys(MATCH) as PeopleFilter[]) if (MATCH[f](r)) out[f]++;
  return out;
}
