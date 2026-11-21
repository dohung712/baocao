-- D11 Phát tờ rơi: tạo đợt, chia người / ngày, sửa nhân sự, NV nộp ảnh, quyền
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('own@x.vn','owner',null,'{}'), ('nv1001@x.vn','employee','1001','{Topzone}'), ('nv1003@x.vn','employee','1003','{Topzone}') on conflict do nothing;
-- chỉ cho kiểm thử: đọc thẳng bảng (bảng thật chỉ đọc qua hàm)
do $$ declare t text; begin foreach t in array array['flyer_routes','flyer_campaigns','flyer_tasks','flyer_assign'] loop
  execute format('drop policy if exists test_read on public.%I', t); execute format('create policy test_read on public.%I for select to authenticated using (true)', t);
  execute format('grant select on public.%I to authenticated', t); end loop;
  drop policy if exists test_upd on public.flyer_tasks; create policy test_upd on public.flyer_tasks for update to authenticated using (true); grant update on public.flyer_tasks to authenticated; end $$;
delete from flyer_campaigns;
update flyer_routes set last_used = null;
set role authenticated;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  begin perform public.flyer_generate(300); raise exception 'NV không được tạo đợt'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  begin perform public.flyer_route_save(null, 'x', '', 10, 1, '', true); raise exception 'NV không được thêm tuyến'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  if jsonb_array_length(public.flyer_board() -> 'routes') <> 0 then raise exception 'NV không được xem danh mục tuyến'; end if;
end $$;
select set_config('request.jwt.claims', '{"email":"own@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare r jsonb; b jsonb; v_c bigint; v_sum int; v_t bigint; n int; begin
  if (select count(*) from public.flyer_routes) <> 31 then raise exception 'phải có 31 tuyến seed'; end if;
  r := public.flyer_generate(500, public.vn_today() + 1, null, '19:30');
  v_c := (r ->> 'campaign_id')::bigint;
  select sum(qty) into v_sum from public.flyer_tasks where campaign_id = v_c;
  if v_sum <> 500 then raise exception 'tổng tờ phải = 500, có %', v_sum; end if;
  if exists (select 1 from public.flyer_tasks where campaign_id = v_c and due_hm <> '19:30') then raise exception 'giờ hạn sai'; end if;
  if exists (select 1 from public.flyer_tasks t where t.campaign_id = v_c and not exists (select 1 from public.flyer_assign a where a.task_id = t.id)) then raise exception 'có tuyến chưa có người'; end if;
  if exists (select 1 from public.flyer_tasks t where t.campaign_id = v_c and (select sum(qty) from public.flyer_assign a where a.task_id = t.id) <> t.qty) then raise exception 'chia số tờ cho người không khớp'; end if;
  if (select max(due_date) - min(due_date) from public.flyer_tasks where campaign_id = v_c) > 3 then raise exception 'tối đa 4 ngày'; end if;
  -- 2 lượt phát liên tiếp: tuyến đã phát đợt 1 không bị chọn lại trước tuyến chưa phát
  r := public.flyer_generate(300, public.vn_today() + 5, 2);
  if exists (select 1 from public.flyer_tasks t2 where t2.campaign_id = (r ->> 'campaign_id')::bigint and t2.route_id in (select route_id from public.flyer_tasks where campaign_id = v_c)) then raise exception 'đợt 2 chọn lại tuyến đã phát'; end if;
  begin perform public.flyer_generate(99999); raise exception 'phải báo thiếu tờ'; exception when others then if sqlerrm not like '%thiếu%' then raise; end if; end;
  -- Sửa nhân sự + ngày
  select id into v_t from public.flyer_tasks where campaign_id = v_c order by id limit 1;
  perform public.flyer_task_assign(v_t, array['1001','1003']);
  if (select count(*) from public.flyer_assign where task_id = v_t) <> 2 then raise exception 'sửa nhân sự không đúng'; end if;
  update public.flyer_tasks set reminded_at = now() where id = v_t;
  perform public.flyer_task_update(v_t, public.vn_today() + 2, '18:00', 40);
  if (select reminded_at from public.flyer_tasks where id = v_t) is not null then raise exception 'đổi giờ hạn phải nhắc lại'; end if;
  if (select sum(qty) from public.flyer_assign where task_id = v_t) <> 40 then raise exception 'chia lại số tờ sai'; end if;
  b := public.flyer_board();
  if jsonb_array_length(b -> 'campaigns') < 2 then raise exception 'board thiếu đợt'; end if;
  -- đợt mới chưa báo Telegram; NV có 'lịch sắp tới' trong việc cần làm
  if (select announced_at from public.flyer_campaigns where id = (r ->> 'campaign_id')::bigint) is not null then raise exception 'đợt mới phải chờ báo Telegram'; end if;
  if not exists (select 1 from jsonb_array_elements(public.flyer_todo((select a.staff_id from public.flyer_assign a join public.flyer_tasks t on t.id = a.task_id
      where t.campaign_id = (r ->> 'campaign_id')::bigint limit 1), public.vn_today())) x where x ->> 'k' = 'fl_next') then raise exception 'thiếu nhắc lịch sắp tới'; end if;
  -- Xoá đợt 2
  perform public.flyer_campaign_delete((r ->> 'campaign_id')::bigint);
  -- Thêm / sửa tuyến
  perform public.flyer_route_save(null, 'Tuyến thử', 'https://maps.app.goo.gl/x', 70, 3, '', true);
  select count(*) into n from public.flyer_routes where name = 'Tuyến thử' and people = 3; if n <> 1 then raise exception 'thêm tuyến lỗi'; end if;
  perform public.flyer_route_delete((select id from public.flyer_routes where name = 'Tuyến thử'));
end $$;
-- NV nộp ảnh
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare v_t bigint; r jsonb; begin
  select t.id into v_t from public.flyer_tasks t join public.flyer_assign a on a.task_id = t.id where a.staff_id = '1001' order by t.id limit 1;
  begin perform public.flyer_report(v_t, '1001', '{}'); raise exception 'phải cần ảnh'; exception when others then if sqlerrm not like '%Cần 1–6%' then raise; end if; end;
  begin perform public.flyer_report(v_t, '1001', array['v2:clean/x.jpg']); raise exception 'sai thư mục ảnh'; exception when others then if sqlerrm not like '%Cần 1–6%' then raise; end if; end;
  begin perform public.flyer_report(v_t, '1003', array['v2:flyer/a.jpg']); raise exception 'không báo hộ người khác'; exception when others then if sqlerrm not like '%không thao tác%' then raise; end if; end;
  r := public.flyer_report(v_t, '1001', array['v2:flyer/a.jpg', 'v2:flyer/b.jpg']);
  if not exists (select 1 from public.flyer_assign where task_id = v_t and staff_id = '1001' and done_at is not null) then raise exception 'chưa ghi hoàn tất'; end if;
  if jsonb_array_length(public.flyer_todo('1001', public.vn_today())) < 0 then raise exception 'todo lỗi'; end if;
  begin perform public.flyer_report_clear(v_t, '1001'); raise exception 'NV không xoá báo cáo'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
end $$;
reset role;
do $$ declare t text; begin foreach t in array array['flyer_routes','flyer_campaigns','flyer_tasks','flyer_assign'] loop
  execute format('drop policy if exists test_read on public.%I', t); end loop;
  drop policy if exists test_upd on public.flyer_tasks; revoke update on public.flyer_tasks from authenticated; end $$;
delete from flyer_campaigns;
update flyer_routes set last_used = null;
\echo flyer_test OK
