-- D13 Việc lặp lại từ trang tính (23/11/2026, chủ quản chọn):
--   Trang tính "Cv …" (cài đặt RT_SHEET_ID, QL dán link ở Giao việc → 🔁 Lặp lại) → Edge Function đọc qua Apps Script bản 4 → hiểu từng dòng
--   (siêu thị, ngày, ca, giờ, giao cho ai, báo cáo bằng gì, nhóm việc, Telegram) → bảng job_templates.
--   Mỗi lượt (5 phút) rt_generate(hôm nay) tự giao việc theo lịch ca:
--     • "nhân sự trong ca"  → CẢ CA nhận, 1 người nộp là xong cho cả ca (group_key, group_staff)
--     • "All nhân sự"        → từng người tự nộp (có / không cần ca tuỳ dòng)
--     • "Theo lịch đăng ký"  → người đăng ký lịch vệ sinh ngày đó
--   Nhắc bằng thông báo đẩy (đích danh): vào ca, trước hạn 1 giờ, trước hạn 5 phút, quá hạn cứ 15 phút — không nhắc sau 22:15.
--   Trễ / bỏ lỡ: chỉ ghi nhận + báo Telegram, KHÔNG trừ sao. TikTok + vệ sinh theo lịch đăng ký chuyển sang Bảng việc (tắt sao TikTok cũ).
alter table public.jobs add column if not exists template_id bigint;
alter table public.jobs add column if not exists group_key text;
alter table public.jobs add column if not exists group_staff text[] not null default '{}';
alter table public.jobs add column if not exists done_staff text;          -- mã NV đã nộp (việc của cả ca: người nộp thay cả ca)
alter table public.jobs add column if not exists links text[] not null default '{}';
alter table public.jobs add column if not exists links_min integer not null default 0;
alter table public.jobs add column if not exists start_at timestamptz;     -- bắt đầu được làm (vd báo cáo từ 8h00)
alter table public.jobs add column if not exists remind5_at timestamptz;   -- đã nhắc trước hạn 5 phút
alter table public.jobs add column if not exists nag_at timestamptz;       -- lần nhắc quá hạn gần nhất (15 phút / lần)
create unique index if not exists jobs_tpl_uniq on public.jobs(template_id, staff_id, due_at) where template_id is not null;
create index if not exists jobs_group_idx on public.jobs(group_key) where group_key is not null;

create table if not exists public.job_templates (
  id bigint generated always as identity primary key,
  key text not null unique,                 -- tên việc đã chuẩn hoá (đổi tên trong trang tính = việc mới)
  row_no integer not null default 0,
  title text not null,
  rule jsonb not null default '{}'::jsonb,  -- cách tool hiểu dòng: stores, days, who, kind, times, shift_end, photo_min, links_min…
  raw jsonb not null default '{}'::jsonb,   -- nguyên văn các cột trong trang tính
  type_id bigint references public.job_types(id) on delete set null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.job_templates enable row level security;
drop policy if exists job_templates_read on public.job_templates;
create policy job_templates_read on public.job_templates for select to authenticated using (public.is_member());
grant select on public.job_templates to authenticated;
revoke insert, update, delete on public.job_templates from authenticated;
revoke all on public.job_templates from anon;

create table if not exists public.job_nudges (   -- đã nhắc "vào ca" (mỗi NV mỗi ngày 1 lần)
  staff_id text not null, d date not null, kind text not null, at timestamptz not null default now(),
  primary key (staff_id, d, kind)
);
alter table public.job_nudges enable row level security;
revoke all on public.job_nudges from anon, authenticated;

insert into public.settings(key, value) values
  ('RT_NAG_UNTIL', '"22:15"'::jsonb), ('RT_NAG_EVERY_MIN', '15'::jsonb), ('RT_REMIND_SOON_MIN', '5'::jsonb)
on conflict (key) do nothing;
-- TikTok chuyển sang Bảng việc: tắt cộng / trừ sao TikTok trong báo cáo ngày (TIKTOK_START_DATE rỗng = tắt)
update public.settings set value = '""'::jsonb, updated_at = now() where key = 'TIKTOK_START_DATE';
-- Tin Telegram công việc trong ngày gửi sau giờ ngừng nhắc (22:15) → 22:20; tắt tin TikTok + vệ sinh cuối ngày kiểu cũ
update public.settings
   set value = (select jsonb_agg(case when e ->> 'id' = 'jobday' then e || '{"time": "22:20"}'::jsonb
                                       when e ->> 'id' in ('tiktok', 'clean') then e || '{"on": false}'::jsonb else e end) from jsonb_array_elements(value) e),
       updated_at = now()
 where key = 'NOTIFY_ITEMS' and jsonb_typeof(value) = 'array' and jsonb_array_length(value) > 0;

-- Bộ phận NV → mã siêu thị trong trang tính: TGDD | TOPZONE | PG
create or replace function public._rt_store(p_dept text) returns text
language sql immutable set search_path = '' as $$
  select case when x like '%TGD%' then 'TGDD' when x like '%TOPZONE%' or x like '%AAR%' then 'TOPZONE' when x like 'PG%' then 'PG' else x end
  from (select upper(translate(coalesce(p_dept, ''), 'đĐ ', 'dD')) x) t;
$$;
-- Giờ "HH:MM" của ca i (SHIFT_SLOTS "07:30-09:00"): đầu / cuối
create or replace function public._rt_slot_hm(p_slot int, p_end boolean) returns text
language sql stable security definer set search_path = '' as $$
  select split_part((select value ->> (p_slot - 1) from public.settings where key = 'SHIFT_SLOTS'), '-', case when p_end then 2 else 1 end);
$$;
-- Ca chứa giờ hm (đầu ≤ hm < cuối; đúng giờ kết thúc ca cuối → ca cuối)
create or replace function public._rt_slot_at(p_hm text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select i from generate_series(1, 6) i where public._rt_slot_hm(i, false) <> '' and p_hm::time >= public._rt_slot_hm(i, false)::time and p_hm::time < public._rt_slot_hm(i, true)::time limit 1),
    (select i from generate_series(1, 6) i where public._rt_slot_hm(i, true) <> '' and p_hm::time = public._rt_slot_hm(i, true)::time order by i desc limit 1));
