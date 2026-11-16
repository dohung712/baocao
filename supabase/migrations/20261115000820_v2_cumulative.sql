-- =====================================================================
-- C12 Cập nhật lũy kế tuần: NV nhập lũy kế tháng (DT QĐ + từng môn theo đúng loại: Số lượng / DT quy đổi / DT thực)
-- vào THỨ 2 hằng tuần hoặc khi quản lý mở khoá. Tool tự tính chênh lệch so với số đang có và ghi điều chỉnh
-- (DT: revenue_entries 'adjust'; môn: item_adjustments) → bảng điểm, Của tôi, Telegram dùng số đúng.
-- =====================================================================
-- Loại tính của môn theo tên môn (dùng chung mọi bộ phận). Bảng riêng để không đổi cấu trúc bảng items.
create table if not exists public.item_measures (
  name text primary key,
  measure text not null check (measure in ('sl', 'dtqd', 'dtt')),
  updated_by text, updated_at timestamptz not null default now()
);
alter table public.item_measures enable row level security;
drop policy if exists item_measures_read on public.item_measures;
create policy item_measures_read on public.item_measures for select to authenticated using (public.is_member());
grant select on public.item_measures to authenticated;
revoke insert, update, delete on public.item_measures from authenticated;
revoke all on public.item_measures from anon;

create table if not exists public.item_adjustments (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  item_name text not null,
  adj_date date not null,
  delta numeric not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists item_adj_idx on public.item_adjustments(staff_id, adj_date);
alter table public.item_adjustments enable row level security;
drop policy if exists item_adjustments_read on public.item_adjustments;
create policy item_adjustments_read on public.item_adjustments for select to authenticated using (public.can_see_staff(staff_id));
grant select on public.item_adjustments to authenticated;
revoke insert, update, delete on public.item_adjustments from authenticated;
revoke all on public.item_adjustments from anon;

-- Loại đo của môn: đã chọn thì theo item_measures; chưa chọn thì đoán (target nguyên & nhỏ → số lượng, còn lại DT quy đổi)
create or replace function public._item_measure(p_dept text, p_name text, p_target numeric)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('measure', x.measure, 'guess', false) from public.item_measures x where x.name = p_name),
    jsonb_build_object('measure', case when p_target is not null and p_target = trunc(p_target) and p_target <= 200 then 'sl' else 'dtqd' end, 'guess', true));
$$;

-- Cửa sổ cập nhật: thứ 2 hằng tuần, hoặc quản lý mở khoá (CUM_UNLOCK {until, staff[], by, at}); quản lý luôn cập nhật được
create or replace function public._cum_window(p_staff text, p_role text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u jsonb; v_today date := public.vn_today();
begin
  select value into u from public.settings where key = 'CUM_UNLOCK';
  if extract(isodow from v_today) = 1 then
    return jsonb_build_object('open', true, 'why', 'monday', 'since', (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh'));
  end if;
  if u is not null and (u ->> 'until')::timestamptz > now()
     and (jsonb_array_length(coalesce(u -> 'staff', '[]'::jsonb)) = 0 or (u -> 'staff') ? p_staff) then
    return jsonb_build_object('open', true, 'why', 'unlock', 'until', u ->> 'until', 'since', u ->> 'at', 'by', u ->> 'by');
  end if;
  if p_role in ('owner', 'manager') then return jsonb_build_object('open', true, 'why', 'manager', 'since', (v_today::timestamp at time zone 'Asia/Ho_Chi_Minh')); end if;
  return jsonb_build_object('open', false, 'why', 'closed', 'next', v_today + (8 - extract(isodow from v_today))::int);
end $$;

create or replace function public._cum_tool(p_staff text, p_item text, p_month date, p_asof date)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(dr.actual) from public.daily_results dr where dr.staff_id = p_staff and dr.item_name = p_item
            and dr.report_date between p_month and p_asof and dr.status in ('Về số', 'Chưa về')), 0)
       + coalesce((select sum(ia.delta) from public.item_adjustments ia where ia.staff_id = p_staff and ia.item_name = p_item and ia.adj_date between p_month and p_asof), 0);
$$;

-- Form cập nhật lũy kế của 1 NV: số đang có trong tool đến hết hôm qua + loại đo từng môn
create or replace function public.cum_form(p_staff text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships; w jsonb; v_asof date := public.vn_today() - 1; v_month date; t public.monthly_targets; v_dept text; v_last public.score_log; v_items jsonb;
begin
  m := public._member_for_staff(p_staff);
  w := public._cum_window(p_staff, m.role);
  v_month := date_trunc('month', v_asof)::date;
  select dept into v_dept from public.staff where id = p_staff;
  select * into t from public.monthly_targets where staff_id = p_staff and month = v_month;
  select * into v_last from public.score_log where staff_id = p_staff and kind = 'cumulative' order by at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('name', e ->> 'name', 'target', (e ->> 'target')::numeric,
      'tool', public._cum_tool(p_staff, e ->> 'name', v_month, v_asof)) || public._item_measure(v_dept, e ->> 'name', (e ->> 'target')::numeric)), '[]'::jsonb)
    into v_items from jsonb_array_elements(coalesce(t.items, '[]'::jsonb)) e;
  return jsonb_build_object('window', w, 'as_of', v_asof, 'month', v_month, 'revenue_target', t.revenue_target,
    'revenue_tool', coalesce((select sum(amount) from public.revenue_entries where staff_id = p_staff and entry_date between v_month and v_asof), 0),
    'items', v_items,
    'done', v_last.id is not null and v_last.at >= coalesce((w ->> 'since')::timestamptz, now() + interval '1 day'),
    'last_at', v_last.at, 'last_by', v_last.actor);
