-- E3: Telegram "💵 Quỹ thu chi" — tổng hợp số dư / thu / chi tính ở máy chủ (không phụ thuộc giới hạn số dòng API).
-- Chỉ Edge Function notify (service_role) gọi; giao diện vẫn đọc fund_tx như cũ.
create or replace function public.fund_summary(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance',   coalesce(sum(case when kind = 'thu' then amount else -amount end) filter (where tx_date <= p_to), 0),
    'opening',   coalesce(sum(case when kind = 'thu' then amount else -amount end) filter (where tx_date < p_from), 0),
    'thu',       coalesce(sum(amount) filter (where kind = 'thu' and tx_date between p_from and p_to), 0),
    'chi',       coalesce(sum(amount) filter (where kind = 'chi' and tx_date between p_from and p_to), 0),
    'month_thu', coalesce(sum(amount) filter (where kind = 'thu' and tx_date between date_trunc('month', p_to)::date and p_to), 0),
    'month_chi', coalesce(sum(amount) filter (where kind = 'chi' and tx_date between date_trunc('month', p_to)::date and p_to), 0))
  from public.fund_tx
$$;
revoke execute on function public.fund_summary(date, date) from public, anon, authenticated;
grant execute on function public.fund_summary(date, date) to service_role;
