// Quản lý → 🏠 Tổng quan: việc cần làm ngay, lịch quản lý (ngày / tuần / tháng), tìm chức năng, tuỳ chỉnh nhanh
import { $, esc, fmt, vnToday, addDays, weekStart, dmy, dm } from "../ui.js";
import { sb, S, rpc, isOwner, visibleStaff, setting } from "../store.js";

// go: { tab, sub, focus } = tab trong Quản lý · { page } = trang khác
export const FEATURES = [
  { c: "B1", t: "Xem / nhắc ai chưa báo cáo hôm nay", w: "Báo cáo (dải “Chưa báo cáo”)", k: "báo cáo nhắc chưa nộp", go: { page: "report" } },
  { c: "B3", t: "Nộp hộ / sửa báo cáo cho nhân viên", w: "Báo cáo → chọn nhân viên", k: "nộp hộ sửa báo cáo", go: { page: "report" } },
  { c: "B5", t: "Duyệt thưởng nóng, bán thêm, yêu cầu sửa", w: "Quản lý → Duyệt", k: "duyệt thưởng nóng bán thêm sửa", go: { tab: "approve" } },
  { c: "B7", t: "Khoá sổ ngày (không cho sửa)", w: "Quản lý → Khoá sổ", k: "khoá sổ chốt", go: { tab: "lock" } },
  { c: "B9", t: "Xem lịch sử báo cáo", w: "Lịch sử", k: "lịch sử báo cáo", go: { page: "history" } },
  { c: "C1", t: "Dán báo cáo target tháng (đầu tháng)", w: "Điểm & DT → Target tháng", k: "target tháng dán đầu tháng", go: { tab: "score", sub: "targets" }, owner: true },
  { c: "C2", t: "Giao môn / sửa target từng nhân viên", w: "Điểm & DT → Target tháng → Giao môn", k: "giao môn target nhân viên số ngày làm", go: { tab: "score", sub: "targets" } },
  { c: "C5", t: "Doanh thu QĐ lũy kế, điều chỉnh", w: "Điểm & DT → Doanh thu", k: "doanh thu dt lũy kế điều chỉnh", go: { tab: "score", sub: "revenue" } },
  { c: "C6", t: "Nhập đánh giá phục vụ (5★…1★, khiếu nại)", w: "Điểm & DT → Phục vụ", k: "phục vụ đánh giá sao khách khiếu nại", go: { tab: "score", sub: "service" } },
  { c: "C7", t: "Ghi lỗi vi phạm (−2 điểm/lỗi)", w: "Điểm & DT → Vi phạm", k: "vi phạm lỗi trừ điểm", go: { tab: "score", sub: "violations" } },
  { c: "C8", t: "Cộng / trừ sao, reset sao, reset chuỗi", w: "Điểm & DT → Sao & reset", k: "cộng sao trừ sao reset chuỗi thưởng", go: { tab: "score", sub: "stars" } },
  { c: "C9", t: "Lịch sử điều chỉnh", w: "Điểm & DT → Lịch sử", k: "lịch sử điều chỉnh log", go: { tab: "score", sub: "log" } },
  { c: "C10", t: "Bảng xếp hạng điểm (copy gửi nhóm)", w: "Xếp hạng", k: "xếp hạng điểm bxh copy", go: { page: "score" } },
  { c: "C11", t: "Xem số liệu của 1 nhân viên", w: "Của tôi → chọn nhân viên", k: "cá nhân nhân viên chi tiết", go: { page: "me" } },
  { c: "F2c", t: "Dán kết quả siêu thị → gợi ý sao từng môn", w: "Môn & sao → khung Gợi ý", k: "gợi ý sao kết quả siêu thị tập trung target thấp gần về số push", go: { tab: "items", focus: "#sgBox" }, owner: true },
  { c: "E3", t: "Báo cáo quỹ thu chi qua Telegram (lịch tự động / chọn khoảng ngày)", w: "Quản lý → Telegram (đầu mục Quỹ) · CV → 💵 Quỹ → 📤 Báo cáo Telegram", k: "quỹ thu chi telegram báo cáo tuần số dư chi tiêu", go: { page: "cv", cv: "fund" } },
  { c: "B15", t: "Báo cáo PG: số lượng, doanh thu, bán kèm, lũy kế (PG không tính sao)", w: "Báo cáo → chọn NV PG · Tổng quan → 📦 PG tháng · Cài đặt → món bán kèm PG", k: "pg báo cáo số lượng doanh thu bán kèm vas bảo hiểm psdp tai nghe sim lũy kế", go: { page: "report" } },
  { c: "H1b", t: "Tổng quan tháng: báo cáo hôm nay, DT so target từng bộ phận, vi phạm, âm sao, dẫn đầu / cần hỗ trợ", w: "Quản lý → 🏠 Tổng quan (khung đầu)", k: "tổng quan kpi doanh thu tiến độ bộ phận dẫn đầu cần hỗ trợ âm sao dashboard", go: { tab: "home", focus: ".hm-kpi" } },
  { c: "F1b", t: "Hồ sơ 360° nhân viên: báo cáo, nộp trễ, vi phạm, tài khoản, lịch OFF", w: "Quản lý → Nhân sự → bấm tên", k: "hồ sơ nhân viên 360 nhân sự báo cáo nộp trễ vi phạm tài khoản âm sao", go: { tab: "staff" } },
  { c: "F2q", t: "Chỉnh nhanh +/− sao, Bật/Tắt môn từng bộ phận", w: "Quản lý → Môn & sao → ⚡ Chỉnh nhanh", k: "chỉnh nhanh sao thưởng phạt bật tắt môn bộ phận không trừ sao", go: { tab: "items" } },
  { c: "F2", t: "Danh mục môn, target, X2/X3 (thêm/xoá môn)", w: "Quản lý → Môn & sao → 📋 Bảng chi tiết", k: "môn sao thưởng phạt x2 x3 thêm xoá target", go: { tab: "items" }, owner: true },
  { c: "F2b", t: "Luật trừ sao (ngày bắt đầu trừ, tăng ca, hệ số)", w: "Cài đặt → Thưởng & trừ sao", k: "trừ sao chuỗi tăng ca hệ số lũy tiến", go: { tab: "settings", focus: "#starCard" }, owner: true },
  { c: "C3", t: "Target báo cáo ngày (200%, tối thiểu 0,5)", w: "Cài đặt → Cài đặt chung", k: "target ngày 200% tối thiểu", go: { tab: "settings", focus: "#genCard" }, owner: true },
  { c: "F4", t: "Ẩn trang / chức năng với nhân viên", w: "Cài đặt → Ẩn trang", k: "ẩn trang chức năng nhân viên", go: { tab: "settings", focus: "#hideCard" }, owner: true },
  { c: "F5", t: "Trọng số điểm, giờ chốt, phạt trễ, TikTok…", w: "Cài đặt → Cài đặt chung", k: "trọng số giờ chốt trễ tiktok roadshow", go: { tab: "settings", focus: "#genCard" }, owner: true },
  { c: "F1", t: "Thêm / ẩn nhân viên, đổi bộ phận", w: "Quản lý → Nhân sự", k: "nhân viên thêm ẩn bộ phận", go: { tab: "staff" } },
  { c: "A2", t: "Cấp / đặt lại mật khẩu nhân viên", w: "Quản lý → Tài khoản NV", k: "mật khẩu tài khoản đăng nhập", go: { tab: "accounts" }, owner: true },
  { c: "A3", t: "Phân quyền quản lý, đặt mật khẩu cho quản lý", w: "Quản lý → Phân quyền", k: "phân quyền quản lý email mật khẩu trưởng ca", go: { tab: "members" }, owner: true },
  { c: "E1", t: "Telegram: bật/tắt, giờ + ngày gửi từng mục (hằng ngày / tuần / chọn thứ)", w: "Quản lý → Telegram", k: "telegram tin nhắn tóm tắt lịch gửi giờ gửi thứ", go: { tab: "telegram" } },
  { c: "D1", t: "TikTok, vệ sinh, lịch bận, roadshow", w: "CV", k: "tiktok vệ sinh lịch bận roadshow cv", go: { page: "cv" } },
  { c: "D7", t: "Đăng việc triển khai / giao việc cho NV (AI tóm tắt, ảnh/PDF)", w: "CV → 📋 Việc → Đăng việc", k: "việc giao việc triển khai thông báo nhắc nhở ai tóm tắt pdf ảnh", go: { page: "cv", cv: "tasks" } },
  { c: "D10", t: "Úp biên bản vi phạm (ảnh lưu Drive), xem số lần vi phạm", w: "CV → 📄 Biên bản", k: "biên bản vi phạm lỗi ảnh drive số lần kỷ luật", go: { page: "cv", cv: "vio" } },
  { c: "D7b", t: "Xem ai đã đọc / hoàn thành việc", w: "CV → 📋 Việc → Triển khai & giao việc", k: "ai đã đọc nắm rõ hoàn thành kiểm tra", go: { page: "cv", cv: "tasks" } },
  { c: "D7c", t: "Link trang tính quản lý / việc QL có deadline", w: "CV → 📋 Việc", k: "link trang tính sheet deadline việc quản lý trưởng ca", go: { page: "cv", cv: "tasks" } },
  { c: "D8", t: "Khu vực vệ sinh: người phụ trách + tiêu chí, NV báo xong", w: "CV → 🧹 Vệ sinh → Khu vực vệ sinh", k: "khu vực vệ sinh tiêu chí phụ trách tủ phone đồng hồ kho", go: { page: "cv", cv: "clean" } },
  { c: "D9", t: "Nhắc NV theo lịch đăng ký vệ sinh (trên tool + Telegram sáng)", w: "Tự động · giờ Telegram ở Quản lý → Telegram", k: "nhắc việc nhắc vệ sinh lịch đăng ký trực", go: { tab: "telegram" } },
  { c: "C12", t: "Cập nhật lũy kế tuần (thứ 2 / mở khoá), loại tính từng môn", w: "Quản lý → Điểm & DT → 📈 Lũy kế tuần", k: "lũy kế cập nhật thứ 2 mở khoá số lượng doanh thu thực quy đổi loại môn", go: { tab: "score", sub: "cum" } },
  { c: "D11", t: "Phát tờ rơi: nhập số tờ → tự chia tuyến, ngày, nhân sự (NV + PG); NV nộp ảnh album; Telegram báo đúng giờ hạn", w: "CV → 📄 Tờ rơi", k: "tờ rơi phát tuyến đường chợ bản đồ đợt phát album room", go: { page: "cv", cv: "flyer" } },
  { c: "C13", t: "Thưởng sao theo hạng tháng, xếp riêng TGDĐ / Topzone (4000-3500-3000-2500-2000)", w: "Quản lý → Điểm & DT → 🏆 Thưởng hạng", k: "thưởng hạng top 5 xếp hạng tháng sao 4000 3500 3000 2500 2000 chốt", go: { tab: "score", sub: "rank" } },
  { c: "B14", t: "Việc cần làm trong báo cáo cuối ngày (TikTok, vệ sinh, roadshow, CV, thứ 2, bận T6…)", w: "Báo cáo (tự động)", k: "việc cần làm nhắc nhân viên báo cáo cuối ngày tiktok vệ sinh roadshow", go: { page: "report" } },
  { c: "B13", t: "Báo cáo truyền thông ngày (tổng tháng từng NV)", w: "Quản lý → Điểm & DT → 📣 Truyền thông", k: "truyền thông line báo cáo truyền thông", go: { tab: "score", sub: "media" } },
  { c: "D3b", t: "Khoá đăng ký bận/OFF sau 22h thứ 6", w: "CV → Lịch bận · Cài đặt BUSY_DEADLINE_HM", k: "đăng ký bận off hạn 22h thứ 6 khoá", go: { page: "cv", cv: "busy" } },
  { c: "D6", t: "Quỹ thu chi (thêm, sửa, xoá, thống kê, CSV)", w: "CV → 💵 Quỹ", k: "quỹ thu chi tiền số dư chi phí", go: { page: "cv", cv: "fund" } },
  { c: "F6", t: "Nhật ký thao tác", w: "Quản lý → Nhật ký", k: "nhật ký audit", go: { tab: "audit" }, owner: true },
  { c: "G2", t: "Luật đang áp dụng (cho nhân viên xem)", w: "Rule", k: "rule luật quy tắc", go: { page: "rules" } },
];

