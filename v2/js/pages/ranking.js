// Trang Bảng xếp hạng cá nhân
import { $, $$, esc, fmt, sign, vnToday, addDays, weekStart, monthStart, dmy, sortTh, sorter, applySort, copyText, toast, initials } from "../ui.js";
import { S, rpc, onChange, depts, setting, errMsg } from "../store.js";

let st;
export async function render(view) {
  const t = vnToday();
  st = { range: "month", from: monthStart(t), to: t, dept: "", rows: [], sort: { key: "total_star", dir: -1 } };
  view.innerHTML = `
    <div class="page-h"><div><h1>Bảng xếp hạng cá nhân</h1><p>Quỹ sao, tỉ lệ về số, tăng ca, dùng sao, nộp trễ và môn có chuỗi dài nhất</p></div>
      <button class="btn small" id="rkCopy" type="button">📋 Copy BXH</button></div>
    <div class="row" style="margin-bottom:12px">
      <div class="seg" id="rkRange"><button data-r="week" type="button">Tuần này</button><button data-r="month" class="on" type="button">Tháng này</button><button data-r="last" type="button">Tháng trước</button><button data-r="30" type="button">30 ngày</button></div>
      ${depts().length > 1 ? `<div class="seg" id="rkDept"><button data-d="" class="on" type="button">Toàn siêu thị</button>${depts().map((d) => `<button data-d="${esc(d)}" type="button">${esc(d)}</button>`).join("")}</div>` : ""}
      <span class="muted small" id="rkPeriod"></span>
    </div>
    <div id="rkTop" class="grid2" style="margin-bottom:14px"></div>
    <div id="rkTable"></div>`;
  $("#rkRange").onclick = (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    $$("#rkRange button").forEach((x) => x.classList.toggle("on", x === b));
    const t2 = vnToday();
    ({ week: () => [st.from, st.to] = [weekStart(t2), t2], month: () => [st.from, st.to] = [monthStart(t2), t2],
       last: () => [st.from, st.to] = [monthStart(addDays(monthStart(t2), -1)), addDays(monthStart(t2), -1)], 30: () => [st.from, st.to] = [addDays(t2, -29), t2] })[b.dataset.r]();
    load();
  };
  $("#rkDept")?.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; $$("#rkDept button").forEach((x) => x.classList.toggle("on", x === b)); st.dept = b.dataset.d; draw(); });
  $("#rkTable").addEventListener("click", (e) => { const th = e.target.closest("th[data-sort]"); if (th) { sorter(st.sort, th.dataset.sort); draw(); } });
  $("#rkCopy").onclick = async () => {
    const list = rows();
    const text = [`🏆 BXH THI ĐUA ${dmy(st.from)} → ${dmy(st.to)}`, ...list.map((r, i) => `${i + 1}. ${r.name}: ${fmt(r.total_star)}⭐ (kỳ này ${sign(r.period_star)}) · về số ${r.pct}%`)].join("\n");
    toast((await copyText(text)) ? "Đã copy BXH" : "Không copy được");
  };
  await load();
  const off = onChange((w) => { if (w === "results" || w === "staff") load(); });
  return () => off();
}

async function load() {
  if (!$("#rkTable")) return;
  $("#rkPeriod").textContent = `${dmy(st.from)} → ${dmy(st.to)}`;
  try { st.rows = await rpc("leaderboard", { p_from: st.from, p_to: st.to }); }
  catch (e) { $("#rkTable").innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; return; }
  draw();
}
const rows = () => applySort(st.rows.filter((r) => !st.dept || r.dept === st.dept).map((r) => ({ ...r, pct: r.all_items ? Math.round(r.ok_items * 100 / r.all_items) : 0 })), st.sort);

function verdict(r) {
  if (!r.days) return '<span class="pill mute">Chưa có báo cáo</span>';
  if (r.late >= 3) return '<span class="pill bad">Hay nộp trễ</span>';
  if (r.risk_streak >= Number(setting("STREAK_PENALTY_STAR", 5))) return '<span class="pill bad">Chuỗi nguy hiểm</span>';
  if (r.pct >= 60) return '<span class="pill ok">Tốt</span>';
  if (r.pct >= 35) return '<span class="pill warn">Cần cố gắng</span>';
  return '<span class="pill bad">Yếu</span>';
}

