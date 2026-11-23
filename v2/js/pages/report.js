// Trang Báo cáo ca ngày
import { $, $$, esc, fmt, sign, starHtml, initials, toast, modal, vnToday, vnHM, dmy, dm, dow, debounce, copyText, shortName } from "../ui.js";
import { sb, S, rpc, onChange, isManager, visibleStaff, staffById, setting, errMsg, isHidden } from "../store.js";
import { reportPng, shareOrDownload } from "../report-image.js";
import { multLabel } from "../star-rules.js";
import { openCum } from "../cumulative.js";
import { keepTodo } from "../simplify.js";
import { pgReport, isPgStaff } from "./report-pg.js";

const LS_STAFF = "thidua-v2-staff";
let st = null, nav = null;
const MEDIA = [["posts", "📣 Số lần truyền thông trong ngày"], ["line", "💬 Số lần báo cáo Line truyền thông"]];
const needMedia = () => !isHidden("report.media");

export async function render(view, params, ctx) {
  nav = ctx?.go || null;
  const own = S.me.staff_id;
  let staffId = isManager() ? (localStorage.getItem(LS_STAFF) || own || visibleStaff()[0]?.id) : own;
  // Quản lý: chỉ chọn người có trong danh sách (mã NV của chính tài khoản có thể đang bị ẩn → ô chọn hiện người khác, form lại của người ẩn)
  if (isManager() && !visibleStaff().some((s) => s.id === staffId)) staffId = visibleStaff()[0]?.id;
  st = { date: vnToday(), staffId, form: null, inputs: {}, comps: {}, preview: null, busy: false, extra: "", extraStars: "", revenue: "", revenueOld: null, media: { posts: "", line: "" }, mediaOld: null, todo: [] };

  if (!staffId) {
    view.innerHTML = `<div class="banner warn"><div><b>Tài khoản chưa gắn mã nhân viên</b>Nhờ chủ quản gắn mã NV cho email ${esc(S.me.email)} trong Quản lý → Phân quyền.</div></div>`;
    return;
  }
  view.innerHTML = `
    <div class="page-h"><div><h1>Báo cáo ca ngày</h1><p>Nộp trước <b>${esc(setting("CUTOFF_TIME", "22:20"))}</b> mỗi ngày<span class="hide-m"> · số liệu tính sao ở máy chủ</span></p></div>
      ${isHidden("history") ? "" : `<button class="btn small" type="button" data-page="history">🕒 Báo cáo đã nộp</button>`}</div>
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
  const off = onChange((what) => { if (what === "results") { if (!st.busy) refreshQuiet(); if (isManager()) loadMissing(); } if (what === "locked") refreshQuiet(); if (what === "cv" || what === "score") refreshTodo(); });
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

// Môn không trừ sao (sao phạt 0 hoặc quy tắc "Không trừ sao") xuống cuối, các môn khác giữ nguyên thứ tự.
// Máy chủ ghép kết quả theo tên môn nên đổi thứ tự hiển thị không ảnh hưởng cách tính.
const orderItems = (f) => { f?.items?.sort((a, b) => (a.noPen ? 1 : 0) - (b.noPen ? 1 : 0)); return f; };

async function refreshQuiet() {
  if (!$("#rHead")) return;
  try { st.form = orderItems(await rpc("report_form", { p_staff: st.staffId, p_date: st.date })); drawHead(); } catch { /* bỏ qua */ }
}

// Việc cần làm = todo_list + việc phát tờ rơi (D11)
const todoAll = () => Promise.all([rpc("todo_list", { p_staff: st.staffId, p_date: st.date }).catch(() => []), rpc("flyer_todo", { p_staff: st.staffId, p_date: st.date }).catch(() => [])])
  .then(([a, b]) => keepTodo([...(Array.isArray(b) ? b : []), ...(Array.isArray(a) ? a : [])]));
async function refreshTodo() {
  if (!$("#todoCard") || st.busy) return;
  try { st.todo = await todoAll(); drawTodo(); } catch { /* bỏ qua */ }
}

async function load() {
  const body = $("#rBody"); if (!body) return;
  if (isPgStaff(st.staffId)) { st.form = null; return pgReport(body, st.staffId, st.date); }   // B15: PG báo cáo số, không tính sao
  body.innerHTML = `<div class="empty">Đang tải bảng môn…</div>`;
  try { st.form = orderItems(await rpc("report_form", { p_staff: st.staffId, p_date: st.date })); }
  catch (e) { body.innerHTML = `<div class="banner bad"><div><b>Không tải được</b>${esc(errMsg(e))}</div></div>`; return; }
  st.inputs = {}; st.comps = {}; st.preview = null; st.nopenOpen = null;
  const ex = st.form.existing || [];
  for (const r of ex) { if (["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)) continue; st.inputs[r.item_name] = String(+r.actual); st.comps[r.item_name] = r.compensation === "TANG_CA" ? "TANG_CA" : "DUNG_SAO"; }
  const p = st.form.proposal;
  st.extra = p?.content || ""; st.extraStars = p ? String(p.stars) : "";
  const { data: rv } = await sb.from("revenue_entries").select("amount").eq("staff_id", st.staffId).eq("entry_date", st.date).eq("kind", "daily");
  st.revenueOld = rv?.[0]?.amount ?? null; st.revenue = st.revenueOld == null ? "" : String(+st.revenueOld);
  const [md, td] = await Promise.all([
    sb.from("media_reports").select("posts,line_reports").eq("staff_id", st.staffId).eq("report_date", st.date).then((r) => r.data || []).catch(() => []),
    todoAll(),
  ]);
  st.mediaOld = md[0] ? { posts: md[0].posts, line: md[0].line_reports } : null;
  st.media = st.mediaOld ? { posts: String(st.mediaOld.posts), line: String(st.mediaOld.line) } : { posts: "", line: "" };
  st.todo = Array.isArray(td) ? td : [];
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
        return { name: r.item_name, actual: Number(r.actual), target: Number(it?.target || 0) || (rate > 0 ? Number(r.actual) * 100 / rate : 0), rate: Math.round(rate || 0), star: r.star_change, status: r.status, comp: r.compensation, streak: it?.streak ?? 0, needed: it?.penalty };
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
    <p class="tiny muted rows-hint">Chỉ cần nhập môn có bán, môn bỏ trống tính là 0. “Tháng” = lũy kế đến hết hôm qua / target tháng.</p>
    <div class="tbl-wrap"><table class="items-tbl nosort">
      <thead><tr><th>#</th><th>Môn thi đua</th><th class="num">Thực đạt</th><th>Target · Chuỗi</th><th>Kết quả</th></tr></thead>
      <tbody id="rRows"></tbody>
    </table></div>
    ${needRev() ? `<div class="card rev-card" style="margin-top:12px" id="revCard"><div class="card-h"><h3>💰 Doanh thu quy đổi trong ca <span class="req">* bắt buộc</span></h3></div>
      <label class="rev-in"><span>DT QĐ ngày ${dm(st.date)} <span class="muted">(${esc(setting("REVENUE_UNIT", ""))})</span></span><input id="xRev" type="number" step="any" min="0" inputmode="decimal" enterkeyhint="done" value="${esc(st.revenue)}" placeholder="Nhập số, không bán được ghi 0"></label>
      <p class="tiny muted" style="margin:6px 0 0">Tính vào điểm xếp hạng (lũy kế tháng).</p></div>` : ""}
    ${needMedia() ? `<div class="card media-card" style="margin-top:12px" id="mediaCard"><div class="card-h"><h3>📣 Báo cáo truyền thông ngày</h3><span class="tiny muted">chọn số, không có chọn 0</span></div>
      ${MEDIA.map(([k, l]) => `<div class="media-row"><span>${l}</span><div class="media-pick" data-mk="${k}">${[0, 1, 2, 3].map((n) => `<button type="button" data-mv="${n}" class="${st.media[k] === String(n) ? "on" : ""}">${n}</button>`).join("")}
        <input type="number" min="0" max="99" step="1" inputmode="numeric" data-mi="${k}" placeholder="Khác" value="${Number(st.media[k]) > 3 ? esc(st.media[k]) : ""}" class="${Number(st.media[k]) > 3 ? "on" : ""}"></div></div>`).join("")}</div>` : ""}
    <div id="todoCard"></div>
    <div class="card" style="margin-top:12px" ${isHidden("report.extra") ? "hidden" : ""}>
      <div class="card-h"><h3>🎁 Bán thêm ngoài danh mục thi đua <span class="muted small">(chờ quản lý duyệt)</span></h3></div>
      <div class="fields"><label style="grid-column:span 2">Sản phẩm / nội dung<input id="xItem" value="${esc(st.extra)}" placeholder="VD: Bán thêm 1 tủ lạnh Inverter"></label>
      <label>Sao đề xuất<input id="xStars" type="number" min="0" step="50" value="${esc(st.extraStars)}" placeholder="0"></label></div>
      ${f.proposal && f.proposal.status !== "Chờ duyệt" ? `<p class="small muted" style="margin:8px 0 0">Đề xuất ngày này đã được xử lý: <b>${esc(f.proposal.status)}</b> (${fmt(f.proposal.stars)}⭐).</p>` : ""}
    </div>
    <div class="sumbar" id="rSum"></div>` : `<div class="banner warn"><div><b>Nhân viên chưa có môn thi đua</b>Chủ quản thêm môn trong Quản lý → Môn thi đua.</div></div>`}`;
  drawHead(); drawTodo();
  if (!f.items.length) return;
  drawRows(); drawSum();
  const rows = $("#rRows");
  rows.addEventListener("input", (e) => {
    const inp = e.target.closest("input.actual"); if (!inp) return;
    st.inputs[inp.dataset.item] = inp.value; drawRowLocal(inp.dataset.item); schedule();
  });
  rows.addEventListener("click", (e) => {
    if (e.target.closest("[data-nopen]")) { st.nopenOpen = !nopenOpen(); drawRows(); return; }   // mở / thu gọn nhóm môn không trừ sao
    const b = e.target.closest("[data-comp]"); if (!b) return;
    st.comps[b.dataset.item] = b.dataset.comp; drawRows(); schedule();
  });
  rows.addEventListener("keydown", (e) => {
    // Enter → ô kế tiếp đang hiện (bỏ qua môn trong nhóm đang thu gọn)
    if (e.key === "Enter" && e.target.matches("input.actual")) { e.preventDefault(); const all = $$("input.actual", rows).filter((x) => x.offsetParent); const i = all.indexOf(e.target); (all[i + 1] || $("#btnSend"))?.focus(); }
  });
  $("#xItem").oninput = (e) => { st.extra = e.target.value; };
  $("#xRev")?.addEventListener("input", (e) => { st.revenue = e.target.value; $("#revCard")?.classList.remove("miss"); drawSum(); });
  $("#xStars").oninput = (e) => { st.extraStars = e.target.value; };
  $("#mediaCard")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mv]"); if (!b) return; const k = b.closest("[data-mk]").dataset.mk;
    st.media[k] = b.dataset.mv; drawMedia(k);
  });
  $("#mediaCard")?.addEventListener("input", (e) => {
    const i = e.target.closest("[data-mi]"); if (!i) return; const k = i.dataset.mi;
    st.media[k] = i.value === "" ? "" : String(Math.max(0, Math.floor(Number(i.value) || 0))); drawMedia(k, true);
  });
}
function drawMedia(k, typing = false) {
  const box = $(`#mediaCard [data-mk="${k}"]`); if (!box) return;
  box.querySelectorAll("[data-mv]").forEach((b) => b.classList.toggle("on", b.dataset.mv === st.media[k]));
  const inp = box.querySelector("[data-mi]"); inp.classList.toggle("on", Number(st.media[k]) > 3);
  if (!typing && Number(st.media[k]) <= 3) inp.value = "";
}
// Việc cần làm / sắp tới (todo_list) — bấm để mở đúng chỗ
const LV = { bad: 0, warn: 1, info: 2 };
function drawTodo() {
  const el = $("#todoCard"); if (!el) return;
  const list = [...(st.todo || [])].sort((a, b) => (LV[a.lv] ?? 3) - (LV[b.lv] ?? 3));
  el.innerHTML = `<div class="card todo-card" style="margin-top:12px"><div class="card-h"><h3>📌 Việc cần làm & lịch sắp tới</h3>${list.length ? `<span class="pill ${list.some((t) => t.lv === "bad") ? "bad" : list.some((t) => t.lv === "warn") ? "warn" : "info"}">${list.length}</span>` : ""}</div>
    ${list.length ? `<div class="todo-list">${list.map((t, i) => `<button type="button" class="todo-i ${esc(t.lv)}" data-td="${i}" ${t.go ? "" : "disabled"}><span class="todo-ic">${esc(t.icon)}</span><span class="grow"><b>${esc(t.t)}</b>${t.d ? `<small>${esc(t.d)}</small>` : ""}</span>${t.go ? "<span class=\"todo-go\">›</span>" : ""}</button>`).join("")}</div>`
      : `<p class="small ok-t" style="margin:0">✅ Không còn việc nào cần làm — tốt lắm!</p>`}</div>`;
  el.onclick = (e) => {
    const b = e.target.closest("[data-td]"); if (!b) return; const t = list[Number(b.dataset.td)]; if (!t?.go) return;
    if (t.go === "cum") return openCum(st.staffId, () => load());
    if (t.go.startsWith("cv:")) { try { localStorage.setItem("thidua-v2-cv", t.go.slice(3)); } catch { /* bỏ qua */ } return nav?.("cv"); }
    nav?.(t.go);
  };
}

