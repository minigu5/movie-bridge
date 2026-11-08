"use client";

import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { extractSchoolEmails } from '../../../lib/parseEmails';
import { filterPeople, countByFilter, type PersonRow, type PeopleFilter } from '../../../lib/adminPeople';

export type PersonToggle = 'book' | 'club' | 'admin';
export type AddTarget = PersonToggle | 'block';

interface Props {
  rows: PersonRow[];
  selfEmail: string;
  onToggle(person: PersonRow, kind: PersonToggle, on: boolean): Promise<void>;
  onUnblock(person: PersonRow): void;
  /** reason: 관리자가 적은 사유(빈 문자열이면 사유 없이). 제한 안내 메일에 그대로 들어간다. */
  onBlock(person: PersonRow, reason: string): void;
  onSaveProfile(person: PersonRow, next: { name: string; studentId: string }): Promise<boolean>;
  onAdd(target: AddTarget, emails: string[], reason?: string): Promise<boolean>;
}

const CHIPS: { key: PeopleFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'canBook', label: '예매 가능' },
  { key: 'club', label: '동아리원' },
  { key: 'admin', label: '관리자' },
  { key: 'cannotBook', label: '예매 불가' },
  { key: 'blocked', label: '차단' },
];

const COLS = 'lg:grid-cols-[100px_64px_minmax(0,1fr)_236px]';

const REASON_MAX = 300;
const REASON_PLACEHOLDER = '메일에 그대로 들어가요. 비워 두면 사유 없이 보내요.';

const isSelfEmail = (email: string, selfEmail: string) => email.toLowerCase() === selfEmail.toLowerCase();

function Toggles({ person, selfEmail, onToggle, onUnblock, isBusy }: { person: PersonRow; selfEmail: string; onToggle: Props['onToggle']; onUnblock: Props['onUnblock']; isBusy(kind: PersonToggle): boolean }) {
  if (person.blocked) {
    return (
      <button type="button" onClick={() => onUnblock(person)} className="h-8 px-2.5 border border-accent text-accent text-xs font-bold whitespace-nowrap">
        차단됨 · 풀기
      </button>
    );
  }
  const autoBook = person.club || person.admin;
  const isSelf = isSelfEmail(person.email, selfEmail);
  const items: { kind: PersonToggle; label: string; on: boolean; disabled?: boolean; title?: string }[] = [
    { kind: 'book', label: '예매', on: autoBook || person.canBookDirect, disabled: autoBook, title: autoBook ? '동아리원·관리자는 자동으로 예매할 수 있어요' : undefined },
    { kind: 'club', label: '동아리원', on: person.club },
    { kind: 'admin', label: '관리자', on: person.admin, disabled: isSelf && person.admin, title: isSelf && person.admin ? '본인 관리자 권한은 끌 수 없어요' : undefined },
  ];
  return (
    <span className="flex gap-1.5">
      {items.map((t) => {
        // 요청이 끝날 때까지 그 버튼은 잠근다(두 번 눌러 켜기·끄기가 엇갈리지 않게).
        const busy = isBusy(t.kind);
        return (
          <button
            key={t.kind}
            type="button"
            aria-pressed={t.on}
            aria-busy={busy || undefined}
            disabled={t.disabled || busy}
            title={t.title}
            onClick={() => onToggle(person, t.kind, !t.on)}
            className={`h-8 px-2.5 border text-xs font-bold whitespace-nowrap disabled:cursor-not-allowed ${t.on ? 'bg-ink border-ink text-ground' : 'border-line-strong text-mute hover:text-sub'} ${t.disabled ? 'opacity-70' : busy ? 'opacity-50' : ''}`}
          >
            {t.label}
          </button>
        );
      })}
    </span>
  );
}

