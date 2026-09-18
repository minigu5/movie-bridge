"use client";

import { useState, type Dispatch, type SetStateAction } from 'react';
import { Mail, Send, Settings, Ticket, Save, Clapperboard } from 'lucide-react';
import VipZonePicker, { type Zone } from './VipZonePicker';
import { activeAdmissionYears } from '../../../lib/schoolEmails';

type PromoSources = { club: boolean; profilesAll: boolean; g1: boolean; g2: boolean; g3: boolean };

interface PromoProps {
  sources: PromoSources;
  setSources: Dispatch<SetStateAction<PromoSources>>;
  manualText: string;
  setManualText: (v: string) => void;
  manualPreviewCount: number;
  isResolving: boolean;
  isSending: boolean;
  progress: { current: number; total: number };
  recipientCount: number;
  showConfirm: boolean;
  onResolveClick: () => void;
  onConfirmSend: () => void;
  onCancelConfirm: () => void;
}

interface Props {
  movieInfo: any;
  editForm: any;
  setEditForm: (updater: any) => void;
  onSaveSettings: () => void;
  bgGenerating: boolean;
  bgStatus: string | null;
  onGenerateBg: (posterFile?: File) => void;
  onStartNewMovieClick: () => void;
  isStartingNewMovie: boolean;
  newMovieForm: any;
  setNewMovieForm: (updater: any) => void;
  onSubmitNewMovie: () => void;
  onCancelNewMovie: () => void;
  promo: PromoProps;
}

const zoneFromForm = (form: any, hall: 'mid' | 'grand'): Zone => {
  const p = hall === 'grand' ? 'grand' : 'mid';
  return {
    startRow: form[`${p}_vip_start_row`] ?? 'A',
    endRow: form[`${p}_vip_end_row`] ?? 'C',
    startCol: form[`${p}_vip_start_col`] ?? 1,
    endCol: form[`${p}_vip_end_col`] ?? 1,
  };
};

const applyZone = (setForm: (u: any) => void, hall: 'mid' | 'grand', z: Zone) => {
  const p = hall === 'grand' ? 'grand' : 'mid';
  setForm((prev: any) => ({
    ...prev,
    [`${p}_vip_start_row`]: z.startRow,
    [`${p}_vip_end_row`]: z.endRow,
    [`${p}_vip_start_col`]: z.startCol,
    [`${p}_vip_end_col`]: z.endCol,
  }));
};

