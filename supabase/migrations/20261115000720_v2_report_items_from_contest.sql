-- =====================================================================
-- Môn báo cáo ngày = môn thi đua tháng của từng nhân viên.
-- Khi NV đã được giao môn thi đua cho tháng của ngày báo cáo: báo cáo đúng các môn đó (đúng thứ tự),
-- target ngày = target tháng ÷ số ngày làm việc của tháng. Chưa giao môn → giữ cách cũ (môn của bộ phận / môn riêng).
-- =====================================================================
alter table public.monthly_targets add column if not exists work_days int check (work_days is null or work_days between 1 and 31);
insert into public.settings(key, value, updated_by) values ('DAYS_OFF', '4'::jsonb, 'system') on conflict (key) do nothing;

create or replace function public._work_days(p_staff text, p_month date)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select work_days from public.monthly_targets where staff_id = p_staff and month = date_trunc('month', p_month)::date),
    greatest(1, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::int - public.setting_num('DAYS_OFF', 4)::int));
$$;
revoke execute on function public._work_days(text, date) from public, anon, authenticated;

drop function if exists public._staff_items(text);
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
           i.is_x2, c.o::int sort, true active, i.created_at, c.o
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
  select id, store, name, target, bonus_star, penalty_star, is_x2, sort, active, created_at from (
    select f.id, f.store, f.name, f.target, f.bonus_star, f.penalty_star, f.is_x2, f.sort, f.active, f.created_at, f.o::bigint k from from_contest f
    union all
    select c.id, c.store, c.name, coalesce(t.target, c.target), coalesce(t.bonus_star, c.bonus_star), coalesce(t.penalty_star, c.penalty_star),
           c.is_x2, c.sort, c.active, c.created_at, c.ord
    from cand c left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name where c.rn = 1
  ) z order by k
$$;
revoke execute on function public._staff_items(text, date) from public, anon, authenticated;

-- Môn thi đua chưa có trong danh sách môn → tạo môn ở bộ phận của NV (sao mặc định +200/−100)
create or replace function public._ensure_contest_items(p_staff text, p_month date)
returns void language plpgsql security definer set search_path = '' as $$
declare st public.staff; e jsonb; v_wd int;
begin
  select * into st from public.staff where id = p_staff;
  v_wd := public._work_days(p_staff, p_month);
  for e in select x from public.monthly_targets t, jsonb_array_elements(t.items) x where t.staff_id = p_staff and t.month = date_trunc('month', p_month)::date loop
    continue when btrim(coalesce(e ->> 'name', '')) = '' or exists (select 1 from public.items i where i.name = btrim(e ->> 'name'));
    insert into public.items(store, name, target, bonus_star, penalty_star, sort, active)
    values (coalesce(nullif(st.dept, ''), 'Chung'), btrim(e ->> 'name'), round((e ->> 'target')::numeric / v_wd, 3), 200, 100, 999, true)
    on conflict (store, name) do nothing;
  end loop;
end $$;
revoke execute on function public._ensure_contest_items(text, date) from public, anon, authenticated;

drop function if exists public.save_monthly_target(text, date, numeric, jsonb);
create or replace function public.save_monthly_target(p_staff text, p_month date, p_revenue numeric, p_items jsonb, p_work_days int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_month date := date_trunc('month', p_month)::date; v_old public.monthly_targets; v_items jsonb;
begin
  m := public._manager_scope(p_staff, null);
  if p_work_days is not null and (p_work_days < 1 or p_work_days > 31) then raise exception 'Số ngày làm việc phải từ 1 đến 31.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', btrim(e ->> 'name'), 'target', (e ->> 'target')::numeric)), '[]'::jsonb) into v_items
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
  where btrim(coalesce(e ->> 'name', '')) <> '' and (e ->> 'target')::numeric > 0;
  select * into v_old from public.monthly_targets where staff_id = p_staff and month = v_month;
  insert into public.monthly_targets(staff_id, month, revenue_target, items, work_days, updated_by)
  values (p_staff, v_month, p_revenue, v_items, coalesce(p_work_days, v_old.work_days), m.email)
  on conflict (staff_id, month) do update set revenue_target = excluded.revenue_target, items = excluded.items, work_days = excluded.work_days,
    updated_by = excluded.updated_by, updated_at = now();
  perform public._ensure_contest_items(p_staff, v_month);
  if v_old.staff_id is null or v_old.revenue_target is distinct from p_revenue or v_old.items <> v_items or v_old.work_days is distinct from coalesce(p_work_days, v_old.work_days) then
    insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, p_staff, 'target', 'save',
      jsonb_build_object('month', v_month, 'revenue_from', v_old.revenue_target, 'revenue_to', p_revenue, 'items', v_items, 'work_days', coalesce(p_work_days, v_old.work_days)));
  end if;
  return jsonb_build_object('status', 'success');
