-- D23 (chủ quản chốt 24/11/2026):
--  • Việc thông báo (họp, học, triển khai…): NV chỉ bấm 👍 Đã nhận, không cần ảnh; có giờ diễn ra (event_at) → nhắc trước 60 / 15 phút
--  • Roadshow: được nộp báo cáo trước giờ chạy; NV tự dời lượt chưa báo cáo của mình (QL dời cho mọi người) — rs_move
--  • Chữ chạy (tickers): QL đăng dòng thông báo chạy đầu mọi trang, từ giờ – đến giờ, cho mọi NV hoặc từng bộ phận, kèm link

alter table public.jobs add column if not exists info boolean not null default false;
alter table public.jobs add column if not exists event_at timestamptz;
alter table public.jobs add column if not exists ev60_at timestamptz;
alter table public.jobs add column if not exists ev15_at timestamptz;
create or replace function public.job_assign(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare m public.memberships; v_batch uuid := gen_random_uuid(); s text; d date; n int := 0; v_staff int := 0;
  v_title text := btrim(coalesce(p ->> 'title', '')); v_proof text := coalesce(nullif(p ->> 'proof', ''), 'photo');
  v_min int := coalesce(nullif(p ->> 'photo_min', '')::int, 1); v_max int := coalesce(nullif(p ->> 'photo_max', '')::int, 6);
  v_type bigint := nullif(p ->> 'type_id', '')::bigint; v_from date; v_to date; v_hm text := coalesce(p ->> 'due_hm', '');
  v_list text[] := coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'checklist', '[]'::jsonb)) x where btrim(x) <> ''), '{}');
  v_info boolean := coalesce((p ->> 'info')::boolean, false); v_ev_hm text := coalesce(p ->> 'event_hm', ''); v_ev_off int := 0;
