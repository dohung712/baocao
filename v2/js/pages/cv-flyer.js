// D11 Phát tờ rơi: QL / chủ sở hữu nhập số tờ → tool tự chia tuyến, ngày, nhân sự (NV + PG); sửa nhân sự sau khi tạo.
// NV / PG xem lịch, phát xong nộp ảnh chụp màn hình album đã tạo trên nhóm (Room). Tới giờ hạn tool báo Telegram cho QL.
import { esc, fmt, toast, modal, confirmBox, vnToday, vnHM, addDays, dmy, dm, dow, shortName, copyText } from "../ui.js";
import { S, rpc, isManager, visibleStaff, staffById, errMsg } from "../store.js";
import { uploadAll, removeAll, fillPhotos, compress } from "../photos.js";

let B = null, host = null;
const err = (e) => toast(errMsg(e), 4500);
const me = () => S.me.staff_id;
const KEY = "thidua-v2-flyer-open";
const allTasks = () => (B?.campaigns || []).flatMap((c) => c.tasks.map((t) => ({ ...t, camp: c })));
const late = (t) => t.due_date < vnToday() || (t.due_date === vnToday() && t.due_hm <= vnHM());
const mapBtn = (u) => (u ? `<a class="btn small ghost" href="${esc(u)}" target="_blank" rel="noopener">🗺️ Bản đồ</a>` : "");
const who = (a) => `<span class="pill ${a.done_at ? "ok" : "mute"}" title="${esc(a.name)}">${a.done_at ? "✅" : "⏳"} ${esc(shortName(a.name))} · ${a.qty}</span>`;

export async function flyer(body) {
  host = body;
  try { B = await rpc("flyer_board"); } catch (e) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; return; }
  if (!host.isConnected) return;
  const mgr = isManager(), today = vnToday();
  const mine = allTasks().filter((t) => t.assigns.some((a) => a.staff_id === me())).sort((a, b) => (a.due_date + a.due_hm).localeCompare(b.due_date + b.due_hm));
  const minePending = mine.filter((t) => !t.assigns.find((a) => a.staff_id === me()).done_at);
  body.innerHTML = `
    ${mgr ? createCard() : ""}
    ${me() ? `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>📄 Việc phát tờ rơi của tôi</h2><span class="small muted">Phát xong → tạo album trên nhóm → chụp màn hình album → nộp ở đây</span></div>
      ${mine.length ? `<div class="stack" style="gap:8px">${mine.map((t) => myRow(t)).join("")}</div>` : `<p class="muted small">Chưa có tuyến nào được giao cho bạn.</p>`}
      ${minePending.length ? `<p class="small muted" style="margin-top:8px">Còn <b>${minePending.length}</b> tuyến chưa báo cáo.</p>` : ""}</div>` : ""}
    ${(B.campaigns || []).map((c) => campCard(c, mgr, today)).join("") || `<div class="empty">Chưa có đợt phát tờ rơi nào${mgr ? " — nhập số lượng ở trên để tạo." : "."}</div>`}
    ${mgr ? routesCard() : ""}`;
  body.querySelectorAll("[data-photos]").forEach((el) => { const [tid, sid] = el.dataset.photos.split("|"); const a = allTasks().find((t) => t.id == tid)?.assigns.find((x) => x.staff_id === sid); if (a) fillPhotos(el, a.photos); });
  body.onclick = (e) => click(e);
  body.querySelector("#flGen")?.addEventListener("submit", (e) => { e.preventDefault(); generate(e.target); });
  body.querySelectorAll("details[data-camp]").forEach((d) => d.addEventListener("toggle", () => { try { localStorage.setItem(KEY, d.open ? d.dataset.camp : ""); } catch { /* bỏ qua */ } }));
}

