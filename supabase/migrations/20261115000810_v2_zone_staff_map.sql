-- D8: bộ phận đúng tên trong danh sách NV (TGDĐ), gắn đúng NV phụ trách từng khu vực (Hiếu + Linh, Trinh + Trang, Quỳnh Anh…),
-- QL đổi người trực vệ sinh trong lịch (clean_reassign).
do $$ begin
  if exists (select 1 from public.staff where dept = 'TGDĐ') and not exists (select 1 from public.staff where dept = 'Thế Giới Di Động') then
    update public.clean_zones set dept = 'TGDĐ' where dept = 'Thế Giới Di Động';
  end if;
end $$;

-- Gắn theo mã NV (chỉ gắn mã đang có trong danh sách NV)
update public.clean_zones z set staff_ids = array(select s.id from public.staff s where s.id = any(m.ids) order by array_position(m.ids, s.id)),
  staff_text = coalesce(m.txt, z.staff_text), updated_by = 'map', updated_at = now()
from (values
  ('ĐỒNG HỒ', array['259623', '1'], null),
  ('TỦ PHONE', array['269167'], null),
  ('BÀN TRẢI NGHIỆM | BÀN TƯ VẤN QUẦY THU NGÂN | QUẦY NV + Ụ', array['29649'], null),
  ('VÁCH PHỤ KIỆN', array['204201'], null),
  ('Kính mặt tiền (Trong Ngoài)', array['204201'], null),
  ('Macbook + Phụ Kiện + Standy + Tủ Điện', array['189769', '170266'], 'Hiếu + Linh'),
  ('Apple Watch + Imac + Phụ Kiện', array['183180', '45500'], 'Trinh + Trang'),
  ('Trục Giữa: Bàn Các Loại + Tủ Điện Thoại', array['98486'], 'Quỳnh Anh + New')
) as m(name, ids, txt)
where z.name = m.name and z.kind = 'zone' and z.staff_ids = '{}'
  and exists (select 1 from public.staff s where s.id = any(m.ids));

-- QL đổi người trực vệ sinh của 1 ngày (giữ ảnh đã nộp nếu có)
create or replace function public.clean_reassign(p_date date, p_staff text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; n int;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý đổi được người trực vệ sinh.'; end if;
  if not exists (select 1 from public.staff where id = p_staff and not hidden) then raise exception 'Không tìm thấy nhân viên.'; end if;
  update public.cleaning set staff_id = p_staff, created_by = m.email where clean_date = p_date;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ngày % chưa có ai đăng ký.', to_char(p_date, 'DD/MM'); end if;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'CLEAN_REASSIGN', p_staff, jsonb_build_object('date', p_date));
  return jsonb_build_object('status', 'success', 'message', 'Đã đổi người trực vệ sinh ngày ' || to_char(p_date, 'DD/MM'));
end $$;
grant execute on function public.clean_reassign(date, text) to authenticated;
