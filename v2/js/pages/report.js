// Trang Báo cáo ca ngày
import { $, $$, esc, fmt, sign, starHtml, initials, toast, modal, vnToday, vnHM, dmy, dm, dow, debounce, copyText, shortName } from "../ui.js";
import { sb, S, rpc, onChange, isManager, visibleStaff, staffById, setting, errMsg, isHidden } from "../store.js";
import { reportPng, shareOrDownload } from "../report-image.js";
import { multLabel } from "../star-rules.js";

const LS_STAFF = "thidua-v2-staff";
let st = null;

export async function render(view) {
  const own = S.me.staff_id;
  let staffId = isManager() ? (localStorage.getItem(LS_STAFF) || own || visibleStaff()[0]?.id) : own;
  if (isManager() && staffId && !staffById(staffId)) staffId = visibleStaff()[0]?.id;
  st = { date: vnToday(), staffId, form: null, inputs: {}, comps: {}, preview: null, busy: false, extra: "", extraStars: "", revenue: "", revenueOld: null };

  if (!staffId) {
    view.innerHTML = `<div class="banner warn"><div><b>Tài khoản chưa gắn mã nhân viên</b>Nhờ chủ quản gắn mã NV cho email ${esc(S.me.email)} trong Quản lý → Phân quyền.</div></div>`;
    return;
  }
  view.innerHTML = `
    <div class="page-h"><div><h1>Báo cáo ca ngày</h1><p>Nộp trước <b>${esc(setting("CUTOFF_TIME", "22:20"))}</b> mỗi ngày<span class="hide-m"> · số liệu tính sao ở máy chủ</span></p></div></div>
    <div id="missing"></div>
    <div class="report-head ${isManager() ? "" : "solo"}">
      <label>Ngày làm việc<input type="date" id="rDate" max="${vnToday()}" value="${st.date}"></label>
      ${isManager() ? `<label>Nhân viên${staffSelect(staffId)}</label>` : ""}
    </div>
    <div id="rBody"></div>`;
  $("#rDate").onchange = (e) => { st.date = e.target.value || vnToday(); load(); };
  $("#rStaff")?.addEventListener("change", (e) => { st.staffId = e.target.value; localStorage.setItem(LS_STAFF, st.staffId); load(); });
  await load();
  if (isManager()) loadMissing();
  const off = onChange((what) => { if (what === "results") { if (!st.busy) refreshQuiet(); if (isManager()) loadMissing(); } if (what === "locked") refreshQuiet(); });
  return () => off();
}

function staffSelect(sel) {
  const groups = {};
  for (const s of visibleStaff()) (groups[s.dept || "Khác"] ||= []).push(s);
  return `<select id="rStaff">${Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.name)} · ${esc(s.id)}</option>`).join("")}</optgroup>`).join("")}</select>`;
}

async function loadMissing() {
  if (!$("#missing")) return;
  const today = vnToday();
  const { data } = await sb.from("daily_results").select("staff_id").eq("report_date", today);
  const done = new Set((data || []).map((r) => r.staff_id));
  const miss = visibleStaff().filter((s) => !done.has(s.id));
  const el = $("#missing"); if (!el) return;
  el.innerHTML = miss.length
    ? `<div class="banner info"><div><b>Chưa báo cáo hôm nay (${miss.length}/${visibleStaff().length})</b><div class="chips" style="margin-top:6px">${miss.map((s) => `<button class="chip" data-pick="${esc(s.id)}" type="button">${esc(shortName(s.name))}</button>`).join("")}</div></div></div>`
    : `<div class="banner ok"><div><b>✅ Tất cả nhân viên đã báo cáo hôm nay</b></div></div>`;
  $$("[data-pick]", el).forEach((b) => b.onclick = () => { st.staffId = b.dataset.pick; st.date = today; $("#rDate").value = today; const s = $("#rStaff"); if (s) s.value = st.staffId; localStorage.setItem(LS_STAFF, st.staffId); load(); });
}

async function refreshQuiet() {
  if (!$("#rHead")) return;
  try { st.form = await rpc("report_form", { p_staff: st.staffId, p_date: st.date }); drawHead(); } catch { /* bỏ qua */ }
}

