-- D8 Khu vực vệ sinh + E1 lịch gửi Telegram do QL chỉnh
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1001@x.vn','employee','1001','{Topzone}'), ('mgr@x.vn','manager',null,'{Topzone}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare z bigint; begin
  if (select count(*) from public.clean_zones) < 20 then raise exception 'thiếu dữ liệu khu vực mẫu'; end if;
  begin perform public.zone_save(null, '{"dept":"Topzone","name":"X"}'); raise exception 'NV không được thêm khu vực'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  begin perform public.save_notify_items('[{"id":"daily","on":true,"time":"21:00","freq":"daily"}]'); raise exception 'NV không được chỉnh lịch'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  select id into z from public.clean_zones where dept = 'Topzone' order by sort limit 1;
  if not (public.zone_check(z) ->> 'done')::boolean then raise exception 'phải báo xong'; end if;
  if (select count(*) from public.clean_zone_checks where zone_id = z and staff_id = '1001') <> 1 then raise exception 'thiếu bản ghi xong'; end if;
  if (public.zone_check(z) ->> 'done')::boolean then raise exception 'bấm lần 2 phải huỷ'; end if;
  begin perform public.clean_reassign(public.vn_today(), '1003'); raise exception 'NV không được đổi người trực'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  begin perform public.zone_check(z, '1003'); raise exception 'NV không được báo hộ'; exception when others then if sqlerrm not like '%chính bạn%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare z bigint; v jsonb; begin
  z := (public.zone_save(null, '{"dept":"Topzone","kind":"spot","name":"Kho test","detail":"**Sạch**\nGọn","staff_ids":["1001"]}') ->> 'id')::bigint;
  perform public.zone_save(z, '{"dept":"Topzone","kind":"zone","name":"Kho test 2","detail":"x","staff_text":"Ai đó","staff_ids":["1001","1003"]}');
  if (select name || kind || array_length(staff_ids, 1) from public.clean_zones where id = z) <> 'Kho test 2zone2' then raise exception 'sửa khu vực sai'; end if;
  perform public.zone_check(z, '1003');
  perform public.zone_delete(z);
  if exists (select 1 from public.clean_zone_checks where zone_id = z) then raise exception 'xoá khu vực phải xoá luôn xác nhận'; end if;
  perform public.save_notify_items('[{"id":"clean","on":true,"time":"20:15","freq":"days","dows":[1,3,5]},{"id":"weekly","on":true,"time":"22:45","freq":"weekly","dow":6}]');
  select value into v from public.settings where key = 'NOTIFY_ITEMS';
  if v -> 0 ->> 'freq' <> 'days' or v -> 0 -> 'dows' <> '[1,3,5]'::jsonb or (v -> 1 ->> 'dow')::int <> 6 then raise exception 'lưu lịch sai: %', v; end if;
  begin perform public.save_notify_items('[{"id":"clean","on":true,"time":"25:00","freq":"daily"}]'); raise exception 'giờ sai phải báo lỗi'; exception when others then if sqlerrm not like '%Giờ gửi%' then raise; end if; end;
  perform public.clean_register('1001', public.vn_today() + 3);
  perform public.clean_reassign(public.vn_today() + 3, '1003');
  if (select staff_id from public.cleaning where clean_date = public.vn_today() + 3) <> '1003' then raise exception 'đổi người trực sai'; end if;
  perform public.clean_delete(public.vn_today() + 3, false);
  begin perform public.save_notify_items('[{"id":"clean","on":true,"time":"20:00","freq":"monthly"}]'); raise exception 'tần suất sai phải báo lỗi'; exception when others then if sqlerrm not like '%Tần suất%' then raise; end if; end;
end $$;
reset role;
select 'zones_test OK';
