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

export function cleanMsg(store: string, date: string, rows: any[], names: Map<string, string>) {
  const tomorrow = new Date(date + "T00:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tm = tomorrow.toISOString().slice(0, 10);
  const today = rows.find((r) => r.clean_date === date), next = rows.find((r) => r.clean_date === tm);
  const late = rows.filter((r) => r.clean_date < date && r.photos.length < 3);
  if (!today && !next && !late.length) return null;
  const L = [`🧹 <b>VỆ SINH · ${dow(date)} ${dm(date)}</b>`, esc(store), ""];
  L.push(today ? `Hôm nay: <b>${esc(names.get(today.staff_id))}</b> — ${today.photos.length >= 3 ? "✅ đã nộp ảnh" : "⏳ chưa nộp ảnh"}` : "Hôm nay: chưa ai đăng ký");
  L.push(next ? `Ngày mai: <b>${esc(names.get(next.staff_id))}</b>` : "Ngày mai: ⚠️ còn trống — ai rảnh đăng ký nhé");
  if (late.length) L.push("", `⚠️ Quá ngày chưa nộp ảnh: ${late.map((r) => `${esc(short(names.get(r.staff_id) || ""))} (${dm(r.clean_date)})`).join(", ")}`);
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
