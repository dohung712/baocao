-- F2q: Môn & sao — chỉnh nhanh +/− sao và Bật/Tắt từng môn theo từng bộ phận (quản lý chỉnh được bộ phận mình phụ trách)
-- B1:  form báo cáo biết môn nào "không trừ sao" (sao phạt 0 hoặc quy tắc noPen) để đưa xuống cuối, tô màu khác
-- D10: CV → 📄 Biên bản — biên bản vi phạm có giờ + ảnh (Google Drive); mỗi biên bản = 1 lần vi phạm

-- ---------- 1) _staff_items: chọn dòng môn của bộ phận NV TRƯỚC rồi mới xét Bật ----------
-- Trước đây (nhánh không có môn tháng) dòng bộ phận bị tắt bị lọc bỏ trước → rơi về dòng "Chung" đang bật → tắt theo bộ phận không có tác dụng.
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
    select i.id, i.store, c.name, public._daily_target(c.tgt / public._work_days(p_staff, (select m from d))) target,
           coalesce(t.bonus_star, i.bonus_star) bonus_star, coalesce(t.penalty_star, i.penalty_star) penalty_star,
           i.is_x2, c.o::int sort, true active, i.created_at, i.is_x3, i.focus, i.low_target, i.store_target, i.store_pct, i.store_pct_at, c.o
    from contest c cross join s
    cross join lateral (select * from public.items i where i.name = c.name
                        order by (lower(i.store) = lower(s.dept)) desc, (i.store = 'Chung') desc, i.active desc, i.sort, i.id limit 1) i
    left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name
    where i.active   -- môn bị bỏ tích "Bật" ở Môn & Sao thì không hiện trong báo cáo ngày
  ),
  cand as (
    select i.*,
      row_number() over (partition by i.name order by (lower(i.store) = lower(s.dept)) desc, (i.store = 'Chung') desc, i.sort, i.id) rn,
      min(case when i.active then i.sort::bigint * 1000000000 + i.id end) over (partition by i.name) ord
    from public.items i, s
    where not exists (select 1 from contest) and (
      case when cardinality(s.assigned_items) > 0 then i.name = any(s.assigned_items)
      else i.store = 'Chung' or lower(i.store) = lower(s.dept) end)
  )
  select id, store, name, target, bonus_star, penalty_star, is_x2, sort, active, created_at, is_x3, focus, low_target, store_target, store_pct, store_pct_at from (
    select f.id, f.store, f.name, f.target, f.bonus_star, f.penalty_star, f.is_x2, f.sort, f.active, f.created_at, f.is_x3,
           f.focus, f.low_target, f.store_target, f.store_pct, f.store_pct_at, f.o::bigint k from from_contest f
    union all
    select c.id, c.store, c.name, coalesce(t.target, c.target), coalesce(t.bonus_star, c.bonus_star), coalesce(t.penalty_star, c.penalty_star),
           c.is_x2, c.sort, c.active, c.created_at, c.is_x3, c.focus, c.low_target, c.store_target, c.store_pct, c.store_pct_at, c.ord
    from cand c left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name
    where c.rn = 1 and c.active   -- dòng được chọn (bộ phận trước, rồi Chung) đang tắt thì ẩn môn
  ) z order by k
$$;
revoke execute on function public._staff_items(text, date) from public, anon, authenticated;

-- ---------- 2) Môn "không trừ sao" với NV: quy tắc ITEM_RULES có noPen (cùng cách chọn quy tắc như _compute_report) ----------
create or replace function public._item_no_pen(p_staff text, p_item text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (r ->> 'noPen')::boolean
    from public.settings st0
    cross join lateral jsonb_array_elements(case when jsonb_typeof(st0.value) = 'array' then st0.value else '[]'::jsonb end) r
    where st0.key = 'ITEM_RULES'
      and (r ->> 'item' = '*' or r ->> 'item' = p_item)
      and (coalesce(jsonb_array_length(r -> 'staffIds'), 0) = 0 or (r -> 'staffIds') ? p_staff)
      and (coalesce(jsonb_array_length(r -> 'stores'), 0) = 0 or (r -> 'stores') ? (select dept from public.staff where id = p_staff))
    order by (case when coalesce(jsonb_array_length(r -> 'staffIds'), 0) > 0 then 100 else 0 end)
           + (case when coalesce(jsonb_array_length(r -> 'stores'), 0) > 0 then 10 else 0 end)
           + (case when r ->> 'item' <> '*' then 1 else 0 end) desc
    limit 1), false)
