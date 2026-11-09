"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import SeatZoneEditor, { type Zone } from './SeatZoneEditor';
import PosterPicker from './PosterPicker';
import { getSchedule, buildDerivedFields, validateMovieForm, type Schedule } from './screeningSchedule';
import { resolveVipZone, type VipConfig } from '../../../lib/seatGrid';

// 상영 폼(movie_settings 행 + 화면에서 고친 값)
export type MovieForm = VipConfig & {
  id?: number;
  title?: string;
  date_string?: string;
  db_date?: string;
  venue?: string;
  poster_url?: string;
  poster_cdn_url?: string | null;
  deadline_date?: string | null;
  age_rating?: string;
  defective_seats?: string[];
  [key: string]: unknown;
};
type SetForm = Dispatch<SetStateAction<MovieForm>>;

const VENUE_MID = '대구과학고등학교 중강당';
const VENUE_GRAND = '대구과학고등학교 대강당';
const isGrand = (form: MovieForm) => String(form.venue ?? '').includes('대강당');

interface Props {
  movieInfo: MovieForm | null;
  baseline: MovieForm | null; // movieInfo로 만든 폼(바뀐 곳 비교용)
  editForm: MovieForm;
  setEditForm: SetForm;
  onResetForm: () => void;
  onSave: () => Promise<boolean>;
  posterStatus: string | null;
  onPosterFile: (file: File) => Promise<void>;

  isStartingNewMovie: boolean;
  onOpenNewMovie: () => void;
  onCloseNewMovie: () => void;
  newMovieForm: MovieForm;
  setNewMovieForm: SetForm;
  newPosterStatus: string | null;
  onNewPosterFile: (file: File) => Promise<void>;
  onSubmitNewMovie: () => Promise<boolean>;

  kioskPassword: string;
  setKioskPassword: (v: string) => void;
  onUpdateKioskPassword: () => Promise<boolean>;
}

// 빈 칸 기본값은 lib/seatGrid.ts computeVipSeats와 같은 resolveVipZone을 쓴다(홈 화면과 같은 네모).
const zoneFromForm = (form: MovieForm): Zone => resolveVipZone(isGrand(form), form);

const zonePatch = (form: MovieForm, z: Zone): Partial<MovieForm> => {
  const p = isGrand(form) ? 'grand' : 'mid';
  return {
    [`${p}_vip_start_row`]: z.startRow,
    [`${p}_vip_end_row`]: z.endRow,
    [`${p}_vip_start_col`]: z.startCol,
    [`${p}_vip_end_col`]: z.endCol,
  };
};

const VIP_KEYS = ['start_row', 'end_row', 'start_col', 'end_col'].flatMap((k) => [`mid_vip_${k}`, `grand_vip_${k}`]);
const sameTime = (a?: string | null, b?: string | null) => {
  if (!a && !b) return true;
  const ta = new Date(a ?? '').getTime();
  const tb = new Date(b ?? '').getTime();
  return Number.isNaN(ta) || Number.isNaN(tb) ? a === b : ta === tb;
};
const sortedJoin = (v?: string[]) => [...(v ?? [])].sort().join(',');

// 저장 바에 보일 "바뀐 곳" 이름 목록
export function changedLabels(base: MovieForm | null, form: MovieForm): string[] {
  if (!base) return [];
  const out: string[] = [];
  if ((form.title ?? '') !== (base.title ?? '')) out.push('영화 제목');
  if ((form.poster_url ?? '') !== (base.poster_url ?? '')) out.push('포스터');
  if ((form.date_string ?? '') !== (base.date_string ?? '')) out.push('상영 시간');
  if ((form.venue ?? '') !== (base.venue ?? '')) out.push('상영 장소');
  if ((form.age_rating ?? '') !== (base.age_rating ?? '')) out.push('관람 등급');
  if (!sameTime(form.deadline_date, base.deadline_date)) out.push('예매 마감');
  if ((form.vip_enabled ?? true) !== (base.vip_enabled ?? true) || VIP_KEYS.some((k) => String(form[k] ?? '') !== String(base[k] ?? ''))) out.push('동아리 전용 좌석');
  if (sortedJoin(form.defective_seats) !== sortedJoin(base.defective_seats)) out.push('불편 좌석');
  return out;
}

// 검증 후 실행. 경고는 한 번 더 누르면 진행한다(확인창 대신).
function useCheckedSubmit(form: MovieForm, submit: () => Promise<boolean>) {
  const [notice, setNotice] = useState<{ kind: 'error' | 'warn'; text: string; form: MovieForm } | null>(null);
  const [busy, setBusy] = useState(false);
  // 폼이 바뀌면 지난 검증 문구는 버린다.
  const current = notice && notice.form === form ? notice : null;
  const run = async () => {
    const v = validateMovieForm(form);
    if (v?.error) { setNotice({ kind: 'error', text: v.error, form }); return; }
    if (v?.warn && current?.kind !== 'warn') { setNotice({ kind: 'warn', text: v.warn.replace(' 그래도 저장할까요?', ''), form }); return; }
    setBusy(true);
    try {
      if (await submit()) setNotice(null);
    } finally { setBusy(false); }
  };
  return { notice: current, busy, run, forced: current?.kind === 'warn' };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-5 min-h-[52px] border-b border-line">
      <span className="w-[72px] sm:w-24 shrink-0 text-[13px] text-dim">{label}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </label>
  );
}

