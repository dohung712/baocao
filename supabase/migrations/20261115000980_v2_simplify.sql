-- Gọn tool (23/11/2026, chủ quản chọn):
--  • NV không thấy 🤖 Trợ lý và 📖 Rule (QL vào ở ☰ Thêm; bật lại ở Cài đặt → Ẩn trang). 🕒 Lịch sử thành nút "Báo cáo đã nộp" trong trang Báo cáo.
--  • Bỏ 📈 nhập lũy kế tay thứ 2 (C12): CUM_MANUAL = false, tắt tin Telegram "cum". Lũy kế lấy từ ảnh BI do QL duyệt (B16b).
--  • CV → Việc, CV → Thống kê bỏ khỏi giao diện (dữ liệu giữ nguyên) — xử lý ở v2/js/simplify.js.
--  • 🏢 Siêu thị bỏ khỏi danh sách ẩn (NV + QL): trang 🏠 Hôm nay hiện mục Doanh thu siêu thị + Thi đua siêu thị cho NV (H1).
insert into public.settings(key, value) values ('HIDE', '{"employee": [], "manager": []}'::jsonb) on conflict (key) do nothing;
update public.settings
   set value = jsonb_set(jsonb_set(value, '{employee}',
         (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
            from (select jsonb_array_elements_text(coalesce(value -> 'employee', '[]'::jsonb)) x union select unnest(array['assistant', 'rules'])) t
           where x <> 'store')),
         '{manager}',
         (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
            from jsonb_array_elements_text(coalesce(value -> 'manager', '[]'::jsonb)) x where x <> 'store')),
       updated_at = now()
 where key = 'HIDE';

insert into public.settings(key, value) values ('CUM_MANUAL', 'false'::jsonb)
on conflict (key) do update set value = 'false'::jsonb, updated_at = now();

-- Tin Telegram "Nhắc cập nhật lũy kế tuần": tắt
insert into public.settings(key, value) values ('NOTIFY_ITEMS', '[]'::jsonb) on conflict (key) do nothing;
update public.settings
   set value = case when exists (select 1 from jsonb_array_elements(value) e where e ->> 'id' = 'cum')
                    then (select jsonb_agg(case when e ->> 'id' = 'cum' then e || '{"on": false}'::jsonb else e end) from jsonb_array_elements(value) e)
                    else value || '[{"id": "cum", "on": false}]'::jsonb end,
       updated_at = now()
 where key = 'NOTIFY_ITEMS' and jsonb_typeof(value) = 'array';