$$;
revoke execute on function public._item_no_pen(text, text) from public, anon, authenticated;

-- ---------- 3) report_form: thêm cờ noPen cho từng môn ----------
create or replace function public.report_form(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'target', i.target, 'bonus', i.bonus_star,
              'penalty', i.penalty_star, 'isX2', i.is_x2, 'isX3', i.is_x3, 'streak', public._item_streak(p_staff, i.name, p_date),
              'noPen', (i.penalty_star <= 0 or public._item_no_pen(p_staff, i.name)))) from public._staff_items(p_staff, p_date) i), '[]'::jsonb),
    'existing', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.daily_results r where r.staff_id = p_staff and r.report_date = p_date), '[]'::jsonb),
    'proposal', (select to_jsonb(p) from public.extra_proposals p where p.staff_id = p_staff and p.report_date = p_date order by id limit 1),
    'locked', exists (select 1 from public.locked_dates where d = p_date),
    'after_cutoff', public.is_after_cutoff(p_date),
    'total_star', public.staff_total(p_staff)
  ) into v;
  return v;
end $$;
revoke execute on function public.report_form(text, date) from public, anon;
grant execute on function public.report_form(text, date) to authenticated;

-- ---------- 4) items_quick_save: lưu nhanh +/− sao, Bật/Tắt theo bộ phận ----------
-- p_changes: [{store, name, bonus?, penalty?, active?}] hoặc [{store, name, reset: true}] (bỏ mức riêng của bộ phận, quay về theo "Chung")
-- Chủ quản: mọi bộ phận + "Chung". Quản lý: chỉ bộ phận trong memberships.stores.
create or replace function public.items_quick_save(p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; c jsonb; v_store text; v_name text; src public.items; cur public.items; n int := 0;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được chỉnh môn & sao.'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Dữ liệu không hợp lệ.'; end if;
  if jsonb_array_length(p_changes) > 500 then raise exception 'Quá nhiều thay đổi một lần.'; end if;
  for c in select x from jsonb_array_elements(p_changes) x loop
    v_store := btrim(coalesce(c ->> 'store', '')); v_name := btrim(coalesce(c ->> 'name', ''));
    if v_store = '' or v_name = '' then raise exception 'Thiếu bộ phận hoặc tên môn.'; end if;
    if m.role <> 'owner' and (v_store = 'Chung' or not (v_store = any(coalesce(m.stores, '{}')))) then
      raise exception 'Bạn chỉ chỉnh được môn của bộ phận mình phụ trách (%).', v_store;
    end if;
    cur := null;
    select * into cur from public.items where store = v_store and name = v_name;
    if coalesce((c ->> 'reset')::boolean, false) then
      if v_store = 'Chung' then raise exception 'Không bỏ được dòng "Chung".'; end if;
      if cur.id is not null then delete from public.items where id = cur.id; n := n + 1; end if;
      continue;
    end if;
    if cur.id is null then   -- bộ phận đang theo "Chung" (hoặc chưa có môn này) → tạo mức riêng, chép từ dòng gốc
      src := null;
      select * into src from public.items where name = v_name order by (store = 'Chung') desc, active desc, sort, id limit 1;
      if src.id is null then raise exception 'Không tìm thấy môn "%".', v_name; end if;
      insert into public.items(store, name, target, bonus_star, penalty_star, is_x2, is_x3, sort, active, focus, low_target, store_target, store_pct, store_pct_at)
      values (v_store, v_name, src.target, src.bonus_star, src.penalty_star, src.is_x2, src.is_x3, src.sort, src.active, src.focus, src.low_target, src.store_target, src.store_pct, src.store_pct_at)
      returning * into cur;
    end if;
    update public.items set
      bonus_star   = case when c ? 'bonus'   and jsonb_typeof(c -> 'bonus')   = 'number' then greatest(0, round((c ->> 'bonus')::numeric))::int   else bonus_star end,
      penalty_star = case when c ? 'penalty' and jsonb_typeof(c -> 'penalty') = 'number' then greatest(0, round((c ->> 'penalty')::numeric))::int else penalty_star end,
      active       = case when c ? 'active'  and jsonb_typeof(c -> 'active')  = 'boolean' then (c ->> 'active')::boolean else active end
    where id = cur.id;
    n := n + 1;
  end loop;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'ITEMS_QUICK', 'items', jsonb_build_object('n', n, 'changes', p_changes));
  return jsonb_build_object('status', 'success', 'n', n, 'message', format('Đã lưu %s thay đổi', n));
