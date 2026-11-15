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
| H1 | **🏠 Tổng quan** (tab đầu của Quản lý): Việc cần làm ngay (chờ duyệt, chưa báo cáo, thiếu target, lần dán kết quả siêu thị, phục vụ tuần trước, Telegram) · Lịch quản lý ngày/tuần/tháng có tick · Tìm chức năng (gõ chữ → nút mở đúng chỗ) · Tuỳ chỉnh nhanh | Quản lý → 🏠 Tổng quan | `pages/admin-home.js` (FEATURES = danh mục chức năng, PLAN = lịch) |

| H2 | **Gợi ý tự hiện**: rê chuột lên một mục `HELP_DELAY_S` giây (mặc định 15) hoặc nhấn giữ 0,8 giây trên điện thoại → bong bóng giải thích; mỗi người bật/tắt ở nút tài khoản | Mọi trang | `js/help.js` (mảng H: selector → tiêu đề, nội dung) |

> Thêm chức năng mới thì thêm 1 dòng vào `FEATURES` trong `admin-home.js` (mã, tên, chỗ, từ khoá, đích mở) để ô tìm kiếm thấy được.

### A. Đăng nhập và tài khoản
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| A1 | Đăng nhập bằng mã NV / email, bắt đổi mật khẩu lần đầu | Màn hình đăng nhập | `js/app.js`, `js/store.js` (staffEmail) | `memberships`, `app_member` |
| A2 | Tạo / đặt lại mật khẩu tài khoản NV | Quản lý → Tài khoản NV | `pages/admin.js` (accounts) | Edge function `accounts` |
| A3 | Phân quyền quản lý theo bộ phận | Quản lý → Phân quyền | `pages/admin.js` (members) | `memberships`, RLS `is_manager`, `can_see_staff` |

