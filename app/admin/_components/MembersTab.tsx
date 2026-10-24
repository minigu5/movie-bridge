"use client";

import { Crown, Ticket, Printer, Wrench, Ban, UserCheck } from 'lucide-react';

interface ProfileRow { id: string; email: string; student_id: string | null; name: string; role: string }
interface EditingProfile { id: string; email: string; student_id: string; name: string; role: string }

interface Props {
  admins: { email: string; added_by: string | null; created_at: string }[];
  newAdminEmail: string;
  setNewAdminEmail: (v: string) => void;
  onAddAdmin: () => void;
  onRemoveAdmin: (email: string) => void;

  clubMembers: { email: string; added_by: string | null; created_at: string }[];
  newClubMembersText: string;
  setNewClubMembersText: (v: string) => void;
  clubEmailPreviewCount: number;
  onAddClubMembers: () => void;
  onRemoveClubMember: (email: string) => void;

  invitedEmails: { email: string; added_by: string | null; source: string; created_at: string }[];
  newInvitedText: string;
  setNewInvitedText: (v: string) => void;
  invitedEmailPreviewCount: number;
  onAddInvitedEmails: () => void;
  onRemoveInvitedEmail: (email: string) => void;

  kioskPasswordInput: string;
  setKioskPasswordInput: (v: string) => void;
  onUpdateKioskPassword: () => void;

  profileSearchQuery: string;
  setProfileSearchQuery: (v: string) => void;
  onSearchProfile: () => void;
  profileSearchResults: ProfileRow[];
  editingProfile: EditingProfile | null;
  setEditingProfile: (p: EditingProfile | null) => void;
  onSaveProfile: () => void;

  blacklist: { email: string; created_at: string }[];
  newBlacklistText: string;
  setNewBlacklistText: (v: string) => void;
  blacklistEmailPreviewCount: number;
  onAddBlacklistBulk: () => void;
  onRemoveBlacklist: (email: string) => void;
}