const PLAN = [
  { id: "day", icon: "☀️", t: "Hằng ngày", steps: [
    ["Sáng: dán kết quả siêu thị → áp dụng sao để đẩy môn yếu", "F2c"],
    ["Duyệt thưởng nóng / bán thêm / yêu cầu sửa", "B5"],
    ["Xem NV đã đọc việc triển khai, việc QL sắp tới hạn", "D7b"],
    ["Sau giờ chốt: nhắc người chưa báo cáo", "B1"]] },
  { id: "week", icon: "📅", t: "Thứ 2 hằng tuần", steps: [
    ["Nhắc / kiểm tra NV cập nhật lũy kế DT + môn (đúng loại)", "C12"], ["Nhập phục vụ tuần trước", "C6"], ["Ghi vi phạm (nếu có)", "C7"], ["Copy bảng xếp hạng tuần gửi nhóm", "C10"], ["Cuối tháng: xem & chốt thưởng hạng (top 5 mỗi bộ phận)", "C13"]] },
  { id: "mstart", icon: "🚀", t: "Đầu tháng", steps: [
    ["Dán báo cáo target tháng (DT + môn thi đua)", "C1"], ["Tick môn Tập trung / Target thấp, áp dụng sao", "F2c"],
    ["Kiểm tra số ngày làm, giao môn riêng nếu cần", "C2"], ["Reset sao / chuỗi (nếu áp dụng kỳ mới)", "C8"]] },
  { id: "mend", icon: "🏁", t: "Cuối tháng", steps: [
    ["Kiểm tra / điều chỉnh doanh thu lũy kế", "C5"], ["Nhập phục vụ cả tháng", "C6"],
    ["Chốt bảng xếp hạng tháng (So target cả tháng → Copy)", "C10"], ["Khoá sổ các ngày đã chốt", "B7"]] },
];
const periodKey = (id) => { const t = vnToday(); return id === "day" ? t : id === "week" ? weekStart(t) : t.slice(0, 7) + id; };
const LS = "thidua-v2-plan";
const readTicks = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };
const saveTicks = (o) => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* bỏ qua */ } };
const feat = (c) => FEATURES.find((f) => f.c === c);
const allowed = (f) => f && (!f.owner || isOwner());