const inputCls = 'w-full h-11 bg-transparent text-[15px] font-medium text-ink outline-none focus:bg-card px-1 -mx-1';

function MovieFields({ form, setForm }: { form: MovieForm; setForm: SetForm }) {
  const set = (patch: Partial<MovieForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const sched = getSchedule(form);
  // 입력이 바뀌면 date_string / db_date / deadline_date 를 항상 같이 다시 만든다.
  const setSched = (patch: Partial<Schedule>) => setForm((prev) => ({ ...prev, ...buildDerivedFields({ ...getSchedule(prev), ...patch }) }));
  return (
    <div className="flex flex-col border-t border-ink">
      <Row label="영화 제목"><input type="text" value={form.title ?? ''} onChange={e => set({ title: e.target.value })} className={inputCls} /></Row>
      <Row label="상영 시작"><input type="datetime-local" value={sched.start} onChange={e => setSched({ start: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls} /></Row>
      <Row label="끝나는 시간"><input type="time" value={sched.end} onChange={e => setSched({ end: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls} /></Row>
      <Row label="상영 장소">
        <select value={form.venue ?? ''} onChange={e => set({ venue: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls}>
          <option value={VENUE_MID}>중강당</option>
          <option value={VENUE_GRAND}>대강당</option>
        </select>
      </Row>
      <Row label="관람 등급">
        <select value={form.age_rating ?? '전체관람가'} onChange={e => set({ age_rating: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls}>
          <option value="전체관람가">전체관람가</option>
          <option value="12세이상관람가">12세 이상 관람가</option>
          <option value="15세이상관람가">15세 이상 관람가</option>
          <option value="청소년관람불가">청소년 관람불가</option>
        </select>
      </Row>
      <Row label="예매 마감"><input type="datetime-local" value={sched.deadline} onChange={e => setSched({ deadline: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls} /></Row>
      <p className="pt-2 text-xs text-mute break-keep">화면에는 &quot;{form.date_string || '상영 일시 미입력'}&quot;로 보여요. 시간은 모두 한국 시간이에요.</p>
    </div>
  );
}

function SeatSection({ form, setForm }: { form: MovieForm; setForm: SetForm }) {
  return (
    <section className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink pb-2.5">
        <h2 className="text-lg font-black">좌석 <span className="text-[13px] font-medium text-dim">· {isGrand(form) ? '대강당' : '중강당'}</span></h2>
        <span className="text-xs text-dim">상영 장소를 바꾸면 여기도 따라 바뀝니다</span>
      </div>
      <SeatZoneEditor
        isGrandHall={isGrand(form)}
        vipEnabled={form.vip_enabled ?? true}
        onVipEnabledChange={(v) => setForm((prev) => ({ ...prev, vip_enabled: v }))}
        zone={zoneFromForm(form)}
        onZoneChange={(z) => setForm((prev) => ({ ...prev, ...zonePatch(prev, z) }))}
        defective={form.defective_seats ?? []}
        onDefectiveChange={(ids) => setForm((prev) => ({ ...prev, defective_seats: ids }))}
      />
    </section>
  );
}

const noticeCls = (kind: 'error' | 'warn') => (kind === 'error' ? 'text-danger' : 'text-ink');

export default function MovieTab(p: Props) {
  const save = useCheckedSubmit(p.editForm, p.onSave);
  const start = useCheckedSubmit(p.newMovieForm, p.onSubmitNewMovie);
  const [kioskOpen, setKioskOpen] = useState(false);

  if (p.isStartingNewMovie) {
    const f = p.newMovieForm;
    return (
      <div className="max-w-[884px] flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <button type="button" onClick={p.onCloseNewMovie} className="self-start text-[13px] text-sub hover:text-ink">← 지금 상영으로</button>
          <h1 className="text-2xl md:text-[28px] font-black tracking-[-0.02em]">새 회차 시작</h1>
          <p className="text-sm text-dim break-keep">지금 회차「{p.movieInfo?.title ?? '없음'}」는 기록으로 옮겨지고, 이 영화로 새 예매가 열려요.</p>
        </div>
        <section className="flex flex-col sm:flex-row gap-8 items-start">
          <PosterPicker
            posterUrl={f.poster_url ?? ''}
            posterCdnUrl={f.poster_cdn_url ?? undefined}
            onUrlChange={(url) => p.setNewMovieForm((prev) => ({ ...prev, poster_url: url, poster_cdn_url: null }))}
            onFile={p.onNewPosterFile}
            status={p.newPosterStatus}
            hint={'주소나 파일은 "새 회차 시작"을 누르면 들어가요.'}
          />
          <div className="flex-1 min-w-0 w-full flex flex-col gap-3.5">
            <span className="text-xs font-medium text-sub">다음 상영</span>
            <MovieFields form={f} setForm={p.setNewMovieForm} />
          </div>
        </section>
        <SeatSection form={f} setForm={p.setNewMovieForm} />
        <div className="flex flex-col items-stretch sm:items-end gap-2 border-t border-line pt-5">
          {start.notice && <span className={`text-sm ${noticeCls(start.notice.kind)}`}>{start.notice.text}</span>}
          <button type="button" onClick={start.run} disabled={start.busy} className="h-[52px] px-8 bg-ink text-ground text-[15px] font-bold disabled:opacity-50">
            {start.busy ? '시작하는 중' : start.forced ? '그래도 새 회차 시작' : '새 회차 시작'}
          </button>
        </div>
      </div>
    );
  }

  const f = p.editForm;
  const changes = changedLabels(p.baseline, f);
  const posterUnchanged = (f.poster_url ?? '') === (p.baseline?.poster_url ?? '');

  return (
    <div className="max-w-[884px] flex flex-col gap-10 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl md:text-[28px] font-black tracking-[-0.02em]">상영</h1>
          <p className="text-sm text-dim break-keep">지금 예매받는 영화를 고칩니다. 다음 영화는 &quot;새 회차 시작&quot;으로 따로 만듭니다.</p>
        </div>
        <button type="button" onClick={p.onOpenNewMovie} className="shrink-0 h-11 px-5 border border-line-bold text-ink text-sm font-bold">새 회차 시작</button>
      </div>

      {!p.movieInfo ? (
        <p className="text-sm text-mute">지금 상영 정보가 없어요. &quot;새 회차 시작&quot;으로 만들어 주세요.</p>
      ) : (
        <>
          <section className="flex flex-col sm:flex-row gap-8 items-start">
            <PosterPicker
              posterUrl={f.poster_url ?? ''}
              posterCdnUrl={posterUnchanged ? f.poster_cdn_url ?? undefined : undefined}
              onUrlChange={(url) => p.setEditForm((prev) => ({ ...prev, poster_url: url }))}
              onFile={p.onPosterFile}
              status={p.posterStatus}
            />
            <div className="flex-1 min-w-0 w-full flex flex-col gap-3.5">
              <span className="text-xs font-medium text-sub">이번 상영</span>
              <MovieFields form={f} setForm={p.setEditForm} />
            </div>
          </section>

          <SeatSection form={f} setForm={p.setEditForm} />

          <section className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold">발권기 비밀번호</span>
                <span className="text-xs text-dim">현장 발권기를 열 때 입력해요</span>
              </div>
              <button type="button" onClick={() => setKioskOpen(o => !o)} aria-expanded={kioskOpen} className="h-10 px-4 border border-line-strong text-ink text-[13px] font-bold">바꾸기</button>
            </div>
            {kioskOpen && (
              <form
                className="flex gap-2"
                onSubmit={async (e) => { e.preventDefault(); if (await p.onUpdateKioskPassword()) setKioskOpen(false); }}
              >
                <label htmlFor="kiosk-pw" className="sr-only">발권기 비밀번호</label>
                <input id="kiosk-pw" type="text" value={p.kioskPassword} onChange={e => p.setKioskPassword(e.target.value)} className="flex-1 min-w-0 h-10 px-3 bg-card border border-line text-ink text-sm outline-none focus:border-line-bold" />
                <button type="submit" className="h-10 px-5 bg-ink text-ground text-[13px] font-bold">저장</button>
              </form>
            )}
          </section>
        </>
      )}

      {changes.length > 0 && (
        <div className="fixed z-[140] left-3 right-3 bottom-[84px] md:bottom-8 md:left-[268px] md:right-12 md:max-w-[884px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 pl-5 pr-4 bg-card border border-line-strong">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm text-sub break-keep"><b className="text-ink">{changes.length}곳</b> 바뀜 · {changes.join(', ')}</span>
            {save.notice && <span className={`text-[13px] ${noticeCls(save.notice.kind)}`}>{save.notice.text}</span>}
          </div>
          <div className="flex gap-2 shrink-0 justify-end">
            <button type="button" onClick={p.onResetForm} className="h-11 px-[18px] text-sub text-sm font-bold">되돌리기</button>
            <button type="button" onClick={save.run} disabled={save.busy} className="h-11 px-7 bg-ink text-ground text-sm font-bold disabled:opacity-50">
              {save.busy ? '저장 중' : save.forced ? '그래도 저장' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
