// app/api/admin/action/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { uploadImageDataUri } from '@/lib/cloudinary';
import { fetchSafeImage } from '@/lib/safeImageFetch';
import { extractSchoolEmails } from '@/lib/parseEmails';
import { admissionYearForGrade, gradeEmails } from '@/lib/schoolEmails';
import { loadTicketMailMovie, sendTicketMail, type TicketMailReservation } from '@/lib/ticketMail';
import { sendBlacklistMail } from '@/lib/blacklistMail';

// 이메일 행 지우기는 대소문자를 가리지 않는다(옛 행에 대문자가 섞여 있을 수 있다).
// ilike 패턴의 %, _, \ 는 글자 그대로 비교되게 이스케이프한다.
// PostgREST는 ilike 값의 * 도 와일드카드로 바꾸므로 * 가 든 주소(와 빈 값)는 null을 돌려 거절한다.
const emailPattern = (email: unknown): string | null => {
  const raw = String(email ?? '').trim();
  if (!raw || raw.includes('*')) return null;
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
};
const badEmail = () => NextResponse.json({ success: false, error: '올바른 이메일이 아니에요.' }, { status: 400 });

// 처리 결과 메일. 메일이 실패해도 이미 끝난 DB 작업은 되돌리지 않고 로그만 남긴다.
async function sendMailSafely(label: string, send: () => Promise<void>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (e) {
    console.error(`${label} mail error:`, e);
    return false;
  }
}