end $$;
revoke execute on function public.items_quick_save(jsonb) from public, anon;
grant execute on function public.items_quick_save(jsonb) to authenticated;

-- ---------- 5) Biên bản vi phạm: giờ + ảnh (mã file Google Drive) ----------
alter table public.violations add column if not exists v_time time;
alter table public.violations add column if not exists photos text[] not null default '{}';

drop function if exists public.add_violation(text, date, text, text);
create or replace function public.add_violation(p_staff text, p_date date, p_type text, p_note text,
                                                p_time time default null, p_photos text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_pts numeric := public.setting_num('VIOLATION_POINTS', 2); v_id bigint;
        v_photos text[] := coalesce(p_photos, '{}'); v_date date := coalesce(p_date, public.vn_today());
begin
  m := public._manager_scope(p_staff, null);
  if btrim(coalesce(p_type, '')) = '' then raise exception 'Chọn loại lỗi.'; end if;
  if v_date > public.vn_today() then raise exception 'Không ghi vi phạm cho ngày tương lai.'; end if;
  if cardinality(v_photos) > 10 then raise exception 'Tối đa 10 ảnh mỗi biên bản.'; end if;
  if exists (select 1 from unnest(v_photos) x where x !~ '^(v2:[\w./-]+|[\w-]{20,})$') then raise exception 'Mã ảnh không hợp lệ.'; end if;
  insert into public.violations(staff_id, v_date, v_time, type, note, points, created_by, photos)
  values (p_staff, v_date, p_time, btrim(p_type), nullif(btrim(coalesce(p_note, '')), ''), v_pts, m.email, v_photos)
  returning id into v_id;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason)
  values (m.email, p_staff, 'violation', 'add', jsonb_build_object('date', v_date, 'time', p_time, 'type', p_type, 'points', v_pts, 'photos', cardinality(v_photos)), p_note);
  return jsonb_build_object('status', 'success', 'id', v_id, 'message', format('Đã ghi lỗi (−%s điểm)', v_pts));
end $$;
revoke execute on function public.add_violation(text, date, text, text, time, text[]) from public, anon;
grant execute on function public.add_violation(text, date, text, text, time, text[]) to authenticated;

-- Xoá: trả về danh sách ảnh để giao diện chuyển file Drive vào thùng rác
create or replace function public.delete_violation(p_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v public.violations;
begin
  select * into v from public.violations where id = p_id;
  if v.id is null then raise exception 'Không tìm thấy.'; end if;
  m := public._manager_scope(v.staff_id, null);
  delete from public.violations where id = p_id;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason)
  values (m.email, v.staff_id, 'violation', 'delete', jsonb_build_object('date', v.v_date, 'time', v.v_time, 'type', v.type, 'points', v.points, 'photos', cardinality(v.photos)), p_reason);
  return jsonb_build_object('status', 'success', 'photos', to_jsonb(v.photos));
end $$;
revoke execute on function public.delete_violation(bigint, text) from public, anon;
grant execute on function public.delete_violation(bigint, text) to authenticated;