function createCard() {
  const tm = addDays(vnToday(), 1), active = (B.routes || []).filter((r) => r.active), cap = active.reduce((a, r) => a + r.qty, 0);
  return `<details class="card" style="margin-bottom:14px" ${(B.campaigns || []).length ? "" : "open"}><summary><b>⚡ Tạo đợt phát tờ rơi</b> <span class="small muted">— nhập số tờ, tool tự chia tuyến · ngày · nhân sự</span></summary>
    <form id="flGen" class="stack" style="margin-top:10px">
      <div class="fields">
        <label>Số tờ rơi cần phát *<input name="qty" type="number" min="1" step="1" required placeholder="vd 1000"></label>
        <label>Ngày bắt đầu<input name="start" type="date" value="${tm}" min="${vnToday()}"></label>
        <label>Số ngày phát<select name="days"><option value="">Tự động (theo số người)</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
        <label>Giờ hạn báo cáo<input name="hm" type="time" value="${esc(B.deadline_hm || "20:00")}"></label>
        <label class="grow">Tên đợt<input name="name" placeholder="Đợt phát tờ rơi ${dm(tm)}"></label>
      </div>
      <details><summary class="small">👥 Nhân sự tham gia (${visibleStaff().length} người NV + PG — bỏ tick người không phát đợt này)</summary>
        <div class="chips" style="margin-top:6px">${visibleStaff().map((s) => `<label class="chip inline"><input type="checkbox" name="fl_st" value="${esc(s.id)}" checked> ${esc(s.name)} <span class="tiny muted">${esc(s.dept || "")}</span></label>`).join("")}</div></details>
      <p class="tiny muted">Tool chọn tuyến lâu chưa phát trước cho tới khi đủ số tờ (đang bật ${active.length} tuyến · ${fmt(cap)} tờ). Tuyến / chợ cần nhiều người (2–4) chỉnh ở <b>🗺️ Danh mục tuyến</b> bên dưới. Ưu tiên người không đăng ký bận / OFF ngày đó; chia đều số lượt giữa mọi người.</p>
      <div><button class="btn primary" type="submit">⚡ Tạo danh sách phát</button></div>
    </form></details>`;
}

function myRow(t) {
  const a = t.assigns.find((x) => x.staff_id === me()), others = t.assigns.filter((x) => x.staff_id !== me());
  const state = a.done_at ? `<span class="pill ok">✅ Đã báo cáo</span>` : late(t) ? `<span class="pill bad">⚠️ Quá hạn</span>` : t.due_date === vnToday() ? `<span class="pill warn">Hôm nay</span>` : `<span class="pill info">${dow(t.due_date)} ${dm(t.due_date)}</span>`;
  return `<div class="card" style="padding:10px;box-shadow:none"><div class="row" style="flex-wrap:wrap;gap:6px">
      <b class="grow">${esc(t.route_name)}</b>${state}</div>
    <div class="small muted">${dow(t.due_date)} ${dmy(t.due_date)} · hạn <b>${esc(t.due_hm)}</b> · phần của bạn <b>${a.qty} tờ</b>${others.length ? ` · cùng phát: ${others.map((o) => esc(shortName(o.name))).join(", ")}` : ""} · ${esc(t.camp.name)}</div>
    <div class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap">${mapBtn(t.map_url)}${a.done_at ? "" : `<button class="btn small primary" data-rep="${t.id}|${esc(me())}" type="button">📸 Báo cáo hoàn tất</button>`}</div>
    ${a.photos?.length ? `<div class="photos" data-photos="${t.id}|${esc(me())}" style="margin-top:6px"></div>` : ""}</div>`;
}