end $$;
grant execute on function public.save_monthly_target(text, date, numeric, jsonb, int) to authenticated;

CREATE OR REPLACE FUNCTION public.report_form(p_staff text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  perform public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'target', i.target, 'bonus', i.bonus_star,
              'penalty', i.penalty_star, 'isX2', i.is_x2, 'streak', public._item_streak(p_staff, i.name, p_date))) from public._staff_items(p_staff, p_date) i), '[]'::jsonb),
    'existing', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.daily_results r where r.staff_id = p_staff and r.report_date = p_date), '[]'::jsonb),
    'proposal', (select to_jsonb(p) from public.extra_proposals p where p.staff_id = p_staff and p.report_date = p_date order by id limit 1),
    'locked', exists (select 1 from public.locked_dates where d = p_date),
    'after_cutoff', public.is_after_cutoff(p_date),
    'total_star', public.staff_total(p_staff)
  ) into v;
  return v;
end $function$
;
CREATE OR REPLACE FUNCTION public._compute_report(p_staff text, p_date date, p_reports jsonb, p_extra_item text, p_extra_stars integer, p_actor text, p_at timestamp with time zone, p_dry boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.staff;
  it public.items;
  v_items public.items[];
  inp jsonb := '{}'::jsonb;
  e jsonb; v_name text; v_comp text; v_actual numeric;
  rows jsonb := '[]'::jsonb; row jsonb;
  v_rate numeric; v_star int; v_status text;
  v_old int; v_pool numeric; v_total int;
  v_rules jsonb; v_rule jsonb;
  v_streak int; v_ot numeric; v_pen numeric; v_mult numeric; v_needed int;
  v_late record; v_count int; v_step int;
  v_extra text := btrim(coalesce(p_extra_item, ''));
  v_extra_stars int := greatest(0, least(100000, coalesce(p_extra_stars, 0)));
  v_prop record;
  i int;
  v_tt_start date; v_tt_pen int; v_due date; v_tt public.tiktok_submissions;
begin
  select * into st from public.staff where id = p_staff;
  if st.id is null then raise exception 'Nhân viên không tồn tại.'; end if;
  if p_date is null or p_date > (p_at at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Ngày báo cáo không hợp lệ.'; end if;
  v_items := array(select x from public._staff_items(p_staff, p_date) x);
  if coalesce(array_length(v_items, 1), 0) = 0 then raise exception 'Nhân viên chưa có môn thi đua.'; end if;
  -- Đọc & kiểm tra số liệu gửi lên
  for e in select * from jsonb_array_elements(coalesce(p_reports, '[]'::jsonb)) loop
    v_comp := coalesce(e ->> 'compensation', '');
    continue when v_comp in ('PHAT_TRE', 'TIKTOK_PHAT');
    v_name := e ->> 'itemName';
    if v_name is null or inp ? v_name or not exists (select 1 from unnest(v_items) x where x.name = v_name) then
      raise exception 'Môn thi đua không hợp lệ hoặc bị trùng: %', coalesce(v_name, '?');
    end if;
    begin v_actual := (e ->> 'actual')::numeric; exception when others then v_actual := null; end;
    if v_actual is null or v_actual < 0 then raise exception 'Thực đạt phải là số không âm (%).', v_name; end if;
    inp := inp || jsonb_build_object(v_name, jsonb_build_object('actual', v_actual, 'comp', v_comp));
  end loop;
  if (select count(*) from jsonb_object_keys(inp)) <> array_length(v_items, 1) then
    raise exception 'Cần nhập đầy đủ % môn được giao.', array_length(v_items, 1);
  end if;
  -- Bước 1: % đạt, sao thưởng
  foreach it in array v_items loop
    v_actual := (inp -> it.name ->> 'actual')::numeric;
    v_rate := v_actual / nullif(it.target, 0);
    if v_rate >= 1 then
      v_star := it.bonus_star * case when it.is_x2 and v_rate >= public.setting_num('DOUBLE_BONUS_RATE', 150) / 100 then 2 else 1 end;
      v_status := 'Về số'; v_comp := 'DUNG_SAO';
    else
      v_star := 0; v_status := 'Chưa về';
      v_comp := case when inp -> it.name ->> 'comp' = 'TANG_CA' then 'TANG_CA' else 'DUNG_SAO' end;
    end if;
    rows := rows || jsonb_build_object('itemName', it.name, 'target', it.target, 'actual', v_actual,
      'rate', round(coalesce(v_rate, 0) * 100), 'starChange', v_star, 'status', v_status,
      'compensation', v_comp, 'streak', 0, 'needed', 0, 'isX2', it.is_x2);
  end loop;
  -- Bước 2: chuỗi, tăng ca, trừ sao theo quỹ
  select coalesce(sum(star_change), 0) into v_old from public.daily_results
   where staff_id = p_staff and report_date = p_date;
  v_total := coalesce(public.staff_total(p_staff), 0);
  v_pool := v_total - v_old + (select coalesce(sum(greatest(0, (r ->> 'starChange')::int)), 0) from jsonb_array_elements(rows) r);
  select coalesce(value, '[]'::jsonb) into v_rules from public.settings where key = 'ITEM_RULES';
  if v_rules is null or jsonb_typeof(v_rules) <> 'array' then v_rules := '[]'::jsonb; end if;
  for i in 0 .. jsonb_array_length(rows) - 1 loop
    row := rows -> i;
    continue when row ->> 'status' = 'Về số';
    it := v_items[i + 1];
    v_streak := public._item_streak(p_staff, it.name, p_date);
    select r into v_rule from jsonb_array_elements(v_rules) r
     where (r ->> 'item' = '*' or r ->> 'item' = it.name)
       and (coalesce(jsonb_array_length(r -> 'staffIds'), 0) = 0 or (r -> 'staffIds') ? p_staff)
       and (coalesce(jsonb_array_length(r -> 'stores'), 0) = 0 or (r -> 'stores') ? st.dept)
     order by (case when coalesce(jsonb_array_length(r -> 'staffIds'), 0) > 0 then 100 else 0 end)
            + (case when coalesce(jsonb_array_length(r -> 'stores'), 0) > 0 then 10 else 0 end)
            + (case when r ->> 'item' <> '*' then 1 else 0 end) desc
     limit 1;
    v_ot := case when nullif(v_rule ->> 'ot', '') is not null then (v_rule ->> 'ot')::numeric else public.setting_num('STREAK_OVERTIME', 3) end;
    v_pen := case when coalesce((v_rule ->> 'noPen')::boolean, false) then 1e9
                  when nullif(v_rule ->> 'pen', '') is not null then (v_rule ->> 'pen')::numeric
                  else public.setting_num('STREAK_PENALTY_STAR', 5) end;
    v_mult := public.setting_num('PEN_M1', 1);
    if v_streak >= public.setting_num('PEN_T4_MIN', 8) then v_mult := public.setting_num('PEN_M4', 5);
    elsif v_streak >= public.setting_num('PEN_T3_MIN', 6) then v_mult := public.setting_num('PEN_M3', 2);
    elsif v_streak >= public.setting_num('PEN_T2_MIN', 4) then v_mult := public.setting_num('PEN_M2', 1.5); end if;
    v_needed := round(it.penalty_star * v_mult);
    v_comp := row ->> 'compensation'; v_star := 0;
    if v_streak < v_ot and v_streak < v_pen then v_comp := 'GHI_NHAN';
    elsif v_streak < v_pen then v_comp := 'TANG_CA';
    else
      if v_streak < v_ot then v_comp := 'DUNG_SAO'; end if;
      if v_comp = 'DUNG_SAO' then
        if v_pool >= v_needed then v_star := -v_needed; v_pool := v_pool - v_needed; else v_comp := 'TANG_CA'; end if;
      end if;
    end if;
    rows := jsonb_set(rows, array[i::text], row || jsonb_build_object('compensation', v_comp, 'starChange', v_star, 'streak', v_streak, 'needed', v_needed));
  end loop;
  -- Bước 3: kỷ luật nộp trễ
  select * into v_late from public.daily_results
   where staff_id = p_staff and report_date = p_date and compensation = 'PHAT_TRE' order by id limit 1;
  if v_late.id is not null then
    rows := rows || jsonb_build_object('itemName', v_late.item_name, 'actual', v_late.actual, 'rate', null,
      'starChange', v_late.star_change, 'status', v_late.status, 'compensation', 'PHAT_TRE', 'streak', 0);
  elsif public.is_after_cutoff(p_date, p_at) then
    v_step := public.setting_num('LATE_STEP', 100)::int;
    select 1 + count(*) into v_count from public.daily_results
     where staff_id = p_staff and report_date <> p_date and compensation = 'PHAT_TRE'
       and date_trunc('month', report_date) = date_trunc('month', p_date::timestamp);
    rows := rows || jsonb_build_object('itemName', '[Kỷ Luật] Báo cáo sau ' || replace(public.setting_text('CUTOFF_TIME', '22:20'), ':', 'h') || ' (Lần ' || v_count || ')',
      'actual', 1, 'rate', null, 'starChange', -v_step * v_count, 'status', 'Nộp trễ', 'compensation', 'PHAT_TRE', 'streak', 0);
  end if;
  -- Bước 4: phạt TikTok trễ hạn — mỗi kỳ (Thứ 3/Thứ 6) chưa nộp bị trừ trên báo cáo của từng ngày cho tới khi nộp
  v_tt_start := nullif(public.setting_text('TIKTOK_START_DATE', ''), '')::date;
  if v_tt_start is not null then
    v_tt_pen := public.setting_num('TIKTOK_PENALTY', 300)::int;
    for v_due in select d from public.tiktok_due_dates(v_tt_start, p_date - 1) d loop
      select * into v_tt from public.tiktok_submissions where staff_id = p_staff and due = v_due;
      continue when v_tt.id is not null and v_tt.status = 'MIỄN';
      if v_tt.id is null or v_tt.submit_date >= p_date then
        rows := rows || jsonb_build_object('itemName', '[Kỷ Luật] TikTok trễ hạn ' || case extract(dow from v_due) when 2 then 'Thứ 3' else 'Thứ 6' end || ' ' || to_char(v_due, 'DD/MM'),
          'actual', 0, 'rate', null, 'starChange', -v_tt_pen, 'status', 'Phạt TikTok', 'compensation', 'TIKTOK_PHAT', 'streak', 0);
      end if;
    end loop;
  end if;
  if p_dry then
    return jsonb_build_object('status', 'preview', 'rows', rows, 'total_before', v_total,
      'day_change', (select coalesce(sum((r ->> 'starChange')::int), 0) from jsonb_array_elements(rows) r),
      'old_day_change', v_old);
  end if;
  -- Ghi: thay toàn bộ báo cáo của ngày (giữ dòng phạt TikTok)
  delete from public.daily_results where staff_id = p_staff and report_date = p_date;
  insert into public.daily_results(report_date, staff_id, staff_name, item_name, actual, rate_pct, star_change, status, compensation, submitted_by, submitted_at)
  select p_date, p_staff, st.name, r ->> 'itemName', coalesce((r ->> 'actual')::numeric, 0), (r ->> 'rate')::numeric,
         coalesce((r ->> 'starChange')::int, 0), r ->> 'status', r ->> 'compensation', p_actor, p_at
  from jsonb_array_elements(rows) r;
  -- Đề xuất bán thêm (giữ nguyên nếu đã được duyệt / từ chối)
  select * into v_prop from public.extra_proposals where staff_id = p_staff and report_date = p_date order by id limit 1;
  if v_prop.id is not null then
    if v_prop.status = 'Chờ duyệt' then
      if v_extra = '' then delete from public.extra_proposals where id = v_prop.id;
      else update public.extra_proposals set content = v_extra, stars = v_extra_stars, staff_name = st.name where id = v_prop.id; end if;
    end if;
  elsif v_extra <> '' then
    insert into public.extra_proposals(report_date, staff_id, staff_name, content, stars) values (p_date, p_staff, st.name, v_extra, v_extra_stars);
  end if;
  insert into public.audit_log(actor, action, target, details) values (p_actor, 'SUBMIT_DAILY', p_staff, jsonb_build_object('date', p_date));
  return jsonb_build_object('status', 'success', 'rows', rows, 'total_star', public.staff_total(p_staff),
    'day_change', (select coalesce(sum((r ->> 'starChange')::int), 0) from jsonb_array_elements(rows) r));
end $function$
;

-- Nhập target tháng: lưu thêm số ngày làm việc, tạo môn còn thiếu
create or replace function public.import_month_targets(p_month date, p_blocks jsonb, p_opts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships; v_month date := date_trunc('month', p_month)::date;
  b jsonb; it jsonb; sid text; v_dept text; v_names text[]; v_items jsonb; v_old public.monthly_targets;
  n_staff int := 0; n_items int := 0; n_off int := 0; v_idx int; v_warn text := null; v_depts text[] := '{}';
  o_rev boolean := coalesce((p_opts ->> 'set_revenue')::boolean, true);
  o_items boolean := coalesce((p_opts ->> 'set_items')::boolean, true);
  o_daily boolean := coalesce((p_opts ->> 'set_daily')::boolean, false);
  o_off boolean := coalesce((p_opts ->> 'deactivate_old')::boolean, false);
  o_clear boolean := coalesce((p_opts ->> 'clear_assigned')::boolean, false);
  v_small numeric := coalesce((p_opts ->> 'nopen_below')::numeric, 0); v_rules jsonb; n_nopen int := 0;
  v_wd int := nullif(p_opts ->> 'work_days', '')::int;
begin
  m := public._require_member();
  if m.role <> 'owner' then raise exception 'Chỉ chủ quản được nhập target tháng.'; end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then raise exception 'Chưa có dữ liệu target.'; end if;

  for b in select * from jsonb_array_elements(p_blocks) loop
    v_dept := btrim(coalesce(b ->> 'dept', ''));
    if v_dept = '' then raise exception 'Chưa chọn bộ phận cho một siêu thị.'; end if;
    v_depts := v_depts || v_dept;
    v_names := array(select btrim(e ->> 'name') from jsonb_array_elements(coalesce(b -> 'items', '[]'::jsonb)) e where btrim(coalesce(e ->> 'name', '')) <> '');
    v_items := coalesce((select jsonb_agg(jsonb_build_object('name', btrim(e ->> 'name'), 'target', (e ->> 'month')::numeric))
                         from jsonb_array_elements(coalesce(b -> 'items', '[]'::jsonb)) e where (e ->> 'month')::numeric > 0), '[]'::jsonb);

    -- Môn báo cáo ngày của bộ phận
    if o_daily and cardinality(v_names) > 0 then
      v_idx := 0;
      for it in select * from jsonb_array_elements(b -> 'items') loop
        v_idx := v_idx + 1;
        continue when coalesce((it ->> 'day')::numeric, 0) <= 0;
        insert into public.items(store, name, target, bonus_star, penalty_star, is_x2, sort, active)
        values (v_dept, btrim(it ->> 'name'), round((it ->> 'day')::numeric, 3),
          coalesce((select i.bonus_star from public.items i where i.name = btrim(it ->> 'name') order by (i.store = v_dept) desc limit 1), 200),
          coalesce((select i.penalty_star from public.items i where i.name = btrim(it ->> 'name') order by (i.store = v_dept) desc limit 1), 100),
          false, v_idx, true)
        on conflict (store, name) do update set target = excluded.target, sort = excluded.sort, active = true;
        n_items := n_items + 1;
      end loop;
      -- Môn target ngày quá nhỏ (VD 0,02 cái/ngày): không trừ sao theo chuỗi ngày chưa đạt
      if v_small > 0 then
        select coalesce(value, '[]'::jsonb) into v_rules from public.settings where key = 'ITEM_RULES';
        if v_rules is null or jsonb_typeof(v_rules) <> 'array' then v_rules := '[]'::jsonb; end if;
        for it in select * from jsonb_array_elements(b -> 'items') loop
          continue when coalesce((it ->> 'day')::numeric, 0) <= 0 or (it ->> 'day')::numeric >= v_small;
          v_rules := coalesce((select jsonb_agg(r) from jsonb_array_elements(v_rules) r
                      where not (r ->> 'item' = btrim(it ->> 'name') and coalesce(jsonb_array_length(r -> 'staffIds'), 0) = 0
                                 and coalesce(r -> 'stores', '[]'::jsonb) = jsonb_build_array(v_dept))), '[]'::jsonb)
                     || jsonb_build_array(jsonb_build_object('item', btrim(it ->> 'name'), 'stores', jsonb_build_array(v_dept), 'staffIds', '[]'::jsonb, 'ot', '', 'pen', '', 'noPen', true));
          n_nopen := n_nopen + 1;
        end loop;
        insert into public.settings(key, value, updated_by) values ('ITEM_RULES', v_rules, m.email)
        on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
      end if;
      if o_off then
        update public.items set active = false where store = v_dept and active and not (name = any(v_names));
        get diagnostics v_idx = row_count; n_off := n_off + v_idx;
      end if;
    end if;

    -- Target tháng từng nhân viên
    for sid in select jsonb_array_elements_text(coalesce(b -> 'staff_ids', '[]'::jsonb)) loop
      continue when not exists (select 1 from public.staff where id = sid);
      select * into v_old from public.monthly_targets where staff_id = sid and month = v_month;
      insert into public.monthly_targets(staff_id, month, revenue_target, items, work_days, updated_by)
      values (sid, v_month, case when o_rev then (b ->> 'revenue')::numeric else v_old.revenue_target end,
              case when o_items then v_items else coalesce(v_old.items, '[]'::jsonb) end, coalesce(v_wd, v_old.work_days), m.email)
      on conflict (staff_id, month) do update set revenue_target = excluded.revenue_target, items = excluded.items, work_days = excluded.work_days,
        updated_by = excluded.updated_by, updated_at = now();
      perform public._ensure_contest_items(sid, v_month);
      if o_clear and o_daily then update public.staff set assigned_items = '{}', updated_at = now() where id = sid and cardinality(assigned_items) > 0; end if;
      insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, sid, 'target', 'import',
        jsonb_build_object('month', v_month, 'revenue_from', v_old.revenue_target, 'revenue_to', case when o_rev then (b ->> 'revenue')::numeric else v_old.revenue_target end,
                           'items', case when o_items then jsonb_array_length(v_items) else null end));
      n_staff := n_staff + 1;
    end loop;
  end loop;

  -- Môn "Chung" cũ: chỉ tắt khi mọi bộ phận đang có nhân viên đều đã có danh sách môn mới
  if o_daily and o_off then
    if not exists (select 1 from public.staff s where not s.hidden and not (s.dept = any(v_depts))) then
      update public.items set active = false where store = 'Chung' and active;
      get diagnostics v_idx = row_count; n_off := n_off + v_idx;
    else
      v_warn := 'Còn bộ phận chưa có trong báo cáo nên giữ nguyên các môn "Chung".';
    end if;
  end if;

  insert into public.audit_log(actor, action, details) values (m.email, 'IMPORT_MONTH_TARGETS',
    jsonb_build_object('month', v_month, 'staff', n_staff, 'daily_items', n_items, 'deactivated', n_off, 'no_penalty', n_nopen));
  return jsonb_build_object('status', 'success', 'staff', n_staff, 'daily_items', n_items, 'deactivated', n_off, 'warning', v_warn,
    'message', format('Đã cập nhật target tháng %s cho %s nhân viên%s%s%s', to_char(v_month, 'MM/YYYY'), n_staff,
      case when o_daily then format(', %s môn báo cáo ngày', n_items) else '' end,
      case when n_off > 0 then format(', tắt %s môn cũ', n_off) else '' end,
      case when n_nopen > 0 then format(', %s môn nhỏ không trừ sao chuỗi', n_nopen) else '' end));
end $$;
grant execute on function public.import_month_targets(date, jsonb, jsonb) to authenticated;
