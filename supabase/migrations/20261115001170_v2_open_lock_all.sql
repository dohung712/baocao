-- D24b (25/11/2026, chủ quản): chưa tới giờ mở nộp thì KHÔNG AI nộp được, kể cả quản lý (trước đây QL nộp thay được)
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
  if j.status = 'todo' and j.start_at is not null and now() < j.start_at then
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

revoke execute on function public.job_submit(bigint, jsonb, integer[], text, text[]) from public, anon;
grant execute on function public.job_submit(bigint, jsonb, integer[], text, text[]) to authenticated;
