-- =====================================================================
-- D6 Quỹ thu chi (thay tool https://dohung712.github.io/quy/ dùng Firebase).
-- Mọi thành viên xem và thêm khoản; sửa / xoá: quản lý, chủ quản (hoặc người tạo trong 24 giờ). Có nhật ký.
-- =====================================================================
create table if not exists public.fund_tx (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('thu', 'chi')),
  title text not null,
  amount bigint not null check (amount > 0),
  tx_date date not null default public.vn_today(),
  category text not null default '',
  person text not null default '',
  note text not null default '',
  created_by text, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_id text unique                                    -- id tài liệu Firestore khi chép từ tool cũ
);
create index if not exists fund_tx_date_idx on public.fund_tx(tx_date desc, id desc);
alter table public.fund_tx enable row level security;
drop policy if exists fund_read on public.fund_tx;
create policy fund_read on public.fund_tx for select to authenticated using (public.is_member());
grant select on public.fund_tx to authenticated;
revoke insert, update, delete on public.fund_tx from authenticated;
revoke all on public.fund_tx from anon;

insert into public.settings(key, value, updated_by) values
  ('FUND_CATEGORIES', '["🍽️ Ăn uống","🚗 Ship","📦 Văn phòng phẩm","🤝 Trang trí","📱 Hỗ trợ khách hàng","📢 Marketing / Quảng cáo","🛒 POSM","💰 Khoán","💵 Thi đua","📋 Vệ Sinh","💵 Thu Khác","💵 Chi Khác"]'::jsonb, 'system'),
  ('FUND_PARTNERS', '["Oppo","Samsung","Xiaomi","Khác"]'::jsonb, 'system')
on conflict (key) do nothing;

create or replace function public.fund_save(p_id bigint, p_kind text, p_title text, p_amount bigint, p_date date, p_category text, p_person text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; o public.fund_tx; v_id bigint;
begin
  m := public._require_member();
  if p_kind not in ('thu', 'chi') then raise exception 'Chọn Thu hoặc Chi.'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Nhập tên khoản thu/chi.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Số tiền phải lớn hơn 0.'; end if;
  if p_date is null or p_date > public.vn_today() + 31 then raise exception 'Ngày không hợp lệ.'; end if;
  if p_id is null then
    insert into public.fund_tx(kind, title, amount, tx_date, category, person, note, created_by, updated_by)
    values (p_kind, btrim(p_title), p_amount, p_date, coalesce(p_category, ''), btrim(coalesce(p_person, '')), btrim(coalesce(p_note, '')), m.email, m.email)
    returning id into v_id;
    insert into public.audit_log(actor, action, target, details) values (m.email, 'FUND_ADD', v_id::text,
      jsonb_build_object('kind', p_kind, 'title', btrim(p_title), 'amount', p_amount, 'date', p_date));
    return jsonb_build_object('status', 'success', 'id', v_id, 'message', case when p_kind = 'thu' then '💰 Đã lưu khoản thu' else '💸 Đã lưu khoản chi' end);
  end if;
  select * into o from public.fund_tx where id = p_id for update;
  if o.id is null then raise exception 'Không tìm thấy khoản này.'; end if;
  if not (m.role in ('owner', 'manager') or (o.created_by = m.email and o.created_at > now() - interval '24 hours')) then
    raise exception 'Chỉ quản lý được sửa (người tạo sửa được trong 24 giờ).';
  end if;
  update public.fund_tx set kind = p_kind, title = btrim(p_title), amount = p_amount, tx_date = p_date, category = coalesce(p_category, ''),
    person = btrim(coalesce(p_person, '')), note = btrim(coalesce(p_note, '')), updated_by = m.email, updated_at = now() where id = p_id;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FUND_EDIT', p_id::text,
    jsonb_build_object('before', jsonb_build_object('kind', o.kind, 'title', o.title, 'amount', o.amount, 'date', o.tx_date, 'category', o.category, 'person', o.person),
                       'after', jsonb_build_object('kind', p_kind, 'title', btrim(p_title), 'amount', p_amount, 'date', p_date, 'category', p_category, 'person', p_person)));
  return jsonb_build_object('status', 'success', 'id', p_id, 'message', 'Đã cập nhật');
end $$;

create or replace function public.fund_delete(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; o public.fund_tx;
begin
  m := public._require_member();
  select * into o from public.fund_tx where id = p_id;
  if o.id is null then raise exception 'Không tìm thấy khoản này.'; end if;
  if not (m.role in ('owner', 'manager') or (o.created_by = m.email and o.created_at > now() - interval '24 hours')) then
    raise exception 'Chỉ quản lý được xoá (người tạo xoá được trong 24 giờ).';
  end if;
  delete from public.fund_tx where id = p_id;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'FUND_DELETE', p_id::text,
    jsonb_build_object('kind', o.kind, 'title', o.title, 'amount', o.amount, 'date', o.tx_date, 'category', o.category, 'person', o.person, 'note', o.note));
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá');
end $$;

-- Nhật ký quỹ cho mọi thành viên xem (audit_log chỉ chủ quản đọc được)
create or replace function public.fund_log(p_limit int default 50)
returns table (at timestamptz, actor text, action text, details jsonb)
language sql stable security definer set search_path = '' as $$
  select a.created_at, a.actor, a.action, a.details from public.audit_log a
  where public.is_member() and a.action in ('FUND_ADD', 'FUND_EDIT', 'FUND_DELETE')
  order by a.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
grant execute on function public.fund_save(bigint, text, text, bigint, date, text, text, text), public.fund_delete(bigint), public.fund_log(int) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fund_tx') then
    alter publication supabase_realtime add table public.fund_tx;
  end if;
end $$;
