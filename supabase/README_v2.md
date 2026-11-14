# Thi đua v2

Giao diện: `v2/` (GitHub Pages: https://dohung712.github.io/baocao/v2/). Bản cũ (`index.html`, `backend/`) vẫn chạy song song.

## Kiến trúc
- **Dữ liệu dạng bảng** trên Supabase (`staff`, `items`, `daily_results`, `extra_proposals`, `settings`, `locked_dates`, `store_contest`…). Mỗi dòng báo cáo là một bản ghi riêng → nhiều người gửi cùng lúc không ghi đè nhau.
- **Tính sao ở máy chủ** bằng hàm SQL `_compute_report` (giữ nguyên quy tắc bản PRO: chuỗi, tăng ca, trừ sao theo quỹ, hệ số lũy tiến, X2, phạt trễ lũy tiến, quy tắc riêng). Kiểm chứng bằng `supabase/tests/compare_legacy.mjs` (so với `backend/policy.js`).
- **Tổng sao** = sao gốc + tổng biến động (view `staff_stars`) → không bao giờ lệch.
- **Phân quyền** bằng RLS theo bảng `memberships` (chủ quản / quản lý theo bộ phận / nhân viên).
- **Realtime**: giao diện tự cập nhật khi có thay đổi.
- **Telegram**: Edge Function `notify` + pg_cron (5 phút/lần) gửi tóm tắt ngày/tuần theo giờ cài trong tab Quản lý → Telegram.

## Triển khai
Push lên `main` các file trong `supabase/` → GitHub Actions `Supabase v2 deploy` tự áp SQL mới (mỗi file chạy 1 lần), triển khai Edge Function và in số liệu đối chiếu (chỉ số lượng). Cần secret `SUPABASE_ACCESS_TOKEN`.

## Chuyển hẳn sang v2
Dữ liệu v2 hiện là bản sao từ bản cũ tại lúc triển khai. Khi quyết định chuyển hẳn: thêm file migration mới chỉ gồm `select public.migrate_legacy();` để chép lại dữ liệu mới nhất (xoá dữ liệu thử trên v2), rồi báo nhân viên chuyển sang link v2.

## Kiểm thử cục bộ
Postgres 16 cục bộ + `supabase/tests/stub_supabase.sql`, `rls_test.sql`, `compare_legacy.mjs`; giao diện: `supabase/tests/ui/server.mjs` + `run.mjs` (Playwright, giả lập supabase-js qua Postgres với RLS).
