-- =====================================================================
-- D7 Việc: thêm "Lưu ý", việc lâu dài (không tự ẩn), việc thời vụ tự ẩn sau hạn (hoặc sau N ngày) — QL vẫn tìm lại được.
-- Tự ẩn: chỉ áp dụng Triển khai / Giao việc, không nhắc lại, không tick Lâu dài.
--   hide_after = hạn chót + TASK_HIDE_GRACE_DAYS (3) · không có hạn: ngày đăng + TASK_AUTO_HIDE_DAYS (30)
-- =====================================================================
alter table public.tasks add column if not exists notes text not null default '';
alter table public.tasks add column if not exists keep boolean not null default false;
alter table public.tasks add column if not exists hide_after date;
insert into public.settings(key, value, updated_by) values ('TASK_HIDE_GRACE_DAYS', '3'::jsonb, 'system'), ('TASK_AUTO_HIDE_DAYS', '30'::jsonb, 'system')
on conflict (key) do nothing;

create or replace function public._task_hide_after(p_kind text, p_remind text, p_keep boolean, p_deadline date, p_given date, p_created date)
returns date language sql stable set search_path = '' as $$
  select case when p_kind not in ('announce', 'assign') or coalesce(p_remind, 'none') <> 'none' or coalesce(p_keep, false) then null
              when p_given is not null then p_given
              when p_deadline is not null then p_deadline + public.setting_num('TASK_HIDE_GRACE_DAYS', 3)::int
              else coalesce(p_created, public.vn_today()) + public.setting_num('TASK_AUTO_HIDE_DAYS', 30)::int end
$$;
-- việc cũ đã có: tính ngày tự ẩn
update public.tasks set hide_after = public._task_hide_after(kind, remind, keep, deadline, null, created_at::date) where hide_after is null;

create or replace function public.can_see_task(t public.tasks)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships := public.app_member();
begin
  if m.email is null then return false; end if;
  if m.role in ('owner', 'manager') then return true; end if;
  if t.status = 'archived' then return false; end if;
  if t.hide_after is not null and t.hide_after < public.vn_today() then return false; end if;   -- việc thời vụ đã hết hạn
  if t.kind = 'announce' then return cardinality(t.depts) = 0 or exists (select 1 from public.staff s where s.id = m.staff_id and s.dept = any(t.depts)); end if;
  if t.kind = 'assign' then return m.staff_id = any(t.assignees); end if;
  return false;
end $$;

create or replace function public.task_save(p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_id bigint; v_kind text := p_data ->> 'kind'; v_title text := btrim(coalesce(p_data ->> 'title', ''));
  v_assign text[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'assignees', '[]'::jsonb)));
  v_depts text[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'depts', '[]'::jsonb)));
  v_remind text := coalesce(nullif(p_data ->> 'remind', ''), 'none'); v_keep boolean := coalesce((p_data ->> 'keep')::boolean, false);
  v_dl date := nullif(p_data ->> 'deadline', '')::date; v_hide date; v_created date;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý / trưởng ca được đăng việc.'; end if;
  if v_kind not in ('link', 'deadline', 'announce', 'assign') then raise exception 'Loại việc không hợp lệ.'; end if;
  if v_title = '' then raise exception 'Nhập tiêu đề.'; end if;
  if v_kind = 'link' and coalesce(btrim(p_data ->> 'link_url'), '') !~* '^https?://' then raise exception 'Nhập đường link (https://…).'; end if;
  if v_kind = 'assign' and cardinality(v_assign) = 0 then raise exception 'Chọn nhân viên được giao.'; end if;
  select created_at::date into v_created from public.tasks where id = p_id;
  v_hide := public._task_hide_after(v_kind, v_remind, v_keep, v_dl, nullif(p_data ->> 'hide_after', '')::date, v_created);
  if p_id is null then
    insert into public.tasks(kind, title, content, summary, notes, link_url, files, assignees, depts, important, remind, keep, deadline, hide_after, created_by)
    values (v_kind, v_title, coalesce(p_data ->> 'content', ''), coalesce(p_data ->> 'summary', ''), coalesce(p_data ->> 'notes', ''), nullif(btrim(coalesce(p_data ->> 'link_url', '')), ''),
            coalesce(p_data -> 'files', '[]'::jsonb), v_assign, v_depts, coalesce((p_data ->> 'important')::boolean, false), v_remind, v_keep, v_dl, v_hide, m.email)
    returning id into v_id;
  else
    update public.tasks set kind = v_kind, title = v_title, content = coalesce(p_data ->> 'content', ''), summary = coalesce(p_data ->> 'summary', ''), notes = coalesce(p_data ->> 'notes', ''),
      link_url = nullif(btrim(coalesce(p_data ->> 'link_url', '')), ''), files = coalesce(p_data -> 'files', '[]'::jsonb), assignees = v_assign, depts = v_depts,
      important = coalesce((p_data ->> 'important')::boolean, false), remind = v_remind, keep = v_keep, deadline = v_dl, hide_after = v_hide, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy việc.'; end if;
  end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, case when p_id is null then 'TASK_ADD' else 'TASK_EDIT' end, v_id::text,
    jsonb_build_object('kind', v_kind, 'title', v_title, 'remind', v_remind, 'keep', v_keep, 'hide_after', v_hide));
  return jsonb_build_object('status', 'success', 'id', v_id, 'hide_after', v_hide, 'message', case when p_id is null then 'Đã đăng việc' else 'Đã cập nhật' end);
end $$;
grant execute on function public.task_save(bigint, jsonb) to authenticated;