function campCard(c, mgr, today) {
  const n = c.tasks.reduce((x, t) => x + t.assigns.length, 0), d = c.tasks.reduce((x, t) => x + t.assigns.filter((a) => a.done_at).length, 0);
  const days = [...new Set(c.tasks.map((t) => t.due_date))].sort();
  let open = ""; try { open = localStorage.getItem(KEY) || ""; } catch { /* bỏ qua */ }
  const isOpen = open ? open == c.id : c.end_date >= today;
  return `<details class="card" data-camp="${c.id}" style="margin-bottom:14px" ${isOpen ? "open" : ""}><summary><b>📄 ${esc(c.name)}</b>
      <span class="small muted">· ${fmt(c.total_qty)} tờ · ${c.tasks.length} tuyến · ${dm(c.start_date)}${c.end_date !== c.start_date ? " → " + dm(c.end_date) : ""} · hạn ${esc(c.deadline_hm)}</span>
      <span class="pill ${d === n && n ? "ok" : "info"}">${d}/${n} đã báo cáo</span></summary>
    <div class="row" style="gap:6px;margin:10px 0;flex-wrap:wrap"><button class="btn small" data-copy="${c.id}" type="button">📋 Copy danh sách gửi nhóm</button>
      ${mgr ? `<button class="btn small danger" data-delc="${c.id}" type="button">🗑 Xoá đợt</button>` : ""}</div>
    ${days.map((day) => `<h3 style="margin:12px 0 6px">${dow(day)} ${dmy(day)}</h3><div class="tbl-wrap"><table><thead><tr><th>Tuyến / chợ</th><th class="num">Số tờ</th><th>Nhân sự</th><th>Hạn</th><th></th></tr></thead><tbody>
      ${c.tasks.filter((t) => t.due_date === day).map((t) => { const all = t.assigns.length && t.assigns.every((a) => a.done_at);
        return `<tr><td style="min-width:150px"><b>${esc(t.route_name)}</b>${t.map_url ? `<div><a class="small" href="${esc(t.map_url)}" target="_blank" rel="noopener">🗺️ Mở bản đồ</a></div>` : ""}</td>
          <td class="num"><b>${fmt(t.qty)}</b></td>
          <td>${t.assigns.map(who).join(" ") || '<span class="neg small">Chưa có người</span>'}</td>
          <td class="small">${esc(t.due_hm)} ${all ? "✅" : late(t) ? '<span class="neg">⚠️ quá hạn</span>' : ""}</td>
          <td class="num"><button class="btn small ghost" data-view="${t.id}" type="button">${mgr ? "✏️ Sửa / ảnh" : "Xem"}</button></td></tr>`; }).join("")}
      </tbody></table></div>`).join("")}</details>`;
}

function routesCard() {
  const R = B.routes || [];
  return `<details class="card"><summary><b>🗺️ Danh mục tuyến đường / chợ</b> <span class="small muted">— ${R.filter((r) => r.active).length}/${R.length} đang bật · ${fmt(R.filter((r) => r.active).reduce((a, r) => a + r.qty, 0))} tờ</span></summary>
    <div class="tbl-wrap" style="margin-top:10px"><table class="nosort"><thead><tr><th>Bật</th><th>Tuyến / chợ</th><th>Link bản đồ</th><th class="num">Số tờ</th><th class="num">Số người</th><th>Phát gần nhất</th><th></th></tr></thead><tbody>
    ${R.map((r) => `<tr data-route="${r.id}"><td><input type="checkbox" data-f="active" ${r.active ? "checked" : ""}></td>
      <td><input data-f="name" value="${esc(r.name)}" style="min-width:170px"></td>
      <td><input data-f="map" value="${esc(r.map_url)}" style="min-width:150px" placeholder="https://maps.app.goo.gl/…"></td>
      <td class="num"><input data-f="qty" type="number" min="1" step="1" value="${r.qty}" style="width:80px;text-align:right"></td>
      <td class="num"><select data-f="people">${[1, 2, 3, 4].map((k) => `<option ${k === r.people ? "selected" : ""}>${k}</option>`).join("")}</select></td>
      <td class="small">${r.last_used ? dmy(r.last_used) : "—"}</td>
      <td class="num" style="white-space:nowrap"><button class="btn small" data-rsave="${r.id}" type="button">💾</button> <button class="btn small ghost" data-rdel="${r.id}" type="button">🗑</button></td></tr>`).join("")}
    <tr data-route=""><td><input type="checkbox" data-f="active" checked></td><td><input data-f="name" placeholder="➕ Tuyến / chợ mới"></td><td><input data-f="map" placeholder="Link bản đồ"></td>
      <td class="num"><input data-f="qty" type="number" min="1" step="1" value="50" style="width:80px;text-align:right"></td><td class="num"><select data-f="people">${[1, 2, 3, 4].map((k) => `<option>${k}</option>`).join("")}</select></td><td></td>
      <td class="num"><button class="btn small primary" data-rsave="" type="button">➕ Thêm</button></td></tr>
    </tbody></table></div>
    <p class="tiny muted">Số người: tuyến / chợ cần nhiều tờ có thể cho 2–4 người cùng phát (tool chia đều số tờ). Bỏ tick "Bật" để tạm không chia tuyến đó.</p></details>`;
}

