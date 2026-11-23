# Thi Đua & BXH v2: bản đồ tool

Web: **https://dohung712.github.io/baocao/v2/** · Repo: `dohung712/baocao` · Supabase project: `iauxgnnybhzqeirnqaen`
Siêu thị 351 Nguyễn Hữu Thọ · bộ phận **Thế Giới Di Động** và **Topzone**

> **Cách dùng file này:** mỗi chức năng có một **mã** (A1, B2, …). Muốn sửa thì gửi theo mẫu ở mục 9, ví dụ
> `Sửa C3: target ngày làm tròn 1 số lẻ`. Claude đọc mục đó là biết ngay file và hàm cần sửa, không phải dò lại cả tool.

---

## 1. Vai trò và đăng nhập

| Vai trò | Đăng nhập | Thấy gì |
|---|---|---|
| **Chủ quản** (owner) | email `dohung712@gmail.com` + mật khẩu (hoặc link/mã qua email) | Tất cả, kể cả Cài đặt, Môn, Tài khoản, Phân quyền, Nhật ký, dán target tháng |
| **Quản lý** (manager) | email + mật khẩu | Quản lý: Duyệt, Điểm & DT, Khoá sổ, Nhân sự, Telegram (trong các bộ phận được giao) |
| **Nhân viên** (employee) | **Mã NV** + mật khẩu (tài khoản nội bộ `nv<mã>@thidua351.vn`) | Báo cáo, CV, Xếp hạng, Của tôi… (trừ các trang/chức năng bị ẩn ở F4) |

---

## 2. Bảng chức năng

Tên file viết tắt: `js/` = `v2/js/`, `pages/` = `v2/js/pages/`. Hàm SQL tra file ở **mục 8**.

### 0. Bắt đầu ở đâu
| Mã | Chức năng | Trên web | File |
|---|---|---|---|
| H0 | **🏠 Hôm nay** (trang mở đầu của mọi người, D12): ca làm hôm nay (lịch ca), vòng tiến độ việc hôm nay, **Quá hạn** (việc QL giao + mục cũ mức đỏ), **Việc hôm nay** (thẻ việc → nộp ảnh), **Nhắc từ các mục khác** (`todo_list` + `flyer_todo`: TikTok, vệ sinh, roadshow, lũy kế, lịch bận…), **Sắp tới**, lịch ca 7 ngày, lưới **Tất cả chức năng** (mục cũ của CV mở đúng 1 tab), thẻ **🔔 Bật thông báo** (Web Push; iPhone cần thêm ra màn hình chính). QL có thẻ mở 📋 Giao việc | 🏠 Hôm nay | `pages/today.js`, `js/jobs-common.js` (jobCard, openSubmit, openCv), `js/push.js`, `js/lib-shift.js` (slotText) |
| H1 | **🏠 Hôm nay sắp theo 4 mục, làm cho điện thoại** (thanh chip dính trên đầu để nhảy mục): **1 📌 Công việc cần làm** (quá hạn, hôm nay, nhắc mục cũ, sắp tới; bấm thẻ việc → nộp ảnh; QL có nút ➕ Giao thêm việc mở thẳng tab Giao việc) · **2 💰 Doanh thu siêu thị** (số BI B16: toàn siêu thị + TGDĐ / Topzone: lũy kế / target, dự kiến, còn thiếu, cần / ngày; thẻ 🎯 chỉ tiêu của NV) · **3 🏁 Thi đua siêu thị** (dòng TỔNG của `store_contest`: số môn, về số, sát nút, chưa phát sinh + 6 môn cần đẩy, thiếu bao nhiêu, cần / ngày) · **4 🏅 Xếp hạng tháng** (`score_board` tháng này so tiến độ: hạng của mình, danh sách bộ phận mình / cả siêu thị; bấm 1 người → chi tiết điểm). Cuối trang: lịch ca 7 ngày, Tất cả chức năng (thu gọn). Mục 2–3 ẩn khi tắt `store`, mục 4 ẩn khi tắt `score` | Hôm nay | `pages/today.js`, `js/score-detail.js` (chi tiết điểm dùng chung với Xếp hạng) | `score_board`, `store_contest`, `bi_files` |
| H1b | **📊 Tổng quan tháng** (khung đầu của Tổng quan): stat tile Đã báo cáo hôm nay · Doanh thu QĐ tháng % target (✅/⚠️/🔴 so tiến độ chuẩn = ngày ÷ số ngày trong tháng) · Vi phạm tháng · NV âm sao; meter doanh thu từng bộ phận (thanh = lũy kế / target tháng, vạch đứng = tiến độ chuẩn hôm nay); 🏆 top 3 / 🆘 3 người cần hỗ trợ (không trùng). Quản lý chỉ thấy bộ phận mình | Quản lý → 🏠 Tổng quan | `pages/admin-home.js` (kpiHtml) — số liệu `score_board` (p_full = false, target nhân lại theo tiến độ) |
| H1 | **🏠 Tổng quan** (tab đầu của Quản lý): Việc cần làm ngay (chờ duyệt, chưa báo cáo, thiếu target, lần dán kết quả siêu thị, phục vụ tuần trước, Telegram) · Lịch quản lý ngày/tuần/tháng có tick · Tìm chức năng (gõ chữ → nút mở đúng chỗ) · Tuỳ chỉnh nhanh | Quản lý → 🏠 Tổng quan | `pages/admin-home.js` (FEATURES = danh mục chức năng, PLAN = lịch) |

| H2 | **Gợi ý tự hiện**: rê chuột lên một mục `HELP_DELAY_S` giây (mặc định 15) hoặc nhấn giữ 0,8 giây trên điện thoại → bong bóng giải thích; mỗi người bật/tắt ở nút tài khoản | Mọi trang | `js/help.js` (mảng H: selector → tiêu đề, nội dung) |

> Thêm chức năng mới thì thêm 1 dòng vào `FEATURES` trong `admin-home.js` (mã, tên, chỗ, từ khoá, đích mở) để ô tìm kiếm thấy được.

### A. Đăng nhập và tài khoản
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| A1 | Đăng nhập bằng mã NV / email, bắt đổi mật khẩu lần đầu | Màn hình đăng nhập | `js/app.js`, `js/store.js` (staffEmail) | `memberships`, `app_member` |
| A2 | Tạo / đặt lại mật khẩu tài khoản NV | Quản lý → Tài khoản NV | `pages/admin.js` (accounts) | Edge function `accounts` |
| A3 | Phân quyền: **Chủ quản — toàn quyền** (nhiều người được; 16/11/2026: mọi quản lý đang hoạt động đã được nâng lên, migration 0830; luôn còn ≥ 1 chủ quản, trigger `memberships_keep_owner`) hoặc quản lý theo bộ phận; **🔑 Đặt mật khẩu** cho tài khoản email (quản lý vào ngay bằng email + mật khẩu, tuỳ chọn bắt đổi lần đầu) | Quản lý → Phân quyền | `pages/admin.js` (members, setPw) | `memberships`, RLS `is_manager`, `can_see_staff`; Edge function `accounts` (set_member_password) |

