// Gợi ý tự hiện: rê chuột lên một mục đủ lâu (mặc định 15 giây, cài đặt HELP_DELAY_S) hoặc nhấn giữ 0,8 giây trên điện thoại
// → hiện bong bóng giải thích mục đó. Mỗi người tự tắt/bật được (lưu trên máy).
import { esc, toast } from "./ui.js";
import { setting, isManager } from "./store.js";

// [selector, tiêu đề, nội dung, chỉ quản lý?] — selector khớp phần tử gần nhất (closest)
const H = [
  // Menu trang
  ['[data-page="report"]', "📝 Báo cáo", "Nhập thực đạt từng môn và doanh thu QĐ mỗi ngày trước giờ chốt. Gửi xong có thể lưu ảnh để gửi Zalo/Line."],
  ['[data-page="cv"]', "🗂️ CV", "TikTok (hạn Thứ 3, Thứ 6), đăng ký vệ sinh, lịch bận/OFF, roadshow và thống kê."],
  ['[data-page="score"]', "🏅 Xếp hạng điểm", "Doanh thu 40% · Thi đua 40% · Phục vụ 20%, trừ 2 điểm mỗi lỗi. Bấm vào tên để xem điểm đến từ đâu."],
  ['[data-page="me"]', "👤 Của tôi", "Toàn bộ số liệu của bạn: sao, điểm, doanh thu, môn thi đua, phục vụ, vi phạm, lịch sử điều chỉnh."],
  ['[data-page="ranking"]', "🏆 BXH sao", "Xếp hạng theo tổng sao (thưởng/phạt từ báo cáo ngày, TikTok, thưởng nóng…)."],
  ['[data-page="history"]', "🕒 Lịch sử", "Xem lại các báo cáo đã nộp theo ngày và theo nhân viên."],
  ['[data-page="rules"]', "📖 Rule", "Luật đang áp dụng: giờ chốt, thưởng/trừ sao, X2/X3, thưởng nóng, CV. Tự cập nhật theo cài đặt."],
  ['[data-page="admin"]', "⚙️ Quản lý", "Bắt đầu ở tab 🏠 Tổng quan: việc cần làm, lịch quản lý và ô tìm chức năng.", true],
  // Báo cáo
  ["#rDate", "Ngày làm việc", "Chọn ngày cần báo cáo. Nộp cho ngày đã qua sau giờ chốt sẽ tính là nộp trễ."],
  ["input.actual", "Thực đạt", "Nhập số bán được hôm nay của môn này. Đạt ≥ 100% target là Về số, được sao thưởng."],
  [".c-meta", "Target · Chuỗi", "Target báo cáo ngày = 200% × target tháng ÷ số ngày làm (tối thiểu 0,5). Chuỗi = số ngày liền chưa về số."],
  [".choice", "Dùng sao / Tăng ca", "Chưa về số nhiều ngày liền: chọn trừ sao hoặc đăng ký tăng ca thay thế."],
  ["#revCard", "💰 Doanh thu QĐ (bắt buộc)", "Nhập doanh thu quy đổi trong ca, không bán được ghi 0. Cộng dồn vào lũy kế tháng để tính điểm DT."],
  ["#btnSend", "🚀 Gửi báo cáo", "Gửi khi đã nhập đủ các môn và doanh thu. Sau giờ chốt, sửa báo cáo cần quản lý duyệt."],
  ["#btnImg", "🖼️ Ảnh báo cáo", "Tạo ảnh báo cáo của ngày này để lưu hoặc gửi qua Zalo/Line."],
  ["#missing", "Chưa báo cáo hôm nay", "Bấm tên để mở nhanh báo cáo của nhân viên đó (nộp hộ hoặc nhắc).", true],
  // Việc
  ['#cvTabs [data-t="tasks"]', "📋 Việc", "Việc quản lý triển khai và việc được giao cho bạn. Đọc kỹ rồi bấm “Đã đọc & nắm rõ” hoặc “Hoàn thành”."],
  ["[data-ack]", "Đã đọc & nắm rõ", "Bấm sau khi đọc hết nội dung. Quản lý xem được thời gian bạn xác nhận."],
  ["[data-done]", "Hoàn thành", "Báo đã làm xong việc được giao, có thể ghi chú thêm."],
  ["#remind", "🔔 Nhắc việc", "Nhắc theo lịch bạn đã đăng ký: trực vệ sinh hôm nay/ngày mai, khu vực vệ sinh chưa báo xong. Bấm Mở để làm, ✕ để ẩn trong ngày."],
  ["#asSub [data-s=rank]", "🏆 Thưởng hạng", "Xếp hạng điểm tháng RIÊNG từng bộ phận, top 5 nhận 4000/3500/3000/2500/2000⭐. Xem đề xuất, bấm Chốt để cộng sao (mỗi NV một lần/tháng).", true],
  [".cum-form", "📈 Cập nhật lũy kế", "Nhập lũy kế THÁNG đến hết hôm qua lấy từ báo cáo công ty. Xem nhãn từng môn: 🔢 Số lượng (số máy/hồ sơ) · 💰 DT quy đổi · 💵 DT thực. Ô trống = giữ nguyên.", true],
  ["#pgChips", "📦 Bán kèm", "Bấm món đã bán kèm (VAS, Bảo hiểm, PSDP, Tai nghe, Sim…) để hiện ô nhập số lượng và doanh thu của món đó. Bấm lại hoặc ✕ để bỏ."],
  [".pg-cum", "📦 Lũy kế tháng", "Tool tự cộng: số đầu kỳ (nếu có) + các ngày đã báo cáo + số đang nhập hôm nay."],
  ["#pgCopy", "📋 Copy tin", "Copy tin báo cáo PG (hôm nay, lũy kế, bán kèm) để dán vào nhóm Zalo."],
  [".hm-kpi", "📊 Tổng quan tháng", "Báo cáo hôm nay, doanh thu QĐ so target tháng (vạch đứng = mức cần đạt tính đến hôm nay), vi phạm, nhân viên âm sao, top 3 dẫn đầu và 3 người cần hỗ trợ.", true],
  [".staff-tbl", "👥 Nhân sự 360°", "Số ngày đã báo cáo tháng này, nộp trễ, vi phạm, quyền vào tool. Dòng đỏ = âm sao, ⚠️ = quá 1 ngày chưa báo cáo. Bấm tên để xem hồ sơ và mở nhanh trang cá nhân / báo cáo / biên bản.", true],
  [".nopen-btn", "🛡️ Môn không trừ sao", "Bấm để mở hoặc thu gọn các môn không bị trừ sao. Có bán thì mở ra nhập; bỏ trống vẫn tính là 0."],
  [".cal-old", "Các tuần trước", "Trên điện thoại lịch hiện dạng danh sách từ tuần này. Bấm để xem lại các ngày đã qua trong tháng."],
  ["#itView", "⚡ Chỉnh nhanh / 📋 Bảng chi tiết", "Chỉnh nhanh: sửa +/− sao và Bật/Tắt từng môn theo bộ phận, tự lưu. Bảng chi tiết: thêm/xoá môn, target, X2/X3, thứ tự.", true],
  [".qtbl", "⚡ Môn & sao theo bộ phận", "Mỗi cột 1 bộ phận: + sao thưởng, − sao phạt, công tắc Bật/Tắt (tắt = môn không hiện trong báo cáo bộ phận đó). Sửa là tự lưu. Sao phạt 0 = không trừ sao. ↺ = bỏ mức riêng, dùng lại mức Chung.", true],
  [".nopen-sep", "🛡️ Môn không trừ sao", "Các môn này chưa về số cũng không bị trừ sao (sao phạt 0 hoặc quy tắc riêng). Vẫn nhập thực đạt để được cộng sao khi về số."],
  ["#cvTabs [data-t=vio]", "📄 Biên bản", "Biên bản vi phạm kèm ảnh (lưu Google Drive). Mỗi biên bản = 1 lần vi phạm, trừ điểm xếp hạng. Nhân viên chỉ thấy số lần, thời gian và ảnh của mình."],
  ["#vbAdd", "+ Úp biên bản", "Chọn nhân viên, ngày giờ, loại lỗi, chụp hoặc chọn ảnh biên bản rồi Lưu. Ảnh tự tải lên Drive.", true],
  ["#mediaCard", "📣 Báo cáo truyền thông", "Chọn số lần truyền thông và số lần báo cáo Line truyền thông trong ngày (0, 1, 2, 3 hoặc gõ số khác). Có trong ảnh báo cáo."],
  ["#todoCard", "📌 Việc cần làm", "Việc còn thiếu và lịch sắp tới của bạn: TikTok, vệ sinh, roadshow, CV, thứ 2 cập nhật số + phục vụ, đăng ký bận trước 22h T6… Bấm vào để mở đúng chỗ."],
  [".zones-card", "🧽 Khu vực vệ sinh", "Khu vực, người phụ trách và tiêu chí của từng bộ phận. Khu vực của bạn có viền xanh: làm xong bấm ✅ Xong hôm nay. Quản lý bấm ✏️ để sửa, + Thêm để thêm."],
  [".tg-sched", "🗓️ Lịch gửi Telegram", "Mỗi đầu mục: tick Gửi, chọn Hằng ngày / Hằng tuần / Chọn thứ, đặt giờ rồi bấm 💾 Lưu lịch gửi. Quản lý chỉnh được.", true],
  ["#tkKind", "Loại việc", "Triển khai toàn NV (đọc & nắm rõ) · Giao việc NV (hoàn thành + ghi chú) · Việc QL có deadline · Link trang tính.", true],
  ["#tkAi", "✨ AI tóm tắt", "AI đọc nội dung dán vào + ảnh/PDF, đề xuất tiêu đề, ý chính, hạn chót. Sửa lại trước khi đăng.", true],
  ["#tkRemind", "Nhắc lại", "Sang tuần / tháng / 2 tháng mới, việc tự hiện lại để nhân viên xác nhận đọc lại.", true],
  ["#tkKeep", "📌 Lâu dài", "Quy định / quy trình áp dụng lâu dài: luôn hiện với nhân viên, không tự ẩn.", true],
  ["#tkHide", "Tự ẩn sau ngày", "Việc thời vụ tự ẩn với nhân viên sau ngày này (mặc định hạn chót + 3 ngày). Quản lý vẫn tìm lại được.", true],
  ["#tkWarn", "Cảnh báo lặp lại", "Tool/AI thấy việc có vẻ cần nhắc định kỳ hoặc là việc lâu dài — bấm nút để chọn đúng.", true],
  ["#tkQ", "Tìm việc", "Tìm trong mọi việc, kể cả việc đã tự ẩn và đã lưu trữ.", true],
  [".tk-prog", "Tiến độ", "Bấm để xem ai đã đọc / hoàn thành và lúc nào; nút “Copy lời nhắc” để nhắc người chưa làm.", true],
  // Quỹ
  ['#cvTabs [data-t="fund"]', "💵 Quỹ", "Thu chi của siêu thị: số dư, thêm khoản, lịch sử, thống kê theo danh mục và người."],
  [".fund-kpi", "Số dư quỹ", "Số dư = tổng thu − tổng chi từ trước tới nay. Hai ô bên cạnh là thu, chi của tháng đang xem."],
  ["#fForm", "Thêm khoản thu / chi", "Chọn Thu hoặc Chi, nhập tên, số tiền, ngày, danh mục, người. Người nhập được sửa/xoá trong 24 giờ, sau đó chỉ quản lý."],
  // Xếp hạng
  ["#scFull", "So tiến độ / So target cả tháng", "Tiến độ: target chia theo số ngày đã qua (giữa tháng). Cả tháng: so với target của cả tháng (chốt cuối tháng)."],
  [".sc-row, tr[data-sid]", "Chi tiết điểm", "Bấm để xem điểm doanh thu, thi đua, phục vụ, vi phạm đến từ đâu."],
  // Quản lý: tab
  ['#aTabs [data-t="home"]', "🏠 Tổng quan", "Việc cần làm ngay, lịch quản lý ngày/tuần/tháng và ô tìm chức năng.", true],
  ['#aTabs [data-t="approve"]', "Duyệt", "Thưởng nóng, bán thêm ngoài thi đua, yêu cầu sửa báo cáo sau giờ chốt.", true],
  ['#aTabs [data-t="score"]', "Điểm & DT", "Target tháng, doanh thu lũy kế, phục vụ, vi phạm, cộng/trừ/reset sao, lịch sử điều chỉnh.", true],
  ['#aTabs [data-t="lock"]', "Khoá sổ", "Khoá ngày đã chốt để nhân viên không sửa được nữa.", true],
  ['#aTabs [data-t="staff"]', "Nhân sự", "Thêm, ẩn nhân viên, đổi bộ phận. Nghỉ việc thì dùng Ẩn (xoá sẽ mất lịch sử).", true],
  ['#aTabs [data-t="items"]', "Môn & sao", "Dán kết quả siêu thị để tool gợi ý sao; danh mục môn, sao thưởng/phạt, X2/X3.", true],
  ['#aTabs [data-t="targets"]', "Target NV", "Sao thưởng/phạt riêng cho từng nhân viên (target ngày đã theo môn thi đua tháng).", true],
  ['#aTabs [data-t="accounts"]', "Tài khoản NV", "Cấp tài khoản đăng nhập bằng mã NV, đặt lại mật khẩu.", true],
  ['#aTabs [data-t="settings"]', "Cài đặt", "Luật thưởng/trừ sao, target báo cáo ngày, trọng số điểm, giờ chốt, ẩn trang, khoá AI.", true],
  ['#aTabs [data-t="telegram"]', "Telegram", "Bật/tắt và giờ gửi từng loại tóm tắt về nhóm Telegram.", true],
  ['#aTabs [data-t="members"]', "Phân quyền", "Thêm email quản lý, giới hạn bộ phận, bấm 🔑 Đặt mật khẩu để quản lý vào ngay bằng email + mật khẩu.", true],
  ["[data-pw]", "🔑 Đặt mật khẩu", "Đặt mật khẩu cho tài khoản email này; gửi cho người đó để đăng nhập bằng email + mật khẩu. Có thể bắt đổi ở lần đầu.", true],
  ['#aTabs [data-t="audit"]', "Nhật ký", "Ai đã làm gì, lúc nào.", true],
  ['#asSub [data-s="targets"]', "🎯 Target tháng", "Đầu tháng dán báo cáo target; hoặc bấm Giao môn từng người. Ghi số ngày làm việc để chia target ngày.", true],
  ['#asSub [data-s="revenue"]', "💰 Doanh thu", "Lũy kế DT QĐ từng người; điều chỉnh có ghi lý do và lịch sử.", true],
  ['#asSub [data-s="service"]', "🤝 Phục vụ", "Nhập lượt đánh giá 5★…1★ và khiếu nại theo tuần (Thứ 2) hoặc cuối tháng.", true],
  ['#asSub [data-s="violations"]', "⚠️ Vi phạm", "Ghi lỗi, mỗi lỗi trừ 2 điểm trên tổng điểm xếp hạng.", true],
  ['#asSub [data-s="stars"]', "⭐ Sao & reset", "Cộng/trừ sao hàng loạt, reset sao về mốc, reset chuỗi.", true],
  ['#asSub [data-s="log"]', "🧾 Lịch sử", "Mọi thay đổi target, doanh thu, sao, phục vụ, vi phạm.", true],
  // Quản lý: khung
  ["#imp", "📥 Dán báo cáo target tháng", "Dán nguyên báo cáo “TỔNG HỢP…”, chọn tháng, số ngày làm, bộ phận rồi Áp dụng.", true],
  ["#sgBox", "📊 Gợi ý sao theo kết quả siêu thị", "Dán kết quả hiện tại → tick Tập trung / Target thấp → tool gợi ý thưởng/phạt từng môn → Áp dụng hoặc Copy gửi nhóm.", true],
  [".sgF", "Tập trung", "Môn tập trung của tháng: 5 điểm (+500/−250 sao). Tick được lưu cả tháng.", true],
  [".sgL", "Target thấp", "Môn target thấp chạy đầu tháng: 3 điểm, và được xét thưởng nóng khi bán vượt.", true],
  ["#starCard", "⭐ Thưởng & trừ sao", "Chỉnh ngưỡng X2/X3, ngày bắt đầu trừ sao, tăng ca, hệ số. Bảng xem trước cho thấy ngày 1–10 bị gì.", true],
  ["#hideCard", "🙈 Ẩn trang / chức năng", "Tick để ẩn trang hoặc chức năng với nhân viên / quản lý.", true],
  ["#genCard", "⚙️ Cài đặt chung", "Tên siêu thị, giờ chốt, target báo cáo ngày (%), trọng số điểm, phạt trễ, TikTok, roadshow, thời gian hiện gợi ý.", true],
  [".hm-card", "Việc cần làm", "Ô màu cam là việc chưa xong — bấm nút trong ô để mở đúng chỗ.", true],
  [".hm-plan", "Lịch quản lý", "Tick khi làm xong; tự làm mới mỗi ngày / tuần / tháng. Nút → mở thẳng chỗ làm.", true],
  ["#hmQ", "Tìm chức năng", "Gõ việc cần làm (VD: trừ sao, mật khẩu, phục vụ) rồi bấm kết quả để mở.", true],
  // Chung
  ["#live", "Trực tuyến", "Xanh = dữ liệu tự đồng bộ thời gian thực. Đỏ = mất kết nối, kiểm tra mạng."],
  ["#btnMe", "Tài khoản", "Đổi mật khẩu, bật/tắt gợi ý tự hiện, đăng xuất."],
];

