# CLAUDE.md: hướng dẫn cho Claude khi sửa repo này

Đọc **TOOL.md** trước: mã chức năng (A1…G3) → trang, file giao diện, hàm SQL; luật tính; chỉ mục hàm SQL (mục 8).
Người dùng sẽ gửi "Sửa <mã>: …". Chỉ mở đúng file/hàm của mã đó; đừng đọc cả repo.

## Quy trình nhanh
1. Tra mã trong TOOL.md → file JS (`v2/js/pages/…`) và/hoặc hàm SQL (bản mới nhất theo mục 8; `grep -n "function public.<tên>"` trong file đó).
2. Sửa:
   - JS: Edit trực tiếp.
   - SQL: tạo migration MỚI `supabase/migrations/2026111500XXXX_v2_<tên>.sql` (số kế tiếp), `create or replace` nguyên hàm. Không sửa migration cũ. Đổi chữ ký thì `drop function` trước.
3. Kiểm tra: `bash supabase/tests/check.sh` (thêm `--ui` nếu đổi giao diện lớn). Phải ra `diffs=0` và `✅ OK`.
4. Commit + `git -c push.negotiate=true push origin main`, rồi `gh run list -R dohung712/baocao -L 2` để xem workflow "Supabase v2 deploy" và Pages đều success.
5. Nếu đổi chức năng/hàm: cập nhật dòng tương ứng trong TOOL.md, chạy `node supabase/scripts/fn-index.mjs` để làm mới mục 8.
6. Trả lời người dùng bằng tiếng Việt, ngắn: đã đổi gì, xem ở đâu.

## Lưu ý
- Dữ liệu thật đang ở v2. **Không chạy lại `migrate_legacy` / `migrate_legacy_all`.**
- Log GitHub Actions công khai: verify chỉ in số đếm, không in tên/số liệu NV.
- Hàm SQL `security definer set search_path = ''` nên luôn ghi `public.` trước tên bảng/hàm.
- Vai trò: owner / manager (theo `stores`) / employee (`staff_id`). Kiểm tra quyền bằng `_require_member`, `_manager_scope`, `_member_for_staff`, `can_see_staff`.
- Giao diện: dùng helper trong `v2/js/ui.js` (`$`, `esc`, `fmt`, `toast`, `modal`, `confirmBox`); sau `await` kiểm tra phần tử còn tồn tại (`if (!$("#x")) return`).
- Kiểm thử cục bộ: Postgres 16 ở `/var/lib/postgresql/pgtest` cổng 5433 (check.sh tự tạo nếu chưa có); UI test dùng `supabase/tests/ui/server.mjs` + `fake-supabase.js` (tài khoản `dohung712@gmail.com` = owner, `nv1001@x.vn` = NV).
- Không tự đặt/gõ mật khẩu của người dùng.
