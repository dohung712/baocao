-- B16b Duyệt số BI của NV: thẻ NV đọc từ ảnh BI → ĐỀ XUẤT (chờ QL duyệt) → QL duyệt mới ghi vào lũy kế tháng
--   (DT QĐ → revenue_entries 'adjust'; môn thi đua → item_adjustments) như C12, nên bảng điểm C10 / Của tôi dùng số BI.
--   Số ghi = lũy kế đến hết ngày số liệu BI (data_through); tool ghi phần chênh lệch so với số đang có tới ngày đó.
create table if not exists public.bi_proposals (
  id bigint generated always as identity primary key,
  file_id text not null unique,                    -- ảnh BI (bi_files.file_id) tạo ra đề xuất
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  month date not null,                             -- ngày 1 của tháng
  as_of date not null,                             -- số liệu tới hết ngày
  revenue numeric,                                 -- DT QĐ lũy kế theo BI (triệu)
  items jsonb not null default '[]'::jsonb,        -- [{name (môn trong tool), bi_name, pct, target, value}]
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  created_by text,
  reviewed_by text, reviewed_at timestamptz, note text,
  result jsonb
);
create index if not exists bi_proposals_status_idx on public.bi_proposals(status, staff_id, as_of desc);
alter table public.bi_proposals enable row level security;
drop policy if exists bi_proposals_read on public.bi_proposals;
create policy bi_proposals_read on public.bi_proposals for select to authenticated using (public.can_see_staff(staff_id));
grant select on public.bi_proposals to authenticated;
revoke insert, update, delete on public.bi_proposals from authenticated;
revoke all on public.bi_proposals from anon;

-- Edge Function ghi đề xuất mới: đề xuất cũ chưa duyệt của cùng NV, cùng tháng → "superseded"
create or replace function public._bi_propose(p jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_month date := date_trunc('month', (p ->> 'as_of')::date)::date;
begin
  if exists (select 1 from public.bi_proposals where file_id = p ->> 'file_id') then return jsonb_build_object('status', 'exists'); end if;
  update public.bi_proposals set status = 'superseded', reviewed_at = now(), reviewed_by = p_actor, note = 'Có ảnh BI mới hơn'
   where staff_id = p ->> 'staff_id' and month = v_month and status = 'pending' and as_of <= (p ->> 'as_of')::date;
  insert into public.bi_proposals(file_id, staff_id, month, as_of, revenue, items, created_by)
  values (p ->> 'file_id', p ->> 'staff_id', v_month, (p ->> 'as_of')::date, nullif(p ->> 'revenue', '')::numeric, coalesce(p -> 'items', '[]'::jsonb), p_actor)
  returning id into v_id;
  return jsonb_build_object('status', 'success', 'id', v_id);
end $$;

-- QL duyệt / từ chối. p_pick = {"<id>": {"revenue": true|false, "items": ["tên môn", ...]}} — không có = lấy hết dòng của đề xuất
create or replace function public.bi_review(p_ids bigint[], p_ok boolean, p_pick jsonb default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.bi_proposals; k jsonb; e jsonb; v_tool numeric; v_val numeric; v_note text;
  v_rev jsonb; v_log jsonb; n int; tot int := 0; done int := 0;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý duyệt được.'; end if;
  for r in select * from public.bi_proposals where id = any(p_ids) order by as_of, id for update loop
    if r.status <> 'pending' then continue; end if;
    perform public._manager_scope(r.staff_id, r.as_of);   -- đúng bộ phận + ngày chưa khoá sổ
    if not p_ok then
      update public.bi_proposals set status = 'rejected', reviewed_by = m.email, reviewed_at = now(), note = left(p_note, 300) where id = r.id;
      done := done + 1; continue;
    end if;
    k := coalesce(p_pick -> r.id::text, '{}'::jsonb);
    v_note := 'Duyệt số BI đến ' || to_char(r.as_of, 'DD/MM');
    v_rev := null; v_log := '[]'::jsonb; n := 0;
    if r.revenue is not null and coalesce((k ->> 'revenue')::boolean, true) then
      select coalesce(sum(amount), 0) into v_tool from public.revenue_entries where staff_id = r.staff_id and entry_date between r.month and r.as_of;
      if round(r.revenue - v_tool, 4) <> 0 then
        insert into public.revenue_entries(staff_id, entry_date, kind, amount, note, created_by) values (r.staff_id, r.as_of, 'adjust', r.revenue - v_tool, v_note, m.email);
        n := n + 1;
      end if;
      v_rev := jsonb_build_object('from', v_tool, 'to', r.revenue);
    end if;
    for e in select * from jsonb_array_elements(r.items) loop
      continue when e ->> 'value' is null;
      continue when k ? 'items' and not ((k -> 'items') ? (e ->> 'name'));
      v_val := (e ->> 'value')::numeric;
      v_tool := public._cum_tool(r.staff_id, e ->> 'name', r.month, r.as_of);
      if round(v_val - v_tool, 4) <> 0 then
        insert into public.item_adjustments(staff_id, item_name, adj_date, delta, note, created_by) values (r.staff_id, e ->> 'name', r.as_of, v_val - v_tool, v_note, m.email);
        n := n + 1;
      end if;
      v_log := v_log || jsonb_build_object('name', e ->> 'name', 'from', v_tool, 'to', v_val);
    end loop;
    insert into public.score_log(actor, staff_id, kind, action, detail, reason)
    values (m.email, r.staff_id, 'cumulative', 'bi_approve', jsonb_build_object('as_of', r.as_of, 'revenue', v_rev, 'items', v_log, 'changed', n, 'proposal', r.id), v_note);
    update public.bi_proposals set status = 'approved', reviewed_by = m.email, reviewed_at = now(), note = left(p_note, 300),
      result = jsonb_build_object('revenue', v_rev, 'items', v_log, 'changed', n) where id = r.id;
    tot := tot + n; done := done + 1;
  end loop;
  if done = 0 then raise exception 'Không có đề xuất nào đang chờ duyệt.'; end if;
  return jsonb_build_object('status', 'success', 'done', done, 'changed', tot,
    'message', case when p_ok then '✅ Đã duyệt ' || done || ' NV · ghi ' || tot || ' điều chỉnh vào lũy kế' else 'Đã từ chối ' || done || ' đề xuất' end);
end $$;

revoke execute on function public._bi_propose(jsonb, text) from public, anon, authenticated;
grant execute on function public._bi_propose(jsonb, text) to service_role;
revoke execute on function public.bi_review(bigint[], boolean, jsonb, text) from public, anon;
grant execute on function public.bi_review(bigint[], boolean, jsonb, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bi_proposals') then
    alter publication supabase_realtime add table public.bi_proposals;
  end if;
end $$;
