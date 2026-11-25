-- D24 Việc lặp lại mẫu mới (25/11/2026, chủ quản chốt): tab "Việc lặp lại (mẫu mới)" trong trang tính, mỗi cột 1 ý, ô chọn sẵn.
--   Quy tắc mới (rule jsonb, Edge Function _shared/rtask2.ts đọc):
--     who      'rotate' (chia lượt trong ca: mỗi mốc giờ 1 người trong ca, luân phiên) · 'staff' (người cụ thể: staff_ids)
--     dom      ngày trong tháng [29] · [-1] = ngày cuối tháng      once  'YYYY-MM-DD' (giao 1 lần)
--     skip     ngày không giao ['MM-DD' (mỗi năm) | 'YYYY-MM-DD']
--     open     mở nộp: {before: phút trước hạn} · {fixed: 'HH:MM'} · {days: n ngày trước} — trước giờ mở NV không nộp được
--     late     quá hạn: {after: phút sau hạn} · {eod: true} — tới giờ khoá thì việc thành "bỏ lỡ", không nộp được nữa
--     pen_late sao trừ khi nộp trễ / bỏ lỡ   proof 'photo' | 'check' | 'none'   checklist [...]   info (chỉ bấm Đã nhận)
--     event    {hm, day: 'same' | 'last' | số ngày} — giờ diễn ra (họp, học): tool nhắc trước 60 / 15 phút
alter table public.jobs add column if not exists lock_at timestamptz;   -- quá giờ này: khoá nộp, chuyển bỏ lỡ

-- Đổi hạn (QL sửa / dời) → dời giờ khoá theo; QL mở lại việc bỏ lỡ → bỏ khoá
create or replace function public._jobs_lock_shift() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'missed' and new.status = 'todo' then new.lock_at := null;
  elsif new.lock_at is not null and new.lock_at is not distinct from old.lock_at and new.due_at is distinct from old.due_at then
    new.lock_at := new.lock_at + (new.due_at - old.due_at);
  end if;
  return new;
end $$;
drop trigger if exists jobs_lock_shift on public.jobs;
create trigger jobs_lock_shift before update of due_at, status on public.jobs for each row execute function public._jobs_lock_shift();

