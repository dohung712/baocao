-- D21: 🙂 Avatar nhân viên — ảnh vuông nén nhỏ (≈160px, data URL) hiện cạnh tên ở Hôm nay, Xếp hạng, Giao việc…
-- Lưu trong CSDL (không công khai như thư mục ảnh); chỉ thành viên đã đăng nhập xem. NV đổi ảnh của mình; Admin / Quản lý đổi được cho mọi NV.

create table if not exists public.staff_avatars (
  staff_id text primary key references public.staff(id) on update cascade on delete cascade,
  img text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.staff_avatars enable row level security;
drop policy if exists staff_avatars_read on public.staff_avatars;
create policy staff_avatars_read on public.staff_avatars for select to authenticated using (public.is_member());
revoke all on public.staff_avatars from anon;
revoke insert, update, delete on public.staff_avatars from authenticated;
grant select on public.staff_avatars to authenticated;

create or replace function public.avatar_set(p_staff text, p_img text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role = 'employee' and m.staff_id is distinct from p_staff then raise exception 'Chỉ đổi được ảnh của chính mình.'; end if;
  if not exists (select 1 from public.staff where id = p_staff) then raise exception 'Không tìm thấy nhân viên.'; end if;
  if p_img is null or p_img = '' then
    delete from public.staff_avatars where staff_id = p_staff;
    return jsonb_build_object('status', 'success', 'message', 'Đã gỡ ảnh đại diện');
  end if;
  if p_img !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$' then raise exception 'Ảnh không hợp lệ.'; end if;
  if length(p_img) > 80000 then raise exception 'Ảnh quá lớn.'; end if;
  insert into public.staff_avatars(staff_id, img, updated_at, updated_by) values (p_staff, p_img, now(), m.email)
  on conflict (staff_id) do update set img = excluded.img, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('status', 'success', 'message', 'Đã cập nhật ảnh đại diện');
end $$;
revoke execute on function public.avatar_set(text, text) from public, anon;
grant execute on function public.avatar_set(text, text) to authenticated;
