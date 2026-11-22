-- B16 Số liệu BI: đọc ảnh chụp app BI công ty (thư mục Drive "00 - Nhập doanh thu và thi đua") bằng AI →
--   • Doanh thu hợp nhất từng siêu thị (TGDĐ 933, Topzone 10341): DT QĐ lũy kế, target, dự kiến, số ngày
--   • BC Thi đua lũy kế từng siêu thị → bảng store_contest (trang 🏢 Siêu thị) + dòng TỔNG
--   • Thẻ nhân viên: DT QĐ, target, % dự kiến, bill, bán kèm, % từng chương trình thi đua, điểm, hạng
insert into public.settings(key, value) values
  ('BI_DRIVE_PATH', '["Tool Báo Cáo", "00 - Nhập doanh thu và thi đua"]'::jsonb),
  ('BI_STORES', '{"933": "TGD", "10341": "AAR"}'::jsonb)       -- mã siêu thị trên BI → nhánh trong tool (TGD = TGDĐ, AAR = Topzone)
on conflict (key) do nothing;

create table if not exists public.bi_files (
  id bigint generated always as identity primary key,
  file_id text not null unique,                 -- mã file Google Drive
  name text not null default '',
  file_updated text not null default '',        -- thời điểm sửa file trên Drive (đổi → đọc lại)
  url text not null default '',
  kind text not null default 'other' check (kind in ('store_revenue', 'store_contest', 'staff_card', 'other')),
  store_code text,
  channel text,                                  -- TGD | AAR
  staff_id text,                                 -- thẻ NV: mã NV đã ghép được
  captured_at timestamptz,                       -- giờ cập nhật / chụp trên ảnh
  data_through date,                             -- số liệu tới hết ngày
  month text,                                    -- YYYY-MM
  data jsonb not null default '{}'::jsonb,       -- toàn bộ số AI đọc được
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text not null default '',
  processed_at timestamptz not null default now(),
  processed_by text
);
create index if not exists bi_files_kind_idx on public.bi_files(kind, month, data_through desc);
create index if not exists bi_files_staff_idx on public.bi_files(staff_id, data_through desc);
alter table public.bi_files enable row level security;
drop policy if exists bi_files_read on public.bi_files;
-- Quản lý xem hết; mọi thành viên xem số siêu thị; NV xem thẻ của chính mình
create policy bi_files_read on public.bi_files for select to authenticated
  using (public.is_manager() or (status = 'ok' and (kind in ('store_revenue', 'store_contest') or (kind = 'staff_card' and staff_id = (public.app_member()).staff_id))));
grant select on public.bi_files to authenticated;
revoke insert, update, delete on public.bi_files from authenticated;
revoke all on public.bi_files from anon;

-- Ghi bảng thi đua siêu thị (như save_store_contest) — dùng cho số đọc từ BI (Edge Function, service_role)
create or replace function public._store_contest_set(p_rows jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Chưa có dữ liệu.'; end if;
  delete from public.store_contest where true;
  insert into public.store_contest(name, type, actual, target, rate_month, forecast, rank, branch, sort, updated_by)
  select left(coalesce(r ->> 'name', ''), 200), left(coalesce(r ->> 'type', ''), 50),
         coalesce(nullif(r ->> 'actual', '')::numeric, 0), coalesce(nullif(r ->> 'target', '')::numeric, 0),
         coalesce(nullif(r ->> 'rateMonth', '')::numeric, 0), coalesce(nullif(r ->> 'forecast', '')::numeric, 0),
         left(coalesce(r ->> 'rank', '-'), 20), left(coalesce(r ->> 'branch', 'TỔNG'), 20), (ord - 1)::int, p_actor
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);
  get diagnostics n = row_count;
  insert into public.store_contest_snapshots(snap_date, data, saved_by) values (public.vn_today(), p_rows, p_actor)
  on conflict (snap_date) do update set data = excluded.data, saved_at = now(), saved_by = excluded.saved_by;
  insert into public.audit_log(actor, action, details) values (p_actor, 'SAVE_STORE_CONTEST', jsonb_build_object('rows', n, 'source', 'bi'));
  return jsonb_build_object('status', 'success', 'rows', n);
end $$;

-- QL bấm "Đọc lại" một ảnh: xoá kết quả cũ, lần đọc sau AI đọc lại
create or replace function public.bi_forget(p_file_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý dùng được.'; end if;
  delete from public.bi_files where file_id = p_file_id;
  return jsonb_build_object('status', 'success', 'message', 'Đã xoá kết quả cũ — bấm Đọc ảnh BI để đọc lại');
end $$;

revoke execute on function public._store_contest_set(jsonb, text) from public, anon, authenticated;
grant execute on function public._store_contest_set(jsonb, text) to service_role;
revoke execute on function public.bi_forget(text) from public, anon;
grant execute on function public.bi_forget(text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bi_files') then
    alter publication supabase_realtime add table public.bi_files;
  end if;
end $$;