async function load() {
  const body = $("#rBody"); if (!body) return;
  body.innerHTML = `<div class="empty">Đang tải bảng môn…</div>`;
  try { st.form = await rpc("report_form", { p_staff: st.staffId, p_date: st.date }); }
  catch (e) { body.innerHTML = `<div class="banner bad"><div><b>Không tải được</b>${esc(errMsg(e))}</div></div>`; return; }
  st.inputs = {}; st.comps = {}; st.preview = null;
  const ex = st.form.existing || [];
  for (const r of ex) { if (["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)) continue; st.inputs[r.item_name] = String(+r.actual); st.comps[r.item_name] = r.compensation === "TANG_CA" ? "TANG_CA" : "DUNG_SAO"; }
  const p = st.form.proposal;
  st.extra = p?.content || ""; st.extraStars = p ? String(p.stars) : "";
  const { data: rv } = await sb.from("revenue_entries").select("amount").eq("staff_id", st.staffId).eq("entry_date", st.date).eq("kind", "daily");
  st.revenueOld = rv?.[0]?.amount ?? null; st.revenue = st.revenueOld == null ? "" : String(+st.revenueOld);
  if (!$("#rBody")) return; // đã rời trang
  drawBody();
  if (ex.length) runPreview();
}

function drawHead() {
  const f = st.form, s = staffById(st.staffId) || {};
  const el = $("#rHead"); if (!el) return;
  const ex = (f.existing || []).filter((r) => r.compensation !== "TIKTOK_PHAT");
  const banners = [];
  if (f.locked) banners.push(`<div class="banner bad"><span>🔒</span><div><b>Ngày ${dmy(st.date)} đã khóa chốt sổ</b>Không thể nộp/sửa trực tiếp${isManager() && S.me.role !== "owner" ? "" : ""}. ${S.me.role === "owner" ? "Mở khóa trong Quản lý → Khoá sổ để sửa." : "Có thể gửi yêu cầu sửa để quản lý duyệt."}</div></div>`);
  else if (ex.length && f.after_cutoff && S.me.role !== "owner") banners.push(`<div class="banner warn"><span>✏️</span><div><b>Đã qua giờ chốt — báo cáo đã nộp</b>Sửa báo cáo cần quản lý duyệt. Bấm gửi sẽ tạo yêu cầu sửa kèm lý do.</div></div>`);
  else if (ex.length) banners.push(`<div class="banner info"><span>✏️</span><div><b>Đang sửa báo cáo đã nộp</b>Gửi lại sẽ thay thế báo cáo cũ của ngày này.</div></div>`);
  if (!f.locked && f.after_cutoff && !(f.existing || []).some((r) => r.compensation === "PHAT_TRE"))
    banners.push(`<div class="banner bad"><span>⚠️</span><div><b>Nộp sau ${esc(setting("CUTOFF_TIME", "22:20"))}</b>Báo cáo này sẽ bị trừ sao kỷ luật nộp trễ (lũy tiến theo số lần trong tháng).</div></div>`);
  el.innerHTML = `
    ${banners.join("")}
    <div class="card staff-card">
      <div class="avatar">${esc(initials(s.name))}</div>
      <div class="who"><b>${esc(s.name || st.staffId)}</b><span class="muted small">${esc(s.dept || "")} · Mã ${esc(st.staffId)} · ${dow(st.date)} ${dmy(st.date)}</span></div>
      <div class="kpis">
        <div><small>Tổng sao (BXH)</small><b class="star">${fmt(f.total_star)}⭐</b></div>
        <div><small>Số môn</small><b>${f.items.length}</b></div>
        <div><small>Trạng thái</small><b>${ex.length ? '<span class="pill ok">Đã nộp</span>' : '<span class="pill mute">Chưa nộp</span>'}</b></div>
      </div>
      ${ex.length ? `<button class="btn small" id="btnImg" type="button">🖼️ Ảnh báo cáo</button>` : ""}
    </div>`;
  $("#btnImg")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const rows = ex.filter((r) => !["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)).map((r) => {
        const it = f.items.find((i) => i.name === r.item_name), rate = Number(r.rate_pct);
        return { name: r.item_name, actual: Number(r.actual), target: rate > 0 ? Number(r.actual) * 100 / rate : Number(it?.target || 0), rate: Math.round(rate || 0), star: r.star_change, status: r.status, comp: r.compensation };
      });
      const late = ex.filter((r) => ["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)).map((r) => ({ name: r.item_name, star: r.star_change }));
      await exportImage(rows, late, ex.reduce((a, r) => a + r.star_change, 0), f.total_star);
    } catch (x) { toast(errMsg(x)); }
    e.target.disabled = false;
  });
}

function drawBody() {
  const f = st.form;
  $("#rBody").innerHTML = `
    <div id="rHead" class="stack" style="margin-bottom:12px"></div>
    ${f.items.length ? `
    <div class="tbl-wrap"><table class="items-tbl">
      <thead><tr><th>#</th><th>Môn thi đua</th><th class="num">Thực đạt</th><th>Target · Chuỗi</th><th>Kết quả</th></tr></thead>
      <tbody id="rRows"></tbody>
    </table></div>
    ${needRev() ? `<div class="card rev-card" style="margin-top:12px" id="revCard"><div class="card-h"><h3>💰 Doanh thu quy đổi trong ca <span class="req">* bắt buộc</span></h3></div>
      <label class="rev-in"><span>DT QĐ ngày ${dm(st.date)} <span class="muted">(${esc(setting("REVENUE_UNIT", ""))})</span></span><input id="xRev" type="number" step="any" min="0" inputmode="decimal" enterkeyhint="done" value="${esc(st.revenue)}" placeholder="Nhập số, không bán được ghi 0"></label>
      <p class="tiny muted" style="margin:6px 0 0">Tính vào điểm xếp hạng (lũy kế tháng).</p></div>` : ""}
    <div class="card" style="margin-top:12px" ${isHidden("report.extra") ? "hidden" : ""}>
      <div class="card-h"><h3>🎁 Bán thêm ngoài danh mục thi đua <span class="muted small">(chờ quản lý duyệt)</span></h3></div>
      <div class="fields"><label style="grid-column:span 2">Sản phẩm / nội dung<input id="xItem" value="${esc(st.extra)}" placeholder="VD: Bán thêm 1 tủ lạnh Inverter"></label>
      <label>Sao đề xuất<input id="xStars" type="number" min="0" step="50" value="${esc(st.extraStars)}" placeholder="0"></label></div>
      ${f.proposal && f.proposal.status !== "Chờ duyệt" ? `<p class="small muted" style="margin:8px 0 0">Đề xuất ngày này đã được xử lý: <b>${esc(f.proposal.status)}</b> (${fmt(f.proposal.stars)}⭐).</p>` : ""}
    </div>
    <div class="sumbar" id="rSum"></div>` : `<div class="banner warn"><div><b>Nhân viên chưa có môn thi đua</b>Chủ quản thêm môn trong Quản lý → Môn thi đua.</div></div>`}`;
  drawHead();
  if (!f.items.length) return;
  drawRows(); drawSum();
  const rows = $("#rRows");
  rows.addEventListener("input", (e) => {
    const inp = e.target.closest("input.actual"); if (!inp) return;
    st.inputs[inp.dataset.item] = inp.value; drawRowLocal(inp.dataset.item); schedule();
  });
  rows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-comp]"); if (!b) return;
    st.comps[b.dataset.item] = b.dataset.comp; drawRows(); schedule();
  });
  rows.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input.actual")) { e.preventDefault(); const all = $$("input.actual", rows); const i = all.indexOf(e.target); (all[i + 1] || $("#btnSend"))?.focus(); }
  });
  $("#xItem").oninput = (e) => { st.extra = e.target.value; };
  $("#xRev")?.addEventListener("input", (e) => { st.revenue = e.target.value; $("#revCard")?.classList.remove("miss"); drawSum(); });
  $("#xStars").oninput = (e) => { st.extraStars = e.target.value; };
}