end $$;

-- Lưu lũy kế: mỗi số nhập = lũy kế tháng đến hết hôm qua; tool ghi phần chênh lệch
create or replace function public.cum_submit(p_staff text, p_revenue numeric, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; w jsonb; v_asof date := public.vn_today() - 1; v_month date; t public.monthly_targets;
  e jsonb; v_val numeric; v_tool numeric; v_log jsonb := '[]'::jsonb; v_rev jsonb; n int := 0; v_note text;
begin
  m := public._member_for_staff(p_staff);
  w := public._cum_window(p_staff, m.role);
  if not (w ->> 'open')::boolean then raise exception 'Chỉ cập nhật lũy kế vào THỨ 2 hằng tuần hoặc khi quản lý mở khoá.'; end if;
  v_month := date_trunc('month', v_asof)::date;
  v_note := 'Cập nhật lũy kế đến ' || to_char(v_asof, 'DD/MM');
  select * into t from public.monthly_targets where staff_id = p_staff and month = v_month;
  if p_revenue is not null then
    if p_revenue < 0 then raise exception 'Doanh thu không được âm.'; end if;
    select coalesce(sum(amount), 0) into v_tool from public.revenue_entries where staff_id = p_staff and entry_date between v_month and v_asof;
    if round(p_revenue - v_tool, 4) <> 0 then
      insert into public.revenue_entries(staff_id, entry_date, kind, amount, note, created_by) values (p_staff, v_asof, 'adjust', p_revenue - v_tool, v_note, m.email);
      n := n + 1;
    end if;
    v_rev := jsonb_build_object('from', v_tool, 'to', p_revenue);
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    continue when nullif(btrim(coalesce(e ->> 'value', '')), '') is null;
    v_val := (e ->> 'value')::numeric;
    if v_val < 0 then raise exception 'Lũy kế môn % không được âm.', e ->> 'name'; end if;
    if not exists (select 1 from jsonb_array_elements(coalesce(t.items, '[]'::jsonb)) x where x ->> 'name' = e ->> 'name') then
      raise exception 'Môn % không có trong môn thi đua tháng.', e ->> 'name';
    end if;
    v_tool := public._cum_tool(p_staff, e ->> 'name', v_month, v_asof);
    if round(v_val - v_tool, 4) <> 0 then
      insert into public.item_adjustments(staff_id, item_name, adj_date, delta, note, created_by) values (p_staff, e ->> 'name', v_asof, v_val - v_tool, v_note, m.email);
      n := n + 1;
    end if;
    v_log := v_log || jsonb_build_object('name', e ->> 'name', 'from', v_tool, 'to', v_val);
  end loop;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason)
  values (m.email, p_staff, 'cumulative', 'update', jsonb_build_object('as_of', v_asof, 'revenue', v_rev, 'items', v_log, 'changed', n), v_note);
  return jsonb_build_object('status', 'success', 'changed', n,
    'message', case when n = 0 then '✅ Đã xác nhận lũy kế đến ' || to_char(v_asof, 'DD/MM') || ' (khớp số trong tool)'
                    else '✅ Đã cập nhật lũy kế đến ' || to_char(v_asof, 'DD/MM') || ' · chỉnh ' || n || ' mục' end);
end $$;

