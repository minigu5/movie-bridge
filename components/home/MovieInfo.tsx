// 예매 홈 상단의 영화 정보(유리 카드 하나). PC는 큰 포스터 + 2열 정보표, 폰은 작은 포스터 옆 3줄 표.
type Movie = {
  title: string;
  date_string: string;
  venue: string;
  age_rating: string;
  poster_url?: string;
  poster_cdn_url?: string;
  deadline_date?: string | null;
};

type Props = {
  movie: Movie;
  isPast: boolean;
  canGoOlder: boolean;
  canGoNewer: boolean;
  onOlder(): void;
  onNewer(): void;
  // null이면 숫자를 숨긴다(지난 회차).
  remainingSeats: number | null;
  // 이미 예매했으면 "좌석 선택하기" 대신 내 좌석을 보여 준다.
  mySeat: { seat: string; pending: boolean } | null;
  closed: boolean;
};

function formatDeadline(deadline?: string | null) {
  if (!deadline) return '미정';
  return new Date(deadline).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// "2026년 11월 14일 (토) 10:10 ~ 12:00"을 날짜와 시간으로 나눠, 칸이 좁으면 "~"에서가 아니라 둘 사이에서만 줄을 바꾼다.
function DateTime({ value }: { value: string }) {
  const m = value.match(/^(.*?\))\s+(.+)$/);
  if (!m) return <>{value}</>;
  return <><span className="whitespace-nowrap">{m[1]}</span> <span className="whitespace-nowrap">{m[2]}</span></>;
}

function Badge({ isPast, small }: { isPast: boolean; small?: boolean }) {
  return (
    <span className={`font-medium text-sub ${small ? 'text-[13px]' : 'text-[15px]'}`}>{isPast ? '지난 상영작' : '이번 상영작'}</span>
  );
}

function Nav({ canGoOlder, canGoNewer, onOlder, onNewer, small }: Pick<Props, 'canGoOlder' | 'canGoNewer' | 'onOlder' | 'onNewer'> & { small?: boolean }) {
  const cls = `text-sub hover:text-ink transition-colors whitespace-nowrap ${small ? 'text-xs min-h-9 py-2.5' : 'text-sm py-1'}`;
  return (
    <div className="flex items-center gap-4">
      {canGoOlder && <button type="button" onClick={onOlder} className={cls}>‹ 지난 상영작</button>}
      {canGoNewer && <button type="button" onClick={onNewer} className={cls}>다음 상영작 ›</button>}
    </div>
  );
}

export default function MovieInfo({ movie, isPast, canGoOlder, canGoNewer, onOlder, onNewer, remainingSeats, mySeat, closed }: Props) {
  const poster = movie.poster_cdn_url || movie.poster_url;
  const deadline = formatDeadline(movie.deadline_date);
  // 폰 표는 폭이 좁아 학교 이름을 뺀 상영관 이름만 쓴다.
  const shortVenue = movie.venue.replace(/^대구과학고등학교\s*/, '');
  const nav = { canGoOlder, canGoNewer, onOlder, onNewer };

  const pcCells: { label: string; value: React.ReactNode }[] = [
    { label: '일시', value: <DateTime value={movie.date_string} /> },
    { label: '장소', value: movie.venue },
    { label: '관람 등급', value: movie.age_rating },
  ];

  return (
    <>
      {/* PC */}
      <section className="hidden md:flex flex-wrap gap-12 items-end p-8 rounded-[20px] bg-white/5 border border-white/10 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.75)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="영화 포스터" fetchPriority="high" decoding="async" className="w-[260px] h-[372px] shrink-0 object-cover border border-line bg-seat rounded-xl shadow-[0_0_25px_rgba(0,0,0,0.6)]" />
        <div className="flex-[999_1_420px] min-w-0 flex flex-col gap-7">
          <div className="flex items-center justify-between gap-4">
            <Badge isPast={isPast} />
            <Nav {...nav} />
          </div>
          <h1 className="m-0 font-title text-[56px] leading-[1.08] font-bold tracking-[-0.02em] break-keep">{movie.title}</h1>
          <dl className="grid grid-cols-2 border-t border-line-strong">
            {pcCells.map((c, i) => (
              <div key={c.label} className={`py-3.5 border-b border-line flex gap-5 ${i % 2 === 1 ? 'pl-5' : ''}`}>
                <dt className="w-[72px] shrink-0 text-dim text-[13px] leading-[22px]">{c.label}</dt>
                <dd className="text-[15px] font-medium break-keep">{c.value}</dd>
              </div>
            ))}
            <div className="py-3.5 pl-5 border-b border-line flex gap-5">
              {isPast ? (
                <><dt className="sr-only">안내</dt><dd className="text-[15px] text-sub">좌석 배치만 볼 수 있어요</dd></>
              ) : (
                <>
                  <dt className="w-[72px] shrink-0 text-dim text-[13px] leading-[22px]">예매 마감</dt>
                  <dd className="text-[15px] font-medium break-keep">{deadline}</dd>
                </>
              )}
            </div>
          </dl>
          {!isPast && (
            <div className="flex flex-wrap items-center gap-5">
              {mySeat ? (
                <span className="flex items-baseline gap-3">
                  <span className="text-sm text-dim">내 좌석</span>
                  <b className="text-[28px] leading-none font-black text-accent tabular-nums">{mySeat.seat}</b>
                  <span className="text-sm text-sub">{mySeat.pending ? '입금 대기' : '예매 확정'}</span>
                </span>
              ) : closed ? (
                <span className="text-sm text-sub">예매가 마감되었어요</span>
              ) : (
                <a href="#seats" className="inline-flex items-center justify-center h-[52px] px-8 rounded-xl bg-ink text-ground text-[15px] font-bold tracking-[0.04em] hover:bg-white transition-colors">좌석 선택하기</a>
              )}
              {!mySeat && !closed && remainingSeats !== null && (
                <span className="text-sm text-dim">남은 좌석 <b className="text-ink">{remainingSeats}</b>석</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 폰 */}
      <section className="md:hidden flex flex-col gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between gap-3">
          <Badge isPast={isPast} small />
          <Nav {...nav} small />
        </div>
        <div className="flex gap-3.5 items-stretch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="영화 포스터" decoding="async" className="w-[84px] h-[120px] shrink-0 object-cover border border-line bg-seat rounded-[10px] shadow-[0_0_25px_rgba(0,0,0,0.6)]" />
          <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
            <h1 className="m-0 font-title text-2xl leading-[1.15] font-bold tracking-[-0.02em] break-keep">{movie.title}</h1>
            <dl className="flex flex-col border-t border-line-strong text-[13px]">
              <div className="py-1.5 border-b border-line flex gap-2.5">
                <dt className="w-12 shrink-0 text-dim text-xs leading-5">일시</dt>
                <dd className="font-medium min-w-0 break-keep"><DateTime value={movie.date_string} /></dd>
              </div>
              <div className="py-1.5 border-b border-line flex gap-2.5">
                <dt className="w-12 shrink-0 text-dim text-xs leading-5">장소</dt>
                <dd className="font-medium min-w-0 break-keep">{shortVenue} · {movie.age_rating}</dd>
              </div>
              <div className="py-1.5 border-b border-line flex gap-2.5">
                {isPast ? (
                  <><dt className="sr-only">안내</dt><dd className="text-sub">좌석 배치만 볼 수 있어요</dd></>
                ) : (
                  <>
                    <dt className="w-12 shrink-0 text-dim text-xs leading-5">마감</dt>
                    <dd className="font-medium min-w-0 break-keep">{deadline}</dd>
                  </>
                )}
              </div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
