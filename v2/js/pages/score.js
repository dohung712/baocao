// Trang Xếp hạng điểm: Doanh thu QĐ 40% · Thi đua 40% · Phục vụ 20% − vi phạm
import { $, $$, esc, fmt, toast, modal, vnToday, addDays, weekStart, monthStart, dmy, dm, shiftMonth, monthLabel, initials, copyText, download, csv, sortTh, sorter, applySort } from "../ui.js";
import { sb, S, rpc, onChange, depts, setting, errMsg, isManager } from "../store.js";

let st;
export async function render(view) {
  const t = vnToday();
  st = { mode: "month", ym: t.slice(0, 7), full: false, dept: "", rows: [], sort: { key: "total", dir: -1 } };
  view.innerHTML = `<div class="page-h"><div><h1>Xếp hạng điểm</h1><p>Doanh thu QĐ <b>${fmt(setting("W_REVENUE", 40))}%</b> · Thi đua <b>${fmt(setting("W_CONTEST", 40))}%</b> · Phục vụ <b>${fmt(setting("W_SERVICE", 20))}%</b> · mỗi lỗi vi phạm −${fmt(setting("VIOLATION_POINTS", 2))} điểm</p></div>
      <div class="row"><button class="btn small" id="scCopy" type="button">📋 Copy</button>${isManager() ? `<button class="btn small" id="scCsv" type="button">⬇️ CSV</button>` : ""}</div></div>
    <div class="row" style="margin-bottom:12px">
      <div class="seg" id="scMode"><button data-m="week" type="button">Tuần này</button><button data-m="month" class="on" type="button">Tháng</button></div>
      <span id="scMonthNav" class="row" style="gap:4px"><button class="btn small" data-mm="-1" type="button">‹</button><b id="scMonth"></b><button class="btn small" data-mm="1" type="button">›</button></span>
      <div class="seg" id="scFull" title="Tiến độ: target chia theo số ngày đã qua · Cả tháng: so với target của cả tháng"><button data-f="0" class="on" type="button">So tiến độ</button><button data-f="1" type="button">So target cả tháng</button></div>
      ${depts().length > 1 ? `<div class="seg" id="scDept"><button data-d="" class="on" type="button">Tất cả</button>${depts().map((d) => `<button data-d="${esc(d)}" type="button">${esc(d)}</button>`).join("")}</div>` : ""}
      <span class="small muted" id="scRange"></span>
    </div>
    <div id="scTop" class="grid2 hide-m" style="margin-bottom:14px"></div>
    <div id="scTable"></div>
    <div class="card" style="margin-top:14px"><h3 style="margin-bottom:6px">Cách tính</h3><ul class="small muted" style="margin:0;padding-left:18px;line-height:1.7">
      <li><b>Doanh thu</b> = lũy kế DT quy đổi ÷ target tháng × ${fmt(setting("W_REVENUE", 40))} (tối đa ${fmt(setting("W_REVENUE", 40))}). Nhân viên nhập DT mỗi ngày trong báo cáo; quản lý đặt target và điều chỉnh được.</li>
      <li><b>Thi đua</b> = trung bình % hoàn thành các môn quản lý giao trong tháng × ${fmt(setting("W_CONTEST", 40))} (môn chưa đạt tính lẻ theo %, đạt ≥100% tính đủ).</li>
      <li><b>Phục vụ</b>: điểm thô = số lượt 5★ − 4★×1 − 3★×2 − 2★×3 − 1★×4 − khiếu nại×5; người cao nhất siêu thị được đủ ${fmt(setting("W_SERVICE", 20))} điểm, người khác theo tỉ lệ.</li>
      <li><b>Vi phạm</b>: mỗi lỗi −${fmt(setting("VIOLATION_POINTS", 2))} điểm trên tổng.</li></ul></div>`;
  $("#scMode").onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; $$("#scMode button").forEach((x) => x.classList.toggle("on", x === b)); st.mode = b.dataset.m; load(); };
  $("#scMonthNav").onclick = (e) => { const b = e.target.closest("[data-mm]"); if (!b) return; st.ym = shiftMonth(st.ym, Number(b.dataset.mm)); st.mode = "month"; $$("#scMode button").forEach((x) => x.classList.toggle("on", x.dataset.m === "month")); load(); };
  $("#scFull").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; $$("#scFull button").forEach((x) => x.classList.toggle("on", x === b)); st.full = b.dataset.f === "1"; load(); };
  $("#scDept")?.addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; $$("#scDept button").forEach((x) => x.classList.toggle("on", x === b)); st.dept = b.dataset.d; draw(); });
  $("#scTable").addEventListener("click", onClick);
  $("#scTop").addEventListener("click", (e) => { const c = e.target.closest("[data-sid]"); if (c) detail(c.dataset.sid); });
  const mq = matchMedia("(max-width:640px)"), onMq = () => draw(); mq.addEventListener?.("change", onMq);
  $("#scCopy").onclick = copy; $("#scCsv")?.addEventListener("click", exportCsv);
  await load();
  const off = onChange((w) => { if (["score", "results"].includes(w) && $("#scTable")) load(); });
  return () => { off(); mq.removeEventListener?.("change", onMq); };
}