const schedule = debounce(() => runPreview(), 350);
const itemsFilled = () => st.form.items.every((i) => st.inputs[i.name] !== undefined && st.inputs[i.name] !== "" && Number(st.inputs[i.name]) >= 0);
const needRev = () => !isHidden("report.revenue");
const revFilled = () => !needRev() || (st.revenue !== "" && Number(st.revenue) >= 0);
const filled = () => itemsFilled() && revFilled();
const payload = () => st.form.items.map((i) => ({ itemName: i.name, actual: Number(st.inputs[i.name]), compensation: st.comps[i.name] || "DUNG_SAO" }));

async function runPreview() {
  if (!$("#rRows")) return; // đã rời trang
  if (!itemsFilled()) { st.preview = null; drawRows(); drawSum(); return; }
  const key = JSON.stringify(payload());
  try {
    const res = await rpc("preview_daily_report", { p_staff: st.staffId, p_date: st.date, p_reports: payload() });
    if (JSON.stringify(payload()) !== key || !$("#rRows")) return; // đã nhập tiếp / rời trang
    st.preview = res; drawRows(); drawSum();
  } catch (e) { toast(errMsg(e)); }
}

function resultCell(item, pr) {
  const v = st.inputs[item.name];
  if (v === undefined || v === "") return `<span class="muted small">Nhập số…</span>`;
  const rate = Math.round(Number(v) / (Number(item.target) || 1) * 100);
  if (!pr) return rate >= 100 ? `<span class="pill ok">Về số ${rate}%</span>` : `<span class="pill mute">${rate}%</span>`;
  const chooser = `<span class="choice"><button type="button" data-item="${esc(item.name)}" data-comp="DUNG_SAO" class="${(st.comps[item.name] || "DUNG_SAO") === "DUNG_SAO" ? "on" : ""}">Dùng sao</button><button type="button" data-item="${esc(item.name)}" data-comp="TANG_CA" class="${st.comps[item.name] === "TANG_CA" ? "on" : ""}">Tăng ca</button></span>`;
  if (pr.status === "Về số") { const k = item.bonus ? Math.round(pr.starChange / item.bonus) : 1; return `<span class="pill ok">Về số ${pr.rate}%</span> ${starHtml(pr.starChange)}${k >= 2 ? ` <span class="pill star">X${k}</span>` : ""}`; }
  let label;
  if (pr.compensation === "GHI_NHAN") label = `<span class="pill mute">Ghi nhận chuỗi</span>`;
  else if (pr.compensation === "TANG_CA") label = `<span class="pill info">Tăng ca ⏰</span>`;
  else label = `<span class="pill bad">Dùng sao</span> ${starHtml(pr.starChange)}`;
  const canChoose = pr.compensation !== "GHI_NHAN";
  return `<span class="pill mute">${pr.rate}%</span> ${label} ${canChoose ? chooser : ""}`;
}

