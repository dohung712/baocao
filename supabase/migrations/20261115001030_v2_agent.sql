-- D14: 🤖 Trợ lý vận hành (AI Agent, không tốn lượt AI) — đi kiểm tra việc trong ngày, gom việc cần quyết vào hộp duyệt,
-- gửi Giám đốc theo khung giờ (AGENT_TIMES), báo lên trưởng ca / QL khi NV trễ, canh lỗi hệ thống, phân tích tuần.
--  • agent_items: 1 dòng = 1 việc cần duyệt / cần biết (key chống trùng)
--  • NV xin dời hạn / xin miễn 1 việc → agent_request → hộp duyệt
--  • QL / Giám đốc quyết → agent_decide: cho nộp bù / dời hạn (tạo việc mới, việc cũ đóng) / miễn / ghi trễ / từ chối
--  • jobs.excused: việc được miễn hoặc đã dời sang việc khác (không tính vào thống kê); jobs.escalated_at: đã báo lên trên

alter table public.jobs add column if not exists excused boolean not null default false;
alter table public.jobs add column if not exists escalated_at timestamptz;

create table if not exists public.agent_items (
  id bigint generated always as identity primary key,
  key text not null unique,
  kind text not null,              -- late · req_delay · req_excuse · no_shift · bi · rt · no_push · shift_conflict · bi_stuck · weekly
  urgent boolean not null default false,
  needs_decision boolean not null default true,
  staff_id text,
  job_id bigint references public.jobs(id) on delete cascade,
  title text not null default '',
  detail text not null default '',
  data jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  digest_at timestamptz,           -- đã đưa vào tin tổng hợp
  alerted_at timestamptz,          -- đã báo gấp
  decided_at timestamptz,
  decided_by text,
  note text not null default ''
);
create index if not exists agent_items_open_idx on public.agent_items(status, created_at desc);
create index if not exists agent_items_staff_idx on public.agent_items(staff_id, created_at desc);

alter table public.agent_items enable row level security;
drop policy if exists agent_items_read on public.agent_items;
create policy agent_items_read on public.agent_items for select to authenticated
  using (public.is_member() and (
    (public.is_manager() and (staff_id is null or public.can_see_staff(staff_id)))
    or (staff_id = (public.app_member()).staff_id and kind in ('req_delay', 'req_excuse'))));
revoke all on public.agent_items from anon;
revoke insert, update, delete on public.agent_items from authenticated;
grant select on public.agent_items to authenticated;

insert into public.settings(key, value) values
  ('AGENT_ON', 'true'::jsonb),
  ('AGENT_TIMES', '["12:00","17:00","21:30"]'::jsonb),
  ('AGENT_ESC_MIN', '30'::jsonb),            -- quá hạn bao nhiêu phút thì báo lên trưởng ca / QL
  ('AGENT_ESC_NAGS', '3'::jsonb),            -- hoặc đã nhắc ngần ấy lần mà NV không bấm mở
  ('AGENT_SHIFT_CHECK', '"20:00"'::jsonb),   -- giờ kiểm tra đã có lịch ca ngày mai
  ('AGENT_BI_CHECK', '"09:30"'::jsonb)       -- giờ kiểm tra ảnh BI hôm nay đã đọc xong
on conflict (key) do nothing;

-- việc được miễn / đã dời không bị nhắc, không bị chuyển "bỏ lỡ"
create or replace function public.job_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.jobs; n int := 0; h numeric := public.setting_num('JOB_MISS_HOURS', 24);
begin
  for r in select * from public.jobs where status = 'todo' and not excused and due_at + (h::float8) * interval '1 hour' < now() for update skip locked loop
    if r.pen_miss > 0 then
      perform public._job_star(r.staff_id, -r.pen_miss, format('Bỏ lỡ việc: %s (hạn %s)', r.title, to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')), r.id, 'he-thong');
    end if;
    update public.jobs set status = 'missed', penalty = r.pen_miss, updated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('missed', n);
end $$;

-- NV xin dời hạn (p_type = 'delay', p_due = giờ mới) / xin miễn (p_type = 'excuse') cho việc của mình đang chờ làm
create or replace function public.agent_request(p_job bigint, p_type text, p_reason text, p_due timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; j public.jobs; v_kind text; v_name text;
begin
  m := public._require_member();
  select * into j from public.jobs where id = p_job;
  if j.id is null or not public.can_see_staff(j.staff_id) then raise exception 'Không tìm thấy việc.'; end if;
  if m.staff_id is distinct from j.staff_id then raise exception 'Chỉ xin được cho việc của chính mình.'; end if;
  if j.status <> 'todo' or j.excused then raise exception 'Việc này không còn chờ làm.'; end if;
  if p_type not in ('delay', 'excuse') then raise exception 'Loại yêu cầu không hợp lệ.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Ghi lý do (ít nhất vài chữ).'; end if;
  if p_type = 'delay' and (p_due is null or p_due <= now() or p_due <= j.due_at or p_due > j.due_at + interval '3 days') then
    raise exception 'Giờ hạn mới phải sau hạn cũ và trong vòng 3 ngày.';
  end if;
  v_kind := 'req_' || p_type;
  select name into v_name from public.staff where id = j.staff_id;
  insert into public.agent_items(key, kind, staff_id, job_id, title, detail, data)
  values (v_kind || ':' || j.id, v_kind, j.staff_id, j.id,
          case when p_type = 'delay' then 'Xin dời hạn: ' else 'Xin miễn: ' end || j.title,
          left(btrim(p_reason), 500),
          jsonb_build_object('name', v_name, 'due_old', j.due_at, 'due_new', p_due))
  on conflict (key) do update set detail = excluded.detail, data = excluded.data, status = 'open', digest_at = null,
         decided_at = null, decided_by = null, note = '', updated_at = now();
  return jsonb_build_object('status', 'success', 'message', 'Đã gửi yêu cầu, chờ quản lý duyệt');
end $$;

-- Tạo bản việc mới (nộp bù / dời hạn) từ việc cũ — việc của cả ca: 1 nhóm mới cho cả ca
create or replace function public._agent_clone(p_job public.jobs, p_due timestamptz, p_prefix text, p_actor text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n int; v_group text := case when p_job.group_key is null then null else p_job.group_key || ':' || to_char(p_due at time zone 'Asia/Ho_Chi_Minh', 'DDHH24MI') end;
begin
  insert into public.jobs(batch, type_id, title, detail, staff_id, due_at, proof, photo_min, photo_max, checklist, pen_late, pen_miss,
                          created_by, group_key, group_staff, links_min)
  select gen_random_uuid(), x.type_id, left(p_prefix || x.title, 300), x.detail, x.staff_id, p_due, x.proof, x.photo_min, x.photo_max, x.checklist, 0, 0,
         p_actor, v_group, x.group_staff, x.links_min
    from public.jobs x
   where (p_job.group_key is not null and x.group_key = p_job.group_key) or x.id = p_job.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- QL quyết: p_action = approve (cho nộp bù / đồng ý dời / đồng ý miễn / đã xử lý) · close (ghi trễ / đã biết) · reject (từ chối)
-- p_due: hạn nộp bù (việc trễ); trả về danh sách NV cần báo kết quả
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

revoke execute on function public._agent_clone(public.jobs, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.agent_request(bigint, text, text, timestamptz), public.agent_decide(bigint[], text, timestamptz, text) from public, anon;
grant execute on function public.agent_request(bigint, text, text, timestamptz), public.agent_decide(bigint[], text, timestamptz, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_items') then
    alter publication supabase_realtime add table public.agent_items;
  end if;
end $$;
