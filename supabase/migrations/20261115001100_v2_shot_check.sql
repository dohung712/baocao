-- D13d: ảnh nộp cho việc "chỉ nhận ảnh chụp màn hình" mà tool nghi không phải ảnh chụp màn hình → NV tick ĐÃ BÁO CÁO LINE + CAM KẾT ĐÚNG
-- rồi vẫn nộp được; tool ghi 1 mục "📱 Ảnh cần kiểm tra" (shot_check) trong 📥 Duyệt, Trợ lý báo ngay trưởng ca / QL.
-- QL: ✅ Ảnh đúng (approve) · ↩️ Bắt nộp lại (reject → mở lại việc, hạn mới, NV nhận thông báo).

create or replace function public.job_shot_flag(p_job bigint, p_reasons text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs; v_name text;
begin
  m := public._require_member();
  select * into j from public.jobs where id = p_job;
  if j.id is null or not public.can_see_staff(j.staff_id) then raise exception 'Không tìm thấy việc.'; end if;
  if m.role = 'employee' and m.staff_id is distinct from j.staff_id then raise exception 'Đây không phải việc của bạn.'; end if;
  if j.status <> 'done' then raise exception 'Việc chưa nộp.'; end if;
  select name into v_name from public.staff where id = coalesce(j.done_staff, j.staff_id);
  insert into public.agent_items(key, kind, staff_id, job_id, title, detail, data)
  values ('shot:' || j.id, 'shot_check', coalesce(j.done_staff, j.staff_id), j.id, j.title,
          'NV xác nhận ĐÃ BÁO CÁO LINE + CAM KẾT ĐÚNG · tool nghi: ' || left(array_to_string(coalesce(p_reasons, '{}'), ', '), 300),
          jsonb_build_object('name', v_name, 'photos', j.photos, 'done_at', j.done_at, 'by', m.email))
  on conflict (key) do update set detail = excluded.detail, data = excluded.data, status = 'open', digest_at = null, alerted_at = null,
         decided_at = null, decided_by = null, note = '', updated_at = now();
  return jsonb_build_object('status', 'success');
end $$;
revoke execute on function public.job_shot_flag(bigint, text[]) from public, anon;
grant execute on function public.job_shot_flag(bigint, text[]) to authenticated;
create or replace function public.agent_decide(p_ids bigint[], p_action text, p_due timestamptz default null, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; it public.agent_items; j public.jobs; n int := 0; v_due timestamptz; v_notify jsonb := '[]'::jsonb; v_msg text;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được duyệt.'; end if;
  if p_action not in ('approve', 'close', 'reject') then raise exception 'Thao tác không hợp lệ.'; end if;
  for it in select * from public.agent_items where id = any(p_ids[1:200]) and status = 'open' for update loop
    if it.staff_id is not null and not public.can_see_staff(it.staff_id) then continue; end if;
    j := null;
    if it.job_id is not null then select * into j from public.jobs where id = it.job_id for update; end if;
    v_msg := null;
    if p_action = 'approve' and j.id is not null then
      if it.kind = 'late' then
        if j.status = 'done' and not j.excused then v_msg := null;   -- NV đã nộp rồi
        else
          v_due := coalesce(p_due, now() + interval '2 hours');
          if v_due <= now() then raise exception 'Hạn nộp bù phải sau bây giờ.'; end if;
          perform public._agent_clone(j, v_due, 'Nộp bù: ', 'agent:' || m.email);
          -- việc cũ: giữ ghi nhận trễ, thôi nhắc
          update public.jobs set status = 'missed', note = left('Cho nộp bù đến ' || to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), 1000), updated_at = now()
           where status = 'todo' and ((j.group_key is not null and group_key = j.group_key) or id = j.id);
          v_msg := 'Được nộp bù "' || j.title || '" đến ' || to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
        end if;
      elsif it.kind = 'req_delay' then
        v_due := coalesce(p_due, (it.data ->> 'due_new')::timestamptz);
        if j.status = 'todo' and not j.excused and v_due > now() then
          perform public._agent_clone(j, v_due, '', 'agent:' || m.email);
          update public.jobs set status = 'done', excused = true, done_at = now(), done_by = m.email, late_min = 0,
                 note = left('Dời hạn sang ' || to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), 1000), updated_at = now()
           where status = 'todo' and ((j.group_key is not null and group_key = j.group_key) or id = j.id);
          v_msg := 'Đồng ý dời hạn "' || j.title || '" sang ' || to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
        end if;
      elsif it.kind = 'req_excuse' then
        if j.status = 'todo' then
          update public.jobs set status = 'done', excused = true, done_at = now(), done_by = m.email, late_min = 0,
                 note = left('Được miễn: ' || it.detail, 1000), updated_at = now()
           where status = 'todo' and ((j.group_key is not null and group_key = j.group_key) or id = j.id);
          v_msg := 'Được miễn việc "' || j.title || '"';
        end if;
      end if;
    elsif p_action = 'reject' and it.kind = 'shot_check' and j.id is not null then
      -- D13d: ảnh NV cam kết là ảnh chụp màn hình nhưng QL thấy chưa đúng → mở lại việc cho NV nộp lại
      v_due := coalesce(p_due, now() + interval '2 hours');
      update public.jobs set status = 'todo', done_at = null, done_by = null, done_staff = null, late_min = 0, due_at = v_due,
             pushed_at = null, reminded_at = null, remind5_at = null, overdue_at = null, nag_at = null, escalated_at = null,
             note = left('QL yêu cầu nộp lại: ảnh chưa đúng ảnh chụp màn hình báo cáo' || case when coalesce(p_note, '') <> '' then ' (' || p_note || ')' else '' end, 1000), updated_at = now()
       where status = 'done' and not excused and (id = j.id or (j.group_key is not null and group_key = j.group_key and done_staff is not distinct from j.done_staff));
      v_msg := 'Ảnh báo cáo "' || j.title || '" chưa đúng ảnh chụp màn hình — nộp lại trước ' || to_char(v_due at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || case when coalesce(p_note, '') <> '' then ': ' || p_note else '' end;
    elsif p_action = 'reject' and it.kind in ('req_delay', 'req_excuse') and j.id is not null then
      v_msg := 'Yêu cầu ' || case when it.kind = 'req_delay' then 'dời hạn' else 'miễn' end || ' "' || j.title || '" chưa được duyệt' || case when coalesce(p_note, '') <> '' then ': ' || p_note else '' end;
    end if;
    update public.agent_items set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'done' end,
           decided_at = now(), decided_by = m.email, note = left(coalesce(p_note, ''), 500), updated_at = now()
     where id = it.id;
    if v_msg is not null and it.staff_id is not null then
      v_notify := v_notify || jsonb_build_object('staff_id', it.staff_id, 'job_id', it.job_id, 'text', v_msg,
                    'group', coalesce((select jsonb_agg(staff_id) from public.jobs where j.group_key is not null and group_key = j.group_key), jsonb_build_array(it.staff_id)));
    end if;
    n := n + 1;
  end loop;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'AGENT_DECIDE', array_to_string(p_ids, ','), jsonb_build_object('action', p_action, 'n', n));
  return jsonb_build_object('status', 'success', 'n', n, 'notify', v_notify,
    'message', case when n = 0 then 'Không còn mục nào chờ duyệt' else format('Đã xử lý %s mục', n) end);
end $$;