function drawRows() {
  const prev = st.preview?.rows || [];
  const byName = Object.fromEntries(prev.map((r) => [r.itemName, r]));
  const focused = document.activeElement?.dataset?.item;
  $("#rRows").innerHTML = st.form.items.map((it, i) => {
    const pr = byName[it.name];
    const done = pr ? pr.status === "Về số" : Number(st.inputs[it.name]) >= Number(it.target);
    const streak = pr?.streak ?? it.streak;
    const v = st.inputs[it.name], has = v !== undefined && v !== "", pct = has ? Math.min(100, Math.round(Number(v) / (Number(it.target) || 1) * 100)) : 0, ml = multLabel(it);
    return `<tr class="${done && has ? "done" : ""}" data-row="${esc(it.name)}">
      <td class="c-no muted">${i + 1}</td>
      <td class="item"><b>${esc(it.name)}${ml ? ` <span class="pill star">${ml}</span>` : ""}</b><small>+${fmt(it.bonus)} / −${fmt(it.penalty)}⭐</small></td>
      <td class="c-act num"><input class="actual" inputmode="decimal" enterkeyhint="next" type="number" min="0" step="any" data-item="${esc(it.name)}" value="${esc(v ?? "")}" placeholder="0" aria-label="Thực đạt ${esc(it.name)}"></td>
      <td class="c-meta small">Target <b>${fmt(it.target, 2)}</b> · Chuỗi <span class="streak ${streak >= 3 ? "hot" : ""}">${streak}</span><span class="mbar"><i style="width:${pct}%"></i></span></td>
      <td class="c-res" data-res="${esc(it.name)}">${resultCell(it, pr)}</td></tr>`;
  }).join("") + (prev.filter((r) => r.compensation === "PHAT_TRE").map((r) => `<tr class="late"><td class="c-no">!</td><td class="item" colspan="3"><b>${esc(r.itemName)}</b></td><td class="c-res">${starHtml(r.starChange)}</td></tr>`).join(""));
  if (focused) { const el = $(`input.actual[data-item="${CSS.escape(focused)}"]`); if (el) { el.focus(); const v = el.value; el.value = ""; el.value = v; } }
}
function drawRowLocal(name) {
  const it = st.form.items.find((i) => i.name === name);
  const cell = $(`[data-res="${CSS.escape(name)}"]`); if (cell) cell.innerHTML = resultCell(it, null);
}

