-- D17 🤖 Xếp ca tự động (23/11/2026, người dùng chốt):
--   • Ưu tiên: 1 lịch OFF > 2 lịch bận (NV đăng ký trên tool) > 3 rule QL (cấu hình XEPCA_CFG, QL sửa trên trang Giao việc → 🤖 Xếp ca)
--   • Chỉ đếm người bộ phận "All In One" vào số người mỗi ca; mỗi ngày 1 khối ca liền mạch ≤ max_day_h giờ; chia đều giờ
--   • Bản nháp theo tuần × siêu thị (shift_plans) → QL sửa → Duyệt: file .xlsx vào Drive "02 - Lịch ca làm việc" + lưu lịch ca (shift_import)
--   • Sau duyệt, trợ lý Claude nhập ca vào HRM "Phân ca ngày" (đánh dấu hrm_at)
create table if not exists public.shift_plans (
  id bigint generated always as identity primary key,
  store text not null,                       -- mã siêu thị trong XEPCA_CFG.stores[].code (933 / 10341)
  week date not null,                        -- thứ 2 đầu tuần
  status text not null default 'draft' check (status in ('draft', 'approved')),
  grid jsonb not null default '{}'::jsonb,   -- { "<staff_id>|<YYYY-MM-DD>": [ca…] } — gồm cả QL / Trưởng ca (không đếm)
  rows jsonb not null default '[]'::jsonb,   -- [{ id, name, pos }] thứ tự dòng trong file
  stats jsonb not null default '{}'::jsonb,  -- tóm tắt: thiếu giờ, số ô thiếu, cặp trùng, giờ từng NV
  file_id text not null default '',
  file_url text not null default '',
  created_by text, created_at timestamptz not null default now(),
  updated_by text, updated_at timestamptz not null default now(),
  approved_by text, approved_at timestamptz,
  hrm_by text, hrm_at timestamptz,
  unique (store, week)
);
alter table public.shift_plans enable row level security;
drop policy if exists shift_plans_read on public.shift_plans;
create policy shift_plans_read on public.shift_plans for select to authenticated using (public.is_manager());
revoke all on public.shift_plans from anon;
grant select on public.shift_plans to authenticated;

-- Cấu hình rule mặc định (QL sửa trên giao diện). Bộ phận (dept) của từng siêu thị lấy theo NV đang có trong tool.
insert into public.settings(key, value) values ('XEPCA_CFG', jsonb_build_object(
  'max_day_h', 9, 'min_off', 1, 'count_pos', jsonb_build_array('All In One'),
  'pairs', jsonb_build_array(jsonb_build_array('29649', '204201'), jsonb_build_array('189769', '98486')),
  'stores', jsonb_build_array(
    jsonb_build_object('code', '933', 'name', 'TGDĐ 351 Nguyễn Hữu Thọ', 'dept', coalesce((select dept from public.staff where id = '29649'), ''),
      'need', jsonb_build_object('1', '[2,2,2,2,2,2]'::jsonb, '2', '[2,2,2,2,2,2]'::jsonb, '3', '[2,2,2,2,2,2]'::jsonb, '4', '[2,2,2,2,2,2]'::jsonb,
                                 '5', '[2,3,2,3,3,2]'::jsonb, '6', '[2,3,2,3,3,2]'::jsonb, '7', '[2,3,2,3,3,2]'::jsonb)),
    jsonb_build_object('code', '10341', 'name', 'Topzone', 'dept', coalesce((select dept from public.staff where id = '189769'), ''),
      'need', jsonb_build_object('1', '[2,3,2,3,3,2]'::jsonb, '2', '[2,3,2,3,3,2]'::jsonb, '3', '[2,3,2,3,3,2]'::jsonb, '4', '[2,3,2,3,3,2]'::jsonb,
                                 '5', '[2,3,2,3,3,2]'::jsonb, '6', '[2,4,2,4,3,2]'::jsonb, '7', '[2,4,2,4,3,2]'::jsonb))))
) on conflict (key) do nothing;

