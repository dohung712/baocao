-- =====================================================================
-- D7 Việc (CV → 📋 Việc): link trang tính QL, việc có deadline của QL, triển khai toàn NV (đọc & nắm rõ),
-- giao việc cho NV (hoàn thành + ghi chú). File đính kèm lưu Google Drive (qua Edge Function "tasks").
-- Nhắc lại: Quan trọng / hằng tuần / hằng tháng / 2 tháng → mỗi kỳ NV phải xác nhận đọc lại.
-- =====================================================================
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('link', 'deadline', 'announce', 'assign')),
  title text not null,
  content text not null default '',
  summary text not null default '',
  link_url text,
  files jsonb not null default '[]',             -- [{id, name, mime, url, size}]
  assignees text[] not null default '{}',        -- assign: mã NV · deadline: email quản lý (trống = mọi quản lý)
  depts text[] not null default '{}',            -- announce: bộ phận (trống = cả siêu thị)
  important boolean not null default false,
  remind text not null default 'none' check (remind in ('none', 'week', 'month', '2month')),
  deadline date,
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  done_by text, done_at timestamptz, done_note text,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tasks_kind_idx on public.tasks(kind, status, created_at desc);

create table if not exists public.task_acks (
  task_id bigint not null references public.tasks(id) on delete cascade,
  who text not null,                             -- mã NV (nhân viên) hoặc email (quản lý)
  period text not null default '',               -- kỳ nhắc lại: '' · 2026-W46 · 2026-11 · 2026-B6
  read_at timestamptz, done_at timestamptz, note text not null default '',
  primary key (task_id, who, period)
);

insert into public.settings(key, value, updated_by) values ('TASK_LINK_GROUPS', '["Trang tính quản lý","Báo cáo","Khác"]'::jsonb, 'system') on conflict (key) do nothing;

create or replace function public._task_period(p_remind text, p_day date default null)
returns text language sql stable set search_path = '' as $$
  select case p_remind
    when 'week' then to_char(coalesce(p_day, public.vn_today()), 'IYYY-"W"IW')
    when 'month' then to_char(coalesce(p_day, public.vn_today()), 'YYYY-MM')
    when '2month' then to_char(coalesce(p_day, public.vn_today()), 'YYYY') || '-B' || ceil(extract(month from coalesce(p_day, public.vn_today())) / 2)::int
    else '' end
$$;
grant execute on function public._task_period(text, date) to authenticated;

create or replace function public.can_see_task(t public.tasks)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships := public.app_member();
begin
  if m.email is null then return false; end if;
  if m.role in ('owner', 'manager') then return true; end if;
  if t.status = 'archived' then return false; end if;
  if t.kind = 'announce' then return cardinality(t.depts) = 0 or exists (select 1 from public.staff s where s.id = m.staff_id and s.dept = any(t.depts)); end if;
  if t.kind = 'assign' then return m.staff_id = any(t.assignees); end if;
  return false;
end $$;

alter table public.tasks enable row level security;
alter table public.task_acks enable row level security;
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (public.can_see_task(tasks));
drop policy if exists task_acks_read on public.task_acks;
create policy task_acks_read on public.task_acks for select to authenticated using (public.is_manager() or who = (public.app_member()).staff_id);
grant select on public.tasks, public.task_acks to authenticated;
revoke insert, update, delete on public.tasks, public.task_acks from authenticated;
revoke all on public.tasks, public.task_acks from anon;

-- Tạo / sửa (quản lý, chủ quản)
create or replace function public.task_save(p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_id bigint; v_kind text := p_data ->> 'kind'; v_title text := btrim(coalesce(p_data ->> 'title', ''));
  v_assign text[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'assignees', '[]'::jsonb)));
  v_depts text[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'depts', '[]'::jsonb)));
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý / trưởng ca được đăng việc.'; end if;
  if v_kind not in ('link', 'deadline', 'announce', 'assign') then raise exception 'Loại việc không hợp lệ.'; end if;
  if v_title = '' then raise exception 'Nhập tiêu đề.'; end if;
  if v_kind = 'link' and coalesce(btrim(p_data ->> 'link_url'), '') !~* '^https?://' then raise exception 'Nhập đường link (https://…).'; end if;
  if v_kind = 'assign' and cardinality(v_assign) = 0 then raise exception 'Chọn nhân viên được giao.'; end if;
  if p_id is null then
    insert into public.tasks(kind, title, content, summary, link_url, files, assignees, depts, important, remind, deadline, created_by)
    values (v_kind, v_title, coalesce(p_data ->> 'content', ''), coalesce(p_data ->> 'summary', ''), nullif(btrim(coalesce(p_data ->> 'link_url', '')), ''),
            coalesce(p_data -> 'files', '[]'::jsonb), v_assign, v_depts, coalesce((p_data ->> 'important')::boolean, false),
            coalesce(nullif(p_data ->> 'remind', ''), 'none'), nullif(p_data ->> 'deadline', '')::date, m.email)
    returning id into v_id;
  else
    update public.tasks set kind = v_kind, title = v_title, content = coalesce(p_data ->> 'content', ''), summary = coalesce(p_data ->> 'summary', ''),
      link_url = nullif(btrim(coalesce(p_data ->> 'link_url', '')), ''), files = coalesce(p_data -> 'files', '[]'::jsonb), assignees = v_assign, depts = v_depts,
      important = coalesce((p_data ->> 'important')::boolean, false), remind = coalesce(nullif(p_data ->> 'remind', ''), 'none'),
      deadline = nullif(p_data ->> 'deadline', '')::date, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy việc.'; end if;
  end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, case when p_id is null then 'TASK_ADD' else 'TASK_EDIT' end, v_id::text,
    jsonb_build_object('kind', v_kind, 'title', v_title));
  return jsonb_build_object('status', 'success', 'id', v_id, 'message', case when p_id is null then 'Đã đăng việc' else 'Đã cập nhật' end);
