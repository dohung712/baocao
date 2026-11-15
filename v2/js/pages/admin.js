// Trang Quản lý: duyệt, khoá sổ, nhân sự, môn thi đua, cài đặt, Telegram, phân quyền
import { $, $$, esc, fmt, sign, toast, modal, confirmBox, vnToday, dmy, dow, starHtml } from "../ui.js";
import { scoreAdmin } from "./admin-score.js";
import { starCardHtml, bindStarCard } from "../star-rules.js";
import { suggestHtml, bindSuggest } from "./admin-suggest.js";
import { sb, S, rpc, notify, callFn, onChange, isOwner, loadStaff, loadItems, loadSettings, loadLocked, loadPending, depts, staffById, setting, errMsg, roleLabel, visibleStaff } from "../store.js";

const TABS = [
  { id: "approve", label: "Duyệt" }, { id: "score", label: "Điểm & DT" }, { id: "lock", label: "Khoá sổ" }, { id: "staff", label: "Nhân sự" },
  { id: "items", label: "Môn & sao thưởng/phạt", owner: true }, { id: "targets", label: "Target NV", owner: true },
  { id: "accounts", label: "Tài khoản NV", owner: true }, { id: "settings", label: "Cài đặt", owner: true },
  { id: "telegram", label: "Telegram" }, { id: "members", label: "Phân quyền", owner: true }, { id: "audit", label: "Nhật ký", owner: true },
];
let tab = "approve", root, offs = [];