const schedule = debounce(() => runPreview(), 350);
// Môn để trống = 0 (không bắt buộc nhập); chỉ chặn số âm
const itemsFilled = () => st.form.items.every((i) => !(Number(st.inputs[i.name]) < 0));
const anyInput = () => st.form.items.some((i) => st.inputs[i.name] !== undefined && st.inputs[i.name] !== "");
const needRev = () => !isHidden("report.revenue");
const revFilled = () => !needRev() || (st.revenue !== "" && Number(st.revenue) >= 0);
const filled = () => itemsFilled() && revFilled();
const payload = () => st.form.items.map((i) => ({ itemName: i.name, actual: Number(st.inputs[i.name]) || 0, compensation: st.comps[i.name] || "DUNG_SAO" }));

async function runPreview() {
  if (!$("#rRows")) return; // đã rời trang
  if (!itemsFilled() || (!anyInput() && !st.form.existing?.length)) { st.preview = null; drawRows(); drawSum(); return; }
  const key = JSON.stringify(payload());
  try {
    const res = await rpc("preview_daily_report", { p_staff: st.staffId, p_date: st.date, p_reports: payload() });
    if (JSON.stringify(payload()) !== key || !$("#rRows")) return; // đã nhập tiếp / rời trang
    st.preview = res; drawRows(); drawSum();
  } catch (e) { toast(errMsg(e)); }
}

