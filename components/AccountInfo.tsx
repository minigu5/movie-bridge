"use client";

import { useState } from "react";

const ACCOUNT_NUMBER = "7777028184681";
const ACCOUNT_LABEL = "7777028184681 카카오뱅크 신민규";

export default function AccountInfo() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="bg-raised border border-line px-3 py-2.5 flex items-center justify-between gap-2 text-left">
      <div className="min-w-0">
        <p className="text-[10px] text-dim font-bold tracking-widest mb-0.5">계좌번호</p>
        <p className="text-[12px] md:text-[13px] font-mono text-ink truncate">{ACCOUNT_LABEL}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="계좌번호 복사"
        className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 border transition-colors ${
          copied
            ? "bg-ink border-ink text-ground"
            : "border-line-strong text-ink hover:border-line-bold"
        }`}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}
