-- =====================================================================
-- B13 Báo cáo truyền thông ngày (số lần truyền thông, số lần báo cáo Line truyền thông) — chỉ ghi nhận, không tính sao.
-- B14 "Việc cần làm" trong báo cáo cuối ngày: TikTok, vệ sinh (lịch + khu vực), roadshow, CV chưa xong, thứ 2 cập nhật
--     lũy kế + phục vụ, đăng ký bận trước 22h T6, lịch ngày mai, mục đang chờ QL duyệt.
-- D3: khoá NV tự đăng ký bận/OFF cho tuần sau sau 22h thứ 6 (QL vẫn đăng ký hộ được).
-- =====================================================================
create table if not exists public.media_reports (
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  report_date date not null,
  posts int not null default 0 check (posts >= 0),          -- số lần truyền thông trong ngày
  line_reports int not null default 0 check (line_reports >= 0),  -- số lần báo cáo Line truyền thông
  created_by text, updated_at timestamptz not null default now(),
  primary key (staff_id, report_date)
);
alter table public.media_reports enable row level security;
drop policy if exists media_reports_read on public.media_reports;
create policy media_reports_read on public.media_reports for select to authenticated using (public.can_see_staff(staff_id));
grant select on public.media_reports to authenticated;
revoke insert, update, delete on public.media_reports from authenticated;
revoke all on public.media_reports from anon;

insert into public.settings(key, value, updated_by) values
  ('BUSY_LOCK_ENABLED', 'true', 'system'), ('BUSY_DEADLINE_HM', '"22:00"', 'system')
on conflict (key) do nothing;