function range() {
  const t = vnToday();
  if (st.mode === "week") { let f = weekStart(t); if (f.slice(0, 7) !== t.slice(0, 7)) f = monthStart(t); return [f, t]; }
  const from = st.ym + "-01", end = addDays(shiftMonth(st.ym, 1) + "-01", -1);
  return [from, end < t ? end : t];
}
async function load() {
  if (!$("#scTable")) return;
  const [from, to] = range();
  $("#scMonth").textContent = monthLabel(st.ym);
  $("#scRange").textContent = `${dmy(from)} → ${dmy(to)}`;
  try { st.rows = await rpc("score_board", { p_from: from, p_to: to, p_full: st.full }); }
  catch (e) { $("#scTable").innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; return; }
  draw();
}
const rows = () => applySort(st.rows.filter((r) => !st.dept || r.dept === st.dept), st.sort);
const bar = (v, max) => { const p = max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0; return `<div class="bar ${p >= 70 ? "" : p >= 40 ? "mid" : "low"}" style="width:56px"><i style="width:${p}%"></i></div>`; };

function draw() {
  if (!$("#scTable")) return;
  const list = rows(), W = { r: Number(setting("W_REVENUE", 40)), c: Number(setting("W_CONTEST", 40)), s: Number(setting("W_SERVICE", 20)) }, unit = setting("REVENUE_UNIT", "");
  const top = [...st.rows].sort((a, b) => a.rank - b.rank).slice(0, 3);
  $("#scTop").innerHTML = top.map((r) => `<div class="card staff-card click ${r.staff_id === S.me.staff_id ? "mine" : ""}" data-sid="${esc(r.staff_id)}"><span class="rank r${r.rank}">${r.rank}</span><div class="avatar">${esc(initials(r.name))}</div>
    <div class="who"><b>${esc(r.name)}</b><span class="muted small">DT ${fmt(r.rev_score, 1)} · TĐ ${fmt(r.contest_score, 1)} · PV ${fmt(r.service_score, 1)}${Number(r.violation_points) ? ` · −${fmt(r.violation_points)}` : ""}</span></div>
    <div class="kpis"><div><small>Tổng điểm</small><b class="star">${fmt(r.total, 1)}</b></div></div></div>`).join("");
  if (!list.length) { $("#scTable").innerHTML = `<div class="tbl-wrap"><div class="empty">Chưa có dữ liệu.</div></div>`; return; }
  const noT = st.rows.filter((r) => r.revenue != null && r.revenue_target == null).length, noI = st.rows.filter((r) => !r.items_total).length;
  const warn = isManager() && (noT || noI) ? `<div class="banner warn"><div>${noT ? `<strong>${noT}</strong> nhân viên chưa có target DT tháng. ` : ""}${noI ? `<strong>${noI}</strong> nhân viên chưa được giao môn thi đua tháng. ` : ""}${isManager() ? "Quản lý khai báo ở <strong>Quản lý → Điểm & DT → Target tháng</strong>." : ""}</div></div>` : "";
  if (matchMedia("(max-width:640px)").matches) {
    $("#scTable").innerHTML = `${warn}<p class="small muted" style="margin:0 0 8px">Bấm vào tên để xem điểm đến từ đâu.</p><div class="sc-list">${list.map((r) => `<button type="button" class="sc-row ${r.staff_id === S.me.staff_id ? "mine" : ""}" data-sid="${esc(r.staff_id)}">
      <span class="rank ${r.rank <= 3 ? "r" + r.rank : ""}">${r.rank}</span>
      <span class="sc-mid"><b>${esc(r.name)}${r.staff_id === S.me.staff_id ? ' <span class="pill info">Bạn</span>' : ""}</b><span class="tiny muted">${esc(r.dept)}</span>
        <span class="sc-bars"><span>DT ${bar(r.rev_score, W.r)}<b>${fmt(r.rev_score, 1)}</b></span><span>TĐ ${bar(r.contest_score, W.c)}<b>${fmt(r.contest_score, 1)}</b></span><span>PV ${bar(r.service_score, W.s)}<b>${fmt(r.service_score, 1)}</b></span>${Number(r.violation_points) ? `<span class="neg">VP −${fmt(r.violation_points)}</span>` : ""}</span></span>
      <b class="star sc-tot">${fmt(r.total, 1)}</b></button>`).join("")}</div>`;
    return;
  }
  $("#scTable").innerHTML = `${isManager() && (noT || noI) ? `<div class="banner warn"><div>${noT ? `<strong>${noT}</strong> nhân viên chưa có target DT tháng. ` : ""}${noI ? `<strong>${noI}</strong> nhân viên chưa được giao môn thi đua tháng. ` : ""}Quản lý khai báo ở <strong>Quản lý → Điểm & DT → Target tháng</strong>.</div></div>` : ""}
    <div class="tbl-wrap"><table><thead><tr>${sortTh(st.sort, "rank", "Hạng")}${sortTh(st.sort, "name", "Nhân viên")}
      ${sortTh(st.sort, "revenue", `Doanh thu QĐ (${esc(unit)})`, "num")}${sortTh(st.sort, "rev_score", `Điểm DT /${W.r}`, "num")}
      ${sortTh(st.sort, "items_done", "Môn đạt", "num")}${sortTh(st.sort, "contest_score", `Điểm TĐ /${W.c}`, "num")}
      ${sortTh(st.sort, "service_raw", "Phục vụ", "num")}${sortTh(st.sort, "service_score", `Điểm PV /${W.s}`, "num")}
      ${sortTh(st.sort, "violations", "Vi phạm", "num")}${sortTh(st.sort, "total", "Tổng điểm", "num")}</tr></thead><tbody>
    ${list.map((r) => `<tr class="click ${r.staff_id === S.me.staff_id ? "mine" : ""}" data-sid="${esc(r.staff_id)}"><td><span class="rank ${r.rank <= 3 ? "r" + r.rank : ""}">${r.rank}</span></td><td><b>${esc(r.name)}</b><div class="tiny muted">${esc(r.dept)}</div></td>
      <td class="num">${r.revenue == null ? '<span class="muted">—</span>' : `${fmt(r.revenue, 1)}${r.revenue_target != null ? `<div class="tiny muted">/ ${fmt(r.revenue_target, 1)} · ${fmt(r.rev_pct, 0)}%</div>` : '<div class="tiny neg">chưa có target</div>'}`}</td>
      <td class="num"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap">${bar(r.rev_score, W.r)}<b>${fmt(r.rev_score, 1)}</b></div></td>
      <td class="num">${r.items_total ? `<a href="#" data-items="${esc(r.staff_id)}">${fmt(r.items_done, 2)}/${r.items_total}</a>` : '<span class="tiny neg">chưa giao</span>'}</td>
      <td class="num"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap">${bar(r.contest_score, W.c)}<b>${fmt(r.contest_score, 1)}</b></div></td>
      <td class="num" title="5★ ${r.s5} · 4★ ${r.s4} · 3★ ${r.s3} · 2★ ${r.s2} · 1★ ${r.s1} · KN ${r.complaints}">${fmt(r.service_raw)}<div class="tiny muted">5★ ${r.s5}${r.s4 + r.s3 + r.s2 + r.s1 ? ` · khác ${r.s4 + r.s3 + r.s2 + r.s1}` : ""}${r.complaints ? ` · KN ${r.complaints}` : ""}</div></td>
      <td class="num"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap">${bar(r.service_score, W.s)}<b>${fmt(r.service_score, 1)}</b></div></td>
      <td class="num ${r.violations ? "neg" : ""}">${r.violations ? `${r.violations} (−${fmt(r.violation_points)})` : ""}</td>
      <td class="num"><b class="star" style="font-size:16px">${fmt(r.total, 1)}</b></td></tr>`).join("")}
    </tbody></table></div>`;
}

