// lib/api-auth.ts
import { getSupabaseAdmin } from './supabase-admin';
import type { User } from '@supabase/supabase-js';

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  if (!data.user.email?.toLowerCase().endsWith('@ts.hs.kr')) return null;

  return data.user;
}

type AdminCheckResult =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string };

export async function isAdminEmail(email: string): Promise<boolean> {
  const { data: admin } = await getSupabaseAdmin()
    .from('admins')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  return !!admin;
}

export async function requireAdmin(req: Request): Promise<AdminCheckResult> {
  const user = await getUserFromRequest(req);
  if (!user) return { ok: false, status: 401, error: '로그인이 필요합니다.' };

  if (!(await isAdminEmail(user.email as string))) return { ok: false, status: 403, error: '관리자 권한이 없습니다.' };
  return { ok: true, user };
}
