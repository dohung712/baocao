// Trang Lịch sử báo cáo
import { $, $$, esc, fmt, sign, starHtml, toast, vnToday, addDays, monthStart, weekStart, dmy, dow, download, csv, copyText, confirmBox, sortTh, sorter, applySort, shortName } from "../ui.js";
import { sb, S, rpc, onChange, isManager, visibleStaff, staffById, depts, errMsg } from "../store.js";

const COMP = { DUNG_SAO: "Dùng sao", TANG_CA: "Tăng ca", GHI_NHAN: "Ghi nhận", PHAT_TRE: "Phạt trễ", TIKTOK_PHAT: "Phạt TikTok" };
let st;

export async function render(view) {
  const today = vnToday();
  st = { range: "7d", from: addDays(today, -6), to: today, staff: "", dept: "", status: "", rows: [], sort: { key: "report_date", dir: -1 }, group: "day" };
  view.innerHTML = `
    <div class="page-h"><div><h1>Lịch sử báo cáo</h1><p>Tra cứu từng ca, thống kê nhanh, xuất CSV</p></div>
      <div class="row"><button class="btn small" id="hCopy" type="button">📋 Copy tóm tắt</button><button class="btn small" id="hCsv" type="button">⬇️ CSV</button></div></div>
    <div class="card" style="margin-bottom:14px"><div class="fields">
      <label>Thời gian<select id="hRange"><option value="today">Hôm nay</option><option value="7d" selected>7 ngày gần nhất</option><option value="week">Tuần này</option><option value="month">Từ đầu tháng</option><option value="lastmonth">Tháng trước</option><option value="custom">Tuỳ chọn…</option></select></label>
      <label>Từ ngày<input type="date" id="hFrom" value="${st.from}"></label>
      <label>Đến ngày<input type="date" id="hTo" value="${st.to}" max="${today}"></label>
      ${S.staff.length > 1 ? `<label>Bộ phận<select id="hDept"><option value="">Tất cả</option>${depts().map((d) => `<option>${esc(d)}</option>`).join("")}</select></label>
      <label>Nhân viên<select id="hStaff"><option value="">Tất cả</option>${S.staff.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.hidden ? " (ẩn)" : ""}</option>`).join("")}</select></label>` : ""}
      <label>Trạng thái<select id="hStatus"><option value="">Tất cả</option><option value="ok">Về số</option><option value="no">Chưa về</option><option value="TANG_CA">Tăng ca</option><option value="minus">Bị trừ sao</option><option value="PHAT_TRE">Nộp trễ</option></select></label>
    </div></div>
    <div class="stats" id="hStats"></div>
    <div class="row" style="margin-bottom:10px"><div class="seg" id="hGroup"><button data-g="day" class="on" type="button">Theo ca</button><button data-g="row" type="button">Từng dòng</button></div><span class="muted small" id="hCount"></span></div>
    <div id="hTable"></div>`;
  const setRange = (r) => {
    const t = vnToday();
    const map = { today: [t, t], "7d": [addDays(t, -6), t], week: [weekStart(t), t], month: [monthStart(t), t], lastmonth: [monthStart(addDays(monthStart(t), -1)), addDays(monthStart(t), -1)] };
    if (map[r]) { [st.from, st.to] = map[r]; $("#hFrom").value = st.from; $("#hTo").value = st.to; }
  };
  $("#hRange").onchange = (e) => { st.range = e.target.value; setRange(st.range); load(); };
  $("#hFrom").onchange = (e) => { st.from = e.target.value; $("#hRange").value = "custom"; load(); };
  $("#hTo").onchange = (e) => { st.to = e.target.value; $("#hRange").value = "custom"; load(); };
  $("#hDept")?.addEventListener("change", (e) => { st.dept = e.target.value; draw(); });
  $("#hStaff")?.addEventListener("change", (e) => { st.staff = e.target.value; draw(); });
  $("#hStatus").onchange = (e) => { st.status = e.target.value; draw(); };
  $("#hGroup").onclick = (e) => { const b = e.target.closest("[data-g]"); if (!b) return; st.group = b.dataset.g; $$("#hGroup button").forEach((x) => x.classList.toggle("on", x === b)); draw(); };
  $("#hCsv").onclick = exportCsv;
  $("#hCopy").onclick = copySummary;
  $("#hTable").addEventListener("click", onTableClick);
  await load();
  const off = onChange((w) => { if (w === "results") load(); });
  return () => off();
}

async function load() {
  if (!$("#hTable")) return;
  $("#hTable").innerHTML = `<div class="empty">Đang tải…</div>`;
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("daily_results").select("id,report_date,staff_id,staff_name,item_name,actual,rate_pct,star_change,status,compensation,submitted_at")
      .gte("report_date", st.from).lte("report_date", st.to).order("report_date", { ascending: false }).order("id").range(from, from + 999);
    if (error) { $("#hTable").innerHTML = `<div class="banner bad"><div>${esc(errMsg(error))}</div></div>`; return; }
    rows.push(...data); if (data.length < 1000) break;
  }
  st.rows = rows; draw();
}

function filtered() {
  return st.rows.filter((r) => {
    const s = staffById(r.staff_id);
    if (st.staff && r.staff_id !== st.staff) return false;
    if (st.dept && s?.dept !== st.dept) return false;
    if (st.status === "ok" && r.status !== "Về số") return false;
    if (st.status === "no" && r.status !== "Chưa về") return false;
    if (st.status === "TANG_CA" && r.compensation !== "TANG_CA") return false;
    if (st.status === "PHAT_TRE" && r.compensation !== "PHAT_TRE") return false;
    if (st.status === "minus" && !(r.star_change < 0)) return false;
    return true;
  });
}

function draw() {
  if (!$("#hTable")) return;
  const rows = filtered();
  const items = rows.filter((r) => r.status === "Về số" || r.status === "Chưa về");
  const ok = items.filter((r) => r.status === "Về số").length;
  const plus = rows.reduce((a, r) => a + Math.max(0, r.star_change), 0), minus = rows.reduce((a, r) => a + Math.min(0, r.star_change), 0);
  const shifts = new Set(rows.map((r) => r.report_date + "|" + r.staff_id)).size;
  $("#hStats").innerHTML = `
    <div class="stat"><small>Số ca báo cáo</small><b>${fmt(shifts)}</b></div>
    <div class="stat"><small>Tỉ lệ về số</small><b class="pos">${items.length ? Math.round(ok * 100 / items.length) : 0}%</b></div>
    <div class="stat"><small>Sao thưởng</small><b class="pos">${sign(plus)}⭐</b></div>
    <div class="stat"><small>Sao trừ</small><b class="neg">${sign(minus)}⭐</b></div>
    <div class="stat"><small>Lượt tăng ca</small><b>${fmt(rows.filter((r) => r.compensation === "TANG_CA").length)}</b></div>
    <div class="stat"><small>Lượt nộp trễ</small><b>${fmt(rows.filter((r) => r.compensation === "PHAT_TRE").length)}</b></div>`;
  $("#hCount").textContent = `${fmt(rows.length)} dòng · ${dmy(st.from)} → ${dmy(st.to)}`;
  if (!rows.length) { $("#hTable").innerHTML = `<div class="tbl-wrap"><div class="empty">Không có báo cáo trong khoảng này.</div></div>`; return; }
  const mgr = isManager();
  if (st.group === "day") {
    const map = new Map();
    for (const r of rows) {
      const k = r.report_date + "|" + r.staff_id;
      const x = map.get(k) || { report_date: r.report_date, staff_id: r.staff_id, name: staffById(r.staff_id)?.name || r.staff_name, ok: 0, all: 0, star: 0, ot: 0, late: false, at: r.submitted_at };
      if (r.status === "Về số" || r.status === "Chưa về") { x.all++; if (r.status === "Về số") x.ok++; }
      x.star += r.star_change; if (r.compensation === "TANG_CA") x.ot++; if (r.compensation === "PHAT_TRE") x.late = true;
      if (r.submitted_at > x.at) x.at = r.submitted_at;
      map.set(k, x);
    }
    const list = applySort([...map.values()].map((x) => ({ ...x, pct: x.all ? Math.round(x.ok * 100 / x.all) : 0 })), st.sort);
    $("#hTable").innerHTML = `<div class="tbl-wrap"><table><thead><tr>
      ${sortTh(st.sort, "report_date", "Ngày")}${sortTh(st.sort, "name", "Nhân viên")}${sortTh(st.sort, "pct", "Về số", "num")}${sortTh(st.sort, "star", "Sao", "num")}${sortTh(st.sort, "ot", "Tăng ca", "num")}<th>Ghi chú</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr><td>${dow(x.report_date)} ${dmy(x.report_date)}</td><td>${esc(x.name)}</td><td class="num">${x.ok}/${x.all}</td><td class="num">${starHtml(x.star)}</td><td class="num">${x.ot || ""}</td>
        <td>${x.late ? '<span class="pill bad">Nộp trễ</span>' : ""}</td>
        <td class="num"><button class="btn small ghost" data-detail="${esc(x.report_date)}|${esc(x.staff_id)}" type="button">Chi tiết</button>${mgr ? `<button class="btn small ghost danger" data-delday="${esc(x.report_date)}|${esc(x.staff_id)}" type="button" title="Xoá cả ca">🗑️</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
  } else {
    const list = applySort(rows.map((r) => ({ ...r, name: staffById(r.staff_id)?.name || r.staff_name })), st.sort);
    $("#hTable").innerHTML = `<div class="tbl-wrap"><table><thead><tr>
      ${sortTh(st.sort, "report_date", "Ngày")}${sortTh(st.sort, "name", "Nhân viên")}${sortTh(st.sort, "item_name", "Môn")}${sortTh(st.sort, "actual", "Thực đạt", "num")}${sortTh(st.sort, "rate_pct", "%", "num")}${sortTh(st.sort, "star_change", "Sao", "num")}<th>Trạng thái</th><th>Phương án</th>${mgr ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.slice(0, 1500).map((r) => `<tr><td>${dmy(r.report_date)}</td><td>${esc(shortName(r.name))}</td><td>${esc(r.item_name)}</td><td class="num">${fmt(r.actual, 2)}</td><td class="num">${r.rate_pct == null ? "" : fmt(r.rate_pct) + "%"}</td><td class="num">${starHtml(r.star_change)}</td>
        <td>${statusPill(r)}</td><td class="small muted">${COMP[r.compensation] || esc(r.compensation)}</td>${mgr ? `<td><button class="btn small ghost danger" data-delrow="${r.id}" type="button" title="Xoá dòng">🗑️</button></td>` : ""}</tr>`).join("")}
      </tbody></table>${list.length > 1500 ? `<div class="empty">Hiển thị 1.500/${fmt(list.length)} dòng — thu hẹp bộ lọc hoặc xuất CSV.</div>` : ""}</div>`;
  }
}
const statusPill = (r) => r.status === "Về số" ? '<span class="pill ok">Về số</span>' : r.status === "Chưa về" ? '<span class="pill mute">Chưa về</span>' : `<span class="pill bad">${esc(r.status)}</span>`;

async function onTableClick(e) {
  const th = e.target.closest("th[data-sort]");
  if (th) { sorter(st.sort, th.dataset.sort); return draw(); }
  const d = e.target.closest("[data-detail]");
  if (d) {
    const [date, sid] = d.dataset.detail.split("|");
    const rows = st.rows.filter((r) => r.report_date === date && r.staff_id === sid);
    const { modal } = await import("../ui.js");
    return modal(`<h3>${esc(staffById(sid)?.name || sid)} · ${dmy(date)}</h3><div class="tbl-wrap"><table><thead><tr><th>Môn</th><th class="num">Thực đạt</th><th class="num">%</th><th class="num">Sao</th><th>Phương án</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.item_name)}</td><td class="num">${fmt(r.actual, 2)}</td><td class="num">${r.rate_pct == null ? "" : r.rate_pct + "%"}</td><td class="num">${starHtml(r.star_change)}</td><td class="small">${statusPill(r)} ${COMP[r.compensation] || ""}</td></tr>`).join("")}
      </tbody></table></div><p class="tiny muted">Gửi lúc ${new Date(rows[0]?.submitted_at).toLocaleString("vi-VN")}</p><div class="modal-actions"><button class="btn primary" data-v="ok">Đóng</button></div>`);
  }
  const dd = e.target.closest("[data-delday]");
  if (dd) {
    const [date, sid] = dd.dataset.delday.split("|");
    if (!(await confirmBox("Xoá cả ca báo cáo?", `Xoá toàn bộ báo cáo ngày <b>${dmy(date)}</b> của <b>${esc(staffById(sid)?.name || sid)}</b>. Sao của ca này sẽ được hoàn lại.`, "Xoá ca", true))) return;
    try { const r = await rpc("delete_report_day", { p_staff: sid, p_date: date }); toast(`Đã xoá ${r.deleted} dòng`); load(); } catch (err) { toast(errMsg(err), 4000); }
  }
  const dr = e.target.closest("[data-delrow]");
  if (dr) {
    if (!(await confirmBox("Xoá dòng báo cáo?", "Sao của dòng này sẽ được hoàn lại.", "Xoá", true))) return;
    try { await rpc("delete_result", { p_id: Number(dr.dataset.delrow) }); toast("Đã xoá"); load(); } catch (err) { toast(errMsg(err), 4000); }
  }
}

