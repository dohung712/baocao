-- D12d Lịch ca + Lịch bận nối với nhau (23/11/2026, theo bảng "Quản lý phân ca" HRM thực tế):
--   • 6 ca: 07:30–09:00 · 09:00–12:00 · 12:00–15:00 · 15:00–18:00 · 18:00–21:00 · 21:00–22:00 (đã khớp HRM, ghi lại cho chắc)
--   • Lưu bộ phận trong file (pos). NV xem được ca của NV khác, KHÔNG xem ca của Quản lý / Trưởng ca (SHIFT_PRIVATE_POS); QL xem hết
--   • Đăng ký bận / OFF mới (busy_set): NV tự sửa / xoá đăng ký của mình trước hạn; bận theo đúng Ca 1–6
--   • Đối chiếu: lưu lịch ca → so với lịch bận → trả danh sách xếp nhầm (OFF mà có ca, bận ca X mà bị xếp ca X)
insert into public.settings(key, value) values
  ('SHIFT_SLOTS', '["07:30-09:00", "09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-21:00", "21:00-22:00"]'::jsonb),
  ('SHIFT_PRIVATE_POS', '["Quản Lý", "Trưởng Ca"]'::jsonb)
on conflict (key) do nothing;
update public.settings set value = '["07:30-09:00", "09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-21:00", "21:00-22:00"]'::jsonb, updated_at = now() where key = 'SHIFT_SLOTS';

alter table public.shifts add column if not exists pos text not null default '';
alter table public.shifts add column if not exists private boolean not null default false;

-- Bộ phận trong file thuộc nhóm không cho NV xem (chứa "Quản Lý" / "Trưởng Ca", không phân biệt hoa thường)
create or replace function public._shift_private(p_pos text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements_text(coalesce((select value from public.settings where key = 'SHIFT_PRIVATE_POS'), '[]'::jsonb)) k
                 where k <> '' and lower(coalesce(p_pos, '')) like '%' || lower(k) || '%');
$$;

drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts for select to authenticated
  using (public.is_member() and (public.is_manager() or not private or staff_id = (public.app_member()).staff_id));

-- Đối chiếu lịch ca với lịch bận trong khoảng ngày: kind = off (đăng ký OFF mà có ca) · ban (bận ca X mà bị xếp ca X) · ban_unknown (bận chưa ghi ca, đang có ca)
create or replace function public._shift_conflicts(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('staff_id', s.staff_id, 'name', st.name, 'd', s.d, 'slots', to_jsonb(s.slots), 'busy', to_jsonb(b.shifts),
           'kind', case when b.type = 'OFF' then 'off' when cardinality(b.shifts) = 0 then 'ban_unknown' else 'ban' end,
           'overlap', to_jsonb(array(select x from unnest(s.slots) x where b.type = 'OFF' or x = any(b.shifts) order by x)))
         order by s.d, st.name), '[]'::jsonb)
  from public.shifts s
  join public.busy b on b.staff_id = s.staff_id and b.busy_date = s.d
  join public.staff st on st.id = s.staff_id and not st.hidden
  where s.d between p_from and p_to and cardinality(s.slots) > 0
    and (b.type = 'OFF' or cardinality(b.shifts) = 0 or s.slots && b.shifts);
$$;