function PersonPanel({ person, selfEmail, onClose, onSaveProfile, onBlock }: { person: PersonRow; selfEmail: string; onClose(): void; onSaveProfile: Props['onSaveProfile']; onBlock: Props['onBlock'] }) {
  const isSelf = isSelfEmail(person.email, selfEmail);
  const [name, setName] = useState(person.name ?? '');
  const [studentId, setStudentId] = useState(person.studentId ?? '');
  const [reason, setReason] = useState('');
  const save = () => {
    if (name.trim() === (person.name ?? '') && studentId.trim() === (person.studentId ?? '')) return;
    onSaveProfile(person, { name: name.trim(), studentId: studentId.trim() });
  };
  const fieldCls = 'h-11 px-3 bg-card border border-line text-ink text-sm outline-none focus:border-line-bold';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[22px] font-black break-keep">{person.name ?? person.email}</span>
          <span className="text-[13px] text-dim break-all">{person.email}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 p-1.5 text-dim hover:text-ink"><X className="w-5 h-5" /></button>
      </div>
      {person.profileId ? (
        <>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs text-dim">이름
              <input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={save} className={fieldCls} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-dim"><span>학번 <span className="text-mute">(교직원은 비워 두기)</span></span>
              <input type="text" inputMode="numeric" maxLength={4} value={studentId} onChange={e => setStudentId(e.target.value)} onBlur={save} className={fieldCls} />
            </label>
          </div>
          <span className="text-xs text-mute">이름이나 학번은 고치고 칸을 벗어나면 저장돼요.</span>
        </>
      ) : (
        <span className="text-[13px] text-sub">아직 로그인하지 않은 사람이에요.</span>
      )}
      {person.blocked && person.blockReason && (
        <div className="flex flex-col gap-1 border-t border-line pt-4">
          <span className="text-xs text-dim">차단 사유</span>
          <span className="text-[13px] leading-relaxed text-sub whitespace-pre-line break-keep">{person.blockReason}</span>
        </div>
      )}
      {!person.blocked && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-4">
          <label className="flex flex-col gap-1.5 text-xs text-dim"><span>사유 <span className="text-mute">(선택)</span></span>
            <textarea
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={isSelf}
              placeholder={REASON_PLACEHOLDER}
              className="w-full px-3 py-2.5 bg-card border border-line text-ink text-sm resize-y outline-none focus:border-line-bold placeholder:text-mute disabled:opacity-40"
            />
          </label>
          <button
            type="button"
            onClick={() => onBlock(person, reason.trim())}
            disabled={isSelf}
            title={isSelf ? '본인은 차단할 수 없어요' : undefined}
            className="self-start h-9 text-accent text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            이 사람 차단하기
          </button>
          <span className="text-xs leading-relaxed text-mute break-keep">차단하면 예매도, 초대 메일도 막혀요. 누르면 바로 차단되고 몇 초 동안 되돌릴 수 있어요.</span>
        </div>
      )}
    </div>
  );
}

