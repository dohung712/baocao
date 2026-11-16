-- C13 Thưởng sao theo thứ hạng điểm tháng, xếp RIÊNG từng bộ phận (TGDĐ, Topzone): 4000/3500/3000/2500/2000 cho top 5.
-- QL xem đề xuất (kể cả tháng đang chạy), bấm Chốt thì mới cộng sao (một lần cho mỗi NV mỗi tháng).
insert into public.settings(key, value) values
  ('RANK_REWARDS', '[4000,3500,3000,2500,2000]'::jsonb),
  ('RANK_REWARD_DEPTS', '["TGDĐ","Topzone"]'::jsonb)
on conflict (key) do nothing;

create table if not exists public.rank_rewards (
  id bigint generated always as identity primary key,
  month date not null,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  dept text not null,
  rank int not null,
  score numeric not null,
  stars int not null,
  closed_by text,
  closed_at timestamptz not null default now(),
  unique (month, staff_id)
);
alter table public.rank_rewards enable row level security;

drop function if exists public.rank_reward_preview(date);
create or replace function public.rank_reward_preview(p_month date)
returns table (dept text, rank int, staff_id text, name text, total numeric, stars int, closed boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.memberships; v_m date := date_trunc('month', p_month)::date; v_end date; v_to date; v_rw jsonb; v_depts jsonb;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý xem được thưởng hạng.'; end if;
  v_end := (v_m + interval '1 month - 1 day')::date;
  v_to := least(v_end, public.vn_today());
  if v_to < v_m then raise exception 'Tháng này chưa bắt đầu.'; end if;
  v_rw := coalesce((select value from public.settings where key = 'RANK_REWARDS'), '[4000,3500,3000,2500,2000]'::jsonb);
  v_depts := coalesce((select value from public.settings where key = 'RANK_REWARD_DEPTS'), '["TGDĐ","Topzone"]'::jsonb);
  return query
  with b as (
    select sb.staff_id, sb.name, sb.dept, sb.total from public.score_board(v_m, v_to, v_to = v_end) sb
    where exists (select 1 from jsonb_array_elements_text(v_depts) x where lower(x) = lower(sb.dept))
  ), r as (
    select b.*, (rank() over (partition by lower(b.dept) order by b.total desc))::int rk from b
  )
  select r.dept, r.rk, r.staff_id, r.name, r.total,
    case when r.total > 0 and r.rk <= jsonb_array_length(v_rw) then (v_rw ->> (r.rk - 1))::int else 0 end,
    exists (select 1 from public.rank_rewards rr where rr.month = v_m and rr.staff_id = r.staff_id)
  from r where public.can_see_staff(r.staff_id)
  order by lower(r.dept), r.rk, r.name;
end $$;

create or replace function public.rank_reward_close(p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_m date := date_trunc('month', p_month)::date; x record; n int := 0; t int := 0;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được chốt thưởng hạng.'; end if;
  if v_m > public.vn_today() then raise exception 'Tháng này chưa bắt đầu.'; end if;
  for x in select * from public.rank_reward_preview(v_m) p where p.stars > 0 and not p.closed loop
    insert into public.rank_rewards(month, staff_id, dept, rank, score, stars, closed_by) values (v_m, x.staff_id, x.dept, x.rank, x.total, x.stars, m.email)
    on conflict (month, staff_id) do nothing;
    continue when not found;
    insert into public.star_adjustments(staff_id, delta, kind, reason, created_by)
      values (x.staff_id, x.stars, 'adjust', format('Thưởng hạng %s tháng %s (%s)', x.rank, to_char(v_m, 'MM/YYYY'), x.dept), m.email);
    insert into public.score_log(actor, staff_id, kind, action, detail, reason)
      values (m.email, x.staff_id, 'star', 'rank_reward', jsonb_build_object('delta', x.stars, 'rank', x.rank, 'month', v_m), format('Thưởng hạng %s tháng %s', x.rank, to_char(v_m, 'MM/YYYY')));
    n := n + 1; t := t + x.stars;
  end loop;
  return jsonb_build_object('status', 'success', 'count', n, 'message', case when n = 0 then 'Không có ai cần chốt (đã chốt rồi hoặc chưa có điểm).' else format('Đã cộng %s⭐ cho %s nhân viên', t, n) end);
end $$;
revoke execute on function public.rank_reward_preview(date), public.rank_reward_close(date) from public, anon;
grant execute on function public.rank_reward_preview(date), public.rank_reward_close(date) to authenticated;