// 📊 Tổng quan tháng (H1b): hàng chỉ số + doanh thu từng bộ phận so target (vạch = tiến độ chuẩn hôm nay) + dẫn đầu / cần hỗ trợ.
// Số liệu lấy từ score_board (đã lọc phạm vi xem ở máy chủ: quản lý chỉ thấy doanh thu bộ phận mình).
function kpiHtml(t, staff, done, board, pgRows = []) {
  const vis = new Set(staff.map((s) => s.id)), rows = board.filter((r) => vis.has(r.staff_id));
  // 📦 PG (B15): tổng tháng (số đầu kỳ + các ngày) và số hôm nay của từng PG
  const pgDepts = setting("PG_DEPTS", ["PG"]) || ["PG"], pgStaff = staff.filter((s) => pgDepts.includes(s.dept));
  const pgSum = (id) => pgRows.filter((r) => r.staff_id === id).reduce((a, r) => ({ q: a.q + (Number(r.qty) || 0), r: a.r + (Number(r.revenue) || 0) }), { q: 0, r: 0 });
  const pgToday = (id) => pgRows.find((r) => r.staff_id === id && r.kind === "day" && r.report_date === t);
  const pgHtml = pgStaff.length ? `<div class="kpg"><h3>📦 PG tháng ${t.slice(5, 7)}</h3><div class="tbl-wrap"><table class="nosort"><thead><tr><th>PG</th><th class="num">SL tháng</th><th class="num">DT tháng</th><th>Hôm nay</th></tr></thead><tbody>
    ${pgStaff.map((s) => { const m = pgSum(s.id), d = pgToday(s.id);
      return `<tr><td><b>${esc(s.name)}</b></td><td class="num">${fmt(m.q, 2)}</td><td class="num">${fmt(m.r, 2)}</td><td class="small">${d ? `✅ SL ${fmt(d.qty, 2)} · DT ${fmt(d.revenue, 2)}` : '<span class="neg">⚠️ chưa báo cáo</span>'}</td></tr>`; }).join("")}
    </tbody></table></div></div>` : "";
  const dim = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7), 0)).getUTCDate(), pace = Math.min(1, Number(t.slice(8, 10)) / dim);
  const unit = setting("REVENUE_UNIT", "");
  const n = staff.length, repPct = n ? Math.round(done.size / n * 100) : 0;
  // Doanh thu: score_board chia target theo số ngày đã qua (so tiến độ) → nhân lại để ra target cả tháng
  const depts = new Map();
  for (const r of rows) {
    if (r.revenue == null || r.revenue_target == null || !(Number(r.revenue_target) > 0)) continue;
    const d = depts.get(r.dept || "Khác") || { rev: 0, tg: 0 };
    d.rev += Number(r.revenue) || 0; d.tg += Number(r.revenue_target) / pace; depts.set(r.dept || "Khác", d);
  }
  const all = [...depts.values()].reduce((a, d) => ({ rev: a.rev + d.rev, tg: a.tg + d.tg }), { rev: 0, tg: 0 });
  const state = (pct) => { const gap = Math.round((pct - pace) * 100);
    return gap >= 0 ? { cls: "good", txt: `✅ Đạt tiến độ (+${gap}%)` } : gap >= -15 ? { cls: "warn", txt: `⚠️ Chậm ${-gap}% so tiến độ` } : { cls: "bad", txt: `🔴 Chậm ${-gap}% so tiến độ` }; };
  const vio = rows.reduce((a, r) => a + (Number(r.violations) || 0), 0), vioPts = rows.reduce((a, r) => a + (Number(r.violation_points) || 0), 0);
  const neg = staff.filter((s) => Number(s.total_star) < 0);
  const ranked = rows.filter((r) => r.total != null).sort((a, b) => Number(b.total) - Number(a.total));
  const top = ranked.slice(0, 3), bottom = ranked.slice(Math.max(3, ranked.length - 3)).reverse();   // không trùng người với Dẫn đầu
  const allPct = all.tg ? all.rev / all.tg : null, allSt = allPct != null ? state(allPct) : null;
  const tile = (label, value, sub, extra = "") => `<div class="kpi-tile"><small>${label}</small><b>${value}</b>${extra}${sub ? `<span class="tiny muted">${sub}</span>` : ""}</div>`;
  const meter = (pct, cls) => `<span class="kmeter ${cls}"><i style="width:${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%"></i><em style="left:${(pace * 100).toFixed(1)}%" title="Tiến độ chuẩn hôm nay ${Math.round(pace * 100)}%"></em></span>`;
  const person = (r) => `<li><span class="kr-n">${r.rank ?? ""}</span><span class="grow"><b>${esc(r.name)}</b> <span class="tiny muted">${esc(r.dept || "")}</span></span><b>${fmt(r.total, 1)}</b></li>`;
  return `<div class="card hm-kpi" style="margin-bottom:14px"><div class="card-h"><h2>📊 Tổng quan tháng ${t.slice(5, 7)}/${t.slice(0, 4)}</h2><span class="small muted">đến ${dm(t)} · tiến độ chuẩn ${Math.round(pace * 100)}%</span></div>
    <div class="kpi-row">
      ${tile("Đã báo cáo hôm nay", `${done.size}/${n}`, done.size >= n ? "✅ đủ cả" : `còn ${n - done.size} người · ${repPct}%`, `<span class="kmeter ${done.size >= n ? "good" : "info"} flat"><i style="width:${repPct}%"></i></span>`)}
      ${allPct != null ? tile(`Doanh thu QĐ tháng${unit ? ` (${esc(unit)})` : ""}`, `${Math.round(allPct * 100)}%`, `${fmt(all.rev, 1)} / ${fmt(all.tg, 1)} · ${allSt.txt}`) : tile("Doanh thu QĐ tháng", "—", "chưa có target doanh thu")}
      ${tile("Vi phạm tháng", fmt(vio), vio ? `−${fmt(vioPts, 1)} điểm xếp hạng` : "✅ chưa có lỗi")}
      ${tile("Nhân viên âm sao", fmt(neg.length), neg.length ? neg.slice(0, 3).map((s) => `${esc(s.name)} (${fmt(s.total_star)}⭐)`).join(", ") : "✅ không có")}
    </div>
    ${depts.size ? `<div class="kdepts">${[...depts].sort((a, b) => a[0].localeCompare(b[0], "vi")).map(([name, d]) => { const pct = d.tg ? d.rev / d.tg : 0, s = state(pct);
      return `<div class="kdept" title="${esc(name)}: ${fmt(d.rev, 1)} / ${fmt(d.tg, 1)} ${esc(unit)} · tiến độ chuẩn ${Math.round(pace * 100)}%"><span class="kd-name">${esc(name)}</span>${meter(pct, s.cls)}<span class="kd-fig"><b>${Math.round(pct * 100)}%</b> <span class="tiny muted">${fmt(d.rev, 1)}/${fmt(d.tg, 1)}</span></span><span class="kd-st tiny ${s.cls}">${s.txt}</span></div>`; }).join("")}
      <p class="tiny muted" style="margin:4px 0 0">Thanh = doanh thu QĐ lũy kế / target tháng của bộ phận · vạch đứng = mức cần đạt tính đến hôm nay.</p></div>` : ""}
    ${ranked.length ? `<div class="krank"><div><h3>🏆 Dẫn đầu</h3><ol>${top.map(person).join("")}</ol></div>${bottom.length ? `<div><h3>🆘 Cần hỗ trợ</h3><ol>${bottom.map(person).join("")}</ol></div>` : ""}
      <button class="btn small ghost" data-go="C10" type="button">Xem bảng xếp hạng →</button></div>` : ""}
    ${pgHtml}
  </div>`;
}