export default function PeopleTab({ rows, selfEmail, onToggle, onUnblock, onBlock, onSaveProfile, onAdd }: Props) {
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [addReason, setAddReason] = useState('');
  const [adding, setAdding] = useState(false);
  // 요청 중인 권한 버튼("이메일:종류"). ref는 같은 틱 두 번 누름도 막는다.
  const inFlight = useRef(new Set<string>());
  const [busyToggles, setBusyToggles] = useState<ReadonlySet<string>>(() => new Set());
  const toggle: Props['onToggle'] = async (person, kind, on) => {
    const key = `${person.email}:${kind}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBusyToggles(new Set(inFlight.current));
    try {
      await onToggle(person, kind, on);
    } finally {
      inFlight.current.delete(key);
      setBusyToggles(new Set(inFlight.current));
    }
  };

  const counts = useMemo(() => countByFilter(rows), [rows]);
  const visible = useMemo(() => filterPeople(rows, filter, query), [rows, filter, query]);
  const addEmails = useMemo(() => extractSchoolEmails(addText), [addText]);
  const selected = selectedEmail ? rows.find((r) => r.email === selectedEmail) ?? null : null;

  const add = async (target: AddTarget) => {
    if (addEmails.length === 0) return;
    setAdding(true);
    try {
      if (target === 'block') {
        if (await onAdd(target, addEmails, addReason.trim())) { setAddText(''); setAddReason(''); }
      } else if (await onAdd(target, addEmails)) setAddText('');
    } finally { setAdding(false); }
  };

  const panel = selected && (
    <PersonPanel
      key={selected.email}
      person={selected}
      selfEmail={selfEmail}
      onClose={() => setSelectedEmail(null)}
      onSaveProfile={onSaveProfile}
      onBlock={(p, reason) => { onBlock(p, reason); }}
    />
  );

  return (
    <div className="flex gap-8 items-start">
      <section className="flex-1 min-w-0 flex flex-col gap-[22px]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl md:text-[28px] font-black tracking-[-0.02em]">사람</h1>
            <p className="text-sm text-dim break-keep">한 번이라도 로그인했거나 명단에 넣은 사람 모두. 권한은 줄에서 바로, 이름·학번은 이름을 눌러 오른쪽에서 고쳐요.</p>
          </div>
          <button type="button" onClick={() => setAddOpen(o => !o)} aria-expanded={addOpen} className="shrink-0 h-11 px-5 bg-ink text-ground text-sm font-bold">사람 넣기</button>
        </div>

        {addOpen && (
          <div className="flex flex-col gap-2.5 p-4 bg-card border border-line">
            <label htmlFor="people-add" className="text-xs text-dim">이름과 이메일을 아무렇게나 붙여넣어도 학교 이메일만 골라내요.</label>
            <textarea
              id="people-add"
              rows={3}
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              placeholder="예) 2208 신민규 <ts250024@ts.hs.kr>"
              className="w-full px-3.5 py-3 bg-ground border border-line text-ink text-sm resize-y outline-none focus:border-line-bold placeholder:text-mute"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-sub mr-auto">이메일 <b className="text-ink">{addEmails.length}</b>개 찾음 · 어디에 넣을까요</span>
              {([['book', '예매'], ['club', '동아리원'], ['admin', '관리자']] as const).map(([k, label]) => (
                <button key={k} type="button" disabled={adding || addEmails.length === 0} onClick={() => add(k)} className="h-9 px-3.5 border border-line-strong text-ink text-[13px] font-bold disabled:opacity-40">{label}</button>
              ))}
              <button type="button" disabled={adding || addEmails.length === 0} onClick={() => add('block')} className="h-9 pl-3.5 pr-1 ml-1 border-l border-line text-accent text-[13px] font-bold disabled:opacity-40">차단에 넣기</button>
            </div>
            <label className="flex flex-col gap-1.5 text-xs text-dim"><span>차단 사유 <span className="text-mute">(차단에 넣을 때만, 선택 · 모두 같은 사유)</span></span>
              <textarea
                rows={2}
                maxLength={REASON_MAX}
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                placeholder={REASON_PLACEHOLDER}
                className="w-full px-3.5 py-2.5 bg-ground border border-line text-ink text-sm resize-y outline-none focus:border-line-bold placeholder:text-mute"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => {
            const on = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.key)}
                className={`h-9 px-3.5 rounded-[18px] border text-[13px] font-bold whitespace-nowrap ${on ? 'bg-ink border-ink text-ground' : 'border-line-strong text-sub'}`}
              >
                {c.label} <span className={`font-normal ${on ? 'text-line-bold' : 'text-mute'}`}>{counts[c.key]}</span>
              </button>
            );
          })}
          <label htmlFor="people-q" className="sr-only">이름, 학번, 이메일 찾기</label>
          <input
            id="people-q"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름 · 학번 · 이메일 찾기"
            className="w-full sm:w-[220px] sm:ml-auto h-11 sm:h-9 px-3.5 bg-card border border-line text-ink text-[13px] outline-none focus:border-line-bold placeholder:text-mute"
          />
        </div>

        <div className="flex flex-col border-t border-ink">
          <div className={`hidden lg:grid ${COLS} gap-4 px-3 py-2.5 text-xs text-dim border-b border-line`}>
            <span>이름</span><span>학번</span><span>이메일</span><span>누르면 바로 켜고 꺼져요</span>
          </div>
          {visible.length === 0 && <p className="py-10 text-center text-sm text-mute border-b border-line">해당하는 사람이 없어요.</p>}
          {visible.map((p) => (
            <div
              key={p.email}
              className={`grid grid-cols-[minmax(0,1fr)_auto] ${COLS} gap-x-4 gap-y-2 items-center min-h-[52px] px-3 py-2.5 lg:py-0 border-b border-line ${selectedEmail === p.email ? 'bg-raised' : ''}`}
            >
              <button
                type="button"
                onClick={() => setSelectedEmail(p.email)}
                className="min-w-0 text-left text-sm font-bold text-ink underline decoration-line-strong underline-offset-4 truncate"
              >
                {p.name ?? p.email.split('@')[0]}
              </button>
              <span className="text-[13px] text-sub text-right lg:text-left whitespace-nowrap">{p.studentId ?? (p.isStaff ? '교직원' : p.profileId ? '' : '—')}</span>
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] text-dim truncate" title={p.email}>{p.email}</span>
                {p.blocked && p.blockReason && <span className="text-xs text-mute truncate" title={p.blockReason}>사유: {p.blockReason}</span>}
              </span>
              <span className="justify-self-end lg:justify-self-start"><Toggles person={p} selfEmail={selfEmail} onToggle={toggle} onUnblock={onUnblock} isBusy={(kind) => busyToggles.has(`${p.email}:${kind}`)} /></span>
            </div>
          ))}
        </div>
      </section>

      {/* 넓은 화면: 오른쪽 320px 창 */}
      {selected && (
        <aside className="hidden xl:flex flex-col w-[320px] shrink-0 self-stretch border-l border-line pl-7">
          {panel}
        </aside>
      )}
      {/* 좁은 화면: 아래에서 올라오는 시트 */}
      {selected && (
        <div className="xl:hidden fixed inset-0 z-[160] flex items-end bg-black/60" onClick={() => setSelectedEmail(null)}>
          <div className="w-full max-h-[85vh] overflow-y-auto bg-ground border-t border-line-strong px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}
