-- =====================================================================
-- Thi đua v2 — cập nhật: tổng sao gồm thưởng TikTok, target riêng NV, phạt TikTok trong báo cáo ngày,
-- chuyển dữ liệu module CV từ bản cũ
-- =====================================================================

create or replace function public.legacy_hm(v text) returns text
language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  v := btrim(coalesce(v, ''));
  m := regexp_match(v, '^(\d{1,2}):(\d{2})');
  if m is not null then return lpad(m[1], 2, '0') || ':' || m[2]; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}T' then
    begin return to_char(v::timestamptz at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'); exception when others then return ''; end;
  end if;
  return '';
end $$;

create or replace function public.staff_total(p_staff text) returns integer
language sql stable security definer set search_path = '' as $$
  select s.base_star
    + coalesce((select sum(star_change)::int from public.daily_results where staff_id = s.id), 0)
    + coalesce((select sum(stars)::int from public.extra_proposals where staff_id = s.id and status = 'Đã duyệt'), 0)
    + coalesce((select sum(reward)::int from public.tiktok_submissions where staff_id = s.id), 0)
  from public.staff s where s.id = p_staff
$$;

create or replace view public.staff_stars with (security_invoker = true) as
select s.*,
  s.base_star + coalesce(r.delta, 0) + coalesce(p.delta, 0) + coalesce(t.delta, 0) as total_star,
  coalesce(r.delta, 0) + coalesce(p.delta, 0) + coalesce(t.delta, 0) as delta_star
from public.staff s
left join (select staff_id, sum(star_change)::int delta from public.daily_results group by staff_id) r on r.staff_id = s.id
left join (select staff_id, sum(stars)::int delta from public.extra_proposals where status = 'Đã duyệt' group by staff_id) p on p.staff_id = s.id
left join (select staff_id, sum(reward)::int delta from public.tiktok_submissions group by staff_id) t on t.staff_id = s.id;
grant select on public.staff_stars to authenticated;

-- Danh sách môn của NV: áp target / sao riêng nếu có
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
  select c.id, c.store, c.name, coalesce(t.target, c.target), coalesce(t.bonus_star, c.bonus_star), coalesce(t.penalty_star, c.penalty_star),
         c.is_x2, c.sort, c.active, c.created_at
  from cand c left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name
  where c.rn = 1 order by c.ord
$$;
revoke execute on function public._staff_items(text) from public, anon, authenticated;

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
  v_tt_start date; v_tt_pen int; v_due date; v_tt public.tiktok_submissions;
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
end $$;
revoke all on function public._compute_report(text, date, jsonb, text, integer, text, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.migrate_legacy()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sh jsonb; r jsonb; ord bigint;
  v_key text; v_val jsonb; v_txt text; v_num numeric;
  labels jsonb := '{
    "Chuỗi ngày được tăng ca":"STREAK_OVERTIME","Chuỗi ngày bị trừ sao":"STREAK_PENALTY_STAR",
    "Chuỗi ngày báo mail khẩn":"STREAK_ALERT_EMAIL","Email quản lý":"MANAGER_EMAIL",
    "Tự động tính chuỗi":"AUTO_STREAK_ENABLED","Tỷ lệ thưởng nhân đôi X2 (%)":"DOUBLE_BONUS_RATE",
    "Cho phép nhân viên sửa chuỗi":"ALLOW_STAFF_EDIT_STREAK","Ngày đã khóa chốt sổ":"LOCKED_DATES",
    "Quy tắc riêng từng môn":"ITEM_RULES",
    "Phạt lũy tiến - chuỗi bắt đầu bậc 2":"PEN_T2_MIN","Phạt lũy tiến - chuỗi bắt đầu bậc 3":"PEN_T3_MIN",
    "Phạt lũy tiến - chuỗi bắt đầu bậc 4":"PEN_T4_MIN","Phạt lũy tiến - hệ số bậc 1":"PEN_M1",
    "Phạt lũy tiến - hệ số bậc 2":"PEN_M2","Phạt lũy tiến - hệ số bậc 3":"PEN_M3","Phạt lũy tiến - hệ số bậc 4":"PEN_M4",
    "Ngày bắt đầu tính TikTok":"TIKTOK_START_DATE","Sao thưởng link TikTok đúng hạn":"TIKTOK_REWARD",
    "Sao phạt link TikTok trễ mỗi ngày":"TIKTOK_PENALTY","Số link TikTok tối thiểu":"TIKTOK_MIN_LINKS"}';
  numeric_keys text[] := array['TIKTOK_REWARD','TIKTOK_PENALTY','TIKTOK_MIN_LINKS','TIKTOK_FB_MIN','STREAK_OVERTIME','STREAK_PENALTY_STAR','DOUBLE_BONUS_RATE','PEN_T2_MIN','PEN_T3_MIN','PEN_T4_MIN','PEN_M1','PEN_M2','PEN_M3','PEN_M4'];
  legacy_total jsonb := '{}'::jsonb;
  c_staff int; c_items int; c_results int; c_props int; c_contest int; c_locked int; c_missing int;
  c_tt int; c_clean int; c_busy int; c_rs int;
begin
  select payload -> 'sheets' into sh from public.app_state where id = 1;
  if sh is null then raise exception 'Không tìm thấy dữ liệu cũ (app_state).'; end if;

  delete from public.tiktok_submissions where true;
  delete from public.cleaning where true;
  delete from public.busy where true;
  delete from public.roadshow where true;
  delete from public.staff_targets where true;
  delete from public.daily_results where true;
  delete from public.extra_proposals where true;
  delete from public.staff where true;
  delete from public.items where true;
  delete from public.store_contest where true;
  delete from public.locked_dates where true;

  -- DM_NhanSu: A Mã NV | B Tên | C Bộ phận | D Sao gốc | E Tổng sao | F Ngày reset | G Môn riêng | H Ẩn
  for r, ord in select x, o from jsonb_array_elements(coalesce(sh -> 'DM_NhanSu', '[]'::jsonb)) with ordinality t(x, o) loop
    continue when ord = 1 or public.legacy_text(r -> 0) = '';
    continue when exists (select 1 from public.staff where id = public.legacy_text(r -> 0));
    insert into public.staff(id, name, dept, base_star, reset_date, assigned_items, hidden, sort)
    values (public.legacy_text(r -> 0), public.legacy_text(r -> 1), public.legacy_text(r -> 2), 0,
      public.legacy_date(public.legacy_text(r -> 5)),
      coalesce(array(select btrim(a) from unnest(string_to_array(public.legacy_text(r -> 6), ',')) a where btrim(a) <> ''), '{}'),
      upper(public.legacy_text(r -> 7)) in ('1', 'TRUE', 'ẨN'), ord::int);
    legacy_total := legacy_total || jsonb_build_object(public.legacy_text(r -> 0),
      case when public.legacy_text(r -> 4) = '' then public.legacy_num(r -> 3, 0) else public.legacy_num(r -> 4, 0) end);
  end loop;

  -- DM_ThiDua: A Siêu thị | B Tên môn | C Target | D Sao thưởng | E Sao phạt | F X2
  for r, ord in select x, o from jsonb_array_elements(coalesce(sh -> 'DM_ThiDua', '[]'::jsonb)) with ordinality t(x, o) loop
    continue when ord = 1 or public.legacy_text(r -> 1) = '';
    insert into public.items(store, name, target, bonus_star, penalty_star, is_x2, sort)
    values (coalesce(nullif(public.legacy_text(r -> 0), ''), 'Chung'), public.legacy_text(r -> 1),
      coalesce(nullif(public.legacy_num(r -> 2, 0), 0), 1), coalesce(nullif(public.legacy_num(r -> 3, 0), 0), 200)::int,
      coalesce(nullif(public.legacy_num(r -> 4, 0), 0), 100)::int,
      upper(public.legacy_text(r -> 5)) in ('X2', 'TRUE'), ord::int)
    on conflict (store, name) do nothing;
  end loop;

  -- Nhân viên đã xoá nhưng còn lịch sử -> tạo lại ở trạng thái ẩn để không mất dữ liệu
  insert into public.staff(id, name, hidden, sort)
  select distinct on (public.legacy_text(x -> 1)) public.legacy_text(x -> 1), public.legacy_text(x -> 2), true, 100000
  from jsonb_array_elements(coalesce(sh -> 'Data_KetQua_Ngay', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 0) <> '' and public.legacy_text(x -> 1) <> ''
    and not exists (select 1 from public.staff s where s.id = public.legacy_text(x -> 1))
  union
  select distinct on (public.legacy_text(x -> 1)) public.legacy_text(x -> 1), public.legacy_text(x -> 2), true, 100000
  from jsonb_array_elements(coalesce(sh -> 'Data_DeXuat', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 1) <> ''
    and not exists (select 1 from public.staff s where s.id = public.legacy_text(x -> 1))
  union
  select distinct on (public.legacy_text(x -> k.ci)) public.legacy_text(x -> k.ci), public.legacy_text(x -> k.ni), true, 100000
  from (values ('Data_TikTok', 0, 1), ('Data_VeSinh', 1, 2), ('Data_LichBan', 1, 2), ('Data_Roadshow', 1, 2)) k(sheet, ci, ni)
  cross join lateral jsonb_array_elements(coalesce(sh -> k.sheet, '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> k.ci) <> ''
    and not exists (select 1 from public.staff s where s.id = public.legacy_text(x -> k.ci))
  on conflict (id) do nothing;
  get diagnostics c_missing = row_count;

  -- Data_KetQua_Ngay: A Ngày | B Mã NV | C Tên NV | D Tên môn | E Thực đạt | F % | G Sao | H Trạng thái | I Phương án
  insert into public.daily_results(report_date, staff_id, staff_name, item_name, actual, rate_pct, star_change, status, compensation, submitted_by)
  select public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1), public.legacy_text(x -> 2), public.legacy_text(x -> 3),
    public.legacy_num(x -> 4, 0),
    case when jsonb_typeof(x -> 5) = 'number' then round((x ->> 5)::numeric * 100)
         when public.legacy_text(x -> 5) ~ '^-?[0-9.]+%$' then rtrim(public.legacy_text(x -> 5), '%')::numeric end,
    public.legacy_num(x -> 6, 0)::int, public.legacy_text(x -> 7), coalesce(nullif(public.legacy_text(x -> 8), ''), 'DUNG_SAO'), 'migrate'
  from jsonb_array_elements(coalesce(sh -> 'Data_KetQua_Ngay', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 0) <> '' and public.legacy_date(public.legacy_text(x -> 0)) is not null
  order by o;
  get diagnostics c_results = row_count;

  -- Data_DeXuat: A Ngày | B Mã NV | C Tên NV | D Nội dung | E Sao | F Trạng thái
  insert into public.extra_proposals(report_date, staff_id, staff_name, content, stars, status)
  select public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1), public.legacy_text(x -> 2),
    public.legacy_text(x -> 3), public.legacy_num(x -> 4, 0)::int,
    case when public.legacy_text(x -> 5) in ('Đã duyệt', 'Từ chối') then public.legacy_text(x -> 5) else 'Chờ duyệt' end
  from jsonb_array_elements(coalesce(sh -> 'Data_DeXuat', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 1) <> '' and public.legacy_date(public.legacy_text(x -> 0)) is not null
  order by o;
  get diagnostics c_props = row_count;

  -- CauHinh_QL: A Khóa (tiếng Việt hoặc tiếng Anh) | B Giá trị
  for r, ord in select x, o from jsonb_array_elements(coalesce(sh -> 'CauHinh_QL', '[]'::jsonb)) with ordinality t(x, o) loop
    continue when ord = 1 or public.legacy_text(r -> 0) = '';
    v_key := coalesce(labels ->> public.legacy_text(r -> 0), public.legacy_text(r -> 0));
    v_txt := public.legacy_text(r -> 1);
    if v_key = 'LOCKED_DATES' then
      insert into public.locked_dates(d, locked_by)
      select distinct public.legacy_date(btrim(x)), 'migrate' from unnest(string_to_array(v_txt, ',')) x
      where public.legacy_date(btrim(x)) is not null on conflict do nothing;
    elsif v_key = 'ITEM_RULES' then
      begin v_val := v_txt::jsonb; exception when others then v_val := '[]'::jsonb; end;
      if jsonb_typeof(v_val) = 'array' then
        insert into public.settings(key, value, updated_by) values ('ITEM_RULES', v_val, 'migrate')
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'migrate';
      end if;
    elsif v_key = any(numeric_keys) then
      begin v_num := replace(v_txt, ',', '.')::numeric; exception when others then v_num := null; end;
      if v_num is not null then
        insert into public.settings(key, value, updated_by) values (v_key, to_jsonb(v_num), 'migrate')
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'migrate';
      end if;
    elsif v_key = 'TIKTOK_START_DATE' then
      if public.legacy_date(v_txt) is not null then
        insert into public.settings(key, value, updated_by) values (v_key, to_jsonb(public.legacy_date(v_txt)::text), 'migrate')
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'migrate';
      end if;
    elsif v_key = 'AUTO_STREAK_ENABLED' then
      insert into public.settings(key, value, updated_by) values (v_key, to_jsonb(case when upper(v_txt) = 'OFF' then 'OFF' else 'ON' end), 'migrate')
      on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'migrate';
    end if;
  end loop;

  -- Data_ThiDua_SieuThi: A Tên | B Loại | C Thực đạt | D Target | E % tháng | F % dự báo | G Hạng | H Chi nhánh
  insert into public.store_contest(name, type, actual, target, rate_month, forecast, rank, branch, sort, updated_by)
  select public.legacy_text(x -> 0), public.legacy_text(x -> 1), public.legacy_num(x -> 2, 0), public.legacy_num(x -> 3, 0),
    public.legacy_num(x -> 4, 0), public.legacy_num(x -> 5, 0), coalesce(nullif(public.legacy_text(x -> 6), ''), '-'),
    coalesce(nullif(public.legacy_text(x -> 7), ''), 'TỔNG'), o::int, 'migrate'
  from jsonb_array_elements(coalesce(sh -> 'Data_ThiDua_SieuThi', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 0) <> '';
  get diagnostics c_contest = row_count;


  -- Data_TikTok: A Mã NV | B Tên | C Hạn nộp | D Link (mỗi dòng 1 link) | E Ngày nộp | F Giờ nộp | G Trạng thái | H Sao thưởng | (I Link Facebook nếu có)
  insert into public.tiktok_submissions(staff_id, due, tiktok_links, fb_links, submit_date, submit_time, status, reward, created_by)
  select distinct on (public.legacy_text(x -> 0), public.legacy_date(public.legacy_text(x -> 2)))
    public.legacy_text(x -> 0), public.legacy_date(public.legacy_text(x -> 2)),
    coalesce(array(select btrim(l) from regexp_split_to_table(public.legacy_text(x -> 3), '\s*[\r\n]+\s*') l where btrim(l) <> ''), '{}'),
    coalesce(array(select btrim(l) from regexp_split_to_table(public.legacy_text(x -> 8), '\s*[\r\n]+\s*') l where btrim(l) <> ''), '{}'),
    coalesce(public.legacy_date(public.legacy_text(x -> 4)), public.legacy_date(public.legacy_text(x -> 2))),
    public.legacy_text(x -> 5),
    case when public.legacy_text(x -> 6) in ('ĐÚNG HẠN', 'TRỄ', 'MIỄN') then public.legacy_text(x -> 6) else 'TRỄ' end,
    public.legacy_num(x -> 7, 0)::int, 'migrate'
  from jsonb_array_elements(coalesce(sh -> 'Data_TikTok', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 0) <> '' and public.legacy_date(public.legacy_text(x -> 2)) is not null
  order by public.legacy_text(x -> 0), public.legacy_date(public.legacy_text(x -> 2)), o;
  get diagnostics c_tt = row_count;

  -- Data_VeSinh: A Ngày | B Mã NV | C Tên | D Ngày ĐK | E Giờ ĐK | F,G,H Ảnh | I Ngày BC | J Giờ BC
  insert into public.cleaning(clean_date, staff_id, reg_date, reg_time, photos, report_date, report_time, created_by)
  select public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1),
    coalesce(public.legacy_date(public.legacy_text(x -> 3)), public.legacy_date(public.legacy_text(x -> 0))), public.legacy_hm(public.legacy_text(x -> 4)),
    coalesce(array(select public.legacy_text(x -> k) from generate_series(5, 7) k where public.legacy_text(x -> k) <> ''), '{}'),
    public.legacy_date(public.legacy_text(x -> 8)), nullif(public.legacy_hm(public.legacy_text(x -> 9)), ''), 'migrate'
  from jsonb_array_elements(coalesce(sh -> 'Data_VeSinh', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 1) <> '' and public.legacy_date(public.legacy_text(x -> 0)) is not null
  order by o;
  get diagnostics c_clean = row_count;

  -- Data_LichBan: A Ngày | B Mã NV | C Tên | D Loại BAN/OFF | E Giờ tạo | F Ca bận "1,3"
  insert into public.busy(busy_date, staff_id, type, shifts, created_by)
  select distinct on (public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1))
    public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1),
    case when public.legacy_text(x -> 3) = 'OFF' then 'OFF' else 'BAN' end,
    case when public.legacy_text(x -> 3) = 'OFF' then '{}'::int[] else coalesce(array(select distinct s::int from regexp_split_to_table(public.legacy_text(x -> 5), '\s*,\s*') s where s ~ '^[1-6]$' order by 1), '{}') end,
    'migrate'
  from jsonb_array_elements(coalesce(sh -> 'Data_LichBan', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 1) <> '' and public.legacy_date(public.legacy_text(x -> 0)) is not null
  order by public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1), o;
  get diagnostics c_busy = row_count;

  -- Data_Roadshow: A Ngày | B Mã NV | C Tên | D Ngày ĐK | E Giờ ĐK | F,G,H Ảnh | I Ảnh thêm (;) | J Km | K Phút | L Ngày BC | M Giờ BC | N Giờ chạy | O Nguồn
  insert into public.roadshow(rs_date, staff_id, rs_time, reg_date, reg_time, photos, km, minutes, report_date, report_time, source, created_by)
  select distinct on (public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1), public.legacy_hm(public.legacy_text(x -> 13)))
    public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1), public.legacy_hm(public.legacy_text(x -> 13)),
    coalesce(public.legacy_date(public.legacy_text(x -> 3)), public.legacy_date(public.legacy_text(x -> 0))), public.legacy_hm(public.legacy_text(x -> 4)),
    coalesce(array(select p from (select public.legacy_text(x -> k) p, k from generate_series(5, 7) k
                                  union all select btrim(e), 100 + n from regexp_split_to_table(public.legacy_text(x -> 8), ';') with ordinality q(e, n)) z
                   where p <> '' order by k), '{}'),
    nullif(public.legacy_num(x -> 9, 0), 0), nullif(public.legacy_num(x -> 10, 0), 0),
    public.legacy_date(public.legacy_text(x -> 11)), nullif(public.legacy_hm(public.legacy_text(x -> 12)), ''),
    case when public.legacy_text(x -> 14) = 'QL' then 'QL' else 'NV' end, 'migrate'
  from jsonb_array_elements(coalesce(sh -> 'Data_Roadshow', '[]'::jsonb)) with ordinality t(x, o)
  where o > 1 and public.legacy_text(x -> 1) <> '' and public.legacy_date(public.legacy_text(x -> 0)) is not null
  order by public.legacy_date(public.legacy_text(x -> 0)), public.legacy_text(x -> 1), public.legacy_hm(public.legacy_text(x -> 13)), o;
  get diagnostics c_rs = row_count;

  -- Giữ đúng tổng sao bản cũ: sao gốc = tổng cũ - biến động đã chuyển sang
  -- (phần thưởng TikTok của bản cũ được gộp vào sao gốc; khi làm module TikTok sẽ tách lại)
  update public.staff s set base_star = round((legacy_total ->> s.id)::numeric)::int - coalesce(
      (select sum(star_change) from public.daily_results d where d.staff_id = s.id), 0)
    - coalesce((select sum(stars) from public.extra_proposals p where p.staff_id = s.id and p.status = 'Đã duyệt'), 0)
    - coalesce((select sum(reward) from public.tiktok_submissions t where t.staff_id = s.id), 0)
  where legacy_total ? s.id;

  select count(*) into c_staff from public.staff;
  select count(*) into c_items from public.items;
  select count(*) into c_locked from public.locked_dates;
  insert into public.settings(key, value, updated_by) values ('LEGACY_MIGRATED_AT', to_jsonb(now()), 'migrate')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.audit_log(actor, action, details) values ('migrate', 'MIGRATE_LEGACY',
    jsonb_build_object('staff', c_staff, 'items', c_items, 'results', c_results, 'proposals', c_props, 'contest', c_contest, 'locked', c_locked, 'restored_staff', c_missing,
      'tiktok', c_tt, 'cleaning', c_clean, 'busy', c_busy, 'roadshow', c_rs));
  return jsonb_build_object('staff', c_staff, 'restored_hidden_staff', c_missing, 'items', c_items, 'results', c_results,
    'proposals', c_props, 'store_contest', c_contest, 'locked_dates', c_locked,
    'tiktok', c_tt, 'cleaning', c_clean, 'busy', c_busy, 'roadshow', c_rs);
end $$;
revoke execute on function public.migrate_legacy() from public, anon, authenticated;

create or replace function public.migrate_check()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sh jsonb; mism int; total int; fmt jsonb;
begin
  select payload -> 'sheets' into sh from public.app_state where id = 1;
  with old as (
    select public.legacy_text(x -> 0) id,
      case when public.legacy_text(x -> 4) = '' then public.legacy_num(x -> 3, 0) else public.legacy_num(x -> 4, 0) end t
    from jsonb_array_elements(coalesce(sh -> 'DM_NhanSu', '[]'::jsonb)) with ordinality q(x, o)
    where o > 1 and public.legacy_text(x -> 0) <> ''
  )
  select count(*) filter (where round(old.t) <> public.staff_total(old.id)), count(*) into mism, total from old;
  select jsonb_object_agg(f, n) into fmt from (
    select case when public.legacy_text(x -> 0) ~ '^\d{4}-\d{2}-\d{2}$' then 'yyyy-mm-dd'
                when public.legacy_text(x -> 0) ~ '^\d{4}-\d{2}-\d{2}T' then 'iso-timestamp'
                when public.legacy_text(x -> 0) ~ '^\d{1,2}/\d{1,2}/\d{4}' then 'd/m/yyyy'
                else 'other' end f, count(*) n
    from jsonb_array_elements(coalesce(sh -> 'Data_KetQua_Ngay', '[]'::jsonb)) with ordinality q(x, o)
    where o > 1 and public.legacy_text(x -> 0) <> '' group by 1) z;
  return jsonb_build_object('staff_checked', total, 'total_star_mismatch', mism, 'result_date_formats', fmt,
    'results_v2', (select count(*) from public.daily_results), 'last_report_date', (select max(report_date) from public.daily_results),
    'tiktok', (select count(*) from public.tiktok_submissions), 'cleaning', (select count(*) from public.cleaning),
    'busy', (select count(*) from public.busy), 'roadshow', (select count(*) from public.roadshow),
    'photo_kinds', (select jsonb_object_agg(k, n) from (select case when p like 'cf_%' then 'storage' when p like 'v2:%' then 'v2' else 'drive' end k, count(*) n
                    from (select unnest(photos) p from public.cleaning union all select unnest(photos) from public.roadshow) z group by 1) y),
    'old_sheet_rows', (select jsonb_object_agg(k, jsonb_array_length(coalesce(sh -> k, '[]'::jsonb))) from unnest(array['Data_TikTok','Data_VeSinh','Data_LichBan','Data_Roadshow','Data_NoiDung']) k));
end $$;
revoke execute on function public.migrate_check() from public, anon, authenticated;