function onClick(e) {
  const th = e.target.closest("th[data-sort]"); if (th) { sorter(st.sort, th.dataset.sort); return draw(); }
  const a = e.target.closest("[data-items]");
  if (!a) { const row = e.target.closest("[data-sid]"); if (row) detail(row.dataset.sid); return; }
  e.preventDefault();
  const r = st.rows.find((x) => x.staff_id === a.dataset.items);
  modal(`<h3>${esc(r.name)} · môn thi đua</h3><div class="tbl-wrap"><table><thead><tr><th>Môn</th><th class="num">Lũy kế</th><th class="num">Target${st.full ? " tháng" : " (tiến độ)"}</th><th class="num">%</th></tr></thead><tbody>
    ${(r.items_detail || []).map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${fmt(i.actual, 2)}</td><td class="num">${fmt(i.target, 2)}</td><td class="num ${i.pct >= 100 ? "pos" : ""}"><b>${fmt(i.pct)}%</b></td></tr>`).join("")}</tbody></table></div>
    <p class="small muted">Điểm thi đua = trung bình % (tối đa 100% mỗi môn) × ${fmt(setting("W_CONTEST", 40))}.</p><div class="modal-actions"><button class="btn primary" data-v="ok">Đóng</button></div>`);
}
function exportCsv() {
  const [from, to] = range();
  download(`xep-hang-diem_${from}_${to}.csv`, csv([["Hạng", "Mã NV", "Nhân viên", "Bộ phận", "DT QĐ", "Target DT", "% DT", "Điểm DT", "Môn đạt", "Số môn", "Điểm TĐ", "5★", "4★", "3★", "2★", "1★", "Khiếu nại", "Điểm PV thô", "Điểm PV", "Số lỗi", "Trừ lỗi", "Tổng"],
    ...rows().map((r) => [r.rank, r.staff_id, r.name, r.dept, r.revenue, r.revenue_target ?? "", r.rev_pct ?? "", r.rev_score, r.items_done, r.items_total, r.contest_score, r.s5, r.s4, r.s3, r.s2, r.s1, r.complaints, r.service_raw, r.service_score, r.violations, r.violation_points, r.total])]));
}
async function copy() {
  const [from, to] = range();
  const text = [`🏅 XẾP HẠNG ĐIỂM ${dm(from)}–${dm(to)}`, ...[...st.rows].sort((a, b) => a.rank - b.rank).map((r) => `${r.rank}. ${r.name}: ${fmt(r.total, 1)}đ (DT ${fmt(r.rev_score, 1)} · TĐ ${fmt(r.contest_score, 1)} · PV ${fmt(r.service_score, 1)}${Number(r.violation_points) ? ` · −${fmt(r.violation_points)}` : ""})`)].join("\n");
  toast((await copyText(text)) ? "Đã copy" : "Không copy được");
}

// Chi tiết: điểm của một người đến từ đâu (NV: đủ số liệu của mình; người khác chỉ thấy điểm)
async function detail(sid) {
  const r = st.rows.find((x) => x.staff_id === sid); if (!r) return;
  const W = { r: Number(setting("W_REVENUE", 40)), c: Number(setting("W_CONTEST", 40)), s: Number(setting("W_SERVICE", 20)) }, unit = setting("REVENUE_UNIT", "");
  const d = { s4: 1, s3: 2, s2: 3, s1: 4, complaints: 5, ...(setting("RATING_DEDUCT", {}) || {}) };
  const full = r.revenue != null, top = Math.max(0, ...st.rows.map((x) => Number(x.service_raw) || 0)), [from, to] = range();
  let vio = [];
  if (full && r.violations) { const { data } = await sb.from("violations").select("v_date,type,points,note").eq("staff_id", sid).gte("v_date", from).lte("v_date", to).order("v_date"); vio = data || []; }
  const pct = (x) => `${fmt(Math.min(100, x || 0), 0)}%`;
  const sec = (icon, title, score, max, body) => `<div class="sc-sec"><div class="row" style="justify-content:space-between"><b>${icon} ${title}</b><b class="star">${score < 0 ? "−" + fmt(-score, 2) : fmt(score, 2)}${max ? `<span class="small muted">/${fmt(max)}</span>` : ""}</b></div>${body}</div>`;
  const rev = full
    ? (r.revenue_target ? `<p class="small">Lũy kế <b>${fmt(r.revenue, 2)}</b> ÷ target ${st.full ? "tháng" : "tiến độ"} <b>${fmt(r.revenue_target, 2)}</b> ${esc(unit)} = <b>${fmt(r.rev_pct, 1)}%</b> → ${pct(r.rev_pct)} × ${fmt(W.r)}</p>` : `<p class="small neg">Chưa có target doanh thu tháng.</p>`)
    : `<p class="small muted">Số liệu doanh thu chỉ người đó và quản lý xem được.</p>`;
  const con = !r.items_total ? `<p class="small neg">Chưa được giao môn thi đua tháng.</p>`
    : (full && r.items_detail?.length ? `<div class="tbl-wrap"><table><thead><tr><th>Môn</th><th class="num">Lũy kế</th><th class="num">Target</th><th class="num">%</th></tr></thead><tbody>${r.items_detail.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${fmt(i.actual, 2)}</td><td class="num">${fmt(i.target, 2)}</td><td class="num ${i.pct >= 100 ? "pos" : ""}"><b>${fmt(i.pct ?? 0)}%</b></td></tr>`).join("")}</tbody></table></div>` : "")
      + `<p class="small">Trung bình % hoàn thành (mỗi môn tối đa 100%): <b>${fmt(r.items_done, 2)}/${r.items_total}</b> môn = ${pct((r.items_done / r.items_total) * 100)} × ${fmt(W.c)}</p>`;
  const svc = `<p class="small">5★ <b>${r.s5}</b>${r.s4 ? ` − 4★ ${r.s4}×${d.s4}` : ""}${r.s3 ? ` − 3★ ${r.s3}×${d.s3}` : ""}${r.s2 ? ` − 2★ ${r.s2}×${d.s2}` : ""}${r.s1 ? ` − 1★ ${r.s1}×${d.s1}` : ""}${r.complaints ? ` − KN ${r.complaints}×${d.complaints}` : ""} = <b>${fmt(r.service_raw)}</b> điểm thô.<br>
    Cao nhất siêu thị: <b>${fmt(top)}</b> → ${top > 0 ? `${fmt(Math.max(0, r.service_raw))} ÷ ${fmt(top)} × ${fmt(W.s)}` : "chưa có đánh giá"}</p>`;
  const vp = r.violations ? `<p class="small">${r.violations} lỗi × ${fmt(setting("VIOLATION_POINTS", 2))} điểm</p>${vio.length ? `<ul class="small" style="margin:0;padding-left:18px">${vio.map((v) => `<li>${dm(v.v_date)}: ${esc(v.type)}${v.note ? ` <span class="muted">(${esc(v.note)})</span>` : ""}</li>`).join("")}</ul>` : ""}` : `<p class="small muted">Không có vi phạm ✅</p>`;
  const v = await modal(`<h3>${esc(r.name)} · hạng ${r.rank}/${st.rows.length}</h3>
    <p class="small muted" style="margin:-4px 0 10px">${dmy(from)} → ${dmy(to)} · ${st.full ? "so target cả tháng" : "so tiến độ (target chia theo số ngày đã qua)"}</p>
    <div class="sc-total">${fmt(r.rev_score, 1)} <small>DT</small> + ${fmt(r.contest_score, 1)} <small>TĐ</small> + ${fmt(r.service_score, 1)} <small>PV</small>${Number(r.violation_points) ? ` − ${fmt(r.violation_points)} <small>VP</small>` : ""} = <b class="star">${fmt(r.total, 1)}</b></div>
    ${sec("💰", "Doanh thu QĐ", r.rev_score, W.r, rev)}${sec("📋", "Thi đua", r.contest_score, W.c, con)}${sec("🤝", "Phục vụ", r.service_score, W.s, svc)}${sec("⚠️", "Vi phạm", -Number(r.violation_points || 0), 0, vp)}
    <div class="modal-actions">${sid === S.me.staff_id ? `<button class="btn" data-v="me" type="button">👤 Xem trang Của tôi</button>` : ""}<button class="btn primary" data-v="ok">Đóng</button></div>`);
  if (v === "me") document.querySelector('#nav [data-page="me"]')?.click();
}
