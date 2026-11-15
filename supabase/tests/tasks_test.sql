-- D7 Việc: quyền xem theo loại / bộ phận / người được giao, xác nhận đọc & hoàn thành, kỳ nhắc lại
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1001@x.vn','employee','1001','{Topzone}'), ('nv1003@x.vn','employee','1003','{Topzone}'), ('nv1000@x.vn','employee','1000','{"Thế Giới Di Động"}'), ('mgr@x.vn','manager',null,'{Topzone}') on conflict do nothing;
delete from tasks where created_by = 'mgr@x.vn';
set role authenticated;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare a bigint; b bigint; c bigint; begin
  a := (public.task_save(null, '{"kind":"announce","title":"CTKM T11","summary":"• Ý 1","depts":["Topzone"],"remind":"month","important":true}') ->> 'id')::bigint;
  b := (public.task_save(null, '{"kind":"assign","title":"Dọn kho","assignees":["1001"],"deadline":"2026-11-20"}') ->> 'id')::bigint;
  c := (public.task_save(null, '{"kind":"link","title":"Sheet tồn kho","link_url":"https://docs.google.com/x","content":"Trang tính quản lý"}') ->> 'id')::bigint;
  perform set_config('my.a', a::text, false); perform set_config('my.b', b::text, false); perform set_config('my.c', c::text, false);
end $$;
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare n int; begin
  select count(*) into n from public.tasks where created_by = 'mgr@x.vn';
  if n <> 1 then raise exception 'NV 1003 phải chỉ thấy 1 việc (triển khai Topzone), thấy %', n; end if;
  perform public.task_ack(current_setting('my.a')::bigint, 'read');
end $$;
select set_config('request.jwt.claims', '{"email":"nv1000@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin if (select count(*) from public.tasks where created_by = 'mgr@x.vn') <> 0 then raise exception 'NV TGDĐ không được thấy việc Topzone'; end if; end $$;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if (select count(*) from public.tasks where created_by = 'mgr@x.vn') <> 2 then raise exception 'NV 1001 phải thấy 2 việc'; end if;
  perform public.task_ack(current_setting('my.b')::bigint, 'done', 'Xong rồi');
  begin perform public.task_ack(current_setting('my.c')::bigint, 'read'); raise exception 'NV không được thấy link QL'; exception when others then if sqlerrm not like '%Không tìm thấy%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare p text; begin
  select period into p from public.task_acks where task_id = current_setting('my.a')::bigint and who = '1003';
  if p <> to_char(public.vn_today(), 'YYYY-MM') then raise exception 'kỳ nhắc tháng sai: %', p; end if;
  if not exists (select 1 from public.task_acks where task_id = current_setting('my.b')::bigint and who = '1001' and done_at is not null and note = 'Xong rồi') then raise exception 'thiếu hoàn thành'; end if;
  perform public.task_set_status(current_setting('my.c')::bigint, 'delete');
  raise notice 'việc ok: kỳ %', p;
end $$;
-- việc thời vụ quá hạn tự ẩn với NV; lâu dài / nhắc lại thì không
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare a jsonb; b jsonb; c jsonb; begin
  a := public.task_save(null, jsonb_build_object('kind','announce','title','CTKM cũ','deadline', (public.vn_today() - 10)::text));
  b := public.task_save(null, jsonb_build_object('kind','announce','title','Nội quy','keep', true));
  c := public.task_save(null, jsonb_build_object('kind','announce','title','Không hạn'));
  if (a ->> 'hide_after')::date <> public.vn_today() - 7 or b ->> 'hide_after' is not null or (c ->> 'hide_after')::date <> public.vn_today() + 30 then raise exception 'ngày tự ẩn sai: % % %', a, b, c; end if;
end $$;
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if exists (select 1 from public.tasks where title = 'CTKM cũ') then raise exception 'việc hết hạn phải tự ẩn với NV'; end if;
  if not exists (select 1 from public.tasks where title = 'Nội quy') then raise exception 'việc lâu dài phải hiện'; end if;
  raise notice 'tự ẩn ok';
end $$;
reset role;
