// Trang Quản lý: duyệt, khoá sổ, nhân sự, môn thi đua, cài đặt, Telegram, phân quyền
import { $, $$, esc, fmt, sign, toast, modal, confirmBox, vnToday, dmy, dow, starHtml, norm, debounce, centerTab } from "../ui.js";
import { scoreAdmin, setScoreSub } from "./admin-score.js";
import { home } from "./admin-home.js";
import { starCardHtml, bindStarCard, dailyTarget, dailyPct, dailyMin } from "../star-rules.js";
import { suggestHtml, bindSuggest } from "./admin-suggest.js";
import { isAdmin, roleName } from "../roles.js";
import { sb, S, rpc, notify, callFn, onChange, isOwner, isManager, loadStaff, loadItems, loadSettings, loadLocked, loadPending, depts, staffById, setting, errMsg, roleLabel, visibleStaff } from "../store.js";

const TABS = [
  { id: "home", label: "🏠 Tổng quan" }, { id: "approve", label: "Duyệt" }, { id: "score", label: "Điểm & DT" }, { id: "lock", label: "Khoá sổ" }, { id: "staff", label: "Nhân sự" },
  { id: "items", label: "Môn & sao thưởng/phạt" }, { id: "targets", label: "Target NV", owner: true },
  { id: "accounts", label: "Tài khoản NV", owner: true }, { id: "settings", label: "Cài đặt", owner: true },
  { id: "telegram", label: "Telegram" }, { id: "members", label: "Phân quyền", owner: true }, { id: "audit", label: "Nhật ký", owner: true },
];
let tab = "home", root, offs = [];

export async function render(view) {
  root = view;
  view.innerHTML = `<div class="page-h"><div><h1>Quản lý</h1><p>Bắt đầu ở <b>🏠 Tổng quan</b>: việc cần làm, lịch quản lý và ô tìm chức năng</p></div></div>
    <div class="subtabs" id="aTabs"></div><div id="aBody"></div>`;
  $("#aTabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; draw(); } };
  offs.push(onChange((w) => {
    if ((tab === "approve" || tab === "home") && ["pending", "proposals", "changes"].includes(w)) draw();
    if (w === "pending") drawTabs();
    if (tab === "lock" && w === "locked") draw();
  }));
  draw();
  return () => { offs.forEach((f) => f()); offs = []; };
}
function drawTabs() {
  const n = (S.pending.proposals || 0) + (S.pending.changes || 0) + (S.pending.hot || 0);
  $("#aTabs").innerHTML = TABS.filter((t) => !t.owner || isOwner()).map((t) => `<button type="button" data-t="${t.id}" class="${t.id === tab ? "on" : ""}">${t.label}${t.id === "approve" && n ? ` <b class="badge">${n}</b>` : ""}</button>`).join("");
  centerTab($("#aTabs"));
}
async function draw() {
  if (!TABS.some((t) => t.id === tab && (!t.owner || isOwner()))) tab = "home";
  drawTabs();
  const body = $("#aBody"); body.onclick = null; body.innerHTML = `<div class="empty">Đang tải…</div>`;
  try { await ({ home: (b) => home(b, nav), approve, score: scoreAdmin, lock, staff, items, targets, accounts, settings, telegram, members, audit })[tab](body); }
  catch (e) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}
const err = (e) => toast(errMsg(e), 4500);
// Mở 1 chức năng từ Tổng quan: trang khác, hoặc tab (+ tab con, + cuộn tới khung) trong Quản lý
async function nav(go) {
  if (go.page) { if (go.cv) try { localStorage.setItem("thidua-v2-cv", go.cv); } catch { /* bỏ qua */ } document.querySelector(`#nav [data-page="${go.page}"]`)?.click(); return; }
  tab = go.tab; if (go.sub) setScoreSub(go.sub);
  await draw();
  const el = go.focus && document.querySelector(go.focus);
  if (el) { if (el.tagName === "DETAILS") el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); } else window.scrollTo(0, 0);
}

