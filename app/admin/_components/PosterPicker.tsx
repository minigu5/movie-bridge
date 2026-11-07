"use client";

import { useState } from 'react';

interface Props {
  posterUrl: string;
  posterCdnUrl?: string;
  onUrlChange(url: string): void;
  onFile(file: File): Promise<void>;
  status: string | null;
  hint?: string; // 상태 문구가 없을 때 보일 안내
}

// 포스터 168×240 + "포스터 바꾸기". 누르면 이 자리에서 주소 칸과 파일 고르기가 펼쳐진다(모달 아님).
export default function PosterPicker({ posterUrl, posterCdnUrl, onUrlChange, onFile, status, hint = '파일은 고르면 바로 올라가요. 주소는 넣은 뒤 저장을 눌러야 바뀌어요.' }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = posterCdnUrl || posterUrl;

  return (
    <div className="w-[168px] shrink-0 flex flex-col gap-2.5">
      <div className="w-[168px] h-[240px] bg-seat border border-line flex items-center justify-center overflow-hidden">
        {preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={preview} alt="포스터" className="w-full h-full object-cover" />
          : <span className="text-[13px] text-mute">포스터 없음</span>}
      </div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="h-10 border border-line text-ink text-[13px] font-bold"
      >
        포스터 바꾸기
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-dim">
            이미지 주소
            <input
              type="url"
              value={posterUrl}
              onChange={e => onUrlChange(e.target.value)}
              placeholder="https://"
              className="h-10 px-2.5 bg-card border border-line text-ink text-[13px] outline-none focus:border-line-bold"
            />
          </label>
          <label className={`h-10 flex items-center justify-center border border-line-strong text-ink text-[13px] font-bold cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? '올리는 중' : '파일 고르기'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                try { await onFile(file); } finally { setBusy(false); }
              }}
            />
          </label>
        </div>
      )}
      <span className={`text-[11px] leading-normal break-keep ${status ? 'text-sub' : 'text-mute'}`}>
        {status ?? hint}
      </span>
    </div>
  );
}