// Nhóm "môn không trừ sao": mặc định thu gọn, tự mở nếu đã có số (đang sửa báo cáo đã nộp)
const nopenOpen = () => st.nopenOpen ?? st.form.items.some((x) => x.noPen && st.inputs[x.name] !== undefined && st.inputs[x.name] !== "");

function resultCell(item, pr) {
  const v = st.inputs[item.name];
  if ((v === undefined || v === "") && !pr) return "";   // bỏ trống = 0 (ghi 1 lần ở đầu bảng thay vì lặp từng dòng)
  const rate = Math.round((Number(v) || 0) / (Number(item.target) || 1) * 100);
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
  const firstNoPen = st.form.items.findIndex((x) => x.noPen), anyPen = st.form.items.some((x) => !x.noPen);
  const nop = st.form.items.filter((x) => x.noPen), open = !anyPen || nopenOpen();
  const nopFilled = nop.filter((x) => st.inputs[x.name] !== undefined && st.inputs[x.name] !== "").length;
  $("#rRows").innerHTML = st.form.items.map((it, i) => {
    const pr = byName[it.name];
    const done = pr ? pr.status === "Về số" : Number(st.inputs[it.name]) >= Number(it.target);
    const streak = pr?.streak ?? it.streak;
    const v = st.inputs[it.name], has = v !== undefined && v !== "", pct = has ? Math.min(100, Math.round(Number(v) / (Number(it.target) || 1) * 100)) : 0, ml = multLabel(it);
    const mt = it.monthTarget != null ? Number(it.monthTarget) : null, md = Number(it.monthDone) || 0;
    const month = mt ? ` · <span class="mth ${md >= mt ? "ok-t" : ""}" title="Lũy kế tháng đến hết hôm qua / target tháng">Tháng <b>${fmt(md, 2)}/${fmt(mt, 2)}</b></span>` : "";
    return `${i === firstNoPen && anyPen ? `<tr class="nopen-sep"><td colspan="5"><button type="button" class="nopen-btn" data-nopen aria-expanded="${open}">🛡️ ${nop.length} môn không trừ sao${nopFilled ? ` · đã nhập ${nopFilled}` : ""}<span>${open ? "▲ Thu gọn" : "▼ Bấm để mở"}</span></button></td></tr>` : ""}<tr class="${done && has ? "done" : ""}${it.noPen ? " nopen" : ""}${it.noPen && !open ? " nopen-hide" : ""}" data-row="${esc(it.name)}">
      <td class="c-no muted">${i + 1}</td>
      <td class="item"><b>${esc(it.name)}${ml ? ` <span class="pill star">${ml}</span>` : ""}</b><small>${it.noPen ? `+${fmt(it.bonus)}⭐ · <span class="nopen-tag">không trừ sao</span>` : `+${fmt(it.bonus)} / −${fmt(it.penalty)}⭐`}</small></td>
      <td class="c-act num"><input class="actual" inputmode="decimal" enterkeyhint="next" type="number" min="0" step="any" data-item="${esc(it.name)}" value="${esc(v ?? "")}" placeholder="0" aria-label="Thực đạt ${esc(it.name)}"></td>
      <td class="c-meta small">Target <b>${fmt(it.target, 2)}</b> · Chuỗi <span class="streak ${streak >= 3 ? "hot" : ""}">${streak}</span>${month}<span class="mbar"><i style="width:${pct}%"></i></span></td>
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
      <div><small>Có số</small><b>${nFilled}/${items.length}</b></div>
      <div><small>Về số</small><b class="pos">${ok}/${items.length}</b></div>
      <div><small>Sao ca này</small><b>${day === null ? "—" : `<span class="${day >= 0 ? "pos" : "neg"}">${sign(day)}⭐</span>`}</b></div>
      <div><small>Tổng sau ca</small><b class="star">${after === null ? "—" : fmt(after) + "⭐"}</b></div>
    </div>
    <button class="btn primary big" id="btnSend" type="button">🚀 ${st.form.existing?.length ? "Cập nhật" : "Gửi báo cáo"}</button>
    ${filled() ? "" : `<div class="miss-hint">Còn thiếu: doanh thu QĐ (không có ghi 0)</div>`}`;
  $("#btnSend").classList.toggle("dim", !filled());
  $("#btnSend").onclick = () => submit();
}

async function submit(reason = null) {
  if (!itemsFilled()) return toast("Số thực đạt không được âm");
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
    await saveRevenue(); await saveMedia();
    if (res.status === "pending") { toast("✅ " + res.message, 4000); st.busy = false; btn.disabled = false; return; }
    st.busy = false;
    const hot = await rpc("check_hot_bonus", { p_staff: st.staffId, p_date: st.date }).catch(() => null);
    if (hot?.hot?.length) await celebrate(hot.hot);
    await showDone(res);
    await load();
  } catch (e) { st.busy = false; btn.disabled = false; toast(errMsg(e), 4000); }
}

async function saveRevenue() {
  if (isHidden("report.revenue") || st.revenue === "" || Number(st.revenue) === Number(st.revenueOld)) return;
  try { await rpc("save_revenue", { p_staff: st.staffId, p_date: st.date, p_amount: Number(st.revenue), p_reason: null }); st.revenueOld = Number(st.revenue); }
  catch (e) { toast("Chưa lưu được doanh thu: " + errMsg(e), 4500); }
}

async function saveMedia() {
  if (!needMedia() || (st.media.posts === "" && st.media.line === "")) return;
  const p = Number(st.media.posts) || 0, l = Number(st.media.line) || 0;
  if (st.mediaOld && st.mediaOld.posts === p && st.mediaOld.line === l) return;
  try { await rpc("save_media", { p_staff: st.staffId, p_date: st.date, p_posts: p, p_line: l }); st.mediaOld = { posts: p, line: l }; }
  catch (e) { toast("Chưa lưu được báo cáo truyền thông: " + errMsg(e), 4500); }
}
const mediaText = () => (st.media.posts !== "" || st.media.line !== "" ? `📣 Truyền thông: ${Number(st.media.posts) || 0} lần · Báo cáo Line: ${Number(st.media.line) || 0} lần` : "");
const todoText = () => (st.todo || []).filter((t) => t.lv !== "info").map((t) => `📌 ${t.t}${t.d ? ` (${t.d})` : ""}`);

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
    mediaText(), ...todoText(),
  ].filter(Boolean).join("\n");
  const imgRows = items.map((r) => ({ name: r.itemName, actual: r.actual, target: r.target, rate: r.rate, star: r.starChange, status: r.status, comp: r.compensation, streak: r.streak, needed: r.needed }));
  const late = res.rows.filter((r) => ["PHAT_TRE", "TIKTOK_PHAT"].includes(r.compensation)).map((r) => ({ name: r.itemName, star: r.starChange }));
  let blob = null; const ready = imageBlob(imgRows, late, res.day_change, res.total_star, true).then((b) => (blob = b)).catch(() => null);
  const v = await modal(`<h3>✅ Đã gửi báo cáo</h3>
    <div class="kpis" style="margin-bottom:10px"><div><small>Về số</small><b class="pos">${ok.length}/${items.length}</b></div><div><small>Sao ca này</small><b class="${res.day_change >= 0 ? "pos" : "neg"}">${sign(res.day_change)}⭐</b></div><div><small>Tổng sao</small><b class="star">${fmt(res.total_star)}⭐</b></div></div>
    <pre class="preview">${esc(text)}</pre>
    <div class="modal-actions wrap"><button class="btn primary" id="doneImg" type="button">🖼️ Lưu / gửi ảnh (Zalo, Line)</button><button class="btn" data-v="copy">📋 Copy chữ</button><button class="btn" data-v="ok">Xong</button></div>`,
    { onOpen: (box) => box.querySelector("#doneImg").addEventListener("click", async () => { await ready; if (blob) shareOrDownload(blob, imgName()); else toast("Không tạo được ảnh"); }) });
  if (v === "copy") toast((await copyText(text)) ? "Đã copy" : "Không copy được");
}