function drawSum() {
  const p = st.preview, items = st.form.items;
  const nFilled = items.filter((i) => st.inputs[i.name] !== undefined && st.inputs[i.name] !== "").length;
  const ok = p ? p.rows.filter((r) => r.status === "Về số").length : items.filter((i) => Number(st.inputs[i.name]) >= Number(i.target)).length;
  const day = p ? p.day_change : null;
  const after = p ? p.total_before - p.old_day_change + p.day_change : null;
  $("#rSum").innerHTML = `
    <div class="kpis">
      <div><small>Đã nhập</small><b>${nFilled}/${items.length}</b></div>
      <div><small>Về số</small><b class="pos">${ok}/${items.length}</b></div>
      <div><small>Sao ca này</small><b>${day === null ? "—" : `<span class="${day >= 0 ? "pos" : "neg"}">${sign(day)}⭐</span>`}</b></div>
      <div><small>Tổng sau ca</small><b class="star">${after === null ? "—" : fmt(after) + "⭐"}</b></div>
    </div>
    <button class="btn primary big" id="btnSend" type="button">🚀 ${st.form.existing?.length ? "Cập nhật" : "Gửi báo cáo"}</button>
    ${filled() ? "" : `<div class="miss-hint">Còn thiếu: ${[items.length - nFilled ? `${items.length - nFilled} môn` : "", revFilled() ? "" : "doanh thu QĐ"].filter(Boolean).join(", ")}</div>`}`;
  $("#btnSend").classList.toggle("dim", !filled());
  $("#btnSend").onclick = () => submit();
}

async function submit(reason = null) {
  if (!itemsFilled()) { const miss = st.form.items.find((i) => st.inputs[i.name] === undefined || st.inputs[i.name] === ""); const el = miss && $(`input.actual[data-item="${CSS.escape(miss.name)}"]`); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); return toast("Nhập đủ số liệu tất cả các môn"); }
  if (!revFilled()) { const c = $("#revCard"); c?.classList.add("miss"); c?.scrollIntoView({ block: "center", behavior: "smooth" }); $("#xRev")?.focus(); return toast("Nhập doanh thu QĐ trong ca (không bán được ghi 0)"); }
  const btn = $("#btnSend"); btn.disabled = true; st.busy = true;
  try {
    const res = await rpc("submit_daily_report", {
      p_staff: st.staffId, p_date: st.date, p_reports: payload(),
      p_extra_item: st.extra.trim(), p_extra_stars: Number(st.extraStars) || 0, p_reason: typeof reason === "string" ? reason : null,
    });
    if (res.status === "approval_required") {
      const v = await modal(`<h3>Cần quản lý duyệt</h3><p class="muted">${esc(res.message)}</p>
        <form><label>Lý do sửa<textarea name="reason" minlength="5" required placeholder="VD: Nhập nhầm số Bảo hiểm, đúng là 3"></textarea></label></form>
        <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Gửi yêu cầu sửa</button></div>`);
      st.busy = false;
      if (v?.reason) return submit(v.reason);
      btn.disabled = false; return;
    }
    await saveRevenue();
    if (res.status === "pending") { toast("✅ " + res.message, 4000); st.busy = false; btn.disabled = false; return; }
    st.busy = false;
    await showDone(res);
    await load();
  } catch (e) { st.busy = false; btn.disabled = false; toast(errMsg(e), 4000); }
}

