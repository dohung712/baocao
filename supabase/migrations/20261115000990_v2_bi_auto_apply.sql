-- B16c Tự cập nhật số BI của NV (chủ quản chọn 23/11/2026: bỏ bước QL duyệt).
--   BI_AUTO_APPLY = true: thẻ NV đọc xong → ghi luôn vào lũy kế tháng (DT QĐ → revenue_entries 'adjust', môn → item_adjustments,
--   score_log kind cumulative / action bi_auto) đến ngày số liệu BI. Ngày đã khoá sổ → để lại chờ QL xử lý (ghi chú lý do).
--   Tắt (false) = quay về QL duyệt như B16b.
insert into public.settings(key, value) values ('BI_AUTO_APPLY', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb, updated_at = now();

-- Ghi 1 đề xuất vào lũy kế. p_pick = {"revenue": bool, "items": [tên môn]} — trống = lấy hết. Trả số điều chỉnh đã ghi.
create or replace function public._bi_apply(p_id bigint, p_actor text, p_pick jsonb default '{}'::jsonb, p_auto boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.bi_proposals; k jsonb := coalesce(p_pick, '{}'::jsonb); e jsonb; v_tool numeric; v_val numeric; v_note text;
  v_rev jsonb; v_log jsonb := '[]'::jsonb; n int := 0;
begin
  select * into r from public.bi_proposals where id = p_id for update;
  if not found or r.status <> 'pending' then return null; end if;
  if exists (select 1 from public.locked_dates where d = r.as_of) then raise exception 'Ngày % đã khóa chốt sổ.', to_char(r.as_of, 'DD/MM/YYYY'); end if;
  v_note := case when p_auto then 'Tự cập nhật số BI đến ' else 'Duyệt số BI đến ' end || to_char(r.as_of, 'DD/MM');
  if r.revenue is not null and coalesce((k ->> 'revenue')::boolean, true) then
    select coalesce(sum(amount), 0) into v_tool from public.revenue_entries where staff_id = r.staff_id and entry_date between r.month and r.as_of;
    if round(r.revenue - v_tool, 4) <> 0 then
      insert into public.revenue_entries(staff_id, entry_date, kind, amount, note, created_by) values (r.staff_id, r.as_of, 'adjust', r.revenue - v_tool, v_note, p_actor);
      n := n + 1;
    end if;
    v_rev := jsonb_build_object('from', v_tool, 'to', r.revenue);
  end if;
  for e in select * from jsonb_array_elements(r.items) loop
    continue when e ->> 'name' is null or e ->> 'value' is null;
    continue when k ? 'items' and not ((k -> 'items') ? (e ->> 'name'));
    v_val := (e ->> 'value')::numeric;
    v_tool := public._cum_tool(r.staff_id, e ->> 'name', r.month, r.as_of);
    if round(v_val - v_tool, 4) <> 0 then
      insert into public.item_adjustments(staff_id, item_name, adj_date, delta, note, created_by) values (r.staff_id, e ->> 'name', r.as_of, v_val - v_tool, v_note, p_actor);
      n := n + 1;
    end if;
    v_log := v_log || jsonb_build_object('name', e ->> 'name', 'from', v_tool, 'to', v_val);
  end loop;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason)
  values (p_actor, r.staff_id, 'cumulative', case when p_auto then 'bi_auto' else 'bi_approve' end,
          jsonb_build_object('as_of', r.as_of, 'revenue', v_rev, 'items', v_log, 'changed', n, 'proposal', r.id), v_note);
  update public.bi_proposals set status = 'approved', reviewed_by = p_actor, reviewed_at = now(), note = case when p_auto then 'Tự cập nhật' else note end,
    result = jsonb_build_object('revenue', v_rev, 'items', v_log, 'changed', n, 'auto', p_auto) where id = r.id;
  return n;
end $$;

-- Đề xuất mới (Edge Function): bật tự cập nhật → ghi luôn; lỗi (khoá sổ…) → để chờ QL, ghi lý do
create or replace function public._bi_propose(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_month date := date_trunc('month', (p ->> 'as_of')::date)::date; n int;
begin
  if exists (select 1 from public.bi_proposals where file_id = p ->> 'file_id') then return jsonb_build_object('status', 'exists'); end if;
  update public.bi_proposals set status = 'superseded', reviewed_at = now(), reviewed_by = p_actor, note = 'Có ảnh BI mới hơn'
   where staff_id = p ->> 'staff_id' and month = v_month and status = 'pending' and as_of <= (p ->> 'as_of')::date;
  insert into public.bi_proposals(file_id, staff_id, month, as_of, revenue, items, created_by)
  values (p ->> 'file_id', p ->> 'staff_id', v_month, (p ->> 'as_of')::date, nullif(p ->> 'revenue', '')::numeric, coalesce(p -> 'items', '[]'::jsonb), p_actor)
  returning id into v_id;
  if public.setting_text('BI_AUTO_APPLY', 'true') = 'true' then
    begin
      n := public._bi_apply(v_id, 'tu-dong (BI)', '{}'::jsonb, true);
      return jsonb_build_object('status', 'applied', 'id', v_id, 'changed', n);
    exception when others then
      update public.bi_proposals set note = left('Không tự cập nhật được: ' || sqlerrm, 300) where id = v_id;
    end;
  end if;
  return jsonb_build_object('status', 'success', 'id', v_id);
end $$;

-- QL duyệt / từ chối (khi tắt tự cập nhật, hoặc đề xuất bị kẹt do khoá sổ)
create or replace function public.bi_review(p_ids bigint[], p_ok boolean, p_pick jsonb default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.bi_proposals; tot int := 0; done int := 0;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý duyệt được.'; end if;
  for r in select * from public.bi_proposals where id = any(p_ids) and status = 'pending' order by as_of, id loop
    perform public._manager_scope(r.staff_id, r.as_of);   -- đúng bộ phận + ngày chưa khoá sổ
    if not p_ok then
      update public.bi_proposals set status = 'rejected', reviewed_by = m.email, reviewed_at = now(), note = left(p_note, 300) where id = r.id;
    else
      tot := tot + coalesce(public._bi_apply(r.id, m.email, coalesce(p_pick -> r.id::text, '{}'::jsonb), false), 0);
      if p_note is not null then update public.bi_proposals set note = left(p_note, 300) where id = r.id; end if;
    end if;
    done := done + 1;
  end loop;
  if done = 0 then raise exception 'Không có đề xuất nào đang chờ duyệt.'; end if;
  return jsonb_build_object('status', 'success', 'done', done, 'changed', tot,
    'message', case when p_ok then '✅ Đã duyệt ' || done || ' NV · ghi ' || tot || ' điều chỉnh vào lũy kế' else 'Đã từ chối ' || done || ' đề xuất' end);
end $$;

revoke execute on function public._bi_apply(bigint, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public._bi_propose(jsonb, text) from public, anon, authenticated;
grant execute on function public._bi_propose(jsonb, text) to service_role;
revoke execute on function public.bi_review(bigint[], boolean, jsonb, text) from public, anon;
grant execute on function public.bi_review(bigint[], boolean, jsonb, text) to authenticated;

-- Các đề xuất đang chờ (thẻ NV đã đọc trước đây) → cập nhật luôn
do $$ declare x record; begin
  for x in select id from public.bi_proposals where status = 'pending' order by as_of, id loop
    begin
      perform public._bi_apply(x.id, 'tu-dong (BI)', '{}'::jsonb, true);
    exception when others then
      update public.bi_proposals set note = left('Không tự cập nhật được: ' || sqlerrm, 300) where id = x.id;
    end;
  end loop;
end $$;
