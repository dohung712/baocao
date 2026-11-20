// Tin Telegram theo từng đầu mục công việc (doanh thu, bảng điểm, TikTok, vệ sinh, lịch bận, roadshow, phục vụ & vi phạm)
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dm = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dow = (d: string) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];
const short = (n: string) => String(n || "").trim().split(/\s+/).slice(-2).join(" ");
const num = (n: number, d = 1) => (Number(n) || 0).toLocaleString("vi-VN", { maximumFractionDigits: d });
type Staff = { id: string; name: string };

export function revenueMsg(store: string, date: string, unit: string, board: any[], todayRev: Map<string, number>) {
  if (!board.length) return null;
  const sorted = [...board].sort((a, b) => (b.rev_pct ?? -1) - (a.rev_pct ?? -1));
  const totalRev = board.reduce((a, r) => a + Number(r.revenue || 0), 0), totalT = board.reduce((a, r) => a + Number(r.revenue_target || 0), 0);
  const revWithT = board.filter((r) => r.revenue_target != null).reduce((a, r) => a + Number(r.revenue || 0), 0);
  const missing = board.filter((r) => !todayRev.has(r.staff_id));
  const L = [`💰 <b>DOANH THU QUY ĐỔI · ${dow(date)} ${dm(date)}</b>`, esc(store), "",
    `Lũy kế tháng cả siêu thị: <b>${num(totalRev)}</b> ${esc(unit)}${totalT ? ` · đạt <b>${Math.round(revWithT * 100 / totalT)}%</b> target (${num(totalT)})` : ""}`, ""];
  sorted.forEach((r, i) => L.push(`${i + 1}. ${esc(short(r.name))}: ${num(r.revenue)}${r.revenue_target ? ` / ${num(r.revenue_target)} · <b>${r.rev_pct ?? 0}%</b>` : " (chưa có target)"}${todayRev.has(r.staff_id) ? ` · hôm nay +${num(todayRev.get(r.staff_id)!)}` : ""}`));
  if (missing.length) L.push("", `⏳ Chưa nhập DT hôm nay: ${missing.map((r) => esc(short(r.name))).join(", ")}`);
  return L.join("\n");
}

export function scoreMsg(store: string, from: string, to: string, board: any[], w: { r: number; c: number; s: number }) {
  if (!board.length) return null;
  const L = [`🏅 <b>BẢNG ĐIỂM XẾP HẠNG ${dm(from)} – ${dm(to)}</b>`, esc(store), `DT ${w.r}% · Thi đua ${w.c}% · Phục vụ ${w.s}% · trừ lỗi vi phạm`, ""];
  board.slice(0, 15).forEach((r) => L.push(`${r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank + "."} <b>${esc(short(r.name))}</b>: <b>${num(r.total)}</b>đ (DT ${num(r.rev_score)} · TĐ ${num(r.contest_score)} · PV ${num(r.service_score)}${Number(r.violation_points) ? ` · −${num(r.violation_points)}` : ""})`));
  const noTarget = board.filter((r) => r.revenue_target == null);
  if (noTarget.length) L.push("", `⚠️ Chưa có target DT tháng: ${noTarget.map((r) => esc(short(r.name))).join(", ")}`);
  return L.join("\n");
}

export function tiktokMsg(store: string, date: string, staff: Staff[], subs: any[], due: string | null, overdue: Map<string, string[]>) {
  const L = [`📱 <b>TIKTOK · ${dow(date)} ${dm(date)}</b>`, esc(store), ""];
  if (due) {
    const done = new Set(subs.filter((s) => s.due === due).map((s) => s.staff_id));
    const miss = staff.filter((s) => !done.has(s.id));
    L.push(`Hạn hôm nay (${dow(due)} ${dm(due)}): <b>${staff.length - miss.length}/${staff.length}</b> đã nộp`);
    if (miss.length) L.push(`⏳ Chưa nộp: ${miss.map((s) => esc(short(s.name))).join(", ")} — nộp trước 24h hôm nay để không bị trừ sao`);
    L.push("🌟 Nộp trước ngày hạn được thưởng sao, nộp đúng ngày hạn không thưởng không trừ.");
  }
  const od = [...overdue.entries()].filter(([, v]) => v.length);
  if (od.length) { L.push("", "❌ <b>Quá hạn chưa nộp (đang bị trừ mỗi ngày)</b>"); od.forEach(([n, v]) => L.push(`• ${esc(short(n))}: ${v.map(dm).join(", ")}`)); }
  if (!due && !od.length) return null;
  return L.join("\n");
}

