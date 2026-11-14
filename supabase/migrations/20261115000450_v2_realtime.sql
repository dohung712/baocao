-- Bật realtime cho các bảng v2 (giao diện tự cập nhật khi có thay đổi, không cần tải lại cả khối dữ liệu)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['daily_results','staff','items','settings','locked_dates','extra_proposals','change_requests','store_contest'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
