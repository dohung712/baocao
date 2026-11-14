-- =====================================================================
-- Thi đua v2 — tính sao / chuỗi / tăng ca ở máy chủ (giữ nguyên quy tắc bản PRO)
-- =====================================================================

-- Danh sách môn của 1 nhân viên (môn riêng, hoặc môn Chung + môn của bộ phận; trùng tên thì ưu tiên môn của bộ phận)
create or replace function public._staff_items(p_staff text)
returns setof public.items
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.staff where id = p_staff),
  cand as (
    select i.*,
      row_number() over (partition by i.name order by (lower(i.store) = lower(s.dept)) desc, i.sort, i.id) rn,
      min(i.sort::bigint * 1000000000 + i.id) over (partition by i.name) ord
    from public.items i, s
    where i.active and (
      case when cardinality(s.assigned_items) > 0 then i.name = any(s.assigned_items)
      else i.store = 'Chung' or lower(i.store) = lower(s.dept) end)
  )
  select id, store, name, target, bonus_star, penalty_star, is_x2, sort, active, created_at
  from cand where rn = 1 order by ord
$$;

-- Chuỗi hiện tại của 1 môn tính đến trước ngày p_date
create or replace function public._item_streak(p_staff text, p_item text, p_date date)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare r record; n int := 0; v_reset date;
begin
  if public.setting_text('AUTO_STREAK_ENABLED', 'ON') = 'OFF' then return 0; end if;
  select reset_date into v_reset from public.staff where id = p_staff;
  for r in select status, compensation from public.daily_results
           where staff_id = p_staff and item_name = p_item and report_date < p_date
             and (v_reset is null or report_date > v_reset)
           order by report_date desc, id desc loop
    exit when r.status = 'Về số';
    if r.status = 'Chưa về' and r.compensation <> 'TANG_CA' then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Lõi tính toán. p_dry = true: chỉ tính, không ghi.
create or replace function public._compute_report(
  p_staff text, p_date date, p_reports jsonb, p_extra_item text, p_extra_stars integer,
  p_actor text, p_at timestamptz, p_dry boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
begin
  select * into st from public.staff where id = p_staff;
  if st.id is null then raise exception 'Nhân viên không tồn tại.'; end if;
  if p_date is null or p_date > (p_at at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Ngày báo cáo không hợp lệ.'; end if;

  v_items := array(select x from public._staff_items(p_staff) x);
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
   where staff_id = p_staff and report_date = p_date and compensation <> 'TIKTOK_PHAT';
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

  if p_dry then
    return jsonb_build_object('status', 'preview', 'rows', rows, 'total_before', v_total,
      'day_change', (select coalesce(sum((r ->> 'starChange')::int), 0) from jsonb_array_elements(rows) r),
      'old_day_change', v_old);
  end if;

  -- Ghi: thay toàn bộ báo cáo của ngày (giữ dòng phạt TikTok)
  delete from public.daily_results where staff_id = p_staff and report_date = p_date and compensation <> 'TIKTOK_PHAT';
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
end $$;
revoke all on function public._compute_report(text, date, jsonb, text, integer, text, timestamptz, boolean) from public, anon, authenticated;

-- ---------- API cho giao diện ----------
create or replace function public._require_member() returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public.app_member();
  if m.email is null then raise exception 'Tài khoản chưa được cấp quyền. Liên hệ chủ quản.'; end if;
  return m;
end $$;

create or replace function public.preview_daily_report(p_staff text, p_date date, p_reports jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  return public._compute_report(p_staff, p_date, p_reports, '', 0, '', now(), true);
end $$;

-- Thông tin để vẽ bảng báo cáo: danh sách môn + chuỗi hiện tại + báo cáo đã nộp (nếu có)
create or replace function public.report_form(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'target', i.target, 'bonus', i.bonus_star,
              'penalty', i.penalty_star, 'isX2', i.is_x2, 'streak', public._item_streak(p_staff, i.name, p_date))) from public._staff_items(p_staff) i), '[]'::jsonb),
    'existing', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.daily_results r where r.staff_id = p_staff and r.report_date = p_date), '[]'::jsonb),
    'proposal', (select to_jsonb(p) from public.extra_proposals p where p.staff_id = p_staff and p.report_date = p_date order by id limit 1),
    'locked', exists (select 1 from public.locked_dates where d = p_date),
    'after_cutoff', public.is_after_cutoff(p_date),
    'total_star', public.staff_total(p_staff)
  ) into v;
  return v;