export async function home(body, nav) {
  const t = vnToday(), month = t.slice(0, 8) + "01", lastWs = addDays(weekStart(t), -7), staff = visibleStaff();
  let pgRows = [];
  body.innerHTML = `<div class="empty">Đang tải…</div>`;
  const [rep, tg, rat, board] = await Promise.all([
    sb.from("daily_results").select("staff_id").eq("report_date", t),
    sb.from("monthly_targets").select("staff_id,revenue_target,items").eq("month", month),
    sb.from("ratings").select("staff_id").lte("period_start", addDays(lastWs, 6)).gte("period_end", lastWs),
    rpc("score_board", { p_from: month, p_to: t, p_full: false }).catch(() => []),
    sb.from("pg_reports").select("staff_id,kind,report_date,qty,revenue").gte("report_date", month).lte("report_date", t),
  ]).then((r) => { pgRows = r[4]?.data || []; return r; });
  if (!body.isConnected) return;
  const done = new Set((rep.data || []).map((r) => r.staff_id)), miss = staff.filter((s) => !done.has(s.id));
  const tgm = new Map((tg.data || []).map((r) => [r.staff_id, r])), noTarget = staff.filter((s) => !tgm.get(s.id)?.items?.length || tgm.get(s.id)?.revenue_target == null);
  const rated = new Set((rat.data || []).map((r) => r.staff_id)), noRate = staff.filter((s) => !rated.has(s.id));
  const lastPaste = S.items.map((i) => i.store_pct_at).filter(Boolean).sort().pop() || null;
  const pasteAge = lastPaste ? Math.round((new Date(t) - new Date(lastPaste)) / 864e5) : null;
  const pend = (S.pending.proposals || 0) + (S.pending.changes || 0) + (S.pending.hot || 0);
  const tele = setting("NOTIFY_ENABLED", false) === true;
  const card = (ok, icon, title, val, sub, c, label = "Mở") => `<div class="hm-card ${ok ? "ok" : "todo"}"><div class="hm-ic">${icon}</div><div class="hm-tx"><small>${title}</small><b>${val}</b>${sub ? `<span class="tiny muted">${sub}</span>` : ""}</div>${allowed(feat(c)) ? `<button class="btn small" data-go="${c}" type="button">${label}</button>` : ""}</div>`;
  const ticks = readTicks();
  body.innerHTML = `${kpiHtml(t, staff, done, board || [], pgRows)}
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>⚡ Việc cần làm ngay</h2><span class="small muted">${dmy(t)}</span></div>
      <div class="hm-grid">
        ${card(!pend, "📥", "Chờ duyệt", pend ? `${pend} mục` : "Không có", pend ? `thưởng nóng ${S.pending.hot || 0} · bán thêm ${S.pending.proposals || 0} · sửa ${S.pending.changes || 0}` : "", "B5", "Duyệt")}
        ${card(!miss.length, "📝", "Chưa báo cáo hôm nay", `${miss.length}/${staff.length}`, miss.slice(0, 4).map((s) => esc(s.name)).join(", ") + (miss.length > 4 ? "…" : ""), "B1", "Xem")}
        ${card(!noTarget.length, "🎯", "Target tháng " + t.slice(5, 7), noTarget.length ? `${noTarget.length} NV thiếu` : "Đủ", noTarget.length ? "thiếu target DT hoặc chưa giao môn" : "", noTarget.length && isOwner() ? "C1" : "C2", noTarget.length ? "Khai báo" : "Xem")}
        ${isOwner() ? card(pasteAge !== null && pasteAge <= 2, "📊", "Kết quả siêu thị dán lần cuối", lastPaste ? dm(lastPaste) : "Chưa dán", pasteAge > 2 ? `đã ${pasteAge} ngày — nên cập nhật sao` : "", "F2c", "Dán") : ""}
        ${card(!noRate.length, "🤝", `Phục vụ tuần ${dm(lastWs)}–${dm(addDays(lastWs, 6))}`, noRate.length ? `${noRate.length} NV chưa có` : "Đã nhập", "", "C6", "Nhập")}
        ${card(tele, "📣", "Telegram", tele ? "Đang bật" : "Đang tắt", "", "E1", "Cài")}
      </div></div>

    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🗓️ Lịch quản lý</h2><span class="small muted">Tick khi làm xong · tự làm mới theo ngày/tuần/tháng</span></div>
      <div class="hm-plan">${PLAN.map((p) => { const key = periodKey(p.id), tk = ticks[key] || [], steps = p.steps.filter(([, c]) => allowed(feat(c)));
        return `<div class="hm-col"><h3>${p.icon} ${p.t} <span class="pill ${tk.length >= steps.length ? "ok" : "mute"}">${Math.min(tk.length, steps.length)}/${steps.length}</span></h3>
          ${steps.map(([s, c], i) => `<div class="hm-step"><label class="inline"><input type="checkbox" data-tick="${key}" value="${i}" ${tk.includes(i) ? "checked" : ""}> <span>${esc(s)}</span></label><button class="btn small ghost" data-go="${c}" type="button">→</button></div>`).join("")}</div>`; }).join("")}</div></div>

    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🔎 Tìm chức năng</h2></div>
      <input id="hmQ" placeholder="Gõ việc cần làm, VD: trừ sao, mật khẩu, phục vụ, target, ẩn trang…" autocomplete="off">
      <div class="hm-list" id="hmList"></div>
      <p class="tiny muted" style="margin:8px 0 0">Mã (B5, C6…) trùng với file TOOL.md trong repo — nhờ sửa thì gửi “Sửa &lt;mã&gt;: …”.</p></div>

    ${isOwner() ? `<div class="card"><div class="card-h"><h2>🛠️ Tuỳ chỉnh nhanh</h2></div><div class="chips">
      ${["F2b", "F2c", "C3", "F5", "F4", "E1", "A2"].map((c) => `<button class="chip" data-go="${c}" type="button">${esc(feat(c).t)}</button>`).join("")}</div></div>` : ""}`;
  const list = (q) => {
    const words = q.toLowerCase().normalize("NFC").split(/\s+/).filter(Boolean);
    const rows = FEATURES.filter(allowed).filter((f) => !words.length || words.every((w) => (f.t + " " + f.k + " " + f.w + " " + f.c).toLowerCase().includes(w)));
    $("#hmList").innerHTML = rows.map((f) => `<button class="hm-item" data-go="${f.c}" type="button"><span class="pill mute">${f.c}</span><span class="grow"><b>${esc(f.t)}</b><span class="tiny muted">${esc(f.w)}</span></span><span>→</span></button>`).join("") || `<p class="muted small">Không thấy — thử từ khác.</p>`;
  };
  list("");
  $("#hmQ").oninput = (e) => list(e.target.value);
  body.onclick = (e) => {
    const g = e.target.closest("[data-go]"); if (g) { const f = feat(g.dataset.go); if (f) nav(f.go); return; }
  };
  body.onchange = (e) => {
    const cb = e.target.closest("[data-tick]"); if (!cb) return;
    const o = readTicks(), k = cb.dataset.tick, v = Number(cb.value), arr = new Set(o[k] || []);
    cb.checked ? arr.add(v) : arr.delete(v); o[k] = [...arr];
    for (const key of Object.keys(o)) if (!PLAN.some((p) => periodKey(p.id) === key)) delete o[key]; // dọn kỳ cũ
    saveTicks(o); home(body, nav);
  };
}