function exportCsv() {
  const rows = filtered();
  download(`lich-su-bao-cao_${st.from}_${st.to}.csv`, csv([["Ngày", "Mã NV", "Nhân viên", "Môn", "Thực đạt", "% đạt", "Sao", "Trạng thái", "Phương án", "Gửi lúc"],
    ...rows.map((r) => [r.report_date, r.staff_id, staffById(r.staff_id)?.name || r.staff_name, r.item_name, r.actual, r.rate_pct ?? "", r.star_change, r.status, COMP[r.compensation] || r.compensation, r.submitted_at])]));
}
async function copySummary() {
  const rows = filtered(), by = new Map();
  for (const r of rows) { const x = by.get(r.staff_id) || { ok: 0, all: 0, star: 0, days: new Set() }; if (r.status === "Về số" || r.status === "Chưa về") { x.all++; if (r.status === "Về số") x.ok++; } x.star += r.star_change; x.days.add(r.report_date); by.set(r.staff_id, x); }
  const list = [...by.entries()].sort((a, b) => b[1].star - a[1].star);
  const text = [`📊 TÓM TẮT THI ĐUA ${dmy(st.from)} → ${dmy(st.to)}`, ...list.map(([id, x], i) => `${i + 1}. ${staffById(id)?.name || id}: ${sign(x.star)}⭐ · về số ${x.ok}/${x.all} · ${x.days.size} ngày`)].join("\n");
  toast((await copyText(text)) ? "Đã copy tóm tắt" : "Không copy được");
}