end $$;

create or replace function public.submit_daily_report(p_staff text, p_date date, p_reports jsonb,
  p_extra_item text default '', p_extra_stars integer default 0, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_locked boolean; v_existing boolean;
begin
  m := public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Bạn không có quyền báo cáo cho nhân viên này.'; end if;
  if exists (select 1 from public.staff where id = p_staff and hidden) then raise exception 'Nhân viên đang bị ẩn.'; end if;
  v_locked := exists (select 1 from public.locked_dates where d = p_date);
  v_existing := exists (select 1 from public.daily_results where staff_id = p_staff and report_date = p_date and compensation <> 'TIKTOK_PHAT');
  if m.role = 'owner' and v_locked then raise exception 'Ngày % đã khóa chốt sổ. Mở khóa trước khi sửa.', to_char(p_date, 'DD/MM/YYYY'); end if;
  if m.role <> 'owner' and (v_locked or (v_existing and public.is_after_cutoff(p_date))) then
    if p_reason is null then
      return jsonb_build_object('status', 'approval_required', 'message',
        case when v_locked then 'Ngày này đã khóa chốt sổ.' else 'Đã qua giờ chốt, báo cáo đã nộp chỉ sửa được khi quản lý duyệt.' end);
    end if;
    if length(btrim(p_reason)) < 5 then raise exception 'Nhập lý do sửa (ít nhất 5 ký tự).'; end if;
    perform public._compute_report(p_staff, p_date, p_reports, p_extra_item, p_extra_stars, m.email, now(), true);
    insert into public.change_requests(email, staff_id, report_date, reason, payload)
    values (m.email, p_staff, p_date, left(btrim(p_reason), 1000),
            jsonb_build_object('reports', p_reports, 'extraItem', p_extra_item, 'extraStars', p_extra_stars));
    return jsonb_build_object('status', 'pending', 'message', 'Đã gửi yêu cầu sửa, chờ quản lý duyệt.');
  end if;
  return public._compute_report(p_staff, p_date, p_reports, p_extra_item, p_extra_stars, m.email, now(), false);
end $$;

create or replace function public.review_change(p_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.change_requests; res jsonb;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Không đủ quyền duyệt.'; end if;
  select * into r from public.change_requests where id = p_id and status = 'pending' for update;
  if r.id is null then raise exception 'Yêu cầu đã được xử lý.'; end if;
  if not public.can_see_staff(r.staff_id) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  if p_approve then
    res := public._compute_report(r.staff_id, r.report_date, r.payload -> 'reports', r.payload ->> 'extraItem',
             coalesce((r.payload ->> 'extraStars')::int, 0), r.email, r.created_at, false);
  end if;
  update public.change_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = m.email, reviewed_at = now() where id = p_id;
  insert into public.audit_log(actor, action, target, details)
  values (m.email, case when p_approve then 'APPROVE_CHANGE' else 'REJECT_CHANGE' end, r.staff_id, jsonb_build_object('date', r.report_date));
  return jsonb_build_object('status', 'success', 'message', case when p_approve then 'Đã duyệt và cập nhật báo cáo.' else 'Đã từ chối yêu cầu.' end);
end $$;

create or replace function public._manager_scope(p_staff text, p_date date) returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được dùng chức năng này.'; end if;
  if p_staff is not null and not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  if p_date is not null and exists (select 1 from public.locked_dates where d = p_date) then
    raise exception 'Ngày % đã khóa chốt sổ.', to_char(p_date, 'DD/MM/YYYY');
  end if;
  return m;
end $$;

create or replace function public.delete_report_day(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; n int;
begin
  m := public._manager_scope(p_staff, p_date);
  delete from public.daily_results where staff_id = p_staff and report_date = p_date;
  get diagnostics n = row_count;
  delete from public.extra_proposals where staff_id = p_staff and report_date = p_date and status = 'Chờ duyệt';
  insert into public.audit_log(actor, action, target, details) values (m.email, 'DELETE_DAY', p_staff, jsonb_build_object('date', p_date, 'rows', n));
  return jsonb_build_object('status', 'success', 'deleted', n);
end $$;

create or replace function public.delete_result(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.daily_results;
begin
  select * into r from public.daily_results where id = p_id;
  if r.id is null then raise exception 'Không tìm thấy dòng báo cáo.'; end if;
  m := public._manager_scope(r.staff_id, r.report_date);
  delete from public.daily_results where id = p_id;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'DELETE_ROW', r.staff_id, jsonb_build_object('date', r.report_date, 'item', r.item_name, 'star', r.star_change));
  return jsonb_build_object('status', 'success');
end $$;

create or replace function public.reset_streak(p_staff text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._manager_scope(p_staff, null);
  update public.staff set reset_date = public.vn_today(), updated_at = now() where id = p_staff;
  insert into public.audit_log(actor, action, target) values (m.email, 'RESET_STREAK', p_staff);
  return jsonb_build_object('status', 'success');
end $$;

create or replace function public.review_proposal(p_id bigint, p_approve boolean, p_stars integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; p public.extra_proposals;
begin
  select * into p from public.extra_proposals where id = p_id for update;
  if p.id is null then raise exception 'Không tìm thấy đề xuất.'; end if;
  m := public._manager_scope(p.staff_id, null);
  if p.status <> 'Chờ duyệt' then raise exception 'Đề xuất này đã được xử lý (%).', p.status; end if;
  update public.extra_proposals set status = case when p_approve then 'Đã duyệt' else 'Từ chối' end,
    stars = coalesce(greatest(0, p_stars), stars), reviewed_by = m.email, reviewed_at = now() where id = p_id;
  insert into public.audit_log(actor, action, target, details) values (m.email, case when p_approve then 'APPROVE_EXTRA' else 'REJECT_EXTRA' end, p.staff_id, jsonb_build_object('id', p_id));
  return jsonb_build_object('status', 'success');
end $$;

-- Chủ quản chỉnh tổng sao: đổi sao gốc để tổng = giá trị mới
create or replace function public.set_staff_total(p_staff text, p_total integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_old int;
begin
  m := public._require_member();
  if m.role <> 'owner' then raise exception 'Chỉ chủ quản được chỉnh tổng sao.'; end if;
  v_old := public.staff_total(p_staff);
  if v_old is null then raise exception 'Nhân viên không tồn tại.'; end if;
  update public.staff set base_star = base_star + (p_total - v_old), updated_at = now() where id = p_staff;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'SET_TOTAL', p_staff, jsonb_build_object('from', v_old, 'to', p_total));
  return jsonb_build_object('status', 'success', 'total_star', p_total);
end $$;

create or replace function public.save_store_contest(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; n int;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được lưu số liệu siêu thị.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Chưa có dữ liệu.'; end if;
  delete from public.store_contest where true;
  insert into public.store_contest(name, type, actual, target, rate_month, forecast, rank, branch, sort, updated_by)
  select left(coalesce(r ->> 'name', ''), 200), left(coalesce(r ->> 'type', ''), 50),
         coalesce((r ->> 'actual')::numeric, 0), coalesce((r ->> 'target')::numeric, 0),
         coalesce((r ->> 'rateMonth')::numeric, 0), coalesce((r ->> 'forecast')::numeric, 0),
         left(coalesce(r ->> 'rank', '-'), 20), left(coalesce(r ->> 'branch', 'TỔNG'), 20), (ord - 1)::int, m.email
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);
  get diagnostics n = row_count;
  insert into public.store_contest_snapshots(snap_date, data, saved_by) values (public.vn_today(), p_rows, m.email)
  on conflict (snap_date) do update set data = excluded.data, saved_at = now(), saved_by = excluded.saved_by;
  insert into public.audit_log(actor, action, details) values (m.email, 'SAVE_STORE_CONTEST', jsonb_build_object('rows', n));
  return jsonb_build_object('status', 'success', 'rows', n);
end $$;

-- Bảng xếp hạng cá nhân trong khoảng ngày
create or replace function public.leaderboard(p_from date, p_to date)
returns table (staff_id text, name text, dept text, total_star int, period_star int, days int,
               ok_items int, all_items int, overtime int, used_star int, late int, risk_item text, risk_streak int)
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships; v_all boolean;
begin
  m := public._require_member();
  v_all := m.role = 'owner' or (public.setting_text('EMPLOYEE_SEE_LEADERBOARD', 'false') = 'true');
  return query
  with s as (
    select x.* from public.staff x
    where not x.hidden and (v_all or public.can_see_staff(x.id))
  ), r as (
    select d.* from public.daily_results d join s on s.id = d.staff_id
    where d.report_date between p_from and p_to
  ), agg as (
    select r.staff_id,
      sum(r.star_change)::int period_star,
      count(distinct r.report_date)::int days,
      count(*) filter (where r.status = 'Về số')::int ok_items,
      count(*) filter (where r.status in ('Về số', 'Chưa về'))::int all_items,
      count(*) filter (where r.compensation = 'TANG_CA')::int overtime,
      count(*) filter (where r.status = 'Chưa về' and r.star_change < 0)::int used_star,
      count(*) filter (where r.compensation = 'PHAT_TRE')::int late
    from r group by r.staff_id
  ), risk as (
    select distinct on (s.id) s.id sid, i.name iname, public._item_streak(s.id, i.name, public.vn_today() + 1) st
    from s cross join lateral public._staff_items(s.id) i
    order by s.id, 3 desc
  )
  select s.id, s.name, s.dept, public.staff_total(s.id), coalesce(a.period_star, 0), coalesce(a.days, 0),
         coalesce(a.ok_items, 0), coalesce(a.all_items, 0), coalesce(a.overtime, 0), coalesce(a.used_star, 0), coalesce(a.late, 0),
         case when risk.st > 0 then risk.iname end, coalesce(risk.st, 0)
  from s left join agg a on a.staff_id = s.id left join risk on risk.sid = s.id
  order by 4 desc, s.name;
end $$;

-- Cài đặt Telegram (token lưu ở bảng bí mật)
create or replace function public.set_private_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Chỉ chủ quản được đổi cài đặt này.'; end if;
  if p_key not in ('TELEGRAM_BOT_TOKEN') then raise exception 'Khóa cài đặt không hợp lệ.'; end if;
  if coalesce(btrim(p_value), '') = '' then delete from public.private_settings where key = p_key;
  else insert into public.private_settings(key, value) values (p_key, btrim(p_value))
       on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  return jsonb_build_object('status', 'success', 'has_value', coalesce(btrim(p_value), '') <> '');
end $$;
create or replace function public.private_setting_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_owner() then
    jsonb_build_object('TELEGRAM_BOT_TOKEN', exists (select 1 from public.private_settings where key = 'TELEGRAM_BOT_TOKEN'))
  else '{}'::jsonb end
$$;

grant execute on function public.preview_daily_report(text, date, jsonb), public.report_form(text, date),
  public.submit_daily_report(text, date, jsonb, text, integer, text), public.review_change(uuid, boolean),
  public.delete_report_day(text, date), public.delete_result(bigint), public.reset_streak(text),
  public.review_proposal(bigint, boolean, integer), public.set_staff_total(text, integer),
  public.save_store_contest(jsonb), public.leaderboard(date, date),
  public.set_private_setting(text, text), public.private_setting_status() to authenticated;
revoke execute on function public._staff_items(text), public._item_streak(text, text, date),
  public._require_member(), public._manager_scope(text, date) from public, anon, authenticated;