create or replace function public.rt_generate(p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d0 date := coalesce(p_date, public.vn_today()); t public.job_templates; r jsonb; dd date; tm jsonb; v_ti int; st record;
  v_due timestamptz; v_start timestamptz; v_lock timestamptz; v_ev timestamptz; v_eom date; v_hm text; v_slot int; v_ok boolean; v_gk text;
  v_keys text[] := '{}'; v_groups text[] := '{}'; n_new int := 0; n_del int := 0; v_detail text; v_stores text[]; v_who text; v_kind text;
  v_id bigint; v_isnew boolean; v_proof text; v_list text[]; v_pmin int; v_pen int; v_info boolean; v_ids text[];
begin
  for t in select * from public.job_templates where active order by row_no loop
    r := t.rule; v_who := coalesce(r ->> 'who', 'at'); v_kind := coalesce(r ->> 'kind', 'group');
    v_stores := array(select jsonb_array_elements_text(coalesce(r -> 'stores', '[]'::jsonb)));
    v_ids := array(select jsonb_array_elements_text(coalesce(r -> 'staff_ids', '[]'::jsonb)));
    v_detail := coalesce(r ->> 'detail', '');
    v_proof := coalesce(nullif(r ->> 'proof', ''), case when coalesce((r ->> 'links_min')::int, 0) > 0 and coalesce((r ->> 'photo_min')::int, 0) = 0 then 'none' else 'photo' end);
    v_list := array(select jsonb_array_elements_text(coalesce(r -> 'checklist', '[]'::jsonb)));
    if v_proof = 'check' and cardinality(v_list) = 0 then v_proof := 'photo'; end if;
    v_pmin := case when v_proof = 'none' then 0 else least(10, greatest(0, coalesce((r ->> 'photo_min')::int, 1))) end;
    v_pen := greatest(0, coalesce((r ->> 'pen_late')::int, 0));
    v_info := coalesce((r ->> 'info')::boolean, false);
    for dd in select generate_series(d0, d0 + coalesce((r ->> 'early_days')::int, 0), interval '1 day')::date loop
      v_eom := (date_trunc('month', dd) + interval '1 month - 1 day')::date;
      if jsonb_typeof(r -> 'days') = 'array' and not ((r -> 'days') @> to_jsonb(extract(dow from dd)::int)) then continue; end if;
      if jsonb_typeof(r -> 'dom') = 'array' and not ((r -> 'dom') @> to_jsonb(extract(day from dd)::int) or ((r -> 'dom') @> '-1'::jsonb and dd = v_eom)) then continue; end if;
      if coalesce(r ->> 'once', '') <> '' and dd <> (r ->> 'once')::date then continue; end if;
      if jsonb_typeof(r -> 'skip') = 'array' and ((r -> 'skip') ? to_char(dd, 'MM-DD') or (r -> 'skip') ? to_char(dd, 'YYYY-MM-DD')) then continue; end if;
      for tm, v_ti in select x.e, x.o::int from jsonb_array_elements(coalesce(r -> 'times', '[]'::jsonb)) with ordinality x(e, o) loop
        v_hm := tm ->> 'hm';
        v_slot := case when v_who = 'slots' then (tm ->> 'slot')::int when v_who in ('at', 'rotate') and v_hm is not null then public._rt_slot_at(v_hm) end;
        for st in
          select s.id, s.dept, public._rt_store(s.dept) store, sh.slots, sh.staff_id is not null has_row,
                 exists (select 1 from public.shifts x where x.staff_id = s.id and x.d between dd - 6 and dd + 6) has_any
            from public.staff s left join public.shifts sh on sh.staff_id = s.id and sh.d = dd
           where not s.hidden and public._rt_store(s.dept) = any(v_stores)
        loop
          v_ok := case
            when v_who in ('slots', 'at') then v_slot is not null and coalesce(st.slots, '{}') @> array[v_slot]
            -- chia lượt: người trong ca lúc đó (cùng siêu thị) xếp theo mã NV, mỗi mốc giờ lần lượt 1 người (đổi vòng theo ngày)
            when v_who = 'rotate' then v_slot is not null and coalesce(st.slots, '{}') @> array[v_slot] and st.id = (
              select c.id from (select s2.id, (row_number() over (order by s2.id))::int - 1 rn, (count(*) over ())::int cnt
                                  from public.staff s2 join public.shifts h2 on h2.staff_id = s2.id and h2.d = dd
                                 where not s2.hidden and public._rt_store(s2.dept) = st.store and coalesce(h2.slots, '{}') @> array[v_slot]) c
               where c.rn = (extract(doy from dd)::int + v_ti - 1) % c.cnt)
            when v_who = 'staff' then st.id = any(v_ids)
            when v_who = 'cleaning' then exists (select 1 from public.cleaning c where c.staff_id = st.id and c.clean_date = dd)
            when v_who = 'all' then not coalesce((r ->> 'need_shift')::boolean, false) or cardinality(coalesce(st.slots, '{}')) > 0 or (not st.has_row and not st.has_any)
            else false end;
          continue when not v_ok;
          if r -> 'shift_end' is not null and jsonb_typeof(r -> 'shift_end') = 'object' then
            v_due := case when cardinality(coalesce(st.slots, '{}')) > 0
                          then public._vn_ts(dd, public._rt_slot_hm((select max(x) from unnest(st.slots) x), true)) - ((r -> 'shift_end' ->> 'minus')::int * interval '1 minute')
                          else public._vn_ts(dd, coalesce(r -> 'shift_end' ->> 'fallback', '17:00')) end;
          else
            continue when v_hm is null;
            v_due := public._vn_ts(dd, v_hm);
          end if;
          -- mở nộp
          v_start := case when r -> 'open' ->> 'before' is not null then v_due - ((r -> 'open' ->> 'before')::int * interval '1 minute')
                          when r -> 'open' ->> 'fixed' is not null then public._vn_ts(dd, r -> 'open' ->> 'fixed')
                          when r -> 'open' ->> 'days' is not null then public._vn_ts(dd - (r -> 'open' ->> 'days')::int, '00:00')
                          when tm ->> 'start' is not null then public._vn_ts(dd, tm ->> 'start') end;
          if v_start >= v_due then v_start := null; end if;
          -- khoá nộp
          v_lock := case when r -> 'late' ->> 'after' is not null then v_due + ((r -> 'late' ->> 'after')::int * interval '1 minute')
                         when coalesce((r -> 'late' ->> 'eod')::boolean, false) then greatest(v_due, public._vn_ts(dd, '23:59')) end;
          -- giờ diễn ra
          v_ev := case when r -> 'event' ->> 'hm' is not null then public._vn_ts(
                    case coalesce(r -> 'event' ->> 'day', 'same') when 'same' then dd when 'last' then v_eom
                         else least(v_eom, date_trunc('month', dd)::date + (greatest(1, (r -> 'event' ->> 'day')::int) - 1)) end,
                    r -> 'event' ->> 'hm') end;
          if v_due <= now() then v_keys := v_keys || format('%s|%s|%s', t.id, st.id, v_due); continue; end if;
          v_id := null; v_isnew := false;
          v_gk := case when v_kind = 'group' then format('%s|%s|%s|%s', t.id, dd, to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'), st.store) end;
          insert into public.jobs(type_id, title, detail, staff_id, due_at, proof, photo_min, photo_max, checklist, pen_late, pen_miss, template_id, group_key,
                                  links_min, start_at, lock_at, info, event_at, pushed_at, created_by)
          values (t.type_id, t.title, v_detail, st.id, v_due, v_proof, v_pmin, least(10, greatest(1, coalesce((r ->> 'photo_max')::int, 6))),
                  case when v_proof = 'check' then v_list else '{}' end, v_pen, case when v_lock is not null then v_pen else 0 end, t.id, v_gk,
                  greatest(0, coalesce((r ->> 'links_min')::int, 0)), v_start, v_lock, v_info, v_ev, now(), 'lap-lai')
          on conflict (template_id, staff_id, due_at) where template_id is not null do update set title = excluded.title, detail = excluded.detail, group_key = excluded.group_key,
                  links_min = excluded.links_min, start_at = excluded.start_at, type_id = excluded.type_id, proof = excluded.proof, photo_min = excluded.photo_min,
                  photo_max = excluded.photo_max, checklist = excluded.checklist, pen_late = excluded.pen_late, pen_miss = excluded.pen_miss,
                  lock_at = excluded.lock_at, info = excluded.info, event_at = excluded.event_at
            where public.jobs.status = 'todo'
          returning id, (xmax = 0) into v_id, v_isnew;
          if v_id is not null and v_isnew then n_new := n_new + 1; end if;
          v_keys := v_keys || format('%s|%s|%s', t.id, st.id, v_due);
          if v_gk is not null then v_groups := v_groups || v_gk; end if;
        end loop;
      end loop;
    end loop;
  end loop;
  delete from public.jobs j
   where j.template_id is not null and j.created_by = 'lap-lai' and j.status = 'todo' and jsonb_array_length(j.photos) = 0
     and (j.due_at at time zone 'Asia/Ho_Chi_Minh')::date between d0 and d0 + 7
     and not (format('%s|%s|%s', j.template_id, j.staff_id, j.due_at) = any(v_keys));
  get diagnostics n_del = row_count;
  update public.jobs j set group_staff = g.ids
    from (select group_key, array_agg(staff_id order by staff_id) ids from public.jobs where group_key = any(v_groups) group by group_key) g
   where j.group_key = g.group_key and j.group_staff is distinct from g.ids;
  return jsonb_build_object('status', 'success', 'new', n_new, 'removed', n_del, 'date', d0);
end $$;

-- Tới giờ khoá → bỏ lỡ (ngoài luật cũ JOB_MISS_HOURS)
create or replace function public.job_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.jobs; n int := 0; h numeric := public.setting_num('JOB_MISS_HOURS', 24);
begin
  for r in select * from public.jobs where status = 'todo' and not excused
             and (due_at + (h::float8) * interval '1 hour' < now() or (lock_at is not null and lock_at < now())) for update skip locked loop
    if r.pen_miss > 0 then
      perform public._job_star(r.staff_id, -r.pen_miss, format('Bỏ lỡ việc: %s (hạn %s)', r.title, to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')), r.id, 'he-thong');
    end if;
    update public.jobs set status = 'missed', penalty = r.pen_miss, updated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('missed', n);
end $$;

-- Nộp việc: chưa tới giờ mở nộp → chặn (NV); quá giờ khoá → chặn
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
  if j.status = 'todo' and m.role = 'employee' and j.start_at is not null and now() < j.start_at then
    raise exception 'Chưa tới giờ nộp: mở nộp lúc %.', to_char(j.start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
  end if;
  if j.status = 'todo' and j.lock_at is not null and now() > j.lock_at then
    raise exception 'Đã khoá nộp lúc % (quá hạn). Nhờ quản lý mở lại nếu cần nộp.', to_char(j.lock_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
  end if;
  if jsonb_typeof(v_photos) <> 'array' then raise exception 'Ảnh không hợp lệ.'; end if;
  v_n := jsonb_array_length(v_photos);
  if v_n > 10 then raise exception 'Tối đa 10 ảnh.'; end if;
  if j.proof in ('photo', 'check') and v_n < j.photo_min then raise exception 'Cần ít nhất % ảnh.', j.photo_min; end if;
  if j.links_min > 0 and cardinality(v_links) < j.links_min then raise exception 'Cần ít nhất % link (bắt đầu bằng http).', j.links_min; end if;
  if j.proof = 'check' and (select count(distinct x) from unnest(coalesce(p_checks, '{}'::int[])) x where x between 0 and cardinality(j.checklist) - 1) < cardinality(j.checklist) then
    raise exception 'Tick đủ các mục trong checklist.';
  end if;
  if j.status = 'done' then
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
  if j.group_key is not null then
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

revoke execute on function public.rt_generate(date), public.job_tick(), public._jobs_lock_shift() from public, anon, authenticated;
grant execute on function public.rt_generate(date), public.job_tick() to service_role;
revoke execute on function public.job_submit(bigint, jsonb, integer[], text, text[]) from public, anon;
grant execute on function public.job_submit(bigint, jsonb, integer[], text, text[]) to authenticated;
insert into public.settings(key, value) values ('RT_SHEET_TAB', '"Việc lặp lại (mẫu mới)"'::jsonb) on conflict (key) do nothing;