async function generate(f) {
  const v = Object.fromEntries(new FormData(f)), all = [...f.querySelectorAll("[name=fl_st]")], on = all.filter((x) => x.checked).map((x) => x.value);
  if (!on.length) return toast("Chọn ít nhất 1 nhân sự");
  const btn = f.querySelector("[type=submit]"); btn.disabled = true;
  try {
    const r = await rpc("flyer_generate", { p_qty: Number(v.qty), p_start: v.start || null, p_days: v.days ? Number(v.days) : null, p_deadline_hm: v.hm || null,
      p_exclude: all.filter((x) => !x.checked).map((x) => x.value), p_name: v.name || null });
    try { localStorage.setItem(KEY, String(r.campaign_id)); } catch { /* bỏ qua */ }
    toast("✅ " + r.message, 5000); flyer(host);
  } catch (e) { err(e); btn.disabled = false; }
}

async function click(e) {
  const t = e.target.closest("button"); if (!t) return;
  const ds = t.dataset;
  try {
    if (ds.rep) return report(...ds.rep.split("|"));
    if (ds.view) return editTask(Number(ds.view));
    if (ds.copy) { const c = B.campaigns.find((x) => x.id == ds.copy); await copyText(campText(c)); return toast("Đã copy danh sách"); }
    if (ds.delc) {
      const c = B.campaigns.find((x) => x.id == ds.delc);
      if (!(await confirmBox("Xoá đợt phát?", `${esc(c.name)} · ${c.tasks.length} tuyến. Ảnh báo cáo của đợt cũng bị xoá.`, "Xoá", true))) return;
      const r = await rpc("flyer_campaign_delete", { p_id: c.id }); await removeAll(r.photos); toast(r.message); return flyer(host);
    }
    if (ds.rsave !== undefined) {
      const tr = t.closest("tr"), g = (k) => tr.querySelector(`[data-f=${k}]`);
      const r = await rpc("flyer_route_save", { p_id: ds.rsave ? Number(ds.rsave) : null, p_name: g("name").value, p_map: g("map").value, p_qty: Number(g("qty").value),
        p_people: Number(g("people").value), p_note: "", p_active: g("active").checked });
      toast(r.message); return flyer(host);
    }
    if (ds.rdel) {
      const r = B.routes.find((x) => x.id == ds.rdel);
      if (!(await confirmBox("Xoá tuyến?", `${esc(r.name)} — các đợt đã tạo vẫn giữ nguyên.`, "Xoá", true))) return;
      toast((await rpc("flyer_route_delete", { p_id: r.id })).message); return flyer(host);
    }
  } catch (x) { err(x); }
}

function campText(c) {
  const L = [`📄 ${c.name} · ${fmt(c.total_qty)} tờ · hạn báo cáo ${c.deadline_hm}`];
  for (const d of [...new Set(c.tasks.map((t) => t.due_date))].sort()) {
    L.push("", `🗓️ ${dow(d)} ${dmy(d)}`);
    c.tasks.filter((t) => t.due_date === d).forEach((t, i) => L.push(`${i + 1}. ${t.route_name} — ${t.qty} tờ — ${t.assigns.map((a) => `${shortName(a.name)} (${a.qty})`).join(", ")}${t.map_url ? "\n   " + t.map_url : ""}`));
  }
  L.push("", "Phát xong tạo album trên nhóm, chụp màn hình album và nộp trên tool: CV → 📄 Tờ rơi.");
  return L.join("\n");
}

