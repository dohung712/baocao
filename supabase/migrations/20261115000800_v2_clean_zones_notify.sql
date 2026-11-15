-- =====================================================================
-- D8 Khu vực vệ sinh (CV → 📍 Khu vực VS): khu vực / ca / vị trí của từng bộ phận, mô tả chi tiết, người phụ trách,
-- NV phụ trách bấm "Xong hôm nay"; QL sửa được. E1: QL chỉnh lịch gửi Telegram (giờ, hằng ngày / hằng tuần / chọn thứ).
-- =====================================================================
create table if not exists public.clean_zones (
  id bigint generated always as identity primary key,
  dept text not null,
  kind text not null default 'zone' check (kind in ('zone', 'shift', 'spot')),   -- khu vực có người phụ trách · việc theo ca · vị trí & tiêu chí
  name text not null,
  detail text not null default '',          -- mỗi dòng 1 ý, **chữ đậm**
  staff_text text not null default '',      -- ghi như bảng gốc (VD "Trâm + PG Oppo")
  staff_ids text[] not null default '{}',  -- NV trong tool được giao (để hiện "Khu vực của tôi")
  sort int not null default 0,
  updated_by text, updated_at timestamptz not null default now()
);
create table if not exists public.clean_zone_checks (
  zone_id bigint not null references public.clean_zones(id) on delete cascade,
  d date not null,
  staff_id text not null,
  note text not null default '',
  at timestamptz not null default now(),
  primary key (zone_id, d, staff_id)
);
alter table public.clean_zones enable row level security;
alter table public.clean_zone_checks enable row level security;
drop policy if exists clean_zones_read on public.clean_zones;
create policy clean_zones_read on public.clean_zones for select to authenticated using (public.is_member());
drop policy if exists clean_zone_checks_read on public.clean_zone_checks;
create policy clean_zone_checks_read on public.clean_zone_checks for select to authenticated using (public.is_member());
grant select on public.clean_zones, public.clean_zone_checks to authenticated;
revoke insert, update, delete on public.clean_zones, public.clean_zone_checks from authenticated;
revoke all on public.clean_zones, public.clean_zone_checks from anon;

