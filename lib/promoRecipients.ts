// 홍보 메일 받는 사람에서 관리자가 X로 뺀 사람 거르기(순수 함수).
// 뺀 목록은 받는 사람을 다시 세도 그대로 남고, 화면·숫자·발송이 모두 이 결과를 쓴다.

export type PromoRecipient = { email: string; name: string | null };

const key = (email: string) => email.trim().toLowerCase();

export function applyPromoExclusions<T extends PromoRecipient>(recipients: T[], removed: ReadonlyMap<string, PromoRecipient>): T[] {
  if (removed.size === 0) return recipients;
  return recipients.filter((r) => !removed.has(key(r.email)));
}

// 뺀 사람 목록에 넣는다/다시 넣는다. 원래 Map은 바꾸지 않는다.
export function removePromoRecipient(removed: ReadonlyMap<string, PromoRecipient>, r: PromoRecipient): Map<string, PromoRecipient> {
  const next = new Map(removed);
  next.set(key(r.email), r);
  return next;
}

export function restorePromoRecipient(removed: ReadonlyMap<string, PromoRecipient>, email: string): Map<string, PromoRecipient> {
  const next = new Map(removed);
  next.delete(key(email));
  return next;
}
