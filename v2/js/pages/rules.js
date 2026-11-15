// Trang Rule: quy tắc vận hành, hiển thị theo cài đặt hiện tại
import { esc, fmt } from "../ui.js";
import { S, setting } from "../store.js";
import { readRules, ladderRows, multLabel, NO_OT } from "../star-rules.js";
import { starPoints } from "./admin-suggest.js";

export async function render(view) {
  const n = (k, d) => fmt(setting(k, d), 2);
  const late = Number(setting("LATE_STEP", 100));
  const items = [...S.items].filter((i) => i.active).sort((a, b) => a.sort - b.sort);
  const R = readRules(), SP = starPoints();
  view.innerHTML = `<div class="page-h"><div><h1>Quy tắc vận hành (Rule)</h1><p>Tự cập nhật theo cài đặt hiện tại của siêu thị</p></div></div>
  <div class="grid2 doc">
    <div class="card"><h2>1. Nộp báo cáo & kỷ luật trễ</h2>
      <ul><li>Báo cáo ca ngày nộp trước <b>${esc(setting("CUTOFF_TIME", "22:20"))}</b>. Nộp cho ngày đã qua cũng tính là trễ.</li>
      <li>Phạt lũy tiến theo số lần trễ trong tháng: lần 1 <b class="neg">−${fmt(late)}⭐</b>, lần 2 <b class="neg">−${fmt(late * 2)}⭐</b>, lần 3 <b class="neg">−${fmt(late * 3)}⭐</b>… lần N: −N × ${fmt(late)}⭐.</li>
      <li>Sửa báo cáo đã nộp sau giờ chốt, hoặc ngày đã <b>khoá sổ</b>: gửi yêu cầu sửa kèm lý do, quản lý duyệt mới cập nhật.</li></ul></div>
    <div class="card"><h2>2. Về số & thưởng sao</h2>
      <ul><li>Thực đạt ≥ target ngày → <b>Về số</b>, được sao thưởng của môn.</li>
      <li>Môn đánh dấu <b>X2</b> đạt ≥ <b>${n("DOUBLE_BONUS_RATE", 150)}%</b> target → sao thưởng ×2. Môn <b>X3</b>: ≥ ${n("DOUBLE_BONUS_RATE", 150)}% → ×2, ≥ <b>${n("TRIPLE_BONUS_RATE", 200)}%</b> → ×3.</li>
      <li>Target, sao thưởng, sao phạt khai báo ở <b>Quản lý → Môn thi đua</b>; riêng từng nhân viên ở <b>Quản lý → Target NV</b>.</li>
      <li>Bán thêm ngoài danh mục: đề xuất sao khi nộp báo cáo, quản lý duyệt mới cộng.</li></ul></div>
    <div class="card"><h2>3. Chuỗi chưa về số</h2>
      <ul><li>Đếm riêng từng nhân viên, từng môn: số ngày liên tiếp chưa về số (tính các ngày <b>trước</b> ngày đang báo cáo).</li>
      <li>Có 1 ngày về số → chuỗi về 0. Ngày không báo cáo (nghỉ/OFF): bỏ qua, chuỗi giữ nguyên.</li>
      <li>Chọn <b>Tăng ca</b>: không trừ sao, chuỗi giữ nguyên (không +1). Bị trừ sao: chuỗi vẫn +1. Quản lý có thể reset chuỗi.</li>
      <li>Bắt đầu trừ sao từ ngày chưa đạt thứ <b>${R.STREAK_PENALTY_STAR + 1}</b>${R.STREAK_OVERTIME >= NO_OT ? " (không dùng tăng ca)" : `; được tăng ca thay trừ sao từ ngày thứ <b>${R.STREAK_OVERTIME + 1}</b>`}. Không đủ sao để trừ → chuyển tăng ca.</li></ul></div>
    <div class="card"><h2>4. Chưa đạt liên tiếp → trừ sao</h2>
      <p>Ví dụ môn có sao phạt <b>100⭐</b> (số sao trừ = sao phạt × hệ số):</p>
      <div class="tbl-wrap"><table><thead><tr><th>Chưa đạt liên tiếp</th><th>Kết quả</th></tr></thead><tbody>${ladderRows(R, 100, 10)}</tbody></table></div></div>
    <div class="card"><h2>5. Sao theo kết quả siêu thị & thưởng nóng</h2>
      <p>Quản lý cập nhật sao từng môn theo kết quả siêu thị (1 điểm = +${fmt(SP.bonus)} / −${fmt(SP.penalty)}⭐):</p>
      <ul><li>🎯 Môn tập trung của tháng: <b>${fmt(SP.focus)} điểm</b> (+${fmt(SP.focus * SP.bonus)} / −${fmt(SP.focus * SP.penalty)}⭐)</li>
      <li>🌱 Môn target thấp chạy đầu tháng: <b>${fmt(SP.low)} điểm</b> (+${fmt(SP.low * SP.bonus)} / −${fmt(SP.low * SP.penalty)}⭐)</li>
      <li>⚡ Môn gần về số (dự kiến ${fmt(SP.near_min)}–100%): <b>${fmt(SP.near)} điểm</b> (+${fmt(SP.near * SP.bonus)} / −${fmt(SP.near * SP.penalty)}⭐)</li>
      <li>✅ Môn siêu thị đã về số lũy kế: <b>0 sao</b>, không trừ sao. Môn khác: ${fmt(SP.other)} điểm.</li>
      <li>🔥 <b>Thưởng nóng ${fmt(SP.hot_stars)}⭐</b>: môn target thấp, bán trong ngày ≥ ${fmt(SP.hot_store_pct)}% target tháng của siêu thị hoặc &gt; ${fmt(SP.hot_staff_pct)}% target ngày của bạn (quản lý duyệt).</li></ul>
      <p class="small muted">Sao hiện tại từng môn xem ở bảng “Danh mục môn hiện tại” bên dưới.</p></div>
    <div class="card"><h2>6. Công việc (CV)</h2>
      <ul><li><b>TikTok</b>: hạn Thứ 3 & Thứ 6, cần link TikTok + link Facebook cá nhân. Đúng hạn <b class="pos">+${n("TIKTOK_REWARD", 300)}⭐</b>; quá hạn chưa nộp trừ <b class="neg">−${n("TIKTOK_PENALTY", 300)}⭐/ngày</b> vào báo cáo cuối ngày.</li>
      <li><b>Vệ sinh</b>: mỗi ngày 1 người đăng ký, nộp đúng 3 ảnh.</li>
      <li><b>Lịch bận/OFF</b>: Thứ 2–6 tối đa ${n("BUSY_MAX_WEEKDAY", 3)} người/ngày; Thứ 7, CN không giới hạn.</li>
      <li><b>Roadshow</b>: khung sáng 6h–10h30, chiều 15h–18h; mỗi lượt ≥ ${n("RS_MIN_KM", 5)} km, ≥ ${n("RS_MIN_MIN", 30)} phút, 3–6 ảnh.</li>
      <li>Đã đăng ký thì nhân viên không tự xoá được, chỉ quản lý xoá.</li></ul></div>
  </div>
  <div class="card doc" style="margin-top:14px"><h2>Danh mục môn hiện tại</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Áp dụng</th><th>Môn</th><th class="num">Target/ngày</th><th class="num">Thưởng</th><th class="num">Phạt</th><th>Nhân sao</th></tr></thead><tbody>
    ${items.map((i) => `<tr><td>${esc(i.store)}</td><td>${esc(i.name)}</td><td class="num">${fmt(i.target, 2)}</td><td class="num pos">+${fmt(i.bonus_star)}</td><td class="num neg">−${fmt(i.penalty_star)}</td><td>${multLabel(i)}${i.focus ? " 🎯" : ""}${i.low_target ? " 🌱" : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Chưa có môn</td></tr>`}</tbody></table></div></div>`;
}
