-- 회차별 동아리 전용 좌석(VIP) 켜고 끄기.
-- vip_enabled=false면 그 회차는 VIP 좌석이 없다. 기본값 true라 기존 회차는 그대로다.
-- lib/seatGrid.ts computeVipSeats와 같은 판정. JS의 `||` 기본값(빈 문자열/0도 기본값)을 따른다.
alter table public.movie_settings
  add column if not exists vip_enabled boolean not null default true;

create or replace function public.is_vip_seat(p_ms public.movie_settings, p_seat text)
returns boolean
language sql
stable
as $$
  select coalesce(p_ms.vip_enabled, true) and exists (
    select 1
    from public.seat_grid_position(p_seat, public.is_grand_hall(p_ms)) p
    where case when public.is_grand_hall(p_ms) then
        65 + p.row_idx between ascii(coalesce(nullif(p_ms.grand_vip_start_row, ''), 'A'))
                           and ascii(coalesce(nullif(p_ms.grand_vip_end_row, ''), 'C'))
        and p.col_num between coalesce(nullif(p_ms.grand_vip_start_col, 0), 10)
                          and coalesce(nullif(p_ms.grand_vip_end_col, 0), 18)
      else
        65 + p.row_idx between ascii(coalesce(nullif(p_ms.mid_vip_start_row, ''), 'A'))
                           and ascii(coalesce(nullif(p_ms.mid_vip_end_row, ''), 'C'))
        and p.col_num between coalesce(nullif(p_ms.mid_vip_start_col, 0), 5)
                          and coalesce(nullif(p_ms.mid_vip_end_col, 0), 10)
      end
  );
$$;