function draw() {
  if (!$("#rkTable")) return;
  const list = rows();
  const byTotal = [...list].sort((a, b) => b.total_star - a.total_star);
  const top = byTotal.slice(0, 3);
  const bestPeriod = [...list].sort((a, b) => b.period_star - a.period_star)[0];
  $("#rkTop").innerHTML = top.map((r, i) => `<div class="card staff-card"><span class="rank r${i + 1}">${i + 1}</span><div class="avatar">${esc(initials(r.name))}</div>
      <div class="who"><b>${esc(r.name)}</b><span class="muted small">${esc(r.dept)}</span></div>
      <div class="kpis"><div><small>Tổng sao</small><b class="star">${fmt(r.total_star)}⭐</b></div><div><small>Kỳ này</small><b class="${r.period_star >= 0 ? "pos" : "neg"}">${sign(r.period_star)}</b></div></div></div>`).join("")
    + (bestPeriod && bestPeriod.period_star > 0 && !top.slice(0, 1).includes(bestPeriod) ? `<div class="card staff-card"><span>🔥</span><div class="who"><b>${esc(bestPeriod.name)}</b><span class="muted small">Tăng nhiều sao nhất kỳ này</span></div><div class="kpis"><div><small>Kỳ này</small><b class="pos">${sign(bestPeriod.period_star)}⭐</b></div></div></div>` : "");
  const note = S.me.role === "employee" && setting("EMPLOYEE_SEE_LEADERBOARD", false) !== true ? `<p class="small muted">Bạn chỉ xem được số liệu của chính mình. Chủ quản có thể bật cho nhân viên xem BXH toàn siêu thị.</p>` : "";
  if (!list.length) { $("#rkTable").innerHTML = `<div class="tbl-wrap"><div class="empty">Chưa có dữ liệu.</div></div>${note}`; return; }
  const rank = new Map(byTotal.map((r, i) => [r.staff_id, i + 1]));
  $("#rkTable").innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Hạng</th>${sortTh(st.sort, "name", "Nhân viên")}${sortTh(st.sort, "total_star", "Tổng sao", "num")}${sortTh(st.sort, "period_star", "Sao kỳ này", "num")}${sortTh(st.sort, "pct", "Tỉ lệ về số")}${sortTh(st.sort, "days", "Ngày BC", "num")}${sortTh(st.sort, "overtime", "Tăng ca", "num")}${sortTh(st.sort, "used_star", "Dùng sao", "num")}${sortTh(st.sort, "late", "Trễ", "num")}${sortTh(st.sort, "risk_streak", "Môn nguy cơ")}<th>Đánh giá</th></tr></thead><tbody>
    ${list.map((r) => { const k = rank.get(r.staff_id); return `<tr><td><span class="rank ${k <= 3 ? "r" + k : ""}">${k}</span></td><td><b>${esc(r.name)}</b><div class="tiny muted">${esc(r.dept)}</div></td>
      <td class="num star"><b>${fmt(r.total_star)}</b></td><td class="num ${r.period_star >= 0 ? "pos" : "neg"}">${sign(r.period_star)}</td>
      <td><div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ${r.pct >= 60 ? "" : r.pct >= 35 ? "mid" : "low"}" style="width:70px"><i style="width:${r.pct}%"></i></div><span class="small">${r.pct}% <span class="muted">(${r.ok_items}/${r.all_items})</span></span></div></td>
      <td class="num">${r.days}</td><td class="num">${r.overtime || ""}</td><td class="num">${r.used_star || ""}</td><td class="num ${r.late ? "neg" : ""}">${r.late || ""}</td>
      <td class="small">${r.risk_item ? `${esc(r.risk_item)} <b class="streak ${r.risk_streak >= 3 ? "hot" : ""}">${r.risk_streak}</b> ngày` : '<span class="muted">—</span>'}</td><td>${verdict(r)}</td></tr>`; }).join("")}
    </tbody></table></div>${note}`;
}