// Khu vực vệ sinh: người phụ trách (theo mã NV đã gắn, chưa gắn thì ghi như bảng) · pending = chỉ khu vực chưa báo xong hôm nay
type Zone = { id: number; dept: string; name: string; staff_text: string; staff_ids: string[] };
function zoneLines(zones: Zone[], done: Set<number>, names: Map<string, string>, pending: boolean) {
  const who = (z: Zone) => (z.staff_ids || []).map((id) => names.get(id)).filter(Boolean).map((n) => short(n as string)).join(", ") || z.staff_text;
  const list = zones.filter((z) => !pending || ((z.staff_ids || []).length && !done.has(z.id))), L: string[] = [];
  for (const d of [...new Set(list.map((z) => z.dept))]) {
    L.push(`<b>${esc(d)}</b>`);
    list.filter((z) => z.dept === d).forEach((z) => L.push(`• ${esc(z.name)}${who(z) ? ` — ${esc(who(z))}` : ""}${!pending && done.has(z.id) ? " ✅" : ""}`));
  }
  return L;
}

// Nhắc đầu ngày: người trực vệ sinh theo lịch đăng ký + khu vực & người phụ trách
export function cleanRemindMsg(store: string, date: string, rows: any[], names: Map<string, string>, zones: Zone[], done: Set<number>) {
  const today = rows.find((r) => r.clean_date === date && names.has(r.staff_id)) || rows.find((r) => r.clean_date === date);
  if (!today && !zones.length) return null;
  const L = [`🧹 <b>NHẮC VỆ SINH · ${dow(date)} ${dm(date)}</b>`, esc(store), ""];
  L.push(today ? `Trực vệ sinh hôm nay (lịch đăng ký): <b>${esc(names.get(today.staff_id) || today.staff_id)}</b> — làm xong nộp 3 ảnh trên tool` : "Trực vệ sinh hôm nay: ⚠️ chưa ai đăng ký");
  if (zones.length) L.push("", "🧽 <b>Khu vực phụ trách</b> (làm xong bấm “Xong hôm nay” trên tool)", ...zoneLines(zones, done, names, false));
  return L.join("\n");
}