// 원본 포스터 링크(나무위키 등)는 며칠 뒤 만료되는 경우가 있어, 링크를
// 저장하는 시점에 바이트를 받아 Cloudinary에 영구 복사해 둔다. 실패하면
// null을 돌려주고 호출부에서 poster_cdn_url을 비워 원본 링크로 폴백시킨다.
async function rehostPosterUrl(posterUrl: string): Promise<string | null> {
  const image = await fetchSafeImage(posterUrl);
  if (!image.ok) return null;
  const base64 = Buffer.from(image.body).toString('base64');
  return uploadImageDataUri(`data:${image.contentType};base64,${base64}`);
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const adminEmail = auth.user.email as string;
    // 메일 속 링크는 클라이언트 값이 아니라 요청이 실제로 들어온 도메인으로 만든다.
    const baseUrl = new URL(req.url).origin;

    const { action, payload } = await req.json();

    switch (action) {
      case 'FETCH_INITIAL_DATA': {
        const { data: movieData, error: e1 } = await supabaseAdmin.from('movie_settings').select('*').eq('is_active', true).single();
        if (e1) throw e1;

        const [resQ, blQ, logQ, adminQ, clubQ, kioskQ, invitedQ, profileQ] = await Promise.all([
          supabaseAdmin.from('reservations')
            .select('id, seat_number, payment_status, student_name, student_id, email, popcorn_order, is_printed')
            .eq('movie_date', movieData?.db_date)
            .order('created_at', { ascending: false }),
          supabaseAdmin.from('blacklist').select('email, created_at').order('created_at', { ascending: false }),
          supabaseAdmin.from('activity_logs').select('id, created_at, student_id, student_name, description').order('created_at', { ascending: false }).limit(100),
          supabaseAdmin.from('admins').select('email, added_by, created_at').order('created_at', { ascending: false }),
          supabaseAdmin.from('club_members').select('email, added_by, created_at').order('created_at', { ascending: false }),
          supabaseAdmin.from('kiosk_settings').select('password').eq('id', 1).single(),
          supabaseAdmin.from('invited_emails').select('email, added_by, source, created_at').order('created_at', { ascending: false }),
          // 로그인 이력이 있는 사람: 이름 표시 + 회원/권한 탭의 로그인 명단(조회 전용)
          supabaseAdmin.from('profiles').select('id, email, name, student_id, role, created_at').order('created_at', { ascending: false })
        ]);

        if (resQ.error) throw resQ.error;
        if (blQ.error) throw blQ.error;
        if (logQ.error) throw logQ.error;
        if (adminQ.error) throw adminQ.error;
        if (clubQ.error) throw clubQ.error;
        if (kioskQ.error) throw kioskQ.error;
        if (invitedQ.error) throw invitedQ.error;
        if (profileQ.error) throw profileQ.error;

        return NextResponse.json({
          success: true,
          data: {
            movieData, resData: resQ.data, blData: blQ.data, logData: logQ.data,
            adminData: adminQ.data, clubData: clubQ.data, kioskPassword: kioskQ.data?.password ?? '',
            invitedData: invitedQ.data, profileNames: profileQ.data
          }
        });
      }

      case 'UPDATE_SETTINGS': {
        const updatePayload = { ...payload };
        // deadline_date는 timestamptz라 폼의 빈 문자열을 그대로 넣으면 캐스팅 오류가 난다(미정 = null).
        if (updatePayload.deadline_date === '') updatePayload.deadline_date = null;
        if (typeof updatePayload.poster_url === 'string' && updatePayload.poster_url) {
          const { data: current } = await supabaseAdmin.from('movie_settings')
            .select('poster_url').eq('is_active', true).single();
          if (current?.poster_url !== updatePayload.poster_url) {
            updatePayload.poster_cdn_url = await rehostPosterUrl(updatePayload.poster_url);
          }
        }

        const { error } = await supabaseAdmin.from('movie_settings').update(updatePayload).eq('is_active', true);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      // 원본 포스터를 Cloudinary에 복사해 두고 URL을 저장한다. 원본 호스트가
      // 프로덕션(Cloudflare Workers)에서 간헐적으로 fetch 실패하는 것을 우회한다.
      case 'UPLOAD_POSTER_CDN': {
        const { movieId, imageBase64 } = payload;
        if (!movieId || typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) {
          return NextResponse.json({ success: false, error: 'movieId와 이미지 데이터가 필요합니다.' }, { status: 400 });
        }

        const url = await uploadImageDataUri(imageBase64);
        if (!url) {
          return NextResponse.json({ success: false, error: 'Cloudinary 업로드에 실패했습니다.' }, { status: 502 });
        }

        const { error } = await supabaseAdmin
          .from('movie_settings')
          .update({ poster_cdn_url: url })
          .eq('id', movieId);
        if (error) throw error;

        return NextResponse.json({ success: true, url });
      }

      // 새 회차 시작: 현재 상영중인 영화를 이력으로 보존(is_active=false)하고
      // 새 movie_settings 행을 활성 상태로 생성한다. 예매(reservations)는 movie_settings_id로
      // 이전 회차에 계속 연결되어 있으므로 삭제하지 않는다(과거 CLEAR_RESERVATIONS 완전 대체).
      case 'START_NEW_MOVIE': {
        const { data: prevActive } = await supabaseAdmin.from('movie_settings').select('id').eq('is_active', true).maybeSingle();

        const { error: deactivateError } = await supabaseAdmin.from('movie_settings').update({ is_active: false }).eq('is_active', true);
        if (deactivateError) throw deactivateError;

        const insertPayload = { ...payload };
        if (insertPayload.deadline_date === '') insertPayload.deadline_date = null;
        if (typeof insertPayload.poster_url === 'string' && insertPayload.poster_url) {
          insertPayload.poster_cdn_url = await rehostPosterUrl(insertPayload.poster_url);
        }

        const { data: newMovie, error: insertError } = await supabaseAdmin.from('movie_settings')
          .insert([{ ...insertPayload, is_active: true }]).select('*').single();
        if (insertError) {
          // 새 행 생성 실패 시 활성 회차가 하나도 없는 상태로 남지 않도록 이전 회차를 복구.
          if (prevActive) await supabaseAdmin.from('movie_settings').update({ is_active: true }).eq('id', prevActive.id);
          throw insertError;
        }

        return NextResponse.json({ success: true, data: newMovie });
      }

      case 'LIST_MOVIE_HISTORY': {
        const { data, error } = await supabaseAdmin.from('movie_settings')
          .select('*').eq('is_active', false).order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'FETCH_HISTORY_RESERVATIONS': {
        const { movieSettingsId } = payload;
        const { data, error } = await supabaseAdmin.from('reservations')
          .select('id, seat_number, payment_status, student_name, student_id, email, popcorn_order, is_printed')
          .eq('movie_settings_id', movieSettingsId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'APPROVE_RESERVATION': {
        const { id, studentId, studentName, seatNumber } = payload;
        const { data: approved, error: updateError } = await supabaseAdmin.from('reservations')
          .update({ payment_status: 'confirmed' }).eq('id', id).select('*').single();
        if (updateError) throw updateError;

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: studentId, student_name: studentName,
          description: `관리자 승인 (${seatNumber})`
        }]);

        const mailSent = await sendMailSafely('Approve', () =>
          sendTicketMail({ reservation: approved as TicketMailReservation, statusType: 'confirmed', baseUrl }));
        return NextResponse.json({ success: true, mailSent });
      }

      case 'CANCEL_RESERVATION': {
        const { id, studentId, studentName, seatNumber, description } = payload;
        const { data: canceled, error: deleteError } = await supabaseAdmin.from('reservations')
          .delete().eq('id', id).select('*').maybeSingle();
        if (deleteError) throw deleteError;

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: studentId, student_name: studentName,
          description: description || `관리자 강제 취소 (${seatNumber})`
        }]);

        const mailSent = canceled ? await sendMailSafely('Cancel', () =>
          sendTicketMail({ reservation: canceled as TicketMailReservation, statusType: 'canceled', baseUrl })) : false;
        return NextResponse.json({ success: true, mailSent });
      }

      case 'RESET_PRINT': {
        const { id, studentId, studentName, seatNumber } = payload;
        const { error } = await supabaseAdmin.from('reservations').update({ is_printed: false }).eq('id', id);
        if (error) throw error;

        await supabaseAdmin.from('activity_logs').insert([{
          student_id: studentId, student_name: studentName,
          description: `관리자 티켓 발권 상태 초기화 (${seatNumber})`
        }]);

        return NextResponse.json({ success: true });
      }

      case 'ADD_BLACKLIST_BULK': {
        const { emails, movieDate } = payload;
        const cleanEmails = Array.from(new Set((emails as string[] || [])
          .map(e => String(e).trim().toLowerCase())
          .filter(e => e.endsWith('@ts.hs.kr'))));

        if (cleanEmails.length === 0) {
          return NextResponse.json({ success: false, error: '@ts.hs.kr 이메일이 없습니다.' }, { status: 400 });
        }

        type ReservationRow = TicketMailReservation & { student_id: string | null };
        const results: { email: string; name: string; canceledTicket: ReservationRow | null }[] = [];

        for (const email of cleanEmails) {
          const { data: existingTickets } = await supabaseAdmin.from('reservations')
            .select('*')
            .eq('email', email)
            .eq('movie_date', movieDate);

          let canceledTicket: ReservationRow | null = null;
          let name: string;

          if (existingTickets && existingTickets.length > 0) {
            const ticket = existingTickets[0] as ReservationRow;
            canceledTicket = ticket;
            name = ticket.student_name;
            await supabaseAdmin.from('reservations').delete().eq('id', ticket.id);
            await supabaseAdmin.from('activity_logs').insert([{
              student_id: ticket.student_id, student_name: ticket.student_name,
              description: `블랙리스트 등록 및 예매 자동 취소 (${ticket.seat_number})`
            }]);
          } else {
            const { data: prof } = await supabaseAdmin.from('profiles').select('name').eq('email', email).maybeSingle();
            name = prof?.name ?? email;
          }

          results.push({ email, name, canceledTicket });
        }

        const { error: blError } = await supabaseAdmin
          .from('blacklist')
          .upsert(cleanEmails.map(email => ({ email })), { onConflict: 'email', ignoreDuplicates: true });
        if (blError) throw blError;

        // 취소된 예매는 모두 같은 활성 회차라 회차 정보는 한 번만 읽는다.
        const firstCanceled = results.find(r => r.canceledTicket)?.canceledTicket;
        const movie = firstCanceled ? await loadTicketMailMovie(firstCanceled.movie_settings_id) : null;
        for (const r of results) {
          const ticket = r.canceledTicket;
          if (ticket) {
            await sendMailSafely('Blacklist cancel', () =>
              sendTicketMail({ reservation: { ...ticket, email: r.email }, statusType: 'canceled', baseUrl, movie }));
          }
          await sendMailSafely('Blacklist added', () => sendBlacklistMail({ email: r.email, name: r.name, added: true }));
        }

        return NextResponse.json({ success: true, results });
      }

      case 'REMOVE_BLACKLIST': {
        const { email } = payload;
        const pattern = emailPattern(email);
        if (!pattern) return badEmail();
        const { error } = await supabaseAdmin.from('blacklist').delete().ilike('email', pattern);
        if (error) throw error;

        const { data: prof } = await supabaseAdmin.from('profiles').select('name').ilike('email', pattern).limit(1).maybeSingle();
        const name = prof?.name ?? email;
        await sendMailSafely('Blacklist removed', () => sendBlacklistMail({ email, name, added: false }));
        return NextResponse.json({ success: true, name });
      }

      case 'LIST_ADMINS': {
        const { data, error } = await supabaseAdmin.from('admins').select('email, added_by, created_at').order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'ADD_ADMIN': {
        const { email } = payload;
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail.endsWith('@ts.hs.kr')) {
          return NextResponse.json({ success: false, error: '@ts.hs.kr 이메일만 등록할 수 있습니다.' }, { status: 400 });
        }
        const { error } = await supabaseAdmin.from('admins').insert([{ email: cleanEmail, added_by: adminEmail }]);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case 'REMOVE_ADMIN': {
        const { email } = payload;
        if (String(email ?? '').trim().toLowerCase() === adminEmail.toLowerCase()) {
          return NextResponse.json({ success: false, error: '본인 계정은 스스로 제거할 수 없습니다.' }, { status: 400 });
        }
        const pattern = emailPattern(email);
        if (!pattern) return badEmail();
        const { error } = await supabaseAdmin.from('admins').delete().ilike('email', pattern);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case 'LIST_CLUB_MEMBERS': {
        const { data, error } = await supabaseAdmin.from('club_members').select('email, added_by, created_at').order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'ADD_CLUB_MEMBERS': {
        const { emails } = payload;
        const cleanEmails = Array.from(new Set((emails as string[] || [])
          .map(e => String(e).trim().toLowerCase())
          .filter(e => e.endsWith('@ts.hs.kr'))));

        if (cleanEmails.length === 0) {
          return NextResponse.json({ success: false, error: '@ts.hs.kr 이메일이 없습니다.' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
          .from('club_members')
          .upsert(cleanEmails.map(email => ({ email, added_by: adminEmail })), { onConflict: 'email', ignoreDuplicates: true });
        if (error) throw error;
        return NextResponse.json({ success: true, added: cleanEmails.length });
      }

      case 'REMOVE_CLUB_MEMBER': {
        const { email } = payload;
        const pattern = emailPattern(email);
        if (!pattern) return badEmail();
        const { error } = await supabaseAdmin.from('club_members').delete().ilike('email', pattern);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      // 초대 명단: 예매 자격(동아리원/관리자는 항상 포함). 관리자 수동 추가(manual)와
      // 홍보 메일 발송 성공자 자동 추가(promo_mail)가 같은 액션을 쓰되, 메일 발송 API와는 분리된 호출이다.
      case 'ADD_INVITED_EMAILS': {
        const { emails } = payload;
        const source = payload?.source === 'promo_mail' ? 'promo_mail' : 'manual';
        const cleanEmails = Array.from(new Set((emails as string[] || [])
          .map(e => String(e).trim().toLowerCase())
          .filter(e => e.endsWith('@ts.hs.kr'))));

        if (cleanEmails.length === 0) {
          return NextResponse.json({ success: false, error: '@ts.hs.kr 이메일이 없습니다.' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
          .from('invited_emails')
          .upsert(cleanEmails.map(email => ({ email, added_by: adminEmail, source })), { onConflict: 'email', ignoreDuplicates: true });
        if (error) throw error;
        return NextResponse.json({ success: true, added: cleanEmails.length });
      }

      case 'REMOVE_INVITED_EMAIL': {
        const { email } = payload;
        const pattern = emailPattern(email);
        if (!pattern) return badEmail();
        const { error } = await supabaseAdmin.from('invited_emails').delete().ilike('email', pattern);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case 'SEARCH_PROFILE': {
        const { query } = payload;
        const q = String(query || '').replace(/[^a-zA-Z0-9가-힣.@_\-\s]/g, '').trim().slice(0, 40);
        if (!q) return NextResponse.json({ success: true, data: [] });
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select('id, email, student_id, name, role')
          .or(`email.ilike.%${q}%,name.ilike.%${q}%,student_id.eq.${q}`)
          .limit(10);
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'UPDATE_PROFILE': {
        const { id, studentId, name, role } = payload;
        if (!['student', 'staff'].includes(role)) {
          return NextResponse.json({ success: false, error: 'role은 student 또는 staff여야 합니다.' }, { status: 400 });
        }
        const cleanStudentId = role === 'staff' ? null : String(studentId || '').trim();
        if (role === 'student' && !/^\d{4}$/.test(cleanStudentId || '')) {
          return NextResponse.json({ success: false, error: '학생은 학번 4자리가 필요합니다.' }, { status: 400 });
        }
        const { error } = await supabaseAdmin.from('profiles')
          .update({ student_id: cleanStudentId, name: String(name || '').trim(), role })
          .eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case 'FETCH_HISTORY_REVIEWS': {
        const { movieSettingsId } = payload;
        const { data, error } = await supabaseAdmin.from('movie_reviews')
          .select('id, user_id, user_name, rating, content, created_at, profiles(email)')
          .eq('movie_settings_id', movieSettingsId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'DELETE_REVIEW': {
        const { id } = payload;
        const { error } = await supabaseAdmin.from('movie_reviews').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case 'UPDATE_KIOSK_PASSWORD': {
        const { password } = payload;
        const cleanPassword = String(password || '').trim();
        if (!cleanPassword) {
          return NextResponse.json({ success: false, error: '비밀번호를 입력해주세요.' }, { status: 400 });
        }
        const { error } = await supabaseAdmin.from('kiosk_settings').update({ password: cleanPassword, updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      // 홍보 메일 수신자 명단을 서버에서 조립한다.
      //   club: club_members 전체 / invited: invited_emails 전체
      //   grades: ['g1'|'g2'|'g3'] -> 학년도 경계 기준으로 입학년도 자동 매핑 후 0001~0110 생성
      //   manualText: 자유 텍스트에서 @ts.hs.kr 이메일만 추출
      // 최종 = 합집합 - 블랙리스트, profiles와 매칭되면 이름을 채워 반환.
      case 'RESOLVE_PROMO_RECIPIENTS': {
        const club: boolean = !!payload?.club;
        const invited: boolean = !!payload?.invited;
        const grades: string[] = Array.isArray(payload?.grades) ? payload.grades : [];
        const manualText: string = typeof payload?.manualText === 'string' ? payload.manualText : '';

        const emailSet = new Set<string>();
        // 관리자 화면의 "겹치는 사람 빼기" 숫자용: 고른 명단을 그냥 더한 수
        let rawCount = 0;
        const add = (e: string) => { rawCount++; emailSet.add(e.toLowerCase()); };

        if (club) {
          const { data, error } = await supabaseAdmin.from('club_members').select('email');
          if (error) throw error;
          (data ?? []).forEach((r: { email: string }) => add(r.email));
        }

        if (invited) {
          const { data, error } = await supabaseAdmin.from('invited_emails').select('email');
          if (error) throw error;
          (data ?? []).forEach((r: { email: string }) => add(r.email));
        }

        grades
          .filter((g): g is 'g1' | 'g2' | 'g3' => g === 'g1' || g === 'g2' || g === 'g3')
          .forEach((g) => {
            gradeEmails(admissionYearForGrade(g)).forEach((e) => add(e));
          });

        extractSchoolEmails(manualText).forEach((e) => add(e));

        const uniqueCount = emailSet.size;
        // 블랙리스트 제외
        const { data: blRows, error: blError } = await supabaseAdmin.from('blacklist').select('email');
        if (blError) throw blError;
        (blRows ?? []).forEach((r: { email: string }) => emailSet.delete(r.email.toLowerCase()));

        const emails = Array.from(emailSet);

        // 이름 매핑 (로그인 이력이 있는 사람만)
        const nameByEmail = new Map<string, string>();
        for (let i = 0; i < emails.length; i += 100) {
          const slice = emails.slice(i, i + 100);
          const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('email, name')
            .in('email', slice);
          if (error) throw error;
          (data ?? []).forEach((r: { email: string; name: string }) => {
            if (r.name) nameByEmail.set(r.email.toLowerCase(), r.name);
          });
        }

        const recipients = emails.map((email) => ({ email, name: nameByEmail.get(email) ?? null }));
        return NextResponse.json({
          success: true,
          data: { recipients, count: recipients.length, overlap: rawCount - uniqueCount, blocked: uniqueCount - recipients.length },
        });
      }

      case 'LOG_PROMO_SENT': {
        const count = Number(payload?.count) || 0;
        const { error } = await supabaseAdmin.from('activity_logs').insert([{
          student_id: '관리자',
          student_name: '-',
          description: `홍보 이메일 발송 (${count}명)`,
        }]);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Admin API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