function MovieFormFields({ form, setForm }: { form: any; setForm: (u: any) => void }) {
  const set = (patch: any) => setForm((prev: any) => ({ ...prev, ...patch }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><label className="block text-sm text-neutral-400 mb-1">영화 제목</label><input type="text" value={form.title ?? ''} onChange={e => set({ title: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none" /></div>
      <div><label className="block text-sm text-neutral-400 mb-1">상영 일시 (화면 표시용)</label><input type="text" value={form.date_string ?? ''} onChange={e => set({ date_string: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none" /></div>
      <div><label className="block text-sm text-neutral-400 mb-1">DB 기준 날짜 (YYYY-MM-DD)</label><input type="text" value={form.db_date ?? ''} onChange={e => set({ db_date: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none" /></div>
      <div>
        <label className="block text-sm text-neutral-400 mb-1">상영 장소</label>
        <select value={form.venue ?? ''} onChange={e => set({ venue: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 focus:border-orange-500 outline-none">
          <option value="대구과학고등학교 중강당">중강당 (14x9 배열)</option>
          <option value="대구과학고등학교 대강당">대강당 (27x18 배열)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm text-neutral-400 mb-1">관람가 등급</label>
        <select value={form.age_rating ?? '전체관람가'} onChange={e => set({ age_rating: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none">
          <option value="전체관람가">전체관람가</option>
          <option value="12세이상관람가">12세 이상 관람가</option>
          <option value="15세이상관람가">15세 이상 관람가</option>
          <option value="청소년관람불가">청소년 관람불가</option>
        </select>
      </div>
      <div className="md:col-span-2"><label className="block text-sm text-neutral-400 mb-1">포스터 주소</label><input type="text" value={form.poster_url ?? ''} onChange={e => set({ poster_url: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none" /></div>
      <div className="md:col-span-2"><label className="block text-sm text-red-400 font-bold mb-1">예매 마감 일시 (ISO 형식)</label><input type="text" value={form.deadline_date ?? ''} onChange={e => set({ deadline_date: e.target.value })} className="w-full p-2 bg-neutral-700 rounded border border-red-800 outline-none" /></div>
    </div>
  );
}

function PromoMailSection({ promo, movieTitle }: { promo: PromoProps; movieTitle: string | undefined }) {
  const p = promo;
  const [yy3, yy2, yy1] = activeAdmissionYears();
  const toggle = (key: keyof PromoSources) => p.setSources((prev) => ({ ...prev, [key]: !prev[key] }));
  const pct = p.progress.total > 0 ? Math.round((p.progress.current / p.progress.total) * 100) : 0;

  return (
    <section className="bg-neutral-800 p-6 rounded-xl border border-orange-600">
      <h2 className="text-xl font-bold text-orange-400 mb-1 flex items-center gap-1.5"><Mail className="w-5 h-5" /> 상영작 홍보 메일 발송</h2>
      <p className="text-neutral-400 text-sm mb-4">
        현재 상영작(<span className="text-neutral-200">{movieTitle || '미설정'}</span>) 기준으로 (광고) 초청 메일을 보냅니다.
        블랙리스트는 자동 제외됩니다.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.club} onChange={() => toggle('club')} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-amber-300 font-bold">동아리원(VIP)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.profilesAll} onChange={() => toggle('profilesAll')} className="w-4 h-4 accent-emerald-500" />
          <span className="text-sm text-emerald-300 font-bold">로그인 이력 전체</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.g1} onChange={() => toggle('g1')} className="w-4 h-4 accent-orange-500" />
          <span className="text-sm text-neutral-200 font-bold">1학년 ({yy1}학번)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.g2} onChange={() => toggle('g2')} className="w-4 h-4 accent-orange-500" />
          <span className="text-sm text-neutral-200 font-bold">2학년 ({yy2}학번)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer bg-neutral-700/40 rounded px-3 py-2">
          <input type="checkbox" checked={p.sources.g3} onChange={() => toggle('g3')} className="w-4 h-4 accent-orange-500" />
          <span className="text-sm text-neutral-200 font-bold">3학년 ({yy3}학번)</span>
        </label>
      </div>
      <p className="text-neutral-500 text-xs mb-4">
        학년별 발송은 각 학년 001~110번(25학번은 0001~0110번) 학생 이메일(<code>ts{yy1}{yy1 === 25 ? '0001' : '001'}@ts.hs.kr</code> 형식)로 보냅니다. 학년도(3월 2일) 기준 자동 갱신.
      </p>

      <div className="mb-4">
        <label className="block text-neutral-300 mb-1 text-sm font-bold">추가 수동 발송 (선택)</label>
        <textarea
          value={p.manualText}
          onChange={(e) => p.setManualText(e.target.value)}
          placeholder={'이름과 이메일을 붙여넣으면 @ts.hs.kr 이메일만 자동 인식됩니다.\n예) 2208 신민규 <ts250024@ts.hs.kr>'}
          rows={3}
          className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm resize-none"
        />
        <span className="text-neutral-500 text-xs">{p.manualPreviewCount}개 이메일 인식됨</span>
      </div>

      {p.isSending ? (
        <div className="w-full bg-neutral-700 rounded-full h-8 relative overflow-hidden border border-neutral-600">
          <div className="bg-orange-600 h-8 transition-all duration-300" style={{ width: `${pct}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
            안전 발송 중... ({p.progress.current} / {p.progress.total})
          </span>
        </div>
      ) : (
        <button
          onClick={p.onResolveClick}
          disabled={p.isResolving}
          className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition-colors flex items-center justify-center gap-1.5"
        >
          {p.isResolving ? '명단 계산 중...' : (<><Send className="w-4 h-4" /> 체크한 대상에게 홍보 메일 발송하기</>)}
        </button>
      )}

      {p.showConfirm && (
        <div className="fixed inset-0 bg-orange-900/90 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-neutral-900 p-8 rounded-2xl max-w-md w-full border-4 border-orange-500 shadow-[0_0_50px_rgba(249,115,22,0.5)] text-center">
            <h3 className="text-2xl font-black text-white mb-4 flex items-center justify-center gap-1.5"><Mail className="w-6 h-6" /> 대량 메일 발송 확인</h3>
            <div className="bg-orange-950 p-5 rounded-xl text-white border border-orange-800 mb-4">
              <p className="text-sm text-orange-300 mb-1">발송 예정 총 인원 (블랙리스트/중복 제외)</p>
              <p className="text-5xl text-yellow-400 font-black">{p.recipientCount}<span className="text-xl text-white ml-2">명</span></p>
            </div>
            <p className="text-neutral-400 text-sm mb-6">발송 중에는 창을 닫거나 새로고침하지 마세요. 진행 바가 다 찰 때까지 기다려 주세요.</p>
            <div className="flex gap-3">
              <button onClick={p.onCancelConfirm} className="flex-1 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-white font-bold">돌아가기</button>
              <button onClick={p.onConfirmSend} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 rounded-xl text-white font-bold flex items-center justify-center gap-1.5"><Send className="w-4 h-4" /> 발송 시작</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SettingsTab(props: Props) {
  const {
    movieInfo, editForm, setEditForm, onSaveSettings, bgGenerating, bgStatus, onGenerateBg,
    onStartNewMovieClick, isStartingNewMovie, newMovieForm, setNewMovieForm, onSubmitNewMovie, onCancelNewMovie,
    promo,
  } = props;
  const [editHall, setEditHall] = useState<'mid' | 'grand'>('mid');
  const [newHall, setNewHall] = useState<'mid' | 'grand'>('mid');

  return (
    <div className="space-y-8">
      <PromoMailSection promo={promo} movieTitle={movieInfo?.title} />

      {movieInfo && (
        <section className="bg-neutral-800 p-6 rounded-xl border border-purple-700">
          <h2 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-1.5"><Settings className="w-5 h-5" /> 현재 상영 설정 — {movieInfo.title}</h2>
          <MovieFormFields form={editForm} setForm={setEditForm} />

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button type="button" onClick={() => onGenerateBg()} disabled={bgGenerating} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-sm font-bold">
              {bgGenerating ? '배경 생성 중...' : '포스터 주소로 배경 생성'}
            </button>
            <label className={`px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold cursor-pointer ${bgGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
              파일 직접 업로드
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={bgGenerating}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onGenerateBg(file);
                }}
              />
            </label>
            {bgStatus && <span className="text-sm text-neutral-400">{bgStatus}</span>}
            {editForm.background_template_url && (
              <span className="text-xs text-green-400">배경 템플릿 있음 — 포스터를 바꿨으면 다시 생성하세요.</span>
            )}
            {editForm.poster_cdn_url && (
              <span className="text-xs text-green-400">포스터 CDN 저장됨 (메일용)</span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            포스터 호스트(예: movist)가 서버 요청을 막아 "포스터 주소로 배경 생성"이 실패하면, 포스터 이미지를 직접 다운로드한 뒤 "파일 직접 업로드"를 쓰세요.
          </p>

          <div className="mt-6">
            <h3 className="text-amber-400 font-bold border-b border-neutral-700 pb-2 mb-3 flex items-center gap-1.5"><Ticket className="w-4 h-4" /> 동아리 전용(VIP) 좌석 영역</h3>
            <VipZonePicker
              hall={editHall}
              onHallChange={setEditHall}
              zone={zoneFromForm(editForm, editHall)}
              onZoneChange={(z) => applyZone(setEditForm, editHall, z)}
              accent={editHall === 'grand' ? 'pink' : 'amber'}
            />
          </div>

          <div className="mt-6 text-right">
            <button onClick={onSaveSettings} className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center justify-center gap-1.5"><Save className="w-4 h-4" /> 변경사항 저장</button>
          </div>
        </section>
      )}

      <section className="bg-neutral-800 p-6 rounded-xl border border-orange-600">
        {!isStartingNewMovie ? (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-orange-400 flex items-center gap-1.5"><Clapperboard className="w-5 h-5" /> 새 회차 시작</h2>
              <p className="text-neutral-400 text-sm mt-1">현재 회차를 이력으로 보존하고 새 영화 예매를 시작합니다.</p>
            </div>
            <button onClick={onStartNewMovieClick} className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-lg font-bold">새 영화 정보 입력</button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-orange-400 mb-4 flex items-center gap-1.5"><Clapperboard className="w-5 h-5" /> 새 회차 시작 — 새 영화 정보 입력</h2>
            <MovieFormFields form={newMovieForm} setForm={setNewMovieForm} />
            <div className="mt-6">
              <h3 className="text-amber-400 font-bold border-b border-neutral-700 pb-2 mb-3 flex items-center gap-1.5"><Ticket className="w-4 h-4" /> 동아리 전용(VIP) 좌석 영역</h3>
              <VipZonePicker
                hall={newHall}
                onHallChange={setNewHall}
                zone={zoneFromForm(newMovieForm, newHall)}
                onZoneChange={(z) => applyZone(setNewMovieForm, newHall, z)}
                accent={newHall === 'grand' ? 'pink' : 'amber'}
              />
            </div>
            <div className="mt-6 text-right flex justify-end gap-2">
              <button onClick={onCancelNewMovie} className="bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg">취소</button>
              <button onClick={onSubmitNewMovie} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center justify-center gap-1.5"><Clapperboard className="w-4 h-4" /> 새 회차 시작</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