// Nộp 1–6 ảnh chụp màn hình album; ảnh được đọc + nén ngay khi chọn (tránh lỗi mất file tạm trên Android)
async function report(taskId, staffId) {
  const t = allTasks().find((x) => x.id == taskId); if (!t) return;
  const blobs = [];
  await modal(`<h3>📸 Báo cáo tờ rơi · ${esc(t.route_name)}</h3>
    <p class="small muted">${esc(staffById(staffId)?.name || staffId)} · ${dow(t.due_date)} ${dmy(t.due_date)} · hạn ${esc(t.due_hm)}</p>
    <p class="small">Chọn <b>ảnh chụp màn hình album</b> đã tạo trên nhóm (Room) — tối đa 6 ảnh.</p>
    <label class="btn" style="display:inline-block">🖼️ Chọn ảnh<input type="file" accept="image/*" multiple id="flFiles" hidden></label>
    <div class="pick" id="flPrev" style="margin-top:8px"></div>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" id="flSend" type="button">📤 Nộp báo cáo</button></div>`,
  { onOpen: (b) => {
    const prev = b.querySelector("#flPrev");
    const draw = () => { prev.innerHTML = blobs.map((x, i) => `<label><img src="${URL.createObjectURL(x)}" alt=""><button type="button" class="btn small" data-rm="${i}" style="position:absolute;top:4px;right:4px">✕</button></label>`).join(""); };
    prev.addEventListener("click", (ev) => { const k = ev.target.closest("[data-rm]"); if (k) { ev.preventDefault(); blobs.splice(Number(k.dataset.rm), 1); draw(); } });
    b.querySelector("#flFiles").onchange = async (ev) => {
      for (const f of [...ev.target.files]) { if (blobs.length >= 6) { toast("Tối đa 6 ảnh"); break; } try { blobs.push(await compress(f)); } catch { toast("Có ảnh không đọc được, hãy chọn lại", 4000); } }
      ev.target.value = ""; draw();
    };
    b.querySelector("#flSend").onclick = async (ev) => {
      if (!blobs.length) return toast("Chọn ít nhất 1 ảnh chụp màn hình album");
      ev.target.disabled = true; ev.target.textContent = "⏳ Đang tải ảnh…";
      try {
        const paths = await uploadAll(`flyer/${t.camp.id}/${staffId}`, blobs);
        const r = await rpc("flyer_report", { p_task: t.id, p_staff: staffId, p_photos: paths });
        toast("✅ " + r.message); document.dispatchEvent(new Event("remind:refresh"));
        b.querySelector("[data-v=cancel]")?.click(); flyer(host);
      } catch (x) { err(x); ev.target.disabled = false; ev.target.textContent = "📤 Nộp báo cáo"; }
    };
  } });
}

