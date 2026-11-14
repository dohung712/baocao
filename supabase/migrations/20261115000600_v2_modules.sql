-- =====================================================================
-- Thi đua v2 — Module CV (TikTok, Vệ sinh, Lịch bận, Roadshow), target riêng từng nhân viên, ảnh báo cáo
-- =====================================================================

-- ---------- Target / sao riêng từng nhân viên (để trống = dùng mức của môn) ----------
create table if not exists public.staff_targets (
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  item_name text not null,
  target numeric check (target is null or target > 0),
  bonus_star integer,
  penalty_star integer,
  updated_at timestamptz not null default now(),
  primary key (staff_id, item_name)
);

-- ---------- TikTok ----------
create table if not exists public.tiktok_submissions (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  due date not null,
  tiktok_links text[] not null default '{}',
  fb_links text[] not null default '{}',
  submit_date date not null default public.vn_today(),
  submit_time text not null default '',
  status text not null check (status in ('ĐÚNG HẠN', 'TRỄ', 'MIỄN')),
  reward integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  unique (staff_id, due)
);

-- ---------- Vệ sinh: mỗi ngày 1 người ----------
create table if not exists public.cleaning (
  id bigint generated always as identity primary key,
  clean_date date not null,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  reg_date date not null default public.vn_today(),
  reg_time text not null default '',
  photos text[] not null default '{}',
  report_date date,
  report_time text,
  created_by text
);
create index if not exists cleaning_date_idx on public.cleaning(clean_date);