const LS = "thidua-v2-help-off";
export const helpOn = () => { try { return localStorage.getItem(LS) !== "1"; } catch { return true; } };
export const setHelp = (on) => { try { on ? localStorage.removeItem(LS) : localStorage.setItem(LS, "1"); } catch { /* bỏ qua */ } };
const delayMs = () => Math.max(1, Number(setting("HELP_DELAY_S", 15)) || 15) * 1000;

const hoverNone = matchMedia("(hover: none)");
let hideTimer = null, bubble = null, timer = null, curEl = null, shownFor = null, pressTimer = null, suppressClick = false;
function match(target) {
  if (!(target instanceof Element)) return null;
  for (const [sel, t, d, mgr] of H) { if (mgr && !isManager()) continue; const el = target.closest(sel); if (el && el.offsetParent !== null) return { el, t, d }; }
  return null;
}
function hide() { bubble?.remove(); bubble = null; }
function show(m) {
  hide(); shownFor = m.el;
  bubble = document.createElement("div"); bubble.className = "help-bubble"; bubble.setAttribute("role", "tooltip");
  bubble.innerHTML = `<b>💡 ${esc(m.t)}</b><p>${esc(m.d)}</p><div class="help-act"><button type="button" data-h="ok">Đã hiểu</button><button type="button" data-h="off">Tắt gợi ý</button></div>`;
  document.body.appendChild(bubble);
  const r = m.el.getBoundingClientRect(), bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  let top = r.bottom + 8, left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), innerWidth - bw - 8);
  if (top + bh > innerHeight - 8) top = Math.max(8, r.top - bh - 8);
  bubble.style.top = top + "px"; bubble.style.left = left + "px";
  bubble.onclick = (e) => { const b = e.target.closest("[data-h]"); if (!b) return; if (b.dataset.h === "off") { setHelp(false); toast("Đã tắt gợi ý — bật lại ở nút tài khoản góc trên"); } hide(); };
}
export function initHelp() {
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest?.(".help-bubble")) { clearTimeout(hideTimer); return; }
    if (!helpOn() || hoverNone.matches) return;
    const m = match(e.target);
    if (m?.el === curEl) { if (m && m.el === shownFor) clearTimeout(hideTimer); return; }
    clearTimeout(timer); curEl = m?.el || null;
    clearTimeout(hideTimer);
    if (bubble && shownFor !== curEl) hideTimer = setTimeout(hide, 600); // cho kịp rê vào bong bóng
    if (!m || m.el === shownFor) return;
    timer = setTimeout(() => { if (curEl === m.el && document.contains(m.el)) show(m); }, delayMs());
  });
  document.addEventListener("mousedown", (e) => { if (!e.target.closest?.(".help-bubble")) { clearTimeout(timer); hide(); } }, true);
  document.addEventListener("keydown", () => { clearTimeout(timer); hide(); }, true);
  // Điện thoại: nhấn giữ 0,8 giây (không áp dụng trong ô nhập)
  document.addEventListener("touchstart", (e) => {
    if (!e.target.closest?.(".help-bubble")) hide();
    if (!helpOn() || e.target.closest?.("input,textarea,select")) return;
    const m = match(e.target); if (!m) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { suppressClick = true; show(m); navigator.vibrate?.(15); }, 800);
  }, { passive: true });
  const cancel = () => clearTimeout(pressTimer);
  document.addEventListener("touchmove", cancel, { passive: true });
  document.addEventListener("touchend", cancel, { passive: true });
  document.addEventListener("click", (e) => { if (suppressClick) { suppressClick = false; if (!e.target.closest?.(".help-bubble")) { e.preventDefault(); e.stopPropagation(); } } }, true);
  document.addEventListener("contextmenu", (e) => { if (bubble && !e.target.closest?.("input,textarea")) e.preventDefault(); });
  addEventListener("scroll", () => { if (bubble && !hoverNone.matches) hide(); }, { passive: true });
}