### B. Báo cáo ngày và sao
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| B1 | Form báo cáo ngày: môn, target, chuỗi. **Môn để trống = 0** (không bắt buộc nhập). **Môn không trừ sao** (sao phạt 0 hoặc quy tắc `noPen` ở ITEM_RULES) nằm **cuối form**, nền xanh dương, nhóm **thu gọn mặc định** (nút "🛡️ N môn không trừ sao · đã nhập x", tự mở khi đang sửa báo cáo có số; Enter bỏ qua môn đang ẩn). Mỗi môn hiện **Tháng lũy kế/target tháng** (đến hết hôm qua). Dòng gọn: bỏ chữ "Bỏ trống = 0" từng dòng (ghi 1 lần đầu bảng). Quản lý mở trang luôn chọn NV có trong danh sách (mã NV của tài khoản đang ẩn không còn làm lệch ô chọn) | Báo cáo | `pages/report.js` (orderItems, nopenOpen, drawRows, itemsFilled, payload) | `report_form` (cờ `noPen`, `monthTarget`, `monthDone`), `_item_no_pen`, `_staff_items`, `_cum_tool` |
| B2 | Danh sách môn của NV: **= môn thi đua tháng** nếu đã giao (trừ môn bị bỏ tích **Bật** ở Môn & Sao — chọn dòng môn của bộ phận NV trước, rồi Chung; dòng được chọn tắt thì ẩn, migration 0890 sửa cả nhánh chưa giao môn tháng), chưa giao thì theo bộ phận / môn riêng | (tự động) | n/a | `_staff_items`, `_work_days` |
| B15 | **📦 Báo cáo PG** (NV thuộc `PG_DEPTS`, mặc định "PG"; **không tính sao**): Hôm nay **Số lượng + Doanh thu** (bắt buộc, không bán ghi 0) · **Bán kèm được gì?** chip `PG_ADDONS` (VAS, Bảo hiểm, PSDP, Tai nghe, Sim; chủ quản sửa ở Cài đặt), chọn món → ô **SL + DT** món đó · **Lũy kế tháng** tool tự cộng = số đầu kỳ (kind `opening`, nhập 1 lần khi bắt đầu giữa tháng, banner nhắc) + các ngày + hôm nay · danh sách các ngày trong tháng · 📋 Copy tin gửi Zalo. Gửi → `pg_reports` + 1 dòng đánh dấu `daily_results` ("📦 Báo cáo PG", 0 sao, status `Báo cáo PG`, compensation `PG`) để mọi chỗ "đã/chưa báo cáo" (Báo cáo, Tổng quan, Telegram, Trợ lý, Nhân sự) tính đúng mà không đụng sao / tỉ lệ về số. Quản lý: chọn NV PG ở Báo cáo để nộp hộ; Tổng quan → bảng 📦 PG tháng | Báo cáo (chọn NV PG) · Quản lý → 🏠 Tổng quan | `pages/report-pg.js` (pgReport, openingModal, isPgStaff), `pages/report.js` (load), `pages/admin-home.js` (kpiHtml → PG), `pages/admin.js` (settings) | `pg_reports`, `pg_report_form`, `pg_report_save`, `_pg_cum`, `_is_pg`, settings `PG_DEPTS`, `PG_ADDONS` |
| B3 | Tính sao: về số/chưa về, x2, chuỗi, tăng ca, trừ sao lũy tiến, phạt nộp trễ | Báo cáo → Xem trước/Nộp | `pages/report.js` | `_compute_report`, `preview_daily_report`, `submit_daily_report`, `_item_streak`, `ITEM_RULES` |
| B4 | Ô doanh thu QĐ trong ca, **bắt buộc** (không bán ghi 0; ẩn được ở F4) | Báo cáo (cuối form) | `pages/report.js` (#xRev, needRev/revFilled) | `save_revenue`, `revenue_entries` |
| B4b | **Xuất ảnh báo cáo** (PNG) kiểu "BÁO CÁO CHỐT THI ĐUA CA NGÀY": target, thực đạt, %, sao ±, H.QUA (lần báo cáo trước), chuỗi, bù/tăng ca, kỷ luật, bán thêm, DT, tổng kết. Sau khi gửi + nút "🖼️ Ảnh báo cáo" | Báo cáo | `js/report-image.js` (reportPng, shareOrDownload), `pages/report.js` (imageBlob) | n/a |
| B4c | Giao diện điện thoại 6.1–6.9" (390–440px): ô nhập to, thanh tiến độ, thanh gửi dính đáy | Báo cáo | `css/app.css` (khối "Báo cáo: tối ưu điện thoại") | n/a |
| B13 | **📣 Báo cáo truyền thông ngày**: số lần truyền thông + số lần báo cáo Line truyền thông (chọn 0/1/2/3 hoặc gõ số khác), chỉ ghi nhận; có trong ảnh báo cáo; ẩn được ở F4 (`report.media`). QL xem tổng tháng | Báo cáo · Quản lý → Điểm & DT → 📣 Truyền thông | `pages/report.js` (MEDIA, saveMedia), `pages/admin-score.js` (media), `js/report-image.js` | `save_media`, `media_reports` |
| B14 | **📌 Việc cần làm & lịch sắp tới** trong báo cáo cuối ngày (+ ảnh báo cáo, tin copy): TikTok quá hạn / hạn hôm nay / mai hạn (nộp sớm +100⭐), vệ sinh (quá ngày, hôm nay, khu vực, mai trực), roadshow chưa báo cáo / mai có, CV chưa đọc/hoàn thành, thứ 2 cập nhật lũy kế + phục vụ (CN nhắc trước), đăng ký bận trước 22h T6 (T5, T6), mai OFF/bận, đang chờ QL duyệt. Bấm mục → mở đúng chỗ | Báo cáo | `pages/report.js` (drawTodo), `js/report-image.js` | `todo_list` |
| B12 | **Thưởng nóng** 2.000⭐: môn "Target thấp", NV bán trong ngày ≥ 30% target tháng siêu thị hoặc > 1000% target ngày → popup hoa chúc mừng, quản lý duyệt mới cộng (vào `star_adjustments`) | Báo cáo (sau khi gửi) / Quản lý → Duyệt | `pages/report.js` (celebrate), `pages/admin.js` (approve) | `check_hot_bonus`, `review_hot_bonus`, `hot_bonuses` |
| B5 | Bán thêm ngoài thi đua (đề xuất), duyệt | Báo cáo / Quản lý → Duyệt | `pages/report.js`, `pages/admin.js` (approve) | `extra_proposals`, `review_proposal` |
| B6 | Sửa / xoá báo cáo đã nộp, yêu cầu sửa và duyệt | Lịch sử / Quản lý → Duyệt | `pages/history.js`, `pages/admin.js` | `review_change`, `delete_report_day`, `delete_result` |
| B7 | Khoá sổ ngày | Quản lý → Khoá sổ | `pages/admin.js` (lock) | `locked_dates` |
| B8 | BXH sao (tổng sao) | BXH sao | `pages/ranking.js` | `leaderboard`, `staff_stars`, `staff_total` |
| B9 | Lịch sử báo cáo | Lịch sử | `pages/history.js` | `daily_results` |
| B10 | Thi đua siêu thị (chỉ tiêu chung) + cột **Còn thiếu / Cần mỗi ngày** (số ngày còn lại lấy theo ảnh BI, không có thì theo lịch) | Siêu thị | `pages/store.js` | `store_contest`, `save_store_contest` |
| B16 | **Số liệu BI từ ảnh chụp**: QL bỏ ảnh chụp app BI công ty (Doanh thu hợp nhất, BC Thi đua lũy kế, thẻ NV) vào Drive `Tool Báo Cáo/00 - Nhập doanh thu và thi đua` (đường dẫn = cài đặt `BI_DRIVE_PATH`) → AI (Gemini) đọc → doanh thu QĐ / target / dự kiến / còn thiếu / cần bán mỗi ngày từng kênh + toàn siêu thị; ảnh BC Thi đua mới nhất mỗi kênh **thay bảng B10** (TGD, AAR + dòng TỔNG cộng 2 kênh); bảng NV theo BI; NV thấy thẻ chỉ tiêu của mình ở 🏠 Hôm nay. Tự đọc mỗi 5 phút từ 06:00–22:59, **chỉ ảnh úp / sửa trong ngày** (≤ 2 ảnh / lượt, 12 ảnh ≈ 30 phút; ảnh lỗi tự đọc lại sau 10 phút, tối đa 4 lần; AI quá tải → dừng lượt, lượt sau đọc tiếp; nút "Đọc lại" đọc được cả ảnh cũ); AI: `common.ts` gemini() thử `GEMINI_MODELS` (gemini-3.8-flash…), hỏng hết thì tự tìm model flash mới nhất qua ListModels, nút 🤖 Kiểm tra AI (Edge `bi` mode ai_check); dữ liệu cũ giữ nguyên trong `bi_files` (mỗi ảnh 1 dòng), bảng thi đua mỗi ngày lưu 1 bản ở `store_contest_snapshots`, QL bấm "Đọc ảnh mới" hoặc chọn ảnh từ máy; ảnh lỗi → "Đọc lại". Mã siêu thị → kênh: cài đặt `BI_STORES`. Cần Apps Script **bản 3** (`list`, `get`) | Siêu thị (khối 📥 Số liệu BI, 📊 Doanh thu, 👥 NV theo BI); Hôm nay (🎯 Chỉ tiêu) | `js/bi.js`, `pages/store.js`, `pages/today.js`; Edge `bi` (sync / upload / apply), `_shared/bi.ts`, `notify/jobs.ts` (biAuto) | `bi_files`, `_store_contest_set`, `bi_forget` |
| B16b | **Duyệt số BI của NV trước khi nối vào bảng điểm**: mỗi thẻ NV đọc được → 1 đề xuất (DT QĐ lũy kế + môn thi đua ghép tên với môn tháng của NV, giá trị = % trên thẻ × target tháng trong tool; môn số lượng làm tròn). Đề xuất cũ chưa duyệt của cùng NV / tháng → "có ảnh mới hơn". QL tick dòng cần lấy → **Duyệt** = ghi phần chênh lệch đến **ngày số liệu BI** (DT → `revenue_entries` adjust, môn → `item_adjustments`, ghi `score_log` kind cumulative / action bi_approve) như C12 → C10, Của tôi dùng số mới; **Từ chối** = không ghi. QL bộ phận chỉ duyệt NV bộ phận mình, ngày đã khoá sổ không duyệt được. Có đề xuất mới → thông báo đẩy cho QL | Siêu thị → 🟡 Số BI của NV chờ duyệt (chỉ QL) | `js/bi-approve.js`, `pages/store.js`; `_shared/bi.ts` (proposeFromCards, matchAll) | `bi_proposals`, `_bi_propose`, `bi_review` |
| B16c | **Tự cập nhật số BI của NV (bỏ bước duyệt, 23/11/2026)** + **giờ cập nhật trên mọi khối số**: cài đặt `BI_AUTO_APPLY` = true (migration 0990) → thẻ NV đọc xong ghi luôn vào lũy kế đến ngày số liệu BI (`_bi_apply`, `score_log` action `bi_auto`); thẻ không ghi được (ngày đã khoá sổ, hoặc tắt tự cập nhật) mới nằm ở "cần xử lý tay" + thông báo đẩy cho QL. Trang Siêu thị: bảng 🔄 Số BI của NV (lần cập nhật mới nhất từng NV + 🕒 giờ). Hiện 🕒 *Cập nhật lúc HH:MM DD/MM · BI chụp …* ở Doanh thu, Thi đua (Siêu thị + 🏠 Hôm nay), NV theo BI, thẻ 🎯 chỉ tiêu NV, mục 🏅 Xếp hạng (giờ DT & môn của NV cập nhật từ BI). Tắt tự cập nhật: đặt `BI_AUTO_APPLY` = false | Siêu thị · 🏠 Hôm nay | `js/bi.js`, `js/bi-approve.js`, `pages/today.js`, `pages/store.js`, `_shared/bi.ts` | `_bi_apply`, `_bi_propose`, `bi_review`, `BI_AUTO_APPLY` |
| B16d | **Phân tích từng NV theo thẻ BI** (23/11/2026): AI đọc đủ thẻ NV mẫu mới — điểm 5 mảng (Doanh thu / Năng suất / Hiệu quả / Đơn giá / Thi đua), nhận xét BI, mọi số + **TB nhóm** (chip "TB …"), % trả chậm, % quy đổi, năng suất / giờ công, **hiệu quả khai thác** (so 100% TB), thi đua (đạt / gần đạt / cần cố gắng / chưa có số, TB siêu thị), đơn giá, **tỷ trọng ngành hàng**, **DT QĐ 6 tháng**. Bảng phân tích (`js/staff-insight.js` analyze): 📌 đánh giá nhanh (DT so TB, tốc độ tháng này so tháng trước & TB 3 tháng, đang tập trung ngành nào / quá dồn, hiệu quả mạnh / yếu, thi đua sát nút, **trả chậm có tập trung không**, năng suất, so lần đọc trước) + biểu đồ tháng, thanh hiệu quả / thi đua. Mở từ: Siêu thị → bảng 👥 NV theo BI (bấm dòng; thêm cột Đang tập trung · Trả chậm · Thi đua / TB · So T. trước), 🏠 Hôm nay → thẻ 🎯 → 📊 Xem phân tích, Xếp hạng → chi tiết → 📊 Phân tích BI. NV chỉ xem thẻ của mình (RLS), QL xem mọi NV | Siêu thị · Hôm nay · Xếp hạng | `js/staff-insight.js`, `js/bi.js`, `_shared/bi.ts` (BI_SCHEMA, BI_PROMPT) | `bi_files.data` |

### C. Target tháng và xếp hạng điểm
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| C1 | **Dán báo cáo target tháng**: đọc văn bản "=== SIÊU THỊ …" | Quản lý → Điểm & DT → Target tháng | `js/lib-targets.js` (parseTargetReport), `pages/admin-score.js` (importPreview) | `import_month_targets` |
| C2 | Giao môn từng NV + số ngày làm việc + target DT | Target tháng → "Giao môn" / ô Target DT | `pages/admin-score.js` (targets) | `save_monthly_target`, `monthly_targets`, `_ensure_contest_items` |
| C3 | Target **báo cáo ngày** = `DAILY_TARGET_PCT` (200%) × target tháng ÷ số ngày làm việc, làm tròn lên 2 số lẻ, tối thiểu `DAILY_TARGET_MIN` (0,5). Xếp hạng thi đua (C10) vẫn theo target tháng | (tự động); chỉnh ở Cài đặt chung | `js/star-rules.js` (dailyTarget) | `_daily_target`, `_staff_items`, `_work_days` (`DAYS_OFF`) |
| C4 | Môn target ngày < 1 thì không trừ sao chuỗi | Tick khi dán target | `pages/admin-score.js` | `import_month_targets` → `ITEM_RULES` (noPen) |
| C5 | Doanh thu QĐ lũy kế + điều chỉnh có lịch sử | Điểm & DT → Doanh thu | `pages/admin-score.js` (revenue) | `adjust_revenue`, `delete_revenue_adjust` |
| C6 | Phục vụ (lượt 5★…1★, khiếu nại) | Điểm & DT → Phục vụ; NV tự nhập ở Của tôi | `pages/admin-score.js`, `pages/me.js` | `save_rating`, `delete_rating`, `ratings` |
| C7 | Vi phạm (−2 điểm/lỗi), hiện giờ + số ảnh biên bản (úp biên bản có ảnh ở D10) | Điểm & DT → Vi phạm | `pages/admin-score.js` | `add_violation` (thêm `p_time`, `p_photos`), `delete_violation` (trả `photos` để dọn Drive) |
| C8 | Cộng/trừ sao, reset sao, reset chuỗi | Điểm & DT → Sao & reset | `pages/admin-score.js` | `adjust_stars`, `reset_stars`, `reset_streaks`, `star_adjustments` |
| C9 | Lịch sử điều chỉnh (target, DT, sao, phục vụ, vi phạm) | Điểm & DT → Lịch sử | `pages/admin-score.js` (log) | `score_log` |
| C10 | **Bảng xếp hạng điểm** DT 40 · Thi đua 40 · Phục vụ 20 − vi phạm. Cài đặt `SCORE_SEE_ALL`: `"detail"` (mặc định từ 0970) NV bấm đồng đội xem cả DT và từng môn · `true` cả siêu thị chỉ điểm (DT, môn chỉ của mình) · `false` chỉ của mình. Bấm 1 dòng → chi tiết điểm đến từ đâu | Xếp hạng | `pages/score.js` (draw), `js/score-detail.js` | `score_board` |
| C12 | **📈 Cập nhật lũy kế tuần**: NV nhập lũy kế tháng đến hết hôm qua (DT QĐ + từng môn theo **loại tính**: 🔢 Số lượng / 💰 DT quy đổi / 💵 DT thực) chỉ vào **thứ 2** hoặc khi QL **mở khoá** (tất cả / vài NV, có hạn giờ); tool ghi phần chênh lệch (DT → `revenue_entries` adjust, môn → `item_adjustments`) nên bảng điểm dùng số đúng. Cảnh báo nhập lẻ cho môn số lượng, số gấp > 5 lần target. Nhắc ở dải đầu trang + Telegram "Nhắc cập nhật lũy kế tuần" (T2 10:00, mục `cum`) | Dải nhắc / Của tôi → 📈 Cập nhật lũy kế · QL: Điểm & DT → 📈 Lũy kế tuần | `js/cumulative.js` (openCum, MEASURE), `pages/admin-score.js` (cum), `js/reminders.js`, `notify/summary2.ts` (cumMsg) | `cum_form`, `cum_submit`, `cum_unlock`, `set_item_measure`, `_cum_window`, `_cum_tool`, `_item_measure`, `items.measure`, setting `CUM_UNLOCK`; `score_board` cộng `item_adjustments` |
| C13 | **🏆 Thưởng hạng tháng**: xếp hạng điểm (C10) **riêng từng bộ phận** (`RANK_REWARD_DEPTS` = TGDĐ, Topzone; PG không xếp), top 5 nhận `RANK_REWARDS` = 4000/3500/3000/2500/2000⭐ (0 điểm không thưởng, bằng điểm cùng hạng). QL xem đề xuất (kể cả tháng đang chạy), bấm **Chốt** mới cộng vào `star_adjustments` (một lần cho mỗi NV mỗi tháng, ghi Lịch sử) | Quản lý → Điểm & DT → 🏆 Thưởng hạng | `pages/admin-score.js` (rank) | `rank_reward_preview`, `rank_reward_close`, `rank_rewards`, `score_board` |
| C11 | Trang cá nhân: điểm, lũy kế môn, DT, lịch sử | Của tôi | `pages/me.js` | `score_board`, `monthly_targets`, `daily_results` |

### D. CV (công việc)
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| D1 | TikTok (mốc tính phạt `TIKTOK_START_DATE` = 16/11/2026, migration 0860: kỳ quá hạn trước đó bỏ qua): nộp **trước** ngày hạn +`TIKTOK_REWARD` (100⭐, trạng thái SỚM) · **đúng ngày hạn** không thưởng không trừ · trễ bị trừ mỗi ngày như cũ. Link phải mới, không trùng link đã nộp của bất kỳ ai. Hiện giờ đăng video đọc từ mã video trong link (link rút gọn vt.tiktok.com không đọc được); lượt xem / bình luận không lấy tự động được | CV → TikTok | `pages/cv.js` (ttPosted) | `tiktok_submit`, `tiktok_manage`, `tiktok_submissions` |
| D3b | **Khoá đăng ký bận/OFF**: NV chỉ tự đăng ký cho tuần sau trước `BUSY_DEADLINE_HM` (22:00) thứ 6; sau hạn nhờ QL (QL đăng ký hộ được). Bật/tắt `BUSY_LOCK_ENABLED`. Telegram "Nhắc hạn đăng ký bận/OFF tuần sau" (T6 20:00, mục `busydl`) | CV → Lịch bận (banner hạn) | `pages/cv.js` (busy) | `busy_register`, `busy_deadline` |
| D2 | Vệ sinh: lịch + ảnh; QL đổi người trực (🔁) | CV → Vệ sinh | `pages/cv.js`, `js/photos.js` | `clean_*`, `clean_reassign`, bucket `thidua-v2` |
| D9 | Nhắc việc NV theo lịch đăng ký: dải nhắc trên đầu mọi trang (trực vệ sinh hôm nay/ngày mai, khu vực chưa báo xong; ✕ ẩn trong ngày) + Telegram "Nhắc vệ sinh đầu ngày" (`cleanam`, 08:30, QL chỉnh giờ ở E1) | mọi trang (dải vàng) | `js/reminders.js`, `app.js` (`remind`), `notify/summary2.ts` (`cleanRemindMsg`, `cleanMsg`) | `cleaning`, `clean_zones`, `clean_zone_checks` |
| D8 | Khu vực vệ sinh theo bộ phận (khu vực + người phụ trách / việc theo ca / vị trí & tiêu chí), **chữ đậm**, NV báo "Xong hôm nay", QL thêm/sửa/xoá, chủ quản sửa tiêu chí chung | CV → Vệ sinh (trên lịch) | `pages/cv-zones.js` | bảng `clean_zones`, `clean_zone_checks`; `zone_save`, `zone_delete`, `zone_check`; setting `CLEAN_CRITERIA`. NV gắn theo mã (`staff_ids`, migration 0810); chưa gắn thì đoán theo tên, "Hiếu Linh" tự tách 2 người, "PG SS" tìm trong bộ phận PG |
| D3 | Lịch bận/OFF + kiểm tra HRM | CV → Lịch bận | `pages/cv.js`, `js/lib-hrm.js` | `busy_*` |
| D4 | Roadshow | CV → Roadshow | `pages/cv.js` | `rs_*` |
| D10 | **📄 Biên bản vi phạm**: QL úp biên bản (NV, ngày, giờ, loại lỗi, ghi chú, chụp/chọn 1–10 ảnh, bắt buộc ≥ 1 ảnh khi đã nối Drive) → ảnh nén rồi tải lên Google Drive (thư mục `Bien ban YYYY-MM`) → ghi 1 vi phạm (trừ `VIOLATION_POINTS`). Bảng **số lần vi phạm** theo NV trong tháng (điểm trừ, lần gần nhất có giờ), bấm NV để lọc; danh sách biên bản có ảnh, người lập, thời gian. QL xoá (ghi lý do, ảnh Drive vào thùng rác). Ai thấy gì theo RLS `violations` (`can_see_staff`): chủ quản tất cả, QL theo bộ phận, NV chỉ của mình | CV → 📄 Biên bản | `pages/cv-vio.js`, Edge function `tasks` (upload / delete), `js/photos.js` (compress, fillPhotos) | `violations.v_time`, `violations.photos`, `add_violation`, `delete_violation`; ẩn được ở F4 (`cv.vio`) |
| D11 | **📄 Phát tờ rơi** (QL / chủ sở hữu quản lý, NV + PG xem & báo cáo): danh mục tuyến / chợ (`flyer_routes`: tên, link bản đồ, số tờ, **số người cùng phát 1–4**, bật/tắt; seed 31 tuyến từ file "Ma trận tờ rơi", bỏ dòng trùng). **Tạo đợt**: nhập số tờ (+ ngày bắt đầu, số ngày tự động/1–4, giờ hạn `FLYER_DEADLINE_HM` 20:00, bỏ tick người không phát) → chọn tuyến lâu chưa phát cho đủ số tờ, chia ngày theo số lượt người, chia người công bằng (ít lượt trước, tránh người đăng ký bận/OFF ngày đó, lâu chưa phát), chia đều số tờ. QL sửa người / ngày / giờ hạn / số tờ từng tuyến, xoá đợt, copy danh sách gửi nhóm. NV nộp 1–6 ảnh chụp màn hình album trên nhóm (`v2:flyer/…`); QL nộp hộ / xoá ảnh cho nộp lại. Việc cần làm trong báo cáo ngày (`flyer_todo`). **Nhắc**: dải nhắc đầu app cho NV (quá hạn / hôm nay / mai / lịch sắp tới 2–7 ngày, `flyer_todo`, `js/reminders.js`) ngay khi QL tạo đợt. **Telegram** (vào nhóm nhận thông báo): đợt mới → báo lịch theo ngày (mục `flyernew`, `flyer_campaigns.announced_at`, gửi ở lần tick kế tiếp ≤ 5 phút); trước giờ hạn `FLYER_REMIND_BEFORE_MIN` (120) phút nhắc người chưa nộp ảnh (mục `flyerpre`, `flyer_tasks.reminded_at`, đổi ngày/giờ hạn thì nhắc lại); tới giờ hạn gửi QL danh sách ✅/❌ (mục `flyer`, `flyer_tasks.notified_at`). Migration 0880 + 0930 | CV → 📄 Tờ rơi | `pages/cv-flyer.js`, `pages/report.js` (todoAll), `notify/index.ts` (flyerText, tick), `notify/summary2.ts` (flyerMsg) | `flyer_routes`, `flyer_campaigns`, `flyer_tasks`, `flyer_assign`, `flyer_board`, `flyer_generate`, `flyer_route_save`, `flyer_route_delete`, `flyer_task_assign`, `flyer_task_update`, `flyer_campaign_delete`, `flyer_report`, `flyer_report_clear`, `flyer_todo` |
| D7 | **Việc**: 🔗 Link trang tính (chỉ QL) · ⏰ Việc QL có deadline (QL bấm Hoàn thành + ghi chú) · 📢 Triển khai toàn NV / theo bộ phận (NV bấm "Đã đọc & nắm rõ") · 📌 Giao việc NV (NV bấm "Hoàn thành" + ghi chú). QL dán nội dung + đính kèm ảnh, PDF, Excel, Word, PowerPoint, file nén ≤ 10MB/file (lưu Google Drive qua Apps Script; chữ trong Word/Excel/PowerPoint được đọc bằng `js/lib-office.js` để AI tóm tắt) → ✨ AI tóm tắt (Gemini, lời nhắc + khuôn JSON trong `supabase/functions/tasks/prompt.ts`): **tiêu đề, hạn hoàn tất (+giờ), thời gian áp dụng, nội dung chính (đủ mọi mức %/điều kiện), lưu ý, người hỗ trợ, gợi ý lặp lại / lâu dài**; mẫu chuẩn `supabase/tests/fixtures/task-unipass.*` kiểm tra mỗi lần deploy (`ai_summary_test.mjs`); link trong nội dung hiện thành nút → cảnh báo nếu chọn nhắc lại chưa đúng (cả khi không dùng AI, dò chữ "hằng tuần, quy định…") → tick ⭐ Quan trọng, nhắc lại tuần / tháng / 2 tháng (mỗi kỳ NV xác nhận lại), 📌 Lâu dài. **Việc thời vụ tự ẩn** với NV sau hạn + `TASK_HIDE_GRACE_DAYS` (3) ngày, không có hạn thì sau `TASK_AUTO_HIDE_DAYS` (30) ngày; QL tìm lại bằng ô 🔎. QL xem tiến độ ai đã đọc / hoàn thành lúc nào, copy lời nhắc | CV → 📋 Việc | `pages/cv-tasks.js`, Edge function `tasks` (summarize / upload / delete), `supabase/apps-script/drive-upload.gs` | `tasks`, `task_acks`, `task_save`, `task_set_status`, `task_ack`, `_task_period`, `_task_hide_after`, `can_see_task`; khoá `GEMINI_API_KEY`, `DRIVE_UPLOAD_URL`, `DRIVE_UPLOAD_SECRET` (GitHub Secrets → `set-private.mjs`) |
| D6 | **Quỹ thu chi** (thay tool quy cũ dùng Firebase): số dư, thu/chi tháng, thêm khoản (mọi thành viên), sửa/xoá (quản lý; người tạo trong 24 giờ), lọc tháng/loại/danh mục/người, thống kê, copy, CSV, nhật ký; danh mục & đối tác (chủ quản). Dữ liệu cũ chép 1 lần bằng GitHub Actions | CV → 💵 Quỹ | `pages/cv-fund.js` | `fund_tx`, `fund_save`, `fund_delete`, `fund_log`, settings `FUND_CATEGORIES`, `FUND_PARTNERS`; `supabase/scripts/import-quy.mjs` |
| D5 | Thống kê CV theo NV | CV → Thống kê | `pages/cv.js` | (đọc các bảng trên) |
| D12 | **📋 Bảng việc — giao việc & nộp ảnh** (migration 0940): QL giao việc (hạng mục, tên, hướng dẫn, người làm **theo ca** (lịch ca) / **chọn người** (thấy ai OFF / bận) / **cả bộ phận**, ngày + giờ hạn, **lặp mỗi ngày đến** (≤ 31 ngày), minh chứng 📷 ảnh tối thiểu–tối đa / ☑️ checklist + ảnh / ✅ chỉ bấm hoàn thành, **⭐ trừ khi nộp trễ** và **⭐ trừ khi bỏ lỡ** do QL khai báo). **Không cần duyệt**: NV nộp là xong (`job_submit`; trễ thì trừ `pen_late` một lần). Quá hạn `JOB_MISS_HOURS` (24) giờ chưa nộp → **Bỏ lỡ**, trừ `pen_miss` (`job_tick`, notify tick 5 phút). Ảnh nén trên máy → Edge `tasks` mode `job_upload` → Apps Script bản 2 → Drive `JOB_DRIVE_PATH` / `<Mã - Tên NV>` / `<Hạng mục>` / `<YYYY-MM-DD>_<HHhMM>_<việc>_<n>.jpg`; thư mục NV lưu ở `job_folders`. QL: **📊 Hôm nay** (từng NV: chip việc theo trạng thái, 🔔 Nhắc = thông báo đẩy, 📁 thư mục Drive; bấm chip → xem ảnh, nộp hộ, đổi hạn / người (cả lần giao), mở lại (hoàn sao), xoá (hoàn sao, ảnh giữ trên Drive)) · **📈 Thống kê** (khoảng ngày, bộ phận, hạng mục: theo NV, NV × ngày (số ảnh, màu trạng thái), theo hạng mục, bấm tên NV xem từng việc + ảnh, CSV) · **🗂️ Hạng mục** (tên, biểu tượng, thứ tự, đang dùng, đưa vào Telegram) · **⚙️ Cài đặt** (giờ bỏ lỡ, phút nhắc trước, ẩn / hiện tab CV cũ với NV, ai đã bật thông báo, kiểm tra Drive) | 🏠 Hôm nay · 📋 Giao việc | `pages/jobs.js`, `js/jobs-common.js` (stateOf, openSubmit, openManage), `pages/today.js`, Edge `tasks` (job_upload), `supabase/apps-script/drive-upload.gs` (bản 2) | `job_types`, `jobs`, `job_folders`, `job_type_save`, `job_type_delete`, `job_assign`, `job_update`, `job_delete`, `job_reopen`, `job_submit`, `job_tick`, `_job_star` (ghi `star_adjustments` + `score_log`), `_vn_ts`, `_mins_txt`; settings `JOB_MISS_HOURS`, `JOB_REMIND_BEFORE_MIN`, `JOB_DRIVE_PATH` |
| D12b | **🗓️ Lịch ca** từ tool sắp ca: file Excel / CSV dạng bảng “Quản lý phân ca” (hàng ngày `T2 (23/11)` gộp 6 cột; `Bộ phận · User · Họ tên · Tổng · Ca 1…Ca 6`, ô số giờ > 0 = làm ca đó). Notify tick **30 phút / lần** đọc file mới nhất trong `SHIFT_DRIVE_PATH` (Apps Script `latest`, file chưa đổi thì không tải lại) → `_shift_save`; QL bấm 📥 Lấy file từ Drive hoặc chọn file trên máy (xem trước, ai chưa khớp mã) → `shift_import`. Ghép NV theo mã User, không có thì theo họ tên. Giờ từng ca `SHIFT_SLOTS` | 📋 Giao việc → 🗓️ Lịch ca | `pages/jobs.js` (shift), `js/lib-shift.js` = `functions/_shared/shift.ts` (sửa cả hai), `notify/jobs.ts` (shiftAuto, importShiftFile; SheetJS `npm:xlsx@0.18.5`) | `shifts`, `_shift_save`, `shift_import`; settings `SHIFT_DRIVE_PATH`, `SHIFT_SLOTS`, `SHIFT_LAST` |
| D12c | **🔔 Thông báo đẩy** (Web Push, chạy cả khi tắt Telegram): việc mới (`pushed_at`), nhắc trước hạn `JOB_REMIND_BEFORE_MIN` phút (`reminded_at`), quá hạn (`overdue_at`), QL bấm 🔔 Nhắc. Khoá VAPID tự tạo lần đầu (private_settings `PUSH_VAPID_JWK`). App cài được ra màn hình chính (manifest, `sw.js` chỉ nhận thông báo, không lưu đệm) | 🏠 Hôm nay (bật) · 📋 Giao việc | `js/push.js`, `v2/sw.js`, `v2/manifest.webmanifest`, `v2/icons/`, Edge `push` (key / test / send), `functions/_shared/webpush.ts`, `notify/jobs.ts` (jobMaintenance) | `push_subs`, `push_subscribe`, `push_unsubscribe`, `push_status`, `push_overview` |
| D12d | **Lịch ca ↔ Lịch bận (23/11/2026, theo bảng HRM thực tế)**: 6 ca 07:30–09:00 · 09:00–12:00 · 12:00–15:00 · 15:00–18:00 · 18:00–21:00 · 21:00–22:00 (đã khớp HRM). Bộ đọc file hiểu cả dạng HRM (cột Nhân viên gộp "18450 - Hùng") lẫn dạng User / Họ tên tách cột; lưu **bộ phận trong file** (`shifts.pos`). **NV chỉ xem ca của NV**, không xem ca Quản lý / Trưởng ca (`SHIFT_PRIVATE_POS`, RLS `shifts.private`; QL thấy hết, có 🔒). 🏠 Hôm nay → **👥 Ca cả nhóm** (chọn ngày → từng ca ai làm). **Lịch bận làm lại**: CV → Lịch bận → 📝 Đăng ký tuần (từng ngày Đi làm / OFF / Bận + chọn Ca 1–6 có giờ; NV tự sửa / bỏ trước hạn; `busy_set`) · 📅 Lịch tháng · ⚠️ Đối chiếu ca (thay dán bảng HRM). Tool tự đọc **mọi file** Excel / CSV mới / vừa sửa trong thư mục lịch ca (TGDĐ, Topzone… mỗi bên 1 file; nhớ ở `SHIFT_SEEN`), mỗi file chỉ thay lịch NV có trong file. **Lưu lịch ca → tự so với lịch bận** (`_shift_conflicts`): OFF mà có ca, bận ca X mà bị xếp ca X, bận chưa ghi ca → báo Telegram `shiftcheck` + thông báo đẩy QL + ô đỏ ở Giao việc → Lịch ca + thẻ ngày ở Đăng ký tuần | CV → Lịch bận · 🏠 Hôm nay · Giao việc → Lịch ca | `js/lib-shift.js` + `_shared/shift.ts` (parseShiftAoa), `pages/cv-busy.js`, `js/team-shift.js`, `pages/jobs.js` (shift), `notify/jobs.ts` (shiftConflictMsg) | `shifts.pos/private`, `_shift_private`, `_shift_conflicts`, `shift_conflicts`, `busy_set`, `_shift_save` |
| D13 | **🔁 Việc lặp lại từ trang tính** (23/11/2026): QL dán link trang tính (Giao việc → 🔁 Lặp lại; cài đặt `RT_SHEET_ID`), Apps Script **bản 4** (`sheet_read`) đọc 30 phút / lần; `_shared/rtask.ts` hiểu từng dòng không cần AI (siêu thị TGDĐ / Topzone / PG · hằng ngày / thứ 2–CN / theo lịch đăng ký · "Ca 3 và Ca 6" ghép "14h00 và 21h15" · "2 tiếng 1 lần" nhiều mốc · "Từ 8h đến trước 11h" · "Trước khi hết ca 30 phút, không có ca thì 17h" · nộp ảnh / ≥ n link · "có thể báo cáo trước") → `job_templates`. `rt_generate` mỗi lượt giao việc hôm nay theo **lịch ca**: "nhân sự trong ca" = **cả ca nhận, 1 người nộp là xong** (`group_key`, `group_staff`, `done_staff`); "All nhân sự" = từng NV (có ca / mọi NV); "Theo lịch đăng ký" = người đăng ký vệ sinh; hạn đã qua lúc giao thì không tạo; đổi ca → bỏ việc chưa làm. Nhắc **chỉ thông báo đẩy, đích danh**: vào ca (tổng quan việc), trước hạn 1 giờ, trước hạn 5 phút (`RT_REMIND_SOON_MIN`), quá hạn cứ 15 phút (`RT_NAG_EVERY_MIN`); **không nhắc sau 22:15** (`RT_NAG_UNTIL`). Trễ chỉ ghi nhận, không trừ sao. Telegram: `jobday` (22:20) / `jobweek` theo nhóm việc, việc cả ca tính 1 lần, dòng số lần trễ. TikTok + báo cáo vệ sinh theo lịch đăng ký chuyển sang Bảng việc (tắt sao TikTok cũ: `TIKTOK_START_DATE` rỗng; tắt tin Telegram `tiktok`, `clean`; bỏ tab CV → TikTok) | Giao việc → 🔁 Lặp lại · 🏠 Hôm nay | `_shared/rtask.ts`, `notify/jobs.ts` (rtAuto, shiftStartNudges, collapseGroups), `tasks` (rt_link, rt_sync), `pages/jobs-rt.js`, `js/jobs-common.js` (link, cả ca) | `job_templates`, `job_nudges`, `rt_generate`, `_rt_save_templates`, `job_submit(…, p_links)`, `jobs.group_key/group_staff/done_staff/links/links_min/start_at/remind5_at/nag_at` |
| D13b | **📲 Theo dõi thông báo** (23/11/2026): mỗi thông báo đẩy gửi cho 1 NV ghi 1 dòng `push_log` (loại: việc mới / trước hạn / sắp hết hạn / quá hạn / nhắc lại / vào ca / QL nhắc, các việc liên quan, số máy, gửi được). Thông báo mang mã `ack` (id + HMAC từ khoá riêng VAPID); service worker báo lại Edge Function `push` (mode `ack`, không cần đăng nhập): **tới máy** / **bấm mở** / **gạt tắt** (iPhone không báo gạt tắt). NV mở trang Hôm nay → `job_seen` ghi `jobs.seen_at` (**đã xem**). QL: hộp chi tiết việc có khung "📲 Thông báo & đã xem" từng NV; bảng Hôm nay hiện 🔕 (chưa bật thông báo) và 👀 (đã xem). Telegram `jobday`: dòng chưa bật thông báo · đã nhắc mà vẫn trễ (số nhắc, tới máy, bấm mở, gạt tắt) · chưa mở xem việc trễ. Nhật ký giữ 60 ngày | Giao việc → chi tiết việc · Telegram jobday | `_shared/webpush.ts` (pushMany ghi log, ackSign/ackVerify), `push` (ack), `notify/jobs.ts` (kind, loadPush, pushLines), `sw.js`, `js/push-track.js` | `push_log`, `jobs.seen_at`, `job_seen` |
| D14 | **🤖 Trợ lý vận hành + 📥 Duyệt** (23/11/2026, không dùng AI chấm ảnh — chủ quản chọn): `notify/agent.ts` chạy mỗi lượt 5 phút: (1) việc quá hạn `AGENT_ESC_MIN` (30) phút hoặc đã nhắc `AGENT_ESC_NAGS` (3) lần mà NV không bấm mở → thông báo đẩy trưởng ca đang trong ca (shifts.pos "Trưởng Ca") + QL bộ phận (không có → chủ quản), `jobs.escalated_at`, đưa vào hộp duyệt (cho nộp bù / ghi trễ; NV nộp rồi thì tự đóng); (2) hết mỗi khung ca: việc của khung đó còn chưa nộp → báo trưởng ca / QL; (3) 15 phút 1 lần canh: chưa có lịch ca ngày mai (`AGENT_SHIFT_CHECK` 20:00, báo gấp), ảnh BI lỗi / chưa có (`AGENT_BI_CHECK` 09:30), lỗi đọc trang tính (báo gấp), NV có việc chưa bật thông báo, lịch ca trùng bận 7 ngày, số BI kẹt; (4) khung giờ `AGENT_TIMES` (12:00 · 17:00 · 21:30): tin tổng hợp hộp duyệt qua Telegram (mục `agent`, nơi nhận `AGENT_CHAT_IDS` hoặc như các tin khác) + thông báo đẩy Giám đốc / QL; CN khung cuối kèm phân tích tuần (ai / việc / giờ hay trễ + gợi ý). NV: hộp nộp việc có "🙋 Xin dời hạn / xin miễn" (`agent_request`). Trang **📥 Duyệt** (QL): Chờ duyệt / Cần biết / Đã xử lý; `agent_decide`: cho nộp bù (tạo việc "Nộp bù: …", việc cũ → bỏ lỡ, ghi trễ), đồng ý dời (tạo việc hạn mới, việc cũ `excused`), cho miễn (`excused`), ghi trễ, từ chối; kết quả báo NV bằng thông báo đẩy. Chủ quản chỉnh cài đặt ngay trên trang | 📥 Duyệt · Hôm nay (NV) · Telegram | `notify/agent.ts`, `notify/jobs.ts` (gọi agentTick), `notify/index.ts` (mục agent), `pages/duyet.js`, `js/jobs-common.js` (xin dời / miễn) | `agent_items`, `agent_request`, `agent_decide`, `_agent_clone`, `jobs.excused`, `jobs.escalated_at`, cài đặt `AGENT_*` |
| D14b | **📥 Duyệt = nơi duy nhất + 🛠️ bộ canh** (23/11/2026): trang Duyệt có thêm 🔥 thưởng nóng, 🎁 thưởng bán thêm, ✏️ sửa báo cáo sau giờ chốt (duyệt ngay tại chỗ bằng `review_hot_bonus` / `review_proposal` / `review_change`; trang Quản lý → Duyệt vẫn còn); số đỏ chờ duyệt chuyển từ menu Quản lý sang 📥 Duyệt (`S.pending.agent`); tin hộp duyệt Telegram kèm các mục này. Mỗi lượt `notify` chạy xong ghi nhịp tim `system_health` (lỗi từng phần → mục "🛠️ Lỗi chạy tự động" trong Cần biết); thanh 🟢/🟡/🔴 đầu trang Duyệt. `_watchdog()` (pg_cron `thidua-watchdog` 10 phút, chạy trong CSDL, gửi Telegram thẳng qua pg_net): quá 30 phút không có nhịp → báo "TOOL NGỪNG CHẠY" (nhắc lại mỗi 2 giờ, ban đêm không rung), chạy lại → báo "đã chạy lại" | 📥 Duyệt | `pages/duyet.js`, `app.js` (badge), `store.js` (loadPending), `notify/index.ts` (heartbeat), `notify/agent.ts` | `system_health`, `_watchdog`, cron `thidua-watchdog` |
| D15 | **🧠 Cố vấn AI cho Giám đốc** (23/11/2026): Edge Function `advisor` + `_shared/advisor.ts`, 3 Agent dùng AI chữ (Gemini, không ảnh): **📊 Thi đua** (số BI doanh thu kênh, `store_contest`, thẻ BI từng NV → tổng quan, rủi ro + cần bù bao nhiêu/ngày, điểm sáng, NV kéo / cần hỗ trợ, 3 việc làm ngay; tự viết `ADV_BIZ_TIMES` 10:00 · 21:00, thông báo đẩy Giám đốc / QL + Telegram như Trợ lý); **💚 Sức khoẻ nhân sự** (14 ngày: việc đúng hạn / trễ / bỏ lỡ, đã xem việc, thông báo nhận / mở / gạt, ca làm: ngày, giờ, ngày liền, ca tối, 7 ngày tới, đăng ký bận; BI tháng này vs tháng trước; sao → phong độ tốt / cần quan tâm / rủi ro + gợi ý 1-1; `ADV_PEOPLE_DOW` thứ 2 `ADV_PEOPLE_TIME` 09:00; Telegram chỉ `ADV_PRIVATE_CHAT_IDS`); **💬 Hỏi đáp** (câu hỏi bằng lời, dữ liệu: thi đua + nhân sự + việc hôm nay + hộp duyệt + 2 báo cáo gần nhất). Số tính sẵn bằng code, AI chỉ viết nhận định. pg_cron `thidua-advisor` 10 phút (chạy nền `EdgeRuntime.waitUntil`). Trang **🧠 Cố vấn** (QL, thanh dưới điện thoại thay "Báo cáo" cho QL): đọc bản mới nhất, "🔄 Phân tích ngay", các bản trước, cài đặt (chủ quản) | 🧠 Cố vấn | `advisor/index.ts`, `_shared/advisor.ts`, `pages/advisor.js` | `advisor_reports`, cài đặt `ADV_*`, cron `thidua-advisor` |

### E. Telegram
| Mã | Chức năng | Trên web | File | Ghi chú |
|---|---|---|---|---|
| E1 | Bật/tắt + giờ + tần suất từng đầu mục (daily, weekly, revenue, score, tiktok, clean, busy, rs, service): Hằng ngày / Hằng tuần (1 thứ) / Chọn thứ (`dows`) / Ngày hạn T3-T6 (tiktok). QL chỉnh được lịch; token, nơi nhận, bật chung chỉ chủ quản | Quản lý → Telegram | `pages/admin.js` (telegram), `supabase/functions/notify/index.ts` (`items`, `tick`) | `save_notify_items` (setting `NOTIFY_ITEMS`); pg_cron `thidua-notify` gọi 5 phút/lần, chống gửi trùng bằng `notify_log` |
| E3 | **💵 Quỹ thu chi qua Telegram** (đầu mục `fund`, mặc định **bật, thứ 2 09:00**; QL đổi tần suất / thứ / giờ ở bảng lịch như mọi đầu mục): kỳ báo cáo = **từ ngày sau lần gửi quỹ trước** (tự động hoặc gửi tay) đến ngày gửi, lần đầu 7 ngày; khoản ngày cũ mới nhập sau lần gửi trước kèm nhãn "⤴ ghi bổ sung". Nội dung: tổng thu, tổng chi, chênh lệch, **số dư** (tính ở máy chủ), chi tiết từng khoản (ngày, danh mục, tên, số tiền, người, ghi chú), chi theo danh mục, tổng tháng. Gửi dày (< 7 ngày) mà không có khoản nào thì bỏ qua. QL chọn **khoảng ngày bất kỳ**: Telegram → Xem trước & gửi ngay (đầu mục Quỹ hiện ô "Từ ngày") hoặc CV → 💵 Quỹ → **📤 Báo cáo Telegram** (7 ngày / từ đầu tháng / từ lần gửi trước → xem trước → gửi) | Quản lý → Telegram · CV → 💵 Quỹ | `functions/notify/index.ts` (ITEMS.fund, compose opt.from), `functions/notify/summary2.ts` (fundMsg), `pages/admin.js` (telegram: tgFrom), `pages/cv-fund.js` (teleReport) | `fund_summary` (chỉ service_role), `fund_tx`, `notify_log` |
| E2 | Nội dung tin | n/a | `functions/notify/summary.ts`, `summary2.ts` | `current_streaks` |
| E4 | **📋 Báo cáo công việc theo hạng mục** (D12): `jobday` (mặc định bật, hằng ngày 21:45: từng hạng mục — ai đã nộp + số ảnh, trễ, ai chưa nộp + hạn, bỏ lỡ) và `jobweek` (mặc định bật, thứ 2 09:05: gửi CN = tuần này, ngày khác = tuần trước; từng hạng mục: số việc, % đúng hạn, ảnh, từng NV x/y; đúng hạn 100%, cần nhắc). Hạng mục bỏ tick Telegram thì không đưa vào | Quản lý → Telegram | `functions/notify/jobs.ts` (jobDayMsg, jobWeekMsg, weekRange, loadJobs), `notify/index.ts` (ITEMS, compose) | `jobs`, `job_types.tg` |
| E4b | **⏰ Nhắc công việc qua Telegram** (`jobdue`, mặc định bật): ngay khi việc chưa nộp ảnh **sắp tới hạn** (trước `JOB_REMIND_BEFORE_MIN` phút) hoặc **vừa quá hạn** → 1 tin nhóm liệt kê NV + việc + giờ hạn (cùng lúc với thông báo đẩy, mỗi việc 1 lần). Tin `jobday` có dòng **⏰ Trễ hôm nay** và `jobweek` có dòng **⏰ Số lần trễ trong tuần** theo từng NV (nộp trễ + bỏ lỡ + quá hạn chưa nộp) | Quản lý → Telegram | `notify/jobs.ts` (jobDueMsg, lateSummary), `notify/index.ts` (tick) | `jobs.reminded_at`, `jobs.overdue_at` |

### F. Quản lý / cài đặt
| Mã | Chức năng | Trên web | File | Hàm / bảng SQL |
|---|---|---|---|---|
| F1 | Nhân sự (thêm, ẩn, bộ phận, môn riêng) | Quản lý → Nhân sự | `pages/admin.js` (staff) | `staff`, `set_staff_total` |
| F1b | **👥 Nhân sự 360°**: cột Báo cáo tháng (số ngày, OFF, ✅ hôm nay / ⚠️ quá 1 ngày chưa báo cáo), Nộp trễ, Vi phạm, Tài khoản (có membership đang bật), dòng đỏ = âm sao; bấm tên → **hồ sơ**: tổng sao, điểm & hạng tháng, báo cáo, nộp trễ · vi phạm, danh sách vi phạm tháng, bận/OFF 7 ngày tới, nút mở Trang cá nhân / Báo cáo / Biên bản (chọn sẵn NV qua localStorage `thidua-v2-me-staff`, `thidua-v2-staff`, `thidua-v2-vio-who`) | Quản lý → Nhân sự | `pages/admin.js` (staff, profile), `pages/me.js`, `pages/cv-vio.js` | `staff_overview`, `score_board`, `violations`, `busy` |
| F2 | Môn & sao thưởng/phạt, **Nhân sao X2/X3** (chỉ môn đánh dấu). **Lọc theo kênh** (Chung / PG / TGDĐ / Topzone), trạng thái bật/tắt, tên; Bật/Tắt tất cả đang hiện (nhớ bộ lọc, lưu vẫn lưu mọi môn). Nhãn **📅 Môn tháng** (ô Target/ngày khoá, hiện "NV báo cáo: x/ngày" = target tháng ÷ ngày làm × 200%) và **Ngoài môn tháng — NV không báo cáo**; lọc theo 2 nhãn này | Quản lý → Môn & sao | `pages/admin.js` (items) | `items.is_x2`, `items.is_x3`, `_compute_report` |
| F2q | **⚡ Chỉnh nhanh môn & sao theo bộ phận** (mặc định khi mở Môn & sao): mỗi môn 1 dòng, mỗi bộ phận 1 cột: **+** sao thưởng, **−** sao phạt, công tắc **Bật/Tắt**; sửa là tự lưu (gom 0,7 giây). Ô "theo Chung" (chữ nghiêng) = đang dùng dòng Chung, sửa sẽ tạo mức riêng; ↺ bỏ mức riêng. "Chưa áp dụng" = bộ phận chưa có môn, bật để thêm (chép từ dòng gốc). Bật hết / Tắt hết từng cột (không tự thêm môn chưa áp dụng). Sao phạt 0 = không trừ sao (B1). **Quản lý** dùng được cho bộ phận trong `memberships.stores`; chủ quản thêm cột Chung + chuyển sang **📋 Bảng chi tiết** (F2) | Quản lý → Môn & sao | `pages/admin.js` (itemsQuick, viewSwitch) | `items_quick_save` (ghi `audit_log` ITEMS_QUICK), `items` |
| F2c | **Gợi ý sao theo kết quả siêu thị**: dán báo cáo (Tổng / %Đạt) → nhóm 🎯 Tập trung 5đ · 🌱 Target thấp 3đ · ⚡ Gần về số (dự kiến 70–100%) 2đ · môn khác 1đ · ✅ Đã về số lũy kế 0 sao, không trừ; 1đ = +100/−50 (sửa được) → Áp dụng / Copy gửi nhóm | Quản lý → Môn & sao (khung đầu) | `pages/admin-suggest.js` | `apply_star_suggestions`, `items.focus/low_target/store_target/store_pct`, setting `STAR_POINTS` |
| F2b | **Thưởng & trừ sao**: ngưỡng X2/X3, ngày bắt đầu trừ, tăng ca, hệ số lũy tiến + bảng xem trước | Quản lý → Cài đặt (thẻ đầu tiên) | `js/star-rules.js` (dayOutcome, starCardHtml), `pages/admin.js` | settings `STREAK_*`, `PEN_*`, `DOUBLE_/TRIPLE_BONUS_RATE` |
| F3 | Target/sao riêng từng NV (chỉ còn tác dụng với sao khi NV đã được giao môn tháng) | Quản lý → Target NV | `pages/admin.js` (targets) | `staff_targets` |
| F4 | Ẩn trang/chức năng theo vai trò. **`cv.nav`** (mặc định ẩn với NV từ migration 0940): tab CV không hiện trên menu / thanh dưới của NV; NV mở từng chức năng CV từ 🏠 Hôm nay (CV chỉ hiện 1 tab + “← Hôm nay”). QL bật lại ở Giao việc → ⚙️ Cài đặt hoặc ở đây | Cài đặt → Ẩn trang | `pages/admin.js` (FEATURES), `js/store.js` (isHidden), `js/app.js` (PAGES.nav / tab), `pages/cv.js` (focus) | setting `HIDE` |
| F5 | Ngưỡng chuỗi/phạt, giờ chốt, trọng số điểm, quy tắc riêng từng môn, khoá AI | Quản lý → Cài đặt | `pages/admin.js` (settings) | `settings`, `private_settings` |
| F6 | Nhật ký thao tác | Quản lý → Nhật ký | `pages/admin.js` (audit) | `audit_log` |

### G. Khác
| Mã | Chức năng | Trên web | File |
|---|---|---|---|
| G1 | Trợ lý AI (Gemini) | Trợ lý | `pages/assistant.js`, `functions/assistant/index.ts` (cần `GEMINI_API_KEY` ở Cài đặt) |
| G2 | Trang luật | Rule | `pages/rules.js` |
| G3 | Giao diện chung, menu, tabbar mobile. **Điện thoại** (≤ 640px): dải tab con (`.subtabs`, `.seg`) cuộn ngang 1 hàng, tab đang chọn tự vào giữa (`centerTab`); lịch tháng (`monthGrid`) thành **danh sách theo ngày**, tháng hiện tại ẩn các tuần đã qua (nút "↑ Xem các tuần trước"); tiêu đề app không xuống dòng; chip / nút nhỏ cao ≥ 36px | n/a | `v2/index.html`, `v2/css/app.css`, `js/ui.js` (monthGrid, centerTab), `js/app.js` |
| G5 | **Gọn tool (23/11/2026, chủ quản chọn)**: menu chính = 🏠 Hôm nay · 📝 Báo cáo · 📋 Giao việc (QL) · 🏅 Xếp hạng · 🏢 Siêu thị · ⚙️ Quản lý (QL); phần còn lại (CV, Báo cáo đã nộp, Trợ lý, Rule) trong **☰ Thêm** (máy tính cũng có nút Thêm). **🏅 Xếp hạng gộp 3 trang** thành 3 tab Điểm (C10) · Sao (B8) · Của tôi (C11) (`pages/rankhub.js`; địa chỉ cũ #score / #ranking / #me mở đúng tab; tab bị Ẩn trang thì không hiện). **Bỏ CV → Việc + CV → Thống kê** (giao việc dùng D12; dữ liệu cũ giữ). **Bỏ nhập lũy kế tay thứ 2** (C12: dải nhắc, nút Cập nhật lũy kế ở Của tôi, nhắc trong Báo cáo / Hôm nay, tin Telegram `cum`) — bật lại: cài đặt `CUM_MANUAL` = true; QL vẫn nhập hộ ở Điểm & DT → Lũy kế tuần. **Siêu thị**: khung dán văn bản thu xuống cuối trang (✍️ Nhập tay, chỉ khi chưa có ảnh BI). Lịch sử thành nút **🕒 Báo cáo đã nộp** trong trang Báo cáo. Migration 0980: NV ẩn Trợ lý, Rule; bỏ 🏢 Siêu thị khỏi danh sách ẩn (để mục Doanh thu / Thi đua của Hôm nay hiện cho NV) | Menu, ☰ Thêm | `js/app.js` (PAGES: more, alias, group, ok), `js/simplify.js` (CV_DROPPED, keepTodo, cumManual), `pages/rankhub.js` | `HIDE`, `CUM_MANUAL`, `NOTIFY_ITEMS` |
| G4 | **Sắp xếp mọi bảng**: bấm tiêu đề cột → giảm/tăng (số, ngày, chữ tiếng Việt), nhớ khi bảng vẽ lại; bỏ qua bảng/cột có class `nosort`. Xếp hạng điểm trên điện thoại có ô chọn sắp xếp | Mọi trang | `js/ui.js` (enableAutoSort), `pages/score.js` | n/a |

---

## 3. Luật tính

**Sao ngày (B3)**: % = thực đạt ÷ target ngày.
- Đạt ≥ 100% thì **Về số**, cộng `bonus_star` của môn. Chỉ môn đánh dấu mới nhân: môn X2 hoặc X3 đạt ≥ `DOUBLE_BONUS_RATE` (150%) → ×2; môn X3 đạt ≥ `TRIPLE_BONUS_RATE` (200%) → ×3.
- Dưới 100% thì **Chưa về**, chuỗi ngày chưa về tăng lên (chỉnh bằng giao diện ở F2b, có bảng xem trước; "ngày thứ N" trên giao diện = chuỗi N−1 trong cài đặt; tăng ca = 99 nghĩa là không dùng):
  - chuỗi < `STREAK_OVERTIME` (3) và < `STREAK_PENALTY_STAR` (5): chỉ ghi nhận;
  - chuỗi ≥ `STREAK_OVERTIME`: tăng ca;
  - chuỗi ≥ `STREAK_PENALTY_STAR`: trừ `penalty_star` × hệ số. Hệ số là 1,5 / 2 / 5 khi chuỗi đạt `PEN_T2_MIN` / `PEN_T3_MIN` / `PEN_T4_MIN` (4 / 6 / 8). Không đủ sao thì chuyển sang tăng ca.
  - `ITEM_RULES` chỉnh riêng ot/pen/noPen theo môn, bộ phận hoặc NV.
- Nộp sau `CUTOFF_TIME` (22:20): trừ `LATE_STEP` × số lần trễ trong tháng.

**Điểm xếp hạng (C10)**, kỳ tháng hoặc tuần (target tính theo tỷ lệ số ngày của kỳ):
- DT = `W_REVENUE` (40) × min(1, lũy kế DT ÷ target DT)
- Thi đua = `W_CONTEST` (40) × trung bình min(1, lũy kế môn ÷ target tháng môn)
- Phục vụ = `W_SERVICE` (20) × điểm thô ÷ điểm thô cao nhất siêu thị. Điểm thô = 5★ − 4★×1 − 3★×2 − 2★×3 − 1★×4 − khiếu nại×5 (`RATING_DEDUCT`).
- Vi phạm: − `VIOLATION_POINTS` (2) mỗi lỗi, trừ vào tổng.

**Target tháng (C1–C3)**:
- Target tháng mỗi NV = Tổng ÷ số NS trong báo cáo.
- Target báo cáo ngày = 200% × target tháng ÷ số ngày làm việc (mặc định số ngày trong tháng − `DAYS_OFF`), làm tròn lên, tối thiểu 0,5. Điểm thi đua xếp hạng vẫn so với target tháng.

## 4. Cài đặt (bảng `settings`)
`JOB_MISS_HOURS JOB_REMIND_BEFORE_MIN JOB_DRIVE_PATH SHIFT_DRIVE_PATH SHIFT_SLOTS SHIFT_LAST PG_DEPTS PG_ADDONS TASK_HIDE_GRACE_DAYS TASK_AUTO_HIDE_DAYS FUND_CATEGORIES FUND_PARTNERS FUND_IMPORTED_AT HELP_DELAY_S DAILY_TARGET_PCT DAILY_TARGET_MIN STAR_POINTS SCORE_SEE_ALL TRIPLE_BONUS_RATE STORE_NAME CUTOFF_TIME STREAK_OVERTIME STREAK_PENALTY_STAR PEN_T2_MIN PEN_T3_MIN PEN_T4_MIN PEN_M1..M4 LATE_STEP DOUBLE_BONUS_RATE AUTO_STREAK_ENABLED EMPLOYEE_SEE_LEADERBOARD ITEM_RULES HIDE W_REVENUE W_CONTEST W_SERVICE VIOLATION_POINTS VIOLATION_TYPES RATING_DEDUCT REVENUE_UNIT DAYS_OFF TIKTOK_* RS_MIN_KM RS_MIN_MIN BUSY_MAX_WEEKDAY NOTIFY_ENABLED NOTIFY_CHAT_IDS NOTIFY_ITEMS`
Khoá bí mật (bảng `private_settings`, không đọc được từ web): `TELEGRAM_BOT_TOKEN GEMINI_API_KEY CRON_SECRET PUSH_VAPID_JWK DRIVE_UPLOAD_URL DRIVE_UPLOAD_SECRET`

---

## 5. Kỹ thuật

```
v2/                      web tĩnh (GitHub Pages), ES modules thuần, supabase-js 2.76.0 (jsdelivr)
  js/app.js              menu PAGES, đăng nhập, điều hướng
  js/store.js            client Supabase, S (cache staff/items/settings), realtime, isHidden
  js/ui.js               $, esc, fmt, toast, modal, confirmBox, ngày tháng
  js/pages/*.js          mỗi trang 1 file, export render(view)
supabase/migrations/     SQL, áp lần lượt, mỗi file chỉ chạy 1 lần (bảng v2_migrations)
supabase/functions/      Edge functions Deno: notify, accounts, assistant
supabase/tests/          kiểm thử cục bộ (Postgres 16 cổng 5433) + ui/ (Playwright)
backend/                 bản cũ (policy.js = luật gốc dùng để đối chiếu), không sửa
```

**Deploy**: push `main`, rồi:
- GitHub Pages tự cập nhật `v2/` (≈1 phút);
- workflow **Supabase v2 deploy** (khi đổi `supabase/**`) áp migration mới, deploy functions, chạy verify.

Secret duy nhất: `SUPABASE_ACCESS_TOKEN`. Log workflow là **công khai**, nên không in dữ liệu cá nhân.

**Quy tắc khi sửa SQL**:
- Không sửa file migration đã áp. Thêm file mới `supabase/migrations/2026111500XXXX_v2_<tên>.sql` (số lớn hơn) với `create or replace`. Bản mới nhất là bản đang chạy (tra mục 8).
- Đổi tham số hàm thì `drop function` bản cũ trước.
- Hàm dùng `security definer set search_path = ''`, nên mọi tên bảng phải có `public.`.
- **Không chạy lại `migrate_legacy`.** Dữ liệu thật đang ở v2.

**Kiểm tra trước khi push**: `bash supabase/tests/check.sh` (≈1 phút), thêm `--ui` để kiểm thử giao diện. Script dựng lại DB, chạy đối chiếu luật cũ (diffs=0), RLS/modules/scoring rồi kiểm tra cú pháp JS.

---

## 6. Checklist kiểm tra (tick khi đã xem trên web thật)
- [ ] A1 NV đăng nhập bằng mã NV, đổi mật khẩu lần đầu
- [ ] B1/B2 NV có môn thi đua tháng thì báo cáo đúng số môn và đúng target ngày
- [ ] B3 Nộp báo cáo: sao cộng/trừ đúng, chuỗi đúng
- [ ] B4 Ô doanh thu QĐ bắt buộc, lưu được và cộng vào lũy kế (C5)
- [ ] B4b Gửi báo cáo xong bấm "Lưu / gửi ảnh" → mở Zalo/Line (điện thoại) hoặc tải ảnh
- [ ] B4c Báo cáo dễ nhập trên điện thoại 6.5–6.9"
- [ ] F2c Dán kết quả siêu thị → tick Tập trung / Target thấp → Áp dụng → sao môn đổi đúng
- [ ] B12 NV bán vượt môn target thấp → popup hoa, quản lý duyệt → +2.000⭐
- [ ] F2b Đổi luật trừ sao trong Cài đặt, bảng xem trước khớp kết quả báo cáo
- [ ] C1 Dán báo cáo target tháng: số NV, môn, target đúng
- [ ] C6 Nhập phục vụ tuần, người cao nhất được đủ 20
- [ ] C7 Ghi vi phạm thì tổng điểm −2
- [ ] C10 Bảng xếp hạng tuần/tháng hợp lý
- [ ] D1–D4 Các mục CV mở được, lưu được
- [ ] E1 Telegram gửi đúng giờ từng đầu mục
- [ ] F4 Ẩn trang cho NV có tác dụng

## 7. Việc còn mở
- Chưa tạo `GEMINI_API_KEY` (Trợ lý AI chưa chạy).
- Module "Nội dung" bản cũ (4 ghi chú) chưa chuyển sang v2.

---

## 8. Chỉ mục hàm / bảng SQL → file migration mới nhất
Tạo lại bằng `node supabase/scripts/fn-index.mjs` (tên file rút gọn: `000720_x.sql` = `20261115000720_v2_x.sql`).

| Tên | Loại | File:dòng (bản mới nhất) |
|---|---|---|
| `_bi_apply` | function | 000990_bi_auto_apply.sql:9 |
| `_bi_propose` | function | 000990_bi_auto_apply.sql:46 |
| `_compute_report` | function | 000730_x3_scoreboard.sql:71 |
| `_cum_tool` | function | 000820_cumulative.sql:62 |
| `_cum_window` | function | 000820_cumulative.sql:46 |
| `_daily_target` | function | 000750_daily_target_x2.sql:8 |
| `_ensure_contest_items` | function | 000720_report_items_from_contest.sql:59 |
| `_flyer_mgr` | function | 000880_flyer.sql:87 |
| `_is_pg` | function | 000910_pg_reports.sql:35 |
| `_item_measure` | function | 000820_cumulative.sql:38 |
| `_item_no_pen` | function | 000890_items_quick_violation_docs.sql:51 |
| `_item_streak` | function | 000200_logic.sql:24 |
| `_job_mgr` | function | 000940_jobs.sql:118 |
| `_job_star` | function | 000940_jobs.sql:140 |
| `_keep_one_owner` | function | 000830_manager_owner.sql:8 |
| `_manager_scope` | function | 000200_logic.sql:271 |
| `_member_for_staff` | function | 000600_modules.sql:125 |
| `_mins_txt` | function | 000940_jobs.sql:132 |
| `_pg_cum` | function | 000910_pg_reports.sql:43 |
| `_require_member` | function | 000200_logic.sql:189 |
| `_rt_save_templates` | function | 001010_recurring.sql:79 |
| `_rt_slot_at` | function | 001010_recurring.sql:71 |
| `_rt_slot_hm` | function | 001010_recurring.sql:66 |
| `_rt_store` | function | 001010_recurring.sql:60 |
| `_shift_conflicts` | function | 001000_shift_busy.sql:27 |
| `_shift_private` | function | 001000_shift_busy.sql:16 |
| `_shift_save` | function | 001000_shift_busy.sql:51 |
| `_staff_items` | function | 000890_items_quick_violation_docs.sql:7 |
| `_store_contest_set` | function | 000950_bi.sql:41 |
| `_task_hide_after` | function | 000790_tasks_notes_autohide.sql:12 |
| `_task_period` | function | 000780_tasks.sql:35 |
| `_vn_ts` | function | 000940_jobs.sql:127 |
| `_work_days` | function | 000720_report_items_from_contest.sql:9 |
| `add_violation` | function | 000890_items_quick_violation_docs.sql:140 |
| `adjust_revenue` | function | 000700_scoring.sql:229 |
| `adjust_stars` | function | 000700_scoring.sql:157 |
| `app_member` | function | 000100_core.sql:139 |
| `apply_star_suggestions` | function | 000740_star_suggest_hot.sql:57 |
| `bi_forget` | function | 000950_bi.sql:61 |
| `bi_review` | function | 000990_bi_auto_apply.sql:68 |
| `busy_deadline` | function | 000840_report_todo_media.sql:41 |
| `busy_delete` | function | 000600_modules.sql:262 |
| `busy_register` | function | 000840_report_todo_media.sql:47 |
| `busy_set` | function | 001000_shift_busy.sql:83 |
| `can_see_staff` | function | 000100_core.sql:150 |
| `can_see_task` | function | 000790_tasks_notes_autohide.sql:22 |
| `check_hot_bonus` | function | 000740_star_suggest_hot.sql:112 |
| `clean_delete` | function | 000600_modules.sql:232 |
| `clean_reassign` | function | 000810_zone_staff_map.sql:26 |
| `clean_register` | function | 000600_modules.sql:206 |
| `clean_report` | function | 000600_modules.sql:218 |
| `cum_form` | function | 000820_cumulative.sql:70 |
| `cum_submit` | function | 000820_cumulative.sql:91 |
| `cum_unlock` | function | 000820_cumulative.sql:133 |
| `current_streaks` | function | 000400_notify.sql:6 |
| `delete_rating` | function | 000700_scoring.sql:297 |
| `delete_report_day` | function | 000200_logic.sql:284 |
| `delete_result` | function | 000200_logic.sql:296 |
| `delete_revenue_adjust` | function | 000700_scoring.sql:241 |
| `delete_violation` | function | 000890_items_quick_violation_docs.sql:162 |
| `flyer_board` | function | 000880_flyer.sql:97 |
| `flyer_campaign_delete` | function | 000880_flyer.sql:256 |
| `flyer_generate` | function | 000880_flyer.sql:149 |
| `flyer_report` | function | 000880_flyer.sql:269 |
| `flyer_report_clear` | function | 000880_flyer.sql:282 |
| `flyer_route_delete` | function | 000880_flyer.sql:137 |
| `flyer_route_save` | function | 000880_flyer.sql:117 |
| `flyer_task_assign` | function | 000880_flyer.sql:212 |
| `flyer_task_update` | function | 000930_flyer_remind.sql:9 |
| `flyer_todo` | function | 000930_flyer_remind.sql:33 |
| `fund_delete` | function | 000770_fund.sql:62 |
| `fund_log` | function | 000770_fund.sql:79 |
| `fund_save` | function | 000770_fund.sql:32 |
| `fund_summary` | function | 000920_fund_notify.sql:3 |
| `hook_before_user_created` | function | 000880_security_hardening.sql:7 |
| `import_month_targets` | function | 000720_report_items_from_contest.sql:274 |
| `is_after_cutoff` | function | 000100_core.sql:175 |
| `is_manager` | function | 000100_core.sql:146 |
| `is_member` | function | 000100_core.sql:148 |
| `is_owner` | function | 000100_core.sql:144 |
| `items_quick_save` | function | 000890_items_quick_violation_docs.sql:93 |
| `job_assign` | function | 000940_jobs.sql:185 |
| `job_delete` | function | 000940_jobs.sql:264 |
| `job_reopen` | function | 000940_jobs.sql:285 |
| `job_submit` | function | 001010_recurring.sql:221 |
| `job_tick` | function | 000940_jobs.sql:340 |
| `job_type_delete` | function | 000940_jobs.sql:170 |
| `job_type_save` | function | 000940_jobs.sql:150 |
| `job_update` | function | 000940_jobs.sql:226 |
| `leaderboard` | function | 000200_logic.sql:368 |
| `legacy_date` | function | 000300_migrate.sql:8 |
| `legacy_hm` | function | 000610_update_logic.sql:6 |
| `legacy_num` | function | 000300_migrate.sql:21 |
| `legacy_text` | function | 000300_migrate.sql:32 |
| `migrate_check` | function | 000610_update_logic.sql:441 |
| `migrate_legacy` | function | 000610_update_logic.sql:221 |
| `migrate_legacy_all` | function | 000700_scoring.sql:420 |
| `pg_report_form` | function | 000910_pg_reports.sql:59 |
| `pg_report_save` | function | 000910_pg_reports.sql:79 |
| `preview_daily_report` | function | 000200_logic.sql:198 |
| `private_setting_status` | function | 000780_tasks.sql:153 |
| `push_overview` | function | 000940_jobs.sql:421 |
| `push_status` | function | 000940_jobs.sql:411 |
| `push_subscribe` | function | 000940_jobs.sql:391 |
| `push_unsubscribe` | function | 000940_jobs.sql:403 |
| `rank_reward_close` | function | 000870_rank_reward.sql:50 |
| `rank_reward_preview` | function | 000870_rank_reward.sql:23 |
| `report_form` | function | 000900_report_month_staff_overview.sql:5 |
| `reset_stars` | function | 000700_scoring.sql:175 |
| `reset_streak` | function | 000200_logic.sql:308 |
| `reset_streaks` | function | 000700_scoring.sql:192 |
| `review_change` | function | 000200_logic.sql:251 |
| `review_hot_bonus` | function | 000740_star_suggest_hot.sql:146 |
| `review_proposal` | function | 000200_logic.sql:318 |
| `rs_assign` | function | 000600_modules.sql:291 |
| `rs_delete` | function | 000600_modules.sql:322 |
| `rs_register` | function | 000600_modules.sql:278 |
| `rs_report` | function | 000600_modules.sql:306 |
| `rs_valid_time` | function | 000600_modules.sql:273 |
| `rt_generate` | function | 001010_recurring.sql:106 |
| `save_media` | function | 000840_report_todo_media.sql:26 |
| `save_monthly_target` | function | 000720_report_items_from_contest.sql:75 |
| `save_notify_items` | function | 000800_clean_zones_notify.sql:97 |
| `save_rating` | function | 000700_scoring.sql:273 |
| `save_revenue` | function | 000700_scoring.sql:208 |
| `save_store_contest` | function | 000200_logic.sql:346 |
| `score_board` | function | 000970_today_sections.sql:6 |
| `set_item_measure` | function | 000820_cumulative.sql:149 |
| `set_private_setting` | function | 000780_tasks.sql:143 |
| `set_staff_total` | function | 000700_scoring.sql:141 |
| `setting_num` | function | 000100_core.sql:160 |
| `setting_text` | function | 000100_core.sql:170 |
| `shift_conflicts` | function | 001000_shift_busy.sql:41 |
| `shift_import` | function | 000940_jobs.sql:382 |
| `staff_overview` | function | 000900_report_month_staff_overview.sql:33 |
| `staff_total` | function | 000700_scoring.sql:120 |
| `submit_daily_report` | function | 000200_logic.sql:225 |
| `task_ack` | function | 000780_tasks.sql:120 |
| `task_save` | function | 000790_tasks_notes_autohide.sql:35 |
| `task_set_status` | function | 000780_tasks.sql:99 |
| `tiktok_due_dates` | function | 000600_modules.sql:136 |
| `tiktok_manage` | function | 000600_modules.sql:189 |
| `tiktok_submit` | function | 000760_tiktok_early.sql:10 |
| `todo_list` | function | 000840_report_todo_media.sql:71 |
| `vn_hm` | function | 000600_modules.sql:122 |
| `vn_now` | function | 000100_core.sql:7 |
| `vn_today` | function | 000100_core.sql:9 |
| `zone_check` | function | 000800_clean_zones_notify.sql:78 |
| `zone_delete` | function | 000800_clean_zones_notify.sql:67 |
| `zone_save` | function | 000800_clean_zones_notify.sql:45 |
| `bi_files` | table | 000950_bi.sql:10 |
| `bi_proposals` | table | 000960_bi_approve.sql:4 |
| `busy` | table | 000600_modules.sql:47 |
| `clean_zone_checks` | table | 000800_clean_zones_notify.sql:16 |
| `clean_zones` | table | 000800_clean_zones_notify.sql:5 |
| `cleaning` | table | 000600_modules.sql:33 |
| `daily_results` | table | 000100_core.sql:40 |
| `extra_proposals` | table | 000100_core.sql:58 |
| `flyer_assign` | table | 000880_flyer.sql:38 |
| `flyer_campaigns` | table | 000880_flyer.sql:16 |
| `flyer_routes` | table | 000880_flyer.sql:4 |
| `flyer_tasks` | table | 000880_flyer.sql:26 |
| `fund_tx` | table | 000770_fund.sql:5 |
| `hot_bonuses` | table | 000740_star_suggest_hot.sql:91 |
| `item_adjustments` | table | 000820_cumulative.sql:19 |
| `item_measures` | table | 000820_cumulative.sql:7 |
| `items` | table | 000100_core.sql:26 |
| `job_folders` | table | 000940_jobs.sql:68 |
| `job_nudges` | table | 001010_recurring.sql:40 |
| `job_templates` | table | 001010_recurring.sql:22 |
| `job_types` | table | 000940_jobs.sql:22 |
| `jobs` | table | 000940_jobs.sql:35 |
| `locked_dates` | table | 000100_core.sql:86 |
| `media_reports` | table | 000840_report_todo_media.sql:7 |
| `monthly_targets` | table | 000700_scoring.sql:32 |
| `notify_log` | table | 000100_core.sql:114 |
| `pg_reports` | table | 000910_pg_reports.sql:13 |
| `private_settings` | table | 000100_core.sql:80 |
| `push_subs` | table | 000940_jobs.sql:86 |
| `rank_rewards` | table | 000870_rank_reward.sql:8 |
| `ratings` | table | 000700_scoring.sql:42 |
| `revenue_entries` | table | 000700_scoring.sql:18 |
| `roadshow` | table | 000600_modules.sql:59 |
| `score_log` | table | 000700_scoring.sql:70 |
| `settings` | table | 000100_core.sql:72 |
| `shifts` | table | 000940_jobs.sql:75 |
| `staff` | table | 000100_core.sql:13 |
| `staff_targets` | table | 000600_modules.sql:6 |
| `star_adjustments` | table | 000700_scoring.sql:7 |
| `store_contest` | table | 000100_core.sql:92 |
| `store_contest_snapshots` | table | 000100_core.sql:107 |
| `task_acks` | table | 000780_tasks.sql:25 |
| `tasks` | table | 000780_tasks.sql:6 |
| `tiktok_submissions` | table | 000600_modules.sql:17 |
| `violations` | table | 000700_scoring.sql:57 |
| `staff_stars` | view | 000700_scoring.sql:129 |

## 9. Mẫu yêu cầu sửa (nhanh và ít token nhất)
```
Sửa <mã>: <hiện tại đang thế nào> → <muốn thế nào>
Ví dụ: <số liệu/ảnh chụp nếu có>
```
- Mỗi lần gửi **1 nhóm việc liên quan**. Nhiều việc nhỏ cùng mục thì gom vào 1 tin, việc khác hẳn nhau thì mở **cuộc trò chuyện mới**: phiên ngắn đọc ít ngữ cảnh hơn nên rẻ và nhanh hơn.
- Ghi rõ mã (B3, C10…) để Claude mở đúng file, khỏi dò cả tool.
- Lỗi trên web: chụp màn hình + nói đang đăng nhập vai trò nào, trang nào.
- Đổi con số (trọng số, ngưỡng, giờ chốt…) thì tự vào **Quản lý → Cài đặt**, không cần sửa code.