export default function MembersTab(props: Props) {
  const p = props;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
        {/* 관리자 목록 */}
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-4 flex flex-col min-w-0">
          <h2 className="text-lg font-bold text-emerald-400 mb-3 flex items-center gap-1.5"><Crown className="w-5 h-5" /> 관리자 목록</h2>
          <div className="flex gap-2 mb-3">
            <input type="text" value={p.newAdminEmail} onChange={e => p.setNewAdminEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) p.onAddAdmin(); }} placeholder="xxxx@ts.hs.kr" className="flex-1 min-w-0 p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm" />
            <button onClick={p.onAddAdmin} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded font-bold text-sm">추가</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {p.admins.map(a => (
              <div key={a.email} className="flex items-center justify-between gap-2 bg-neutral-700/50 rounded px-2 py-1 text-xs">
                <span className="text-neutral-200 truncate">{a.email}</span>
                <button onClick={() => p.onRemoveAdmin(a.email)} className="shrink-0 text-red-400 hover:text-red-300 font-bold">×</button>
              </div>
            ))}
          </div>
        </div>

        {/* 동아리원(VIP) 목록 */}
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-4 flex flex-col min-w-0">
          <h2 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-1.5"><Ticket className="w-5 h-5" /> 동아리원(VIP) 목록</h2>
          <textarea
            value={p.newClubMembersText}
            onChange={e => p.setNewClubMembersText(e.target.value)}
            placeholder={"이름과 이메일을 붙여넣으면 이메일만 자동 인식됩니다.\n예) 2208 신민규 <ts250024@ts.hs.kr>"}
            rows={3}
            className="w-full p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm resize-none mb-1"
          />
          <div className="flex items-center justify-between mb-3">
            <span className="text-neutral-500 text-xs">{p.clubEmailPreviewCount}개 이메일 인식됨</span>
            <button onClick={p.onAddClubMembers} className="bg-amber-600 hover:bg-amber-500 px-3 py-2 rounded font-bold text-sm">일괄 추가</button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {p.clubMembers.map(c => (
              <div key={c.email} className="flex items-center justify-between gap-2 bg-neutral-700/50 rounded px-2 py-1 text-xs">
                <span className="text-neutral-200 truncate">{c.email}</span>
                <button onClick={() => p.onRemoveClubMember(c.email)} className="shrink-0 text-red-400 hover:text-red-300 font-bold">×</button>
              </div>
            ))}
          </div>
        </div>

        {/* 키오스크 잠금 비밀번호 */}
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-4 flex flex-col min-w-0">
          <h2 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-1.5"><Printer className="w-5 h-5" /> 키오스크 잠금 비밀번호</h2>
          <div className="flex gap-2">
            <input type="text" value={p.kioskPasswordInput} onChange={e => p.setKioskPasswordInput(e.target.value)} className="flex-1 min-w-0 p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm" />
            <button onClick={p.onUpdateKioskPassword} className="bg-yellow-600 hover:bg-yellow-500 px-3 py-2 rounded font-bold text-sm text-black">변경</button>
          </div>
          <p className="text-neutral-500 text-xs mt-2">현장 키오스크(/print) 진입 시 입력하는 비밀번호입니다.</p>
        </div>

        {/* 사용자 프로필 수정 */}
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-4 flex flex-col min-w-0">
          <h2 className="text-lg font-bold text-pink-400 mb-3 flex items-center gap-1.5"><Wrench className="w-5 h-5" /> 사용자 프로필 수정</h2>
          <p className="text-neutral-500 text-xs mb-2">구글 이름이 잘못 인식된 경우 여기서 고칩니다.</p>
          <div className="flex gap-2 mb-3">
            <input type="text" value={p.profileSearchQuery} onChange={e => p.setProfileSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) p.onSearchProfile(); }} placeholder="이메일/이름/학번" className="flex-1 min-w-0 p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm" />
            <button onClick={p.onSearchProfile} className="bg-pink-600 hover:bg-pink-500 px-3 py-2 rounded font-bold text-sm">검색</button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto mb-3">
            {p.profileSearchResults.map(r => (
              <button
                key={r.id}
                onClick={() => p.setEditingProfile({ id: r.id, email: r.email, student_id: r.student_id ?? '', name: r.name, role: r.role })}
                className="w-full text-left bg-neutral-700/50 hover:bg-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 truncate block"
              >
                {r.email} — {r.name} ({r.student_id ?? '교직원'})
              </button>
            ))}
          </div>
          {p.editingProfile && (
            <div className="bg-neutral-900 p-3 rounded-lg border border-pink-700 space-y-2 max-h-64 overflow-y-auto">
              <p className="text-xs text-neutral-400">{p.editingProfile.email}</p>
              <select value={p.editingProfile.role} onChange={e => p.setEditingProfile({ ...p.editingProfile!, role: e.target.value })} className="w-full p-1.5 bg-neutral-700 rounded border border-neutral-600 text-white text-xs">
                <option value="student">학생</option>
                <option value="staff">교직원</option>
              </select>
              {p.editingProfile.role === 'student' && (
                <input type="text" maxLength={4} value={p.editingProfile.student_id} onChange={e => p.setEditingProfile({ ...p.editingProfile!, student_id: e.target.value })} placeholder="학번 4자리" className="w-full p-1.5 bg-neutral-700 rounded border border-neutral-600 text-white text-xs" />
              )}
              <input type="text" value={p.editingProfile.name} onChange={e => p.setEditingProfile({ ...p.editingProfile!, name: e.target.value })} placeholder="이름" className="w-full p-1.5 bg-neutral-700 rounded border border-neutral-600 text-white text-xs" />
              <div className="flex gap-2">
                <button onClick={() => p.setEditingProfile(null)} className="flex-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs font-bold">취소</button>
                <button onClick={p.onSaveProfile} className="flex-1 py-1.5 bg-pink-600 hover:bg-pink-500 rounded text-xs font-bold">저장</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 초대 명단: 예매 자격. 동아리원/관리자는 항상 포함되므로 여기에 넣지 않아도 된다. */}
      <div className="bg-neutral-800 p-6 rounded-xl border border-sky-700">
        <h2 className="text-xl font-bold text-sky-400 mb-1 flex items-center gap-1.5"><UserCheck className="w-5 h-5" /> 초대 명단 ({p.invitedEmails.length}명)</h2>
        <p className="text-neutral-500 text-xs mb-4">이 명단, 동아리원, 관리자만 예매할 수 있습니다. 홍보 메일 발송과는 별개로 관리되며, 메일을 보내도 자동으로 추가되지 않습니다.</p>
        <div className="flex flex-col md:flex-row gap-2 mb-6">
          <textarea
            value={p.newInvitedText}
            onChange={(e) => p.setNewInvitedText(e.target.value)}
            placeholder={"이름과 이메일을 붙여넣으면 이메일만 자동 인식됩니다.\n예) 2208 신민규 <ts250024@ts.hs.kr>"}
            rows={2}
            className="flex-1 p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm resize-none"
          />
          <div className="flex md:flex-col justify-between md:justify-center items-center gap-2">
            <span className="text-neutral-500 text-xs whitespace-nowrap">{p.invitedEmailPreviewCount}개 인식됨</span>
            <button onClick={p.onAddInvitedEmails} className="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded font-bold transition-colors whitespace-nowrap">일괄 추가</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
          {p.invitedEmails.length === 0 && <p className="text-neutral-500 text-sm">초대 명단이 비어 있습니다.</p>}
          {p.invitedEmails.map((user) => (
            <div key={user.email} className="bg-sky-900/40 border border-sky-800 rounded-full px-4 py-1 flex items-center gap-2">
              <span className="text-sky-200 text-sm">{user.email}</span>
              <button onClick={() => p.onRemoveInvitedEmail(user.email)} className="text-sky-400 hover:text-white font-bold ml-2">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* 블랙리스트 관리 */}
      <div className="bg-neutral-800 p-6 rounded-xl border border-red-700">
        <h2 className="text-xl font-bold text-red-400 mb-4 flex items-center gap-1.5"><Ban className="w-5 h-5" /> 블랙리스트 관리</h2>
        <div className="flex flex-col md:flex-row gap-2 mb-6">
          <textarea
            value={p.newBlacklistText}
            onChange={(e) => p.setNewBlacklistText(e.target.value)}
            placeholder={"이름과 이메일을 붙여넣으면 이메일만 자동 인식됩니다.\n예) 2208 신민규 <ts250024@ts.hs.kr>"}
            rows={2}
            className="flex-1 p-2 bg-neutral-700 rounded border border-neutral-600 outline-none text-white text-sm resize-none"
          />
          <div className="flex md:flex-col justify-between md:justify-center items-center gap-2">
            <span className="text-neutral-500 text-xs whitespace-nowrap">{p.blacklistEmailPreviewCount}개 인식됨</span>
            <button onClick={p.onAddBlacklistBulk} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-bold transition-colors whitespace-nowrap">일괄 추가</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.blacklist.length === 0 && <p className="text-neutral-500 text-sm">등록된 블랙리스트가 없습니다.</p>}
          {p.blacklist.map((user) => (
            <div key={user.email} className="bg-red-900/40 border border-red-800 rounded-full px-4 py-1 flex items-center gap-2">
              <span className="text-red-200 text-sm">{user.email}</span>
              <button onClick={() => p.onRemoveBlacklist(user.email)} className="text-red-400 hover:text-white font-bold ml-2">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