-- Quản lý mở khoá cho NV cập nhật lại (ngoài thứ 2); p_staff rỗng = tất cả. p_until null = khoá lại
create or replace function public.cum_unlock(p_until timestamptz, p_staff text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý mở khoá được.'; end if;
  if p_until is not null and p_until <= now() then raise exception 'Thời hạn mở khoá phải ở tương lai.'; end if;
  insert into public.settings(key, value, updated_by)
  values ('CUM_UNLOCK', case when p_until is null then jsonb_build_object('until', now(), 'staff', '[]'::jsonb, 'by', m.email, 'at', now())
                             else jsonb_build_object('until', p_until, 'staff', to_jsonb(coalesce(p_staff, '{}')), 'by', m.email, 'at', now()) end, m.email)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log(actor, action, target, details) values (m.email, 'CUM_UNLOCK', null, jsonb_build_object('until', p_until, 'staff', p_staff));
  return jsonb_build_object('status', 'success', 'message', case when p_until is null then 'Đã khoá cập nhật lũy kế' else 'Đã mở khoá cập nhật lũy kế' end);
end $$;

-- Chọn loại đo của môn (áp cho mọi bộ phận có môn cùng tên)
create or replace function public.set_item_measure(p_name text, p_measure text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý chọn được loại môn.'; end if;
  if p_measure not in ('sl', 'dtqd', 'dtt') then raise exception 'Loại không hợp lệ.'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Thiếu tên môn.'; end if;
  insert into public.item_measures(name, measure, updated_by) values (btrim(p_name), p_measure, m.email)
  on conflict (name) do update set measure = excluded.measure, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('status', 'success', 'message', 'Đã lưu loại môn');
end $$;

grant execute on function public.cum_form(text), public.cum_submit(text, numeric, jsonb), public.cum_unlock(timestamptz, text[]), public.set_item_measure(text, text) to authenticated;
revoke execute on function public._cum_window(text, text), public._cum_tool(text, text, date, date), public._item_measure(text, text, numeric) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_adjustments') then
    alter publication supabase_realtime add table public.item_adjustments;
  end if;
end $$;

-- Bảng điểm: lũy kế môn = báo cáo ngày + điều chỉnh lũy kế
create or replace function public.score_board(p_from date, p_to date, p_full boolean default false)
returns table (staff_id text, name text, dept text,
  revenue numeric, revenue_target numeric, rev_pct numeric, rev_score numeric,
  items_total int, items_done numeric, items_detail jsonb, contest_score numeric,
  s5 int, s4 int, s3 int, s2 int, s1 int, complaints int, service_raw numeric, service_score numeric,
  violations int, violation_points numeric, total numeric, rank int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.memberships; v_all boolean; v_det boolean := false; v_month date := date_trunc('month', p_from)::date;
  v_f numeric; d jsonb; w_r numeric; w_c numeric; w_s numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then v_all := true; v_det := true;   -- máy chủ gửi Telegram
  else
    m := public._require_member();
    v_all := m.role = 'owner' or public.setting_text('SCORE_SEE_ALL', 'true') = 'true';
    v_det := m.role = 'owner';
  end if;
  v_f := case when p_full then 1 else least(1, (p_to - p_from + 1)::numeric / extract(day from (v_month + interval '1 month' - interval '1 day'))) end;
  select value into d from public.settings where key = 'RATING_DEDUCT';
  d := coalesce(d, '{"s4":1,"s3":2,"s2":3,"s1":4,"complaints":5}'::jsonb);
  w_r := public.setting_num('W_REVENUE', 40); w_c := public.setting_num('W_CONTEST', 40); w_s := public.setting_num('W_SERVICE', 20);
  return query
  with s as (
    select x.* from public.staff x where not x.hidden          -- xếp hạng trên toàn siêu thị, lọc phạm vi xem ở cuối
  ), tg as (
    select t.* from public.monthly_targets t where t.month = v_month
  ), rev as (
    select r.staff_id, sum(r.amount) amt from public.revenue_entries r where r.entry_date between p_from and p_to group by r.staff_id
  ), it as (
    select tg.staff_id, e ->> 'name' iname, (e ->> 'target')::numeric * v_f itarget,
      coalesce((select sum(dr.actual) from public.daily_results dr where dr.staff_id = tg.staff_id and dr.item_name = e ->> 'name'
                 and dr.report_date between p_from and p_to and dr.status in ('Về số', 'Chưa về')), 0)
      + coalesce((select sum(ia.delta) from public.item_adjustments ia where ia.staff_id = tg.staff_id and ia.item_name = e ->> 'name'
                 and ia.adj_date between p_from and p_to), 0) iact
    from tg cross join lateral jsonb_array_elements(tg.items) e
  ), con as (
    select it.staff_id, count(*)::int n, sum(least(1, it.iact / nullif(it.itarget, 0))) done,
      jsonb_agg(jsonb_build_object('name', it.iname, 'target', round(it.itarget, 2), 'actual', it.iact, 'pct', round(100 * it.iact / nullif(it.itarget, 0)))) det
    from it group by it.staff_id
  ), rt as (
    select r.staff_id, sum(r.s5)::int a5, sum(r.s4)::int a4, sum(r.s3)::int a3, sum(r.s2)::int a2, sum(r.s1)::int a1, sum(r.complaints)::int ak
    from public.ratings r where r.period_end >= p_from and r.period_start <= p_to group by r.staff_id
  ), vi as (
    select v.staff_id, count(*)::int n, sum(v.points) pts from public.violations v where v.v_date between p_from and p_to group by v.staff_id
  ), base as (
    select s.id, s.name, s.dept, coalesce(rev.amt, 0) revenue, tg.revenue_target * v_f rtarget,
      coalesce(con.n, 0) n, coalesce(con.done, 0) done, coalesce(con.det, '[]'::jsonb) det,
      coalesce(rt.a5, 0) a5, coalesce(rt.a4, 0) a4, coalesce(rt.a3, 0) a3, coalesce(rt.a2, 0) a2, coalesce(rt.a1, 0) a1, coalesce(rt.ak, 0) ak,
      coalesce(rt.a5, 0) - coalesce(rt.a4, 0) * coalesce((d ->> 's4')::numeric, 1) - coalesce(rt.a3, 0) * coalesce((d ->> 's3')::numeric, 2)
        - coalesce(rt.a2, 0) * coalesce((d ->> 's2')::numeric, 3) - coalesce(rt.a1, 0) * coalesce((d ->> 's1')::numeric, 4)
        - coalesce(rt.ak, 0) * coalesce((d ->> 'complaints')::numeric, 5) sraw,
      coalesce(vi.n, 0) vn, coalesce(vi.pts, 0) vpts
    from s left join tg on tg.staff_id = s.id left join rev on rev.staff_id = s.id left join con on con.staff_id = s.id
      left join rt on rt.staff_id = s.id left join vi on vi.staff_id = s.id
  ), mx as (
    -- người phục vụ cao nhất toàn siêu thị (kể cả ngoài phạm vi xem) = đủ điểm
    select greatest(max(sraw), 0) top from (
      select coalesce(sum(r.s5), 0) - coalesce(sum(r.s4), 0) * coalesce((d ->> 's4')::numeric, 1) - coalesce(sum(r.s3), 0) * coalesce((d ->> 's3')::numeric, 2)
        - coalesce(sum(r.s2), 0) * coalesce((d ->> 's2')::numeric, 3) - coalesce(sum(r.s1), 0) * coalesce((d ->> 's1')::numeric, 4)
        - coalesce(sum(r.complaints), 0) * coalesce((d ->> 'complaints')::numeric, 5) sraw
      from public.ratings r join public.staff x on x.id = r.staff_id and not x.hidden
      where r.period_end >= p_from and r.period_start <= p_to group by r.staff_id) z
  ), sc as (
    select b.*, round(100 * b.revenue / nullif(b.rtarget, 0), 1) rpct,
      round(w_r * least(1, coalesce(b.revenue / nullif(b.rtarget, 0), 0)), 2) rscore,
      round(case when b.n > 0 then w_c * b.done / b.n else 0 end, 2) cscore,
      round(case when mx.top > 0 then w_s * greatest(b.sraw, 0) / mx.top else 0 end, 2) sscore
    from base b cross join mx
  )
  , fin as (
    select sc.id, sc.name, sc.dept, sc.revenue, round(sc.rtarget, 2) rt, sc.rpct, sc.rscore, sc.n, round(sc.done, 2) dn, sc.det, sc.cscore,
      sc.a5, sc.a4, sc.a3, sc.a2, sc.a1, sc.ak, sc.sraw, sc.sscore, sc.vn, sc.vpts,
      round(sc.rscore + sc.cscore + sc.sscore - sc.vpts, 2) tot,
      (rank() over (order by sc.rscore + sc.cscore + sc.sscore - sc.vpts desc))::int rk
    from sc
  )
  -- NV xem toàn siêu thị: chỉ thấy điểm của người khác; số DT và chi tiết môn chỉ của mình (quản lý: trong phạm vi)
  select fin.id, fin.name, fin.dept,
    case when v_det or public.can_see_staff(fin.id) then fin.revenue end,
    case when v_det or public.can_see_staff(fin.id) then fin.rt end,
    case when v_det or public.can_see_staff(fin.id) then fin.rpct end, fin.rscore, fin.n, fin.dn,
    case when v_det or public.can_see_staff(fin.id) then fin.det else '[]'::jsonb end, fin.cscore,
    fin.a5, fin.a4, fin.a3, fin.a2, fin.a1, fin.ak, fin.sraw, fin.sscore, fin.vn, fin.vpts, fin.tot, fin.rk
  from fin where v_all or public.can_see_staff(fin.id)
  order by fin.tot desc, fin.name;
end $$;
