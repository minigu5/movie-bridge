// 폰 좌석 구역 고르기. 극장 배치도 하나가 곧 버튼이다(스크린 막대 아래 구역 네모를 실제 위치대로).
import { getZones, type ZoneKey } from '@/lib/seatZones';

type Props = {
  isGrandHall: boolean;
  active: ZoneKey;
  // null이면 숫자 대신 구역 이름을 쓴다(지난 회차).
  counts: Record<ZoneKey, number> | null;
  onSelect(k: ZoneKey): void;
};

export const ZONE_NAMES: Record<ZoneKey, string> = {
  L: '왼쪽', R: '오른쪽',
  FL: '앞쪽 왼쪽', FC: '앞쪽 가운데', FR: '앞쪽 오른쪽',
  BL: '뒤쪽 왼쪽', BC: '뒤쪽 가운데', BR: '뒤쪽 오른쪽',
};

export default function ZoneMap({ isGrandHall, active, counts, onSelect }: Props) {
  const zones = getZones(isGrandHall);
  const gridRows = isGrandHall ? [0, 1] : [0];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="block w-[72%] h-[3px] rounded-sm bg-dim" />
      {gridRows.map(gr => (
        <div
          key={gr}
          className={`w-full grid ${isGrandHall ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3.5'} ${gr === 1 ? 'mt-1.5' : ''}`}
        >
          {zones.filter(z => z.gridRow === gr).map(z => {
            const on = z.key === active;
            const name = ZONE_NAMES[z.key];
            const height = !isGrandHall ? 'h-16' : gr === 0 ? 'h-[52px]' : 'h-[60px]';
            return (
              <button
                key={z.key}
                type="button"
                onClick={() => onSelect(z.key)}
                aria-label={counts ? `${name} 구역 · ${counts[z.key]}석 남음` : `${name} 구역`}
                aria-pressed={on}
                className={`${height} flex items-center justify-center p-0 rounded-lg border transition-colors whitespace-nowrap ${isGrandHall ? 'text-sm' : 'text-[15px]'} ${on ? 'bg-ink text-ground border-ink font-black' : 'border-line-strong text-sub font-bold hover:border-line-bold'}`}
              >
                {counts ? `${counts[z.key]}석` : name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