// ---------- Ảnh báo cáo ----------
const imgName = () => `bao-cao_${st.staffId}_${st.date}.png`;
async function imageBlob(rows, late, dayChange, total, fresh = false) {
  const s = staffById(st.staffId) || {};
  // H.QUA: thực đạt ở lần báo cáo gần nhất trước ngày này
  let pv = [];
  try { ({ data: pv } = await sb.from("daily_results").select("report_date,item_name,actual,status").eq("staff_id", st.staffId).lt("report_date", st.date).order("report_date", { ascending: false }).limit(80)); } catch { pv = []; }
  const lastDay = pv?.[0]?.report_date, prev = new Map((pv || []).filter((r) => r.report_date === lastDay && ["Về số", "Chưa về"].includes(r.status)).map((r) => [r.item_name, Number(r.actual)]));
  rows = rows.map((r) => ({ ...r, prev: prev.has(r.name) ? prev.get(r.name) : null }));
  const ex = st.form.existing?.find((r) => r.submitted_at);
  return reportPng({ store: setting("STORE_NAME", "") || "Thi Đua & BXH", name: s.name || st.staffId, id: st.staffId, dept: s.dept || "", date: st.date, dateLabel: `${dow(st.date)} ${dmy(st.date)}`,
    updatedAt: !fresh && ex ? new Date(ex.submitted_at) : new Date(), prevDay: lastDay || null,
    rows, late, dayChange, total, totalBefore: total - dayChange, okCount: rows.filter((r) => r.status === "Về số").length,
    revenue: st.revenue !== "" ? Number(st.revenue) : null, unit: setting("REVENUE_UNIT", ""), extra: st.extra.trim(), extraStars: Number(st.extraStars) || 0,
    media: needMedia() && (st.media.posts !== "" || st.media.line !== "") ? { posts: Number(st.media.posts) || 0, line: Number(st.media.line) || 0 } : null,
    todo: (st.todo || []).slice().sort((a, b) => (LV[a.lv] ?? 3) - (LV[b.lv] ?? 3)) });
}
async function exportImage(rows, late, dayChange, total) {
  const blob = await imageBlob(rows, late, dayChange, total);
  await shareOrDownload(blob, imgName());
}