### B. Báo cáo ngày và sao
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| B1 | Form báo cáo ngày: môn, target, chuỗi. **Môn để trống = 0** (không bắt buộc nhập) | Báo cáo | `pages/report.js` (itemsFilled, payload) | `report_form`, `_staff_items` |
| B2 | Danh sách môn của NV: **= môn thi đua tháng** nếu đã giao, chưa giao thì theo bộ phận / môn riêng | (tự động) | n/a | `_staff_items`, `_work_days` |
| B3 | Tính sao: về số/chưa về, x2, chuỗi, tăng ca, trừ sao lũy tiến, phạt nộp trễ | Báo cáo → Xem trước/Nộp | `pages/report.js` | `_compute_report`, `preview_daily_report`, `submit_daily_report`, `_item_streak`, `ITEM_RULES` |
| B4 | Ô doanh thu QĐ trong ca, **bắt buộc** (không bán ghi 0; ẩn được ở F4) | Báo cáo (cuối form) | `pages/report.js` (#xRev, needRev/revFilled) | `save_revenue`, `revenue_entries` |
| B4b | **Xuất ảnh báo cáo** (PNG) kiểu "BÁO CÁO CHỐT THI ĐUA CA NGÀY": target, thực đạt, %, sao ±, H.QUA (lần báo cáo trước), chuỗi, bù/tăng ca, kỷ luật, bán thêm, DT, tổng kết. Sau khi gửi + nút "🖼️ Ảnh báo cáo" | Báo cáo | `js/report-image.js` (reportPng, shareOrDownload), `pages/report.js` (imageBlob) | n/a |
| B4c | Giao diện điện thoại 6.1–6.9" (390–440px): ô nhập to, thanh tiến độ, thanh gửi dính đáy | Báo cáo | `css/app.css` (khối "Báo cáo: tối ưu điện thoại") | n/a |
| B12 | **Thưởng nóng** 2.000⭐: môn "Target thấp", NV bán trong ngày ≥ 30% target tháng siêu thị hoặc > 1000% target ngày → popup hoa chúc mừng, quản lý duyệt mới cộng (vào `star_adjustments`) | Báo cáo (sau khi gửi) / Quản lý → Duyệt | `pages/report.js` (celebrate), `pages/admin.js` (approve) | `check_hot_bonus`, `review_hot_bonus`, `hot_bonuses` |
| B5 | Bán thêm ngoài thi đua (đề xuất), duyệt | Báo cáo / Quản lý → Duyệt | `pages/report.js`, `pages/admin.js` (approve) | `extra_proposals`, `review_proposal` |
| B6 | Sửa / xoá báo cáo đã nộp, yêu cầu sửa và duyệt | Lịch sử / Quản lý → Duyệt | `pages/history.js`, `pages/admin.js` | `review_change`, `delete_report_day`, `delete_result` |
| B7 | Khoá sổ ngày | Quản lý → Khoá sổ | `pages/admin.js` (lock) | `locked_dates` |
| B8 | BXH sao (tổng sao) | BXH sao | `pages/ranking.js` | `leaderboard`, `staff_stars`, `staff_total` |
| B9 | Lịch sử báo cáo | Lịch sử | `pages/history.js` | `daily_results` |
| B10 | Thi đua siêu thị (chỉ tiêu chung) | Siêu thị | `pages/store.js` | `store_contest`, `save_store_contest` |

### C. Target tháng và xếp hạng điểm
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| C1 | **Dán báo cáo target tháng**: đọc văn bản "=== SIÊU THỊ …" | Quản lý → Điểm & DT → Target tháng | `js/lib-targets.js` (parseTargetReport), `pages/admin-score.js` (importPreview) | `import_month_targets` |
| C2 | Giao môn từng NV + số ngày làm việc + target DT | Target tháng → "Giao môn" / ô Target DT | `pages/admin-score.js` (targets) | `save_monthly_target`, `monthly_targets`, `_ensure_contest_items` |
| C3 | Target **báo cáo ngày** = `DAILY_TARGET_PCT` (200%) × target tháng ÷ số ngày làm việc, làm tròn lên 2 số lẻ, tối thiểu `DAILY_TARGET_MIN` (0,5). Xếp hạng thi đua (C10) vẫn theo target tháng | (tự động); chỉnh ở Cài đặt chung | `js/star-rules.js` (dailyTarget) | `_daily_target`, `_staff_items`, `_work_days` (`DAYS_OFF`) |
| C4 | Môn target ngày < 1 thì không trừ sao chuỗi | Tick khi dán target | `pages/admin-score.js` | `import_month_targets` → `ITEM_RULES` (noPen) |
| C5 | Doanh thu QĐ lũy kế + điều chỉnh có lịch sử | Điểm & DT → Doanh thu | `pages/admin-score.js` (revenue) | `adjust_revenue`, `delete_revenue_adjust` |
| C6 | Phục vụ (lượt 5★…1★, khiếu nại) | Điểm & DT → Phục vụ; NV tự nhập ở Của tôi | `pages/admin-score.js`, `pages/me.js` | `save_rating`, `delete_rating`, `ratings` |
| C7 | Vi phạm (−2 điểm/lỗi) | Điểm & DT → Vi phạm | `pages/admin-score.js` | `add_violation`, `delete_violation` |
| C8 | Cộng/trừ sao, reset sao, reset chuỗi | Điểm & DT → Sao & reset | `pages/admin-score.js` | `adjust_stars`, `reset_stars`, `reset_streaks`, `star_adjustments` |
| C9 | Lịch sử điều chỉnh (target, DT, sao, phục vụ, vi phạm) | Điểm & DT → Lịch sử | `pages/admin-score.js` (log) | `score_log` |
| C10 | **Bảng xếp hạng điểm** DT 40 · Thi đua 40 · Phục vụ 20 − vi phạm. NV thấy cả siêu thị (chỉ điểm; DT & chi tiết môn chỉ của mình, cài đặt `SCORE_SEE_ALL`). Bấm 1 dòng → chi tiết điểm đến từ đâu | Xếp hạng | `pages/score.js` (draw, detail) | `score_board` |
| C11 | Trang cá nhân: điểm, lũy kế môn, DT, lịch sử | Của tôi | `pages/me.js` | `score_board`, `monthly_targets`, `daily_results` |

### D. CV (công việc)
| Mã | Chức năng | Trên web | File giao diện | Hàm / bảng SQL |
|---|---|---|---|---|
| D1 | TikTok: nộp **trước** ngày hạn +`TIKTOK_REWARD` (100⭐, trạng thái SỚM) · **đúng ngày hạn** không thưởng không trừ · trễ bị trừ mỗi ngày như cũ. Link phải mới, không trùng link đã nộp của bất kỳ ai. Hiện giờ đăng video đọc từ mã video trong link (link rút gọn vt.tiktok.com không đọc được); lượt xem / bình luận không lấy tự động được | CV → TikTok | `pages/cv.js` (ttPosted) | `tiktok_submit`, `tiktok_manage`, `tiktok_submissions` |
| D2 | Vệ sinh: lịch + ảnh | CV → Vệ sinh | `pages/cv.js`, `js/photos.js` | `clean_*`, bucket `thidua-v2` |
| D3 | Lịch bận/OFF + kiểm tra HRM | CV → Lịch bận | `pages/cv.js`, `js/lib-hrm.js` | `busy_*` |
| D4 | Roadshow | CV → Roadshow | `pages/cv.js` | `rs_*` |
| D6 | **Quỹ thu chi** (thay tool quy cũ dùng Firebase): số dư, thu/chi tháng, thêm khoản (mọi thành viên), sửa/xoá (quản lý; người tạo trong 24 giờ), lọc tháng/loại/danh mục/người, thống kê, copy, CSV, nhật ký; danh mục & đối tác (chủ quản). Dữ liệu cũ chép 1 lần bằng GitHub Actions | CV → 💵 Quỹ | `pages/cv-fund.js` | `fund_tx`, `fund_save`, `fund_delete`, `fund_log`, settings `FUND_CATEGORIES`, `FUND_PARTNERS`; `supabase/scripts/import-quy.mjs` |
| D5 | Thống kê CV theo NV | CV → Thống kê | `pages/cv.js` | (đọc các bảng trên) |

### E. Telegram
| Mã | Chức năng | Trên web | File | Ghi chú |
|---|---|---|---|---|
| E1 | Bật/tắt + giờ gửi từng đầu mục (daily, weekly, revenue, score, tiktok, clean, busy, rs, service) | Quản lý → Telegram | `pages/admin.js` (telegram), `supabase/functions/notify/index.ts` | pg_cron `thidua-notify` gọi 5 phút/lần, chống gửi trùng bằng `notify_log` |
| E2 | Nội dung tin | n/a | `functions/notify/summary.ts`, `summary2.ts` | `current_streaks` |

### F. Quản lý / cài đặt
| Mã | Chức năng | Trên web | File | Hàm / bảng SQL |
|---|---|---|---|---|
| F1 | Nhân sự (thêm, ẩn, bộ phận, môn riêng) | Quản lý → Nhân sự | `pages/admin.js` (staff) | `staff`, `set_staff_total` |
| F2 | Môn & sao thưởng/phạt, **Nhân sao X2/X3** (chỉ môn đánh dấu) | Quản lý → Môn & sao | `pages/admin.js` (items) | `items.is_x2`, `items.is_x3`, `_compute_report` |
| F2c | **Gợi ý sao theo kết quả siêu thị**: dán báo cáo (Tổng / %Đạt) → nhóm 🎯 Tập trung 5đ · 🌱 Target thấp 3đ · ⚡ Gần về số (dự kiến 70–100%) 2đ · môn khác 1đ · ✅ Đã về số lũy kế 0 sao, không trừ; 1đ = +100/−50 (sửa được) → Áp dụng / Copy gửi nhóm | Quản lý → Môn & sao (khung đầu) | `pages/admin-suggest.js` | `apply_star_suggestions`, `items.focus/low_target/store_target/store_pct`, setting `STAR_POINTS` |
| F2b | **Thưởng & trừ sao**: ngưỡng X2/X3, ngày bắt đầu trừ, tăng ca, hệ số lũy tiến + bảng xem trước | Quản lý → Cài đặt (thẻ đầu tiên) | `js/star-rules.js` (dayOutcome, starCardHtml), `pages/admin.js` | settings `STREAK_*`, `PEN_*`, `DOUBLE_/TRIPLE_BONUS_RATE` |
| F3 | Target/sao riêng từng NV (chỉ còn tác dụng với sao khi NV đã được giao môn tháng) | Quản lý → Target NV | `pages/admin.js` (targets) | `staff_targets` |
| F4 | Ẩn trang/chức năng theo vai trò | Cài đặt → Ẩn trang | `pages/admin.js` (FEATURES), `js/store.js` (isHidden) | setting `HIDE` |
| F5 | Ngưỡng chuỗi/phạt, giờ chốt, trọng số điểm, quy tắc riêng từng môn, khoá AI | Quản lý → Cài đặt | `pages/admin.js` (settings) | `settings`, `private_settings` |
| F6 | Nhật ký thao tác | Quản lý → Nhật ký | `pages/admin.js` (audit) | `audit_log` |

### G. Khác
| Mã | Chức năng | Trên web | File |
|---|---|---|---|
| G1 | Trợ lý AI (Gemini) | Trợ lý | `pages/assistant.js`, `functions/assistant/index.ts` (cần `GEMINI_API_KEY` ở Cài đặt) |
| G2 | Trang luật | Rule | `pages/rules.js` |
| G3 | Giao diện chung, menu, tabbar mobile | n/a | `v2/index.html`, `v2/css/app.css`, `js/ui.js`, `js/app.js` |
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
`FUND_CATEGORIES FUND_PARTNERS FUND_IMPORTED_AT HELP_DELAY_S DAILY_TARGET_PCT DAILY_TARGET_MIN STAR_POINTS SCORE_SEE_ALL TRIPLE_BONUS_RATE STORE_NAME CUTOFF_TIME STREAK_OVERTIME STREAK_PENALTY_STAR PEN_T2_MIN PEN_T3_MIN PEN_T4_MIN PEN_M1..M4 LATE_STEP DOUBLE_BONUS_RATE AUTO_STREAK_ENABLED EMPLOYEE_SEE_LEADERBOARD ITEM_RULES HIDE W_REVENUE W_CONTEST W_SERVICE VIOLATION_POINTS VIOLATION_TYPES RATING_DEDUCT REVENUE_UNIT DAYS_OFF TIKTOK_* RS_MIN_KM RS_MIN_MIN BUSY_MAX_WEEKDAY NOTIFY_ENABLED NOTIFY_CHAT_IDS NOTIFY_ITEMS`
Khoá bí mật (bảng `private_settings`, không đọc được từ web): `TELEGRAM_BOT_TOKEN GEMINI_API_KEY CRON_SECRET`

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
| `_compute_report` | function | 000730_x3_scoreboard.sql:71 |
| `_daily_target` | function | 000750_daily_target_x2.sql:8 |
| `_ensure_contest_items` | function | 000720_report_items_from_contest.sql:59 |
| `_item_streak` | function | 000200_logic.sql:24 |
| `_manager_scope` | function | 000200_logic.sql:271 |
| `_member_for_staff` | function | 000600_modules.sql:125 |
| `_require_member` | function | 000200_logic.sql:189 |
| `_staff_items` | function | 000750_daily_target_x2.sql:15 |
| `_work_days` | function | 000720_report_items_from_contest.sql:9 |
| `add_violation` | function | 000700_scoring.sql:310 |
| `adjust_revenue` | function | 000700_scoring.sql:229 |
| `adjust_stars` | function | 000700_scoring.sql:157 |
| `app_member` | function | 000100_core.sql:139 |
| `apply_star_suggestions` | function | 000740_star_suggest_hot.sql:57 |
| `busy_delete` | function | 000600_modules.sql:262 |
| `busy_register` | function | 000600_modules.sql:246 |
| `can_see_staff` | function | 000100_core.sql:150 |
| `check_hot_bonus` | function | 000740_star_suggest_hot.sql:112 |
| `clean_delete` | function | 000600_modules.sql:232 |
| `clean_register` | function | 000600_modules.sql:206 |
| `clean_report` | function | 000600_modules.sql:218 |
| `current_streaks` | function | 000400_notify.sql:6 |
| `delete_rating` | function | 000700_scoring.sql:297 |
| `delete_report_day` | function | 000200_logic.sql:284 |
| `delete_result` | function | 000200_logic.sql:296 |
| `delete_revenue_adjust` | function | 000700_scoring.sql:241 |
| `delete_violation` | function | 000700_scoring.sql:321 |
| `fund_delete` | function | 000770_fund.sql:62 |
| `fund_log` | function | 000770_fund.sql:79 |
| `fund_save` | function | 000770_fund.sql:32 |
| `import_month_targets` | function | 000720_report_items_from_contest.sql:274 |
| `is_after_cutoff` | function | 000100_core.sql:175 |
| `is_manager` | function | 000100_core.sql:146 |
| `is_member` | function | 000100_core.sql:148 |
| `is_owner` | function | 000100_core.sql:144 |
| `leaderboard` | function | 000200_logic.sql:368 |
| `legacy_date` | function | 000300_migrate.sql:8 |
| `legacy_hm` | function | 000610_update_logic.sql:6 |
| `legacy_num` | function | 000300_migrate.sql:21 |
| `legacy_text` | function | 000300_migrate.sql:32 |
| `migrate_check` | function | 000610_update_logic.sql:441 |
| `migrate_legacy` | function | 000610_update_logic.sql:221 |
| `migrate_legacy_all` | function | 000700_scoring.sql:420 |
| `preview_daily_report` | function | 000200_logic.sql:198 |
| `private_setting_status` | function | 000630_private_keys.sql:12 |
| `report_form` | function | 000730_x3_scoreboard.sql:49 |
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
| `save_monthly_target` | function | 000720_report_items_from_contest.sql:75 |
| `save_rating` | function | 000700_scoring.sql:273 |
| `save_revenue` | function | 000700_scoring.sql:208 |
| `save_store_contest` | function | 000200_logic.sql:346 |
| `score_board` | function | 000730_x3_scoreboard.sql:224 |
| `set_private_setting` | function | 000630_private_keys.sql:2 |
| `set_staff_total` | function | 000700_scoring.sql:141 |
| `setting_num` | function | 000100_core.sql:160 |
| `setting_text` | function | 000100_core.sql:170 |
| `staff_total` | function | 000700_scoring.sql:120 |
| `submit_daily_report` | function | 000200_logic.sql:225 |
| `tiktok_due_dates` | function | 000600_modules.sql:136 |
| `tiktok_manage` | function | 000600_modules.sql:189 |
| `tiktok_submit` | function | 000760_tiktok_early.sql:10 |
| `vn_hm` | function | 000600_modules.sql:122 |
| `vn_now` | function | 000100_core.sql:7 |
| `vn_today` | function | 000100_core.sql:9 |
| `busy` | table | 000600_modules.sql:47 |
| `cleaning` | table | 000600_modules.sql:33 |
| `daily_results` | table | 000100_core.sql:40 |
| `extra_proposals` | table | 000100_core.sql:58 |
| `fund_tx` | table | 000770_fund.sql:5 |
| `hot_bonuses` | table | 000740_star_suggest_hot.sql:91 |
| `items` | table | 000100_core.sql:26 |
| `locked_dates` | table | 000100_core.sql:86 |
| `monthly_targets` | table | 000700_scoring.sql:32 |
| `notify_log` | table | 000100_core.sql:114 |
| `private_settings` | table | 000100_core.sql:80 |
| `ratings` | table | 000700_scoring.sql:42 |
| `revenue_entries` | table | 000700_scoring.sql:18 |
| `roadshow` | table | 000600_modules.sql:59 |
| `score_log` | table | 000700_scoring.sql:70 |
| `settings` | table | 000100_core.sql:72 |
| `staff` | table | 000100_core.sql:13 |
| `staff_targets` | table | 000600_modules.sql:6 |
| `star_adjustments` | table | 000700_scoring.sql:7 |
| `store_contest` | table | 000100_core.sql:92 |
| `store_contest_snapshots` | table | 000100_core.sql:107 |
| `tiktok_submissions` | table | 000600_modules.sql:17 |
| `violations` | table | 000700_scoring.sql:57 |
| `staff_stars` | view | 000700_scoring.sql:129 |

---

## 9. Mẫu yêu cầu sửa (nhanh và ít token nhất)
```
Sửa <mã>: <hiện tại đang thế nào> → <muốn thế nào>
Ví dụ: <số liệu/ảnh chụp nếu có>
```
- Mỗi lần gửi **1 nhóm việc liên quan**. Nhiều việc nhỏ cùng mục thì gom vào 1 tin, việc khác hẳn nhau thì mở **cuộc trò chuyện mới**: phiên ngắn đọc ít ngữ cảnh hơn nên rẻ và nhanh hơn.
- Ghi rõ mã (B3, C10…) để Claude mở đúng file, khỏi dò cả tool.
- Lỗi trên web: chụp màn hình + nói đang đăng nhập vai trò nào, trang nào.
- Đổi con số (trọng số, ngưỡng, giờ chốt…) thì tự vào **Quản lý → Cài đặt**, không cần sửa code.