// ---------- Duyệt ----------
async function approve(body) {
  const [{ data: props, error: e1 }, { data: reqs, error: e2 }, { data: hots, error: e3 }] = await Promise.all([
    sb.from("extra_proposals").select("*").order("created_at", { ascending: false }).limit(60),
    sb.from("change_requests").select("*").order("created_at", { ascending: false }).limit(60),
    sb.from("hot_bonuses").select("*").order("created_at", { ascending: false }).limit(60),
  ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;
  const hp = hots.filter((h) => h.status === "Chờ duyệt"), hd = hots.filter((h) => h.status !== "Chờ duyệt").slice(0, 15);
  const pend = props.filter((p) => p.status === "Chờ duyệt"), done = props.filter((p) => p.status !== "Chờ duyệt").slice(0, 15);
  const rq = reqs.filter((r) => r.status === "pending"), rqDone = reqs.filter((r) => r.status !== "pending").slice(0, 10);
  body.innerHTML = `
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🔥 Thưởng nóng</h2><span class="pill ${hp.length ? "warn" : "ok"}">${hp.length} chờ duyệt</span></div>
      ${hp.length ? `<div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Môn</th><th>Lý do</th><th class="num">Sao</th><th></th></tr></thead><tbody>
      ${hp.map((h) => `<tr><td>${dmy(h.report_date)}</td><td>${esc(staffById(h.staff_id)?.name || h.staff_id)}</td><td><b>${esc(h.item_name)}</b></td><td class="small">${esc(h.reason)}</td>
        <td class="num"><input type="number" min="0" step="100" value="${h.stars}" data-hstars="${h.id}" style="width:90px;text-align:right"></td>
        <td class="num"><button class="btn small primary" data-hot="${h.id}" data-ok="1" type="button">Duyệt</button> <button class="btn small danger" data-hot="${h.id}" data-ok="0" type="button">Từ chối</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Không có thưởng nóng chờ duyệt. Điều kiện: môn đánh dấu “Target thấp” ở Quản lý → Môn & sao.</p>`}
      ${hd.length ? `<details style="margin-top:10px"><summary class="small muted">Đã xử lý gần đây</summary><div class="tbl-wrap" style="margin-top:8px"><table><tbody>${hd.map((h) => `<tr><td>${dmy(h.report_date)}</td><td>${esc(staffById(h.staff_id)?.name || h.staff_id)}</td><td>${esc(h.item_name)}</td><td class="num">${fmt(h.stars)}⭐</td><td>${h.status === "Đã duyệt" ? '<span class="pill ok">Đã duyệt</span>' : '<span class="pill bad">Từ chối</span>'}</td><td class="small muted">${esc(h.reviewed_by || "")}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    </div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🎁 Thưởng bán thêm ngoài thi đua</h2><span class="pill ${pend.length ? "warn" : "ok"}">${pend.length} chờ duyệt</span></div>
      ${pend.length ? `<div class="tbl-wrap"><table><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Nội dung</th><th class="num">Sao</th><th></th></tr></thead><tbody>
      ${pend.map((p) => `<tr><td>${dmy(p.report_date)}</td><td>${esc(staffById(p.staff_id)?.name || p.staff_name)}</td><td>${esc(p.content)}</td>
        <td class="num"><input type="number" min="0" step="50" value="${p.stars}" data-stars="${p.id}" style="width:90px;text-align:right"></td>
        <td class="num"><button class="btn small primary" data-prop="${p.id}" data-ok="1" type="button">Duyệt</button> <button class="btn small danger" data-prop="${p.id}" data-ok="0" type="button">Từ chối</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Không có đề xuất chờ duyệt.</p>`}
      ${done.length ? `<details style="margin-top:10px"><summary class="small muted">Đã xử lý gần đây</summary><div class="tbl-wrap" style="margin-top:8px"><table><tbody>${done.map((p) => `<tr><td>${dmy(p.report_date)}</td><td>${esc(p.staff_name)}</td><td>${esc(p.content)}</td><td class="num">${fmt(p.stars)}⭐</td><td><span class="pill ${p.status === "Đã duyệt" ? "ok" : "bad"}">${esc(p.status)}</span></td></tr>`).join("")}</tbody></table></div></details>` : ""}
    </div>
    <div class="card"><div class="card-h"><h2>✏️ Yêu cầu sửa báo cáo sau giờ chốt</h2><span class="pill ${rq.length ? "warn" : "ok"}">${rq.length} chờ duyệt</span></div>
      ${rq.length ? rq.map((r) => `<div class="card" style="margin-bottom:10px;box-shadow:none"><div class="row"><b class="grow">${esc(staffById(r.staff_id)?.name || r.staff_id)} · ${dow(r.report_date)} ${dmy(r.report_date)}</b><span class="tiny muted">${esc(r.email)} · ${new Date(r.created_at).toLocaleString("vi-VN")}</span></div>
        <p class="small" style="margin:6px 0">Lý do: <i>${esc(r.reason)}</i></p>
        <div class="chips">${(r.payload?.reports || []).map((x) => `<span class="chip">${esc(x.itemName)}: <b>${fmt(x.actual, 2)}</b>${x.compensation === "TANG_CA" ? " ⏰" : ""}</span>`).join("")}</div>
        ${r.payload?.extraItem ? `<p class="small">🎁 ${esc(r.payload.extraItem)} (${fmt(r.payload.extraStars)}⭐)</p>` : ""}
        <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn small danger" data-req="${r.id}" data-ok="0" type="button">Từ chối</button><button class="btn small primary" data-req="${r.id}" data-ok="1" type="button">Duyệt & cập nhật</button></div></div>`).join("") : `<p class="muted">Không có yêu cầu chờ duyệt.</p>`}
      ${rqDone.length ? `<details><summary class="small muted">Đã xử lý gần đây</summary><div class="tbl-wrap" style="margin-top:8px"><table><tbody>${rqDone.map((r) => `<tr><td>${dmy(r.report_date)}</td><td>${esc(staffById(r.staff_id)?.name || r.staff_id)}</td><td class="small">${esc(r.reason)}</td><td><span class="pill ${r.status === "approved" ? "ok" : "bad"}">${r.status === "approved" ? "Đã duyệt" : "Từ chối"}</span></td><td class="tiny muted">${esc(r.reviewed_by || "")}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    </div>`;
  body.onclick = async (e) => {
    const h = e.target.closest("[data-hot]");
    if (h) { h.disabled = true; try { const res = await rpc("review_hot_bonus", { p_id: Number(h.dataset.hot), p_approve: h.dataset.ok === "1", p_stars: Number($(`[data-hstars="${h.dataset.hot}"]`).value) || 0 }); toast(res.message); loadPending(); loadStaff(); approve(body); } catch (x) { err(x); h.disabled = false; } return; }
    const p = e.target.closest("[data-prop]");
    if (p) { try { await rpc("review_proposal", { p_id: Number(p.dataset.prop), p_approve: p.dataset.ok === "1", p_stars: Number($(`[data-stars="${p.dataset.prop}"]`).value) || 0 }); toast(p.dataset.ok === "1" ? "Đã duyệt" : "Đã từ chối"); loadPending(); approve(body); } catch (x) { err(x); } }
    const r = e.target.closest("[data-req]");
    if (r) { try { const res = await rpc("review_change", { p_id: r.dataset.req, p_approve: r.dataset.ok === "1" }); toast(res.message); loadPending(); approve(body); } catch (x) { err(x); } }
  };
}

// ---------- Khoá sổ ----------
async function lock(body) {
  const list = [...S.locked].sort().reverse();
  body.innerHTML = `<div class="card"><div class="card-h"><h2>🔒 Khoá chốt sổ</h2></div>
    <p class="muted small">Ngày đã khoá: nhân viên và quản lý không nộp/sửa trực tiếp được (chỉ qua yêu cầu sửa được duyệt). Chủ quản phải mở khoá trước khi sửa.</p>
    <div class="row" style="margin:10px 0"><input type="date" id="lkDate" max="${vnToday()}" value="${vnToday()}" style="width:auto"><button class="btn primary" id="lkAdd" type="button">Khoá ngày này</button>
      <button class="btn" id="lkWeek" type="button">Khoá 7 ngày trước hôm nay</button></div>
    ${list.length ? `<div class="chips">${list.slice(0, 120).map((d) => `<span class="chip">🔒 ${dow(d)} ${dmy(d)} <button class="btn small ghost" data-unlock="${d}" type="button" title="Mở khoá">✕</button></span>`).join("")}</div>` : `<p class="muted">Chưa khoá ngày nào.</p>`}</div>`;
  $("#lkAdd").onclick = async () => { const d = $("#lkDate").value; const { error } = await sb.from("locked_dates").upsert({ d, locked_by: S.me.email }); if (error) return err(error); toast("Đã khoá " + dmy(d)); await loadLocked(); lock(body); };
  $("#lkWeek").onclick = async () => {
    const rows = []; for (let i = 1; i <= 7; i++) { const x = new Date(Date.now() - i * 864e5); rows.push({ d: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(x), locked_by: S.me.email }); }
    const { error } = await sb.from("locked_dates").upsert(rows); if (error) return err(error); toast("Đã khoá 7 ngày"); await loadLocked(); lock(body);
  };
  body.onclick = async (e) => { const b = e.target.closest("[data-unlock]"); if (!b) return; const { error } = await sb.from("locked_dates").delete().eq("d", b.dataset.unlock); if (error) return err(error); toast("Đã mở khoá " + dmy(b.dataset.unlock)); await loadLocked(); lock(body); };
}

// ---------- Nhân sự ----------
async function staff(body) {
  const own = isOwner(), itemNames = [...new Set(S.items.map((i) => i.name))], today = vnToday();
  // F1b Nhân sự 360°: số liệu tháng từ staff_overview (báo cáo, nộp trễ, vi phạm, quyền vào tool)
  const ov = new Map(((await rpc("staff_overview", {}).catch(() => [])) || []).map((r) => [r.staff_id, r]));
  if (!body.isConnected) return;
  const yday = addDaysISO(today, -1);
  const repCell = (s, o) => {
    if (!o) return '<span class="muted">—</span>';
    if (s.hidden) return `<span class="muted">${o.report_days} ngày</span>`;   // NV đã ẩn (nghỉ): không cảnh báo
    const stale = !o.last_report || o.last_report < yday;   // quá 1 ngày chưa báo cáo
    return `<b>${o.report_days}</b> ngày${o.off_days ? ` <span class="tiny muted">· OFF ${o.off_days}</span>` : ""}<div class="tiny ${stale ? "neg" : "muted"}">${o.last_report === today ? "✅ hôm nay" : o.last_report ? `${stale ? "⚠️ " : ""}gần nhất ${dmy(o.last_report).slice(0, 5)}` : "⚠️ chưa báo cáo"}</div>`;
  };
  const list = [...S.staff].sort((a, b) => (a.hidden - b.hidden) || (a.dept || "").localeCompare(b.dept || "", "vi") || (a.sort || 0) - (b.sort || 0));
  body.innerHTML = `<div class="card"><div class="card-h"><h2>👥 Nhân sự & quỹ sao</h2>${own ? `<button class="btn small primary" id="sfAdd" type="button">+ Thêm nhân viên</button>` : ""}</div>
    <p class="small muted" style="margin:0 0 10px">Bấm tên để xem <b>hồ sơ 360°</b>. Số liệu tháng ${today.slice(5, 7)}: số ngày đã báo cáo, nộp trễ, vi phạm. Dòng đỏ = âm sao.</p>
    <div class="tbl-wrap"><table class="staff-tbl"><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Bộ phận</th><th class="num">Tổng sao</th><th>Báo cáo tháng</th><th class="num">Nộp trễ</th><th class="num">Vi phạm</th><th>Tài khoản</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${list.map((s) => { const o = ov.get(s.id), negStar = Number(s.total_star) < 0;
      return `<tr class="${s.hidden ? "muted" : ""}${negStar ? " neg-row" : ""}"><td>${esc(s.id)}</td>
      <td><button type="button" class="linkish" data-prof="${esc(s.id)}"><b>${esc(s.name)}</b></button>${s.assigned_items?.length ? `<div class="tiny muted">Môn riêng: ${esc(s.assigned_items.length)} môn</div>` : ""}</td><td>${esc(s.dept)}</td>
      <td class="num ${negStar ? "neg" : "star"}">${negStar ? "⚠️ " : ""}${fmt(s.total_star)}</td>
      <td class="small">${repCell(s, o)}</td>
      <td class="num">${o ? (o.late ? `<span class="pill warn">${o.late}</span>` : "0") : "—"}</td>
      <td class="num">${o ? (o.violations ? `<span class="pill bad">${o.violations}</span>` : "0") : "—"}</td>
      <td class="small">${o ? (o.has_access ? "✅ Có" : '<span class="neg">⛔ Chưa có</span>') : "—"}</td>
      <td>${s.hidden ? '<span class="pill mute">Đang ẩn</span>' : '<span class="pill ok">Hoạt động</span>'}</td>
      <td class="num"><button class="btn small" data-edit="${esc(s.id)}" type="button">${own ? "Sửa" : "Thao tác"}</button></td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  const edit = async (s) => {
    const isNew = !s;
    s = s || { id: "", name: "", dept: depts()[0] || "", total_star: 0, assigned_items: [], hidden: false };
    const v = await modal(`<h3>${isNew ? "Thêm nhân viên" : esc(s.name)}</h3><form class="stack">
      ${own ? `<div class="fields"><label>Mã NV<input name="id" value="${esc(s.id)}" ${isNew ? "required" : "disabled"}></label><label>Bộ phận<input name="dept" list="deptList" value="${esc(s.dept)}" required></label></div>
      <label>Họ và tên<input name="name" value="${esc(s.name)}" required></label>
      <label>Tổng sao hiện tại<input name="total" type="number" step="1" value="${s.total_star}"></label>
      <label>Môn riêng (bỏ trống = dùng bộ môn của bộ phận)<select name="assigned" multiple size="6">${itemNames.map((n) => `<option ${s.assigned_items?.includes(n) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="inline"><input type="checkbox" name="hidden" ${s.hidden ? "checked" : ""}> Ẩn nhân viên (đã nghỉ, giữ lịch sử)</label>
      <datalist id="deptList">${depts().map((d) => `<option>${esc(d)}</option>`).join("")}</datalist>` : `<p class="muted">Tổng sao: <b>${fmt(s.total_star)}⭐</b></p>`}
      </form><div class="modal-actions">${!isNew ? `<button class="btn" data-v="reset" type="button">↺ Reset chuỗi</button>` : ""}${own && !isNew ? `<button class="btn danger" data-v="delete" type="button">Xoá</button>` : ""}<span class="grow"></span><button class="btn" data-v="cancel">Huỷ</button>${own ? `<button class="btn primary" data-v="submit">Lưu</button>` : ""}</div>`,
      { onOpen: (b) => { const sel = b.querySelector("select[name=assigned]"); if (sel) sel.addEventListener("mousedown", (e) => { if (e.target.tagName === "OPTION") { e.preventDefault(); e.target.selected = !e.target.selected; } }); } });
    if (!v) return;
    try {
      if (v === "reset") { if (await confirmBox("Reset chuỗi?", `Chuỗi chưa về của <b>${esc(s.name)}</b> sẽ tính lại từ hôm nay.`, "Reset")) { await rpc("reset_streak", { p_staff: s.id }); toast("Đã reset chuỗi"); } return; }
      if (v === "delete") {
        if (!(await confirmBox("Xoá nhân viên?", `Xoá <b>${esc(s.name)}</b> sẽ xoá <b>toàn bộ lịch sử báo cáo</b> của người này. Nếu chỉ nghỉ việc, hãy dùng <b>Ẩn</b>.`, "Xoá vĩnh viễn", true))) return;
        const { error } = await sb.from("staff").delete().eq("id", s.id); if (error) throw error; toast("Đã xoá"); await loadStaff(); return staff(body);
      }
      const sel = $("#modalBody select[name=assigned]");
      const assigned = sel ? [...sel.selectedOptions].map((o) => o.value) : s.assigned_items;
      const row = { name: v.name.trim(), dept: v.dept.trim(), assigned_items: assigned, hidden: v.hidden === "on", updated_at: new Date().toISOString() };
      if (isNew) { const { error } = await sb.from("staff").insert({ id: v.id.trim(), ...row, base_star: Number(v.total) || 0, sort: S.staff.length + 1 }); if (error) throw error; }
      else {
        const { error } = await sb.from("staff").update(row).eq("id", s.id); if (error) throw error;
        if (Number(v.total) !== s.total_star) await rpc("set_staff_total", { p_staff: s.id, p_total: Number(v.total) || 0 });
      }
      toast("Đã lưu"); await loadStaff(); staff(body);
    } catch (x) { err(x); }
  };
  $("#sfAdd")?.addEventListener("click", () => edit(null));
  body.onclick = (e) => {
    const p = e.target.closest("[data-prof]"); if (p) return profile(staffById(p.dataset.prof), ov.get(p.dataset.prof), edit);
    const b = e.target.closest("[data-edit]"); if (b) edit(staffById(b.dataset.edit));
  };
}
const addDaysISO = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Hồ sơ 360° một nhân viên: sao, điểm xếp hạng tháng, báo cáo, vi phạm, lịch bận sắp tới → mở nhanh trang liên quan
async function profile(s, o, edit) {
  if (!s) return;
  const today = vnToday(), month = today.slice(0, 8) + "01", in7 = addDaysISO(today, 7);
  const [board, vio, busy] = await Promise.all([
    rpc("score_board", { p_from: month, p_to: today, p_full: false }).catch(() => []),
    sb.from("violations").select("v_date,v_time,type,note,points,photos").eq("staff_id", s.id).gte("v_date", month).order("v_date", { ascending: false }),
    sb.from("busy").select("busy_date,type,shifts").eq("staff_id", s.id).gte("busy_date", today).lte("busy_date", in7).order("busy_date"),
  ]);
  const r = (board || []).find((x) => x.staff_id === s.id), vl = vio.data || [], bl = busy.data || [];
  const tile = (l, v, sub = "") => `<div class="kpi-tile"><small>${l}</small><b>${v}</b>${sub ? `<span class="tiny muted">${sub}</span>` : ""}</div>`;
  const v = await modal(`<h3>👤 ${esc(s.name)}</h3>
    <p class="small muted" style="margin:-4px 0 12px">${esc(s.dept || "")} · Mã ${esc(s.id)} · ${s.hidden ? "Đang ẩn" : "Hoạt động"}${o ? ` · ${o.has_access ? "đã có quyền vào tool" : "⛔ chưa có quyền vào tool"}` : ""}</p>
    <div class="kpi-row prof-kpi">
      ${tile("Tổng sao", `${Number(s.total_star) < 0 ? "⚠️ " : ""}${fmt(s.total_star)}⭐`)}
      ${tile("Điểm xếp hạng tháng", r ? fmt(r.total, 1) : "—", r ? `hạng ${r.rank ?? "—"} · DT ${r.rev_pct != null ? Math.round(r.rev_pct) + "% so tiến độ" : "—"}` : "")}
      ${tile("Báo cáo tháng", o ? `${o.report_days} ngày` : "—", o ? `${o.last_report ? "gần nhất " + dmy(o.last_report).slice(0, 5) : "chưa báo cáo"}${o.off_days ? ` · OFF ${o.off_days}` : ""}` : "")}
      ${tile("Nộp trễ · Vi phạm", o ? `${o.late} · ${o.violations}` : "—", o && o.vio_points ? `−${fmt(o.vio_points, 1)} điểm` : "")}
    </div>
    <h4 style="margin:14px 0 6px">⚠️ Vi phạm tháng này (${vl.length})</h4>
    ${vl.length ? `<ul class="prof-list">${vl.slice(0, 5).map((x) => `<li><b>${dmy(x.v_date).slice(0, 5)}${x.v_time ? " " + String(x.v_time).slice(0, 5) : ""}</b> · ${esc(x.type)}${x.note ? ` <span class="muted">: ${esc(x.note)}</span>` : ""}${(x.photos || []).length ? " 📷" : ""}</li>`).join("")}</ul>` : `<p class="small muted">✅ Không có vi phạm.</p>`}
    <h4 style="margin:14px 0 6px">📅 Bận / OFF 7 ngày tới (${bl.length})</h4>
    ${bl.length ? `<ul class="prof-list">${bl.map((x) => `<li><b>${dmy(x.busy_date).slice(0, 5)}</b> · ${x.type === "OFF" ? "OFF" : "Bận ca " + (x.shifts || []).join(",")}</li>`).join("")}</ul>` : `<p class="small muted">Không đăng ký.</p>`}
    <p class="tiny muted" style="margin:10px 0 0">Môn: ${s.assigned_items?.length ? esc(s.assigned_items.join(", ")) : "theo bộ phận"} · Reset chuỗi: ${s.reset_date ? dmy(s.reset_date) : "—"}</p>
    <div class="modal-actions wrap"><button class="btn" data-v="me">📈 Trang cá nhân</button><button class="btn" data-v="report">📝 Báo cáo</button><button class="btn" data-v="vio">📄 Biên bản</button><button class="btn" data-v="edit">✏️ Sửa</button><span class="grow"></span><button class="btn" data-v="cancel">Đóng</button></div>`);
  const go = (page) => document.querySelector(`#nav [data-page="${page}"]`)?.click();
  try {
    if (v === "me") { localStorage.setItem("thidua-v2-me-staff", s.id); go("me"); }
    if (v === "report") { localStorage.setItem("thidua-v2-staff", s.id); go("report"); }
    if (v === "vio") { localStorage.setItem("thidua-v2-cv", "vio"); localStorage.setItem("thidua-v2-vio-who", s.id); go("cv"); }
  } catch { /* bỏ qua */ }
  if (v === "edit") edit(s);
}

// ---------- Môn thi đua ----------
// Chủ quản chọn giữa ⚡ Chỉnh nhanh (mặc định) và 📋 Bảng chi tiết; quản lý chỉ có Chỉnh nhanh cho bộ phận mình phụ trách
const viewSwitch = (cur) => isOwner() ? `<div class="subtabs it-view" id="itView"><button type="button" data-iv="quick" class="${cur === "quick" ? "on" : ""}">⚡ Chỉnh nhanh theo bộ phận</button><button type="button" data-iv="detail" class="${cur === "detail" ? "on" : ""}">📋 Bảng chi tiết (thêm/xoá môn, target, X2/X3)</button></div>` : "";
function bindViewSwitch(body) {
  $("#itView")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-iv]"); if (!b) return;
    try { localStorage.setItem("thidua-v2-itview", b.dataset.iv); } catch { /* bỏ qua */ }
    items(body);
  });
}
async function items(body) {
  let view = "quick"; try { view = localStorage.getItem("thidua-v2-itview") || "quick"; } catch { /* bỏ qua */ }
  if (!isOwner() || view !== "detail") return itemsQuick(body);
  const stores = ["Chung", ...depts()];
  let F = { ch: "", st: "", q: "" }; try { F = { ...F, ...JSON.parse(localStorage.getItem("thidua-v2-itfilter") || "{}") }; } catch { /* bỏ qua */ }
  const chans = [...new Set([...stores, ...S.items.map((i) => i.store)])];
  // Môn thi đua tháng này: NV báo cáo theo target tháng (÷ số ngày làm × DAILY_TARGET_PCT), không theo ô Target/ngày
  const ym = vnToday().slice(0, 7), mts = (await sb.from("monthly_targets").select("staff_id,items,work_days").eq("month", ym + "-01")).data || [];
  const dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(), defWd = Math.max(1, dim - Number(setting("DAYS_OFF", 4)));
  const staffMt = new Map(mts.filter((t) => (t.items || []).length).map((t) => [t.staff_id, t]));
  const monthInfo = (it) => {
    const people = S.staff.filter((x) => !x.hidden && staffMt.has(x.id) && (x.dept === it.store || (it.store === "Chung" && !S.items.some((o) => o.name === it.name && o.store === x.dept))));
    const hit = people.map((x) => { const t = staffMt.get(x.id), e = t.items.find((y) => y.name === it.name); return e ? dailyTarget(Number(e.target) / (t.work_days || defWd)) : null; }).filter((v) => v != null);
    if (hit.length) return { m: 1, lo: Math.min(...hit), hi: Math.max(...hit), n: hit.length };
    return people.length ? { m: 0 } : { m: "" };   // m: 1 môn tháng · 0 ngoài môn tháng (NV không báo cáo) · "" bộ phận chưa giao môn tháng
  };
  if (F.ch && !chans.includes(F.ch)) F.ch = "";
  body.innerHTML = `${viewSwitch("detail")}${suggestHtml()}<div class="card"><div class="card-h"><h2>📋 Danh mục môn thi đua</h2>
      <div class="row it-filter"><select id="itCh" style="width:auto" title="Lọc theo kênh / bộ phận áp dụng"><option value="">🔎 Tất cả kênh</option>${chans.map((c) => `<option value="${esc(c)}" ${c === F.ch ? "selected" : ""}>${esc(c)} (${S.items.filter((i) => i.store === c).length})</option>`).join("")}</select>
        <select id="itSt" style="width:auto"><option value="">Bật + tắt</option><option value="on" ${F.st === "on" ? "selected" : ""}>Đang bật</option><option value="off" ${F.st === "off" ? "selected" : ""}>Đang tắt</option><option value="month" ${F.st === "month" ? "selected" : ""}>📅 Môn tháng này</option><option value="out" ${F.st === "out" ? "selected" : ""}>Ngoài môn tháng</option></select>
        <input id="itQ" placeholder="Tìm tên môn…" value="${esc(F.q)}" style="width:150px"></div>
      <button class="btn small" id="itAdd" type="button">+ Thêm môn</button><button class="btn small primary" id="itSave" type="button">💾 Lưu tất cả</button></div>
    <div class="banner info"><div><b>Khai báo môn, target, sao thưởng, sao phạt</b>
      • <b>Áp dụng</b>: “Chung” = mọi bộ phận; chọn bộ phận để môn chỉ áp dụng cho bộ phận đó (trùng tên thì ưu tiên môn của bộ phận).<br>
      • <b>Target/ngày</b>: số cần đạt mỗi ngày để <i>Về số</i>. • <b>Sao thưởng</b>: cộng khi đạt ≥ 100% target. <b>Nhân sao</b>: môn X2 đạt ≥ ${fmt(setting("DOUBLE_BONUS_RATE", 150))}% → ×2; môn X3 đạt ≥ ${fmt(setting("DOUBLE_BONUS_RATE", 150))}% → ×2, ≥ ${fmt(setting("TRIPLE_BONUS_RATE", 200))}% → ×3.<br>
      • <b>Sao phạt</b>: số sao trừ khi chưa đạt nhiều ngày liền (mốc bắt đầu trừ, tăng ca, hệ số lũy tiến: <b>Cài đặt → Thưởng & trừ sao</b>).<br>
      • <b>📅 Môn tháng</b> (đã dán / giao target tháng): NV báo cáo theo <b>target tháng ÷ số ngày làm × ${dailyPct()}%</b> (tối thiểu ${dailyMin()}) — ô Target/ngày chỉ để tham khảo; sao thưởng/phạt và ô <b>Bật</b> vẫn theo bảng này. Môn <b>“Ngoài môn tháng”</b> thì NV không báo cáo dù đang Bật.<br>
      • Target/sao <b>riêng từng nhân viên</b>: tab <b>Target NV</b>. Giao môn riêng cho nhân viên: tab <b>Nhân sự</b> → Sửa → Môn riêng.</div></div>
    <div class="row it-bulk"><span class="small muted" id="itCount"></span><span class="grow"></span><button class="btn small" id="itAllOn" type="button">☑️ Bật tất cả đang hiện</button><button class="btn small" id="itAllOff" type="button">⬜ Tắt tất cả đang hiện</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Thứ tự</th><th>Áp dụng</th><th>Tên môn</th><th class="num">Target/ngày</th><th class="num">Sao thưởng</th><th class="num">Sao phạt</th><th>Nhân sao</th><th>Bật</th><th></th></tr></thead><tbody id="itRows">
    ${S.items.map((i) => row(i)).join("")}</tbody></table></div></div>`;
  function row(i) {
    const mi = i.id ? monthInfo(i) : { m: "" };
    return `<tr data-id="${i.id || ""}" data-month="${mi.m}"><td><input type="number" name="sort" value="${i.sort}" style="width:64px"></td>
      <td><select name="store">${[...new Set([...stores, i.store])].map((s) => `<option ${s === i.store ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></td>
      <td><input name="name" value="${esc(i.name)}" required style="min-width:180px">${mi.m === 1 ? `<div class="tiny"><span class="pill info">📅 Môn tháng ${ym.slice(5)}</span> ${mi.n} NV</div>` : mi.m === 0 ? `<div class="tiny"><span class="pill mute" title="Bộ phận đã có môn thi đua tháng; môn này không nằm trong đó nên NV không báo cáo dù đang Bật">Ngoài môn tháng — NV không báo cáo</span></div>` : ""}</td>
      <td><input type="number" name="target" min="0.01" step="any" value="${i.target}" style="width:90px;text-align:right" ${mi.m === 1 ? `readonly class="ro" title="Môn tháng: target báo cáo ngày = target tháng ÷ số ngày làm × ${dailyPct()}% (tối thiểu ${dailyMin()}). Sửa ở Điểm & DT → Target tháng"` : ""}>${mi.m === 1 ? `<div class="tiny muted" style="text-align:right">NV báo cáo: <b>${mi.lo === mi.hi ? fmt(mi.lo, 2) : `${fmt(mi.lo, 2)}–${fmt(mi.hi, 2)}`}</b>/ngày</div>` : ""}</td>
      <td><input type="number" name="bonus_star" step="10" value="${i.bonus_star}" style="width:90px;text-align:right"></td>
      <td><input type="number" name="penalty_star" step="10" value="${i.penalty_star}" style="width:90px;text-align:right"></td>
      <td><select name="mult" style="width:auto"><option value="">—</option><option value="x2" ${i.is_x2 && !i.is_x3 ? "selected" : ""}>X2</option><option value="x3" ${i.is_x3 ? "selected" : ""}>X3</option></select></td><td><input type="checkbox" name="active" ${i.active !== false ? "checked" : ""}></td>
      <td><button class="btn small ghost danger" data-del type="button">🗑️</button></td></tr>`;
  }
  bindSuggest(() => items(body)); bindViewSwitch(body);
  // Lọc theo kênh / trạng thái / tên: chỉ ẩn dòng, "Lưu tất cả" vẫn lưu mọi môn
  const applyFilter = () => {
    const q = F.q.trim().toLowerCase(); let n = 0;
    $$("#itRows tr").forEach((tr) => {
      const ch = tr.querySelector("[name=store]").value, on = tr.querySelector("[name=active]").checked, nm = tr.querySelector("[name=name]").value.toLowerCase();
      const mo = tr.dataset.month, stOk = !F.st || (F.st === "on" && on) || (F.st === "off" && !on) || (F.st === "month" && mo === "1") || (F.st === "out" && mo === "0");
      const show = !tr.dataset.id || ((!F.ch || ch === F.ch) && stOk && (!q || nm.includes(q)));
      tr.hidden = !show; if (show) n++;
    });
    $("#itCount").textContent = `Đang hiện ${n}/${$$("#itRows tr").length} môn${F.ch ? ` · kênh ${F.ch}` : ""}${F.st ? ` · ${{ on: "đang bật", off: "đang tắt", month: "môn tháng này", out: "ngoài môn tháng" }[F.st]}` : ""} — sửa xong bấm 💾 Lưu tất cả`;
    try { localStorage.setItem("thidua-v2-itfilter", JSON.stringify(F)); } catch { /* bỏ qua */ }
  };
  $("#itCh").onchange = (e) => { F.ch = e.target.value; applyFilter(); };
  $("#itSt").onchange = (e) => { F.st = e.target.value; applyFilter(); };
  $("#itQ").oninput = (e) => { F.q = e.target.value; applyFilter(); };
  const bulk = (on) => { $$("#itRows tr:not([hidden]) [name=active]").forEach((c) => { c.checked = on; c.closest("tr").classList.add("dirty"); }); toast(`${on ? "Đã tick bật" : "Đã bỏ tick"} các môn đang hiện — bấm 💾 Lưu tất cả để lưu`); };
  $("#itAllOn").onclick = () => bulk(true); $("#itAllOff").onclick = () => bulk(false);
  $("#itRows").addEventListener("change", (e) => { e.target.closest("tr")?.classList.add("dirty"); });
  applyFilter();
  $("#itAdd").onclick = () => { $("#itRows").insertAdjacentHTML("beforeend", row({ id: "", store: F.ch || "Chung", name: "", target: 1, bonus_star: 200, penalty_star: 100, is_x2: false, is_x3: false, active: true, sort: S.items.length + 1 })); $("#itRows tr:last-child input[name=name]").focus(); };
  body.onclick = async (e) => {
    const d = e.target.closest("[data-del]"); if (!d) return;
    const tr = d.closest("tr"), id = tr.dataset.id;
    if (!id) return tr.remove();
    if (!(await confirmBox("Xoá môn?", "Lịch sử báo cáo của môn này vẫn được giữ. Nếu chỉ tạm ngừng, hãy bỏ tick “Bật”.", "Xoá", true))) return;
    const { error } = await sb.from("items").delete().eq("id", id); if (error) return err(error);
    toast("Đã xoá môn"); await loadItems(); items(body);
  };
  $("#itSave").onclick = async () => {
    const rows = $$("#itRows tr").map((tr) => {
      const g = (n) => tr.querySelector(`[name=${n}]`);
      return { id: tr.dataset.id ? Number(tr.dataset.id) : null, sort: Number(g("sort").value) || 0, store: g("store").value, name: g("name").value.trim(), target: Number(g("target").value) || 1,
        bonus_star: Math.round(Number(g("bonus_star").value) || 0), penalty_star: Math.round(Number(g("penalty_star").value) || 0), is_x2: g("mult").value !== "", is_x3: g("mult").value === "x3", active: g("active").checked };
    }).filter((r) => r.name);
    const keys = rows.map((r) => r.store + "|" + r.name);
    if (new Set(keys).size !== keys.length) return toast("Có môn bị trùng tên trong cùng nhóm áp dụng");
    try {
      for (const r of rows) {
        const { id, ...data } = r;
        const { error } = id ? await sb.from("items").update(data).eq("id", id) : await sb.from("items").insert(data);
        if (error) throw error;
      }
      toast("Đã lưu danh mục môn"); await loadItems(); items(body);
    } catch (x) { err(x); }
  };
}

// ⚡ Chỉnh nhanh: mỗi môn 1 dòng, mỗi bộ phận 1 cột (+sao / −sao / Bật). Sửa là tự lưu qua items_quick_save.
// Ô "theo Chung" = bộ phận chưa có mức riêng; sửa ô đó sẽ tạo mức riêng (↺ để bỏ). Ô "Chưa áp dụng" = bộ phận không có môn này.
async function itemsQuick(body) {
  const own = isOwner(), mine = own ? null : (S.me?.stores || []);
  const hasChung = S.items.some((i) => i.store === "Chung");
  const deptCols = [...new Set([...depts(), ...(own ? S.items.map((i) => i.store).filter((s) => s !== "Chung") : [])])].sort((a, b) => a.localeCompare(b, "vi"));
  const cols = [...(own && hasChung ? ["Chung"] : []), ...deptCols.filter((d) => own || mine.includes(d))];
  let q = ""; try { q = localStorage.getItem("thidua-v2-itq") || ""; } catch { /* bỏ qua */ }
  const names = () => [...new Map([...S.items].sort((a, b) => a.sort - b.sort || a.id - b.id).map((i) => [i.name, 1])).keys()];
  const row = (s, n) => S.items.find((i) => i.store === s && i.name === n);
  const cell = (s, n) => { const r = row(s, n); if (r) return { ...r, src: "own" }; const c = s !== "Chung" && row("Chung", n); return c ? { ...c, src: "inh" } : null; };
  const sel = (s, n) => `td.qc[data-s="${CSS.escape(s)}"][data-n="${CSS.escape(n)}"]`;
  const cellHtml = (s, n) => {
    const c = cell(s, n), off = !c || c.active === false, zero = !!c && Number(c.penalty_star) <= 0;
    return `<td class="qc ${c ? c.src : "na"}${off ? " off" : ""}${zero ? " zero" : ""}" data-s="${esc(s)}" data-n="${esc(n)}">
      <div class="qc-top"><label class="sw" title="Bật/Tắt môn này cho ${esc(s)}"><input type="checkbox" data-f="active" ${off ? "" : "checked"} aria-label="Bật ${esc(n)} cho ${esc(s)}"><span></span></label>
        ${c?.src === "own" && s !== "Chung" && row("Chung", n) ? `<button type="button" class="qreset" data-reset title="Bỏ mức riêng của ${esc(s)}, dùng lại mức Chung">↺</button>` : ""}</div>
      ${c ? `<div class="qv"><span class="pos">+</span><input type="number" data-f="bonus" min="0" step="10" inputmode="numeric" value="${esc(c.bonus_star)}" aria-label="Sao thưởng ${esc(n)} ${esc(s)}"><span class="neg">−</span><input type="number" data-f="penalty" min="0" step="10" inputmode="numeric" value="${esc(c.penalty_star)}" aria-label="Sao phạt ${esc(n)} ${esc(s)}"></div>
      <div class="tiny qc-note">${c.src === "inh" ? "theo Chung" : zero ? "không trừ sao" : ""}</div>` : `<div class="tiny muted">Chưa áp dụng · bật để thêm</div>`}</td>`;
  };
  body.innerHTML = `${viewSwitch("quick")}${own ? suggestHtml() : ""}<div class="card"><div class="card-h"><h2>⚡ Môn & sao: chỉnh nhanh</h2>
      <div class="row it-filter"><input id="qQ" placeholder="Tìm tên môn…" value="${esc(q)}" style="width:170px"></div></div>
    <div class="banner info"><div><b>Sửa là tự lưu.</b> Mỗi cột là 1 bộ phận: <b class="pos">+</b> sao thưởng · <b class="neg">−</b> sao phạt · công tắc <b>Bật/Tắt</b> (tắt = môn không hiện trong báo cáo của bộ phận đó).<br>
      • Sao phạt <b>0</b> = <b>không trừ sao</b>: môn nằm cuối form báo cáo, tô màu xanh.${hasChung ? "<br>• Ô chữ nghiêng “theo Chung” = bộ phận đang dùng mức của cột Chung; sửa ô đó sẽ tạo mức riêng, bấm ↺ để quay về mức Chung." : ""}
      ${own ? "<br>• Thêm/xoá môn, target, X2/X3, thứ tự: chuyển sang <b>📋 Bảng chi tiết</b>." : `<br>• Bạn chỉnh được: <b>${esc(cols.join(", ") || "chưa được giao bộ phận nào")}</b>.`}</div></div>
    ${cols.length ? `<div class="row it-bulk"><span class="small muted" id="qCount"></span><span class="grow"></span><span class="small" id="qState"></span></div>
    <div class="tbl-wrap"><table class="qtbl nosort"><thead><tr><th class="qn">Môn</th>${cols.map((s) => `<th class="qh">${esc(s)}<div class="qh-act"><button type="button" class="btn small" data-col="${esc(s)}" data-on="1">Bật hết</button><button type="button" class="btn small ghost" data-col="${esc(s)}" data-on="0">Tắt hết</button></div></th>`).join("")}</tr></thead>
      <tbody id="qRows"></tbody></table></div>` : `<div class="banner warn"><div>Tài khoản của bạn chưa được giao bộ phận nào. Nhờ chủ quản cấp ở Quản lý → Phân quyền.</div></div>`}</div>`;
  if (own) bindSuggest(() => items(body));
  bindViewSwitch(body);
  if (!cols.length) return;
  const setState = (t) => { const el = $("#qState"); if (el) el.textContent = t; };
  const drawRows = () => {
    const f = norm(q), all = names(), list = all.filter((n) => !f || norm(n).includes(f));
    $("#qRows").innerHTML = list.map((n) => { const a = S.items.find((i) => i.name === n);
      return `<tr><td class="qn"><b>${esc(n)}</b>${a?.is_x3 ? ' <span class="pill star">X3</span>' : a?.is_x2 ? ' <span class="pill star">X2</span>' : ""}</td>${cols.map((s) => cellHtml(s, n)).join("")}</tr>`; }).join("")
      || `<tr><td colspan="${cols.length + 1}" class="muted">Không có môn phù hợp.</td></tr>`;
    $("#qCount").textContent = `Đang hiện ${list.length}/${all.length} môn`;
  };
  // Hàng chờ lưu: gom các ô vừa sửa, lưu 1 lần; ô đang gõ không bị vẽ lại để không mất chữ
  const pending = new Map(); let saving = false;
  const refreshCell = (s, n) => {
    const td = $(sel(s, n)); if (!td) return;
    const a = document.activeElement, typing = td.contains(a) && a.matches("input[type=number]");
    if (typing) { const c = cell(s, n); td.classList.remove("dirty", "inh", "na", "own"); td.classList.add(c ? c.src : "na"); td.classList.toggle("zero", !!c && Number(c.penalty_star) <= 0); return; }
    const refocus = td.contains(a) ? a.dataset.f : null;
    td.outerHTML = cellHtml(s, n);
    if (refocus) $(sel(s, n))?.querySelector(`[data-f=${refocus}]`)?.focus();
  };
  const flush = async () => {
    if (saving || !pending.size) return;
    saving = true; const changes = [...pending.values()]; pending.clear(); setState("⏳ Đang lưu…");
    try {
      const r = await rpc("items_quick_save", { p_changes: changes });
      await loadItems(); if (!$("#qRows")) return;
      changes.forEach((c) => refreshCell(c.store, c.name)); setState("✅ " + r.message);
    } catch (e) {
      err(e); await loadItems().catch(() => {}); if (!$("#qRows")) return;
      changes.forEach((c) => refreshCell(c.store, c.name)); setState("⚠️ Chưa lưu được, đã hiện lại số cũ");
    } finally { saving = false; if (pending.size) flush(); }
  };
  const later = debounce(flush, 700);
  const queue = (td) => {
    const g = (f) => td.querySelector(`[data-f=${f}]`), ch = { store: td.dataset.s, name: td.dataset.n, active: g("active").checked };
    const b = g("bonus"), p = g("penalty");
    if (b && b.value !== "" && Number(b.value) >= 0) ch.bonus = Math.round(Number(b.value));
    if (p && p.value !== "" && Number(p.value) >= 0) ch.penalty = Math.round(Number(p.value));
    pending.set(ch.store + "|" + ch.name, ch); td.classList.add("dirty"); setState("✏️ Chưa lưu…");
  };
  drawRows();
  $("#qQ").oninput = debounce((e) => { q = e.target.value; try { localStorage.setItem("thidua-v2-itq", q); } catch { /* bỏ qua */ } drawRows(); }, 200);
  const rows = $("#qRows");
  rows.addEventListener("input", (e) => { const td = e.target.closest("td.qc"); if (td && e.target.matches("input[type=number]")) { queue(td); later(); } });
  // Rời ô đã lưu xong → vẽ lại ô (cập nhật ghi chú "theo Chung"/"không trừ sao", nút ↺)
  rows.addEventListener("focusout", (e) => {
    const td = e.target.closest("td.qc"); if (!td) return;
    setTimeout(() => { if (td.isConnected && !td.contains(document.activeElement) && !pending.has(td.dataset.s + "|" + td.dataset.n) && !saving) refreshCell(td.dataset.s, td.dataset.n); }, 0);
  });
  rows.addEventListener("change", (e) => {
    const td = e.target.closest("td.qc"); if (!td || !e.target.matches("[data-f=active]")) return;
    td.classList.toggle("off", !e.target.checked); queue(td); flush();
  });
  rows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-reset]"); if (!b) return; const td = b.closest("td.qc");
    pending.set(td.dataset.s + "|" + td.dataset.n, { store: td.dataset.s, name: td.dataset.n, reset: true }); flush();
  });
  body.querySelector(".qtbl thead").onclick = (e) => {
    const b = e.target.closest("[data-col]"); if (!b) return; const on = b.dataset.on === "1"; let n = 0;
    // "Bật hết" chỉ bật môn bộ phận đang có (không tự thêm môn "Chưa áp dụng")
    $$(`#qRows td.qc:not(.na)[data-s="${CSS.escape(b.dataset.col)}"]`).forEach((td) => {
      const c = td.querySelector("[data-f=active]"); if (c.checked === on) return;
      c.checked = on; td.classList.toggle("off", !on); queue(td); n++;
    });
    if (n) flush(); else toast(on ? "Các môn đang hiện đã bật hết" : "Các môn đang hiện đã tắt hết");
  };
}


// ---------- Target riêng từng nhân viên ----------
let tgField = "target";
async function targets(body) {
  const { data: rows, error } = await sb.from("staff_targets").select("*");
  if (error) throw error;
  const ov = new Map(rows.map((r) => [r.staff_id + "|" + r.item_name, r]));
  const staffList = visibleStaff();
  const itemsFor = (s) => { const list = S.items.filter((i) => i.active && (s.assigned_items?.length ? s.assigned_items.includes(i.name) : i.store === "Chung" || i.store.toLowerCase() === (s.dept || "").toLowerCase()));
    const m = new Map(); for (const i of list) if (!m.has(i.name) || i.store === s.dept) m.set(i.name, i); return m; };
  const names = [...new Set(S.items.filter((i) => i.active).sort((a, b) => a.sort - b.sort).map((i) => i.name))];
  const label = { target: "Target/ngày", bonus_star: "Sao thưởng", penalty_star: "Sao phạt" };
  body.innerHTML = `<div class="card"><div class="card-h"><h2>🎯 Target & sao riêng từng nhân viên</h2>
      <div class="seg" id="tgField">${Object.entries(label).map(([k, l]) => `<button type="button" data-f="${k}" class="${k === tgField ? "on" : ""}">${l}</button>`).join("")}</div>
      <button class="btn small primary" id="tgSave" type="button">💾 Lưu</button></div>
    <p class="small muted">Ô trống = dùng mức chung của môn (số mờ). Nhập số để đặt riêng cho nhân viên đó; xoá số để quay về mức chung. Ô gạch = môn không áp dụng cho nhân viên.<br>Nhân viên <b>đã được giao môn thi đua tháng</b> (Điểm & DT → Target tháng) báo cáo ngày theo môn thi đua, target ngày = target tháng ÷ số ngày làm việc; bảng này khi đó chỉ còn tác dụng với sao thưởng/phạt.</p>
    <div class="tbl-wrap"><table class="matrix"><thead><tr><th>Nhân viên</th>${names.map((n) => `<th class="num">${esc(n)}</th>`).join("")}</tr></thead><tbody>
    ${staffList.map((s) => { const m = itemsFor(s); return `<tr><td><b>${esc(s.name)}</b><div class="tiny muted">${esc(s.dept)}</div></td>${names.map((n) => { const it = m.get(n); if (!it) return `<td class="num muted">—</td>`;
      const o = ov.get(s.id + "|" + n), v = o?.[tgField]; return `<td class="num ${v != null ? "has" : ""}"><input type="number" step="any" min="0" data-k="${esc(s.id)}|${esc(n)}" value="${v ?? ""}" placeholder="${fmt(it[tgField], 2)}"></td>`; }).join("")}</tr>`; }).join("")}
    </tbody></table></div></div>`;
  $("#tgField").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { tgField = b.dataset.f; targets(body); } };
  $("#tgSave").onclick = async () => {
    const ups = [], dels = [];
    $$("input[data-k]", body).forEach((inp) => {
      const [sid, item] = inp.dataset.k.split("|"), cur = ov.get(sid + "|" + item) || { staff_id: sid, item_name: item, target: null, bonus_star: null, penalty_star: null };
      const val = inp.value === "" ? null : Number(inp.value);
      if ((cur[tgField] ?? null) === val) return;
      const next = { staff_id: sid, item_name: item, target: cur.target ?? null, bonus_star: cur.bonus_star ?? null, penalty_star: cur.penalty_star ?? null, [tgField]: tgField === "target" ? val : val == null ? null : Math.round(val), updated_at: new Date().toISOString() };
      if (next.target == null && next.bonus_star == null && next.penalty_star == null) dels.push([sid, item]); else ups.push(next);
    });
    try {
      if (ups.length) { const { error: e1 } = await sb.from("staff_targets").upsert(ups); if (e1) throw e1; }
      for (const [sid, item] of dels) { const { error: e2 } = await sb.from("staff_targets").delete().eq("staff_id", sid).eq("item_name", item); if (e2) throw e2; }
      toast(ups.length + dels.length ? `Đã lưu ${ups.length + dels.length} thay đổi` : "Không có thay đổi"); targets(body);
    } catch (x) { err(x); }
  };
}

// ---------- Tài khoản đăng nhập của nhân viên ----------
async function accounts(body) {
  body.innerHTML = `<div class="empty">Đang tải danh sách tài khoản…</div>`;
  const r = await callFn("accounts", { mode: "list" });
  const list = r.accounts.filter((a) => !a.hidden);
  const missing = list.filter((a) => !a.has_login).length;
  body.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🔑 Nhân viên đăng nhập thế nào?</h2></div>
      <ol class="small" style="margin:0;padding-left:18px;line-height:1.8"><li>Chủ quản tạo tài khoản ở đây (từng người hoặc tất cả) với <b>mật khẩu ban đầu</b>.</li>
      <li>Nhân viên mở link tool → ô <b>Email hoặc Mã nhân viên</b> nhập <b>mã NV</b> (VD 18450) + mật khẩu ban đầu.</li>
      <li>Lần đầu đăng nhập, tool bắt đổi mật khẩu riêng. Quên mật khẩu → chủ quản đặt lại ở đây.</li></ol>
      <p class="small muted" style="margin:8px 0 0">Nhân viên chỉ thấy và báo cáo cho chính mình. Quản lý / chủ quản vẫn đăng nhập bằng email.</p></div>
    ${!isAdmin() ? `<div class="banner info" style="margin-bottom:14px"><div>🔐 Chỉ Admin tạo tài khoản / đặt mật khẩu.</div></div>` : ""}<div class="card" style="margin-bottom:14px" ${isAdmin() ? "" : "hidden"}><div class="card-h"><h3>Tạo tài khoản cho tất cả nhân viên chưa có (${missing})</h3></div>
      <div class="row"><input id="acPw" type="text" placeholder="Mật khẩu ban đầu (ít nhất 6 ký tự)" style="width:auto" class="grow" autocomplete="off"><button class="btn primary" id="acBulk" type="button" ${missing ? "" : "disabled"}>Tạo tài khoản</button></div></div>
    <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Đăng nhập bằng</th><th>Vai trò</th><th>Lần đăng nhập gần nhất</th><th></th></tr></thead><tbody>
    ${list.map((a) => `<tr><td>${esc(a.staff_id)}</td><td><b>${esc(a.name)}</b></td><td>${a.has_login ? (a.by_code ? `<span class="pill ok">Mã NV ${esc(a.staff_id)}</span>` : `<span class="pill info">${esc(a.email)}</span>`) : '<span class="pill mute">Chưa có tài khoản</span>'}</td>
      <td class="small">${a.role ? roleLabel(a.role) : ""}${a.active === false ? " (khoá)" : ""}</td><td class="small muted">${a.last_sign_in ? new Date(a.last_sign_in).toLocaleString("vi-VN") : "—"}</td>
      <td class="num">${isAdmin() ? `<button class="btn small" data-ac="${esc(a.staff_id)}" type="button">${a.has_login ? "Đặt lại mật khẩu" : "Tạo tài khoản"}</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  $("#acBulk").onclick = async (e) => {
    const pw = $("#acPw").value.trim(); if (pw.length < 6) return toast("Mật khẩu ít nhất 6 ký tự");
    e.target.disabled = true;
    try { const x = await callFn("accounts", { mode: "bulk", password: pw }); toast(x.message, 4000); accounts(body); } catch (x) { err(x); e.target.disabled = false; }
  };
  body.onclick = async (e) => {
    const b = e.target.closest("[data-ac]"); if (!b) return;
    const a = list.find((x) => x.staff_id === b.dataset.ac);
    const v = await modal(`<h3>${esc(a.name)} · mã ${esc(a.staff_id)}</h3><form class="stack"><label>Mật khẩu ${a.has_login ? "mới" : "ban đầu"} (ít nhất 6 ký tự)<input name="pw" minlength="6" required autocomplete="off"></label>
      <p class="small muted">Nhân viên đăng nhập bằng ${a.has_login && !a.by_code ? "email " + esc(a.email) : "mã NV " + esc(a.staff_id)} và sẽ được yêu cầu đổi mật khẩu khi đăng nhập.</p></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
    if (!v) return;
    try { const x = await callFn("accounts", { mode: "set_password", staff_id: a.staff_id, password: v.pw }); toast(x.message, 4500); accounts(body); } catch (x) { err(x); }
  };
}

// ---------- Cài đặt ----------
const NUM_SETTINGS = [
  ["DAILY_TARGET_PCT", "Báo cáo ngày: % target (so với target tháng ÷ số ngày)", "NV đã giao môn tháng: target báo cáo ngày = % này × target tháng ÷ số ngày làm việc. Xếp hạng thi đua vẫn theo target tháng"],
  ["DAILY_TARGET_MIN", "Báo cáo ngày: target tối thiểu", "Target báo cáo ngày làm tròn lên, không nhỏ hơn số này"],
  ["HELP_DELAY_S", "Gợi ý tự hiện: số giây rê chuột", "Rê chuột lên một mục bao lâu thì hiện bong bóng hướng dẫn (điện thoại: nhấn giữ 0,8 giây)"],
  ["LATE_STEP", "Sao phạt nộp trễ mỗi lần", "Lần N trong tháng bị trừ N × số này"],
  ["TIKTOK_REWARD", "TikTok: sao thưởng nộp trước hạn", "Nộp trước ngày hạn được thưởng; đúng ngày hạn không thưởng không trừ"], ["TIKTOK_PENALTY", "TikTok: sao phạt mỗi ngày trễ", ""], ["TIKTOK_MIN_LINKS", "TikTok: số link tối thiểu", ""], ["TIKTOK_FB_MIN", "TikTok: số link Facebook tối thiểu", ""],
  ["BUSY_MAX_WEEKDAY", "Lịch bận: tối đa người/ngày (T2–T6)", ""], ["RS_MIN_KM", "Roadshow: km tối thiểu", ""], ["RS_MIN_MIN", "Roadshow: phút tối thiểu", ""],
  ["W_REVENUE", "Xếp hạng: trọng số Doanh thu", "Điểm tối đa phần doanh thu"], ["W_CONTEST", "Xếp hạng: trọng số Thi đua", ""], ["W_SERVICE", "Xếp hạng: trọng số Phục vụ", ""], ["VIOLATION_POINTS", "Xếp hạng: điểm trừ mỗi lỗi", ""],
];
export const FEATURES = [
  ["today", "🏠 Hôm nay (việc cần làm, nộp ảnh)"], ["jobs", "📋 Giao việc (với quản lý)"], ["cv.nav", "· Tab CV trên thanh menu (ẩn: NV vào từng chức năng từ 🏠 Hôm nay)"],
  ["report", "📝 Báo cáo"], ["report.revenue", "· Ô doanh thu QĐ trong báo cáo"], ["report.media", "· Báo cáo truyền thông ngày"], ["report.extra", "· Bán thêm ngoài thi đua"],
  ["cv", "🗂️ CV"], ["cv.tiktok", "· TikTok"], ["cv.clean", "· Vệ sinh"], ["cv.busy", "· Lịch bận"], ["cv.rs", "· Roadshow"], ["cv.flyer", "· Phát tờ rơi"], ["cv.vio", "· Biên bản vi phạm"], ["cv.fund", "· Quỹ thu chi"],
  ["score", "🏅 Xếp hạng điểm"], ["me", "👤 Của tôi"], ["ranking", "🏆 BXH sao"], ["history", "🕒 Lịch sử"], ["store", "🏢 Siêu thị"], ["assistant", "🤖 Trợ lý"], ["rules", "📖 Rule"], ["admin", "⚙️ Quản lý (với quản lý)"],
];
async function settings(body) {
  const aiStatus = await rpc("private_setting_status").catch(() => ({}));
  const rules = Array.isArray(setting("ITEM_RULES", [])) ? setting("ITEM_RULES", []) : [];
  const itemNames = [...new Set(S.items.map((i) => i.name))];
  body.innerHTML = `${starCardHtml()}
    <div class="card" style="margin-bottom:14px" id="genCard"><div class="card-h"><h2>⚙️ Cài đặt chung</h2><button class="btn small primary" id="stSave" type="button">💾 Lưu</button></div>
      <div class="fields">
        <label>Tên siêu thị<input id="st_STORE_NAME" value="${esc(setting("STORE_NAME", ""))}"></label>
        <label>Giờ chốt báo cáo<input id="st_CUTOFF_TIME" type="time" value="${esc(setting("CUTOFF_TIME", "22:20"))}"></label>
        ${NUM_SETTINGS.map(([k, l, h]) => `<label title="${esc(h)}">${esc(l)}<input id="st_${k}" type="number" step="any" min="0" value="${esc(setting(k, ""))}"></label>`).join("")}
        <label>Tự động tính chuỗi<select id="st_AUTO_STREAK_ENABLED"><option value="ON">Bật</option><option value="OFF" ${setting("AUTO_STREAK_ENABLED", "ON") === "OFF" ? "selected" : ""}>Tắt</option></select></label>
        <label>NV xem BXH sao toàn siêu thị<select id="st_EMPLOYEE_SEE_LEADERBOARD"><option value="false">Không (chỉ xem của mình)</option><option value="true" ${setting("EMPLOYEE_SEE_LEADERBOARD", false) === true ? "selected" : ""}>Có</option></select></label>
        <label>NV xem bảng xếp hạng điểm<select id="st_SCORE_SEE_ALL"><option value="detail">Cả siêu thị + bấm đồng đội xem DT, từng môn</option><option value="true" ${setting("SCORE_SEE_ALL", true) === true ? "selected" : ""}>Cả siêu thị (chỉ điểm, DT chi tiết của mình)</option><option value="false" ${setting("SCORE_SEE_ALL", true) === false ? "selected" : ""}>Chỉ của mình</option></select></label>
        <label>TikTok: bắt đầu tính từ ngày<input id="st_TIKTOK_START_DATE" type="date" value="${esc(String(setting("TIKTOK_START_DATE", "")).slice(0, 10))}"></label>
      </div>
      <div class="fields" style="margin-top:10px"><label>Đơn vị doanh thu QĐ<input id="st_REVENUE_UNIT" value="${esc(setting("REVENUE_UNIT", "triệu đ"))}"></label>
        ${["s4", "s3", "s2", "s1", "complaints"].map((k) => `<label>Phục vụ: trừ mỗi ${k === "complaints" ? "khiếu nại" : k.slice(1) + "★"}<input type="number" step="any" min="0" class="rd" data-k="${k}" value="${esc((setting("RATING_DEDUCT", {}) || {})[k] ?? "")}"></label>`).join("")}</div>
      <label style="margin-top:10px">Các loại lỗi vi phạm (mỗi dòng 1 loại)<textarea id="st_VIOLATION_TYPES">${esc((setting("VIOLATION_TYPES", []) || []).join("\n"))}</textarea></label>
      <div class="fields" style="margin-top:10px"><label>📦 Bộ phận báo cáo kiểu PG (không tính sao; cách nhau dấu phẩy)<input id="st_PG_DEPTS" value="${esc((setting("PG_DEPTS", ["PG"]) || []).join(", "))}"></label>
        <label>📦 Món bán kèm của PG (mỗi dòng 1 món)<textarea id="st_PG_ADDONS" rows="5">${esc((setting("PG_ADDONS", ["VAS", "Bảo hiểm", "PSDP", "Tai nghe", "Sim"]) || []).join("\n"))}</textarea></label></div>
      <p class="small muted" style="margin-top:10px">Số sao trừ = sao phạt của môn × hệ số theo chuỗi (chuỗi tính các ngày trước ngày báo cáo). Chuỗi nhỏ hơn cả hai ngưỡng: chỉ ghi nhận chuỗi.</p></div>
    ${isAdmin() ? `<div class="card" style="margin-bottom:14px" id="hideCard"><div class="card-h"><h2>🙈 Ẩn trang / chức năng</h2><button class="btn small primary" id="hdOpen" type="button">🙈 Bật chế độ ẩn</button></div>
      <p class="small muted">Chỉ Admin. Bấm nút 🙈 trên đầu trang (hoặc nút bên) → mọi menu, tab, mục hiện biểu tượng 👁️ / ◐ / 🙈; bấm vào để chọn bộ phận NV nào được thấy (tự lưu). Có ô tìm theo tên và danh sách đang ẩn. Admin và Quản lý luôn thấy đủ chức năng.</p>
      <p class="small">Đang ẩn: <b>${Object.keys(setting("HIDE2", {}) || {}).length}</b> mục${Object.values(setting("HIDE2", {}) || {}).length ? " — " + Object.values(setting("HIDE2", {})).slice(0, 6).map((e) => esc(e.label || "")).join(", ") : ""}</p></div>` : ""}
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🤖 Trợ lý AI (tuỳ chọn)</h2><span class="pill ${aiStatus.GEMINI_API_KEY ? "ok" : "mute"}">${aiStatus.GEMINI_API_KEY ? "Đã bật" : "Chưa bật"}</span></div>
      <p class="small muted">Trợ lý luôn trả lời được các câu thống kê thường gặp. Muốn hỏi tự do (AI), lấy khoá miễn phí tại <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a> rồi dán vào đây. Khoá chỉ lưu ở máy chủ.</p>
      <div class="row"><input id="aiKey" type="password" class="grow" style="width:auto" placeholder="${aiStatus.GEMINI_API_KEY ? "•••••• (đã lưu — dán khoá mới để thay)" : "AIza…"}" autocomplete="off"><button class="btn" id="aiSave" type="button">Lưu khoá</button>${aiStatus.GEMINI_API_KEY ? `<button class="btn ghost danger" id="aiDel" type="button">Gỡ</button>` : ""}</div></div>
    <div class="card"><div class="card-h"><h2>🎯 Quy tắc tăng ca / trừ sao riêng</h2><button class="btn small" id="ruAdd" type="button">+ Thêm quy tắc</button><button class="btn small primary" id="ruSave" type="button">💾 Lưu quy tắc</button></div>
      <p class="small muted">Quy tắc cụ thể hơn được ưu tiên: theo nhân viên &gt; theo bộ phận &gt; theo môn. Để trống ngưỡng = dùng ngưỡng chung.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Môn</th><th>Bộ phận</th><th>Nhân viên (mã, cách nhau dấu phẩy)</th><th class="num">Ngưỡng tăng ca</th><th class="num">Ngưỡng trừ sao</th><th>Không trừ sao</th><th></th></tr></thead><tbody id="ruRows">
      ${rules.map(ruleRow).join("")}</tbody></table></div></div>`;
  function ruleRow(r = {}) {
    return `<tr><td><select name="item"><option value="*">Tất cả môn</option>${itemNames.map((n) => `<option ${r.item === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></td>
      <td><select name="store"><option value="">Mọi bộ phận</option>${depts().map((d) => `<option ${r.stores?.includes(d) ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></td>
      <td><input name="staff" value="${esc((r.staffIds || []).join(", "))}" placeholder="VD: 18450, 20011"></td>
      <td><input name="ot" type="number" min="0" value="${r.ot ?? ""}" style="width:80px"></td><td><input name="pen" type="number" min="0" value="${r.pen ?? ""}" style="width:80px"></td>
      <td><input type="checkbox" name="noPen" ${r.noPen ? "checked" : ""}></td><td><button class="btn small ghost danger" data-delrule type="button">🗑️</button></td></tr>`;
  }
  $("#ruAdd").onclick = () => $("#ruRows").insertAdjacentHTML("beforeend", ruleRow({ item: "*" }));
  $("#hdOpen")?.addEventListener("click", () => import("../hidemode.js").then((m) => m.openHideMode()));
  if ($("#hdSave")) $("#hdSave").onclick = async () => {
    const v = { employee: $$(".hd[data-r=employee]:checked").map((c) => c.value), manager: [] };
    try { await save([["HIDE", v]]); toast("Đã lưu cài đặt ẩn"); } catch (x) { err(x); }
  };
  $("#aiSave").onclick = async () => { const k = $("#aiKey").value.trim(); if (k.length < 20) return toast("Khoá chưa đúng"); try { await rpc("set_private_setting", { p_key: "GEMINI_API_KEY", p_value: k }); toast("Đã lưu khoá AI"); settings(body); } catch (x) { err(x); } };
  $("#aiDel")?.addEventListener("click", async () => { try { await rpc("set_private_setting", { p_key: "GEMINI_API_KEY", p_value: "" }); toast("Đã gỡ khoá AI"); settings(body); } catch (x) { err(x); } });
  body.onclick = (e) => { const b = e.target.closest("[data-delrule]"); if (b) b.closest("tr").remove(); };
  const save = async (pairs) => {
    const rows = pairs.map(([key, value]) => ({ key, value, updated_by: S.me.email, updated_at: new Date().toISOString() }));
    const { error } = await sb.from("settings").upsert(rows); if (error) throw error; await loadSettings();
  };
  bindStarCard(save);
  $("#stSave").onclick = async () => {
    const pairs = [["STORE_NAME", $("#st_STORE_NAME").value.trim()], ["CUTOFF_TIME", $("#st_CUTOFF_TIME").value || "22:20"], ["AUTO_STREAK_ENABLED", $("#st_AUTO_STREAK_ENABLED").value],
      ["EMPLOYEE_SEE_LEADERBOARD", $("#st_EMPLOYEE_SEE_LEADERBOARD").value === "true"], ["SCORE_SEE_ALL", { detail: "detail", true: true, false: false }[$("#st_SCORE_SEE_ALL").value]], ["REVENUE_UNIT", $("#st_REVENUE_UNIT").value.trim()],
      ["RATING_DEDUCT", Object.fromEntries($$(".rd").map((i) => [i.dataset.k, Number(i.value) || 0]))],
      ["VIOLATION_TYPES", $("#st_VIOLATION_TYPES").value.split("\n").map((x) => x.trim()).filter(Boolean)],
      ["PG_DEPTS", [...new Set($("#st_PG_DEPTS").value.split(",").map((x) => x.trim()).filter(Boolean))]],
      ["PG_ADDONS", [...new Set($("#st_PG_ADDONS").value.split("\n").map((x) => x.trim()).filter(Boolean))]]];
    if ($("#st_TIKTOK_START_DATE").value) pairs.push(["TIKTOK_START_DATE", $("#st_TIKTOK_START_DATE").value]);
    for (const [k] of NUM_SETTINGS) { const v = $("#st_" + k).value; if (v !== "") pairs.push([k, Number(v)]); }
    try { await save(pairs); toast("Đã lưu cài đặt"); } catch (x) { err(x); }
  };
  $("#ruSave").onclick = async () => {
    const rules2 = $$("#ruRows tr").map((tr) => {
      const g = (n) => tr.querySelector(`[name=${n}]`);
      return { item: g("item").value, stores: g("store").value ? [g("store").value] : [], staffIds: g("staff").value.split(",").map((x) => x.trim()).filter(Boolean),
        ot: g("ot").value === "" ? "" : Number(g("ot").value), pen: g("pen").value === "" ? "" : Number(g("pen").value), noPen: g("noPen").checked };
    });
    try { await save([["ITEM_RULES", rules2]]); toast("Đã lưu quy tắc"); } catch (x) { err(x); }
  };
}

// ---------- Telegram ----------
async function telegram(body) {
  const own = isOwner(), mgr = isManager();
  const status = own ? await rpc("private_setting_status") : {};
  const chats = Array.isArray(setting("NOTIFY_CHAT_IDS", [])) ? setting("NOTIFY_CHAT_IDS", []) : [];
  const { data: logs } = await sb.from("notify_log").select("*").order("sent_at", { ascending: false }).limit(10);
  const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const items = (await notify({ mode: "items" }).catch(() => ({ items: [] }))).items;
  body.innerHTML = `
    ${own ? `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🤖 Kết nối bot Telegram</h2><span class="pill ${status.TELEGRAM_BOT_TOKEN ? "ok" : "warn"}">${status.TELEGRAM_BOT_TOKEN ? "Đã có token" : "Chưa có token"}</span></div>
      <ol class="small muted" style="margin:0 0 10px;padding-left:18px"><li>Telegram → <b>@BotFather</b> → <code>/newbot</code> → copy token.</li><li>Thêm bot vào nhóm quản lý, nhắn 1 câu bất kỳ trong nhóm.</li><li>Dán token → Lưu → bấm <b>Tìm nhóm</b> → tick nhóm nhận tin → Lưu cài đặt gửi.</li></ol>
      <div class="row"><input id="tgToken" type="password" placeholder="${status.TELEGRAM_BOT_TOKEN ? "•••••••• (đã lưu — dán token mới để thay)" : "123456789:ABC…"}" class="grow" style="width:auto" autocomplete="off"><button class="btn" id="tgSaveToken" type="button">Lưu token</button><button class="btn" id="tgDetect" type="button">🔎 Tìm nhóm</button></div>
      <div id="tgChats" style="margin-top:10px"></div></div>` : ""}
    ${isAdmin() ? `<div id="tgBotBox"></div>` : ""}
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🗓️ Gửi tự động theo từng đầu mục</h2>${mgr ? `<button class="btn small primary" id="tgSave" type="button">💾 Lưu lịch gửi</button>` : ""}</div>
      <div class="fields" style="margin-bottom:10px"><label>Trạng thái chung<select id="tgOn" ${own ? "" : "disabled"}><option value="false">Tắt tất cả</option><option value="true" ${setting("NOTIFY_ENABLED", false) === true ? "selected" : ""}>Bật</option></select></label>
        <label style="grid-column:span 2">Nơi nhận (chat ID, cách nhau dấu phẩy)<input id="tgIds" value="${esc(chats.join(", "))}" ${own ? "" : "disabled"} placeholder="Bấm Tìm nhóm để điền tự động"></label></div>
      <div class="tbl-wrap"><table class="tg-sched"><thead><tr><th>Đầu mục</th><th>Gửi</th><th>Tần suất & ngày gửi</th><th>Giờ</th><th></th></tr></thead><tbody>
      ${items.map((it) => { const dis = mgr ? "" : "disabled", dows = it.dows?.length ? it.dows : it.freq === "weekly" ? [it.dow ?? 0] : [];
        return `<tr data-it="${it.id}"><td><b>${esc(it.label)}</b></td><td><input type="checkbox" class="itOn" ${it.on ? "checked" : ""} ${dis}></td>
        <td class="small"><select class="itFreq" style="width:auto" ${dis}><option value="daily" ${it.freq === "daily" ? "selected" : ""}>Hằng ngày</option><option value="weekly" ${it.freq === "weekly" ? "selected" : ""}>Hằng tuần (1 ngày)</option><option value="days" ${it.freq === "days" ? "selected" : ""}>Chọn thứ trong tuần</option>${it.defFreq === "due" ? `<option value="due" ${it.freq === "due" ? "selected" : ""}>Ngày hạn nộp (T3, T6)</option>` : ""}</select>
          <select class="itDow" style="width:auto" ${dis} ${it.freq === "weekly" ? "" : "hidden"}>${days.map((d, i) => `<option value="${i}" ${it.dow === i ? "selected" : ""}>${d}</option>`).join("")}</select>
          <span class="itDays chips" ${it.freq === "days" ? "" : "hidden"}>${[1, 2, 3, 4, 5, 6, 0].map((i) => `<label class="chip inline tiny"><input type="checkbox" value="${i}" ${dows.includes(i) ? "checked" : ""} ${dis}> ${i ? "T" + (i + 1) : "CN"}</label>`).join("")}</span></td>
        <td><input type="time" class="itTime" value="${esc(it.time)}" style="width:auto" ${dis}></td>
        <td class="num"><button class="btn small" data-pv="${it.id}" type="button">Xem trước</button> <button class="btn small" data-sd="${it.id}" type="button">Gửi ngay</button></td></tr>`; }).join("")}
      </tbody></table></div><p class="small muted" style="margin-top:8px">Mỗi đầu mục gửi 1 tin riêng vào nhóm, đúng giờ đã đặt (chậm tối đa ~5 phút). Quản lý đổi được giờ, tần suất (hằng ngày / hằng tuần / chọn thứ) rồi bấm <b>Lưu lịch gửi</b>. Máy chủ kiểm tra 5 phút/lần, không cần mở web; đầu mục không có nội dung trong ngày sẽ tự bỏ qua.</p></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>👀 Xem trước & gửi ngay</h2></div>
      <div class="row"><select id="tgKind" style="width:auto">${items.map((it) => `<option value="${it.id}">${esc(it.label)}</option>`).join("")}</select>
        <label class="inline small" id="tgFromWrap" hidden title="Bỏ trống = từ lần gửi báo cáo quỹ trước">Từ ngày <input type="date" id="tgFrom" max="${vnToday()}" style="width:auto"></label>
        <span class="small muted" id="tgToLbl" hidden>đến</span><input type="date" id="tgDate" value="${vnToday()}" max="${vnToday()}" style="width:auto">
        <button class="btn" id="tgPreview" type="button">Xem trước</button><button class="btn primary" id="tgSend" type="button">📤 Gửi ngay</button>${own ? `<button class="btn" id="tgTest" type="button">Gửi tin thử</button>` : ""}</div>
      <div id="tgOut" style="margin-top:10px"></div></div>
    <div class="card"><div class="card-h"><h3>Nhật ký gửi</h3></div>${logs?.length ? `<div class="tbl-wrap"><table><tbody>${logs.map((l) => `<tr><td class="small">${new Date(l.sent_at).toLocaleString("vi-VN")}</td><td>${esc(l.kind)}</td><td>${esc(l.period)}</td><td>${l.ok ? '<span class="pill ok">OK</span>' : '<span class="pill bad">Lỗi</span>'}</td><td class="small muted">${esc(l.detail || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa gửi lần nào.</p>`}</div>`;
  if ($("#tgBotBox")) import("../tgbot-ui.js").then((m) => m.tgBotBox($("#tgBotBox"))).catch(() => {});
  const run = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (x) { err(x); } finally { btn.disabled = false; } };
  $("#tgSaveToken")?.addEventListener("click", (e) => run(e.target, async () => {
    const v = $("#tgToken").value.trim(); if (!/^\d+:[\w-]{20,}$/.test(v)) throw new Error("Token không đúng dạng (VD 123456789:ABC…)");
    await rpc("set_private_setting", { p_key: "TELEGRAM_BOT_TOKEN", p_value: v }); toast("Đã lưu token"); $("#tgToken").value = ""; telegram(body);
  }));
  $("#tgDetect")?.addEventListener("click", (e) => run(e.target, async () => {
    const r = await notify({ mode: "detect" });
    const cur = new Set($("#tgIds").value.split(",").map((x) => x.trim()).filter(Boolean));
    $("#tgChats").innerHTML = r.chats.length ? `<p class="small">Bot <b>@${esc(r.bot)}</b> thấy ${r.chats.length} nơi — tick để nhận tin:</p><div class="chips">${r.chats.map((c) => `<label class="chip inline"><input type="checkbox" data-chat="${esc(c.id)}" ${cur.has(c.id) ? "checked" : ""}> ${esc(c.title)} <span class="tiny muted">${esc(c.type)}</span></label>`).join("")}</div>`
      : `<p class="small muted">Bot @${esc(r.bot)} chưa thấy nhóm nào. Thêm bot vào nhóm, nhắn 1 câu trong nhóm rồi bấm Tìm lại.</p>`;
    $$("[data-chat]").forEach((cb) => cb.onchange = () => { const ids = new Set($("#tgIds").value.split(",").map((x) => x.trim()).filter(Boolean)); cb.checked ? ids.add(cb.dataset.chat) : ids.delete(cb.dataset.chat); $("#tgIds").value = [...ids].join(", "); });
  }));
  body.addEventListener("change", (e) => {
    const f = e.target.closest(".itFreq"); if (!f) return; const tr = f.closest("tr");
    tr.querySelector(".itDow").hidden = f.value !== "weekly"; tr.querySelector(".itDays").hidden = f.value !== "days";
  });
  $("#tgSave")?.addEventListener("click", (e) => run(e.target, async () => {
    const its = $$("[data-it]", body).map((tr) => ({ id: tr.dataset.it, on: tr.querySelector(".itOn").checked, time: tr.querySelector(".itTime").value, freq: tr.querySelector(".itFreq").value,
      dow: Number(tr.querySelector(".itDow").value), dows: $$(".itDays input:checked", tr).map((c) => Number(c.value)) }));
    const bad = its.find((x) => !/^\d{2}:\d{2}$/.test(x.time) || (x.freq === "days" && !x.dows.length));
    if (bad) throw new Error(`“${items.find((i) => i.id === bad.id)?.label}”: ${bad.freq === "days" && !bad.dows.length ? "chọn ít nhất 1 thứ" : "nhập giờ gửi"}.`);
    await rpc("save_notify_items", { p_items: its });
    if (own) {
      const ids = $("#tgIds").value.split(",").map((x) => x.trim()).filter(Boolean);
      const rows = [["NOTIFY_ENABLED", $("#tgOn").value === "true"], ["NOTIFY_CHAT_IDS", ids]].map(([key, value]) => ({ key, value, updated_by: S.me.email, updated_at: new Date().toISOString() }));
      const { error } = await sb.from("settings").upsert(rows); if (error) throw error;
    }
    await loadSettings(); toast("Đã lưu lịch gửi Telegram");
  }));
  const html2text = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");   // bỏ thẻ Telegram (b, i) và giải mã ký tự
  // Quỹ thu chi: chọn khoảng ngày (Từ ngày bỏ trống = từ lần gửi quỹ trước)
  const fundOpt = () => ($("#tgKind").value === "fund" ? { from: $("#tgFrom").value || "" } : {});
  $("#tgKind").onchange = () => { const f = $("#tgKind").value === "fund"; $("#tgFromWrap").hidden = !f; $("#tgToLbl").hidden = !f; };
  $("#tgPreview").onclick = (e) => run(e.target, async () => { const r = await notify({ mode: "preview", kind: $("#tgKind").value, date: $("#tgDate").value, ...fundOpt() }); $("#tgOut").innerHTML = `<pre class="preview">${esc(html2text(r.text))}</pre>`; });
  $("#tgSend").onclick = (e) => run(e.target, async () => { if (!(await confirmBox("Gửi ngay?", "Gửi tóm tắt tới các nơi nhận đã cài.", "Gửi"))) return; const r = await notify({ mode: "send", kind: $("#tgKind").value, date: $("#tgDate").value, ...fundOpt() }); toast(r.message); telegram(body); });
  body.addEventListener("click", (e) => {
    const pv = e.target.closest("[data-pv]"), sd = e.target.closest("[data-sd]");
    if (pv) run(pv, async () => { const r = await notify({ mode: "preview", kind: pv.dataset.pv, date: vnToday() }); $("#tgOut").innerHTML = `<pre class="preview">${esc(html2text(r.text))}</pre>`; $("#tgOut").scrollIntoView({ behavior: "smooth", block: "center" }); });
    if (sd) run(sd, async () => { if (!(await confirmBox("Gửi ngay?", "Gửi đầu mục này tới các nơi nhận đã cài.", "Gửi"))) return; const r = await notify({ mode: "send", kind: sd.dataset.sd, date: vnToday() }); toast(r.message); });
  });
  $("#tgTest")?.addEventListener("click", (e) => run(e.target, async () => { const r = await notify({ mode: "test" }); toast(r.message); }));
}

// ---------- Phân quyền ----------
async function members(body) {
  const { data, error } = await sb.from("memberships").select("*").order("role").order("email");
  if (error) throw error;
  body.innerHTML = `<div class="card"><div class="card-h"><h2>🔐 Phân quyền</h2><button class="btn small primary" id="mbAdd" type="button">+ Thêm tài khoản</button></div>
    <p class="small muted">Người được thêm đăng nhập bằng email: bấm <b>🔑 Đặt mật khẩu</b> để cấp mật khẩu (vào ngay bằng email + mật khẩu), hoặc để họ dùng mục “Quên mật khẩu / đăng nhập bằng email” ở màn hình đăng nhập. <b>Admin</b> (1 tài khoản) độc quyền: cấp quyền Quản lý, ẩn chức năng, đặt mật khẩu. <b>Quản lý</b>: đủ quyền như Admin trừ 3 việc đó, xem toàn bộ nhân viên. <b>Nhân viên</b> chỉ thấy số liệu của mình.${isAdmin() ? "" : " Bạn chỉ thêm / sửa được tài khoản Nhân viên."}</p>
    <div class="tbl-wrap"><table><thead><tr><th>Email</th><th>Vai trò</th><th>Mã NV</th><th>Bộ phận</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${data.map((m) => `<tr><td>${esc(m.email)}</td><td>${roleName(m)}</td><td>${esc(m.staff_id || "")} <span class="tiny muted">${esc(staffById(m.staff_id)?.name || "")}</span></td><td class="small">${esc((m.stores || []).join(", "))}</td>
      <td>${m.active ? '<span class="pill ok">Hoạt động</span>' : '<span class="pill mute">Khoá</span>'}</td><td class="num">${m.email === S.me.email || m.is_admin || (!isAdmin() && m.role !== "employee") ? "" : `${m.email.endsWith("@thidua351.vn") || !isAdmin() ? "" : `<button class="btn small" data-pw="${esc(m.email)}" type="button">🔑 Đặt mật khẩu</button> `}<button class="btn small" data-mb="${esc(m.email)}" type="button">Sửa</button>`}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  const edit = async (m) => {
    const isNew = !m; m = m || { email: "", role: "employee", staff_id: "", stores: [], active: true };
    const v = await modal(`<h3>${isNew ? "Thêm tài khoản" : esc(m.email)}</h3><form class="stack">
      ${isNew ? `<label>Email<input name="email" type="email" required></label>` : ""}
      <label>Vai trò<select name="role"><option value="employee" ${m.role === "employee" ? "selected" : ""}>Nhân viên</option>${isAdmin() ? `<option value="owner" ${m.role === "owner" || m.role === "manager" ? "selected" : ""}>Quản lý (đủ quyền, trừ cấp quyền QL / ẩn chức năng / đặt mật khẩu)</option>` : ""}</select></label>
      <label>Mã nhân viên (bắt buộc với nhân viên)<select name="staff_id"><option value="">—</option>${S.staff.filter((s) => !s.hidden || s.id === m.staff_id).map((s) => `<option value="${esc(s.id)}" ${s.id === m.staff_id ? "selected" : ""}>${esc(s.id)} · ${esc(s.name)}</option>`).join("")}</select></label>
      <fieldset style="border:1px solid var(--line);border-radius:9px;padding:8px 10px"><legend class="small muted">Bộ phận được xem</legend>${depts().map((d) => `<label class="inline"><input type="checkbox" name="store_${esc(d)}" ${m.stores?.includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</fieldset>
      <label class="inline"><input type="checkbox" name="active" ${m.active ? "checked" : ""}> Đang hoạt động</label></form>
      <div class="modal-actions">${!isNew ? `<button class="btn danger" data-v="delete" type="button">Xoá</button><span class="grow"></span>` : ""}<button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
    if (!v) return;
    try {
      if (v === "delete") { if (!(await confirmBox("Xoá tài khoản?", esc(m.email) + " sẽ không vào được tool nữa.", "Xoá", true))) return; const { error: e } = await sb.from("memberships").delete().eq("email", m.email); if (e) throw e; toast("Đã xoá"); return members(body); }
      let stores = depts().filter((d) => v["store_" + d] === "on");
      if (v.role === "employee") { if (!v.staff_id) throw new Error("Nhân viên phải gắn mã NV"); if (!stores.length) stores = [staffById(v.staff_id)?.dept].filter(Boolean); }
      if (!stores.length && v.role !== "owner") throw new Error("Chọn ít nhất 1 bộ phận");
      if (v.role === "owner" && m.role !== "owner" && !(await confirmBox("Cấp quyền Quản lý?", `${esc(m.email || v.email)} sẽ có đủ quyền như Admin (Cài đặt, Môn, Tài khoản NV, Nhật ký, Telegram…) trừ cấp quyền Quản lý, ẩn chức năng, đặt mật khẩu.`, "Cấp quyền"))) return;
      const row = { role: v.role, staff_id: v.staff_id || null, stores, active: v.active === "on" };
      const { error: e } = isNew ? await sb.from("memberships").insert({ email: v.email.trim().toLowerCase(), ...row }) : await sb.from("memberships").update(row).eq("email", m.email);
      if (e) throw e; toast("Đã lưu"); members(body);
    } catch (x) { err(x); }
  };
  $("#mbAdd").onclick = () => edit(null);
  body.onclick = (e) => { const p = e.target.closest("[data-pw]"); if (p) return setPw(p.dataset.pw); const b = e.target.closest("[data-mb]"); if (b) edit(data.find((m) => m.email === b.dataset.mb)); };
  const setPw = async (email) => {
    const v = await modal(`<h3>🔑 Đặt mật khẩu</h3><p class="small muted">Cho <b>${esc(email)}</b>. Gửi mật khẩu này cho người đó; họ đăng nhập bằng <b>email + mật khẩu</b>, không cần chờ email.</p>
      <form class="stack"><label>Mật khẩu mới (ít nhất 6 ký tự)<input name="pw" type="text" minlength="6" required autocomplete="off"></label>
      <label class="inline"><input type="checkbox" name="must" checked> Bắt đổi mật khẩu ở lần đăng nhập đầu</label></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Đặt mật khẩu</button></div>`);
    if (!v) return;
    if (String(v.pw || "").length < 6) return toast("Mật khẩu ít nhất 6 ký tự");
    try { const r = await callFn("accounts", { mode: "set_member_password", email, password: v.pw, must_change: v.must === "on" }); toast(r.message, 6000); } catch (x) { err(x); }
  };
}

// ---------- Nhật ký ----------
async function audit(body) {
  const { data, error } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(150);
  if (error) throw error;
  const label = { SUBMIT_DAILY: "Nộp báo cáo", DELETE_DAY: "Xoá ca", DELETE_ROW: "Xoá dòng", RESET_STREAK: "Reset chuỗi", APPROVE_EXTRA: "Duyệt bán thêm", REJECT_EXTRA: "Từ chối bán thêm", APPROVE_CHANGE: "Duyệt sửa", REJECT_CHANGE: "Từ chối sửa", SET_TOTAL: "Chỉnh tổng sao", SAVE_STORE_CONTEST: "Lưu số liệu siêu thị", MIGRATE_LEGACY: "Chuyển dữ liệu bản cũ" };
  body.innerHTML = `<div class="card"><div class="card-h"><h2>🧾 Nhật ký thao tác (150 gần nhất)</h2></div><div class="tbl-wrap"><table><thead><tr><th>Thời gian</th><th>Người làm</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>
    ${data.map((a) => `<tr><td class="small">${new Date(a.created_at).toLocaleString("vi-VN")}</td><td class="small">${esc(a.actor)}</td><td>${esc(label[a.action] || a.action)}</td><td>${esc(staffById(a.target)?.name || a.target || "")}</td><td class="tiny muted">${esc(JSON.stringify(a.details || {}))}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}
