-- D12 Bảng việc: QL giao việc cho NV (hạng mục, hạn giờ, minh chứng ảnh / checklist, sao trừ khi trễ / bỏ lỡ do QL khai báo),
-- NV nộp ảnh (lưu Google Drive: <thư mục ảnh>/<Mã - Tên NV>/<Hạng mục>/<ngày giờ>_<việc>_n.jpg, không cần duyệt),
-- lịch ca đọc từ file tool sắp ca (6 ca/ngày), thông báo đẩy (Web Push) lên điện thoại NV, Telegram báo cáo công việc theo ngày / tuần.

-- ---------- Cài đặt ----------
insert into public.settings(key, value) values
  ('JOB_MISS_HOURS', '24'::jsonb),                       -- quá hạn bao nhiêu giờ mà chưa nộp thì thành "Bỏ lỡ" (trừ sao bỏ lỡ)
  ('JOB_REMIND_BEFORE_MIN', '60'::jsonb),                -- thông báo đẩy nhắc trước hạn (phút)
  ('JOB_DRIVE_PATH', '["Tool Báo Cáo", "01 - Ảnh minh chứng công việc"]'::jsonb),   -- thư mục ảnh (tính từ thư mục gốc của Apps Script)
  ('SHIFT_DRIVE_PATH', '["Tool Báo Cáo", "02 - Lịch ca làm việc"]'::jsonb),          -- tool sắp ca bỏ file lịch ca vào đây
  ('SHIFT_SLOTS', '["07:30-09:00", "09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-21:00", "21:00-22:00"]'::jsonb)
on conflict (key) do nothing;

-- Tab CV cũ: ẩn trên thanh menu của NV (NV vào từng chức năng từ trang Hôm nay). QL bật lại ở Giao việc → Cài đặt hoặc Cài đặt → Ẩn trang.
insert into public.settings(key, value) values ('HIDE', '{"employee": ["cv.nav"], "manager": []}'::jsonb) on conflict (key) do nothing;
update public.settings
   set value = jsonb_set(case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end, '{employee}',
                         case when jsonb_typeof(value -> 'employee') = 'array' then value -> 'employee' else '[]'::jsonb end || '["cv.nav"]'::jsonb)
 where key = 'HIDE' and not (case when jsonb_typeof(value -> 'employee') = 'array' then value -> 'employee' else '[]'::jsonb end ? 'cv.nav');

-- ---------- Bảng ----------
create table if not exists public.job_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  icon text not null default '📌',
  sort integer not null default 0,
  active boolean not null default true,
  tg boolean not null default true,                       -- đưa vào báo cáo Telegram công việc
  created_at timestamptz not null default now()
);
insert into public.job_types(name, icon, sort) values
  ('Vệ sinh', '🧹', 1), ('Trưng bày & giá', '🏷️', 2), ('Kiểm kê', '📦', 3), ('Truyền thông', '📣', 4), ('Việc khác', '📌', 9)
