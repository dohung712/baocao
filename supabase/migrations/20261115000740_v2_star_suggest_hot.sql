-- =====================================================================
-- F2c: gợi ý sao thưởng/phạt theo kết quả siêu thị (môn tập trung / target thấp / gần về số / đã về số)
-- B12: thưởng nóng — môn target thấp, NV bán ≥ X% target siêu thị hoặc > Y% target ngày → đề xuất, quản lý duyệt
-- =====================================================================
alter table public.items add column if not exists focus boolean not null default false;        -- môn tập trung của tháng
alter table public.items add column if not exists low_target boolean not null default false;   -- môn target thấp (chạy đầu tháng)
alter table public.items add column if not exists store_target numeric;                        -- target tháng của siêu thị (từ báo cáo)
alter table public.items add column if not exists store_pct numeric;                           -- %Đạt siêu thị lần dán gần nhất
alter table public.items add column if not exists store_pct_at date;

insert into public.settings(key, value, updated_by) values ('STAR_POINTS', '{"bonus":100,"penalty":50,"focus":5,"low":3,"near":2,"other":1,"done":0,"near_min":70,"hot_stars":2000,"hot_store_pct":30,"hot_staff_pct":1000}'::jsonb, 'system')
on conflict (key) do nothing;

-- items đổi cấu trúc → dựng lại _staff_items (trả về setof items)
create or replace function public._staff_items(p_staff text, p_date date default null)
returns setof public.items
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.staff where id = p_staff),
  d as (select date_trunc('month', coalesce(p_date, public.vn_today()))::date m),
  mt as (select t.items from public.monthly_targets t, d where t.staff_id = p_staff and t.month = d.m
           and jsonb_typeof(t.items) = 'array' and jsonb_array_length(t.items) > 0),
  contest as (
    select btrim(e ->> 'name') name, (e ->> 'target')::numeric tgt, o
    from mt, jsonb_array_elements(mt.items) with ordinality x(e, o)
    where btrim(coalesce(e ->> 'name', '')) <> '' and (e ->> 'target')::numeric > 0
  ),
  from_contest as (
    select i.id, i.store, c.name, round(c.tgt / public._work_days(p_staff, (select m from d)), 3) target,
           coalesce(t.bonus_star, i.bonus_star) bonus_star, coalesce(t.penalty_star, i.penalty_star) penalty_star,
           i.is_x2, c.o::int sort, true active, i.created_at, i.is_x3, i.focus, i.low_target, i.store_target, i.store_pct, i.store_pct_at, c.o
    from contest c cross join s
    cross join lateral (select * from public.items i where i.name = c.name
                        order by i.active desc, (lower(i.store) = lower(s.dept)) desc, (i.store = 'Chung') desc, i.sort, i.id limit 1) i
    left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name
  ),
  cand as (
    select i.*,
      row_number() over (partition by i.name order by (lower(i.store) = lower(s.dept)) desc, i.sort, i.id) rn,
      min(i.sort::bigint * 1000000000 + i.id) over (partition by i.name) ord
    from public.items i, s
    where not exists (select 1 from contest) and i.active and (
      case when cardinality(s.assigned_items) > 0 then i.name = any(s.assigned_items)
      else i.store = 'Chung' or lower(i.store) = lower(s.dept) end)
  )
  select id, store, name, target, bonus_star, penalty_star, is_x2, sort, active, created_at, is_x3, focus, low_target, store_target, store_pct, store_pct_at from (
    select f.id, f.store, f.name, f.target, f.bonus_star, f.penalty_star, f.is_x2, f.sort, f.active, f.created_at, f.is_x3,
           f.focus, f.low_target, f.store_target, f.store_pct, f.store_pct_at, f.o::bigint k from from_contest f
    union all
    select c.id, c.store, c.name, coalesce(t.target, c.target), coalesce(t.bonus_star, c.bonus_star), coalesce(t.penalty_star, c.penalty_star),
           c.is_x2, c.sort, c.active, c.created_at, c.is_x3, c.focus, c.low_target, c.store_target, c.store_pct, c.store_pct_at, c.ord
    from cand c left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name where c.rn = 1
  ) z order by k
