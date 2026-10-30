import Link from "next/link";
import type { Metadata } from "next";
import { CONSENT_DOCS, PRIVACY_CONSENT_VERSION, type ConsentDoc } from "@/lib/privacyConsent";
import ConsentStatusCard from "./ConsentStatusCard";

export const metadata: Metadata = {
  title: "개인정보처리방침 - 영화대교",
};

// 1·2항은 동의 모달과 같은 내용(lib/privacyConsent.ts)을 그대로 보여준다.
const usageDoc = CONSENT_DOCS.find(d => d.key === "privacy")!;
const overseasDoc = CONSENT_DOCS.find(d => d.key === "overseas")!;

function ConsentDocSection({ doc }: { doc: ConsentDoc }) {
  return (
    <dl className="mt-3 space-y-3">
      {doc.rows.map(row => (
        <div key={row.label}>
          <dt className="text-sm font-semibold text-neutral-300">{row.label}</dt>
          <dd>
            <ul className="mt-1 space-y-1.5 text-sm text-neutral-400 list-disc list-inside">
              {row.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-block mb-8 text-sm font-semibold text-orange-400 hover:text-orange-300 transition-colors">
          ← 메인으로 돌아가기
        </Link>

        <ConsentStatusCard />

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
          <h1 className="text-2xl font-black mb-1">개인정보처리방침</h1>
          <p className="text-sm text-neutral-500 mb-8">시행일: 2026년 8월 20일 · 최종 개정일: 2026년 10월 31일 · 동의 버전 {PRIVACY_CONSENT_VERSION}</p>

          <section className="mb-8">
            <h2 className="text-base font-bold text-orange-400 border-b border-neutral-800 pb-2 mb-4">1. 수집하는 개인정보와 이용 목적</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              로그인하지 않은 방문자의 개인정보는 수집하지 않습니다. 학교 구글 계정(@ts.hs.kr)으로 처음 로그인하면
              아래 내용에 대한 동의를 받으며, 동의한 경우에만 예매·후기 작성을 이용할 수 있습니다.
            </p>
            <ConsentDocSection doc={usageDoc} />
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">
              보유 기간이 끝나거나 삭제 요청을 받은 개인정보는 지체 없이 데이터베이스에서 삭제하는 방법으로 파기합니다.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-base font-bold text-orange-400 border-b border-neutral-800 pb-2 mb-4">2. 개인정보의 국외 이전</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              서비스 운영을 위해 아래 업체에 개인정보 처리를 맡기며, 이 과정에서 정보가 국외로 이전될 수 있습니다.
            </p>
            <ConsentDocSection doc={overseasDoc} />
          </section>

          <section className="mb-8">
            <h2 className="text-base font-bold text-orange-400 border-b border-neutral-800 pb-2 mb-4">3. 제3자 제공</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              수집된 정보는 외부에 판매하거나 목적 외로 제공하지 않습니다. 위 2항의 업체는 서비스 운영을 위해
              처리를 맡긴 곳이며, 그 외의 제3자에게는 제공하지 않습니다.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-base font-bold text-orange-400 border-b border-neutral-800 pb-2 mb-4">4. 정보주체의 권리와 행사 방법</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              이용자는 언제든지 본인의 개인정보에 대해 다음 권리를 행사할 수 있습니다.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-400 list-disc list-inside">
              <li>개인정보 열람 요구</li>
              <li>오류가 있는 경우 정정 요구</li>
              <li>삭제 요구 (단, 다른 법령에서 별도로 보존하도록 규정한 경우는 제외)</li>
              <li>처리 정지 요구</li>
              <li>개인정보 처리에 대한 동의 철회 (로그인한 상태에서 이 페이지의 &lsquo;내 동의 내역&rsquo;에서 바로 철회할 수 있습니다)</li>
            </ul>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">
              권리 행사는 아래 문의처로 이메일을 통해 요청하실 수 있으며, 요청인이 본인임을
              확인한 후 지체 없이 조치합니다. 후기·평점처럼 다른 이용자에게 공개된 정보의 삭제 요구도
              동일한 방법으로 접수합니다.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-base font-bold text-orange-400 border-b border-neutral-800 pb-2 mb-4">5. 개인정보의 안전성 확보 조치</h2>
            <ul className="mt-1 space-y-1.5 text-sm text-neutral-400 list-disc list-inside">
              <li>관리적 조치: 개인정보 접근 권한을 운영에 필요한 최소 인원(관리자 계정)으로 제한</li>
              <li>기술적 조치: Supabase 행 단위 보안(RLS)으로 인가되지 않은 접근 차단, 전 구간 HTTPS 통신 암호화</li>
              <li>비밀번호는 별도로 수집·저장하지 않으며, 로그인 인증은 Google OAuth에 위탁하여 처리</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-orange-400 border-b border-neutral-800 pb-2 mb-4">6. 개인정보 보호책임자</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              개인정보 처리에 관한 문의, 불만 처리, 권리 행사 접수는 아래 개인정보 보호책임자에게
              연락 주십시오.
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              <span className="font-semibold text-neutral-300 mr-1.5">성명</span>신민규
            </p>
            <p className="mt-1.5 text-sm text-neutral-400">
              <span className="font-semibold text-neutral-300 mr-1.5">직책</span>개발자 (개인정보 보호책임자 겸임)
            </p>
            <p className="mt-1.5 text-sm text-neutral-400">
              <span className="font-semibold text-neutral-300 mr-1.5">Email</span>
              <a href="mailto:seong381400@gmail.com" className="text-orange-400 hover:text-orange-300 transition-colors">
                seong381400@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
