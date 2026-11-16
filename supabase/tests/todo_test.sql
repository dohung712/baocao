-- B13 truyền thông ngày · B14 việc cần làm · D3 khoá đăng ký bận sau 22h T6
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1001@x.vn','employee','1001','{Topzone}'), ('mgr@x.vn','manager',null,'{Topzone}') on conflict do nothing;
delete from media_reports where staff_id = '1001';
delete from busy where staff_id = '1001' and busy_date >= public.vn_today();
delete from cleaning where clean_date = public.vn_today() + 1;
insert into cleaning(clean_date, staff_id) values (public.vn_today() + 1, '1001');
set role authenticated;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare t jsonb; begin
  perform public.save_media('1001', public.vn_today(), 2, 1);
  perform public.save_media('1001', public.vn_today(), 3, 2);
  if (select posts || '/' || line_reports from public.media_reports where staff_id = '1001' and report_date = public.vn_today()) <> '3/2' then raise exception 'lưu truyền thông sai'; end if;
  begin perform public.save_media('1001', public.vn_today() + 1, 1, 1); raise exception 'không được báo ngày tương lai'; exception when others then if sqlerrm not like '%tương lai%' then raise; end if; end;
  t := public.todo_list('1001', public.vn_today());
  if not exists (select 1 from jsonb_array_elements(t) x where x ->> 'k' = 'cl_tm') then raise exception 'thiếu nhắc mai trực vệ sinh: %', t; end if;
  begin perform public.todo_list('1000', public.vn_today()); raise exception 'NV không xem được việc của người khác'; exception when others then if sqlerrm not like '%không thao tác%' then raise; end if; end;
  -- Tuần này đã qua hạn (22h T6 tuần trước) → NV không tự đăng ký được ngày trong tuần này
  begin perform public.busy_register('1001', public.vn_today() + case when extract(isodow from public.vn_today()) = 7 then 0 else 1 end, 'OFF', '{}');
    if extract(isodow from public.vn_today()) <> 7 then raise exception 'phải khoá đăng ký bận sau hạn'; end if;
  exception when others then if sqlerrm not like '%quá hạn đăng ký%' then raise; end if; end;
  -- Tuần sau sau nữa (còn hạn) → đăng ký được
  perform public.busy_register('1001', date_trunc('week', public.vn_today())::date + 15, 'OFF', '{}');
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  perform public.busy_register('1001', public.vn_today() + 1, 'BAN', '{1,2}');   -- QL đăng ký hộ sau hạn được
  if not exists (select 1 from jsonb_array_elements(public.todo_list('1001', public.vn_today())) x where x ->> 'k' = 'busy_tm') then raise exception 'thiếu nhắc lịch bận ngày mai'; end if;
  if public.busy_deadline(date '2026-11-23') <> timestamptz '2026-11-20 22:00+07' then raise exception 'hạn đăng ký sai: %', public.busy_deadline(date '2026-11-23'); end if;
end $$;
reset role;
delete from busy where staff_id = '1001' and busy_date >= public.vn_today(); delete from cleaning where clean_date = public.vn_today() + 1; delete from media_reports where staff_id = '1001';
select 'todo_test OK';
-- B2: môn tháng bị bỏ tích "Bật" thì không còn trong báo cáo ngày
insert into monthly_targets(staff_id, month, revenue_target, items) values ('1003', date_trunc('month', public.vn_today())::date, 100, '[{"name":"Sim","target":60},{"name":"Bảo hiểm","target":40}]')
on conflict (staff_id, month) do update set items = excluded.items;
update items set active = false where name = 'Bảo hiểm';
do $$ declare n text; begin
  select string_agg(name, ',') into n from public._staff_items('1003', public.vn_today());
  if n like '%Bảo hiểm%' or n not like '%Sim%' then raise exception 'môn tắt vẫn hiện: %', n; end if;
end $$;
update items set active = true where name = 'Bảo hiểm';
select 'items_active OK';