export async function render(view) {
  root = view;
  view.innerHTML = `<div class="page-h"><div><h1>Quản lý</h1><p>Duyệt yêu cầu, khoá sổ, nhân sự, môn thi đua, cài đặt và thông báo Telegram</p></div></div>
    <div class="subtabs" id="aTabs"></div><div id="aBody"></div>`;
  $("#aTabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; draw(); } };
  offs.push(onChange((w) => {
    if (tab === "approve" && ["pending", "proposals", "changes"].includes(w)) draw();
    if (w === "pending") drawTabs();
    if (tab === "lock" && w === "locked") draw();
  }));
  draw();
  return () => { offs.forEach((f) => f()); offs = []; };
}
function drawTabs() {
  const n = (S.pending.proposals || 0) + (S.pending.changes || 0) + (S.pending.hot || 0);
  $("#aTabs").innerHTML = TABS.filter((t) => !t.owner || isOwner()).map((t) => `<button type="button" data-t="${t.id}" class="${t.id === tab ? "on" : ""}">${t.label}${t.id === "approve" && n ? ` <b class="badge">${n}</b>` : ""}</button>`).join("");
}
async function draw() {
  if (!TABS.some((t) => t.id === tab && (!t.owner || isOwner()))) tab = "approve";
  drawTabs();
  const body = $("#aBody"); body.onclick = null; body.innerHTML = `<div class="empty">Đang tải…</div>`;
  try { await ({ approve, score: scoreAdmin, lock, staff, items, targets, accounts, settings, telegram, members, audit })[tab](body); }
  catch (e) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}
const err = (e) => toast(errMsg(e), 4500);

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
  const own = isOwner(), itemNames = [...new Set(S.items.map((i) => i.name))];
  body.innerHTML = `<div class="card"><div class="card-h"><h2>👥 Nhân sự & quỹ sao</h2>${own ? `<button class="btn small primary" id="sfAdd" type="button">+ Thêm nhân viên</button>` : ""}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Bộ phận</th><th class="num">Tổng sao</th><th>Môn riêng</th><th>Reset chuỗi</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${S.staff.map((s) => `<tr class="${s.hidden ? "muted" : ""}"><td>${esc(s.id)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.dept)}</td><td class="num star">${fmt(s.total_star)}</td>
      <td class="small">${s.assigned_items?.length ? esc(s.assigned_items.join(", ")) : '<span class="muted">Theo bộ phận</span>'}</td>
      <td class="small">${s.reset_date ? dmy(s.reset_date) : "—"}</td><td>${s.hidden ? '<span class="pill mute">Đang ẩn</span>' : '<span class="pill ok">Hoạt động</span>'}</td>
      <td class="num"><button class="btn small" data-edit="${esc(s.id)}" type="button">${own ? "Sửa" : "Thao tác"}</button></td></tr>`).join("")}
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
  body.onclick = (e) => { const b = e.target.closest("[data-edit]"); if (b) edit(staffById(b.dataset.edit)); };
}

// ---------- Môn thi đua ----------
async function items(body) {
  const stores = ["Chung", ...depts()];
  body.innerHTML = `${suggestHtml()}<div class="card"><div class="card-h"><h2>📋 Danh mục môn thi đua</h2><button class="btn small" id="itAdd" type="button">+ Thêm môn</button><button class="btn small primary" id="itSave" type="button">💾 Lưu tất cả</button></div>
    <div class="banner info"><div><b>Khai báo môn, target, sao thưởng, sao phạt</b>
      • <b>Áp dụng</b>: “Chung” = mọi bộ phận; chọn bộ phận để môn chỉ áp dụng cho bộ phận đó (trùng tên thì ưu tiên môn của bộ phận).<br>
      • <b>Target/ngày</b>: số cần đạt mỗi ngày để <i>Về số</i>. • <b>Sao thưởng</b>: cộng khi đạt ≥ 100% target. <b>Nhân sao</b>: môn X2 đạt ≥ ${fmt(setting("DOUBLE_BONUS_RATE", 150))}% → ×2; môn X3 đạt ≥ ${fmt(setting("DOUBLE_BONUS_RATE", 150))}% → ×2, ≥ ${fmt(setting("TRIPLE_BONUS_RATE", 200))}% → ×3.<br>
      • <b>Sao phạt</b>: số sao trừ khi chưa đạt nhiều ngày liền (mốc bắt đầu trừ, tăng ca, hệ số lũy tiến: <b>Cài đặt → Thưởng & trừ sao</b>).<br>
      • Target/sao <b>riêng từng nhân viên</b>: tab <b>Target NV</b>. Giao môn riêng cho nhân viên: tab <b>Nhân sự</b> → Sửa → Môn riêng.</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Thứ tự</th><th>Áp dụng</th><th>Tên môn</th><th class="num">Target/ngày</th><th class="num">Sao thưởng</th><th class="num">Sao phạt</th><th>Nhân sao</th><th>Bật</th><th></th></tr></thead><tbody id="itRows">
    ${S.items.map((i) => row(i)).join("")}</tbody></table></div></div>`;
  function row(i) {
    return `<tr data-id="${i.id || ""}"><td><input type="number" name="sort" value="${i.sort}" style="width:64px"></td>
      <td><select name="store">${[...new Set([...stores, i.store])].map((s) => `<option ${s === i.store ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></td>
      <td><input name="name" value="${esc(i.name)}" required style="min-width:180px"></td>
      <td><input type="number" name="target" min="0.01" step="any" value="${i.target}" style="width:90px;text-align:right"></td>
      <td><input type="number" name="bonus_star" step="10" value="${i.bonus_star}" style="width:90px;text-align:right"></td>
      <td><input type="number" name="penalty_star" step="10" value="${i.penalty_star}" style="width:90px;text-align:right"></td>
      <td><select name="mult" style="width:auto"><option value="">—</option><option value="x2" ${i.is_x2 && !i.is_x3 ? "selected" : ""}>X2</option><option value="x3" ${i.is_x3 ? "selected" : ""}>X3</option></select></td><td><input type="checkbox" name="active" ${i.active !== false ? "checked" : ""}></td>
      <td><button class="btn small ghost danger" data-del type="button">🗑️</button></td></tr>`;
  }
  bindSuggest(() => items(body));
  $("#itAdd").onclick = () => { $("#itRows").insertAdjacentHTML("beforeend", row({ id: "", store: "Chung", name: "", target: 1, bonus_star: 200, penalty_star: 100, is_x2: false, is_x3: false, active: true, sort: S.items.length + 1 })); $("#itRows tr:last-child input[name=name]").focus(); };
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
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Tạo tài khoản cho tất cả nhân viên chưa có (${missing})</h3></div>
      <div class="row"><input id="acPw" type="text" placeholder="Mật khẩu ban đầu (ít nhất 6 ký tự)" style="width:auto" class="grow" autocomplete="off"><button class="btn primary" id="acBulk" type="button" ${missing ? "" : "disabled"}>Tạo tài khoản</button></div></div>
    <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Đăng nhập bằng</th><th>Vai trò</th><th>Lần đăng nhập gần nhất</th><th></th></tr></thead><tbody>
    ${list.map((a) => `<tr><td>${esc(a.staff_id)}</td><td><b>${esc(a.name)}</b></td><td>${a.has_login ? (a.by_code ? `<span class="pill ok">Mã NV ${esc(a.staff_id)}</span>` : `<span class="pill info">${esc(a.email)}</span>`) : '<span class="pill mute">Chưa có tài khoản</span>'}</td>
      <td class="small">${a.role ? roleLabel(a.role) : ""}${a.active === false ? " (khoá)" : ""}</td><td class="small muted">${a.last_sign_in ? new Date(a.last_sign_in).toLocaleString("vi-VN") : "—"}</td>
      <td class="num"><button class="btn small" data-ac="${esc(a.staff_id)}" type="button">${a.has_login ? "Đặt lại mật khẩu" : "Tạo tài khoản"}</button></td></tr>`).join("")}
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
  ["LATE_STEP", "Sao phạt nộp trễ mỗi lần", "Lần N trong tháng bị trừ N × số này"],
  ["TIKTOK_REWARD", "TikTok: sao thưởng đúng hạn", ""], ["TIKTOK_PENALTY", "TikTok: sao phạt mỗi ngày trễ", ""], ["TIKTOK_MIN_LINKS", "TikTok: số link tối thiểu", ""], ["TIKTOK_FB_MIN", "TikTok: số link Facebook tối thiểu", ""],
  ["BUSY_MAX_WEEKDAY", "Lịch bận: tối đa người/ngày (T2–T6)", ""], ["RS_MIN_KM", "Roadshow: km tối thiểu", ""], ["RS_MIN_MIN", "Roadshow: phút tối thiểu", ""],
  ["W_REVENUE", "Xếp hạng: trọng số Doanh thu", "Điểm tối đa phần doanh thu"], ["W_CONTEST", "Xếp hạng: trọng số Thi đua", ""], ["W_SERVICE", "Xếp hạng: trọng số Phục vụ", ""], ["VIOLATION_POINTS", "Xếp hạng: điểm trừ mỗi lỗi", ""],
];
export const FEATURES = [
  ["report", "📝 Báo cáo"], ["report.revenue", "· Ô doanh thu QĐ trong báo cáo"], ["report.extra", "· Bán thêm ngoài thi đua"],
  ["cv", "🗂️ CV"], ["cv.tiktok", "· TikTok"], ["cv.clean", "· Vệ sinh"], ["cv.busy", "· Lịch bận"], ["cv.rs", "· Roadshow"], ["cv.stats", "· Thống kê"],
  ["score", "🏅 Xếp hạng điểm"], ["me", "👤 Của tôi"], ["ranking", "🏆 BXH sao"], ["history", "🕒 Lịch sử"], ["store", "🏢 Siêu thị"], ["assistant", "🤖 Trợ lý"], ["rules", "📖 Rule"], ["admin", "⚙️ Quản lý (với quản lý)"],
];
async function settings(body) {
  const aiStatus = await rpc("private_setting_status").catch(() => ({}));
  const rules = Array.isArray(setting("ITEM_RULES", [])) ? setting("ITEM_RULES", []) : [];
  const itemNames = [...new Set(S.items.map((i) => i.name))];
  body.innerHTML = `${starCardHtml()}
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>⚙️ Cài đặt chung</h2><button class="btn small primary" id="stSave" type="button">💾 Lưu</button></div>
      <div class="fields">
        <label>Tên siêu thị<input id="st_STORE_NAME" value="${esc(setting("STORE_NAME", ""))}"></label>
        <label>Giờ chốt báo cáo<input id="st_CUTOFF_TIME" type="time" value="${esc(setting("CUTOFF_TIME", "22:20"))}"></label>
        ${NUM_SETTINGS.map(([k, l, h]) => `<label title="${esc(h)}">${esc(l)}<input id="st_${k}" type="number" step="any" min="0" value="${esc(setting(k, ""))}"></label>`).join("")}
        <label>Tự động tính chuỗi<select id="st_AUTO_STREAK_ENABLED"><option value="ON">Bật</option><option value="OFF" ${setting("AUTO_STREAK_ENABLED", "ON") === "OFF" ? "selected" : ""}>Tắt</option></select></label>
        <label>NV xem BXH sao toàn siêu thị<select id="st_EMPLOYEE_SEE_LEADERBOARD"><option value="false">Không (chỉ xem của mình)</option><option value="true" ${setting("EMPLOYEE_SEE_LEADERBOARD", false) === true ? "selected" : ""}>Có</option></select></label>
        <label>NV xem bảng xếp hạng điểm<select id="st_SCORE_SEE_ALL"><option value="true">Cả siêu thị (chỉ điểm, DT chi tiết của mình)</option><option value="false" ${setting("SCORE_SEE_ALL", true) === false ? "selected" : ""}>Chỉ của mình</option></select></label>
        <label>TikTok: bắt đầu tính từ ngày<input id="st_TIKTOK_START_DATE" type="date" value="${esc(String(setting("TIKTOK_START_DATE", "")).slice(0, 10))}"></label>
      </div>
      <div class="fields" style="margin-top:10px"><label>Đơn vị doanh thu QĐ<input id="st_REVENUE_UNIT" value="${esc(setting("REVENUE_UNIT", "triệu đ"))}"></label>
        ${["s4", "s3", "s2", "s1", "complaints"].map((k) => `<label>Phục vụ: trừ mỗi ${k === "complaints" ? "khiếu nại" : k.slice(1) + "★"}<input type="number" step="any" min="0" class="rd" data-k="${k}" value="${esc((setting("RATING_DEDUCT", {}) || {})[k] ?? "")}"></label>`).join("")}</div>
      <label style="margin-top:10px">Các loại lỗi vi phạm (mỗi dòng 1 loại)<textarea id="st_VIOLATION_TYPES">${esc((setting("VIOLATION_TYPES", []) || []).join("\n"))}</textarea></label>
      <p class="small muted" style="margin-top:10px">Số sao trừ = sao phạt của môn × hệ số theo chuỗi (chuỗi tính các ngày trước ngày báo cáo). Chuỗi nhỏ hơn cả hai ngưỡng: chỉ ghi nhận chuỗi.</p></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🙈 Ẩn trang / chức năng</h2><button class="btn small primary" id="hdSave" type="button">💾 Lưu</button></div>
      <p class="small muted">Tick để ẩn với từng vai trò. Chủ quản luôn thấy tất cả.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Trang / chức năng</th><th class="num">Ẩn với nhân viên</th><th class="num">Ẩn với quản lý</th></tr></thead><tbody>
      ${FEATURES.map(([k, l]) => { const h = setting("HIDE", {}) || {}; return `<tr><td>${esc(l)}</td><td class="num">${k === "admin" ? "—" : `<input type="checkbox" class="hd" data-r="employee" value="${k}" ${(h.employee || []).includes(k) ? "checked" : ""}>`}</td><td class="num"><input type="checkbox" class="hd" data-r="manager" value="${k}" ${(h.manager || []).includes(k) ? "checked" : ""}></td></tr>`; }).join("")}
      </tbody></table></div></div>
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
  $("#hdSave").onclick = async () => {
    const v = { employee: $$(".hd[data-r=employee]:checked").map((c) => c.value), manager: $$(".hd[data-r=manager]:checked").map((c) => c.value) };
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
      ["EMPLOYEE_SEE_LEADERBOARD", $("#st_EMPLOYEE_SEE_LEADERBOARD").value === "true"], ["SCORE_SEE_ALL", $("#st_SCORE_SEE_ALL").value === "true"], ["REVENUE_UNIT", $("#st_REVENUE_UNIT").value.trim()],
      ["RATING_DEDUCT", Object.fromEntries($$(".rd").map((i) => [i.dataset.k, Number(i.value) || 0]))],
      ["VIOLATION_TYPES", $("#st_VIOLATION_TYPES").value.split("\n").map((x) => x.trim()).filter(Boolean)]];
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
  const own = isOwner();
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
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🗓️ Gửi tự động theo từng đầu mục</h2>${own ? `<button class="btn small primary" id="tgSave" type="button">💾 Lưu cài đặt gửi</button>` : ""}</div>
      <div class="fields" style="margin-bottom:10px"><label>Trạng thái chung<select id="tgOn" ${own ? "" : "disabled"}><option value="false">Tắt tất cả</option><option value="true" ${setting("NOTIFY_ENABLED", false) === true ? "selected" : ""}>Bật</option></select></label>
        <label style="grid-column:span 2">Nơi nhận (chat ID, cách nhau dấu phẩy)<input id="tgIds" value="${esc(chats.join(", "))}" ${own ? "" : "disabled"} placeholder="Bấm Tìm nhóm để điền tự động"></label></div>
      <div class="tbl-wrap"><table><thead><tr><th>Đầu mục</th><th>Gửi</th><th>Tần suất</th><th>Giờ</th><th></th></tr></thead><tbody>
      ${items.map((it) => `<tr data-it="${it.id}"><td><b>${esc(it.label)}</b></td><td><input type="checkbox" class="itOn" ${it.on ? "checked" : ""} ${own ? "" : "disabled"}></td>
        <td class="small">${it.freq === "weekly" ? `Hằng tuần <select class="itDow" style="width:auto" ${own ? "" : "disabled"}>${days.map((d, i) => `<option value="${i}" ${it.dow === i ? "selected" : ""}>${d}</option>`).join("")}</select>` : it.freq === "due" ? "Ngày hạn (T3, T6)" : "Hằng ngày"}</td>
        <td><input type="time" class="itTime" value="${esc(it.time)}" style="width:auto" ${own ? "" : "disabled"}></td>
        <td class="num"><button class="btn small" data-pv="${it.id}" type="button">Xem trước</button> <button class="btn small" data-sd="${it.id}" type="button">Gửi ngay</button></td></tr>`).join("")}
      </tbody></table></div><p class="small muted" style="margin-top:8px">Mỗi đầu mục gửi 1 tin riêng vào nhóm. Máy chủ kiểm tra 5 phút/lần, không cần mở web; đầu mục không có nội dung trong ngày sẽ tự bỏ qua.</p></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>👀 Xem trước & gửi ngay</h2></div>
      <div class="row"><select id="tgKind" style="width:auto">${items.map((it) => `<option value="${it.id}">${esc(it.label)}</option>`).join("")}</select><input type="date" id="tgDate" value="${vnToday()}" max="${vnToday()}" style="width:auto">
        <button class="btn" id="tgPreview" type="button">Xem trước</button><button class="btn primary" id="tgSend" type="button">📤 Gửi ngay</button>${own ? `<button class="btn" id="tgTest" type="button">Gửi tin thử</button>` : ""}</div>
      <div id="tgOut" style="margin-top:10px"></div></div>
    <div class="card"><div class="card-h"><h3>Nhật ký gửi</h3></div>${logs?.length ? `<div class="tbl-wrap"><table><tbody>${logs.map((l) => `<tr><td class="small">${new Date(l.sent_at).toLocaleString("vi-VN")}</td><td>${esc(l.kind)}</td><td>${esc(l.period)}</td><td>${l.ok ? '<span class="pill ok">OK</span>' : '<span class="pill bad">Lỗi</span>'}</td><td class="small muted">${esc(l.detail || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa gửi lần nào.</p>`}</div>`;
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
  $("#tgSave")?.addEventListener("click", (e) => run(e.target, async () => {
    const ids = $("#tgIds").value.split(",").map((x) => x.trim()).filter(Boolean);
    const its = $$("[data-it]", body).map((tr) => ({ id: tr.dataset.it, on: tr.querySelector(".itOn").checked, time: tr.querySelector(".itTime").value, dow: Number(tr.querySelector(".itDow")?.value ?? 0) }));
    const rows = [["NOTIFY_ENABLED", $("#tgOn").value === "true"], ["NOTIFY_CHAT_IDS", ids], ["NOTIFY_ITEMS", its]]
      .map(([key, value]) => ({ key, value, updated_by: S.me.email, updated_at: new Date().toISOString() }));
    const { error } = await sb.from("settings").upsert(rows); if (error) throw error; await loadSettings(); toast("Đã lưu cài đặt gửi");
  }));
  const html2text = (h) => h.replace(/<\/?b>/g, "");
  $("#tgPreview").onclick = (e) => run(e.target, async () => { const r = await notify({ mode: "preview", kind: $("#tgKind").value, date: $("#tgDate").value }); $("#tgOut").innerHTML = `<pre class="preview">${esc(html2text(r.text))}</pre>`; });
  $("#tgSend").onclick = (e) => run(e.target, async () => { if (!(await confirmBox("Gửi ngay?", "Gửi tóm tắt tới các nơi nhận đã cài.", "Gửi"))) return; const r = await notify({ mode: "send", kind: $("#tgKind").value, date: $("#tgDate").value }); toast(r.message); telegram(body); });
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
    <p class="small muted">Người được thêm đăng nhập bằng email: mục “Quên mật khẩu / đăng nhập bằng email” ở màn hình đăng nhập, sau đó tự đặt mật khẩu. Quản lý chỉ thấy nhân viên thuộc bộ phận được giao; nhân viên chỉ thấy số liệu của mình.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Email</th><th>Vai trò</th><th>Mã NV</th><th>Bộ phận</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${data.map((m) => `<tr><td>${esc(m.email)}</td><td>${roleLabel(m.role)}</td><td>${esc(m.staff_id || "")} <span class="tiny muted">${esc(staffById(m.staff_id)?.name || "")}</span></td><td class="small">${esc((m.stores || []).join(", "))}</td>
      <td>${m.active ? '<span class="pill ok">Hoạt động</span>' : '<span class="pill mute">Khoá</span>'}</td><td class="num">${m.email === S.me.email ? "" : `<button class="btn small" data-mb="${esc(m.email)}" type="button">Sửa</button>`}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  const edit = async (m) => {
    const isNew = !m; m = m || { email: "", role: "employee", staff_id: "", stores: [], active: true };
    const v = await modal(`<h3>${isNew ? "Thêm tài khoản" : esc(m.email)}</h3><form class="stack">
      ${isNew ? `<label>Email<input name="email" type="email" required></label>` : ""}
      <label>Vai trò<select name="role"><option value="employee" ${m.role === "employee" ? "selected" : ""}>Nhân viên</option><option value="manager" ${m.role === "manager" ? "selected" : ""}>Quản lý</option></select></label>
      <label>Mã nhân viên (bắt buộc với nhân viên)<select name="staff_id"><option value="">—</option>${S.staff.filter((s) => !s.hidden || s.id === m.staff_id).map((s) => `<option value="${esc(s.id)}" ${s.id === m.staff_id ? "selected" : ""}>${esc(s.id)} · ${esc(s.name)}</option>`).join("")}</select></label>
      <fieldset style="border:1px solid var(--line);border-radius:9px;padding:8px 10px"><legend class="small muted">Bộ phận được xem</legend>${depts().map((d) => `<label class="inline"><input type="checkbox" name="store_${esc(d)}" ${m.stores?.includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</fieldset>
      <label class="inline"><input type="checkbox" name="active" ${m.active ? "checked" : ""}> Đang hoạt động</label></form>
      <div class="modal-actions">${!isNew ? `<button class="btn danger" data-v="delete" type="button">Xoá</button><span class="grow"></span>` : ""}<button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
    if (!v) return;
    try {
      if (v === "delete") { if (!(await confirmBox("Xoá tài khoản?", esc(m.email) + " sẽ không vào được tool nữa.", "Xoá", true))) return; const { error: e } = await sb.from("memberships").delete().eq("email", m.email); if (e) throw e; toast("Đã xoá"); return members(body); }
      let stores = depts().filter((d) => v["store_" + d] === "on");
      if (v.role === "employee") { if (!v.staff_id) throw new Error("Nhân viên phải gắn mã NV"); if (!stores.length) stores = [staffById(v.staff_id)?.dept].filter(Boolean); }
      if (!stores.length) throw new Error("Chọn ít nhất 1 bộ phận");
      const row = { role: v.role, staff_id: v.staff_id || null, stores, active: v.active === "on" };
      const { error: e } = isNew ? await sb.from("memberships").insert({ email: v.email.trim().toLowerCase(), ...row }) : await sb.from("memberships").update(row).eq("email", m.email);
      if (e) throw e; toast("Đã lưu"); members(body);
    } catch (x) { err(x); }
  };
  $("#mbAdd").onclick = () => edit(null);
  body.onclick = (e) => { const b = e.target.closest("[data-mb]"); if (b) edit(data.find((m) => m.email === b.dataset.mb)); };
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
