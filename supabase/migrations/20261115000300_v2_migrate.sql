-- =====================================================================
-- Chuyển dữ liệu từ khối JSON cũ (app_state.payload.sheets) sang bảng v2.
-- Chạy lại được nhiều lần: mỗi lần chạy sẽ xoá dữ liệu v2 và nạp lại từ app_state.
-- Tổng sao của từng nhân viên giữ đúng như bản cũ đang hiển thị.
-- =====================================================================

-- Chuẩn hoá ngày giống bản cũ (normDate): lấy YYYY-MM-DD đầu chuỗi, hoặc d/m/yyyy
create or replace function public.legacy_date(v text) returns date
language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  v := btrim(coalesce(v, ''));
  if v = '' then return null; end if;
  m := regexp_match(v, '^(\d{4})-(\d{2})-(\d{2})');
  if m is not null then return make_date(m[1]::int, m[2]::int, m[3]::int); end if;
  m := regexp_match(v, '^(\d{1,2})/(\d{1,2})/(\d{4})');
  if m is not null then return make_date(m[3]::int, m[2]::int, m[1]::int); end if;
  begin return (v::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date; exception when others then return null; end;
end $$;

create or replace function public.legacy_num(v jsonb, d numeric default 0) returns numeric
language plpgsql immutable set search_path = '' as $$
declare t text; n numeric;
begin
  if v is null or v = 'null'::jsonb then return d; end if;
  t := btrim(v #>> '{}');
  if t = '' then return d; end if;
  begin n := t::numeric; exception when others then return d; end;
  return n;
end $$;

create or replace function public.legacy_text(v jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when v is null or v = 'null'::jsonb then '' else btrim(v #>> '{}') end
$$;

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
    "Phạt lũy tiến - hệ số bậc 2":"PEN_M2","Phạt lũy tiến - hệ số bậc 3":"PEN_M3","Phạt lũy tiến - hệ số bậc 4":"PEN_M4"}';
  numeric_keys text[] := array['STREAK_OVERTIME','STREAK_PENALTY_STAR','DOUBLE_BONUS_RATE','PEN_T2_MIN','PEN_T3_MIN','PEN_T4_MIN','PEN_M1','PEN_M2','PEN_M3','PEN_M4'];
  legacy_total jsonb := '{}'::jsonb;
  c_staff int; c_items int; c_results int; c_props int; c_contest int; c_locked int; c_missing int;
begin
  select payload -> 'sheets' into sh from public.app_state where id = 1;
  if sh is null then raise exception 'Không tìm thấy dữ liệu cũ (app_state).'; end if;

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

  -- Giữ đúng tổng sao bản cũ: sao gốc = tổng cũ - biến động đã chuyển sang
  -- (phần thưởng TikTok của bản cũ được gộp vào sao gốc; khi làm module TikTok sẽ tách lại)
  update public.staff s set base_star = round((legacy_total ->> s.id)::numeric)::int - coalesce(
      (select sum(star_change) from public.daily_results d where d.staff_id = s.id), 0)
    - coalesce((select sum(stars) from public.extra_proposals p where p.staff_id = s.id and p.status = 'Đã duyệt'), 0)
  where legacy_total ? s.id;

  select count(*) into c_staff from public.staff;
  select count(*) into c_items from public.items;
  select count(*) into c_locked from public.locked_dates;
  insert into public.settings(key, value, updated_by) values ('LEGACY_MIGRATED_AT', to_jsonb(now()), 'migrate')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.audit_log(actor, action, details) values ('migrate', 'MIGRATE_LEGACY',
    jsonb_build_object('staff', c_staff, 'items', c_items, 'results', c_results, 'proposals', c_props, 'contest', c_contest, 'locked', c_locked, 'restored_staff', c_missing));
  return jsonb_build_object('staff', c_staff, 'restored_hidden_staff', c_missing, 'items', c_items, 'results', c_results,
    'proposals', c_props, 'store_contest', c_contest, 'locked_dates', c_locked);
end $$;
revoke execute on function public.migrate_legacy() from public, anon, authenticated;

-- Kiểm tra sau chuyển: tổng sao v2 khớp tổng sao bản cũ (chỉ trả về số lượng, không lộ dữ liệu cá nhân)
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
    'results_v2', (select count(*) from public.daily_results), 'last_report_date', (select max(report_date) from public.daily_results));
end $$;
revoke execute on function public.migrate_check() from public, anon, authenticated;
