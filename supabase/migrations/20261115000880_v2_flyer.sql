-- D11 Phát tờ rơi: danh mục tuyến đường (từ file "Ma trận tờ rơi"), tạo đợt tự động chia người / ngày, NV-PG nộp ảnh chụp album, nhắc Telegram đúng giờ hạn.
insert into public.settings(key, value) values ('FLYER_DEADLINE_HM', '"20:00"'::jsonb) on conflict (key) do nothing;

create table if not exists public.flyer_routes (
  id bigint generated always as identity primary key,
  name text not null,
  map_url text not null default '',
  qty integer not null default 50 check (qty > 0),                 -- số tờ rơi của tuyến / chợ
  people integer not null default 1 check (people between 1 and 4), -- số nhân sự cùng phát
  note text not null default '',
  active boolean not null default true,
  sort integer not null default 0,
  last_used date,
  created_at timestamptz not null default now()
);
create table if not exists public.flyer_campaigns (
  id bigint generated always as identity primary key,
  name text not null,
  total_qty integer not null,
  start_date date not null,
  end_date date not null,
  deadline_hm text not null default '20:00',
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists public.flyer_tasks (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.flyer_campaigns(id) on delete cascade,
  route_id bigint references public.flyer_routes(id) on delete set null,
  route_name text not null,
  map_url text not null default '',
  qty integer not null,
  due_date date not null,
  due_hm text not null default '20:00',
  notified_at timestamptz
);
create index if not exists flyer_tasks_due_idx on public.flyer_tasks(due_date);
create table if not exists public.flyer_assign (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.flyer_tasks(id) on delete cascade,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  qty integer not null default 0,
  photos text[] not null default '{}',
  done_at timestamptz,
  unique (task_id, staff_id)
);
alter table public.flyer_routes enable row level security;
alter table public.flyer_campaigns enable row level security;
alter table public.flyer_tasks enable row level security;
alter table public.flyer_assign enable row level security;

insert into public.flyer_routes(name, map_url, qty, people, sort)
select * from (values
  ('Lương Nhữ Hộc - Xô Viết Nghệ Tĩnh', 'https://maps.app.goo.gl/ZSmSMw8ieKDuLnMp6', 100, 1, 1),
  ('Lý Nhân Tông', 'https://maps.app.goo.gl/TLVd2U4xK8VeMnURA', 50, 1, 2),
  ('Bùi Kỷ', 'https://maps.app.goo.gl/MyoPMC5T4i4hXREm6', 50, 1, 3),
  ('Hà Huy Giáp', 'https://maps.app.goo.gl/wsNSa3Uq7PUEv9M77', 50, 1, 4),
  ('Nguyễn Khánh Toàn', 'https://maps.app.goo.gl/CPQPbNYMqvjdFwJ37', 100, 1, 5),
  ('Ngô Tất Tố', 'https://maps.app.goo.gl/xdnwDVPWrtxRBxDm9', 50, 1, 6),
  ('Phan Đăng Lưu', 'https://maps.app.goo.gl/QPhfzByofvuPuhzJ7', 100, 1, 7),
  ('Phạm Phú Tiết', 'https://maps.app.goo.gl/7UqYCPj6KwNcyv2t8', 50, 1, 8),
  ('Nguyễn Dữ', 'https://maps.app.goo.gl/R2at4E8hbVE9Fcjg8', 50, 1, 9),
  ('Nguyễn Cư Trinh', 'https://maps.app.goo.gl/6FBLTYekrMoLVBQL6', 50, 1, 10),
  ('Trần Đức Thảo', 'https://maps.app.goo.gl/5FrGMz5JyR42K1jP9', 50, 1, 11),
  ('Huy Cận', 'https://maps.app.goo.gl/EMqyWedKTXvjKSRM6', 100, 1, 12),
  ('Lê Thị Hồng Gấm', 'https://maps.app.goo.gl/u9KFbdoALaBLaemC7', 100, 1, 13),
  ('Hàn Thuyên', 'https://maps.app.goo.gl/52NpLm41ysfQcote9', 100, 1, 14),
  ('Huỳnh Tấn Phát', 'https://maps.app.goo.gl/CkGSwx2oPSB8E5mJ8', 100, 1, 15),
  ('Tố Hữu', 'https://maps.app.goo.gl/EeP3X2bw1ZLCqLq76', 100, 1, 16),
  ('Phan Anh', 'https://maps.app.goo.gl/K9gvege3qaPoSJQN7', 50, 1, 17),
  ('Phạm Thế Hiển', 'https://maps.app.goo.gl/2C75znDHM4LByXuY6', 50, 1, 18),
  ('Chu Mạnh Trinh', 'https://maps.app.goo.gl/Xi6W8RehXJKqkANYA', 50, 1, 19),
  ('Cao Xuân Huy', 'https://maps.app.goo.gl/DhMt1uxVqPvXDzss6', 50, 1, 20),
  ('Dương Quảng Hàm', 'https://maps.app.goo.gl/ayde5s8CdEx7ZoZG8', 50, 1, 21),
  ('Dương Bá Trạc', 'https://maps.app.goo.gl/9r8jh9HUofZJV3Rw5', 50, 1, 22),
  ('Phan Trọng Tuệ', 'https://maps.app.goo.gl/KJm58n5P8wpvzegH9', 50, 1, 23),
  ('Nguyễn Trác', 'https://maps.app.goo.gl/djpgFZmRDKLhWD9m8', 50, 1, 24),
  ('Nguyễn Đăng Đạo', 'https://maps.app.goo.gl/J6kae5mGwGEUWa2S6', 50, 1, 25),
  ('Ca Văn Thỉnh', 'https://maps.app.goo.gl/cAn6swpPvccGszFb6', 50, 1, 26),
  ('Hoàng Xuân Nhị', 'https://maps.app.goo.gl/xvsAMP7GzsN621Sz6', 50, 1, 27),
  ('Lê Đại + Tân An 234', 'https://maps.app.goo.gl/9pLpi1iSnpN8gnjK7', 200, 2, 28),
  ('Chợ Đầu Mối Hòa Cường', 'https://maps.app.goo.gl/L3JCUUNnoiC9JNak6', 200, 2, 29),
  ('Chợ Nguyễn Tri Phương', 'https://maps.app.goo.gl/UWNEG9AyUEcNhmXD7', 200, 2, 30),
  ('Chợ Lê Thanh Nghị (Gần BHX)', 'https://maps.app.goo.gl/sxkB9ZxrxpbG7xKn6', 200, 2, 31)
) v(name, map_url, qty, people, sort) where not exists (select 1 from public.flyer_routes);

create or replace function public._flyer_mgr() returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý / chủ sở hữu được dùng chức năng này.'; end if;
  return m;
end $$;

-- Toàn bộ dữ liệu màn Tờ rơi: tuyến (chỉ QL) + các đợt gần đây kèm nhân sự, trạng thái nộp ảnh
create or replace function public.flyer_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships; v_mgr boolean; v_routes jsonb := '[]'::jsonb; v_camps jsonb;
begin
  m := public._require_member();
  v_mgr := m.role in ('owner', 'manager');
  if v_mgr then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.id), '[]'::jsonb) into v_routes from public.flyer_routes r;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'total_qty', c.total_qty, 'start_date', c.start_date, 'end_date', c.end_date,
      'deadline_hm', c.deadline_hm, 'created_at', c.created_at,
      'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'route_id', t.route_id, 'route_name', t.route_name, 'map_url', t.map_url, 'qty', t.qty,
          'due_date', t.due_date, 'due_hm', t.due_hm,
          'assigns', (select coalesce(jsonb_agg(jsonb_build_object('staff_id', a.staff_id, 'name', s.name, 'dept', s.dept, 'qty', a.qty, 'photos', a.photos, 'done_at', a.done_at) order by s.sort, s.name), '[]'::jsonb)
                      from public.flyer_assign a join public.staff s on s.id = a.staff_id where a.task_id = t.id))
        order by t.due_date, t.id), '[]'::jsonb) from public.flyer_tasks t where t.campaign_id = c.id)) order by c.start_date desc, c.id desc), '[]'::jsonb)
    into v_camps from public.flyer_campaigns c where c.end_date >= public.vn_today() - 30;
  return jsonb_build_object('routes', v_routes, 'campaigns', v_camps, 'today', public.vn_today(), 'deadline_hm', public.setting_text('FLYER_DEADLINE_HM', '20:00'));