// Xem / sửa 1 tuyến trong đợt: nhân sự (1–4), ngày, giờ hạn, số tờ; xem ảnh từng người; QL xoá ảnh cho nộp lại
async function editTask(id) {
  const t = allTasks().find((x) => x.id === id); if (!t) return;
  const mgr = isManager(), picked = new Set(t.assigns.map((a) => a.staff_id)), st = {};
  const v = await modal(`<h3>📄 ${esc(t.route_name)}</h3>
    <p class="small muted">${esc(t.camp.name)} · ${fmt(t.qty)} tờ · ${dow(t.due_date)} ${dmy(t.due_date)} · hạn ${esc(t.due_hm)} ${t.map_url ? `· <a href="${esc(t.map_url)}" target="_blank" rel="noopener">🗺️ Bản đồ</a>` : ""}</p>
    <div class="stack" style="gap:8px">${t.assigns.map((a) => `<div class="card" style="padding:8px;box-shadow:none"><div class="row" style="gap:6px;flex-wrap:wrap"><b class="grow">${esc(a.name)}</b><span class="small">${a.qty} tờ</span>
        ${a.done_at ? `<span class="pill ok">✅ ${new Date(a.done_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>` : `<span class="pill mute">Chưa báo cáo</span>`}
        ${!a.done_at && (mgr || a.staff_id === me()) ? `<button class="btn small primary" data-v="rep:${esc(a.staff_id)}" type="button">📸 Nộp ảnh${a.staff_id === me() ? "" : " hộ"}</button>` : ""}
        ${a.done_at && mgr ? `<button class="btn small ghost" data-v="clr:${esc(a.staff_id)}" type="button">Xoá ảnh (cho nộp lại)</button>` : ""}</div>
      ${a.photos?.length ? `<div class="photos" data-ph="${esc(a.staff_id)}" style="margin-top:6px"></div>` : ""}</div>`).join("") || '<p class="muted small">Chưa có người phát.</p>'}</div>
    ${mgr ? `<hr style="border:0;border-top:1px solid var(--line);margin:12px 0"><form class="stack" id="flEdit">
      <b>✏️ Sửa phân công</b>
      <div class="chips">${visibleStaff().map((s) => `<label class="chip inline"><input type="checkbox" name="who" value="${esc(s.id)}" ${picked.has(s.id) ? "checked" : ""}> ${esc(s.name)}</label>`).join("")}</div>
      <div class="fields"><label>Ngày phát<input name="d" type="date" value="${t.due_date}" required></label><label>Giờ hạn<input name="hm" type="time" value="${esc(t.due_hm)}" required></label>
        <label>Số tờ<input name="q" type="number" min="1" step="1" value="${t.qty}" required></label></div>
      <p class="tiny muted">Chọn 1–4 người; số tờ chia đều. Người đã nộp ảnh mà vẫn được chọn thì giữ nguyên báo cáo.</p></form>` : ""}
    <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button>${mgr ? `<button class="btn primary" data-v="save">💾 Lưu thay đổi</button>` : ""}</div>`,
  { onOpen: (b) => {
    b.querySelectorAll("[data-ph]").forEach((el) => fillPhotos(el, t.assigns.find((a) => a.staff_id === el.dataset.ph).photos));
    b.querySelector("[data-v=save]")?.addEventListener("click", () => { const f = b.querySelector("#flEdit"); st.who = [...f.querySelectorAll("[name=who]:checked")].map((x) => x.value); st.d = f.d.value; st.hm = f.hm.value; st.q = Number(f.q.value); }, true);
  } });
  if (!v || v === "cancel") return;
  try {
    if (v.startsWith("rep:")) return report(t.id, v.slice(4));
    if (v.startsWith("clr:")) {
      const sid = v.slice(4); if (!(await confirmBox("Xoá ảnh báo cáo?", `${esc(staffById(sid)?.name || sid)} sẽ phải nộp lại.`, "Xoá", true))) return;
      const r = await rpc("flyer_report_clear", { p_task: t.id, p_staff: sid }); await removeAll(r.photos); toast(r.message); return flyer(host);
    }
    if (v === "save") {
      if (!st.who?.length) return toast("Chọn ít nhất 1 người");
      if (st.who.length > 4) return toast("Tối đa 4 người cho một tuyến");
      const same = st.who.length === picked.size && st.who.every((x) => picked.has(x));
      if (!same) await rpc("flyer_task_assign", { p_task: t.id, p_staff: st.who });
      if (st.d !== t.due_date || st.hm !== t.due_hm || st.q !== t.qty || !same) await rpc("flyer_task_update", { p_task: t.id, p_date: st.d, p_hm: st.hm, p_qty: st.q });
      toast("✅ Đã lưu " + t.route_name); flyer(host);
    }
  } catch (x) { err(x); }
}
