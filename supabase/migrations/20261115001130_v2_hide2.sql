-- D20: 🙈 Ẩn chức năng kiểu mới — HIDE2 = { khoá: { label, hide: ["*"] hoặc [bộ phận…] } }, Admin bật "chế độ ẩn" bấm thẳng trên trang.
-- Chuyển các mục đang ẩn kiểu cũ (HIDE.employee) sang HIDE2 (ẩn với mọi NV), rồi để trống HIDE.employee (1 nguồn duy nhất).
-- Chỉ Admin ghi được HIDE / HIDE2.

insert into public.settings(key, value, updated_by)
select 'HIDE2', coalesce((select jsonb_object_agg(k, jsonb_build_object('label', k, 'hide', jsonb_build_array('*')))
                          from jsonb_array_elements_text(coalesce((select value -> 'employee' from public.settings where key = 'HIDE'), '[]'::jsonb)) k), '{}'::jsonb), 'd20'
on conflict (key) do nothing;
update public.settings set value = jsonb_set(value, '{employee}', '[]'::jsonb), updated_at = now(), updated_by = 'd20'
 where key = 'HIDE' and jsonb_typeof(value -> 'employee') = 'array';

drop policy if exists settings_owner_write on public.settings;
create policy settings_owner_write on public.settings for all to authenticated
  using (public.is_owner() and (key not in ('HIDE', 'HIDE2') or public.is_admin()))
  with check (public.is_owner() and (key not in ('HIDE', 'HIDE2') or public.is_admin()));
