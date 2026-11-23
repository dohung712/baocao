-- D13b: ghi nhận thông báo đẩy — đã gửi tới bao nhiêu máy, máy đã nhận, NV bấm mở / gạt tắt; NV đã xem việc trên tool.
--  • push_log: mỗi thông báo gửi cho 1 NV = 1 dòng (kể cả NV chưa bật thông báo: devices = 0).
--    Máy NV báo lại qua Edge Function "push" (mode ack, mã ký HMAC) → delivered_at / clicked_at / closed_at (lần đầu).
--  • jobs.seen_at: lần đầu NV thấy việc trong trang Hôm nay (job_seen).

alter table public.jobs add column if not exists seen_at timestamptz;

create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id text not null,
  kind text not null default '',          -- new · soon · near · over · nag · shift · manual · other
  title text not null default '',
  job_ids bigint[] not null default '{}',
  devices int not null default 0,         -- số máy NV đã bật thông báo lúc gửi
  sent int not null default 0,            -- dịch vụ đẩy nhận (201)
  failed int not null default 0,
  delivered_at timestamptz,               -- máy báo đã nhận (hiện thông báo)
  clicked_at timestamptz,                 -- NV bấm vào thông báo
  closed_at timestamptz                   -- NV gạt tắt không mở (Android / máy tính; iPhone không báo)
);
create index if not exists push_log_jobs_idx on public.push_log using gin (job_ids);
create index if not exists push_log_staff_at_idx on public.push_log (staff_id, at desc);
create index if not exists push_log_at_idx on public.push_log (at);

alter table public.push_log enable row level security;
drop policy if exists push_log_read on public.push_log;
create policy push_log_read on public.push_log for select to authenticated
  using (public.is_member() and (staff_id = (public.app_member()).staff_id or (public.is_manager() and public.can_see_staff(staff_id))));
revoke all on public.push_log from anon;
revoke insert, update, delete on public.push_log from authenticated;
grant select on public.push_log to authenticated;

-- NV mở trang Hôm nay → đánh dấu đã xem các việc của chính mình (chỉ lần đầu)
create or replace function public.job_seen(p_ids bigint[])
returns integer language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_n int;
begin
  m := public._require_member();
  if m.staff_id is null or coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  update public.jobs set seen_at = now()
   where id = any (p_ids[1:300]) and staff_id = m.staff_id and seen_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.job_seen(bigint[]) from public, anon;
grant execute on function public.job_seen(bigint[]) to authenticated;
