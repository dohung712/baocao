// Quản lý → 🏠 Tổng quan: việc cần làm ngay, lịch quản lý (ngày / tuần / tháng), tìm chức năng, tuỳ chỉnh nhanh
import { $, esc, vnToday, addDays, weekStart, dmy, dm } from "../ui.js";
import { sb, S, isOwner, visibleStaff, setting } from "../store.js";

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
  { c: "F2", t: "Danh mục môn, sao thưởng/phạt, X2/X3", w: "Quản lý → Môn & sao", k: "môn sao thưởng phạt x2 x3", go: { tab: "items" }, owner: true },
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
  { c: "D7b", t: "Xem ai đã đọc / hoàn thành việc", w: "CV → 📋 Việc → Triển khai & giao việc", k: "ai đã đọc nắm rõ hoàn thành kiểm tra", go: { page: "cv", cv: "tasks" } },
  { c: "D7c", t: "Link trang tính quản lý / việc QL có deadline", w: "CV → 📋 Việc", k: "link trang tính sheet deadline việc quản lý trưởng ca", go: { page: "cv", cv: "tasks" } },
  { c: "D8", t: "Khu vực vệ sinh: người phụ trách + tiêu chí, NV báo xong", w: "CV → 🧹 Vệ sinh → Khu vực vệ sinh", k: "khu vực vệ sinh tiêu chí phụ trách tủ phone đồng hồ kho", go: { page: "cv", cv: "clean" } },
  { c: "D9", t: "Nhắc NV theo lịch đăng ký vệ sinh (trên tool + Telegram sáng)", w: "Tự động · giờ Telegram ở Quản lý → Telegram", k: "nhắc việc nhắc vệ sinh lịch đăng ký trực", go: { tab: "telegram" } },
  { c: "C12", t: "Cập nhật lũy kế tuần (thứ 2 / mở khoá), loại tính từng môn", w: "Quản lý → Điểm & DT → 📈 Lũy kế tuần", k: "lũy kế cập nhật thứ 2 mở khoá số lượng doanh thu thực quy đổi loại môn", go: { tab: "score", sub: "cum" } },
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
    ["Nhắc / kiểm tra NV cập nhật lũy kế DT + môn (đúng loại)", "C12"], ["Nhập phục vụ tuần trước", "C6"], ["Ghi vi phạm (nếu có)", "C7"], ["Copy bảng xếp hạng tuần gửi nhóm", "C10"]] },
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

export async function home(body, nav) {
  const t = vnToday(), month = t.slice(0, 8) + "01", lastWs = addDays(weekStart(t), -7), staff = visibleStaff();
  body.innerHTML = `<div class="empty">Đang tải…</div>`;
  const [rep, tg, rat] = await Promise.all([
    sb.from("daily_results").select("staff_id").eq("report_date", t),
    sb.from("monthly_targets").select("staff_id,revenue_target,items").eq("month", month),
    sb.from("ratings").select("staff_id").lte("period_start", addDays(lastWs, 6)).gte("period_end", lastWs),
  ]);
  const done = new Set((rep.data || []).map((r) => r.staff_id)), miss = staff.filter((s) => !done.has(s.id));
  const tgm = new Map((tg.data || []).map((r) => [r.staff_id, r])), noTarget = staff.filter((s) => !tgm.get(s.id)?.items?.length || tgm.get(s.id)?.revenue_target == null);
  const rated = new Set((rat.data || []).map((r) => r.staff_id)), noRate = staff.filter((s) => !rated.has(s.id));
  const lastPaste = S.items.map((i) => i.store_pct_at).filter(Boolean).sort().pop() || null;
  const pasteAge = lastPaste ? Math.round((new Date(t) - new Date(lastPaste)) / 864e5) : null;
  const pend = (S.pending.proposals || 0) + (S.pending.changes || 0) + (S.pending.hot || 0);
  const tele = setting("NOTIFY_ENABLED", false) === true;
  const card = (ok, icon, title, val, sub, c, label = "Mở") => `<div class="hm-card ${ok ? "ok" : "todo"}"><div class="hm-ic">${icon}</div><div class="hm-tx"><small>${title}</small><b>${val}</b>${sub ? `<span class="tiny muted">${sub}</span>` : ""}</div>${allowed(feat(c)) ? `<button class="btn small" data-go="${c}" type="button">${label}</button>` : ""}</div>`;
  const ticks = readTicks();
  body.innerHTML = `
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