async function saveRevenue() {
  if (isHidden("report.revenue") || st.revenue === "" || Number(st.revenue) === Number(st.revenueOld)) return;
  try { await rpc("save_revenue", { p_staff: st.staffId, p_date: st.date, p_amount: Number(st.revenue), p_reason: null }); st.revenueOld = Number(st.revenue); }
  catch (e) { toast("Chưa lưu được doanh thu: " + errMsg(e), 4500); }
}

async function showDone(res) {
  const s = staffById(st.staffId) || {};
  const items = res.rows.filter((r) => !["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation));
  const ok = items.filter((r) => r.status === "Về số");
  const text = [
    `📝 BÁO CÁO THI ĐUA ${dmy(st.date)} – ${s.name || st.staffId}`,
    `✅ Về số ${ok.length}/${items.length} môn · Sao ca: ${sign(res.day_change)}⭐ · Tổng: ${fmt(res.total_star)}⭐`,
    ...items.map((r) => `${r.status === "Về số" ? "✅" : r.compensation === "TANG_CA" ? "⏰" : r.compensation === "GHI_NHAN" ? "▫️" : "❌"} ${r.itemName}: ${fmt(r.actual, 2)}/${fmt(r.target, 2)} (${r.rate}%)${r.starChange ? " " + sign(r.starChange) + "⭐" : ""}`),
    ...res.rows.filter((r) => ["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)).map((r) => `⚠️ ${r.itemName}: ${sign(r.starChange)}⭐`),
    st.revenue !== "" ? `💰 DT QĐ: ${fmt(Number(st.revenue), 2)} ${setting("REVENUE_UNIT", "")}` : "",
    st.extra.trim() ? `🎁 Bán thêm: ${st.extra.trim()} (đề xuất ${fmt(Number(st.extraStars) || 0)}⭐)` : "",
  ].filter(Boolean).join("\n");
  const imgRows = items.map((r) => ({ name: r.itemName, actual: r.actual, target: r.target, rate: r.rate, star: r.starChange, status: r.status, comp: r.compensation }));
  const late = res.rows.filter((r) => ["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)).map((r) => ({ name: r.itemName, star: r.starChange }));
  let blob = null; const ready = imageBlob(imgRows, late, res.day_change, res.total_star).then((b) => (blob = b)).catch(() => null);
  const v = await modal(`<h3>✅ Đã gửi báo cáo</h3>
    <div class="kpis" style="margin-bottom:10px"><div><small>Về số</small><b class="pos">${ok.length}/${items.length}</b></div><div><small>Sao ca này</small><b class="${res.day_change >= 0 ? "pos" : "neg"}">${sign(res.day_change)}⭐</b></div><div><small>Tổng sao</small><b class="star">${fmt(res.total_star)}⭐</b></div></div>
    <pre class="preview">${esc(text)}</pre>
    <div class="modal-actions wrap"><button class="btn primary" id="doneImg" type="button">🖼️ Lưu / gửi ảnh (Zalo, Line)</button><button class="btn" data-v="copy">📋 Copy chữ</button><button class="btn" data-v="ok">Xong</button></div>`,
    { onOpen: (box) => box.querySelector("#doneImg").addEventListener("click", async () => { await ready; if (blob) shareOrDownload(blob, imgName()); else toast("Không tạo được ảnh"); }) });
  if (v === "copy") toast((await copyText(text)) ? "Đã copy" : "Không copy được");
}

// ---------- Ảnh báo cáo ----------
const imgName = () => `bao-cao_${st.staffId}_${st.date}.png`;
function imageBlob(rows, late, dayChange, total) {
  const s = staffById(st.staffId) || {};
  return reportPng({ store: setting("STORE_NAME", "") || "Thi Đua & BXH", name: s.name || st.staffId, id: st.staffId, dept: s.dept || "", dateLabel: `${dow(st.date)} ${dmy(st.date)}`,
    rows, late, dayChange, total, okCount: rows.filter((r) => r.status === "Về số").length,
    revenue: st.revenue !== "" ? Number(st.revenue) : null, unit: setting("REVENUE_UNIT", ""), extra: st.extra.trim() });
}
async function exportImage(rows, late, dayChange, total) {
  const blob = await imageBlob(rows, late, dayChange, total);
  await shareOrDownload(blob, imgName());
}
