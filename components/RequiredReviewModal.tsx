"use client";

import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { type AppProfile } from '../lib/supabase-auth';
import { RatingInput } from './MovieReviews';

// my_pending_review() RPC(0021) 한 행: 본인이 보고 아직 후기를 안 쓴 직전 상영작.
export interface PendingReview {
  id: number;
  title: string;
  date_string: string;
  poster_url: string | null;
  poster_cdn_url: string | null;
}

// 직전 상영작을 본 사람이 다음 영화 좌석을 고르려 할 때 뜨는 후기 작성 창.
// 등록하면 onDone이 불리고, 호출한 쪽이 하던 예매(좌석 선택)를 그대로 이어간다.
export default function RequiredReviewModal({ movie, profile, onDone, onClose }: {
  movie: PendingReview;
  profile: AppProfile;
  onDone: () => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (rating <= 0) return setError('별점을 선택해주세요.');
    if (!content.trim()) return setError('후기를 입력해주세요.');

    setError(null);
    setIsSaving(true);
    const { error: upsertError } = await supabase
      .from('movie_reviews')
      .upsert(
        { movie_settings_id: movie.id, user_id: profile.id, user_name: profile.name, rating, content: content.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'movie_settings_id,user_id' }
      );
    setIsSaving(false);

    if (upsertError) return setError(upsertError.code === 'P0001' ? upsertError.message : '저장에 실패했습니다. 다시 시도해주세요.');
    onDone();
  };

  const poster = movie.poster_cdn_url || movie.poster_url;

  return (
    <div className="fixed inset-0 bg-ground/90 flex items-center justify-center p-4 z-[70] overflow-y-auto">
      <div className="bg-card border border-line rounded-lg p-6 w-full max-w-md my-8">
        <h2 className="text-xl font-black text-ink mb-1 flex items-center gap-2"><PenLine className="w-5 h-5 text-dim" /> 지난 영화 후기 남기기</h2>
        <p className="text-sub text-sm mb-5 leading-relaxed">
          지난 상영작을 보셨네요! 후기를 남기면 바로 이어서 예매할 수 있어요.
        </p>

        <div className="flex items-center gap-4 bg-raised p-3 border border-line mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster && <img src={poster} alt="" className="w-14 h-20 object-cover border border-line bg-seat shrink-0" />}
          <div className="min-w-0">
            <p className="text-ink font-bold truncate">{movie.title}</p>
            <p className="text-dim text-xs mt-0.5">{movie.date_string}</p>
          </div>
        </div>

        <p className="text-ink text-sm font-bold mb-2">별점</p>
        <RatingInput value={rating} onChange={setRating} size="text-3xl" />

        <p className="text-ink text-sm font-bold mt-4 mb-2">한 줄 후기</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="이 영화 어떠셨나요?"
          rows={3}
          autoFocus
          className="w-full bg-ground border border-line-strong p-3 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink"
        />
        <p className="text-dim text-xs mt-1">후기는 지난 상영작 화면에 이름과 함께 공개되고, 나중에 수정·삭제할 수 있어요.</p>
        {error && <p className="text-accent text-sm mt-3 whitespace-pre-line">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} disabled={isSaving} className="h-12 px-4 border border-line-strong hover:border-line-bold text-ink font-bold transition-colors text-sm disabled:opacity-50">나중에</button>
          <button type="button" onClick={handleSubmit} disabled={isSaving} className="flex-1 h-12 px-4 bg-ink hover:bg-white text-ground font-bold transition-colors disabled:opacity-50">
            {isSaving ? '저장 중...' : '후기 등록하고 예매 계속하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