// ---------- Thưởng nóng: popup chúc mừng có hoa ----------
async function celebrate(list) {
  const s = staffById(st.staffId) || {}, total = list.reduce((a, h) => a + h.stars, 0);
  const fx = document.createElement("div"); fx.className = "flowers"; fx.setAttribute("aria-hidden", "true");
  const em = ["🌸", "💐", "🌺", "🌼", "🎉", "✨", "🌷", "🎊"];
  fx.innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 1.8).toFixed(2)}s;animation-duration:${(3 + Math.random() * 2.5).toFixed(2)}s;font-size:${22 + Math.round(Math.random() * 22)}px">${em[i % em.length]}</i>`).join("");
  document.body.appendChild(fx);
  try {
    await modal(`<div class="hot-pop"><div class="hot-big">💐🎉</div><h3>CHÚC MỪNG ${esc((s.name || "").toUpperCase())}!</h3>
      <p>Bạn được đề xuất <b class="star">THƯỞNG NÓNG ${fmt(total)}⭐</b></p>
      <ul>${list.map((h) => `<li><b>${esc(h.item)}</b>: ${esc(h.reason)}</li>`).join("")}</ul>
      <p class="small muted">Sao được cộng khi quản lý duyệt. Cố lên nhé! 🔥</p></div>
      <div class="modal-actions"><button class="btn primary big" data-v="ok">Tuyệt vời! 🎊</button></div>`);
  } finally { fx.remove(); }
}
