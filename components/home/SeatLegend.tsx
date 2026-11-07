import type { CSSProperties } from 'react';

// 좌석 범례. 기본은 동아리 전용·불편 좌석 두 개만, 대기 좌석이나 단체 예매 중일 때만 해당 항목을 덧붙인다.
type Props = {
  showVip: boolean;
  showPending?: boolean;
  showGroupPending?: boolean;
  showGroup?: boolean;
  className?: string;
};

const SWATCH = 'block w-3 h-3 md:w-4 md:h-4 box-border rounded-t-[3px] rounded-b-[2px] md:rounded-t-[5px] shrink-0';

export default function SeatLegend({ showVip, showPending, showGroupPending, showGroup, className = '' }: Props) {
  const items: { label: string; swatch: string; style?: CSSProperties }[] = [];
  if (showVip) items.push({ label: '동아리 전용', swatch: 'bg-seat border-2 border-ink' });
  items.push({ label: '불편 좌석', swatch: 'bg-seat border border-dashed border-dim' });
  if (showPending) items.push({ label: '결제 대기', swatch: 'bg-taken', style: { backgroundImage: 'repeating-linear-gradient(135deg, #2A2A2E 0 3px, #333338 3px 6px)' } });
  if (showGroupPending) items.push({ label: '단체 확인 중', swatch: 'bg-taken border border-dashed border-line-bold' });
  if (showGroup) {
    items.push({ label: '리더', swatch: 'bg-accent' });
    items.push({ label: '멤버', swatch: 'bg-seat border-2 border-accent' });
  }
  return (
    <div className={`flex flex-wrap gap-x-3.5 gap-y-1.5 md:gap-x-[18px] text-[11px] md:text-[13px] text-sub ${className}`}>
      {items.map(it => (
        <span key={it.label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`${SWATCH} ${it.swatch}`} style={it.style} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
