-- Kiểm thử migration 0890 trên DB thật mà KHÔNG lưu gì: chạy migration trong giao dịch, test, rồi cố ý raise để huỷ toàn bộ.
-- Cách dùng: dán nội dung migration 0890 vào chỗ <<MIGRATION>> rồi chạy cả file trong SQL Editor. Kết quả nằm trong thông báo lỗi "KQ ...".
begin;
<<MIGRATION>>
;
do $t$
declare
  r jsonb := '{}'::jsonb; v_staff text; v_dept text; v_item text; v_n0 int; v_n1 int; v_n2 int; x jsonb; v_id bigint;
  v_mgr text; v_mgr_store text; v_other text; v_names text[];
begin
  select s.id, s.dept into v_staff, v_dept from public.staff s
   where not s.hidden and s.dept is not null and exists (select 1 from public._staff_items(s.id, public.vn_today()))
   order by s.id limit 1;
  select count(*) into v_n0 from public._staff_items(v_staff, public.vn_today());
  select name into v_item from public._staff_items(v_staff, public.vn_today()) limit 1;
  r := r || jsonb_build_object('staff_items_before', v_n0);

  -- Chủ quản: tắt môn cho bộ phận của NV
  perform set_config('request.jwt.claims', '{"email":"dohung712@gmail.com","role":"authenticated"}', true);
  set local role authenticated;
  x := public.items_quick_save(jsonb_build_array(jsonb_build_object('store', v_dept, 'name', v_item, 'active', false)));
  r := r || jsonb_build_object('owner_off', x ->> 'message');
  x := public.report_form(v_staff, public.vn_today());
  r := r || jsonb_build_object('form_all_have_noPen', (select bool_and(e ? 'noPen') from jsonb_array_elements(x -> 'items') e),
                               'form_item_hidden', not exists (select 1 from jsonb_array_elements(x -> 'items') e where e ->> 'name' = v_item));
  reset role;
  select count(*) into v_n1 from public._staff_items(v_staff, public.vn_today());
  r := r || jsonb_build_object('staff_items_after_off', v_n1);

  -- Bật lại + đặt sao phạt 0 → noPen = true
  set local role authenticated;
  x := public.items_quick_save(jsonb_build_array(jsonb_build_object('store', v_dept, 'name', v_item, 'active', true, 'penalty', 0, 'bonus', 777)));
  x := public.report_form(v_staff, public.vn_today());
  r := r || jsonb_build_object('item_back_with_nopen', (select (e ->> 'noPen')::boolean from jsonb_array_elements(x -> 'items') e where e ->> 'name' = v_item),
                               'item_bonus_777', (select (e ->> 'bonus')::int = 777 or exists (select 1 from public.staff_targets t where t.staff_id = v_staff and t.item_name = v_item and t.bonus_star is not null)
                                                  from jsonb_array_elements(x -> 'items') e where e ->> 'name' = v_item));
  -- Xem trước báo cáo vẫn tính được với môn đã đổi
  select array_agg(e ->> 'name') into v_names from jsonb_array_elements(x -> 'items') e;
  x := public.preview_daily_report(v_staff, public.vn_today(), (select jsonb_agg(jsonb_build_object('itemName', n, 'actual', 0, 'compensation', 'DUNG_SAO')) from unnest(v_names) n));
  r := r || jsonb_build_object('preview_rows', jsonb_array_length(coalesce(x -> 'rows', '[]'::jsonb)));
  -- Bỏ mức riêng → quay về theo Chung
  x := public.items_quick_save(jsonb_build_array(jsonb_build_object('store', v_dept, 'name', v_item, 'reset', true)));
  reset role;
  select count(*) into v_n2 from public._staff_items(v_staff, public.vn_today());
  r := r || jsonb_build_object('reset_msg', x ->> 'message', 'staff_items_after_reset', v_n2,
                               'dept_row_left', exists (select 1 from public.items where store = v_dept and name = v_item));

  -- Quản lý: không sửa được "Chung" / bộ phận ngoài phạm vi
  select m.email, m.stores[1] into v_mgr, v_mgr_store from public.memberships m where m.role = 'manager' and m.active and cardinality(m.stores) > 0 limit 1;
  if v_mgr is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('email', v_mgr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin x := public.items_quick_save(jsonb_build_array(jsonb_build_object('store', 'Chung', 'name', v_item, 'active', false))); r := r || '{"mgr_chung":"KHONG CHAN (loi)"}';
    exception when others then r := r || jsonb_build_object('mgr_chung_blocked', sqlerrm); end;
    select d into v_other from (select distinct dept d from public.staff where dept is not null) z
      where not (d = any((select stores from public.memberships where email = v_mgr))) limit 1;
    if v_other is not null then
      begin x := public.items_quick_save(jsonb_build_array(jsonb_build_object('store', v_other, 'name', v_item, 'active', false))); r := r || '{"mgr_other":"KHONG CHAN (loi)"}';
      exception when others then r := r || jsonb_build_object('mgr_other_blocked', sqlerrm); end;
    end if;
    begin x := public.items_quick_save(jsonb_build_array(jsonb_build_object('store', v_mgr_store, 'name', v_item, 'bonus', 123)));
      r := r || jsonb_build_object('mgr_own_store', x ->> 'message');
    exception when others then r := r || jsonb_build_object('mgr_own_store_err', sqlerrm); end;
    reset role;
  else r := r || '{"mgr":"khong co quan ly de test"}'; end if;

  -- Nhân viên: không gọi được items_quick_save
  perform set_config('request.jwt.claims', jsonb_build_object('email', 'nv' || lower(v_staff) || '@thidua351.vn', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin x := public.items_quick_save('[]'::jsonb); r := r || '{"nv_quick":"KHONG CHAN (loi)"}';
  exception when others then r := r || jsonb_build_object('nv_quick_blocked', sqlerrm); end;
  reset role;

  -- Biên bản: chủ quản ghi có giờ + ảnh, xoá trả về ảnh; mã ảnh bậy bị chặn
  perform set_config('request.jwt.claims', '{"email":"dohung712@gmail.com","role":"authenticated"}', true);
  set local role authenticated;
  x := public.add_violation(v_staff, public.vn_today(), 'Khác', 'test', '10:30'::time, array['1AbCdEfGhIjKlMnOpQrStUvWxYz']);
  v_id := (x ->> 'id')::bigint;
  r := r || jsonb_build_object('vio_add', x ->> 'message');
  r := r || jsonb_build_object('vio_row', (select jsonb_build_object('time', v_time, 'photos', cardinality(photos)) from public.violations where id = v_id));
  x := public.add_violation(v_staff, public.vn_today(), 'Khác', 'cu', null, '{}');   -- kiểu gọi cũ (4 tham số + mặc định) vẫn chạy
  r := r || jsonb_build_object('vio_old_call', x ->> 'message');
  begin x := public.add_violation(v_staff, public.vn_today(), 'Khác', 'x', null, array['<script>']); r := r || '{"vio_bad_photo":"KHONG CHAN (loi)"}';
  exception when others then r := r || jsonb_build_object('vio_bad_photo_blocked', sqlerrm); end;
  x := public.delete_violation(v_id, 'test xoa');
  r := r || jsonb_build_object('vio_delete_photos', x -> 'photos');
  reset role;

  raise exception 'KQ %', r;
end $t$;