$$;
revoke execute on function public._staff_items(text, date) from public, anon, authenticated;

-- Áp dụng gợi ý: p_rows [{name, bonus, penalty, focus, low, store_target, store_pct}] cho 1 bộ phận
create or replace function public.apply_star_suggestions(p_dept text, p_rows jsonb, p_as_of date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r jsonb; v_name text; n_upd int := 0; n_new int := 0; v_id bigint; src public.items;
begin
  m := public._require_member();
  if m.role <> 'owner' then raise exception 'Chỉ chủ quản được đổi sao của môn.'; end if;
  if btrim(coalesce(p_dept, '')) = '' then raise exception 'Chưa chọn bộ phận.'; end if;
  for r in select * from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) loop
    v_name := btrim(coalesce(r ->> 'name', '')); continue when v_name = '';
    select id into v_id from public.items where store = p_dept and name = v_name;
    if v_id is null then
      -- môn đang dùng chung → tạo bản riêng cho bộ phận (ưu tiên hơn môn Chung) để không đổi sao bộ phận khác
      select * into src from public.items where name = v_name order by (store = 'Chung') desc, active desc, id limit 1;
      continue when src.id is null;
      insert into public.items(store, name, target, bonus_star, penalty_star, is_x2, is_x3, sort, active)
      values (p_dept, v_name, src.target, src.bonus_star, src.penalty_star, src.is_x2, src.is_x3, src.sort, true) returning id into v_id;
      n_new := n_new + 1;
    end if;
    update public.items set
      bonus_star = greatest(0, round(coalesce((r ->> 'bonus')::numeric, bonus_star)))::int,
      penalty_star = greatest(0, round(coalesce((r ->> 'penalty')::numeric, penalty_star)))::int,
      focus = coalesce((r ->> 'focus')::boolean, focus), low_target = coalesce((r ->> 'low')::boolean, low_target),
      store_target = coalesce(nullif(r ->> 'store_target', '')::numeric, store_target),
      store_pct = coalesce(nullif(r ->> 'store_pct', '')::numeric, store_pct),
      store_pct_at = case when nullif(r ->> 'store_pct', '') is not null then coalesce(p_as_of, public.vn_today()) else store_pct_at end
    where id = v_id;
    n_upd := n_upd + 1;
  end loop;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'STAR_SUGGEST_APPLY', p_dept, jsonb_build_object('rows', p_rows));
  return jsonb_build_object('status', 'success', 'message', format('Đã cập nhật sao %s môn của %s%s', n_upd, p_dept, case when n_new > 0 then format(' (tạo %s môn riêng cho bộ phận)', n_new) else '' end));
end $$;
grant execute on function public.apply_star_suggestions(text, jsonb, date) to authenticated;

-- ---------- Thưởng nóng ----------
create table if not exists public.hot_bonuses (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  report_date date not null,
  item_name text not null,
  actual numeric not null,
  day_target numeric,
  store_target numeric,
  reason text not null,
  stars int not null,
  status text not null default 'Chờ duyệt' check (status in ('Chờ duyệt', 'Đã duyệt', 'Từ chối')),
  created_at timestamptz not null default now(),
  reviewed_by text, reviewed_at timestamptz,
  unique (staff_id, report_date, item_name)
);
alter table public.hot_bonuses enable row level security;
drop policy if exists hot_bonuses_read on public.hot_bonuses;
create policy hot_bonuses_read on public.hot_bonuses for select to authenticated using (public.can_see_staff(staff_id));
grant select on public.hot_bonuses to authenticated;