begin
  m := public._job_mgr();
  if length(v_title) < 3 then raise exception 'Nhập tên việc.'; end if;
  if v_proof not in ('photo', 'check', 'none') then raise exception 'Kiểu minh chứng không hợp lệ.'; end if;
  if v_proof = 'check' and cardinality(v_list) = 0 then raise exception 'Nhập ít nhất 1 mục checklist.'; end if;
  if v_proof = 'none' then v_min := 0; end if;
  v_min := greatest(0, least(10, v_min));
  v_max := greatest(1, least(10, greatest(v_max, v_min)));
  if coalesce(p ->> 'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$' or v_hm !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Chọn ngày và giờ hạn.'; end if;
  v_from := (p ->> 'due_date')::date;
  v_to := case when coalesce(p ->> 'repeat_until', '') ~ '^\d{4}-\d{2}-\d{2}$' then greatest(v_from, (p ->> 'repeat_until')::date) else v_from end;
  if v_to - v_from > 31 then raise exception 'Lặp tối đa 31 ngày.'; end if;
  if public._vn_ts(v_to, v_hm) < now() - interval '1 day' then raise exception 'Giờ hạn đã qua.'; end if;
  -- D23 việc thông báo: giờ diễn ra (họp, học…) cùng ngày với hạn (hoặc ngày event_date) — lặp nhiều ngày thì mỗi ngày cùng giờ
  if v_info then
    v_proof := 'none'; v_min := 0;
    if v_ev_hm <> '' and v_ev_hm !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Giờ diễn ra không hợp lệ.'; end if;
    if coalesce(p ->> 'event_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then v_ev_off := (p ->> 'event_date')::date - v_from; end if;
  end if;
  if v_type is not null and not exists (select 1 from public.job_types where id = v_type) then raise exception 'Hạng mục không tồn tại.'; end if;
  for s in select distinct x from jsonb_array_elements_text(coalesce(p -> 'staff_ids', '[]'::jsonb)) x loop
    if not public.can_see_staff(s) then raise exception 'Nhân viên % ngoài phạm vi của bạn.', s; end if;
    continue when not exists (select 1 from public.staff where id = s and not hidden);
    v_staff := v_staff + 1;
    for d in select g::date from generate_series(v_from, v_to, interval '1 day') g loop
      insert into public.jobs(batch, type_id, title, detail, staff_id, due_at, proof, photo_min, photo_max, checklist, pen_late, pen_miss, created_by, info, event_at)
      values (v_batch, v_type, v_title, coalesce(p ->> 'detail', ''), s, public._vn_ts(d, v_hm), v_proof, v_min, v_max, v_list,
              greatest(0, coalesce(nullif(p ->> 'pen_late', '')::int, 0)), greatest(0, coalesce(nullif(p ->> 'pen_miss', '')::int, 0)), m.email,
              v_info, case when v_info and v_ev_hm <> '' then public._vn_ts(d + v_ev_off, v_ev_hm) end);
      n := n + 1;
    end loop;
  end loop;
  if n = 0 then raise exception 'Chọn ít nhất 1 nhân viên.'; end if;
  insert into public.audit_log(actor, action, target, details)
  values (m.email, 'JOB_ASSIGN', v_batch::text, jsonb_build_object('title', v_title, 'staff', v_staff, 'jobs', n, 'from', v_from, 'to', v_to, 'hm', v_hm));
  return jsonb_build_object('status', 'success', 'batch', v_batch, 'n', n,
    'message', format('Đã giao "%s" cho %s nhân viên%s', v_title, v_staff, case when v_to > v_from then format(', %s ngày (%s việc)', v_to - v_from + 1, n) else '' end));
end $$;

-- Roadshow: nộp báo cáo trước giờ chạy được (bỏ chặn "chưa tới giờ")
create or replace function public.rs_report(p_staff text, p_date date, p_time text, p_km numeric, p_minutes numeric, p_photos text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.roadshow;
begin
  m := public._member_for_staff(p_staff);
  select * into r from public.roadshow where rs_date = p_date and staff_id = p_staff and rs_time = p_time;
  if r.id is null then raise exception 'Chưa đăng ký Roadshow khung giờ này.'; end if;
  if cardinality(r.photos) >= 3 then raise exception 'Lượt này đã nộp báo cáo. Cần sửa thì nhờ quản lý xoá ảnh.'; end if;
  if coalesce(p_km, 0) < public.setting_num('RS_MIN_KM', 5) then raise exception 'Quãng đường tối thiểu % km.', public.setting_num('RS_MIN_KM', 5); end if;
  if coalesce(p_minutes, 0) < public.setting_num('RS_MIN_MIN', 30) then raise exception 'Thời gian chạy tối thiểu % phút.', public.setting_num('RS_MIN_MIN', 30); end if;
  if cardinality(p_photos) not between 3 and 6 or exists (select 1 from unnest(p_photos) x where x !~ '^v2:rs/') then raise exception 'Cần 3–6 ảnh.'; end if;
  update public.roadshow set photos = p_photos, km = p_km, minutes = p_minutes, report_date = public.vn_today(), report_time = public.vn_hm() where id = r.id;
  return jsonb_build_object('status', 'success', 'message', format('Đã nộp báo cáo Roadshow %s ngày %s', p_time, to_char(p_date, 'DD/MM')));
end $$;

-- Roadshow: dời lượt chưa báo cáo sang ngày / khung giờ khác (NV dời của mình, QL dời cho mọi người)
create or replace function public.rs_move(p_staff text, p_date date, p_time text, p_new_date date, p_new_time text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.roadshow;
begin
  m := public._member_for_staff(p_staff);
  select * into r from public.roadshow where rs_date = p_date and staff_id = p_staff and rs_time = p_time for update;
  if r.id is null then raise exception 'Không tìm thấy lượt Roadshow.'; end if;
  if cardinality(r.photos) >= 3 then raise exception 'Lượt đã nộp báo cáo, không dời được.'; end if;
  if not public.rs_valid_time(p_new_time) then raise exception 'Giờ không hợp lệ (sáng 6h–10h30, chiều 15h–18h, cách 30 phút).'; end if;
  if p_new_date < public.vn_today() or (p_new_date = public.vn_today() and p_new_time < public.vn_hm()) then raise exception 'Khung giờ mới đã qua.'; end if;
  if exists (select 1 from public.roadshow where rs_date = p_new_date and staff_id = p_staff and rs_time = p_new_time) then raise exception 'Đã có lượt ở khung giờ mới.'; end if;
  update public.roadshow set rs_date = p_new_date, rs_time = p_new_time where id = r.id;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'RS_MOVE', p_staff, jsonb_build_object('from', p_date || ' ' || p_time, 'to', p_new_date || ' ' || p_new_time));
  return jsonb_build_object('status', 'success', 'message', format('Đã dời Roadshow sang %s ngày %s', p_new_time, to_char(p_new_date, 'DD/MM')));
end $$;

-- Chữ chạy đầu trang
create table if not exists public.tickers (
  id bigint generated always as identity primary key,
  text text not null check (length(btrim(text)) between 3 and 500),
  link text,
  from_at timestamptz not null default now(),
  to_at timestamptz not null,
  audience jsonb not null default '["*"]'::jsonb,   -- ["*"] = mọi người · ["PG","Topzone"] = NV các bộ phận đó (QL / Admin luôn thấy)
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists tickers_time_idx on public.tickers(to_at);
alter table public.tickers enable row level security;
drop policy if exists tickers_read on public.tickers;
create policy tickers_read on public.tickers for select to authenticated using (public.is_member());
revoke all on public.tickers from anon;
revoke insert, update, delete on public.tickers from authenticated;
grant select on public.tickers to authenticated;

create or replace function public.ticker_save(p_id bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_from timestamptz; v_to timestamptz; v_link text := nullif(btrim(coalesce(p ->> 'link', '')), ''); v_id bigint;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý đăng được chữ chạy.'; end if;
  v_from := coalesce(nullif(p ->> 'from_at', '')::timestamptz, now()); v_to := nullif(p ->> 'to_at', '')::timestamptz;
  if v_to is null or v_to <= v_from then raise exception 'Giờ kết thúc phải sau giờ bắt đầu.'; end if;
  if v_to > now() + interval '62 days' then raise exception 'Hiện tối đa 2 tháng.'; end if;
  if v_link is not null and v_link !~* '^https?://\S+$' then raise exception 'Link phải bắt đầu bằng http:// hoặc https://'; end if;
  if jsonb_typeof(p -> 'audience') <> 'array' or jsonb_array_length(p -> 'audience') = 0 then raise exception 'Chọn người thấy.'; end if;
  if p_id is null then
    insert into public.tickers(text, link, from_at, to_at, audience, created_by) values (btrim(p ->> 'text'), v_link, v_from, v_to, p -> 'audience', m.email) returning id into v_id;
  else
    update public.tickers set text = btrim(p ->> 'text'), link = v_link, from_at = v_from, to_at = v_to, audience = p -> 'audience' where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy chữ chạy.'; end if;
  end if;
  return jsonb_build_object('status', 'success', 'id', v_id, 'message', 'Đã lưu chữ chạy');
end $$;
create or replace function public.ticker_delete(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý xoá được.'; end if;
  delete from public.tickers where id = p_id;
  return jsonb_build_object('status', 'success', 'message', 'Đã gỡ chữ chạy');
end $$;

revoke execute on function public.rs_move(text, date, text, date, text), public.ticker_save(bigint, jsonb), public.ticker_delete(bigint) from public, anon;
grant execute on function public.rs_move(text, date, text, date, text), public.ticker_save(bigint, jsonb), public.ticker_delete(bigint) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickers') then
    alter publication supabase_realtime add table public.tickers;
  end if;
end $$;