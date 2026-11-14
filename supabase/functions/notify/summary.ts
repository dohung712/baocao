// Tạo nội dung tóm tắt ngày / tuần (HTML của Telegram). Hàm thuần, không gọi mạng.

export type Staff = { id: string; name: string; dept: string; total_star?: number };
export type Row = { report_date: string; staff_id: string; item_name: string; status: string; compensation: string; star_change: number; rate_pct: number | null };
export type Streak = { staff_id: string; item_name: string; streak: number };
export type Contest = { name: string; type: string; rate_month: number; forecast: number; branch: string; rank: string };
export type Ctx = {
  storeName: string; appUrl: string; penaltyStreak: number;
  staff: Staff[]; rows: Row[]; streaks: Streak[]; contest: Contest[];
  pendingProposals: number; pendingChanges: number;
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
const sign = (n: number) => (n > 0 ? "+" : "") + n.toLocaleString("vi-VN");
const isItem = (r: Row) => r.status === "Về số" || r.status === "Chưa về";
const short = (name: string) => name.trim().split(/\s+/).slice(-2).join(" ");

function perStaff(ctx: Ctx) {
  const m = new Map<string, { s: Staff; star: number; ok: number; all: number; ot: number; late: number; days: Set<string>; neg: number }>();
  for (const s of ctx.staff) m.set(s.id, { s, star: 0, ok: 0, all: 0, ot: 0, late: 0, days: new Set(), neg: 0 });
  for (const r of ctx.rows) {
    const x = m.get(r.staff_id); if (!x) continue;
    x.star += r.star_change; x.days.add(r.report_date);
    if (r.star_change < 0) x.neg += r.star_change;
    if (isItem(r)) { x.all++; if (r.status === "Về số") x.ok++; }
    if (r.compensation === "TANG_CA") x.ot++;
    if (r.compensation === "PHAT_TRE") x.late++;
  }
  return [...m.values()];
}

function itemStats(rows: Row[]) {
  const m = new Map<string, { ok: number; all: number }>();
  for (const r of rows) if (isItem(r)) { const x = m.get(r.item_name) || { ok: 0, all: 0 }; x.all++; if (r.status === "Về số") x.ok++; m.set(r.item_name, x); }
  return [...m.entries()].map(([name, v]) => ({ name, ...v, pct: v.all ? Math.round(v.ok * 100 / v.all) : 0 }));
}

function contestBlock(ctx: Ctx): string[] {
  const tong = ctx.contest.filter((c) => c.branch === "TỔNG");
  if (!tong.length) return [];
  const near = tong.filter((c) => c.forecast >= 70 && c.forecast < 100).sort((a, b) => b.forecast - a.forecast).slice(0, 5);
  const zero = tong.filter((c) => c.forecast <= 0).slice(0, 5);
  const done = tong.filter((c) => c.forecast >= 100).length;
  const out = ["", `🏢 <b>Thi đua siêu thị</b>: ${done}/${tong.length} môn dự báo về số`];
  if (near.length) out.push("🎯 Sát nút (70–100%): " + near.map((c) => `${esc(c.name)} ${c.forecast}%`).join(" · "));
  if (zero.length) out.push("🧊 Chưa phát sinh: " + zero.map((c) => esc(c.name)).join(" · "));
  return out;
}

export function dailySummary(ctx: Ctx, date: string): string {
  const day = ctx.rows.filter((r) => r.report_date === date);
  const ps = perStaff({ ...ctx, rows: day });
  const reported = ps.filter((x) => x.days.size > 0);
  const missing = ps.filter((x) => x.days.size === 0);
  const late = ps.filter((x) => x.late > 0);
  const plus = day.filter((r) => r.star_change > 0).reduce((a, r) => a + r.star_change, 0);
  const minus = day.filter((r) => r.star_change < 0).reduce((a, r) => a + r.star_change, 0);
  const top = [...reported].sort((a, b) => b.star - a.star).slice(0, 3);
  const loss = reported.filter((x) => x.neg < 0).sort((a, b) => a.neg - b.neg).slice(0, 3);
  const items = itemStats(day).filter((i) => i.all >= 2).sort((a, b) => a.pct - b.pct);
  const ot = day.filter((r) => r.compensation === "TANG_CA").length;
  const names = new Map(ctx.staff.map((s) => [s.id, s.name]));
  const danger = ctx.streaks.filter((s) => s.streak >= ctx.penaltyStreak).sort((a, b) => b.streak - a.streak).slice(0, 6);

  const L: string[] = [];
  L.push(`📊 <b>BÁO CÁO THI ĐUA NGÀY ${fmtDate(date)}</b>`);
  L.push(esc(ctx.storeName));
  L.push("");
  L.push(`👥 Đã báo cáo: <b>${reported.length}/${ps.length}</b> nhân viên`);
  if (missing.length) L.push(`⏳ Chưa báo cáo: ${missing.map((x) => esc(short(x.s.name))).join(", ")}`);
  if (late.length) L.push(`🐢 Nộp trễ: ${late.map((x) => esc(short(x.s.name))).join(", ")}`);
  L.push(`⭐ Sao hôm nay: <b>${sign(plus + minus)}</b> (thưởng ${sign(plus)} · trừ ${sign(minus)})`);
  if (top.length) {
    L.push("");
    L.push("🏆 <b>Top sao hôm nay</b>");
    top.forEach((x, i) => L.push(`${["🥇", "🥈", "🥉"][i]} ${esc(x.s.name)}: ${sign(x.star)}⭐ · đạt ${x.ok}/${x.all} môn`));
  }
  if (loss.length) L.push(`🔻 Bị trừ nhiều: ${loss.map((x) => `${esc(short(x.s.name))} ${sign(x.neg)}`).join(" · ")}`);
  if (items.length) {
    L.push("");
    L.push("📌 <b>Môn cần đẩy</b> (tỉ lệ người về số)");
    items.slice(0, 4).forEach((i) => L.push(`• ${esc(i.name)}: ${i.ok}/${i.all} (${i.pct}%)`));
  }
  if (danger.length) {
    L.push("");
    L.push(`🔥 <b>Chuỗi chưa về ≥ ${ctx.penaltyStreak} ngày</b>`);
    danger.forEach((d) => L.push(`• ${esc(short(names.get(d.staff_id) || d.staff_id))} – ${esc(d.item_name)}: ${d.streak} ngày`));
  }
  const tail: string[] = [];
  if (ot) tail.push(`⏰ Tăng ca: ${ot} lượt`);
  if (ctx.pendingProposals) tail.push(`🎁 Đề xuất chờ duyệt: ${ctx.pendingProposals}`);
  if (ctx.pendingChanges) tail.push(`✏️ Yêu cầu sửa chờ duyệt: ${ctx.pendingChanges}`);
  if (tail.length) { L.push(""); L.push(...tail); }
  L.push(...contestBlock(ctx));
  if (ctx.appUrl) { L.push(""); L.push(`🔗 ${esc(ctx.appUrl)}`); }
  return L.join("\n");
}

export function weeklySummary(ctx: Ctx, from: string, to: string, workDays: number): string {
  const rows = ctx.rows.filter((r) => r.report_date >= from && r.report_date <= to);
  const ps = perStaff({ ...ctx, rows });
  const byStar = [...ps].sort((a, b) => b.star - a.star);
  const items = itemStats(rows).filter((i) => i.all >= 3).sort((a, b) => a.pct - b.pct);
  const missing = ps.filter((x) => x.days.size < workDays).sort((a, b) => a.days.size - b.days.size);
  const late = ps.filter((x) => x.late > 0).sort((a, b) => b.late - a.late);
  const totalOk = ps.reduce((a, x) => a + x.ok, 0), totalAll = ps.reduce((a, x) => a + x.all, 0);
  const plus = rows.filter((r) => r.star_change > 0).reduce((a, r) => a + r.star_change, 0);
  const minus = rows.filter((r) => r.star_change < 0).reduce((a, r) => a + r.star_change, 0);
  const cumulative = [...ctx.staff].filter((s) => s.total_star != null).sort((a, b) => (b.total_star || 0) - (a.total_star || 0)).slice(0, 5);

  const L: string[] = [];
  L.push(`📅 <b>TỔNG KẾT TUẦN ${fmtDate(from).slice(0, 5)} – ${fmtDate(to)}</b>`);
  L.push(esc(ctx.storeName));
  L.push("");
  L.push(`✅ Tỉ lệ về số: <b>${totalAll ? Math.round(totalOk * 100 / totalAll) : 0}%</b> (${totalOk}/${totalAll} lượt môn)`);
  L.push(`⭐ Sao cả tuần: <b>${sign(plus + minus)}</b> (thưởng ${sign(plus)} · trừ ${sign(minus)})`);
  L.push("");
  L.push("🏆 <b>BXH sao tuần</b>");
  byStar.slice(0, 5).forEach((x, i) => L.push(`${i + 1}. ${esc(x.s.name)}: ${sign(x.star)}⭐ · về số ${x.all ? Math.round(x.ok * 100 / x.all) : 0}% · ${x.days.size} ngày`));
  const bottom = byStar.slice(-3).filter((x) => !byStar.slice(0, 5).includes(x)).reverse();
  if (bottom.length) L.push(`🔻 Cuối bảng: ${bottom.map((x) => `${esc(short(x.s.name))} ${sign(x.star)}`).join(" · ")}`);
  if (items.length) {
    L.push("");
    L.push("📌 <b>Môn yếu nhất tuần</b>");
    items.slice(0, 5).forEach((i) => L.push(`• ${esc(i.name)}: ${i.pct}% (${i.ok}/${i.all})`));
  }
  if (missing.length) {
    L.push("");
    L.push(`📝 <b>Số ngày đã báo cáo</b> (trên ${workDays} ngày)`);
    L.push(missing.slice(0, 10).map((x) => `${esc(short(x.s.name))} ${x.days.size}/${workDays}`).join(" · "));
  }
  if (late.length) L.push(`🐢 Nộp trễ: ${late.map((x) => `${esc(short(x.s.name))} ${x.late} lần`).join(" · ")}`);
  if (cumulative.length) {
    L.push("");
    L.push("💰 <b>Quỹ sao tích luỹ cao nhất</b>");
    L.push(cumulative.map((s, i) => `${i + 1}. ${esc(short(s.name))} ${(s.total_star || 0).toLocaleString("vi-VN")}⭐`).join(" · "));
  }
  L.push(...contestBlock(ctx));
  if (ctx.appUrl) { L.push(""); L.push(`🔗 ${esc(ctx.appUrl)}`); }
  return L.join("\n");
}

// Telegram giới hạn 4096 ký tự / tin
export function splitMessage(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const out: string[] = []; let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > max) { out.push(cur); cur = line; } else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out;
}
