-- =====================================================================
-- Nhập target tháng từ báo cáo tổng hợp (dán văn bản): target DT QĐ + môn thi đua tháng cho từng NV,
-- và (tuỳ chọn) đổi môn báo cáo ngày của bộ phận theo danh sách môn trong báo cáo.
-- p_blocks: [{ "dept": "Topzone", "staff_ids": ["..."], "revenue": 1612, "items": [{"name":"Laptop","month":130.1,"day":5.0}] }]
-- p_opts:   { "set_revenue": true, "set_items": true, "set_daily": true, "deactivate_old": true, "clear_assigned": true }
-- =====================================================================
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
      insert into public.monthly_targets(staff_id, month, revenue_target, items, updated_by)
      values (sid, v_month, case when o_rev then (b ->> 'revenue')::numeric else v_old.revenue_target end,
              case when o_items then v_items else coalesce(v_old.items, '[]'::jsonb) end, m.email)
      on conflict (staff_id, month) do update set revenue_target = excluded.revenue_target, items = excluded.items, updated_by = excluded.updated_by, updated_at = now();
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