insert into public.settings(key, value, updated_by) values ('CLEAN_CRITERIA', to_jsonb('TỔNG VỆ SINH KỸ CÀNG ĐÚNG TIÊU CHÍ: KHÔNG KEO - KHÔNG BỤI - KHÔNG RÁC, VẬT DỤNG THỪA.
TRÁNH VIỆC LÀM ẨU RỒI PHẢI VỆ SINH LẠI.
HOÀN TẤT VỆ SINH SỚM VÀO CHỈNH LẠI LINE CỦA MÌNH VÀ HÀNG HOÁ TẤP LINE.'::text), 'system') on conflict (key) do nothing;

do $$ begin
  if not exists (select 1 from public.clean_zones) then
    insert into public.clean_zones(dept, kind, name, detail, staff_text, sort, updated_by)
    select x.dept, x.kind, x.name, x.detail, x.staff_text, x.sort, 'seed' from jsonb_to_recordset('[{"dept": "Thế Giới Di Động", "kind": "zone", "name": "ĐỒNG HỒ", "detail": "Trưng bày **theo quy tắc**\n**100%** có giá chính xác từng sản phẩm\nKiểm tra ly nước định kỳ **thứ 3 và thứ 6** hàng tuần\nĐảm bảo **không bụi** vệ sinh sạch sẽ ngóc ngách\nHộp được **tấp line** cùng khối cùng màu, ngay ngắn, không có ví trí trống.", "staff_text": "Trang + PG SS", "sort": 1}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "TỦ PHONE", "detail": "Ngăn 1 và ngăn 5 tấp line **cùng model, không có vị trí trống**\nNgăn tủ giá sốc **tối thiểu 6 sản phẩm,** có sticker giảm giá\nChổ trống 100% có **Tấm Hết Hàng**, (1 Tủ không quá **3 tấm**)\nVệ sinh **sạch sẽ, không bụi**, chú ý các đầu thanh led", "staff_text": "Trâm + PG Oppo", "sort": 2}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "BÀN TRẢI NGHIỆM | BÀN TƯ VẤN QUẦY THU NGÂN | QUẦY NV + Ụ", "detail": "100% sản phẩm trưng bày **được bật** và kết nối **Wifi**\nĐảm bảo có đế là **có máy trải nghiệm (Không máy thì OFF đế)**\nVệ sinh sạch sẽ **không bụi bẩn** (chú ý **chân bàn** trải nghiệm)\nBTV sắp xếp ngay ngắn **không vật dụng thừa** dao mổ, vệ sinh sạch sẽ **không KEO**\nKhông bụi-rác-keo trên bàn.\nVật dụng bỏ đúng nơi, phụ kiện-hàng lỗi bỏ vào thùng.\nHộc máy in, hộc tủ sạch sẽ, không giấy rác\nBàn trang trí không vật dụng thừa, sắp xếp gọn gàng.", "staff_text": "Thy + PG Oppo", "sort": 3}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "VÁCH PHỤ KIỆN", "detail": "100% phụ kiện được **trưng bày Full** (Không trống móc)\n100% sx ngay ngắn, **không khoảng trống**, theo từng nhóm hàng\n100% vệ sinh sạch sẽ **chú ý ốp lưng**\nDán và thay thế sticker **CTKM của tháng** (POPUP đúng thời gian)", "staff_text": "Nhân + PG Xiaomi", "sort": 4}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "Kính mặt tiền (Trong Ngoài)", "detail": "Vệ sinh keo, lau kính đúng cách", "staff_text": "Nhân + PG Nam", "sort": 5}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "Hộp Logo, Bình chữa cháy, trần nhà Full ST", "detail": "Sạch bụi, không màn nhện và keo", "staff_text": "PG Nam", "sort": 6}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "Bàn Ăn + Kệ", "detail": "Sạch sẽ, không vật dụng thừa. Ko Mùi.", "staff_text": "PG Nữ", "sort": 7}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "Phòng Kho", "detail": "", "staff_text": "", "sort": 8}, {"dept": "Thế Giới Di Động", "kind": "zone", "name": "Nhà Vệ Sinh", "detail": "", "staff_text": "", "sort": 9}, {"dept": "Topzone", "kind": "zone", "name": "Macbook + Phụ Kiện + Standy + Tủ Điện", "detail": "100% sản phẩm trưng bày được **bật** và kết nối **Wifi**\nĐảm bảo có đế là **có máy trải nghiệm** (Không máy thì OFF đế)\nVệ sinh sạch sẽ **không bụi bẩn** (chú ý **chân bàn** trải nghiệm)\n**Bảng Giá đúng**, Thẳng không bị cong.\nKhông bụi-rác-keo trên bàn.", "staff_text": "Hiếu Linh", "sort": 10}, {"dept": "Topzone", "kind": "zone", "name": "Apple Watch + Imac + Phụ Kiện", "detail": "100% sản phẩm trưng bày được **bật** và kết nối **Wifi**\nĐảm bảo có đế là **có máy trải nghiệm** (Không máy thì OFF đế)\nVệ sinh sạch sẽ **không bụi bẩn** (chú ý **chân bàn** trải nghiệm)\n**Bảng Giá đúng**, Thẳng không bị cong.\nKhông bụi-rác-keo trên bàn.", "staff_text": "Trinh Trang", "sort": 11}, {"dept": "Topzone", "kind": "zone", "name": "Trục Giữa: Bàn Các Loại + Tủ Điện Thoại", "detail": "100% sản phẩm trưng bày được **bật** và kết nối **Wifi**\nĐảm bảo có đế là **có máy trải nghiệm** (Không máy thì OFF đế)\nVệ sinh sạch sẽ **không bụi bẩn** (chú ý **chân bàn** trải nghiệm)\n**Bảng Giá đúng**, Thẳng không bị cong.\nKhông bụi-rác-keo trên bàn.\nĐiện thoại sắp xếp theo **code, fifo**, gọn gàng, không bụi, mạng nhện", "staff_text": "QAnh + New", "sort": 12}, {"dept": "Topzone", "kind": "shift", "name": "Ca 1", "detail": "**Kiểm tra vệ sinh toàn bộ siêu thị**", "staff_text": "", "sort": 13}, {"dept": "Topzone", "kind": "shift", "name": "Ca 6", "detail": "**Lau sàn nhà, sắp xếp lại hàng hóa, bàn thu ngân, bàn tư vấn. Chụp hình báo cáo**", "staff_text": "", "sort": 14}, {"dept": "Topzone", "kind": "spot", "name": "Hộp Logo, Bình chữa cháy, trần nhà Full ST", "detail": "Sạch bụi, không màn nhện và keo", "staff_text": "", "sort": 15}, {"dept": "Topzone", "kind": "spot", "name": "Kính mặt tiền (Trong Ngoài)", "detail": "Vệ sinh keo, lau kính đúng cách", "staff_text": "", "sort": 16}, {"dept": "Topzone", "kind": "spot", "name": "Sàn nhà Full ST", "detail": "Vết keo cứng đầu sử dụng **SUMO** (Chú ý các ngóc ngách, gần vách kính,...)", "staff_text": "", "sort": 17}, {"dept": "Topzone", "kind": "spot", "name": "Toilet", "detail": "Vệ sinh sạch keo, vật dụng đúng nơi", "staff_text": "", "sort": 18}, {"dept": "Topzone", "kind": "spot", "name": "Quầy NV, Bàn Trải Nghiệm", "detail": "Vệ sinh sạch sẽ, không keo, không bụi. Hộc tủ dọn sạch.", "staff_text": "", "sort": 19}, {"dept": "Topzone", "kind": "spot", "name": "Tủ Phone (Full hộc), BTV, Quầy Loa", "detail": "Tủ Phone trên dưới, sạch bụi, sạch keo và sắp xếp hàng ngay ngắn.", "staff_text": "", "sort": 20}, {"dept": "Topzone", "kind": "spot", "name": "Kho ICT", "detail": "Vứt hết vật dụng thừa/không sử dụng được. Phân thùng có định danh gọn gàng.", "staff_text": "", "sort": 21}, {"dept": "Topzone", "kind": "spot", "name": "Kho ĐM Tầng 2", "detail": "Gôm thùng, gôm hàng phân loại đúng khu, tối ưu kệ để chứa hàng, vứt sạch vật dụng thừa", "staff_text": "", "sort": 22}, {"dept": "Topzone", "kind": "spot", "name": "Kho ĐM Tầng 1", "detail": "Chia kho từng nhóm để hàng riêng biệt (Không lộn xộn nhóm hàng, mockup, kệ không sử dụng cho lên tầng trên).", "staff_text": "", "sort": 23}]'::jsonb) as x(dept text, kind text, name text, detail text, staff_text text, sort int);
  end if;
end $$;

create or replace function public.zone_save(p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_id bigint;
  v_ids text[] := array(select jsonb_array_elements_text(coalesce(p_data -> 'staff_ids', '[]'::jsonb)));
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý sửa được khu vực vệ sinh.'; end if;
  if btrim(coalesce(p_data ->> 'name', '')) = '' then raise exception 'Nhập tên khu vực.'; end if;
  if coalesce(p_data ->> 'kind', 'zone') not in ('zone', 'shift', 'spot') then raise exception 'Loại không hợp lệ.'; end if;
  if p_id is null then
    insert into public.clean_zones(dept, kind, name, detail, staff_text, staff_ids, sort, updated_by)
    values (btrim(p_data ->> 'dept'), coalesce(p_data ->> 'kind', 'zone'), btrim(p_data ->> 'name'), coalesce(p_data ->> 'detail', ''), btrim(coalesce(p_data ->> 'staff_text', '')), v_ids,
            coalesce((p_data ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.clean_zones)), m.email) returning id into v_id;
  else
    update public.clean_zones set dept = btrim(p_data ->> 'dept'), kind = coalesce(p_data ->> 'kind', 'zone'), name = btrim(p_data ->> 'name'), detail = coalesce(p_data ->> 'detail', ''),
      staff_text = btrim(coalesce(p_data ->> 'staff_text', '')), staff_ids = v_ids, sort = coalesce((p_data ->> 'sort')::int, sort), updated_by = m.email, updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy khu vực.'; end if;
  end if;
  return jsonb_build_object('status', 'success', 'id', v_id, 'message', 'Đã lưu khu vực');
end $$;

create or replace function public.zone_delete(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý xoá được khu vực vệ sinh.'; end if;
  delete from public.clean_zones where id = p_id;
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá khu vực');
end $$;

-- NV bấm "Xong hôm nay" cho khu vực mình phụ trách (bấm lại để huỷ). QL bấm hộ được.
create or replace function public.zone_check(p_id bigint, p_staff text default null, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_staff text; v_done boolean;
begin
  m := public._require_member();
  v_staff := coalesce(nullif(p_staff, ''), m.staff_id);
  if v_staff is null then raise exception 'Tài khoản chưa gắn mã nhân viên.'; end if;
  if v_staff <> coalesce(m.staff_id, '') and m.role not in ('owner', 'manager') then raise exception 'Chỉ xác nhận được cho chính bạn.'; end if;
  if not exists (select 1 from public.clean_zones where id = p_id) then raise exception 'Không tìm thấy khu vực.'; end if;
  delete from public.clean_zone_checks where zone_id = p_id and d = public.vn_today() and staff_id = v_staff;
  get diagnostics v_done = row_count;
  if not v_done then
    insert into public.clean_zone_checks(zone_id, d, staff_id, note) values (p_id, public.vn_today(), v_staff, btrim(coalesce(p_note, '')));
    return jsonb_build_object('status', 'success', 'done', true, 'message', '✅ Đã báo vệ sinh xong hôm nay');
  end if;
  return jsonb_build_object('status', 'success', 'done', false, 'message', 'Đã huỷ xác nhận');
end $$;

-- E1: QL (và chủ quản) chỉnh lịch gửi từng đầu mục Telegram
create or replace function public.save_notify_items(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v jsonb := '[]'::jsonb; e jsonb;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý chỉnh được lịch gửi.'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Dữ liệu không hợp lệ.'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    continue when coalesce(e ->> 'id', '') = '';
    if coalesce(e ->> 'time', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Giờ gửi không hợp lệ: %', e ->> 'time'; end if;
    if coalesce(e ->> 'freq', 'daily') not in ('daily', 'weekly', 'days', 'due') then raise exception 'Tần suất không hợp lệ.'; end if;
    v := v || jsonb_build_object('id', e ->> 'id', 'on', coalesce((e ->> 'on')::boolean, false), 'time', e ->> 'time', 'freq', coalesce(e ->> 'freq', 'daily'),
      'dow', coalesce((e ->> 'dow')::int, 0), 'dows', coalesce(e -> 'dows', '[]'::jsonb));
  end loop;
  insert into public.settings(key, value, updated_by) values ('NOTIFY_ITEMS', v, m.email)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log(actor, action, target, details) values (m.email, 'NOTIFY_ITEMS', null, v);
  return jsonb_build_object('status', 'success', 'message', 'Đã lưu lịch gửi');
end $$;

grant execute on function public.zone_save(bigint, jsonb), public.zone_delete(bigint), public.zone_check(bigint, text, text), public.save_notify_items(jsonb) to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['clean_zones', 'clean_zone_checks'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