-- Cho trang Lịch bận / Lịch ca: QL thấy mọi người trong phạm vi, NV thấy của chính mình
create or replace function public.shift_conflicts(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if p_to - p_from > 62 then raise exception 'Khoảng ngày tối đa 2 tháng.'; end if;
  return coalesce((select jsonb_agg(e) from jsonb_array_elements(public._shift_conflicts(p_from, p_to)) e where public.can_see_staff(e ->> 'staff_id')), '[]'::jsonb);
end $$;

-- Lưu lịch ca: thêm bộ phận (pos) + private; trả kèm danh sách xếp nhầm so với lịch bận
create or replace function public._shift_save(p_rows jsonb, p_source text, p_actor text, p_file jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_from date; v_to date; n int := 0; v_conf jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'File không có dòng lịch ca nào.'; end if;
  select min((x ->> 'd')::date), max((x ->> 'd')::date) into v_from, v_to from jsonb_array_elements(p_rows) x;
  if v_from is null or v_to - v_from > 40 then raise exception 'Khoảng ngày trong file không hợp lệ.'; end if;
  delete from public.shifts s where s.d between v_from and v_to
     and s.staff_id in (select distinct x ->> 'staff_id' from jsonb_array_elements(p_rows) x);
  insert into public.shifts(staff_id, d, slots, hours, source, pos, private)
  select distinct on (x ->> 'staff_id', (x ->> 'd')::date) x ->> 'staff_id', (x ->> 'd')::date,
         coalesce(array(select distinct e::int from jsonb_array_elements_text(coalesce(x -> 'slots', '[]'::jsonb)) e where e ~ '^[1-9]$' order by 1), '{}'),
         coalesce(nullif(x ->> 'hours', '')::numeric, 0), left(coalesce(p_source, ''), 200),
         left(coalesce(x ->> 'pos', ''), 100), public._shift_private(x ->> 'pos')
    from jsonb_array_elements(p_rows) x
   where exists (select 1 from public.staff s where s.id = x ->> 'staff_id')
  on conflict (staff_id, d) do update set slots = excluded.slots, hours = excluded.hours, source = excluded.source, pos = excluded.pos, private = excluded.private, updated_at = now();
  get diagnostics n = row_count;
  v_conf := public._shift_conflicts(v_from, v_to);
  insert into public.settings(key, value, updated_by)
  values ('SHIFT_LAST', jsonb_build_object('source', left(coalesce(p_source, ''), 200), 'from', v_from, 'to', v_to, 'n', n, 'at', now(), 'by', p_actor,
                                           'file_id', coalesce(p_file ->> 'id', ''), 'updated', coalesce(p_file ->> 'updated', ''),
                                           'unmatched', coalesce(nullif(p_file ->> 'unmatched', '')::int, 0), 'conflicts', jsonb_array_length(v_conf)), p_actor)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('status', 'success', 'n', n, 'from', v_from, 'to', v_to, 'conflicts', v_conf,
    'message', format('Đã lưu lịch ca %s – %s (%s dòng)', to_char(v_from, 'DD/MM'), to_char(v_to, 'DD/MM'), n)
      || case when jsonb_array_length(v_conf) > 0 then format(' · ⚠️ %s chỗ xếp ca trùng lịch bận / OFF', jsonb_array_length(v_conf)) else ' · ✅ không trùng lịch bận' end);
end $$;

-- Đăng ký bận / OFF (thay busy_register cho giao diện mới): p_type = 'OFF' | 'BAN' | 'NONE' (xoá)
--   NV: chỉ cho mình, trước hạn (busy_deadline), ngày thường tối đa BUSY_MAX_WEEKDAY người; sửa / xoá được đăng ký của mình trước hạn
--   QL: đăng ký / sửa / xoá hộ trong phạm vi, không vướng hạn và giới hạn người
create or replace function public.busy_set(p_staff text, p_date date, p_type text, p_shifts integer[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_n int; v_max int := public.setting_num('BUSY_MAX_WEEKDAY', 3)::int; v_dl timestamptz; v_old public.busy; v_sh int[];
begin
  m := public._member_for_staff(p_staff);
  if p_type not in ('OFF', 'BAN', 'NONE') then raise exception 'Loại không hợp lệ.'; end if;
  if m.role = 'employee' then
    if p_date < public.vn_today() then raise exception 'Không sửa được ngày đã qua.'; end if;
    if public.setting_text('BUSY_LOCK_ENABLED', 'true') = 'true' then
      v_dl := public.busy_deadline(p_date);
      if now() > v_dl then
        raise exception 'Đã quá hạn đăng ký bận/OFF cho tuần % (hạn % thứ 6 %). Liên hệ quản lý để đăng ký hộ.',
          to_char(date_trunc('week', p_date), 'DD/MM'), public.setting_text('BUSY_DEADLINE_HM', '22:00'), to_char(v_dl at time zone 'Asia/Ho_Chi_Minh', 'DD/MM');
      end if;
    end if;
  end if;
  select * into v_old from public.busy where staff_id = p_staff and busy_date = p_date;
  if p_type = 'NONE' then
    delete from public.busy where staff_id = p_staff and busy_date = p_date;
    return jsonb_build_object('status', 'success', 'message', 'Đã bỏ đăng ký ngày ' || to_char(p_date, 'DD/MM'));
  end if;
  v_sh := case when p_type = 'OFF' then '{}' else array(select distinct x from unnest(coalesce(p_shifts, '{}')) x where x between 1 and 6 order by x) end;
  if v_old.id is null and m.role = 'employee' then
    select count(*) into v_n from public.busy b join public.staff s on s.id = b.staff_id where b.busy_date = p_date and not s.hidden;
    if extract(isodow from p_date) <= 5 and v_n >= v_max then
      return jsonb_build_object('status', 'full', 'message', format('Ngày %s đã đủ %s người đăng ký — liên hệ quản lý.', to_char(p_date, 'DD/MM'), v_max));
    end if;
  end if;
  insert into public.busy(busy_date, staff_id, type, shifts, created_by) values (p_date, p_staff, p_type, v_sh, m.email)
  on conflict (busy_date, staff_id) do update set type = excluded.type, shifts = excluded.shifts, created_by = excluded.created_by;
  return jsonb_build_object('status', 'success', 'message',
    'Đã lưu ' || case when p_type = 'OFF' then 'OFF' else 'bận' || case when cardinality(v_sh) > 0 then ' ca ' || array_to_string(v_sh, ', ') else '' end end || ' ngày ' || to_char(p_date, 'DD/MM'));
end $$;

-- Lịch ca đã đọc trước đây chưa có bộ phận → lượt tự động kế tiếp đọc lại file mới nhất trong Drive (điền pos / private)
update public.settings set value = (value - 'updated') - 'file_id', updated_at = now() where key = 'SHIFT_LAST' and jsonb_typeof(value) = 'object';

revoke execute on function public._shift_private(text), public._shift_conflicts(date, date), public._shift_save(jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public._shift_conflicts(date, date), public._shift_save(jsonb, text, text, jsonb) to service_role;
revoke execute on function public.shift_conflicts(date, date), public.busy_set(text, date, text, integer[]) from public, anon;
grant execute on function public.shift_conflicts(date, date), public.busy_set(text, date, text, integer[]) to authenticated;
