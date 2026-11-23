# HANDOFF: tiếp tục làm "Thi Đua & BXH v2" trong môi trường code

Cập nhật: 23/11/2026 · việc mới nhất: D12 Bảng việc (giao việc, nộp ảnh Drive, lịch ca, thông báo đẩy, Telegram công việc)

Mở repo này trong Claude Code (hoặc bất kỳ trình soạn thảo nào) rồi đọc lần lượt:
1. **HANDOFF.md** (file này): bối cảnh, cách chạy, việc đang dở.
2. **CLAUDE.md**: quy trình bắt buộc khi sửa (Claude Code tự đọc file này).
3. **TOOL.md**: bản đồ chức năng theo mã (A1…H1), luật tính, chỉ mục hàm SQL (mục 8).

---

## 1. Tool là gì

- Web cho **Siêu thị 351 Nguyễn Hữu Thọ** (bộ phận **TGDĐ**, **Topzone**, **PG**): báo cáo cuối ngày, sao thưởng/phạt, xếp hạng, CV (việc, TikTok, vệ sinh, lịch bận, roadshow, **tờ rơi**, biên bản, quỹ), quản lý, Telegram.
- Web: https://dohung712.github.io/baocao/v2/ (GitHub Pages, thư mục `v2/`).
- Repo: `dohung712/baocao`, nhánh `main` (push thẳng vào main).
- Backend: Supabase project `iauxgnnybhzqeirnqaen` (Postgres + RPC `security definer` + Edge Functions + Storage).
- `README.md`, `backend/`, `index.html`, `portal.js` ở gốc là **bản cũ (v1)**, không còn dùng. Mọi việc mới làm trong `v2/` và `supabase/`.
- Repo phụ `dohung712/quy` (https://dohung712.github.io/quy/): tool quỹ cũ dùng Firebase, đã gộp vào v2 (CV → 💵 Quỹ). Trang cũ có cổng mật khẩu `2026` (chỉ chặn trên trình duyệt) và thông báo chuyển sang tool mới.

## 2. Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `v2/index.html`, `v2/css/app.css` | Khung trang, giao diện |
| `v2/js/app.js`, `store.js`, `ui.js` | Khởi động, dữ liệu dùng chung (`rpc`, `setting`, `S`), helper (`$`, `esc`, `fmt`, `toast`, `modal`, `confirmBox`) |
| `v2/js/pages/*.js` | Từng trang / tab (report, cv, cv-flyer, admin, admin-score, score…) |
| `v2/js/reminders.js` | Dải nhắc đầu trang cho NV |
| `v2/js/help.js`, `pages/admin-home.js` | Gợi ý trợ giúp (mảng `H`), danh sách chức năng `FEATURES` + kế hoạch `PLAN` |
| `supabase/migrations/*.sql` | Toàn bộ schema + hàm SQL; áp **một lần**, theo tên file |
| `supabase/functions/notify` | Edge Function Telegram (`index.ts`: ITEMS, tick, compose; `summary2.ts`: soạn tin) |
| `supabase/functions/tasks`, `accounts`, `assistant` | AI tóm tắt việc (Gemini) + upload Drive, đặt mật khẩu, trợ lý |
| `supabase/scripts/` | `apply-migrations.mjs` (workflow dùng), `set-private.mjs`, `fn-index.mjs` (làm mới mục 8 TOOL.md), `verify.mjs` |
| `supabase/tests/` | `check.sh`, các `*_test.sql`, `ui/run*.mjs` (Playwright), `ui/server.mjs` + `ui/fake-supabase.js` |
| `.github/workflows/supabase-deploy.yml` | Push vào `supabase/**` → áp migrations + deploy functions |

## 3. Triển khai (deploy)

- **Push lên `main`** là xong:
  - Workflow **"Supabase v2 deploy"** chạy khi đổi `supabase/**`: áp migration chưa áp (bảng `public.v2_migrations` theo **tên file**), cập nhật khoá bí mật, deploy Edge Functions.
  - **GitHub Pages** tự build trang `v2/`.
- Push: `git -c push.negotiate=true push origin main`, rồi `gh run list -R dohung712/baocao -L 2` phải ra 2 dòng `success`.
- GitHub Secrets đang dùng (chỉ ghi tên, không ghi giá trị): `SUPABASE_ACCESS_TOKEN`, `GEMINI_API_KEY`, `DRIVE_UPLOAD_URL`, `DRIVE_UPLOAD_SECRET`. Token bot Telegram, `CRON_SECRET` nằm trong bảng `private_settings` (không bao giờ đưa vào repo / log).
- pg_cron gọi `notify` mode `tick` 5 phút/lần (gửi Telegram đúng giờ).

## 4. Chạy kiểm thử trên máy

Cần: Node 22, PostgreSQL 16 (`/usr/lib/postgresql/16/bin`), `psql`, Playwright + Chromium (cho `--ui`).

```bash
bash supabase/tests/check.sh        # JS syntax + dựng DB thử (cổng 5433) + mọi *_test.sql → phải ra "diffs=0" và "✅ OK"
bash supabase/tests/check.sh --ui   # thêm kiểm thử giao diện (server http://localhost:8790/v2/)
```

- `check.sh` tự tạo cụm Postgres ở `/var/lib/postgresql/pgtest` (chạy bằng user `postgres`). Máy khác đường dẫn thì sửa dòng `D=` / `initdb` trong `check.sh`.
- Tài khoản giả trong UI test: `dohung712@gmail.com` = chủ quản, `nv1001@x.vn` = NV (mật khẩu gì cũng được, do `fake-supabase.js`).
- Bảng mới có RLS mà không có policy (chỉ đọc qua RPC) → trong test SQL phải tạo policy tạm để đọc thẳng (xem `flyer_test.sql`).

## 5. Quy tắc khi sửa (tóm tắt CLAUDE.md)

1. Tra mã chức năng trong TOOL.md → chỉ mở đúng file/hàm.
2. SQL: tạo **migration mới**, `create or replace` nguyên hàm; **không sửa migration đã áp**; đổi chữ ký thì `drop function` trước. Hàm `security definer set search_path = ''` → luôn ghi `public.` trước tên bảng/hàm. Biến trùng tên cột → `#variable_conflict use_variable`.
3. **Đánh số migration**: xem `ls supabase/migrations | tail` và lấy số **lớn hơn số lớn nhất** (hiện tại lớn nhất là `0970` → file tiếp theo `20261115000980_v2_<tên>.sql`). Đã có 2 cặp trùng tiền tố (`0880_*`, `0890_*`) do nhiều phiên làm song song; không ảnh hưởng vì áp theo tên đầy đủ, nhưng đừng tạo thêm.
4. Quyền: `_require_member`, `_manager_scope`, `_member_for_staff`, `can_see_staff`, `_flyer_mgr`. Hiện **mọi quản lý đều là chủ quản (owner)** (migration 0830).
5. Giao diện: dùng helper `ui.js`; sau `await` kiểm tra phần tử còn tồn tại.
6. Chạy `check.sh` (`--ui` nếu đổi giao diện lớn) → commit (kết thúc bằng dòng Co-Authored-By) → push → xem 2 workflow success.
7. Đổi chức năng: cập nhật dòng mã trong TOOL.md, chạy `node supabase/scripts/fn-index.mjs`, thêm `FEATURES` (admin-home.js) + gợi ý `H` (help.js) nếu là chức năng quản lý mới.
8. **Không** chạy lại `migrate_legacy` / `migrate_legacy_all`. Log GitHub Actions công khai: không in tên / số liệu NV. Không đặt/gõ mật khẩu thay người dùng.
9. Cần xem dữ liệu thật mà không lộ log: dùng kỹ thuật "báo cáo niêm phong" (bước workflow tạm in bản mã hoá RSA-OAEP + AES-GCM, giải mã bằng khoá riêng trên máy, xong xoá script và khoá công khai khỏi repo). Xem commit `8ed8d52` làm mẫu.

## 6. Việc đã làm gần đây (16–21/11/2026)

| Mã | Nội dung | Migration |
|---|---|---|
| F2 | Danh mục môn: lọc kênh/trạng thái/tên, bật-tắt hàng loạt, nhãn Môn tháng / Ngoài môn tháng, target NV thực báo cáo | 0850 |
| D1 | TikTok: mốc tính phạt `TIKTOK_START_DATE` = 16/11/2026 (bỏ kỳ quá hạn cũ) | 0860 |
| C13 | Thưởng hạng tháng: xếp riêng TGDĐ / Topzone, top 5 = 4000/3500/3000/2500/2000⭐, QL xem đề xuất → Chốt mới cộng | 0870 |
| D8 | Sửa lỗi úp ảnh vệ sinh trên Android (đọc + nén ảnh ngay khi chọn, `photos.js` createImageBitmap) | (JS) |
| D11 | **Phát tờ rơi**: 31 tuyến seed từ file "Ma trận tờ rơi", tạo đợt tự chia tuyến/ngày/người, NV-PG nộp ảnh album, sửa phân công | 0880_v2_flyer |
| D11 | Nhắc tờ rơi: dải nhắc đầu app + lịch sắp tới, Telegram đợt mới (`flyernew`), nhắc trước hạn (`flyerpre`, `FLYER_REMIND_BEFORE_MIN`=120), báo đúng hạn (`flyer`) | 0930 |
| quy | Trang quỹ cũ: cổng mật khẩu 2026 + thông báo dùng tool mới | repo `quy` |
| H0, D12 | **🏠 Hôm nay** (trang mở đầu) + **📋 Giao việc**: QL giao việc (theo ca / người / bộ phận, hạn giờ, ảnh / checklist, sao trừ trễ / bỏ lỡ), NV nộp ảnh → Drive `<thư mục ảnh>/<Mã - Tên NV>/<Hạng mục>/`, không duyệt; thống kê NV × ngày × hạng mục; tab CV cũ ẩn với NV (`cv.nav`) | 0940_v2_jobs |
| D12b, D12c, E4 | Lịch ca đọc file tool sắp ca trong Drive (30 phút), thông báo đẩy Web Push (manifest + sw.js, Edge `push`), Telegram `jobday` / `jobweek`; Apps Script bản 2 (path nhiều cấp, `latest`, `sheet`) | 0940 + functions |

Các commit khác trong cùng giai đoạn do phiên khác làm: B15 báo cáo PG, E3 Telegram Quỹ, UX form báo cáo, F2q, D10 Biên bản vi phạm, bảo mật 0880_security_hardening.

## 7. Việc đang dở / chờ người dùng quyết

- **D12 Bảng việc** (23/11): Apps Script dự án “Thi dua - tai file len Drive” đã lên **bản 2** (deployment phiên bản 2, giữ địa chỉ cũ; mã bí mật nằm ở dòng `const SECRET` trong dự án, không có trong repo). Thư mục `Tool Báo Cáo/02 - Lịch ca làm việc` đã tạo, chưa có file. Mã 18450 (chủ quản) đã bỏ ẩn để thử nhận việc / thông báo; chủ quản có nút 👁️ Xem như NV / QL (`js/viewas.js`).
- **Việc chưa làm của D12**: (1) việc mẫu lặp lại theo ca (người dùng sẽ gửi danh sách việc hằng ngày thật); (2) đồng bộ trang tính “Tool Báo Cáo” (Apps Script đã có action `sheet`, chưa gọi); (3) ~~thư mục 00~~ → đã làm B16 (xem dưới); (4) xác nhận giờ 6 ca (`SHIFT_SLOTS` đang đoán 07:30–22:00).
- **B16 Số liệu BI** (23/11): AI đọc ảnh chụp app BI trong `Tool Báo Cáo/00 - Nhập doanh thu và thi đua` → `bi_files` → bảng thi đua siêu thị (ảnh BC Thi đua mới nhất mỗi kênh thay bảng `store_contest`) + doanh thu / còn thiếu / cần mỗi ngày + thẻ NV. Edge `bi`, `_shared/bi.ts`, `notify/jobs.ts` (biAuto); cần Apps Script **bản 3** (`list`, `get`). Số NV từ BI chỉ vào C10 / C12 khi QL duyệt (B16b, `bi_proposals`, `bi_review`).

- **Tờ rơi**: muốn chọn tuyến khi tạo đợt (hiện tool chọn tuyến lâu chưa phát, 4 chợ nằm cuối nên đợt đầu ít khi tới)? Có cần ô chỉnh `FLYER_REMIND_BEFORE_MIN` trên giao diện?
- **Dữ liệu file Excel tờ rơi**: 3 tuyến bị trùng (đã gộp); tên và link chợ có vẻ bị đảo ("Chợ Đầu Mối Hòa Cường" ↔ "Chợ Lê Thanh Nghị"), người dùng cần kiểm tra trong Danh mục tuyến.
- **Telegram**: tin "đợt mới" và "nhắc trước hạn" gửi vào nhóm trong `NOTIFY_CHAT_IDS`; nếu nhóm chỉ có quản lý thì NV không thấy → cần thêm nhóm NV.
- **Thưởng hạng C13**: đang là sao, PG không xếp; người dùng chưa xác nhận lại.
- **TikTok**: sao đã trừ trước 16/11 vẫn còn trong lịch sử; hoàn lại nếu người dùng yêu cầu.
- **Môn thi đua**: môn VPBank sao 0/0; khoản điều chỉnh −3.525⭐ của NV Thy cần xem lại; môn tháng đã tắt vẫn tính trong bảng điểm (chưa đổi).
- **Repo quy**: bên trong vẫn còn màn đăng nhập từng người (`dxh`); cổng 2026 chỉ chặn ở trình duyệt, muốn khoá thật phải đổi luật Firestore.

## 8. Lỗi đã biết

- UI test `run5`, `run6`, `run8`, `run16` bị quá thời gian chờ (lỗi có từ sau commit UX `b2527ed`, chưa sửa).
- Trên DB thử cục bộ, `0880_v2_security_hardening.sql` báo `role "supabase_auth_admin" does not exist` (chỉ có trên Supabase thật), vô hại.
- `README.md` ở gốc mô tả bản v1 cũ.

## 9. Mẫu yêu cầu cho phiên mới

```
Đọc HANDOFF.md, CLAUDE.md, TOOL.md. Sửa D11: <mô tả>.
```