end $$;

create or replace function public.task_set_status(p_id bigint, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; t public.tasks;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được đổi trạng thái.'; end if;
  select * into t from public.tasks where id = p_id; if t.id is null then raise exception 'Không tìm thấy việc.'; end if;
  if p_status = 'delete' then
    delete from public.tasks where id = p_id;
    insert into public.audit_log(actor, action, target, details) values (m.email, 'TASK_DELETE', p_id::text, jsonb_build_object('kind', t.kind, 'title', t.title, 'files', t.files));
    return jsonb_build_object('status', 'success', 'message', 'Đã xoá', 'files', t.files);
  end if;
  if p_status not in ('open', 'done', 'archived') then raise exception 'Trạng thái không hợp lệ.'; end if;
  update public.tasks set status = p_status, updated_at = now(),
    done_by = case when p_status = 'done' then m.email else null end, done_at = case when p_status = 'done' then now() else null end,
    done_note = case when p_status = 'done' then nullif(btrim(coalesce(p_note, '')), '') else null end
  where id = p_id;
  return jsonb_build_object('status', 'success', 'message', case p_status when 'done' then 'Đã đánh dấu hoàn thành' when 'archived' then 'Đã lưu trữ' else 'Đã mở lại' end);
end $$;

-- Nhân viên / quản lý xác nhận: 'read' (đã đọc & nắm rõ) · 'done' (hoàn thành việc được giao, kèm ghi chú) · 'undo'
create or replace function public.task_ack(p_id bigint, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; t public.tasks; v_who text; v_period text;
begin
  m := public._require_member();
  select * into t from public.tasks where id = p_id;
  if t.id is null or not public.can_see_task(t) then raise exception 'Không tìm thấy việc.'; end if;
  v_who := coalesce(m.staff_id, m.email);
  v_period := public._task_period(t.remind);
  if p_action = 'read' then
    insert into public.task_acks(task_id, who, period, read_at) values (p_id, v_who, v_period, now())
    on conflict (task_id, who, period) do update set read_at = coalesce(public.task_acks.read_at, now());
  elsif p_action = 'done' then
    if t.kind = 'assign' and not (m.staff_id = any(t.assignees)) and m.role not in ('owner', 'manager') then raise exception 'Việc này không giao cho bạn.'; end if;
    insert into public.task_acks(task_id, who, period, read_at, done_at, note) values (p_id, v_who, v_period, now(), now(), btrim(coalesce(p_note, '')))
    on conflict (task_id, who, period) do update set done_at = now(), note = btrim(coalesce(p_note, '')), read_at = coalesce(public.task_acks.read_at, now());
  elsif p_action = 'undo' then
    update public.task_acks set done_at = null where task_id = p_id and who = v_who and period = v_period;
  else raise exception 'Thao tác không hợp lệ.'; end if;
  return jsonb_build_object('status', 'success', 'message', case p_action when 'read' then '✅ Đã xác nhận đọc & nắm rõ' when 'done' then '✅ Đã báo hoàn thành' else 'Đã huỷ hoàn thành' end);
end $$;

-- Lưu khoá bí mật cho Drive (địa chỉ Apps Script + mã) cạnh khoá AI
create or replace function public.set_private_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Chỉ chủ quản được đổi cài đặt này.'; end if;
  if p_key not in ('TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'DRIVE_UPLOAD_URL', 'DRIVE_UPLOAD_SECRET') then raise exception 'Khóa cài đặt không hợp lệ.'; end if;
  if coalesce(btrim(p_value), '') = '' then delete from public.private_settings where key = p_key;
  else insert into public.private_settings(key, value) values (p_key, btrim(p_value))
       on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  return jsonb_build_object('status', 'success', 'has_value', coalesce(btrim(p_value), '') <> '');
end $$;
create or replace function public.private_setting_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_owner() then
    jsonb_build_object('TELEGRAM_BOT_TOKEN', exists (select 1 from public.private_settings where key = 'TELEGRAM_BOT_TOKEN'),
                       'GEMINI_API_KEY', exists (select 1 from public.private_settings where key = 'GEMINI_API_KEY'),
                       'DRIVE', exists (select 1 from public.private_settings where key = 'DRIVE_UPLOAD_URL'))
  else jsonb_build_object('AI', exists (select 1 from public.private_settings where key = 'GEMINI_API_KEY'),
                          'DRIVE', exists (select 1 from public.private_settings where key = 'DRIVE_UPLOAD_URL')) end
$$;

grant execute on function public.task_save(bigint, jsonb), public.task_set_status(bigint, text, text), public.task_ack(bigint, text, text) to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tasks', 'task_acks'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
