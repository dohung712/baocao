// Trang Rule: quy tắc vận hành, hiển thị theo cài đặt hiện tại
import { esc, fmt } from "../ui.js";
import { S, setting } from "../store.js";

export async function render(view) {
  const n = (k, d) => fmt(setting(k, d), 2);
  const late = Number(setting("LATE_STEP", 100));
  const items = [...S.items].filter((i) => i.active).sort((a, b) => a.sort - b.sort);
  const tiers = [
    [`Chuỗi &lt; ${n("PEN_T2_MIN", 4)}`, n("PEN_M1", 1)],
    [`${n("PEN_T2_MIN", 4)} ≤ chuỗi &lt; ${n("PEN_T3_MIN", 6)}`, n("PEN_M2", 1.5)],
    [`${n("PEN_T3_MIN", 6)} ≤ chuỗi &lt; ${n("PEN_T4_MIN", 8)}`, n("PEN_M3", 2)],
    [`Chuỗi ≥ ${n("PEN_T4_MIN", 8)}`, n("PEN_M4", 5)],
  ];
  view.innerHTML = `<div class="page-h"><div><h1>Quy tắc vận hành (Rule)</h1><p>Tự cập nhật theo cài đặt hiện tại của siêu thị</p></div></div>
  <div class="grid2 doc">
    <div class="card"><h2>1. Nộp báo cáo & kỷ luật trễ</h2>
      <ul><li>Báo cáo ca ngày nộp trước <b>${esc(setting("CUTOFF_TIME", "22:20"))}</b>. Nộp cho ngày đã qua cũng tính là trễ.</li>
      <li>Phạt lũy tiến theo số lần trễ trong tháng: lần 1 <b class="neg">−${fmt(late)}⭐</b>, lần 2 <b class="neg">−${fmt(late * 2)}⭐</b>, lần 3 <b class="neg">−${fmt(late * 3)}⭐</b>… lần N: −N × ${fmt(late)}⭐.</li>
      <li>Sửa báo cáo đã nộp sau giờ chốt, hoặc ngày đã <b>khoá sổ</b>: gửi yêu cầu sửa kèm lý do, quản lý duyệt mới cập nhật.</li></ul></div>
    <div class="card"><h2>2. Về số & thưởng sao</h2>
      <ul><li>Thực đạt ≥ target ngày → <b>Về số</b>, được sao thưởng của môn.</li>
      <li>Môn đánh dấu <b>X2</b> đạt ≥ <b>${n("DOUBLE_BONUS_RATE", 150)}%</b> target → nhân đôi sao thưởng.</li>
      <li>Target, sao thưởng, sao phạt khai báo ở <b>Quản lý → Môn thi đua</b>; riêng từng nhân viên ở <b>Quản lý → Target NV</b>.</li>
      <li>Bán thêm ngoài danh mục: đề xuất sao khi nộp báo cáo, quản lý duyệt mới cộng.</li></ul></div>
    <div class="card"><h2>3. Chuỗi chưa về số</h2>
      <ul><li>Đếm riêng từng nhân viên, từng môn: số ngày liên tiếp chưa về số (tính các ngày <b>trước</b> ngày đang báo cáo).</li>
      <li>Có 1 ngày về số → chuỗi về 0. Ngày không báo cáo (nghỉ/OFF): bỏ qua, chuỗi giữ nguyên.</li>
      <li>Chọn <b>Tăng ca</b>: không trừ sao, chuỗi giữ nguyên (không +1). Bị trừ sao: chuỗi vẫn +1. Quản lý có thể reset chuỗi.</li>
      <li>Chuỗi ≥ <b>${n("STREAK_PENALTY_STAR", 5)}</b> mới trừ sao (nếu quỹ sao còn đủ, không đủ thì chuyển tăng ca); chuỗi ≥ <b>${n("STREAK_OVERTIME", 3)}</b> mới được tăng ca; nhỏ hơn cả hai: chỉ ghi nhận chuỗi.</li></ul></div>
    <div class="card"><h2>4. Hệ số phạt lũy tiến</h2>
      <p>Số sao trừ = sao phạt của môn × hệ số theo chuỗi.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Bậc</th><th>Chuỗi</th><th class="num">Hệ số</th></tr></thead><tbody>${tiers.map((t, i) => `<tr><td>Bậc ${i + 1}</td><td>${t[0]}</td><td class="num"><b>×${t[1]}</b></td></tr>`).join("")}</tbody></table></div></div>
    <div class="card"><h2>5. Gợi ý sao từ thi đua siêu thị</h2>
      <ul><li>🔥 <b>Phá băng</b> (dự báo 0%): +500 / −300⭐</li><li>✅ <b>Về số cao</b> (&gt;150%): +100 / 0⭐</li>
      <li>🎯 <b>Sát nút</b> (70–100%): +300 / −200⭐</li><li>⚡ <b>Thiếu ít</b> (còn ≤ 5 đơn vị, dự báo ≥ 60%): +400 / −250⭐</li><li>Còn lại: +200 / −100⭐</li></ul></div>
    <div class="card"><h2>6. Công việc (CV)</h2>
      <ul><li><b>TikTok</b>: hạn Thứ 3 & Thứ 6, cần link TikTok + link Facebook cá nhân. Đúng hạn <b class="pos">+${n("TIKTOK_REWARD", 300)}⭐</b>; quá hạn chưa nộp trừ <b class="neg">−${n("TIKTOK_PENALTY", 300)}⭐/ngày</b> vào báo cáo cuối ngày.</li>
      <li><b>Vệ sinh</b>: mỗi ngày 1 người đăng ký, nộp đúng 3 ảnh.</li>
      <li><b>Lịch bận/OFF</b>: Thứ 2–6 tối đa ${n("BUSY_MAX_WEEKDAY", 3)} người/ngày; Thứ 7, CN không giới hạn.</li>
      <li><b>Roadshow</b>: khung sáng 6h–10h30, chiều 15h–18h; mỗi lượt ≥ ${n("RS_MIN_KM", 5)} km, ≥ ${n("RS_MIN_MIN", 30)} phút, 3–6 ảnh.</li>
      <li>Đã đăng ký thì nhân viên không tự xoá được, chỉ quản lý xoá.</li></ul></div>
  </div>
  <div class="card doc" style="margin-top:14px"><h2>Danh mục môn hiện tại</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Áp dụng</th><th>Môn</th><th class="num">Target/ngày</th><th class="num">Thưởng</th><th class="num">Phạt</th><th>X2</th></tr></thead><tbody>
    ${items.map((i) => `<tr><td>${esc(i.store)}</td><td>${esc(i.name)}</td><td class="num">${fmt(i.target, 2)}</td><td class="num pos">+${fmt(i.bonus_star)}</td><td class="num neg">−${fmt(i.penalty_star)}</td><td>${i.is_x2 ? "X2" : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Chưa có môn</td></tr>`}</tbody></table></div></div>`;
}