-- QL được sửa cấu hình xếp ca (bảng settings chỉ chủ quản ghi được nên đi qua hàm này)
create or replace function public.xepca_cfg_save(p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._job_mgr();
  if jsonb_typeof(p_cfg) <> 'object' or jsonb_typeof(p_cfg -> 'stores') <> 'array' then raise exception 'Cấu hình không hợp lệ.'; end if;
  if coalesce((p_cfg ->> 'max_day_h')::numeric, 0) not between 1 and 15 then raise exception 'Giờ tối đa / ngày phải từ 1 đến 15.'; end if;
  if coalesce((p_cfg ->> 'min_off')::int, -1) not between 0 and 6 then raise exception 'Số ngày OFF tối thiểu / tuần từ 0 đến 6.'; end if;
  insert into public.settings(key, value, updated_by) values ('XEPCA_CFG', p_cfg, m.email)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('status', 'success', 'message', 'Đã lưu rule xếp ca');
end $$;

-- Lưu bản nháp (tạo mới / ghi đè bản nháp cùng tuần + siêu thị). Bản đã duyệt mà sửa lại → quay về nháp, phải duyệt lại.
create or replace function public.xepca_save(p_store text, p_week date, p_grid jsonb, p_rows jsonb, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_id bigint;
begin
  m := public._job_mgr();
  if extract(isodow from p_week) <> 1 then raise exception 'Tuần phải bắt đầu từ thứ 2.'; end if;
  if jsonb_typeof(p_grid) <> 'object' or jsonb_typeof(p_rows) <> 'array' then raise exception 'Bản xếp ca không hợp lệ.'; end if;
  insert into public.shift_plans(store, week, status, grid, rows, stats, created_by, updated_by)
  values (left(p_store, 20), p_week, 'draft', p_grid, p_rows, coalesce(p_stats, '{}'::jsonb), m.email, m.email)
  on conflict (store, week) do update set status = 'draft', grid = excluded.grid, rows = excluded.rows, stats = excluded.stats,
    updated_by = m.email, updated_at = now(), approved_by = null, approved_at = null, hrm_by = null, hrm_at = null
  returning id into v_id;
  return jsonb_build_object('status', 'success', 'id', v_id, 'message', 'Đã lưu bản nháp xếp ca');
end $$;

-- Duyệt: ghi nhận file Drive đã tải lên (lịch ca đã lưu qua shift_import ở trình duyệt)
create or replace function public.xepca_approve(p_id bigint, p_file jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._job_mgr();
  update public.shift_plans set status = 'approved', approved_by = m.email, approved_at = now(),
    file_id = left(coalesce(p_file ->> 'id', ''), 100), file_url = left(coalesce(p_file ->> 'url', ''), 300)
   where id = p_id;
  if not found then raise exception 'Không tìm thấy bản xếp ca.'; end if;
  return jsonb_build_object('status', 'success', 'message', 'Đã duyệt lịch ca');
end $$;

-- Trợ lý Claude nhập xong HRM → đánh dấu
create or replace function public.xepca_hrm_done(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._job_mgr();
  update public.shift_plans set hrm_by = m.email, hrm_at = now() where id = p_id and status = 'approved';
  if not found then raise exception 'Bản xếp ca chưa duyệt.'; end if;
  return jsonb_build_object('status', 'success', 'message', 'Đã đánh dấu nhập HRM');
end $$;

revoke execute on function public.xepca_cfg_save(jsonb), public.xepca_save(text, date, jsonb, jsonb, jsonb), public.xepca_approve(bigint, jsonb), public.xepca_hrm_done(bigint) from public, anon;
grant execute on function public.xepca_cfg_save(jsonb), public.xepca_save(text, date, jsonb, jsonb, jsonb), public.xepca_approve(bigint, jsonb), public.xepca_hrm_done(bigint) to authenticated;