-- Kiểm tra sau khi nộp báo cáo: tạo đề xuất thưởng nóng (mỗi môn mỗi ngày 1 lần), trả về danh sách mới
create or replace function public.check_hot_bonus(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; cfg jsonb; v_stars int; v_sp numeric; v_tp numeric; r record; v_reason text; v_new jsonb := '[]'::jsonb; v_id bigint;
begin
  m := public._member_for_staff(p_staff);
  select value into cfg from public.settings where key = 'STAR_POINTS';
  cfg := coalesce(cfg, '{}'::jsonb);
  v_stars := coalesce((cfg ->> 'hot_stars')::int, 2000); v_sp := coalesce((cfg ->> 'hot_store_pct')::numeric, 30); v_tp := coalesce((cfg ->> 'hot_staff_pct')::numeric, 1000);
  if v_stars <= 0 then return jsonb_build_object('status', 'success', 'hot', '[]'::jsonb); end if;
  for r in
    select dr.item_name, dr.actual, i.target day_target, i.store_target
    from public.daily_results dr
    join public._staff_items(p_staff, p_date) i on i.name = dr.item_name
    where dr.staff_id = p_staff and dr.report_date = p_date and dr.status in ('Về số', 'Chưa về') and i.low_target and dr.actual > 0
  loop
    v_reason := null;
    if coalesce(r.store_target, 0) > 0 and r.actual >= r.store_target * v_sp / 100 then
      v_reason := format('Bán %s = %s%% target tháng siêu thị (%s)', trim_scale(r.actual), round(100 * r.actual / r.store_target), trim_scale(r.store_target));
    elsif coalesce(r.day_target, 0) > 0 and r.actual > r.day_target * v_tp / 100 then
      v_reason := format('Bán %s = %s%% target ngày (%s)', trim_scale(r.actual), round(100 * r.actual / r.day_target), trim_scale(r.day_target));
    end if;
    continue when v_reason is null;
    insert into public.hot_bonuses(staff_id, report_date, item_name, actual, day_target, store_target, reason, stars)
    values (p_staff, p_date, r.item_name, r.actual, r.day_target, r.store_target, v_reason, v_stars)
    on conflict (staff_id, report_date, item_name) do nothing returning id into v_id;
    if v_id is not null then
      v_new := v_new || jsonb_build_object('id', v_id, 'item', r.item_name, 'actual', r.actual, 'reason', v_reason, 'stars', v_stars);
      v_id := null;
    end if;
  end loop;
  return jsonb_build_object('status', 'success', 'hot', v_new);
end $$;
grant execute on function public.check_hot_bonus(text, date) to authenticated;

create or replace function public.review_hot_bonus(p_id bigint, p_approve boolean, p_stars int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; h public.hot_bonuses; v_stars int;
begin
  select * into h from public.hot_bonuses where id = p_id for update;
  if h.id is null then raise exception 'Không tìm thấy đề xuất.'; end if;
  m := public._manager_scope(h.staff_id, null);
  if h.status <> 'Chờ duyệt' then raise exception 'Đề xuất đã được xử lý.'; end if;
  v_stars := greatest(0, coalesce(p_stars, h.stars));
  if p_approve and v_stars > 0 then
    insert into public.star_adjustments(staff_id, delta, kind, reason, created_by)
    values (h.staff_id, v_stars, 'adjust', format('🔥 Thưởng nóng %s ngày %s', h.item_name, to_char(h.report_date, 'DD/MM')), m.email);
    insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, h.staff_id, 'star', 'adjust',
      jsonb_build_object('delta', v_stars, 'hot', true, 'item', h.item_name, 'date', h.report_date));
  end if;
  update public.hot_bonuses set status = case when p_approve then 'Đã duyệt' else 'Từ chối' end, stars = v_stars, reviewed_by = m.email, reviewed_at = now() where id = p_id;
  return jsonb_build_object('status', 'success', 'message', case when p_approve then format('Đã cộng %s⭐ thưởng nóng', v_stars) else 'Đã từ chối' end);
end $$;
grant execute on function public.review_hot_bonus(bigint, boolean, int) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hot_bonuses') then
    alter publication supabase_realtime add table public.hot_bonuses;
  end if;
end $$;
