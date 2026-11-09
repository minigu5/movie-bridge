"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signInWithGoogle, type AppProfile } from '../lib/supabase-auth';

interface MovieReview {
  id: number;
  user_id: string;
  user_name: string;
  rating: number;
  content: string;
  created_at: string;
}

export function StarRating({ value, onChange, size }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className={`flex gap-0.5 ${size ?? 'text-lg'}`}>
      {[1, 2, 3, 4, 5].map((s) => {
        const fillRatio = Math.max(0, Math.min(1, value - (s - 1)));
        return (
          <div key={s} className="relative inline-block leading-none" style={{ width: '1em', height: '1em' }}>
            <span className="absolute inset-0 text-line-bold select-none">★</span>
            <span className="absolute inset-0 overflow-hidden text-ink select-none" style={{ width: `${fillRatio * 100}%` }}>★</span>
            {onChange && (
              <>
                <button type="button" aria-label={`${s - 0.5}점`} className="absolute inset-y-0 left-0 w-1/2 cursor-pointer" onClick={() => onChange(s - 0.5)} />
                <button type="button" aria-label={`${s}점`} className="absolute inset-y-0 right-0 w-1/2 cursor-pointer" onClick={() => onChange(s)} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// canWrite: 동아리원이거나 이 회차를 예매했던 사람(DB 정책 movie_reviews_insert_member_or_viewer와 같은 기준).
// onChange: 내 후기를 등록/수정/삭제한 뒤 호출. 다음 영화 예매 전 후기 필수 여부를 다시 확인하는 데 쓴다.
// 별점 입력: 별 옆에 고른 점수를 숫자로(예: 3.5점) 같이 보여준다.
export function RatingInput({ value, onChange, size }: { value: number; onChange: (v: number) => void; size?: string }) {
  return (
    <div className="flex items-center gap-3">
      <StarRating value={value} onChange={onChange} size={size} />
      {value > 0
        ? <span className="text-ink text-lg font-bold tabular-nums">{value.toFixed(1)}점</span>
        : <span className="text-dim text-sm">별을 눌러 선택</span>}
    </div>
  );
}

export default function MovieReviews({ movieSettingsId, profile, canWrite, onChange }: { movieSettingsId: number; profile: AppProfile | null; canWrite: boolean; onChange?: () => void }) {
  const [reviews, setReviews] = useState<MovieReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새 후기 작성 폼(아직 내 후기가 없을 때만 노출)
  const [newRating, setNewRating] = useState(0);
  const [newContent, setNewContent] = useState('');

  // 내 후기 인라인 수정 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState('');

  const myReview = profile ? reviews.find(r => r.user_id === profile.id) ?? null : null;

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    supabase.from('movie_reviews')
      .select('id, user_id, user_name, rating, content, created_at')
      .eq('movie_settings_id', movieSettingsId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setReviews((data as any) || []);
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [movieSettingsId]);

  const average = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const upsertReview = async (rating: number, content: string) => {
    if (!profile) return false;
    if (rating <= 0) { setError('별점을 선택해주세요.'); return false; }
    if (!content.trim()) { setError('후기를 입력해주세요.'); return false; }

    setError(null);
    setIsSaving(true);
    const { data, error: upsertError } = await supabase
      .from('movie_reviews')
      .upsert(
        { movie_settings_id: movieSettingsId, user_id: profile.id, user_name: profile.name, rating, content: content.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'movie_settings_id,user_id' }
      )
      .select('id, user_id, user_name, rating, content, created_at')
      .single();
    setIsSaving(false);

    if (upsertError) { setError(upsertError.code === 'P0001' ? upsertError.message : '저장에 실패했습니다.'); return false; }
    setReviews(prev => [data as any, ...prev.filter(r => r.user_id !== profile.id)]
      .sort((a, b) => b.created_at.localeCompare(a.created_at)));
    onChange?.();
    return true;
  };

  const handleCreate = async () => {
    if (await upsertReview(newRating, newContent)) {
      setNewRating(0);
      setNewContent('');
    }
  };

  const startEditing = () => {
    if (!myReview) return;
    setEditRating(myReview.rating);
    setEditContent(myReview.content);
    setError(null);
    setIsEditing(true);
  };

  const handleUpdate = async () => {
    if (await upsertReview(editRating, editContent)) setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!myReview) return;
    setIsSaving(true);
    const { error: deleteError } = await supabase.from('movie_reviews').delete().eq('id', myReview.id);
    setIsSaving(false);

    if (deleteError) return setError('삭제에 실패했습니다.');
    setReviews(prev => prev.filter(r => r.id !== myReview.id));
    setIsEditing(false);
    onChange?.();
  };

  return (
    <section className="w-full flex flex-col">
      <div className="flex items-baseline justify-between flex-wrap gap-2 border-b border-ink pb-2.5 md:pb-3.5">
        <h2 className="m-0 text-[17px] md:text-[22px] font-black">관람 후기</h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2">
            <StarRating value={average} size="text-base" />
            <span className="text-ink text-sm font-bold">{average.toFixed(1)} / 5</span>
            <span className="text-dim text-xs">({reviews.length}개)</span>
          </div>
        )}
      </div>

      {!profile && (
        <div className="border-b border-line py-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sub text-sm">로그인하면 후기를 남길 수 있어요.</p>
          <button
            type="button"
            onClick={() => signInWithGoogle().catch(() => setError('로그인에 실패했습니다.'))}
            className="h-10 px-4 bg-ink hover:bg-white text-ground text-sm font-bold transition-colors shrink-0"
          >
            로그인
          </button>
        </div>
      )}

      {profile && !canWrite && (
        <div className="border-b border-line py-4">
          <p className="text-sub text-sm">동아리원이나 이 영화를 예매했던 분만 후기를 남길 수 있어요.</p>
        </div>
      )}

      {canWrite && profile && !myReview && (
        <div className="border-b border-line py-5">
          <p className="text-ink text-sm font-bold mb-2">후기 작성</p>
          <RatingInput value={newRating} onChange={setNewRating} />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="이 영화 어떠셨나요?"
            rows={3}
            className="mt-3 w-full bg-ground border border-line-strong p-3 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink"
          />
          {error && <p className="text-danger text-xs mt-2">{error}</p>}
          <button type="button" onClick={handleCreate} disabled={isSaving} className="mt-3 h-10 px-4 bg-ink hover:bg-white text-ground disabled:opacity-50 text-sm font-bold transition-colors">
            등록하기
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-dim text-sm py-5">후기를 불러오는 중...</p>
      ) : reviews.length === 0 ? (
        <p className="text-dim text-sm py-5">아직 등록된 후기가 없어요.</p>
      ) : (
        <div className="flex flex-col">
          {reviews.map((r) => {
            const isMine = profile?.id === r.user_id;

            if (isMine && isEditing) {
              return (
                <div key={r.id} className="border-b border-line py-5">
                  <RatingInput value={editRating} onChange={setEditRating} />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="mt-3 w-full bg-ground border border-line-strong p-3 text-sm text-ink focus:outline-none focus:border-ink"
                  />
                  {error && <p className="text-danger text-xs mt-2">{error}</p>}
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={handleUpdate} disabled={isSaving} className="h-8 px-3 bg-ink hover:bg-white text-ground disabled:opacity-50 text-xs font-bold transition-colors">저장</button>
                    <button type="button" onClick={() => { setIsEditing(false); setError(null); }} disabled={isSaving} className="h-8 px-3 border border-line-strong hover:border-line-bold disabled:opacity-50 text-ink text-xs font-bold transition-colors">취소</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={r.id} className="border-b border-line py-4 md:py-5 grid grid-cols-[1fr_auto] md:grid-cols-[160px_1fr_auto] gap-x-6 gap-y-1.5">
                <span className="text-ink text-sm font-bold">{r.user_name}{isMine && <span className="text-dim font-normal ml-1">(나)</span>}</span>
                <div className="md:order-last"><StarRating value={r.rating} size="text-sm" /></div>
                <div className="col-span-2 md:col-span-1 min-w-0">
                <p className="text-sub text-sm leading-relaxed whitespace-pre-wrap break-keep">{r.content}</p>
                {isMine && (
                  <div className="flex gap-4 mt-2">
                    <button type="button" onClick={startEditing} className="text-dim hover:text-ink text-xs font-bold transition-colors">수정</button>
                    <button type="button" onClick={handleDelete} disabled={isSaving} className="text-danger hover:opacity-80 text-xs font-bold transition-colors disabled:opacity-50">삭제</button>
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