-- ---------- Lịch bận / OFF ----------
create table if not exists public.busy (
  id bigint generated always as identity primary key,
  busy_date date not null,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  type text not null check (type in ('BAN', 'OFF')),
  shifts integer[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by text,
  unique (busy_date, staff_id)
);

-- ---------- Roadshow ----------
create table if not exists public.roadshow (
  id bigint generated always as identity primary key,
  rs_date date not null,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  rs_time text not null default '',
  reg_date date not null default public.vn_today(),
  reg_time text not null default '',
  photos text[] not null default '{}',
  km numeric,
  minutes numeric,
  report_date date,
  report_time text,
  source text not null default 'NV',
  created_by text,
  unique (rs_date, staff_id, rs_time)
);

insert into public.settings(key, value) values
  ('TIKTOK_REWARD', '300'), ('TIKTOK_PENALTY', '300'), ('TIKTOK_MIN_LINKS', '1'), ('TIKTOK_FB_MIN', '1'),
  ('BUSY_MAX_WEEKDAY', '3'), ('RS_MIN_KM', '5'), ('RS_MIN_MIN', '30'), ('HIDDEN_PAGES', '[]')
on conflict (key) do nothing;
insert into public.settings(key, value) values ('TIKTOK_START_DATE', to_jsonb(public.vn_today()::text)) on conflict (key) do nothing;

-- ---------- RLS: lịch chung ai cũng xem (để biết ngày đã có người), sửa qua hàm ----------
alter table public.staff_targets enable row level security;
alter table public.tiktok_submissions enable row level security;
alter table public.cleaning enable row level security;
alter table public.busy enable row level security;
alter table public.roadshow enable row level security;
drop policy if exists targets_read on public.staff_targets;
create policy targets_read on public.staff_targets for select to authenticated using (public.can_see_staff(staff_id));
drop policy if exists targets_owner_write on public.staff_targets;
create policy targets_owner_write on public.staff_targets for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists tiktok_read on public.tiktok_submissions;
create policy tiktok_read on public.tiktok_submissions for select to authenticated using (public.is_member());
drop policy if exists cleaning_read on public.cleaning;
create policy cleaning_read on public.cleaning for select to authenticated using (public.is_member());
drop policy if exists busy_read on public.busy;
create policy busy_read on public.busy for select to authenticated using (public.is_member());
drop policy if exists roadshow_read on public.roadshow;
create policy roadshow_read on public.roadshow for select to authenticated using (public.is_member());
grant select on public.staff_targets, public.tiktok_submissions, public.cleaning, public.busy, public.roadshow to authenticated;
grant insert, update, delete on public.staff_targets to authenticated;
revoke insert, update, delete on public.tiktok_submissions, public.cleaning, public.busy, public.roadshow from authenticated;
revoke all on public.staff_targets, public.tiktok_submissions, public.cleaning, public.busy, public.roadshow from anon;

-- ---------- Ảnh báo cáo (Supabase Storage, riêng tư) ----------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('thidua-v2', 'thidua-v2', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute 'drop policy if exists thidua_v2_insert on storage.objects';
    execute 'create policy thidua_v2_insert on storage.objects for insert to authenticated with check (bucket_id = ''thidua-v2'' and public.is_member())';
    execute 'drop policy if exists thidua_v2_select on storage.objects';
    execute 'create policy thidua_v2_select on storage.objects for select to authenticated using (bucket_id in (''thidua-v2'', ''thi-dua-media'') and public.is_member())';
    execute 'drop policy if exists thidua_v2_delete on storage.objects';
    execute 'create policy thidua_v2_delete on storage.objects for delete to authenticated using (bucket_id = ''thidua-v2'' and public.is_manager())';
  end if;
end $$;

-- ---------- Tiện ích ----------
create or replace function public.vn_hm() returns text
language sql stable set search_path = '' as $$ select to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') $$;

create or replace function public._member_for_staff(p_staff text) returns public.memberships
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if p_staff is null or not public.can_see_staff(p_staff) then raise exception 'Bạn không thao tác được cho nhân viên này.'; end if;
  if exists (select 1 from public.staff where id = p_staff and hidden) then raise exception 'Nhân viên đang bị ẩn.'; end if;
  return m;
end $$;

-- Các ngày hạn TikTok (Thứ 3, Thứ 6) trong khoảng
create or replace function public.tiktok_due_dates(p_from date, p_to date) returns setof date
language sql immutable set search_path = '' as $$
  select d::date from generate_series(p_from, p_to, interval '1 day') d
  where p_from is not null and p_to is not null and extract(dow from d) in (2, 5)
$$;

-- ---------- TikTok ----------
create or replace function public.tiktok_submit(p_staff text, p_links text[], p_fb text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships; v_today date := public.vn_today(); v_start date; v_target date;
  v_min int := greatest(1, public.setting_num('TIKTOK_MIN_LINKS', 1)::int);
  v_fbmin int := least(5, public.setting_num('TIKTOK_FB_MIN', 1)::int);
  v_reward int := public.setting_num('TIKTOK_REWARD', 300)::int;
  v_links text[] := array(select distinct btrim(x) from unnest(coalesce(p_links, '{}')) x where btrim(x) <> '');
  v_fb text[] := array(select distinct btrim(x) from unnest(coalesce(p_fb, '{}')) x where btrim(x) <> '');
  v_bad text; v_on boolean; v_key text;
begin
  m := public._member_for_staff(p_staff);
  select x into v_bad from unnest(v_links || v_fb) x where x !~* '^https?://[^\s/?#]+\.[^\s/?#]{2,}' limit 1;
  if v_bad is not null then raise exception 'Link chưa đúng dạng: %', v_bad; end if;
  if cardinality(v_links) < v_min then raise exception 'Cần tối thiểu % link TikTok (đang có %).', v_min, cardinality(v_links); end if;
  if cardinality(v_fb) < v_fbmin then raise exception 'Chưa có link Facebook cá nhân — úp bài lên Facebook cá nhân rồi dán link vào ô ②.'; end if;
  select x into v_bad from unnest(v_links) x where x ~* '^https?://([^/]*\.)?(facebook\.com|fb\.com|fb\.watch|fb\.me)' limit 1;
  if v_bad is not null then raise exception 'Ô ① (TikTok) đang có link Facebook: %', v_bad; end if;
  select x into v_bad from unnest(v_fb) x where x ~* '^https?://([^/]*\.)?tiktok\.com' limit 1;
  if v_bad is not null then raise exception 'Ô ② (Facebook) đang có link TikTok: %', v_bad; end if;
  -- không dùng lại link đã nộp ở kỳ trước
  select x into v_bad from unnest(v_links || v_fb) x
  where exists (select 1 from public.tiktok_submissions t, unnest(t.tiktok_links || t.fb_links) y
                where t.staff_id = p_staff and lower(regexp_replace(split_part(y, '?', 1), '^https?://(www\.|m\.)?|/+$', '', 'g'))
                                             = lower(regexp_replace(split_part(x, '?', 1), '^https?://(www\.|m\.)?|/+$', '', 'g')))
  limit 1;
  if v_bad is not null then raise exception 'Link này đã nộp ở kỳ trước, hãy nộp link mới: %', v_bad; end if;

  v_start := coalesce(nullif(public.setting_text('TIKTOK_START_DATE', ''), '')::date, v_today);
  select d into v_target from public.tiktok_due_dates(v_start, v_today - 1) d
  where not exists (select 1 from public.tiktok_submissions t where t.staff_id = p_staff and t.due = d) order by d limit 1;
  if v_target is null then
    select d into v_target from public.tiktok_due_dates(greatest(v_start, v_today), greatest(v_start, v_today) + 10) d order by d limit 1;
  end if;
  if exists (select 1 from public.tiktok_submissions where staff_id = p_staff and due = v_target) then
    raise exception 'Đã nộp xong kỳ %. Chưa tới kỳ nộp tiếp theo!', to_char(v_target, 'DD/MM');
  end if;
  v_on := v_today <= v_target;
  insert into public.tiktok_submissions(staff_id, due, tiktok_links, fb_links, submit_date, submit_time, status, reward, created_by)
  values (p_staff, v_target, v_links, v_fb, v_today, public.vn_hm(), case when v_on then 'ĐÚNG HẠN' else 'TRỄ' end, case when v_on then v_reward else 0 end, m.email);
  insert into public.audit_log(actor, action, target, details) values (m.email, 'TIKTOK_SUBMIT', p_staff, jsonb_build_object('due', v_target, 'on_time', v_on));
  return jsonb_build_object('status', 'success', 'due', v_target, 'on_time', v_on,
    'message', case when v_on then format('Đã ghi nhận ĐÚNG HẠN kỳ %s: +%s⭐', to_char(v_target, 'DD/MM'), v_reward)
                    else format('Đã ghi nhận nộp TRỄ kỳ %s (không có thưởng)', to_char(v_target, 'DD/MM')) end);
end $$;

create or replace function public.tiktok_manage(p_action text, p_staff text, p_due date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._manager_scope(p_staff, null);
  if p_action = 'excuse' then
    if exists (select 1 from public.tiktok_submissions where staff_id = p_staff and due = p_due) then raise exception 'Kỳ này đã có bản ghi.'; end if;
    insert into public.tiktok_submissions(staff_id, due, status, reward, submit_date, submit_time, created_by)
    values (p_staff, p_due, 'MIỄN', 0, public.vn_today(), public.vn_hm(), m.email);
  elsif p_action = 'delete' then
    delete from public.tiktok_submissions where staff_id = p_staff and due = p_due;
  else raise exception 'Thao tác không hợp lệ.'; end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'TIKTOK_' || upper(p_action), p_staff, jsonb_build_object('due', p_due));
  return jsonb_build_object('status', 'success');
end $$;

-- ---------- Vệ sinh ----------
create or replace function public.clean_register(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_name text;
begin
  m := public._member_for_staff(p_staff);
  if p_date < public.vn_today() then raise exception 'Không thể đăng ký ngày đã qua.'; end if;
  select s.name into v_name from public.cleaning c join public.staff s on s.id = c.staff_id where c.clean_date = p_date and not s.hidden limit 1;
  if v_name is not null then raise exception 'Ngày % đã có % đăng ký (mỗi ngày 1 người).', to_char(p_date, 'DD/MM'), v_name; end if;
  insert into public.cleaning(clean_date, staff_id, reg_time, created_by) values (p_date, p_staff, public.vn_hm(), m.email);
  return jsonb_build_object('status', 'success', 'message', 'Đã đăng ký vệ sinh ngày ' || to_char(p_date, 'DD/MM'));
end $$;

create or replace function public.clean_report(p_date date, p_photos text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.cleaning;
begin
  select * into r from public.cleaning where clean_date = p_date order by id limit 1;
  if r.id is null then raise exception 'Ngày này chưa có ai đăng ký vệ sinh.'; end if;
  m := public._member_for_staff(r.staff_id);
  if p_date > public.vn_today() then raise exception 'Chưa tới ngày vệ sinh, chưa thể nộp ảnh.'; end if;
  if cardinality(r.photos) > 0 then raise exception 'Ngày này đã nộp ảnh. Cần sửa thì nhờ quản lý xoá ảnh cũ.'; end if;
  if cardinality(p_photos) <> 3 or exists (select 1 from unnest(p_photos) x where x !~ '^v2:clean/') then raise exception 'Cần đúng 3 ảnh vệ sinh.'; end if;
  update public.cleaning set photos = p_photos, report_date = public.vn_today(), report_time = public.vn_hm() where id = r.id;
  return jsonb_build_object('status', 'success', 'message', 'Đã nộp báo cáo vệ sinh ngày ' || to_char(p_date, 'DD/MM'));
end $$;

create or replace function public.clean_delete(p_date date, p_only_photos boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.cleaning;
begin
  select * into r from public.cleaning where clean_date = p_date order by id limit 1;
  if r.id is null then raise exception 'Không tìm thấy đăng ký.'; end if;
  m := public._manager_scope(r.staff_id, null);
  if p_only_photos then update public.cleaning set photos = '{}', report_date = null, report_time = null where id = r.id;
  else delete from public.cleaning where id = r.id; end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, case when p_only_photos then 'CLEAN_DELETE_PHOTOS' else 'CLEAN_DELETE' end, r.staff_id, jsonb_build_object('date', p_date));
  return jsonb_build_object('status', 'success', 'photos', to_jsonb(r.photos));
end $$;

-- ---------- Lịch bận / OFF ----------
create or replace function public.busy_register(p_staff text, p_date date, p_type text, p_shifts integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_n int; v_max int := public.setting_num('BUSY_MAX_WEEKDAY', 3)::int;
begin
  m := public._member_for_staff(p_staff);
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

create or replace function public.busy_delete(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._manager_scope(p_staff, null);
  delete from public.busy where staff_id = p_staff and busy_date = p_date;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'BUSY_DELETE', p_staff, jsonb_build_object('date', p_date));
  return jsonb_build_object('status', 'success');
end $$;

-- ---------- Roadshow ----------
create or replace function public.rs_valid_time(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t ~ '^\d{2}:(00|30)$' and ((t >= '06:00' and t <= '10:30') or (t >= '15:00' and t <= '18:00'))
$$;

create or replace function public.rs_register(p_staff text, p_date date, p_time text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._member_for_staff(p_staff);
  if not public.rs_valid_time(p_time) then raise exception 'Giờ không hợp lệ (sáng 6h–10h30, chiều 15h–18h, cách 30 phút).'; end if;
  if p_date < public.vn_today() then raise exception 'Không thể đăng ký ngày đã qua.'; end if;
  if p_date = public.vn_today() and p_time < public.vn_hm() then raise exception 'Khung giờ % hôm nay đã qua.', p_time; end if;
  if exists (select 1 from public.roadshow where rs_date = p_date and staff_id = p_staff and rs_time = p_time) then raise exception 'Đã đăng ký khung giờ này rồi.'; end if;
  insert into public.roadshow(rs_date, staff_id, rs_time, reg_time, source, created_by) values (p_date, p_staff, p_time, public.vn_hm(), 'NV', m.email);
  return jsonb_build_object('status', 'success', 'message', format('Đã đăng ký Roadshow %s ngày %s', p_time, to_char(p_date, 'DD/MM')));
end $$;

create or replace function public.rs_assign(p_date date, p_time text, p_staffs text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; s text; n int := 0; skipped int := 0;
begin
  m := public._manager_scope(null, null);
  if not public.rs_valid_time(p_time) then raise exception 'Giờ không hợp lệ.'; end if;
  foreach s in array coalesce(p_staffs, '{}') loop
    if not public.can_see_staff(s) then continue; end if;
    if exists (select 1 from public.roadshow where rs_date = p_date and staff_id = s and rs_time = p_time) then skipped := skipped + 1; continue; end if;
    insert into public.roadshow(rs_date, staff_id, rs_time, reg_time, source, created_by) values (p_date, s, p_time, public.vn_hm(), 'QL', m.email);
    n := n + 1;
  end loop;
  return jsonb_build_object('status', 'success', 'message', format('Đã xếp lịch %s người%s', n, case when skipped > 0 then format(' (%s người đã có sẵn)', skipped) else '' end));
end $$;

create or replace function public.rs_report(p_staff text, p_date date, p_time text, p_km numeric, p_minutes numeric, p_photos text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.roadshow;
begin
  m := public._member_for_staff(p_staff);
  select * into r from public.roadshow where rs_date = p_date and staff_id = p_staff and rs_time = p_time;
  if r.id is null then raise exception 'Chưa đăng ký Roadshow khung giờ này.'; end if;
  if p_date > public.vn_today() or (p_date = public.vn_today() and r.rs_time > public.vn_hm()) then raise exception 'Chưa tới giờ chạy, chưa thể nộp báo cáo.'; end if;
  if cardinality(r.photos) >= 3 then raise exception 'Lượt này đã nộp báo cáo. Cần sửa thì nhờ quản lý xoá ảnh.'; end if;
  if coalesce(p_km, 0) < public.setting_num('RS_MIN_KM', 5) then raise exception 'Quãng đường tối thiểu % km.', public.setting_num('RS_MIN_KM', 5); end if;
  if coalesce(p_minutes, 0) < public.setting_num('RS_MIN_MIN', 30) then raise exception 'Thời gian chạy tối thiểu % phút.', public.setting_num('RS_MIN_MIN', 30); end if;
  if cardinality(p_photos) not between 3 and 6 or exists (select 1 from unnest(p_photos) x where x !~ '^v2:rs/') then raise exception 'Cần 3–6 ảnh.'; end if;
  update public.roadshow set photos = p_photos, km = p_km, minutes = p_minutes, report_date = public.vn_today(), report_time = public.vn_hm() where id = r.id;
  return jsonb_build_object('status', 'success', 'message', format('Đã nộp báo cáo Roadshow %s ngày %s', p_time, to_char(p_date, 'DD/MM')));
end $$;

create or replace function public.rs_delete(p_staff text, p_date date, p_time text, p_only_photos boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.roadshow;
begin
  m := public._manager_scope(p_staff, null);
  select * into r from public.roadshow where rs_date = p_date and staff_id = p_staff and rs_time = p_time;
  if r.id is null then raise exception 'Không tìm thấy lượt Roadshow.'; end if;
  if p_only_photos then update public.roadshow set photos = '{}', km = null, minutes = null, report_date = null, report_time = null where id = r.id;
  else delete from public.roadshow where id = r.id; end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, case when p_only_photos then 'RS_DELETE_PHOTOS' else 'RS_DELETE' end, p_staff, jsonb_build_object('date', p_date, 'time', p_time));
  return jsonb_build_object('status', 'success', 'photos', to_jsonb(r.photos));
end $$;

grant execute on function public.tiktok_submit(text, text[], text[]), public.tiktok_manage(text, text, date),
  public.clean_register(text, date), public.clean_report(date, text[]), public.clean_delete(date, boolean),
  public.busy_register(text, date, text, integer[]), public.busy_delete(text, date),
  public.rs_register(text, date, text), public.rs_assign(date, text, text[]), public.rs_report(text, date, text, numeric, numeric, text[]),
  public.rs_delete(text, date, text, boolean) to authenticated;
revoke execute on function public._member_for_staff(text) from public, anon, authenticated;

-- Realtime cho các bảng module
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tiktok_submissions','cleaning','busy','roadshow','staff_targets'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