end $$;

create or replace function public.flyer_route_save(p_id bigint, p_name text, p_map text, p_qty int, p_people int, p_note text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_id bigint;
begin
  m := public._flyer_mgr();
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Nhập tên tuyến / chợ.'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Số tờ rơi phải lớn hơn 0.'; end if;
  if p_id is null then
    insert into public.flyer_routes(name, map_url, qty, people, note, active, sort)
      values (btrim(p_name), btrim(coalesce(p_map, '')), p_qty, greatest(1, least(4, coalesce(p_people, 1))), coalesce(p_note, ''), coalesce(p_active, true),
        coalesce((select max(sort) from public.flyer_routes), 0) + 1) returning id into v_id;
  else
    update public.flyer_routes set name = btrim(p_name), map_url = btrim(coalesce(p_map, '')), qty = p_qty, people = greatest(1, least(4, coalesce(p_people, 1))),
      note = coalesce(p_note, ''), active = coalesce(p_active, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy tuyến.'; end if;
  end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FLYER_ROUTE_SAVE', v_id::text, jsonb_build_object('name', p_name, 'qty', p_qty, 'people', p_people));
  return jsonb_build_object('status', 'success', 'message', 'Đã lưu tuyến ' || btrim(p_name));
end $$;

create or replace function public.flyer_route_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_name text;
begin
  m := public._flyer_mgr();
  delete from public.flyer_routes where id = p_id returning name into v_name;
  if v_name is null then raise exception 'Không tìm thấy tuyến.'; end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FLYER_ROUTE_DELETE', p_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá tuyến ' || v_name);
end $$;

-- Tạo đợt phát: nhập số tờ rơi → tự chọn tuyến (tuyến lâu chưa phát trước), chia ngày, chia nhân sự công bằng
create or replace function public.flyer_generate(p_qty int, p_start date default null, p_days int default null, p_deadline_hm text default null,
  p_exclude text[] default '{}', p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; v_start date := coalesce(p_start, public.vn_today() + 1); v_hm text := coalesce(nullif(btrim(p_deadline_hm), ''), public.setting_text('FLYER_DEADLINE_HM', '20:00'));
  v_camp bigint; v_left int := p_qty; r record; t record; v_sel jsonb := '[]'::jsonb; v_slots int := 0; v_pool text[]; v_np int; v_days int; v_cap int;
  v_day int := 0; v_used int := 0; v_task bigint; v_dd date; v_k int; v_pick text[]; v_i int; v_q int; v_cnt jsonb := '{}'::jsonb; v_dayc jsonb;
  v_end date := v_start; v_n int := 0; v_sid text;
begin
  m := public._flyer_mgr();
  if coalesce(p_qty, 0) < 1 then raise exception 'Nhập số lượng tờ rơi cần phát.'; end if;
  if v_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Giờ hạn không đúng (vd 20:00).'; end if;
  if v_start < public.vn_today() then raise exception 'Ngày bắt đầu không được ở quá khứ.'; end if;
  select array_agg(s.id order by s.sort, s.name) into v_pool from public.staff s where not s.hidden and not (s.id = any(coalesce(p_exclude, '{}')));
  v_np := coalesce(array_length(v_pool, 1), 0);
  if v_np = 0 then raise exception 'Chưa có nhân sự để chia.'; end if;
  -- 1) chọn tuyến: lâu chưa phát trước, cho tới khi đủ số lượng
  for r in select * from public.flyer_routes where active order by coalesce(last_used, date '1900-01-01'), sort, id loop
    exit when v_left <= 0;
    v_q := least(r.qty, v_left);
    v_sel := v_sel || jsonb_build_object('id', r.id, 'name', r.name, 'map', r.map_url, 'qty', v_q, 'people', case when v_q < r.qty / 2 then 1 else r.people end);
    v_left := v_left - v_q; v_slots := v_slots + (v_sel -> -1 ->> 'people')::int;
  end loop;
  if v_left > 0 then raise exception 'Các tuyến đang bật chỉ có % tờ, thiếu % tờ so với % tờ cần phát. Thêm tuyến hoặc tăng số lượng tuyến.', p_qty - v_left, v_left, p_qty; end if;
  -- 2) số ngày (tối đa 4) và sức chứa mỗi ngày (số lượt người)
  v_days := greatest(1, least(4, coalesce(p_days, ceil(v_slots::numeric / v_np)::int)));
  v_cap := ceil(v_slots::numeric / v_days)::int;
  insert into public.flyer_campaigns(name, total_qty, start_date, end_date, deadline_hm, created_by)
    values (coalesce(nullif(btrim(p_name), ''), 'Đợt phát tờ rơi ' || to_char(v_start, 'DD/MM')), p_qty, v_start, v_start, v_hm, m.email) returning id into v_camp;
  v_dayc := '{}'::jsonb;
  for t in select x.value as j from jsonb_array_elements(v_sel) x loop
    v_k := (t.j ->> 'people')::int;
    if v_used > 0 and v_used + v_k > v_cap and v_day < v_days - 1 then v_day := v_day + 1; v_used := 0; end if;
    v_used := v_used + v_k; v_dd := v_start + v_day; v_end := greatest(v_end, v_dd);
    insert into public.flyer_tasks(campaign_id, route_id, route_name, map_url, qty, due_date, due_hm)
      values (v_camp, (t.j ->> 'id')::bigint, t.j ->> 'name', t.j ->> 'map', (t.j ->> 'qty')::int, v_dd, v_hm) returning id into v_task;
    -- nhân sự: ít việc trong ngày → ít việc trong đợt → lâu chưa phát; ưu tiên người không bận / OFF
    select array_agg(z.id) into v_pick from (
      select s.id from public.staff s
      where s.id = any(v_pool)
      order by coalesce((v_dayc ->> (v_day::text || '|' || s.id))::int, 0),
        (exists (select 1 from public.busy b where b.staff_id = s.id and b.busy_date = v_dd)),
        coalesce((v_cnt ->> s.id)::int, 0),
        coalesce((select max(f.due_date) from public.flyer_assign a2 join public.flyer_tasks f on f.id = a2.task_id where a2.staff_id = s.id and f.campaign_id <> v_camp), date '1900-01-01'),
        s.sort, s.name
      limit v_k) z;
    v_i := 0;
    foreach v_sid in array coalesce(v_pick, '{}') loop
      v_i := v_i + 1;
      insert into public.flyer_assign(task_id, staff_id, qty) values (v_task, v_sid, case when v_i <= (t.j ->> 'qty')::int % v_k then ceil((t.j ->> 'qty')::numeric / v_k)::int else floor((t.j ->> 'qty')::numeric / v_k)::int end);
      v_cnt := jsonb_set(v_cnt, array[v_sid], to_jsonb(coalesce((v_cnt ->> v_sid)::int, 0) + 1));
      v_dayc := jsonb_set(v_dayc, array[v_day::text || '|' || v_sid], to_jsonb(coalesce((v_dayc ->> (v_day::text || '|' || v_sid))::int, 0) + 1));
    end loop;
    update public.flyer_routes set last_used = v_dd where id = (t.j ->> 'id')::bigint;
    v_n := v_n + 1;
  end loop;
  update public.flyer_campaigns set end_date = v_end where id = v_camp;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FLYER_GENERATE', v_camp::text, jsonb_build_object('qty', p_qty, 'tasks', v_n, 'days', v_days));
  return jsonb_build_object('status', 'success', 'campaign_id', v_camp,
    'message', format('Đã tạo đợt %s tờ: %s tuyến, %s ngày (%s → %s), hạn %s', p_qty, v_n, v_days, to_char(v_start, 'DD/MM'), to_char(v_end, 'DD/MM'), v_hm));
