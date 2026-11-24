-- D19: 🗓️ Lịch làm việc PG theo tuần (chủ quản chốt 24/11/2026)
--  • PG (bộ phận trong PG_DEPTS) điền lịch TUẦN SAU (T2–CN) trong trang Báo cáo, hạn trước 22:00 thứ 7; quá hạn vẫn sửa được nhưng ghi trễ
--  • mỗi ngày: OFF hoặc nhiều khung giờ trong 07:30–22:00 (không bắt buộc ca liền)
--  • đưa vào lịch ca của tool (shifts): ca nào trùng khung giờ ≥ 30 phút thì tính có ca → giao việc theo ca, nhắc vào ca như NV khác

insert into public.settings(key, value) values ('PG_WEEK_FROM', '"07:30"'::jsonb), ('PG_WEEK_TO', '"22:00"'::jsonb) on conflict (key) do nothing;

create table if not exists public.pg_schedule (
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  d date not null,
  off boolean not null default false,
  ranges jsonb not null default '[]'::jsonb,          -- [["07:30","11:00"],["17:00","22:00"]]
  late boolean not null default false,                -- lưu sau hạn (22:00 thứ 7 tuần trước)
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (staff_id, d)
);
alter table public.pg_schedule enable row level security;
drop policy if exists pg_schedule_read on public.pg_schedule;
create policy pg_schedule_read on public.pg_schedule for select to authenticated using (public.can_see_staff(staff_id));
revoke all on public.pg_schedule from anon;
revoke insert, update, delete on public.pg_schedule from authenticated;
grant select on public.pg_schedule to authenticated;

create or replace function public._hm_min(p text) returns integer
language sql immutable set search_path = '' as $$
  select case when p ~ '^([01]?\d|2[0-3]):[0-5]\d$' then split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int else null end
$$;

-- p_week = thứ 2 của tuần; p_days = [{d, off, ranges:[[from,to],...]}] (7 ngày)
create or replace function public.pg_week_save(p_staff text, p_week date, p_days jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; v_from int; v_to int; dy jsonb; v_d date; v_off boolean; v_r jsonb; rg jsonb; a int; b int; v_prev int;
  v_slots int[]; v_hours numeric; v_late boolean; sl text; i int; s0 int; s1 int; n int := 0; v_dead timestamptz;
begin
  m := public._require_member();
  if m.role = 'employee' and m.staff_id is distinct from p_staff then raise exception 'Chỉ điền được lịch của chính mình.'; end if;
  if not public.can_see_staff(p_staff) then raise exception 'Không tìm thấy nhân viên.'; end if;
  if extract(isodow from p_week) <> 1 then raise exception 'Tuần phải bắt đầu từ thứ 2.'; end if;
  if p_week < public.vn_today() - 6 or p_week > public.vn_today() + 21 then raise exception 'Chỉ điền lịch tuần này hoặc 3 tuần tới.'; end if;
  v_from := public._hm_min(coalesce((select value #>> '{}' from public.settings where key = 'PG_WEEK_FROM'), '07:30'));
  v_to := public._hm_min(coalesce((select value #>> '{}' from public.settings where key = 'PG_WEEK_TO'), '22:00'));
  v_dead := ((p_week - 2)::timestamp + time '22:00') at time zone 'Asia/Ho_Chi_Minh';   -- 22:00 thứ 7 tuần trước
  v_late := m.role = 'employee' and now() > v_dead;
  if jsonb_typeof(p_days) <> 'array' then raise exception 'Dữ liệu lịch không hợp lệ.'; end if;
  for dy in select * from jsonb_array_elements(p_days) loop
    v_d := (dy ->> 'd')::date;
    if v_d < p_week or v_d > p_week + 6 then raise exception 'Ngày % không thuộc tuần.', v_d; end if;
    v_off := coalesce((dy ->> 'off')::boolean, false);
    v_r := '[]'::jsonb; v_slots := '{}'; v_hours := 0; v_prev := -1;
    if not v_off then
      for rg in select x from jsonb_array_elements(coalesce(dy -> 'ranges', '[]'::jsonb)) x order by public._hm_min(x ->> 0) loop
        a := public._hm_min(rg ->> 0); b := public._hm_min(rg ->> 1);
        if a is null or b is null or b <= a then raise exception 'Khung giờ % – % ngày % không hợp lệ.', rg ->> 0, rg ->> 1, to_char(v_d, 'DD/MM'); end if;
        if a < v_from or b > v_to then raise exception 'Giờ làm phải trong % – % (ngày %).', to_char(make_time(v_from / 60, v_from % 60, 0), 'HH24:MI'), to_char(make_time(v_to / 60, v_to % 60, 0), 'HH24:MI'), to_char(v_d, 'DD/MM'); end if;
        if a < v_prev then raise exception 'Các khung giờ ngày % bị chồng nhau.', to_char(v_d, 'DD/MM'); end if;
        v_prev := b; v_hours := v_hours + (b - a) / 60.0;
        v_r := v_r || jsonb_build_array(jsonb_build_array(rg ->> 0, rg ->> 1));
      end loop;
      if jsonb_array_length(v_r) = 0 then v_off := true; end if;
    end if;
    -- ca của tool: ca trùng các khung giờ ≥ 30 phút
    i := 0;
    for sl in select jsonb_array_elements_text(coalesce((select value from public.settings where key = 'SHIFT_SLOTS'), '[]'::jsonb)) loop
      i := i + 1;
      s0 := public._hm_min(split_part(sl, '-', 1)); s1 := public._hm_min(split_part(sl, '-', 2));
      if s0 is not null and s1 is not null and not v_off and (
        select coalesce(sum(greatest(0, least(s1, public._hm_min(x ->> 1)) - greatest(s0, public._hm_min(x ->> 0)))), 0) from jsonb_array_elements(v_r) x) >= least(30, s1 - s0) then
        v_slots := v_slots || i;
      end if;
    end loop;
    insert into public.pg_schedule(staff_id, d, off, ranges, late, updated_at, updated_by)
    values (p_staff, v_d, v_off, v_r, v_late, now(), m.email)
    on conflict (staff_id, d) do update set off = excluded.off, ranges = excluded.ranges, late = public.pg_schedule.late or excluded.late, updated_at = now(), updated_by = excluded.updated_by;
    insert into public.shifts(staff_id, d, slots, hours, source, pos, private, updated_at)
    values (p_staff, v_d, v_slots, round(v_hours, 2), 'pg-tuan', 'PG', false, now())
    on conflict (staff_id, d) do update set slots = excluded.slots, hours = excluded.hours, source = excluded.source, pos = excluded.pos, private = false, updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('status', 'success', 'n', n, 'late', v_late,
    'message', 'Đã lưu lịch tuần ' || to_char(p_week, 'DD/MM') || ' – ' || to_char(p_week + 6, 'DD/MM') || case when v_late then ' (sau hạn 22:00 thứ 7 — đã ghi trễ)' else '' end);
end $$;

revoke execute on function public.pg_week_save(text, date, jsonb) from public, anon;
grant execute on function public.pg_week_save(text, date, jsonb) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pg_schedule') then
    alter publication supabase_realtime add table public.pg_schedule;
  end if;
end $$;