on conflict (name) do nothing;

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  batch uuid not null default gen_random_uuid(),          -- 1 lần giao (nhiều người / nhiều ngày) dùng chung batch
  type_id bigint references public.job_types(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  detail text not null default '',
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  due_at timestamptz not null,
  proof text not null default 'photo' check (proof in ('photo', 'check', 'none')),
  photo_min integer not null default 1 check (photo_min between 0 and 10),
  photo_max integer not null default 6 check (photo_max between 1 and 10),
  checklist text[] not null default '{}',
  pen_late integer not null default 0 check (pen_late >= 0),   -- sao trừ khi nộp trễ
  pen_miss integer not null default 0 check (pen_miss >= 0),   -- sao trừ khi bỏ lỡ
  status text not null default 'todo' check (status in ('todo', 'done', 'missed')),
  done_at timestamptz,
  done_by text,
  photos jsonb not null default '[]'::jsonb,               -- [{id, url, name, size}] file trên Google Drive
  checks integer[] not null default '{}',
  note text not null default '',
  late_min integer not null default 0,
  penalty integer not null default 0,                      -- sao đã trừ (hoàn lại khi QL mở lại / xoá)
  pushed_at timestamptz,                                   -- đã báo "việc mới" (thông báo đẩy)
  reminded_at timestamptz,                                 -- đã nhắc trước hạn
  overdue_at timestamptz,                                  -- đã báo quá hạn
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_staff_due_idx on public.jobs(staff_id, due_at);
create index if not exists jobs_due_idx on public.jobs(due_at);
create index if not exists jobs_batch_idx on public.jobs(batch);

create table if not exists public.job_folders (               -- thư mục Drive của từng NV (QL bấm mở xem ảnh)
  staff_id text primary key references public.staff(id) on update cascade on delete cascade,
  folder_id text not null,
  folder_url text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.shifts (                    -- lịch ca từ file tool sắp ca: ca 1..6 mỗi ngày
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  d date not null,
  slots integer[] not null default '{}',
  hours numeric not null default 0,
  source text not null default '',
  updated_at timestamptz not null default now(),
  primary key (staff_id, d)
);
create index if not exists shifts_d_idx on public.shifts(d);

create table if not exists public.push_subs (                 -- đăng ký thông báo đẩy của từng máy
  endpoint text primary key,
  email text not null,
  staff_id text,
  p256dh text not null,
  auth text not null,
  ua text not null default '',
  fails integer not null default 0,
  last_ok timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_staff_idx on public.push_subs(staff_id);

alter table public.job_types enable row level security;
alter table public.jobs enable row level security;
alter table public.job_folders enable row level security;
alter table public.shifts enable row level security;
alter table public.push_subs enable row level security;
drop policy if exists job_types_read on public.job_types;
create policy job_types_read on public.job_types for select to authenticated using (public.is_member());
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated using (public.can_see_staff(staff_id));
drop policy if exists job_folders_read on public.job_folders;
create policy job_folders_read on public.job_folders for select to authenticated using (public.can_see_staff(staff_id));
drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts for select to authenticated using (public.is_member());
grant select on public.job_types, public.jobs, public.job_folders, public.shifts to authenticated;
revoke insert, update, delete on public.job_types, public.jobs, public.job_folders, public.shifts from authenticated;
revoke all on public.job_types, public.jobs, public.job_folders, public.shifts, public.push_subs from anon;
revoke all on public.push_subs from authenticated;

-- ---------- Tiện ích ----------
create or replace function public._job_mgr() returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được dùng chức năng này.'; end if;
  return m;
end $$;

create or replace function public._vn_ts(p_date date, p_hm text) returns timestamptz
language sql stable set search_path = '' as $$
  select (p_date + coalesce(nullif(p_hm, ''), '20:00')::time) at time zone 'Asia/Ho_Chi_Minh'
$$;

create or replace function public._mins_txt(p_min integer) returns text
language sql immutable set search_path = '' as $$
  select case when p_min >= 1440 then (p_min / 1440) || ' ngày' || case when (p_min % 1440) / 60 > 0 then ' ' || ((p_min % 1440) / 60) || ' giờ' else '' end
              when p_min >= 60 then (p_min / 60) || ' giờ' || case when p_min % 60 > 0 then ' ' || (p_min % 60) || ' phút' else '' end
              else p_min || ' phút' end
$$;

-- Trừ sao do việc (trễ / bỏ lỡ) — ghi vào star_adjustments + score_log như điều chỉnh sao thường
create or replace function public._job_star(p_staff text, p_delta integer, p_reason text, p_job bigint, p_actor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_delta, 0) = 0 then return; end if;
  insert into public.star_adjustments(staff_id, delta, kind, reason, created_by) values (p_staff, p_delta, 'adjust', p_reason, p_actor);
  insert into public.score_log(actor, staff_id, kind, action, detail, reason)
  values (p_actor, p_staff, 'star', 'job', jsonb_build_object('delta', p_delta, 'job', p_job), p_reason);
end $$;

-- ---------- Hạng mục ----------
create or replace function public.job_type_save(p_id bigint, p_name text, p_icon text, p_sort integer, p_active boolean, p_tg boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_id bigint; v_name text := btrim(coalesce(p_name, ''));
begin
  m := public._job_mgr();
  if length(v_name) < 2 then raise exception 'Nhập tên hạng mục.'; end if;
  if exists (select 1 from public.job_types where lower(name) = lower(v_name) and id is distinct from p_id) then raise exception 'Đã có hạng mục "%".', v_name; end if;
  if p_id is null then
    insert into public.job_types(name, icon, sort, active, tg)
    values (v_name, coalesce(nullif(btrim(p_icon), ''), '📌'), coalesce(p_sort, 0), coalesce(p_active, true), coalesce(p_tg, true)) returning id into v_id;
  else
    update public.job_types set name = v_name, icon = coalesce(nullif(btrim(p_icon), ''), '📌'), sort = coalesce(p_sort, 0),
           active = coalesce(p_active, true), tg = coalesce(p_tg, true)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy hạng mục.'; end if;
  end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'JOB_TYPE', v_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('status', 'success', 'message', 'Đã lưu hạng mục', 'id', v_id);
end $$;

create or replace function public.job_type_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._job_mgr();
  if exists (select 1 from public.jobs where type_id = p_id) then
    update public.job_types set active = false where id = p_id;
    return jsonb_build_object('status', 'success', 'message', 'Hạng mục đã có việc nên chỉ tắt (không hiện khi giao việc mới).');
  end if;
  delete from public.job_types where id = p_id;
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá hạng mục');
end $$;

-- ---------- Giao / sửa / xoá việc ----------
-- p: {type_id, title, detail, staff_ids[], due_date, due_hm, repeat_until?, proof, photo_min, photo_max, checklist[], pen_late, pen_miss}
create or replace function public.job_assign(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; v_batch uuid := gen_random_uuid(); s text; d date; n int := 0; v_staff int := 0;
  v_title text := btrim(coalesce(p ->> 'title', '')); v_proof text := coalesce(nullif(p ->> 'proof', ''), 'photo');
  v_min int := coalesce(nullif(p ->> 'photo_min', '')::int, 1); v_max int := coalesce(nullif(p ->> 'photo_max', '')::int, 6);
  v_type bigint := nullif(p ->> 'type_id', '')::bigint; v_from date; v_to date; v_hm text := coalesce(p ->> 'due_hm', '');
  v_list text[] := coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'checklist', '[]'::jsonb)) x where btrim(x) <> ''), '{}');
begin
  m := public._job_mgr();
  if length(v_title) < 3 then raise exception 'Nhập tên việc.'; end if;
  if v_proof not in ('photo', 'check', 'none') then raise exception 'Kiểu minh chứng không hợp lệ.'; end if;
  if v_proof = 'check' and cardinality(v_list) = 0 then raise exception 'Nhập ít nhất 1 mục checklist.'; end if;
  if v_proof = 'none' then v_min := 0; end if;
  v_min := greatest(0, least(10, v_min));
  v_max := greatest(1, least(10, greatest(v_max, v_min)));
  if coalesce(p ->> 'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$' or v_hm !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Chọn ngày và giờ hạn.'; end if;
  v_from := (p ->> 'due_date')::date;
  v_to := case when coalesce(p ->> 'repeat_until', '') ~ '^\d{4}-\d{2}-\d{2}$' then greatest(v_from, (p ->> 'repeat_until')::date) else v_from end;
  if v_to - v_from > 31 then raise exception 'Lặp tối đa 31 ngày.'; end if;
  if public._vn_ts(v_to, v_hm) < now() - interval '1 day' then raise exception 'Giờ hạn đã qua.'; end if;
  if v_type is not null and not exists (select 1 from public.job_types where id = v_type) then raise exception 'Hạng mục không tồn tại.'; end if;
  for s in select distinct x from jsonb_array_elements_text(coalesce(p -> 'staff_ids', '[]'::jsonb)) x loop
    if not public.can_see_staff(s) then raise exception 'Nhân viên % ngoài phạm vi của bạn.', s; end if;
    continue when not exists (select 1 from public.staff where id = s and not hidden);
    v_staff := v_staff + 1;
    for d in select g::date from generate_series(v_from, v_to, interval '1 day') g loop
      insert into public.jobs(batch, type_id, title, detail, staff_id, due_at, proof, photo_min, photo_max, checklist, pen_late, pen_miss, created_by)
      values (v_batch, v_type, v_title, coalesce(p ->> 'detail', ''), s, public._vn_ts(d, v_hm), v_proof, v_min, v_max, v_list,
              greatest(0, coalesce(nullif(p ->> 'pen_late', '')::int, 0)), greatest(0, coalesce(nullif(p ->> 'pen_miss', '')::int, 0)), m.email);
      n := n + 1;
    end loop;
  end loop;
  if n = 0 then raise exception 'Chọn ít nhất 1 nhân viên.'; end if;
  insert into public.audit_log(actor, action, target, details)
  values (m.email, 'JOB_ASSIGN', v_batch::text, jsonb_build_object('title', v_title, 'staff', v_staff, 'jobs', n, 'from', v_from, 'to', v_to, 'hm', v_hm));
  return jsonb_build_object('status', 'success', 'batch', v_batch, 'n', n,
    'message', format('Đã giao "%s" cho %s nhân viên%s', v_title, v_staff, case when v_to > v_from then format(', %s ngày (%s việc)', v_to - v_from + 1, n) else '' end));
end $$;

-- Sửa 1 việc (p_all = false) hoặc mọi việc chưa nộp cùng lần giao (p_all = true; đổi giờ hạn thì dời cùng một khoảng)
create or replace function public.job_update(p_id bigint, p jsonb, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs; v_due timestamptz; v_staff text := nullif(p ->> 'staff_id', ''); n int;
  v_list text[];
begin
  m := public._job_mgr();
  select * into j from public.jobs where id = p_id;
  if j.id is null or not public.can_see_staff(j.staff_id) then raise exception 'Không tìm thấy việc.'; end if;
  if (p ? 'due_date') or (p ? 'due_hm') then
    if coalesce(p ->> 'due_hm', to_char(j.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')) !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Giờ hạn không hợp lệ.'; end if;
    v_due := public._vn_ts(coalesce(nullif(p ->> 'due_date', '')::date, (j.due_at at time zone 'Asia/Ho_Chi_Minh')::date),
                           coalesce(p ->> 'due_hm', to_char(j.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')));
  end if;
  if v_staff is not null and (p_all or j.status <> 'todo') then v_staff := null; end if;
  if v_staff is not null and (not public.can_see_staff(v_staff) or not exists (select 1 from public.staff where id = v_staff and not hidden)) then raise exception 'Nhân viên không hợp lệ.'; end if;
  if p ? 'checklist' then v_list := coalesce(array(select btrim(x) from jsonb_array_elements_text(p -> 'checklist') x where btrim(x) <> ''), '{}'); end if;
  update public.jobs x set
    title = coalesce(nullif(btrim(p ->> 'title'), ''), x.title),
    detail = coalesce(p ->> 'detail', x.detail),
    type_id = case when p ? 'type_id' then nullif(p ->> 'type_id', '')::bigint else x.type_id end,
    pen_late = greatest(0, coalesce(nullif(p ->> 'pen_late', '')::int, x.pen_late)),
    pen_miss = greatest(0, coalesce(nullif(p ->> 'pen_miss', '')::int, x.pen_miss)),
    photo_min = greatest(0, least(10, coalesce(nullif(p ->> 'photo_min', '')::int, x.photo_min))),
    photo_max = greatest(1, least(10, coalesce(nullif(p ->> 'photo_max', '')::int, x.photo_max))),
    checklist = coalesce(v_list, x.checklist),
    staff_id = coalesce(v_staff, x.staff_id),
    due_at = case when v_due is null then x.due_at when p_all then x.due_at + (v_due - j.due_at) else v_due end,
    reminded_at = case when v_due is null then x.reminded_at else null end,
    overdue_at = case when v_due is null then x.overdue_at else null end,
    pushed_at = case when v_staff is not null then null else x.pushed_at end,
    updated_at = now()
  where (x.id = p_id or (p_all and x.batch = j.batch and x.status = 'todo')) and public.can_see_staff(x.staff_id);
  get diagnostics n = row_count;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'JOB_UPDATE', p_id::text, p || jsonb_build_object('all', p_all, 'n', n));
  return jsonb_build_object('status', 'success', 'message', format('Đã cập nhật %s việc', n));
end $$;

create or replace function public.job_delete(p_id bigint, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs; r public.jobs; n int := 0; v_ref int := 0;
begin
  m := public._job_mgr();
  select * into j from public.jobs where id = p_id;
  if j.id is null or not public.can_see_staff(j.staff_id) then raise exception 'Không tìm thấy việc.'; end if;
  for r in select * from public.jobs x where (x.id = p_id or (p_all and x.batch = j.batch)) and public.can_see_staff(x.staff_id) loop
    if r.penalty > 0 then
      perform public._job_star(r.staff_id, r.penalty, 'Hoàn sao (xoá việc): ' || r.title, r.id, m.email);
      v_ref := v_ref + 1;
    end if;
    delete from public.jobs where id = r.id;
    n := n + 1;
  end loop;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'JOB_DELETE', p_id::text, jsonb_build_object('title', j.title, 'n', n, 'all', p_all));
  return jsonb_build_object('status', 'success', 'message', format('Đã xoá %s việc%s', n, case when v_ref > 0 then format(' · hoàn sao cho %s việc đã trừ', v_ref) else '' end));
end $$;

-- QL mở lại việc đã nộp / bỏ lỡ (hoàn sao đã trừ), có thể đặt hạn mới
create or replace function public.job_reopen(p_id bigint, p_due_date date default null, p_due_hm text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs;
begin
  m := public._job_mgr();
  select * into j from public.jobs where id = p_id for update;
  if j.id is null or not public.can_see_staff(j.staff_id) then raise exception 'Không tìm thấy việc.'; end if;
  if j.status = 'todo' then raise exception 'Việc đang chờ làm, không cần mở lại.'; end if;
  if p_due_hm is not null and p_due_hm !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Giờ hạn không hợp lệ.'; end if;
  if j.penalty > 0 then perform public._job_star(j.staff_id, j.penalty, 'Hoàn sao (QL mở lại việc): ' || j.title, j.id, m.email); end if;
  update public.jobs set status = 'todo', done_at = null, done_by = null, late_min = 0, penalty = 0, reminded_at = null, overdue_at = null,
         due_at = case when p_due_date is null then due_at else public._vn_ts(p_due_date, coalesce(p_due_hm, to_char(due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'))) end,
         updated_at = now()
   where id = p_id;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'JOB_REOPEN', p_id::text, jsonb_build_object('title', j.title, 'refund', j.penalty));
  return jsonb_build_object('status', 'success', 'message', 'Đã mở lại việc' || case when j.penalty > 0 then format(' · hoàn %s⭐', j.penalty) else '' end);
end $$;

-- ---------- NV nộp ----------
-- p_photos: [{id, url, name, size}] (đã tải lên Drive qua Edge Function "tasks" mode job_upload)
create or replace function public.job_submit(p_id bigint, p_photos jsonb, p_checks integer[], p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs; v_late int; v_pen int := 0; v_n int; v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
begin
  m := public._require_member();
  select * into j from public.jobs where id = p_id for update;
  if j.id is null or not public.can_see_staff(j.staff_id) then raise exception 'Không tìm thấy việc.'; end if;
  if m.role = 'employee' and m.staff_id is distinct from j.staff_id then raise exception 'Đây không phải việc của bạn.'; end if;
  if j.status = 'missed' then raise exception 'Việc đã bỏ lỡ (quá hạn quá lâu). Nhờ quản lý mở lại nếu cần nộp.'; end if;
  if jsonb_typeof(v_photos) <> 'array' then raise exception 'Ảnh không hợp lệ.'; end if;
  v_n := jsonb_array_length(v_photos);
  if v_n > 10 then raise exception 'Tối đa 10 ảnh.'; end if;
  if j.proof in ('photo', 'check') and v_n < j.photo_min then raise exception 'Cần ít nhất % ảnh.', j.photo_min; end if;
  if j.proof = 'check' and (select count(distinct x) from unnest(coalesce(p_checks, '{}'::int[])) x where x between 0 and cardinality(j.checklist) - 1) < cardinality(j.checklist) then
    raise exception 'Tick đủ các mục trong checklist.';
  end if;
  if j.status = 'done' then   -- nộp bổ sung: thay ảnh / ghi chú, giữ giờ nộp và sao
    update public.jobs set photos = v_photos, checks = coalesce(p_checks, '{}'), note = left(coalesce(p_note, ''), 1000), updated_at = now() where id = p_id;
    return jsonb_build_object('status', 'success', 'message', 'Đã cập nhật ảnh / ghi chú');
  end if;
  v_late := greatest(0, floor(extract(epoch from (now() - j.due_at)) / 60))::int;
  if v_late > 0 and j.pen_late > 0 then
    v_pen := j.pen_late;
    perform public._job_star(j.staff_id, -v_pen, format('Việc nộp trễ %s: %s', public._mins_txt(v_late), j.title), j.id, 'he-thong');
  end if;
  update public.jobs set status = 'done', done_at = now(), done_by = m.email, photos = v_photos, checks = coalesce(p_checks, '{}'),
         note = left(coalesce(p_note, ''), 1000), late_min = v_late, penalty = v_pen, updated_at = now()
   where id = p_id;
  return jsonb_build_object('status', 'success', 'late_min', v_late, 'penalty', v_pen,
    'message', case when v_late > 0 then format('Đã nộp · trễ %s%s', public._mins_txt(v_late), case when v_pen > 0 then format(' · −%s⭐', v_pen) else '' end) else 'Đã nộp, cảm ơn bạn!' end);
end $$;

-- ---------- Định kỳ (Edge Function notify gọi bằng service_role mỗi 5 phút) ----------
create or replace function public.job_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.jobs; n int := 0; h numeric := public.setting_num('JOB_MISS_HOURS', 24);
begin
  for r in select * from public.jobs where status = 'todo' and due_at + (h::float8) * interval '1 hour' < now() for update skip locked loop
    if r.pen_miss > 0 then
      perform public._job_star(r.staff_id, -r.pen_miss, format('Bỏ lỡ việc: %s (hạn %s)', r.title, to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')), r.id, 'he-thong');
    end if;
    update public.jobs set status = 'missed', penalty = r.pen_miss, updated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('missed', n);
end $$;

-- ---------- Lịch ca ----------
-- p_rows: [{staff_id, d, slots[], hours}] — thay lịch của các NV có trong file, trong khoảng ngày của file
-- p_file: {id, updated, unmatched} của file trên Drive (để lần đọc tự động sau không đọc lại file cũ)
create or replace function public._shift_save(p_rows jsonb, p_source text, p_actor text, p_file jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_from date; v_to date; n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'File không có dòng lịch ca nào.'; end if;
  select min((x ->> 'd')::date), max((x ->> 'd')::date) into v_from, v_to from jsonb_array_elements(p_rows) x;
  if v_from is null or v_to - v_from > 40 then raise exception 'Khoảng ngày trong file không hợp lệ.'; end if;
  delete from public.shifts s where s.d between v_from and v_to
     and s.staff_id in (select distinct x ->> 'staff_id' from jsonb_array_elements(p_rows) x);
  insert into public.shifts(staff_id, d, slots, hours, source)
  select distinct on (x ->> 'staff_id', (x ->> 'd')::date) x ->> 'staff_id', (x ->> 'd')::date,
         coalesce(array(select distinct e::int from jsonb_array_elements_text(coalesce(x -> 'slots', '[]'::jsonb)) e where e ~ '^[1-9]$' order by 1), '{}'),
         coalesce(nullif(x ->> 'hours', '')::numeric, 0), left(coalesce(p_source, ''), 200)
    from jsonb_array_elements(p_rows) x
   where exists (select 1 from public.staff s where s.id = x ->> 'staff_id')
  on conflict (staff_id, d) do update set slots = excluded.slots, hours = excluded.hours, source = excluded.source, updated_at = now();
  get diagnostics n = row_count;
  insert into public.settings(key, value, updated_by)
  values ('SHIFT_LAST', jsonb_build_object('source', left(coalesce(p_source, ''), 200), 'from', v_from, 'to', v_to, 'n', n, 'at', now(), 'by', p_actor,
                                           'file_id', coalesce(p_file ->> 'id', ''), 'updated', coalesce(p_file ->> 'updated', ''),
                                           'unmatched', coalesce(nullif(p_file ->> 'unmatched', '')::int, 0)), p_actor)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('status', 'success', 'n', n, 'from', v_from, 'to', v_to,
    'message', format('Đã lưu lịch ca %s – %s (%s dòng)', to_char(v_from, 'DD/MM'), to_char(v_to, 'DD/MM'), n));
end $$;
create or replace function public.shift_import(p_rows jsonb, p_source text, p_file jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._job_mgr();
  return public._shift_save(p_rows, p_source, m.email, p_file);
end $$;

-- ---------- Thông báo đẩy ----------
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Địa chỉ đăng ký không hợp lệ.'; end if;
  if length(coalesce(p_p256dh, '')) < 20 or length(coalesce(p_auth, '')) < 10 then raise exception 'Khoá đăng ký không hợp lệ.'; end if;
  insert into public.push_subs(endpoint, email, staff_id, p256dh, auth, ua)
  values (p_endpoint, m.email, m.staff_id, p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set email = excluded.email, staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fails = 0;
  return jsonb_build_object('status', 'success', 'message', 'Đã bật thông báo trên máy này');
end $$;
create or replace function public.push_unsubscribe(p_endpoint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  delete from public.push_subs where endpoint = p_endpoint and email = m.email;
  return jsonb_build_object('status', 'success', 'message', 'Đã tắt thông báo trên máy này');
end $$;
create or replace function public.push_status(p_endpoint text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  return jsonb_build_object('mine', (select count(*) from public.push_subs where email = m.email),
                            'this', exists (select 1 from public.push_subs where endpoint = p_endpoint and email = m.email));
end $$;

-- Quản lý xem ai đã bật thông báo (chỉ số máy, không lộ địa chỉ)
create or replace function public.push_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._job_mgr();
  return coalesce((select jsonb_object_agg(staff_id, n) from (select staff_id, count(*) n from public.push_subs where staff_id is not null and public.can_see_staff(staff_id) group by staff_id) z), '{}'::jsonb);
end $$;

-- ---------- Quyền ----------
revoke execute on function public._job_mgr(), public._job_star(text, integer, text, bigint, text), public.job_tick(),
  public._shift_save(jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.job_tick(), public._shift_save(jsonb, text, text, jsonb) to service_role;
revoke execute on function public.job_type_save(bigint, text, text, integer, boolean, boolean), public.job_type_delete(bigint), public.job_assign(jsonb),
  public.job_update(bigint, jsonb, boolean), public.job_delete(bigint, boolean), public.job_reopen(bigint, date, text),
  public.job_submit(bigint, jsonb, integer[], text), public.shift_import(jsonb, text, jsonb), public.push_subscribe(text, text, text, text),
  public.push_unsubscribe(text), public.push_status(text), public.push_overview(), public._vn_ts(date, text), public._mins_txt(integer) from public, anon;
grant execute on function public.job_type_save(bigint, text, text, integer, boolean, boolean), public.job_type_delete(bigint), public.job_assign(jsonb),
  public.job_update(bigint, jsonb, boolean), public.job_delete(bigint, boolean), public.job_reopen(bigint, date, text),
  public.job_submit(bigint, jsonb, integer[], text), public.shift_import(jsonb, text, jsonb), public.push_subscribe(text, text, text, text),
  public.push_unsubscribe(text), public.push_status(text), public.push_overview(), public._vn_ts(date, text), public._mins_txt(integer) to authenticated;

-- ---------- Realtime ----------
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['jobs', 'job_types', 'shifts'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
