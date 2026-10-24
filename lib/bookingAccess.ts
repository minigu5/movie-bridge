// lib/bookingAccess.ts
// 서버 측 예매 자격 판정. DB의 public.can_book()과 같은 기준: 동아리원 / 관리자 / 초대 명단.
import { getSupabaseAdmin } from './supabase-admin';

// 주어진 이메일 중 예매 가능한 것만 소문자 Set으로 돌려준다.
export async function bookableEmails(emails: string[]): Promise<Set<string>> {
  const lowered = Array.from(new Set(emails.map(e => e.toLowerCase())));
  const allowed = new Set<string>();
  if (lowered.length === 0) return allowed;

  const supabaseAdmin = getSupabaseAdmin();
  const sources = ['club_members', 'admins', 'invited_emails'] as const;
  const results = await Promise.all(
    sources.map(table => supabaseAdmin.from(table).select('email').in('email', lowered))
  );
  for (const { data, error } of results) {
    if (error) throw error;
    (data ?? []).forEach((r: { email: string }) => allowed.add(r.email.toLowerCase()));
  }
  return allowed;
}
