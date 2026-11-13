
create table public.app_state (id integer primary key check(id=1), version bigint not null default 1, payload jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table public.memberships(email text primary key check(email=lower(email)), role text not null check(role in ('owner','manager','employee')), staff_id text, stores text[] not null default '{}', active boolean not null default true, created_at timestamptz not null default now(), check(role='owner' or cardinality(stores)>0));
create unique index memberships_staff_unique on public.memberships(staff_id) where staff_id is not null and active;
create table public.audit_log(id bigint generated always as identity primary key, actor text not null, action text not null, target text, details jsonb not null default '{}', created_at timestamptz not null default now());
create index audit_log_created_idx on public.audit_log(created_at desc);
create table public.change_requests(id uuid primary key default gen_random_uuid(), email text not null, staff_id text not null, report_date date not null, reason text not null, payload jsonb not null, status text not null default 'pending' check(status in ('pending','approved','rejected')), reviewed_by text, reviewed_at timestamptz, created_at timestamptz not null default now());
create index change_requests_status_idx on public.change_requests(status,created_at desc);
alter table public.app_state enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;
alter table public.change_requests enable row level security;
revoke all on public.app_state, public.memberships, public.audit_log, public.change_requests from anon, authenticated;
grant all on public.app_state, public.memberships, public.audit_log, public.change_requests to service_role;
grant usage,select on all sequences in schema public to service_role;
insert into public.memberships(email,role,staff_id) values ('dohung712@gmail.com','owner','18450');
create function public.commit_state(expected_version bigint, next_payload jsonb, actor_email text, action_name text, target_id text default null, request_id uuid default null) returns bigint language plpgsql security invoker set search_path='' as $$
declare new_version bigint;
begin
  update public.app_state set payload=next_payload,version=version+1,updated_at=now() where id=1 and version=expected_version returning version into new_version;
  if new_version is null then raise exception 'CONFLICT_VERSION'; end if;
  if request_id is not null then
    update public.change_requests set status='approved',reviewed_by=actor_email,reviewed_at=now() where id=request_id and status='pending';
    if not found then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;
  end if;
  insert into public.audit_log(actor,action,target) values(actor_email,action_name,target_id);
  return new_version;
end $$;
revoke execute on function public.commit_state(bigint,jsonb,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.commit_state(bigint,jsonb,text,text,text,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('thi-dua-media','thi-dua-media',false,7340032,array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);