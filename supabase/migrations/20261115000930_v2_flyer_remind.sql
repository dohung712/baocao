-- D11 Phát tờ rơi (bổ sung): nhắc NV ngay khi QL tạo đợt (dải nhắc trên app + Telegram báo đợt mới), nhắc trước giờ hạn.
insert into public.settings(key, value) values ('FLYER_REMIND_BEFORE_MIN', '120'::jsonb) on conflict (key) do nothing;
alter table public.flyer_campaigns add column if not exists announced_at timestamptz;
alter table public.flyer_tasks add column if not exists reminded_at timestamptz;
-- đợt đã tạo trước bản này: không báo "đợt mới" lại
update public.flyer_campaigns set announced_at = coalesce(announced_at, now());

-- sửa ngày / giờ hạn thì nhắc trước hạn lại theo giờ mới
create or replace function public.flyer_task_update(p_task bigint, p_date date, p_hm text, p_qty int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; t public.flyer_tasks; v_n int;
begin
  m := public._flyer_mgr();
  select * into t from public.flyer_tasks where id = p_task;
  if t.id is null then raise exception 'Không tìm thấy tuyến trong đợt.'; end if;
  if p_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Giờ hạn không đúng (vd 20:00).'; end if;
  if coalesce(p_qty, 0) < 1 then raise exception 'Số tờ phải lớn hơn 0.'; end if;
  update public.flyer_tasks set due_date = p_date, due_hm = p_hm, qty = p_qty, notified_at = case when (due_date, due_hm) is distinct from (p_date, p_hm) then null else notified_at end,
    reminded_at = case when (due_date, due_hm) is distinct from (p_date, p_hm) then null else reminded_at end where id = p_task;
  select count(*) into v_n from public.flyer_assign where task_id = p_task;
  if v_n > 0 then
    update public.flyer_assign a set qty = case when x.rn <= p_qty % v_n then ceil(p_qty::numeric / v_n)::int else floor(p_qty::numeric / v_n)::int end
    from (select id, row_number() over (order by id) rn from public.flyer_assign where task_id = p_task) x where a.id = x.id;
  end if;
  update public.flyer_campaigns c set start_date = (select min(due_date) from public.flyer_tasks where campaign_id = c.id), end_date = (select max(due_date) from public.flyer_tasks where campaign_id = c.id),
    total_qty = (select sum(qty) from public.flyer_tasks where campaign_id = c.id) where c.id = t.campaign_id;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FLYER_TASK_UPDATE', p_task::text, jsonb_build_object('date', p_date, 'hm', p_hm, 'qty', p_qty));
  return jsonb_build_object('status', 'success', 'message', 'Đã cập nhật ' || t.route_name);
end $$;


-- việc tờ rơi của NV: + lịch sắp tới (2–7 ngày)
create or replace function public.flyer_todo(p_staff text, p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships; d date := coalesce(p_date, public.vn_today()); o jsonb := '[]'::jsonb; v_over text; v_today text; v_tm text;
begin
  m := public._member_for_staff(p_staff);
  select string_agg(t.route_name || ' (' || to_char(t.due_date, 'DD/MM') || ')', ' · ' order by t.due_date) into v_over from public.flyer_assign a join public.flyer_tasks t on t.id = a.task_id
    where a.staff_id = p_staff and a.done_at is null and t.due_date < d and t.due_date >= d - 14;
  if v_over is not null then o := o || jsonb_build_object('k', 'fl_over', 'icon', '📄', 'lv', 'bad', 't', 'Tờ rơi quá hạn chưa báo cáo', 'd', left(v_over, 160), 'go', 'cv:flyer'); end if;
  select string_agg(t.route_name || ' · ' || a.qty || ' tờ · hạn ' || t.due_hm, ' | ' order by t.due_hm) into v_today from public.flyer_assign a join public.flyer_tasks t on t.id = a.task_id
    where a.staff_id = p_staff and a.done_at is null and t.due_date = d;
  if v_today is not null then o := o || jsonb_build_object('k', 'fl_today', 'icon', '📄', 'lv', 'warn', 't', 'Hôm nay phát tờ rơi', 'd', left(v_today, 160), 'go', 'cv:flyer'); end if;
  select string_agg(t.route_name || ' · ' || a.qty || ' tờ', ' | ' order by t.due_hm) into v_tm from public.flyer_assign a join public.flyer_tasks t on t.id = a.task_id
    where a.staff_id = p_staff and t.due_date = d + 1;
  if v_tm is not null then o := o || jsonb_build_object('k', 'fl_tm', 'icon', '📄', 'lv', 'info', 't', 'Mai phát tờ rơi', 'd', left(v_tm, 160), 'go', 'cv:flyer'); end if;
  -- lịch sắp tới (2–7 ngày nữa) để NV biết ngay khi QL vừa tạo đợt
  select string_agg(to_char(t.due_date, 'DD/MM') || ' ' || t.route_name || ' · ' || a.qty || ' tờ', ' | ' order by t.due_date, t.due_hm) into v_tm from public.flyer_assign a join public.flyer_tasks t on t.id = a.task_id
    where a.staff_id = p_staff and a.done_at is null and t.due_date between d + 2 and d + 7;
  if v_tm is not null then o := o || jsonb_build_object('k', 'fl_next', 'icon', '📄', 'lv', 'info', 't', 'Lịch phát tờ rơi sắp tới', 'd', left(v_tm, 160), 'go', 'cv:flyer'); end if;
  return o;
end $$;