end $$;

-- Quản lý sửa nhân sự phát của một tuyến (giữ nguyên người đã nộp ảnh nếu vẫn còn trong danh sách); chia lại đều số tờ
create or replace function public.flyer_task_assign(p_task bigint, p_staff text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; t public.flyer_tasks; v_n int; v_i int := 0; v_sid text; v_list text[];
begin
  m := public._flyer_mgr();
  select * into t from public.flyer_tasks where id = p_task;
  if t.id is null then raise exception 'Không tìm thấy tuyến trong đợt.'; end if;
  select array_agg(distinct x) into v_list from unnest(coalesce(p_staff, '{}')) x where exists (select 1 from public.staff s where s.id = x and not s.hidden);
  v_n := coalesce(array_length(v_list, 1), 0);
  if v_n < 1 then raise exception 'Chọn ít nhất 1 nhân sự.'; end if;
  if v_n > 4 then raise exception 'Tối đa 4 nhân sự cho một tuyến.'; end if;
  delete from public.flyer_assign where task_id = p_task and not (staff_id = any(v_list));
  foreach v_sid in array v_list loop
    v_i := v_i + 1;
    insert into public.flyer_assign(task_id, staff_id, qty) values (p_task, v_sid, case when v_i <= t.qty % v_n then ceil(t.qty::numeric / v_n)::int else floor(t.qty::numeric / v_n)::int end)
    on conflict (task_id, staff_id) do update set qty = excluded.qty;
  end loop;
  update public.flyer_tasks set notified_at = null where id = p_task and notified_at is not null and due_date >= public.vn_today();
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FLYER_ASSIGN', p_task::text, jsonb_build_object('staff', v_list));
  return jsonb_build_object('status', 'success', 'message', format('Đã cập nhật %s nhân sự cho %s', v_n, t.route_name));
end $$;

-- Quản lý sửa ngày / giờ hạn / số tờ của một tuyến trong đợt
create or replace function public.flyer_task_update(p_task bigint, p_date date, p_hm text, p_qty int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; t public.flyer_tasks; v_n int;
begin
  m := public._flyer_mgr();
  select * into t from public.flyer_tasks where id = p_task;
  if t.id is null then raise exception 'Không tìm thấy tuyến trong đợt.'; end if;
  if p_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Giờ hạn không đúng (vd 20:00).'; end if;
  if coalesce(p_qty, 0) < 1 then raise exception 'Số tờ phải lớn hơn 0.'; end if;
  update public.flyer_tasks set due_date = p_date, due_hm = p_hm, qty = p_qty, notified_at = case when (due_date, due_hm) is distinct from (p_date, p_hm) then null else notified_at end where id = p_task;
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

create or replace function public.flyer_campaign_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_name text; v_photos text[];
begin
  m := public._flyer_mgr();
  select array_agg(p) into v_photos from public.flyer_assign a join public.flyer_tasks t on t.id = a.task_id cross join lateral unnest(a.photos) p where t.campaign_id = p_id;
  delete from public.flyer_campaigns where id = p_id returning name into v_name;
  if v_name is null then raise exception 'Không tìm thấy đợt.'; end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FLYER_CAMPAIGN_DELETE', p_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá ' || v_name, 'photos', to_jsonb(coalesce(v_photos, '{}')));
end $$;

-- NV / PG nộp ảnh chụp màn hình album đã tạo trên nhóm (Room) để báo cáo hoàn tất phần của mình
create or replace function public.flyer_report(p_task bigint, p_staff text, p_photos text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; t public.flyer_tasks;
begin
  m := public._member_for_staff(p_staff);
  select * into t from public.flyer_tasks where id = p_task;
  if t.id is null then raise exception 'Không tìm thấy tuyến trong đợt.'; end if;
  if not exists (select 1 from public.flyer_assign where task_id = p_task and staff_id = p_staff) then raise exception 'Bạn không được phân công tuyến này.'; end if;
  if cardinality(coalesce(p_photos, '{}')) < 1 or cardinality(p_photos) > 6 or exists (select 1 from unnest(p_photos) x where x !~ '^v2:flyer/') then raise exception 'Cần 1–6 ảnh chụp màn hình album.'; end if;
  update public.flyer_assign set photos = p_photos, done_at = now() where task_id = p_task and staff_id = p_staff;
  return jsonb_build_object('status', 'success', 'message', 'Đã báo cáo hoàn tất tuyến ' || t.route_name);
end $$;

create or replace function public.flyer_report_clear(p_task bigint, p_staff text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_photos text[];
begin
  m := public._flyer_mgr();
  select photos into v_photos from public.flyer_assign where task_id = p_task and staff_id = p_staff;
  update public.flyer_assign set photos = '{}', done_at = null where task_id = p_task and staff_id = p_staff;
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá báo cáo, nhân viên nộp lại được', 'photos', to_jsonb(coalesce(v_photos, '{}')));
end $$;

-- Việc tờ rơi của một NV (cho danh sách "việc cần làm" trong báo cáo cuối ngày)
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
  return o;
end $$;

revoke execute on function public._flyer_mgr() from public, anon, authenticated;
revoke execute on function public.flyer_board(), public.flyer_route_save(bigint, text, text, int, int, text, boolean), public.flyer_route_delete(bigint),
  public.flyer_generate(int, date, int, text, text[], text), public.flyer_task_assign(bigint, text[]), public.flyer_task_update(bigint, date, text, int),
  public.flyer_campaign_delete(bigint), public.flyer_report(bigint, text, text[]), public.flyer_report_clear(bigint, text), public.flyer_todo(text, date) from public, anon;
grant execute on function public.flyer_board(), public.flyer_route_save(bigint, text, text, int, int, text, boolean), public.flyer_route_delete(bigint),
  public.flyer_generate(int, date, int, text, text[], text), public.flyer_task_assign(bigint, text[]), public.flyer_task_update(bigint, date, text, int),
  public.flyer_campaign_delete(bigint), public.flyer_report(bigint, text, text[]), public.flyer_report_clear(bigint, text), public.flyer_todo(text, date) to authenticated;
