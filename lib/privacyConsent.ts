// lib/privacyConsent.ts
// 로그인 사용자 개인정보 동의 — 버전, 필수 항목, 동의서 내용.
// 동의 모달(components/PrivacyConsentGate.tsx)과 처리방침 페이지(app/privacy)가 같이 쓴다.
// 내용을 바꾸면 PRIVACY_CONSENT_VERSION을 올린다 → 기존 사용자도 다음 접속 때 재동의 모달이 뜬다.
// 필수 항목을 바꾸면 supabase record_privacy_consent()의 검사도 같이 바꿀 것.
import { supabase } from './supabase';

export const PRIVACY_CONSENT_VERSION = '2026-10-31.1';

export const REQUIRED_CONSENT_ITEMS = ['privacy', 'overseas'] as const;
export type ConsentItemKey = (typeof REQUIRED_CONSENT_ITEMS)[number];

export type PrivacyConsentRecord = {
  user_id: string;
  version: string | null;
  items: Record<string, boolean>;
  agreed_at: string | null;
  withdrawn_at: string | null;
};

/** 저장된 동의가 현재 버전 기준으로 유효한지. */
export function isConsentValid(c: PrivacyConsentRecord | null | undefined): boolean {
  if (!c || !c.agreed_at || c.withdrawn_at || c.version !== PRIVACY_CONSENT_VERSION) return false;
  return REQUIRED_CONSENT_ITEMS.every(k => c.items?.[k] === true);
}

export async function fetchMyConsent(userId: string): Promise<PrivacyConsentRecord | null> {
  const { data, error } = await supabase.from('privacy_consents').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as PrivacyConsentRecord | null) ?? null;
}

export async function recordConsent(): Promise<PrivacyConsentRecord> {
  const items = Object.fromEntries(REQUIRED_CONSENT_ITEMS.map(k => [k, true]));
  const { data, error } = await supabase.rpc('record_privacy_consent', { p_version: PRIVACY_CONSENT_VERSION, p_items: items });
  if (error) throw error;
  return data as PrivacyConsentRecord;
}

export async function withdrawConsent(): Promise<void> {
  const { error } = await supabase.rpc('withdraw_privacy_consent');
  if (error) throw error;
}

/** 동의서 한 항목: 표 형태로 보여줄 행(구분 → 내용). */
export type ConsentDoc = {
  key: ConsentItemKey;
  title: string;
  rows: { label: string; items: string[] }[];
};

export const CONSENT_DOCS: ConsentDoc[] = [
  {
    key: 'privacy',
    title: '개인정보 수집·이용 동의',
    rows: [
      {
        label: '수집 항목',
        items: [
          '학교 구글 계정(@ts.hs.kr) 이메일, 구글 계정 이름(학번·성명으로 나누어 저장), 프로필 사진 주소',
          '예매 정보: 좌석, 팝콘 주문, 결제 확인 상태, 발권 여부, 단체 예매 구성',
          '이용 기록: 예매·좌석 변경·팝콘 주문·취소·발권 내역',
          '후기 작성 시: 이름, 평점, 후기 내용',
        ],
      },
      {
        label: '이용 목적',
        items: [
          '학교 구성원 본인 확인과 초대 대상 확인',
          '좌석 예매·변경·취소, 티켓 메일 발송, 발권기 발권',
          '팝콘 주문 결제 확인',
          '단체 예매 시 구성원 검색·초대(예매 가능한 사용자에게 학번·이름이 검색됨)',
          '부정 이용 방지와 문의 대응',
          '후기 공개(작성 즉시 비로그인 방문자를 포함한 모든 이용자에게 이름과 함께 공개)',
        ],
      },
      {
        label: '보유 기간',
        items: [
          '삭제를 요청하거나 동의를 철회하고 파기를 요청할 때까지 보관하며, 요청을 받으면 지체 없이 파기합니다.',
        ],
      },
      {
        label: '동의 거부',
        items: [
          '동의를 거부할 수 있습니다. 거부하면 로그인이 필요한 기능(예매·후기 작성)을 쓸 수 없고, 로그인하지 않은 상태로 상영 정보와 좌석 현황은 계속 볼 수 있습니다.',
        ],
      },
    ],
  },
  {
    key: 'overseas',
    title: '개인정보 국외 이전 동의',
    rows: [
      {
        label: '이전받는 자',
        items: [
          'Google LLC(미국): 구글 로그인 인증, 티켓·안내 메일 발송(Gmail)',
          'Cloudflare, Inc.(미국): 웹사이트 운영(접속 요청을 해외 서버에서 처리할 수 있음)',
          'Supabase, Inc.(미국 법인): 데이터베이스 운영. 데이터는 대한민국(서울) 리전에 저장됨',
        ],
      },
      {
        label: '이전 항목',
        items: [
          'Google: 이메일, 이름, 메일 본문(이름·좌석·팝콘 주문 등 예매 내용)',
          'Cloudflare: 접속 정보(IP 주소, 브라우저 정보)와 요청에 담긴 예매 정보',
          'Supabase: 위 개인정보 수집·이용 동의의 모든 항목',
        ],
      },
      {
        label: '이전 시기·방법',
        items: ['로그인·예매·메일 발송 등 서비스를 이용할 때마다 암호화된 네트워크(HTTPS)로 전송'],
      },
      {
        label: '보유 기간',
        items: ['개인정보 수집·이용 동의의 보유 기간과 같음'],
      },
      {
        label: '동의 거부',
        items: [
          '동의를 거부할 수 있습니다. 다만 위 업체 없이는 로그인·예매 기능을 제공할 수 없어, 거부하면 로그인이 필요한 기능을 쓸 수 없습니다.',
        ],
      },
    ],
  },
];
