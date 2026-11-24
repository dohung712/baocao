// B15 Báo cáo PG: PG không tính sao, báo cáo số — Hôm nay (số lượng, doanh thu) · Bán kèm (chọn món → nhập SL + DT)
// · Lũy kế tháng (tool tự cộng: số đầu kỳ + các ngày đã báo cáo + hôm nay). Gửi → pg_report_save; copy tin gửi nhóm.
import { $, $$, esc, fmt, toast, modal, dmy, dow, copyText } from "../ui.js";
import { rpc, staffById, setting, errMsg } from "../store.js";

export const isPgStaff = (id) => { const s = staffById(id); return !!s && (setting("PG_DEPTS", ["PG"]) || ["PG"]).includes(s.dept); };
const num = (v) => (v === "" || v == null ? null : Number(v));
const err = (e) => toast(errMsg(e), 4500);

export async function pgReport(body, staffId, date) {
  body.innerHTML = `<div class="empty">Đang tải báo cáo PG…</div>`;
  let f;
  try { f = await rpc("pg_report_form", { p_staff: staffId, p_date: date }); }
  catch (e) { body.innerHTML = `<div class="banner bad"><div><b>Không tải được</b>${esc(errMsg(e))}</div></div>`; return; }
  if (!body.isConnected) return;
  const s = staffById(staffId) || {}, unit = setting("REVENUE_UNIT", ""), mm = date.slice(5, 7);
  const ADD = Array.isArray(f.addons) ? f.addons : [];
  const day = f.day, cum0 = f.cum_before || { qty: 0, revenue: 0, addons: [] };
  // Trạng thái nhập: số hôm nay + món bán kèm đang chọn
  const st = { qty: day ? String(+day.qty) : "", rev: day ? String(+day.revenue) : "", add: new Map() };
  for (const a of day?.addons || []) st.add.set(a.name, { qty: String(+a.qty || ""), rev: String(+a.revenue || "") });
  const dayOfMonth = Number(date.slice(8, 10)), hasEarlier = (f.days || []).some((d) => d.date < date);
  const needOpening = !f.opening && !hasEarlier && dayOfMonth > 1;

  body.innerHTML = `
    <div class="card pg-card">
      <div class="card-h"><h2>📦 Báo cáo PG</h2><span class="pill ${day ? "ok" : "mute"}">${day ? "Đã nộp" : "Chưa nộp"}</span></div>
      <p class="small muted" style="margin:-4px 0 10px">${esc(s.name || staffId)} · ${esc(s.dept || "PG")} · ${dow(date)} ${dmy(date)}${day ? " · gửi lại sẽ thay số cũ" : ""}</p>
      ${f.locked ? `<div class="banner bad" style="margin-bottom:10px"><div><b>Ngày đã khoá sổ</b>Không sửa được báo cáo ngày này.</div></div>` : ""}
      <h3 class="pg-h">Hôm nay</h3>
      <div class="pg-grid">
        <label class="pg-in"><span>Số lượng</span><input id="pgQty" type="number" min="0" step="1" inputmode="numeric" enterkeyhint="next" placeholder="0" value="${esc(st.qty)}"></label>
        <label class="pg-in"><span>Doanh thu${unit ? ` <small>(${esc(unit)})</small>` : ""}</span><input id="pgRev" type="number" min="0" step="any" inputmode="decimal" enterkeyhint="done" placeholder="0" value="${esc(st.rev)}"></label>
      </div>
      <p class="tiny muted" style="margin:4px 0 0">Không bán được thì ghi 0.</p>
      <h3 class="pg-h">Bán kèm được gì?</h3>
      <div class="pg-chips" id="pgChips">${ADD.map((n) => `<button type="button" class="pg-chip" data-addon="${esc(n)}" aria-pressed="false">${esc(n)}</button>`).join("") || `<span class="small muted">Chưa cài món bán kèm (Quản lý → Cài đặt).</span>`}</div>
      <div id="pgAddRows" class="pg-add-rows"></div>
      <h3 class="pg-h">Lũy kế tháng ${mm} <span class="tiny muted">(gồm hôm nay)</span></h3>
      <div class="pg-cum"><div><small>Số lượng</small><b id="pgCumQ">0</b></div><div><small>Doanh thu${unit ? ` (${esc(unit)})` : ""}</small><b id="pgCumR">0</b></div></div>
      <div id="pgCumAdd" class="small muted pg-cum-add"></div>
      ${needOpening ? `<div class="banner info" style="margin-top:10px"><div><b>Lần đầu báo cáo trong tháng ${mm}?</b>Nhập số đã bán từ 01/${mm} đến hôm qua để lũy kế khớp với báo cáo hãng.
          <div style="margin-top:6px"><button class="btn small" id="pgOpen" type="button">➕ Nhập số đầu kỳ</button></div></div></div>`
        : f.opening ? `<p class="tiny muted" style="margin:8px 0 0">Đã gồm số đầu kỳ: SL ${fmt(f.opening.qty, 2)} · DT ${fmt(f.opening.revenue, 2)} <button class="btn small ghost" id="pgOpen" type="button">✏️ Sửa</button></p>` : ""}
    </div>
    ${(f.days || []).length ? `<div class="card" style="margin-top:12px"><div class="card-h"><h3>📅 Các ngày đã báo cáo tháng ${mm}</h3></div>
      <div class="tbl-wrap"><table class="nosort pg-days"><thead><tr><th>Ngày</th><th class="num">SL</th><th class="num">DT</th><th>Bán kèm</th></tr></thead><tbody>
      ${f.days.map((d) => `<tr><td>${dow(d.date)} ${dmy(d.date).slice(0, 5)}</td><td class="num">${fmt(d.qty, 2)}</td><td class="num">${fmt(d.revenue, 2)}</td><td class="small">${addText(d.addons) || '<span class="muted">—</span>'}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
    <div id="pgWeek" style="margin-top:12px"></div>
    <div class="sumbar pg-sum"><div class="kpis"><div><small>Hôm nay</small><b id="pgSumT">—</b></div></div>
      <button class="btn" id="pgCopy" type="button">📋 Copy tin</button>
      <button class="btn primary big" id="pgSend" type="button" ${f.locked ? "disabled" : ""}>🚀 Gửi báo cáo</button></div>`;
  import("../pg-week.js").then((m) => m.pgWeekCard($("#pgWeek"), staffId)).catch(() => {});   // D19: lịch làm việc PG tuần sau

  const drawAdd = () => {
    $$("#pgChips [data-addon]").forEach((b) => { const on = st.add.has(b.dataset.addon); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    $("#pgAddRows").innerHTML = ADD.filter((n) => st.add.has(n)).map((n) => { const a = st.add.get(n);
      return `<div class="pg-add-row" data-ar="${esc(n)}"><b>${esc(n)}</b>
        <label><span>SL</span><input type="number" min="0" step="1" inputmode="numeric" data-aq value="${esc(a.qty)}" placeholder="0" aria-label="Số lượng ${esc(n)}"></label>
        <label><span>DT</span><input type="number" min="0" step="any" inputmode="decimal" data-av value="${esc(a.rev)}" placeholder="0" aria-label="Doanh thu ${esc(n)}"></label>
        <button type="button" class="pg-x" data-arx aria-label="Bỏ ${esc(n)}">✕</button></div>`; }).join("");
  };
  const today = () => ({ qty: Number(st.qty) || 0, revenue: Number(st.rev) || 0,
    addons: [...st.add].map(([name, a]) => ({ name, qty: Number(a.qty) || 0, revenue: Number(a.rev) || 0 })) });
  const cumNow = () => {   // lũy kế = trước hôm nay + số đang nhập
    const t = today(), m = new Map((cum0.addons || []).map((a) => [a.name, { qty: Number(a.qty) || 0, revenue: Number(a.revenue) || 0 }]));
    for (const a of t.addons) { const x = m.get(a.name) || { qty: 0, revenue: 0 }; m.set(a.name, { qty: x.qty + a.qty, revenue: x.revenue + a.revenue }); }
    return { qty: (Number(cum0.qty) || 0) + t.qty, revenue: (Number(cum0.revenue) || 0) + t.revenue, addons: [...m].map(([name, v]) => ({ name, ...v })).filter((a) => a.qty || a.revenue) };
  };
  const drawCum = () => {
    const c = cumNow(), t = today();
    $("#pgCumQ").textContent = fmt(c.qty, 2); $("#pgCumR").textContent = fmt(c.revenue, 2);
    $("#pgCumAdd").innerHTML = c.addons.length ? "Bán kèm: " + addText(c.addons) : "";
    $("#pgSumT").textContent = st.qty === "" && st.rev === "" ? "—" : `SL ${fmt(t.qty, 2)} · DT ${fmt(t.revenue, 2)}`;
  };
  drawAdd(); drawCum();

  $("#pgQty").oninput = (e) => { st.qty = e.target.value; drawCum(); };
  $("#pgRev").oninput = (e) => { st.rev = e.target.value; drawCum(); };
  $("#pgQty").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("#pgRev").focus(); } };
  $("#pgChips").onclick = (e) => {
    const b = e.target.closest("[data-addon]"); if (!b) return; const n = b.dataset.addon;
    if (st.add.has(n)) st.add.delete(n); else st.add.set(n, { qty: "", rev: "" });
    drawAdd(); drawCum();
    if (st.add.has(n)) $(`#pgAddRows [data-ar="${CSS.escape(n)}"] [data-aq]`)?.focus();
  };
  $("#pgAddRows").oninput = (e) => {
    const row = e.target.closest("[data-ar]"); if (!row) return; const a = st.add.get(row.dataset.ar); if (!a) return;
    if (e.target.matches("[data-aq]")) a.qty = e.target.value; if (e.target.matches("[data-av]")) a.rev = e.target.value; drawCum();
  };
  $("#pgAddRows").onclick = (e) => { const x = e.target.closest("[data-arx]"); if (!x) return; st.add.delete(x.closest("[data-ar]").dataset.ar); drawAdd(); drawCum(); };

  $("#pgCopy").onclick = () => {
    const t = today(), c = cumNow(), U = unit ? " " + unit : "";
    copyText([`📦 BÁO CÁO PG ${s.name || staffId} – ${dmy(date).slice(0, 5)}`,
      `Hôm nay: SL ${fmt(t.qty, 2)} – DT ${fmt(t.revenue, 2)}${U}`,
      `Lũy kế T${mm}: SL ${fmt(c.qty, 2)} – DT ${fmt(c.revenue, 2)}${U}`,
      `Bán kèm: ${addText(t.addons, false) || "không"}`].join("\n")).then((ok) => toast(ok ? "Đã copy tin báo cáo, dán vào nhóm Zalo" : "Không copy được, hãy chụp màn hình"));
  };
  $("#pgSend").onclick = async (e) => {
    if (st.qty === "" || st.rev === "") { toast("Nhập số lượng và doanh thu (không bán được ghi 0)"); (st.qty === "" ? $("#pgQty") : $("#pgRev")).focus(); return; }
    if (Number(st.qty) < 0 || Number(st.rev) < 0) return toast("Số không được âm");
    e.target.disabled = true;
    try {
      const t = today();
      const r = await rpc("pg_report_save", { p_staff: staffId, p_date: date, p_qty: t.qty, p_revenue: t.revenue, p_addons: t.addons, p_kind: "day" });
      toast(r.message || "Đã gửi báo cáo PG");
      if (body.isConnected) pgReport(body, staffId, date);
    } catch (x) { err(x); e.target.disabled = false; }
  };
  $("#pgOpen")?.addEventListener("click", () => openingModal(body, staffId, date, f, ADD, unit));
}

// Số đầu kỳ: đã bán từ ngày 1 đến hôm qua (nhập 1 lần khi bắt đầu báo cáo giữa tháng)
async function openingModal(body, staffId, date, f, ADD, unit) {
  const o = f.opening || { qty: "", revenue: "", addons: [] }, om = new Map((o.addons || []).map((a) => [a.name, a]));
  const mm = date.slice(5, 7);
  const v = await modal(`<h3>➕ Số đầu kỳ tháng ${mm}</h3><p class="small muted" style="margin:-4px 0 10px">Tổng đã bán từ 01/${mm} đến trước ngày bắt đầu báo cáo trên tool (theo báo cáo hãng).</p>
    <form class="stack"><div class="fields"><label>Số lượng<input name="q" type="number" min="0" step="1" inputmode="numeric" required value="${esc(o.qty === "" ? "" : +o.qty)}"></label>
      <label>Doanh thu${unit ? ` (${esc(unit)})` : ""}<input name="r" type="number" min="0" step="any" inputmode="decimal" required value="${esc(o.revenue === "" ? "" : +o.revenue)}"></label></div>
      ${ADD.length ? `<div class="small" style="margin-top:4px"><b>Bán kèm</b> <span class="muted">(bỏ trống = 0)</span></div>
      ${ADD.map((n, i) => `<div class="pg-add-row"><b>${esc(n)}</b><label><span>SL</span><input name="aq${i}" type="number" min="0" step="1" inputmode="numeric" value="${esc(om.get(n) ? +om.get(n).qty || "" : "")}"></label>
        <label><span>DT</span><input name="av${i}" type="number" min="0" step="any" inputmode="decimal" value="${esc(om.get(n) ? +om.get(n).revenue || "" : "")}"></label></div>`).join("")}` : ""}
    </form><div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu số đầu kỳ</button></div>`);
  if (!v) return;
  try {
    const addons = ADD.map((name, i) => ({ name, qty: Number(v["aq" + i]) || 0, revenue: Number(v["av" + i]) || 0 }));
    const r = await rpc("pg_report_save", { p_staff: staffId, p_date: date, p_qty: num(v.q) ?? 0, p_revenue: num(v.r) ?? 0, p_addons: addons, p_kind: "opening" });
    toast(r.message || "Đã lưu số đầu kỳ");
    if (body.isConnected) pgReport(body, staffId, date);
  } catch (x) { err(x); }
}

// Trên trang: "VAS 2 (1,5) · Sim 1" (đã mã hoá tên món) · Tin copy: "VAS SL 2 – DT 1,5; Sim SL 1"
function addText(list, html = true) {
  const rows = (list || []).filter((a) => Number(a.qty) || Number(a.revenue));
  if (!html) return rows.map((a) => `${a.name} SL ${fmt(a.qty, 2)}${Number(a.revenue) ? ` – DT ${fmt(a.revenue, 2)}` : ""}`).join("; ");
  return rows.map((a) => `${esc(a.name)} ${fmt(a.qty, 2)}${Number(a.revenue) ? ` (${fmt(a.revenue, 2)})` : ""}`).join(" · ");
}