export function cleanMsg(store: string, date: string, rows: any[], names: Map<string, string>, zones: Zone[] = [], done: Set<number> = new Set()) {
  const tomorrow = new Date(date + "T00:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tm = tomorrow.toISOString().slice(0, 10);
  const today = rows.find((r) => r.clean_date === date), next = rows.find((r) => r.clean_date === tm);
  const late = rows.filter((r) => r.clean_date < date && r.photos.length < 3);
  const zp = zoneLines(zones, done, names, true);
  if (!today && !next && !late.length && !zp.length) return null;
  const L = [`🧹 <b>VỆ SINH · ${dow(date)} ${dm(date)}</b>`, esc(store), ""];
  L.push(today ? `Hôm nay: <b>${esc(names.get(today.staff_id))}</b> — ${today.photos.length >= 3 ? "✅ đã nộp ảnh" : "⏳ chưa nộp ảnh"}` : "Hôm nay: chưa ai đăng ký");
  L.push(next ? `Ngày mai: <b>${esc(names.get(next.staff_id))}</b>` : "Ngày mai: ⚠️ còn trống — ai rảnh đăng ký nhé");
  if (late.length) L.push("", `⚠️ Quá ngày chưa nộp ảnh: ${late.map((r) => `${esc(short(names.get(r.staff_id) || ""))} (${dm(r.clean_date)})`).join(", ")}`);
  if (zones.length) L.push("", zp.length ? "🧽 <b>Khu vực chưa báo xong hôm nay</b>" : "🧽 Khu vực vệ sinh: ✅ tất cả đã báo xong", ...zp);
  return L.join("\n");
}

export function busyMsg(store: string, date: string, rows: any[], names: Map<string, string>) {
  const tomorrow = new Date(date + "T00:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tm = tomorrow.toISOString().slice(0, 10), list = rows.filter((r) => r.busy_date === tm);
  const L = [`📅 <b>LỊCH BẬN / OFF NGÀY MAI · ${dow(tm)} ${dm(tm)}</b>`, esc(store), ""];
  if (!list.length) L.push("Không ai đăng ký bận / OFF.");
  list.forEach((r) => L.push(`• <b>${esc(names.get(r.staff_id))}</b>: ${r.type === "OFF" ? "OFF" : "Bận" + (r.shifts?.length ? " ca " + r.shifts.join(", ") : "")}`));
  return L.join("\n");
}

export function rsMsg(store: string, date: string, now: string, rows: any[], names: Map<string, string>) {
  const tomorrow = new Date(date + "T00:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tm = tomorrow.toISOString().slice(0, 10);
  const today = rows.filter((r) => r.rs_date === date), next = rows.filter((r) => r.rs_date === tm);
  const late = rows.filter((r) => (r.rs_date < date || (r.rs_date === date && r.rs_time <= now)) && r.photos.length < 3);
  if (!today.length && !next.length && !late.length) return null;
  const L = [`🏃 <b>ROADSHOW · ${dow(date)} ${dm(date)}</b>`, esc(store), ""];
  if (today.length) { L.push("<b>Hôm nay</b>"); today.sort((a, b) => a.rs_time.localeCompare(b.rs_time)).forEach((r) => L.push(`• ${r.rs_time} ${esc(names.get(r.staff_id))} — ${r.photos.length >= 3 ? `✅ ${num(r.km)} km · ${num(r.minutes, 0)} phút` : "⏳ chưa báo cáo"}`)); }
  if (next.length) { L.push("", "<b>Ngày mai</b>"); next.sort((a, b) => a.rs_time.localeCompare(b.rs_time)).forEach((r) => L.push(`• ${r.rs_time} ${esc(names.get(r.staff_id))}`)); }
  const old = late.filter((r) => r.rs_date < date);
  if (old.length) L.push("", `⚠️ Quá giờ chưa báo cáo: ${old.map((r) => `${esc(short(names.get(r.staff_id) || ""))} (${dm(r.rs_date)} ${r.rs_time})`).join(", ")}`);
  return L.join("\n");
}

export function serviceMsg(store: string, from: string, to: string, board: any[], viol: any[], names: Map<string, string>) {
  const L = [`🤝 <b>PHỤC VỤ & VI PHẠM ${dm(from)} – ${dm(to)}</b>`, esc(store), ""];
  const rated = [...board].filter((r) => r.s5 || r.s4 || r.s3 || r.s2 || r.s1 || r.complaints).sort((a, b) => b.service_raw - a.service_raw);
  if (rated.length) { L.push("<b>Đánh giá khách hàng</b>"); rated.forEach((r, i) => L.push(`${i + 1}. ${esc(short(r.name))}: ${num(r.service_raw, 0)}đ (5★ ${r.s5}${r.s4 ? ` · 4★ ${r.s4}` : ""}${r.s3 ? ` · 3★ ${r.s3}` : ""}${r.s2 ? ` · 2★ ${r.s2}` : ""}${r.s1 ? ` · 1★ ${r.s1}` : ""}${r.complaints ? ` · KN ${r.complaints}` : ""})`)); }
  else L.push("Chưa nhập đánh giá phục vụ cho kỳ này.");
  if (viol.length) { L.push("", `<b>Vi phạm (${viol.length})</b>`); viol.forEach((v) => L.push(`• ${dm(v.v_date)} ${esc(names.get(v.staff_id))}: ${esc(v.type)}${v.note ? " — " + esc(v.note) : ""} (−${num(v.points)}đ)`)); }
  else L.push("", "✅ Không có vi phạm.");
  return L.join("\n");
}

// 💵 Quỹ thu chi: chi tiết từng khoản thu / chi trong kỳ (từ lần gửi trước, hoặc khoảng ngày QL chọn), số dư, theo danh mục.
// list gồm cả khoản "ghi bổ sung" (ngày cũ nhưng mới nhập sau lần gửi trước) — đánh dấu ⤴.
const money = (n: number) => (Number(n) || 0).toLocaleString("vi-VN") + " đ";
const shortMoney = (n: number) => { const v = Math.abs(Number(n) || 0); return v >= 1e6 ? num(v / 1e6, 1) + "tr" : v >= 1e3 ? num(v / 1e3, 0) + "k" : num(v, 0) + "đ"; };
export function fundMsg(store: string, from: string, to: string, list: any[], lateIds: Set<number>, sum: any, appUrl: string) {
  list = [...list].sort((a, b) => (a.tx_date < b.tx_date ? -1 : a.tx_date > b.tx_date ? 1 : a.id - b.id));
  const thu = list.filter((t) => t.kind === "thu"), chi = list.filter((t) => t.kind === "chi");
  const tThu = thu.reduce((a, t) => a + Number(t.amount || 0), 0), tChi = chi.reduce((a, t) => a + Number(t.amount || 0), 0), diff = tThu - tChi;
  const L = [`💵 <b>QUỸ THU CHI · ${dm(from)} → ${dm(to)}</b>`, esc(store), ""];
  if (!list.length) L.push("Không có khoản thu / chi mới trong kỳ.");
  else L.push(`➕ Thu: <b>${money(tThu)}</b> (${thu.length} khoản)`, `➖ Chi: <b>${money(tChi)}</b> (${chi.length} khoản)`, `↔️ Chênh lệch: <b>${diff < 0 ? "−" : "+"}${money(Math.abs(diff))}</b>`);
  L.push(`💰 Số dư quỹ đến ${dm(to)}: <b>${money(sum?.balance)}</b>`);
  const line = (t: any) => `• ${dm(t.tx_date)} ${t.category ? esc(t.category) + " · " : ""}${esc(t.title)}: <b>${money(t.amount)}</b>${t.person ? ` — ${esc(t.person)}` : ""}${t.note ? ` <i>(${esc(t.note)})</i>` : ""}${lateIds.has(t.id) ? " ⤴ ghi bổ sung" : ""}`;
  if (chi.length) { L.push("", `➖ <b>CHI (${chi.length})</b>`); chi.forEach((t) => L.push(line(t))); }
  if (thu.length) { L.push("", `➕ <b>THU (${thu.length})</b>`); thu.forEach((t) => L.push(line(t))); }
  if (chi.length > 1) {
    const by = new Map<string, number>(); for (const t of chi) by.set(t.category || "Khác", (by.get(t.category || "Khác") || 0) + Number(t.amount || 0));
    L.push("", "📊 <b>Chi theo danh mục:</b> " + [...by].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${esc(c)} ${shortMoney(v)}`).join(" · "));
  }
  L.push("", `📅 Tháng ${to.slice(5, 7)}: Thu ${money(sum?.month_thu)} · Chi ${money(sum?.month_chi)}`, `🔗 Chi tiết: ${appUrl}#cv`);
  return L.join("\n");
}

// Thứ 2: nhắc NV cập nhật lũy kế tháng (DT QĐ + từng môn đúng loại) — liệt kê người chưa cập nhật
export function cumMsg(store: string, date: string, asof: string, staff: Staff[], done: Set<string>) {
  if (!staff.length) return null;
  const todo = staff.filter((x) => !done.has(x.id));
  const L = [`📈 <b>CẬP NHẬT LŨY KẾ TUẦN · ${dow(date)} ${dm(date)}</b>`, esc(store), "",
    `Nhập <b>lũy kế tháng đến hết ${dow(asof)} ${dm(asof)}</b> trên tool (dải nhắc đầu trang hoặc Của tôi → 📈 Cập nhật lũy kế):`,
    "• Doanh thu QĐ", "• Từng môn ĐÚNG LOẠI: 🔢 Số lượng · 💰 DT quy đổi · 💵 DT thực (xem nhãn từng môn)", ""];
  L.push(todo.length ? `⏳ Chưa cập nhật (${todo.length}/${staff.length}): ${todo.map((x) => esc(short(x.name))).join(", ")}` : `✅ Tất cả ${staff.length} NV đã cập nhật`);
  return L.join("\n");
}

// Thứ 6: nhắc hạn đăng ký bận/OFF tuần sau (sau giờ hạn NV không tự đăng ký được)
export function busyDeadlineMsg(store: string, date: string, mon: string, hm: string, rows: any[], names: Map<string, string>) {
  const L = [`🗓️ <b>HẠN ĐĂNG KÝ BẬN / OFF TUẦN SAU · ${hm} hôm nay (${dow(date)} ${dm(date)})</b>`, esc(store), "",
    `Tuần ${dm(mon)} → ${dm(new Date(Date.parse(mon + "T00:00:00Z") + 6 * 864e5).toISOString().slice(0, 10))}: ai bận / OFF đăng ký trên tool (CV → Lịch bận) trước ${hm}. Sau hạn phải nhờ quản lý.`];
  const by = new Map<string, string[]>();
  for (const r of rows) { const n = names.get(r.staff_id); if (!n) continue; const k = r.busy_date; by.set(k, [...(by.get(k) || []), `${short(n)}${r.type === "OFF" ? " (OFF)" : ""}`]); }
  if (by.size) { L.push("", "<b>Đã đăng ký:</b>"); [...by.keys()].sort().forEach((d) => L.push(`• ${dow(d)} ${dm(d)}: ${esc(by.get(d)!.join(", "))}`)); }
  else L.push("", "Chưa ai đăng ký ngày nào.");
  return L.join("\n");
}