$$;

-- Lưu các dòng đã hiểu từ trang tính (Edge Function): p_rows [{key,row,title,rule,raw,type}] — dòng không còn trong trang tính → tắt
create or replace function public._rt_save_templates(p_rows jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_type bigint; n int := 0; v_off int;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Dữ liệu không hợp lệ.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_type := null;
    if coalesce(r ->> 'type', '') <> '' then
      insert into public.job_types(name, icon, sort, tg) values (left(r ->> 'type', 60), coalesce(nullif(r ->> 'icon', ''), '🔁'), 20, coalesce((r -> 'rule' ->> 'tg')::boolean, true))
      on conflict (name) do update set tg = excluded.tg, active = true;
      select id into v_type from public.job_types where name = left(r ->> 'type', 60);
    end if;
    insert into public.job_templates(key, row_no, title, rule, raw, type_id, active, updated_at)
    values (r ->> 'key', coalesce((r ->> 'row')::int, 0), left(r ->> 'title', 200), coalesce(r -> 'rule', '{}'::jsonb), coalesce(r -> 'raw', '{}'::jsonb), v_type, true, now())
    on conflict (key) do update set row_no = excluded.row_no, title = excluded.title, rule = excluded.rule, raw = excluded.raw, type_id = excluded.type_id, active = true, updated_at = now();
    n := n + 1;
  end loop;
  update public.job_templates set active = false, updated_at = now()
   where active and key not in (select x ->> 'key' from jsonb_array_elements(p_rows) x);
  get diagnostics v_off = row_count;
  insert into public.settings(key, value, updated_by) values ('RT_LAST', jsonb_build_object('at', now(), 'by', p_actor, 'n', n, 'off', v_off), p_actor)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('status', 'success', 'n', n, 'off', v_off);
end $$;

-- Tự giao việc lặp lại cho ngày p_date (và vài ngày tới với việc "báo cáo trước được") theo lịch ca. Chạy lại nhiều lần không sao:
--   thêm người mới vào ca, bỏ việc chưa làm của người không còn trong ca, cập nhật danh sách cả ca (group_staff).
create or replace function public.rt_generate(p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d0 date := coalesce(p_date, public.vn_today()); t public.job_templates; r jsonb; dd date; tm jsonb; st record;
  v_due timestamptz; v_start timestamptz; v_hm text; v_slot int; v_ok boolean; v_gk text; v_keys text[] := '{}'; v_groups text[] := '{}';
  n_new int := 0; n_del int := 0; v_detail text; v_stores text[]; v_who text; v_kind text; v_id bigint; v_isnew boolean;
begin
  for t in select * from public.job_templates where active order by row_no loop
    r := t.rule; v_who := coalesce(r ->> 'who', 'at'); v_kind := coalesce(r ->> 'kind', 'group');
    v_stores := array(select jsonb_array_elements_text(coalesce(r -> 'stores', '[]'::jsonb)));
    v_detail := coalesce(r ->> 'detail', '');
    for dd in select generate_series(d0, d0 + coalesce((r ->> 'early_days')::int, 0), interval '1 day')::date loop
      if jsonb_typeof(r -> 'days') = 'array' and not ((r -> 'days') @> to_jsonb(extract(dow from dd)::int)) then continue; end if;
      for tm in select * from jsonb_array_elements(coalesce(r -> 'times', '[]'::jsonb)) loop
        v_hm := tm ->> 'hm';
        v_slot := case when v_who = 'slots' then (tm ->> 'slot')::int when v_who = 'at' and v_hm is not null then public._rt_slot_at(v_hm) end;
        for st in
          select s.id, s.dept, public._rt_store(s.dept) store, sh.slots, sh.staff_id is not null has_row,
                 exists (select 1 from public.shifts x where x.staff_id = s.id and x.d between dd - 6 and dd + 6) has_any
            from public.staff s left join public.shifts sh on sh.staff_id = s.id and sh.d = dd
           where not s.hidden and public._rt_store(s.dept) = any(v_stores)
        loop
          v_ok := case
            when v_who in ('slots', 'at') then v_slot is not null and coalesce(st.slots, '{}') @> array[v_slot]
            when v_who = 'cleaning' then exists (select 1 from public.cleaning c where c.staff_id = st.id and c.clean_date = dd)
            when v_who = 'all' then not coalesce((r ->> 'need_shift')::boolean, false) or cardinality(coalesce(st.slots, '{}')) > 0 or (not st.has_row and not st.has_any)
            else false end;
          continue when not v_ok;
          -- hạn: "trước khi hết ca x phút" → giờ hết ca của NV − x; không có ca → giờ dự phòng
          if r -> 'shift_end' is not null and jsonb_typeof(r -> 'shift_end') = 'object' then
            v_due := case when cardinality(coalesce(st.slots, '{}')) > 0
                          then public._vn_ts(dd, public._rt_slot_hm((select max(x) from unnest(st.slots) x), true)) - ((r -> 'shift_end' ->> 'minus')::int * interval '1 minute')
                          else public._vn_ts(dd, coalesce(r -> 'shift_end' ->> 'fallback', '17:00')) end;
          else
            continue when v_hm is null;
            v_due := public._vn_ts(dd, v_hm);
          end if;
          v_start := case when tm ->> 'start' is not null then public._vn_ts(dd, tm ->> 'start') end;
          -- hạn đã qua lúc giao (vd lần đầu chạy giữa ngày, NV được xếp ca muộn): không tạo việc mới — tránh nhắc "quá hạn" hàng loạt
          if v_due <= now() then v_keys := v_keys || format('%s|%s|%s', t.id, st.id, v_due); continue; end if;
          v_id := null; v_isnew := false;
          v_gk := case when v_kind = 'group' then format('%s|%s|%s|%s', t.id, dd, to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'), st.store) end;
          insert into public.jobs(type_id, title, detail, staff_id, due_at, proof, photo_min, photo_max, pen_late, pen_miss, template_id, group_key,
                                  links_min, start_at, pushed_at, created_by)
          values (t.type_id, t.title, v_detail, st.id, v_due,
                  case when coalesce((r ->> 'links_min')::int, 0) > 0 and coalesce((r ->> 'photo_min')::int, 0) = 0 then 'none' else 'photo' end,
                  least(10, greatest(0, coalesce((r ->> 'photo_min')::int, 1))), least(10, greatest(1, coalesce((r ->> 'photo_max')::int, 6))), 0, 0, t.id, v_gk,
                  greatest(0, coalesce((r ->> 'links_min')::int, 0)), v_start, now(), 'lap-lai')
          on conflict (template_id, staff_id, due_at) where template_id is not null do update set title = excluded.title, detail = excluded.detail, group_key = excluded.group_key,
                  links_min = excluded.links_min, start_at = excluded.start_at, type_id = excluded.type_id
            where public.jobs.status = 'todo'
          returning id, (xmax = 0) into v_id, v_isnew;
          if v_id is not null and v_isnew then n_new := n_new + 1; end if;
          v_keys := v_keys || format('%s|%s|%s', t.id, st.id, v_due);
          if v_gk is not null then v_groups := v_groups || v_gk; end if;
        end loop;
      end loop;
    end loop;
  end loop;
  -- Bỏ việc lặp lại chưa làm của người không còn đúng điều kiện (đổi ca, huỷ đăng ký, tắt dòng trong trang tính)
  delete from public.jobs j
   where j.template_id is not null and j.created_by = 'lap-lai' and j.status = 'todo' and jsonb_array_length(j.photos) = 0
     and (j.due_at at time zone 'Asia/Ho_Chi_Minh')::date between d0 and d0 + 7
     and not (format('%s|%s|%s', j.template_id, j.staff_id, j.due_at) = any(v_keys));
  get diagnostics n_del = row_count;
  -- Danh sách cả ca của mỗi việc nhóm
  update public.jobs j set group_staff = g.ids
    from (select group_key, array_agg(staff_id order by staff_id) ids from public.jobs where group_key = any(v_groups) group by group_key) g
   where j.group_key = g.group_key and j.group_staff is distinct from g.ids;
  return jsonb_build_object('status', 'success', 'new', n_new, 'removed', n_del, 'date', d0);
end $$;

-- Nộp việc (thêm link + việc của cả ca: 1 người nộp → cả ca xong). Bản 4 tham số cũ vẫn dùng được.
create or replace function public.job_submit(p_id bigint, p_photos jsonb, p_checks integer[], p_note text, p_links text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs; v_late int; v_pen int := 0; v_n int; v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_links text[] := array(select btrim(x) from unnest(coalesce(p_links, '{}')) x where btrim(x) ~* '^https?://\S+$'); v_name text; v_sib int := 0;
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
  if j.links_min > 0 and cardinality(v_links) < j.links_min then raise exception 'Cần ít nhất % link (bắt đầu bằng http).', j.links_min; end if;
  if j.proof = 'check' and (select count(distinct x) from unnest(coalesce(p_checks, '{}'::int[])) x where x between 0 and cardinality(j.checklist) - 1) < cardinality(j.checklist) then
    raise exception 'Tick đủ các mục trong checklist.';
  end if;
  if j.status = 'done' then   -- nộp bổ sung: thay ảnh / link / ghi chú, giữ giờ nộp
    update public.jobs set photos = v_photos, links = v_links, checks = coalesce(p_checks, '{}'), note = left(coalesce(p_note, ''), 1000),
           done_staff = coalesce(done_staff, j.staff_id), updated_at = now() where id = p_id;
    return jsonb_build_object('status', 'success', 'message', 'Đã cập nhật');
  end if;
  v_late := greatest(0, floor(extract(epoch from (now() - j.due_at)) / 60))::int;
  if v_late > 0 and j.pen_late > 0 then
    v_pen := j.pen_late;
    perform public._job_star(j.staff_id, -v_pen, format('Việc nộp trễ %s: %s', public._mins_txt(v_late), j.title), j.id, 'he-thong');
  end if;
  update public.jobs set status = 'done', done_at = now(), done_by = m.email, done_staff = j.staff_id, photos = v_photos, links = v_links, checks = coalesce(p_checks, '{}'),
         note = left(coalesce(p_note, ''), 1000), late_min = v_late, penalty = v_pen, updated_at = now()
   where id = p_id;
  if j.group_key is not null then   -- việc của cả ca: những người còn lại xong theo
    select name into v_name from public.staff where id = j.staff_id;
    update public.jobs set status = 'done', done_at = now(), done_by = m.email, done_staff = j.staff_id, late_min = v_late,
           note = left('Đã có ' || coalesce(v_name, j.staff_id) || ' nộp cho cả ca', 1000), updated_at = now()
     where group_key = j.group_key and id <> j.id and status = 'todo';
    get diagnostics v_sib = row_count;
  end if;
  return jsonb_build_object('status', 'success', 'late_min', v_late, 'penalty', v_pen, 'group_done', v_sib,
    'message', case when v_late > 0 then format('Đã nộp · trễ %s%s', public._mins_txt(v_late), case when v_pen > 0 then format(' · −%s⭐', v_pen) else '' end) else 'Đã nộp, cảm ơn bạn!' end
      || case when v_sib > 0 then format(' · xong cho cả ca (%s người)', v_sib + 1) else '' end);
end $$;
create or replace function public.job_submit(p_id bigint, p_photos jsonb, p_checks integer[], p_note text) returns jsonb
language sql security definer set search_path = '' as $$ select public.job_submit(p_id, p_photos, p_checks, p_note, '{}'::text[]) $$;

revoke execute on function public._rt_store(text), public._rt_slot_hm(int, boolean), public._rt_slot_at(text), public._rt_save_templates(jsonb, text), public.rt_generate(date) from public, anon, authenticated;
grant execute on function public._rt_save_templates(jsonb, text), public.rt_generate(date) to service_role;
revoke execute on function public.job_submit(bigint, jsonb, integer[], text, text[]), public.job_submit(bigint, jsonb, integer[], text) from public, anon;
grant execute on function public.job_submit(bigint, jsonb, integer[], text, text[]), public.job_submit(bigint, jsonb, integer[], text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_templates') then
    alter publication supabase_realtime add table public.job_templates;
  end if;
end $$;
