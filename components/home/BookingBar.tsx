// 예매 홈 하단 예매 영역. PC는 좌석표 아래 가는 선 뒤의 띠, 폰은 화면 아래 고정 바다.
// 상태(고른 좌석·내 예매·자리 이동·단체 예매·마감)에 따라 내용만 바뀐다.
type Action = { label: string; onClick(): void; disabled?: boolean };

type Props = {
  // 큰 글씨로 보일 좌석 번호. null이면 hint만 보통 글씨로 보인다.
  seatLabel: string | null;
  hint?: string;
  primary: Action | null;
  secondary?: (Action & { danger?: boolean })[];
};

export default function BookingBar({ seatLabel, hint, primary, secondary = [] }: Props) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] md:static md:z-auto md:bg-transparent md:px-0 md:pt-6 md:pb-0">
      <div className="flex items-center gap-3 md:flex-wrap md:justify-between md:gap-5">
        <div className="min-w-0 flex flex-col md:flex-row md:items-baseline md:gap-4">
          {seatLabel ? (
            <>
              {hint && <span className="text-[11px] md:text-[13px] text-dim whitespace-nowrap">{hint}</span>}
              <span className="text-[22px] md:text-[32px] leading-tight font-black tracking-[-0.02em] whitespace-nowrap">{seatLabel}</span>
            </>
          ) : (
            <span className="text-sm md:text-[15px] text-sub break-keep py-3 md:py-0">{hint}</span>
          )}
        </div>
        {(primary || secondary.length > 0) && (
          <div className="flex-1 md:flex-none flex items-center justify-end gap-2 md:gap-3 min-w-0">
            {secondary.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                disabled={a.disabled}
                className={`h-[50px] md:h-14 px-3 md:px-6 border border-line-strong text-sm md:text-[15px] font-bold whitespace-nowrap transition-colors hover:border-line-bold disabled:text-mute disabled:cursor-not-allowed disabled:hover:border-line-strong ${a.danger ? 'text-accent' : 'text-ink'}`}
              >
                {a.label}
              </button>
            ))}
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                disabled={primary.disabled}
                className="flex-1 md:flex-none h-[50px] md:h-14 px-4 md:px-14 bg-ink text-ground text-base font-bold tracking-[0.04em] whitespace-nowrap transition-colors hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {primary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