create or replace function public.save_media(p_staff text, p_date date, p_posts int, p_line int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._member_for_staff(p_staff);
  if p_date > public.vn_today() then raise exception 'Không báo cáo cho ngày tương lai.'; end if;
  if coalesce(p_posts, 0) < 0 or coalesce(p_line, 0) < 0 or coalesce(p_posts, 0) > 99 or coalesce(p_line, 0) > 99 then raise exception 'Số lần truyền thông không hợp lệ (0–99).'; end if;
  if m.role = 'employee' and exists (select 1 from public.locked_dates where d = p_date) then raise exception 'Ngày % đã khoá sổ.', to_char(p_date, 'DD/MM'); end if;
  insert into public.media_reports(staff_id, report_date, posts, line_reports, created_by) values (p_staff, p_date, coalesce(p_posts, 0), coalesce(p_line, 0), m.email)
  on conflict (staff_id, report_date) do update set posts = excluded.posts, line_reports = excluded.line_reports, created_by = excluded.created_by, updated_at = now();
  return jsonb_build_object('status', 'success');
end $$;
grant execute on function public.save_media(text, date, int, int) to authenticated;

-- Hạn đăng ký bận cho ngày d: 22h (BUSY_DEADLINE_HM) thứ 6 của tuần trước tuần chứa d
create or replace function public.busy_deadline(p_date date) returns timestamptz
language sql stable set search_path = '' as $$
  select ((date_trunc('week', p_date)::date - 3) + public.setting_text('BUSY_DEADLINE_HM', '22:00')::time) at time zone 'Asia/Ho_Chi_Minh';
$$;
grant execute on function public.busy_deadline(date) to authenticated;

create or replace function public.busy_register(p_staff text, p_date date, p_type text, p_shifts integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_n int; v_max int := public.setting_num('BUSY_MAX_WEEKDAY', 3)::int; v_dl timestamptz;
begin
  m := public._member_for_staff(p_staff);
  if m.role = 'employee' and public.setting_text('BUSY_LOCK_ENABLED', 'true') = 'true' then
    v_dl := public.busy_deadline(p_date);
    if now() > v_dl then
      raise exception 'Đã quá hạn đăng ký bận/OFF cho tuần % (hạn % thứ 6 %). Liên hệ quản lý để đăng ký hộ.',
        to_char(date_trunc('week', p_date), 'DD/MM'), public.setting_text('BUSY_DEADLINE_HM', '22:00'), to_char(v_dl at time zone 'Asia/Ho_Chi_Minh', 'DD/MM');
    end if;
  end if;
  if exists (select 1 from public.busy where busy_date = p_date and staff_id = p_staff) then raise exception 'Nhân viên đã đăng ký ngày này rồi.'; end if;
  select count(*) into v_n from public.busy b join public.staff s on s.id = b.staff_id where b.busy_date = p_date and not s.hidden;
  if extract(isodow from p_date) <= 5 and v_n >= v_max then
    return jsonb_build_object('status', 'full', 'message', format('Ngày %s đã đủ %s người — đăng ký muộn, liên hệ quản lý.', to_char(p_date, 'DD/MM'), v_max));
  end if;
  insert into public.busy(busy_date, staff_id, type, shifts, created_by)
  values (p_date, p_staff, case when p_type = 'OFF' then 'OFF' else 'BAN' end,
          case when p_type = 'OFF' then '{}' else array(select distinct x from unnest(coalesce(p_shifts, '{}')) x where x between 1 and 6 order by x) end, m.email);
  return jsonb_build_object('status', 'success', 'message', 'Đã đăng ký ' || case when p_type = 'OFF' then 'OFF' else 'bận' end || ' ngày ' || to_char(p_date, 'DD/MM'));
end $$;

-- Danh sách việc cần làm / sắp tới của 1 NV tính tại ngày báo cáo p_date
create or replace function public.todo_list(p_staff text, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; d date := coalesce(p_date, public.vn_today()); tm date; v_today date := public.vn_today();
  o jsonb := '[]'::jsonb; v_start date; v_dates text; v_n int; v_txt text; v_dept text; v_dl timestamptz; v_reward int;
  dn text[] := array['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
begin
  m := public._member_for_staff(p_staff);
  tm := d + 1;
  select dept into v_dept from public.staff where id = p_staff;
  -- TikTok
  v_start := nullif(public.setting_text('TIKTOK_START_DATE', ''), '')::date;
  v_reward := public.setting_num('TIKTOK_REWARD', 100)::int;
  if v_start is not null then
    select count(*), case when count(*) > 3 then 'từ ' || to_char(min(x), 'DD/MM') || ' đến ' || to_char(max(x), 'DD/MM') else string_agg(to_char(x, 'DD/MM'), ', ' order by x) end into v_n, v_dates
    from public.tiktok_due_dates(v_start, d - 1) x where not exists (select 1 from public.tiktok_submissions t where t.staff_id = p_staff and t.due = x);
    if v_n > 0 then o := o || jsonb_build_object('k', 'tt_over', 'icon', '🎬', 'lv', 'bad', 't', format('TikTok quá hạn %s kỳ', v_n), 'd', 'Kỳ ' || v_dates || ' — nộp ngay để dừng trừ sao', 'go', 'cv:tiktok'); end if;
    if extract(isodow from d) in (2, 5) and d >= v_start and not exists (select 1 from public.tiktok_submissions t where t.staff_id = p_staff and t.due = d) then
      o := o || jsonb_build_object('k', 'tt_today', 'icon', '🎬', 'lv', 'warn', 't', 'Hôm nay hạn nộp TikTok', 'd', 'Nộp link TikTok + Facebook trước khi hết ngày', 'go', 'cv:tiktok');
    end if;
    if extract(isodow from tm) in (2, 5) and tm >= v_start and not exists (select 1 from public.tiktok_submissions t where t.staff_id = p_staff and t.due = tm) then
      o := o || jsonb_build_object('k', 'tt_tm', 'icon', '🎬', 'lv', 'info', 't', format('Mai (%s %s) hạn nộp TikTok', dn[extract(dow from tm)::int + 1], to_char(tm, 'DD/MM')), 'd', format('Nộp sớm từ hôm nay được +%s⭐', v_reward), 'go', 'cv:tiktok');
    end if;
  end if;
  -- Vệ sinh: lịch đăng ký + khu vực phụ trách
  select count(*), string_agg(to_char(clean_date, 'DD/MM'), ', ' order by clean_date) into v_n, v_dates from public.cleaning
    where staff_id = p_staff and clean_date between d - 7 and d - 1 and coalesce(array_length(photos, 1), 0) < 3;
  if v_n > 0 then o := o || jsonb_build_object('k', 'cl_over', 'icon', '🧹', 'lv', 'bad', 't', 'Vệ sinh quá ngày chưa nộp ảnh', 'd', 'Ngày ' || v_dates, 'go', 'cv:clean'); end if;
  if exists (select 1 from public.cleaning where staff_id = p_staff and clean_date = d and coalesce(array_length(photos, 1), 0) < 3) then
    o := o || jsonb_build_object('k', 'cl_today', 'icon', '🧹', 'lv', 'warn', 't', 'Hôm nay trực vệ sinh — chưa nộp 3 ảnh', 'd', 'Theo lịch đăng ký', 'go', 'cv:clean');
  end if;
  select string_agg(z.name, ' · ' order by z.sort) into v_txt from public.clean_zones z
    where z.kind = 'zone' and p_staff = any(z.staff_ids) and not exists (select 1 from public.clean_zone_checks c where c.zone_id = z.id and c.d = d and c.staff_id = p_staff);
  if v_txt is not null then o := o || jsonb_build_object('k', 'zone', 'icon', '🧽', 'lv', 'warn', 't', 'Khu vực vệ sinh chưa báo xong', 'd', v_txt, 'go', 'cv:clean'); end if;
  if exists (select 1 from public.cleaning where staff_id = p_staff and clean_date = tm) then
    o := o || jsonb_build_object('k', 'cl_tm', 'icon', '🧹', 'lv', 'info', 't', format('Mai (%s %s) bạn trực vệ sinh', dn[extract(dow from tm)::int + 1], to_char(tm, 'DD/MM')), 'd', 'Làm xong nộp 3 ảnh', 'go', 'cv:clean');
  end if;
  -- Roadshow
  select count(*), string_agg(to_char(rs_date, 'DD/MM') || ' ' || rs_time, ', ' order by rs_date, rs_time) into v_n, v_dates from public.roadshow
    where staff_id = p_staff and rs_date between d - 7 and d and report_date is null;
  if v_n > 0 then o := o || jsonb_build_object('k', 'rs_rep', 'icon', '🏍️', 'lv', 'warn', 't', 'Roadshow chưa nộp báo cáo / ảnh', 'd', v_dates, 'go', 'cv:rs'); end if;
  select string_agg(rs_time, ', ' order by rs_time) into v_txt from public.roadshow where staff_id = p_staff and rs_date = tm;
  if v_txt is not null then o := o || jsonb_build_object('k', 'rs_tm', 'icon', '🏍️', 'lv', 'info', 't', format('Mai (%s %s) có Roadshow', dn[extract(dow from tm)::int + 1], to_char(tm, 'DD/MM')), 'd', 'Lúc ' || v_txt, 'go', 'cv:rs'); end if;
  -- CV: triển khai chưa đọc, việc được giao chưa hoàn thành
  select count(*), string_agg(t.title, ' · ' order by t.important desc, t.created_at desc) into v_n, v_txt from public.tasks t
    where t.status = 'open' and (t.hide_after is null or t.hide_after >= v_today)
      and ((t.kind = 'announce' and (cardinality(t.depts) = 0 or v_dept = any(t.depts))
             and not exists (select 1 from public.task_acks a where a.task_id = t.id and a.who = p_staff and a.period = public._task_period(t.remind, v_today) and a.read_at is not null))
        or (t.kind = 'assign' and p_staff = any(t.assignees)
             and not exists (select 1 from public.task_acks a where a.task_id = t.id and a.who = p_staff and a.period = public._task_period(t.remind, v_today) and a.done_at is not null)));
  if v_n > 0 then o := o || jsonb_build_object('k', 'cv', 'icon', '📋', 'lv', 'warn', 't', format('Hoàn tất %s việc trong CV', v_n), 'd', left(v_txt, 160), 'go', 'cv:tasks'); end if;
  -- Thứ 2: cập nhật lũy kế + phục vụ tuần trước (CN nhắc trước)
  if extract(isodow from d) = 1 then
    if not exists (select 1 from public.score_log where staff_id = p_staff and kind = 'cumulative' and at >= (d::timestamp at time zone 'Asia/Ho_Chi_Minh')) then
      o := o || jsonb_build_object('k', 'cum', 'icon', '📈', 'lv', 'warn', 't', 'Thứ 2: cập nhật lũy kế DT + môn', 'd', 'Đúng loại từng môn: 🔢 Số lượng · 💰 DT quy đổi · 💵 DT thực', 'go', 'cum');
    end if;
    if not exists (select 1 from public.ratings where staff_id = p_staff and period_end >= d - 7) then
      o := o || jsonb_build_object('k', 'rate', 'icon', '🤝', 'lv', 'warn', 't', 'Thứ 2: nhập phục vụ tuần trước', 'd', 'Số lượt 5★…1★, khiếu nại (Của tôi → Đánh giá phục vụ)', 'go', 'me');
    end if;
  elsif extract(isodow from d) = 7 then
    o := o || jsonb_build_object('k', 'mon_tm', 'icon', '📈', 'lv', 'info', 't', 'Mai thứ 2: cập nhật lũy kế + phục vụ tuần', 'd', 'Chuẩn bị số lũy kế tháng (DT QĐ, từng môn) và lượt đánh giá phục vụ', 'go', 'me');
  end if;
  -- Đăng ký bận / OFF tuần sau trước 22h thứ 6
  if extract(isodow from d) in (4, 5) then
    v_dl := ((date_trunc('week', d)::date + 4) + public.setting_text('BUSY_DEADLINE_HM', '22:00')::time) at time zone 'Asia/Ho_Chi_Minh';
    if now() < v_dl then
      select count(*) into v_n from public.busy where staff_id = p_staff and busy_date between date_trunc('week', d)::date + 7 and date_trunc('week', d)::date + 13;
      o := o || jsonb_build_object('k', 'busy', 'icon', '🗓️', 'lv', case when extract(isodow from d) = 5 then 'warn' else 'info' end,
        't', format('Đăng ký bận/OFF tuần sau trước %s thứ 6 %s', public.setting_text('BUSY_DEADLINE_HM', '22:00'), to_char(date_trunc('week', d)::date + 4, 'DD/MM')),
        'd', case when v_n > 0 then format('Đã đăng ký %s ngày', v_n) else 'Chưa đăng ký ngày nào — sau hạn phải nhờ quản lý' end, 'go', 'cv:busy');
    end if;
  end if;
  select case when type = 'OFF' then 'OFF cả ngày' else 'Bận ca ' || array_to_string(shifts, ', ') end into v_txt from public.busy where staff_id = p_staff and busy_date = tm;
  if v_txt is not null then o := o || jsonb_build_object('k', 'busy_tm', 'icon', '🗓️', 'lv', 'info', 't', format('Mai (%s %s) bạn đã đăng ký: %s', dn[extract(dow from tm)::int + 1], to_char(tm, 'DD/MM'), v_txt), 'd', '', 'go', 'cv:busy'); end if;
  -- Đang chờ quản lý duyệt
  select string_agg(x, ' · ') into v_txt from (
    select format('%s thưởng nóng', count(*)) x from public.hot_bonuses where staff_id = p_staff and status = 'Chờ duyệt' having count(*) > 0
    union all select format('%s bán thêm', count(*)) from public.extra_proposals where staff_id = p_staff and status = 'Chờ duyệt' having count(*) > 0
    union all select format('%s yêu cầu sửa báo cáo', count(*)) from public.change_requests where staff_id = p_staff and status = 'pending' having count(*) > 0) z;
  if v_txt is not null then o := o || jsonb_build_object('k', 'wait', 'icon', '⏳', 'lv', 'info', 't', 'Đang chờ quản lý duyệt', 'd', v_txt, 'go', ''); end if;
  return o;
end $$;
grant execute on function public.todo_list(text, date) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'media_reports') then
    alter publication supabase_realtime add table public.media_reports;
  end if;
end $$;
