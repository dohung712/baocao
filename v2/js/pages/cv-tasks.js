// CV → 📋 Việc: link trang tính QL · việc QL có deadline · triển khai toàn NV (đọc & nắm rõ) · giao việc NV (hoàn thành + ghi chú)
// QL/TC dán nội dung + ảnh/PDF (lưu Google Drive) → AI tóm tắt ý chính → tick Quan trọng / nhắc tuần / tháng / 2 tháng.
import { $, $$, esc, toast, modal, confirmBox, vnToday, dmy, dm, shortName, copyText } from "../ui.js";
import { sb, S, rpc, callFn, isManager, visibleStaff, staffById, setting, errMsg, depts } from "../store.js";

const KIND = { announce: ["📢", "Triển khai toàn NV"], assign: ["📌", "Giao việc NV"], deadline: ["⏰", "Việc QL có deadline"], link: ["🔗", "Link trang tính"] };
const REMIND = { none: "Không nhắc lại", week: "🔁 Nhắc hằng tuần", month: "🔁 Nhắc hằng tháng", "2month": "🔁 Nhắc 2 tháng/lần" };
let V = { sub: "", showDone: false, edit: null, draft: null }, T = [], A = [];
const myKey = () => S.me.staff_id || S.me.email;

// Kỳ nhắc lại — giống public._task_period
function isoWeek(d) { const x = new Date(d + "T00:00:00Z"), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`; }
export function period(remind, day = vnToday()) { return remind === "week" ? isoWeek(day) : remind === "month" ? day.slice(0, 7) : remind === "2month" ? `${day.slice(0, 4)}-B${Math.ceil(Number(day.slice(5, 7)) / 2)}` : ""; }
const ackOf = (t, who = myKey()) => A.find((a) => a.task_id === t.id && a.who === who && a.period === period(t.remind));
const targetsOf = (t) => t.kind === "assign" ? t.assignees.map((id) => staffById(id)).filter(Boolean) : visibleStaff().filter((s) => !t.depts.length || t.depts.includes(s.dept));
// Số việc NV còn phải làm (hiện trên tab)
export function pendingCount() { if (!S.me.staff_id) return 0; return T.filter((t) => t.status === "open" && ((t.kind === "announce" && !ackOf(t)?.read_at) || (t.kind === "assign" && t.assignees.includes(S.me.staff_id) && !ackOf(t)?.done_at))).length; }

export async function tasks(body, quiet = false) {
  const [{ data: t, error: e1 }, { data: a, error: e2 }] = await Promise.all([
    sb.from("tasks").select("*").order("important", { ascending: false }).order("created_at", { ascending: false }).limit(400),
    sb.from("task_acks").select("*").limit(10000),
  ]);
  if (e1 || e2) throw e1 || e2;
  T = t || []; A = a || [];
  if (quiet && V.sub === "new" && $("#tkForm")) return; // đang soạn thì không vẽ lại
  if (!V.sub) V.sub = isManager() ? "board" : "mine";
  draw(body);
}

function draw(body) {
  const mgr = isManager();
  const subs = mgr ? [["board", "📢 Triển khai & giao việc"], ["deadline", "⏰ Việc QL"], ["link", "🔗 Link trang tính"], ["new", V.edit ? "✏️ Sửa việc" : "➕ Đăng việc"]] : [["mine", "📋 Việc của tôi"]];
  const overdue = T.filter((t) => t.kind === "deadline" && t.status === "open" && t.deadline && t.deadline < vnToday()).length;
  body.innerHTML = `${mgr ? `<div class="seg tk-subs" id="tkSubs">${subs.map(([k, l]) => `<button type="button" data-s="${k}" class="${k === V.sub ? "on" : ""}">${l}${k === "deadline" && overdue ? ` <b class="badge">${overdue}</b>` : ""}</button>`).join("")}</div>` : ""}<div id="tkBody"></div>`;
  $("#tkSubs")?.addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; V.sub = b.dataset.s; if (V.sub !== "new") V.edit = null; draw(body); });
  ({ mine, board, deadline, link, new: form })[V.sub](body);
}

// ---------- Thẻ việc ----------
function filesHtml(files) {
  if (!files?.length) return "";
  return `<div class="tk-files">${files.map((f) => /^image\//.test(f.mime) ? `<a href="${esc(f.url)}" target="_blank" rel="noopener" class="tk-img"><img loading="lazy" src="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w600" alt="${esc(f.name)}"></a>`
    : `<a href="${esc(f.url)}" target="_blank" rel="noopener" class="chip">📄 ${esc(f.name)}</a>`).join("")}</div>`;
}
const badges = (t) => `${t.important ? '<span class="pill bad">⭐ Quan trọng</span>' : ""}${t.remind !== "none" ? `<span class="pill info">${REMIND[t.remind]}</span>` : ""}${t.deadline ? `<span class="pill ${t.status === "open" && t.deadline < vnToday() ? "bad" : "warn"}">⏳ Hạn ${dmy(t.deadline)}</span>` : ""}`;
const summaryHtml = (t) => t.summary ? `<div class="tk-sum">${esc(t.summary).replace(/\n/g, "<br>")}</div>` : "";
const contentHtml = (t) => t.content ? `<details class="tk-full"><summary>Xem nội dung đầy đủ</summary><div>${esc(t.content).replace(/\n/g, "<br>")}</div></details>` : "";
const byLine = (t) => `<span class="tiny muted">${KIND[t.kind][0]} ${KIND[t.kind][1]} · ${dmy(t.created_at.slice(0, 10))} · ${esc(t.created_by?.split("@")[0] || "")}</span>`;
const when = (ts) => ts ? new Date(ts).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";

// ---------- Nhân viên ----------
function mine(body) {
  const me = S.me.staff_id, box = $("#tkBody");
  if (!me) { box.innerHTML = `<div class="banner warn"><div><b>Tài khoản chưa gắn mã nhân viên</b></div></div>`; return; }
  const list = T.filter((t) => t.status === "open" && (t.kind === "announce" || (t.kind === "assign" && t.assignees.includes(me))));
  const todo = list.filter((t) => t.kind === "announce" ? !ackOf(t)?.read_at : !ackOf(t)?.done_at), done = list.filter((t) => !todo.includes(t));
  box.innerHTML = `<div class="banner ${todo.length ? "warn" : "ok"}"><div><b>${todo.length ? `Bạn còn ${todo.length} việc cần xác nhận / hoàn thành` : "✅ Bạn đã xác nhận hết các việc"}</b>Đọc kỹ nội dung rồi bấm xác nhận — quản lý xem được thời gian bạn hoàn tất.</div></div>
    <div class="tk-list">${todo.map((t) => card(t, false)).join("") || ""}</div>
    ${done.length ? `<details ${V.showDone ? "open" : ""} id="tkDone"><summary class="small"><b>Đã xác nhận / hoàn thành (${done.length})</b></summary><div class="tk-list">${done.map((t) => card(t, false)).join("")}</div></details>` : ""}`;
  $("#tkDone")?.addEventListener("toggle", (e) => { V.showDone = e.target.open; });
  box.onclick = (e) => act(e, body);
}
function card(t, mgr) {
  const a = ackOf(t), isAssign = t.kind === "assign";
  let action = "";
  if (!mgr && t.kind === "announce") action = a?.read_at ? `<span class="pill ok">✅ Đã đọc & nắm rõ · ${when(a.read_at)}</span>` : `<button class="btn primary" data-ack="${t.id}" type="button">✅ Đã đọc & nắm rõ</button>`;
  if (!mgr && isAssign) action = a?.done_at ? `<span class="pill ok">✅ Hoàn thành · ${when(a.done_at)}</span>${a.note ? ` <span class="small muted">“${esc(a.note)}”</span>` : ""} <button class="btn small ghost" data-undo="${t.id}" type="button">Huỷ</button>` : `<button class="btn primary" data-done="${t.id}" type="button">✔️ Hoàn thành</button>`;
  return `<div class="card tk-card ${t.important ? "imp" : ""}" data-id="${t.id}"><div class="tk-head"><b>${esc(t.title)}</b><div class="tk-badges">${badges(t)}</div></div>${byLine(t)}
    ${summaryHtml(t)}${contentHtml(t)}${filesHtml(t.files)}${mgr ? progress(t) : ""}<div class="tk-act">${action}${mgr ? mgrButtons(t) : ""}</div></div>`;
}
async function act(e, body) {
  const g = (s) => e.target.closest(`[${s}]`)?.getAttribute(s);
  try {
    if (g("data-ack")) { toast((await rpc("task_ack", { p_id: Number(g("data-ack")), p_action: "read" })).message); return tasks($("#cvBody") || body); }
    if (g("data-done")) {
      const v = await modal(`<h3>Báo hoàn thành</h3><form><label>Ghi chú (tuỳ chọn)<textarea name="n" placeholder="VD: Đã làm xong, đã chụp ảnh gửi nhóm"></textarea></label></form><div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Hoàn thành</button></div>`);
      if (!v) return; toast((await rpc("task_ack", { p_id: Number(g("data-done")), p_action: "done", p_note: v.n || "" })).message); return tasks($("#cvBody") || body);
    }
    if (g("data-undo")) { toast((await rpc("task_ack", { p_id: Number(g("data-undo")), p_action: "undo" })).message); return tasks($("#cvBody") || body); }
    if (g("data-edit")) { V.edit = T.find((t) => t.id === Number(g("data-edit"))); V.sub = "new"; return draw($("#cvBody") || body); }
    if (g("data-st")) {
      const [id, st] = g("data-st").split("|"), t = T.find((x) => x.id === Number(id));
      let note = null;
      if (st === "done" && t.kind === "deadline") { const v = await modal(`<h3>Hoàn thành: ${esc(t.title)}</h3><form><label>Ghi chú (tuỳ chọn)<textarea name="n"></textarea></label></form><div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Hoàn thành</button></div>`); if (!v) return; note = v.n || ""; }
      if (st === "delete" && !(await confirmBox("Xoá việc?", `<b>${esc(t.title)}</b> cùng các xác nhận của nhân viên. File trên Drive chuyển vào thùng rác.`, "Xoá", true))) return;
      const res = await rpc("task_set_status", { p_id: Number(id), p_status: st, p_note: note });
      if (st === "delete" && res.files?.length) callFn("tasks", { mode: "delete", ids: res.files.map((f) => f.id) }).catch(() => {});
      toast(res.message); return tasks($("#cvBody") || body);
    }
    if (g("data-remind")) {
      const t = T.find((x) => x.id === Number(g("data-remind"))), miss = targetsOf(t).filter((s) => { const a = ackOf(t, s.id); return t.kind === "assign" ? !a?.done_at : !a?.read_at; });
      const txt = `📣 Nhắc ${miss.map((s) => shortName(s.name)).join(", ")}: ${t.kind === "assign" ? "hoàn thành" : "đọc & xác nhận"} việc “${t.title}”${t.deadline ? ` (hạn ${dmy(t.deadline)})` : ""} trong tool → CV → 📋 Việc.`;
      toast((await copyText(txt)) ? "Đã copy lời nhắc — dán vào nhóm Zalo" : "Không copy được");
    }
  } catch (x) { toast(errMsg(x), 4500); }
}

// ---------- Quản lý ----------
function progress(t) {
  if (!["announce", "assign"].includes(t.kind)) return "";
  const ts = targetsOf(t), rows = ts.map((s) => ({ s, a: ackOf(t, s.id) })), key = t.kind === "assign" ? "done_at" : "read_at";
  const ok = rows.filter((r) => r.a?.[key]).length, pct = ts.length ? Math.round((ok * 100) / ts.length) : 0;
  return `<details class="tk-prog"><summary><span class="mbar" style="width:120px;display:inline-block;vertical-align:middle"><i style="width:${pct}%"></i></span> <b>${ok}/${ts.length}</b> ${t.kind === "assign" ? "đã hoàn thành" : "đã đọc & nắm rõ"}${t.remind !== "none" ? ` <span class="tiny muted">(kỳ ${period(t.remind)})</span>` : ""}</summary>
    <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th>Thời gian</th><th>Ghi chú</th></tr></thead><tbody>${rows.sort((x, y) => (x.a?.[key] ? 1 : 0) - (y.a?.[key] ? 1 : 0)).map(({ s, a }) => `<tr><td>${esc(s.name)}</td><td data-sortv="${a?.[key] || ""}">${a?.[key] ? `<span class="pos">✅ ${when(a[key])}</span>` : '<span class="neg">Chưa</span>'}</td><td class="small">${esc(a?.note || "")}</td></tr>`).join("")}</tbody></table></div></details>`;
}
const mgrButtons = (t) => `<span class="grow"></span>${["announce", "assign"].includes(t.kind) && t.status === "open" ? `<button class="btn small" data-remind="${t.id}" type="button">📣 Copy lời nhắc</button>` : ""}
  ${t.kind === "deadline" && t.status === "open" ? `<button class="btn small primary" data-st="${t.id}|done" type="button">✔️ Hoàn thành</button>` : ""}
  <button class="btn small ghost" data-edit="${t.id}" type="button">✏️</button>${t.status === "open" ? `<button class="btn small ghost" data-st="${t.id}|archived" type="button" title="Lưu trữ">🗄️</button>` : `<button class="btn small ghost" data-st="${t.id}|open" type="button">↩️ Mở lại</button>`}
  <button class="btn small ghost danger" data-st="${t.id}|delete" type="button">🗑️</button>`;
function board(body) {
  const open = T.filter((t) => ["announce", "assign"].includes(t.kind) && t.status === "open"), old = T.filter((t) => ["announce", "assign"].includes(t.kind) && t.status !== "open");
  $("#tkBody").innerHTML = `<div class="row" style="margin:6px 0 10px"><button class="btn primary" data-go-new type="button">➕ Đăng việc / giao việc</button><span class="small muted">Bấm thanh tiến độ để xem ai đã đọc, đã hoàn thành và lúc nào.</span></div>
    <div class="tk-list">${open.map((t) => card(t, true)).join("") || '<div class="empty">Chưa có việc đang triển khai.</div>'}</div>
    ${old.length ? `<details><summary class="small"><b>Đã lưu trữ (${old.length})</b></summary><div class="tk-list">${old.map((t) => card(t, true)).join("")}</div></details>` : ""}`;
  $("#tkBody").onclick = (e) => { if (e.target.closest("[data-go-new]")) { V.sub = "new"; V.edit = null; return draw(body); } act(e, body); };
}
function deadline(body) {
  const L = T.filter((t) => t.kind === "deadline"), open = L.filter((t) => t.status === "open").sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")), done = L.filter((t) => t.status !== "open");
  $("#tkBody").innerHTML = `<div class="row" style="margin:6px 0 10px"><button class="btn primary" data-go-new="deadline" type="button">➕ Thêm việc QL</button></div>
    <div class="tk-list">${open.map((t) => card(t, true)).join("") || '<div class="empty">Không có việc QL đang mở.</div>'}</div>
    ${done.length ? `<details><summary class="small"><b>Đã xong / lưu trữ (${done.length})</b></summary><div class="tk-list">${done.map((t) => card(t, true).replace('<div class="tk-act">', `<div class="small muted">${t.done_at ? `✅ ${esc(t.done_by?.split("@")[0] || "")} · ${when(t.done_at)}${t.done_note ? ` · “${esc(t.done_note)}”` : ""}` : ""}</div><div class="tk-act">`)).join("")}</div></details>` : ""}`;
  $("#tkBody").onclick = (e) => { const n = e.target.closest("[data-go-new]"); if (n) { V.sub = "new"; V.edit = null; V.draft = { kind: "deadline" }; return draw(body); } act(e, body); };
}
function link(body) {
  const L = T.filter((t) => t.kind === "link" && t.status !== "archived"), groups = [...new Set(L.map((t) => t.content || "Khác"))];
  $("#tkBody").innerHTML = `<div class="row" style="margin:6px 0 10px"><button class="btn primary" data-go-new="link" type="button">➕ Thêm link</button><span class="small muted">Chỉ quản lý / trưởng ca thấy mục này.</span></div>
    ${groups.map((g) => `<div class="card" style="margin-bottom:10px"><h3>${esc(g)}</h3><div class="tk-links">${L.filter((t) => (t.content || "Khác") === g).map((t) => `<div class="tk-link"><a href="${esc(t.link_url)}" target="_blank" rel="noopener"><b>${esc(t.title)}</b><span class="tiny muted">${esc(t.link_url.replace(/^https?:\/\//, "").slice(0, 60))}</span></a>${t.important ? '<span class="pill bad">⭐</span>' : ""}<button class="btn small ghost" data-edit="${t.id}" type="button">✏️</button><button class="btn small ghost danger" data-st="${t.id}|delete" type="button">🗑️</button></div>`).join("")}</div></div>`).join("") || '<div class="empty">Chưa có link. Bấm “Thêm link” để lưu các trang tính hay dùng.</div>'}`;
  $("#tkBody").onclick = (e) => { const n = e.target.closest("[data-go-new]"); if (n) { V.sub = "new"; V.edit = null; V.draft = { kind: "link" }; return draw(body); } act(e, body); };
}

// ---------- Đăng / sửa việc ----------
let pending = []; // file chờ tải: {file, name, mime, data(base64), preview}
function form(body) {
  const e = V.edit || V.draft || { kind: "announce" }; pending = [];
  const kinds = Object.entries(KIND), staff = visibleStaff();
  $("#tkBody").innerHTML = `<div class="card" id="tkForm"><div class="card-h"><h2>${V.edit ? "✏️ Sửa việc" : "➕ Đăng việc / giao việc"}</h2></div>
    <div class="seg tk-kinds" id="tkKind">${kinds.map(([k, [ic, l]]) => `<button type="button" data-k="${k}">${ic} ${l}</button>`).join("")}</div>
    <div class="stack" style="margin-top:12px">
      <label class="k-not-link">Nội dung (dán từ Zalo, email, văn bản…)<textarea id="tkContent" style="min-height:150px" placeholder="Dán nội dung công việc vào đây. Có thể dán ảnh chụp màn hình (Ctrl+V) để đính kèm.">${esc(e.kind === "link" ? "" : e.content || "")}</textarea></label>
      <div class="k-not-link"><label>Ảnh / PDF đính kèm (lưu Google Drive)<input type="file" id="tkFiles" accept="image/*,application/pdf" multiple></label>
        <div class="tk-files" id="tkPrev">${(e.files || []).map((f, i) => `<span class="chip" data-old="${i}">${/^image/.test(f.mime) ? "🖼️" : "📄"} ${esc(f.name)} <button type="button" data-rmold="${i}">✕</button></span>`).join("")}</div></div>
      <div class="row k-not-link"><button class="btn" id="tkAi" type="button">✨ AI tóm tắt ý chính</button><span class="small muted" id="tkAiMsg">AI đọc nội dung và file đính kèm, đề xuất tiêu đề + ý chính + hạn chót.</span></div>
      <label>Tiêu đề<input id="tkTitle" maxlength="160" value="${esc(e.title || "")}" placeholder="VD: Triển khai CTKM tháng 11"></label>
      <label class="k-not-link">Tóm tắt ý chính (nhân viên đọc phần này trước)<textarea id="tkSum" style="min-height:110px" placeholder="• Ý 1&#10;• Ý 2">${esc(e.summary || "")}</textarea></label>
      <label class="k-link">Đường link trang tính<input id="tkUrl" value="${esc(e.link_url || "")}" placeholder="https://docs.google.com/spreadsheets/…"></label>
      <label class="k-link">Nhóm<input id="tkGroup" list="tkGroups" value="${esc(e.kind === "link" ? e.content || "" : "")}" placeholder="VD: Trang tính quản lý"><datalist id="tkGroups">${[...new Set([...(setting("TASK_LINK_GROUPS", []) || []), ...T.filter((t) => t.kind === "link").map((t) => t.content).filter(Boolean)])].map((g) => `<option value="${esc(g)}">`).join("")}</datalist></label>
      <div class="k-announce"><div class="small"><b>Gửi cho</b></div><div class="chips">${depts().map((d) => `<label class="chip inline"><input type="checkbox" class="tkDept" value="${esc(d)}" ${(e.depts || []).includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}<span class="small muted">Không tick = cả siêu thị</span></div></div>
      <div class="k-assign"><div class="small row"><b>Giao cho nhân viên</b><button class="btn small ghost" id="tkAll" type="button">Chọn tất cả</button></div><div class="chips">${staff.map((s) => `<label class="chip inline"><input type="checkbox" class="tkStaff" value="${esc(s.id)}" ${(e.assignees || []).includes(s.id) ? "checked" : ""}> ${esc(shortName(s.name))}</label>`).join("")}</div></div>
      <div class="fields k-not-link"><label class="k-dl">Hạn chót<input id="tkDl" type="date" value="${esc(e.deadline || "")}"></label>
        <label>Nhắc lại<select id="tkRemind">${Object.entries(REMIND).map(([k, l]) => `<option value="${k}" ${e.remind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <label class="inline"><input type="checkbox" id="tkImp" ${e.important ? "checked" : ""}> ⭐ Quan trọng (ghim lên đầu)</label>
      <p class="tiny muted k-not-link" style="margin:0">Nhắc lại: sang tuần / tháng / 2 tháng mới, việc tự hiện lại để nhân viên xác nhận đọc lại lần nữa.</p>
      <div class="row"><button class="btn primary big" id="tkSave" type="button">${V.edit ? "💾 Lưu thay đổi" : "🚀 Đăng"}</button><button class="btn" id="tkCancel" type="button">Huỷ</button><span class="small muted" id="tkMsg"></span></div>
    </div></div>`;
  let kind = e.kind, oldFiles = [...(e.files || [])];
  const setKind = (k) => { kind = k; $$("#tkKind button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
    $$(".k-link").forEach((x) => x.hidden = k !== "link"); $$(".k-not-link").forEach((x) => x.hidden = k === "link");
    $$(".k-announce").forEach((x) => x.hidden = k !== "announce"); $$(".k-assign").forEach((x) => x.hidden = k !== "assign"); };
  setKind(kind);
  $("#tkKind").onclick = (ev) => { const b = ev.target.closest("[data-k]"); if (b) setKind(b.dataset.k); };
  $("#tkAll").onclick = () => { const all = $$(".tkStaff"), on = !all.every((c) => c.checked); all.forEach((c) => c.checked = on); };
  const addFiles = async (list) => {
    for (const f of list) {
      if (!/^(image\/|application\/pdf)/.test(f.type)) { toast("Chỉ nhận ảnh hoặc PDF: " + f.name); continue; }
      const item = await prepare(f); if (!item) continue; pending.push(item);
      $("#tkPrev").insertAdjacentHTML("beforeend", `<span class="chip" data-new="${pending.length - 1}">${item.preview ? `<img src="${item.preview}" alt="">` : "📄"} ${esc(item.name)} <button type="button" data-rmnew="${pending.length - 1}">✕</button></span>`);
    }
  };
  $("#tkFiles").onchange = (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; };
  $("#tkContent").addEventListener("paste", (ev) => { const imgs = [...(ev.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type)); if (imgs.length) { ev.preventDefault(); addFiles(imgs.map((f, i) => new File([f], `anh-dan-${Date.now()}-${i}.png`, { type: f.type }))); } });
  $("#tkPrev").onclick = (ev) => { const o = ev.target.closest("[data-rmold]"), n = ev.target.closest("[data-rmnew]");
    if (o) { oldFiles[Number(o.dataset.rmold)] = null; o.closest(".chip").remove(); } if (n) { pending[Number(n.dataset.rmnew)] = null; n.closest(".chip").remove(); } };
  $("#tkAi").onclick = async (ev) => {
    const text = $("#tkContent").value.trim(), files = pending.filter(Boolean).filter((p) => p.data.length < 9_000_000).map((p) => ({ mime: p.mime, data: p.data }));
    if (!text && !files.length) return toast("Dán nội dung hoặc thêm ảnh/PDF trước");
    ev.target.disabled = true; $("#tkAiMsg").textContent = "AI đang đọc…";
    try { const r = await callFn("tasks", { mode: "summarize", text, files });
      if (r.title && !$("#tkTitle").value.trim()) $("#tkTitle").value = r.title; if (r.summary) $("#tkSum").value = r.summary; if (r.deadline && !$("#tkDl").value) $("#tkDl").value = r.deadline;
      $("#tkAiMsg").textContent = "✅ Đã tóm tắt — kiểm tra và sửa nếu cần."; }
    catch (x) { $("#tkAiMsg").textContent = "⚠️ " + errMsg(x); }
    ev.target.disabled = false;
  };
  $("#tkCancel").onclick = () => { V.edit = null; V.draft = null; V.sub = isManager() ? (kind === "link" ? "link" : kind === "deadline" ? "deadline" : "board") : "mine"; draw(body); };
  $("#tkSave").onclick = async (ev) => {
    const title = $("#tkTitle").value.trim(); if (!title) return toast("Nhập tiêu đề");
    if (kind === "assign" && !$$(".tkStaff:checked").length) return toast("Chọn nhân viên được giao");
    ev.target.disabled = true;
    try {
      const up = []; const todo = pending.filter(Boolean);
      for (const [i, p] of todo.entries()) { $("#tkMsg").textContent = `Đang tải file ${i + 1}/${todo.length} lên Drive…`; up.push((await callFn("tasks", { mode: "upload", name: p.name, mime: p.mime, data: p.data, sub: vnToday().slice(0, 7) })).file); }
      $("#tkMsg").textContent = "Đang lưu…";
      const data = { kind, title, content: kind === "link" ? $("#tkGroup").value.trim() : $("#tkContent").value.trim(), summary: kind === "link" ? "" : $("#tkSum").value.trim(), link_url: $("#tkUrl").value.trim(),
        files: [...oldFiles.filter(Boolean), ...up], depts: kind === "announce" ? $$(".tkDept:checked").map((c) => c.value) : [], assignees: kind === "assign" ? $$(".tkStaff:checked").map((c) => c.value) : [],
        important: $("#tkImp").checked, remind: kind === "link" ? "none" : $("#tkRemind").value, deadline: kind === "link" ? "" : $("#tkDl").value };
      const res = await rpc("task_save", { p_id: V.edit?.id ?? null, p_data: data });
      toast(res.message); V.edit = null; V.draft = null; V.sub = kind === "link" ? "link" : kind === "deadline" ? "deadline" : "board"; await tasks($("#cvBody") || body);
    } catch (x) { toast(errMsg(x), 5000); ev.target.disabled = false; $("#tkMsg").textContent = ""; }
  };
}
// Ảnh: thu nhỏ ≤ 1600px JPEG; PDF ≤ 10MB
async function prepare(f) {
  const b64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
  if (f.type === "application/pdf") { if (f.size > 10e6) { toast("PDF quá lớn (tối đa 10MB): " + f.name); return null; } return { name: f.name, mime: f.type, data: await b64(f) }; }
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = URL.createObjectURL(f); });
  if (!img) { toast("Không đọc được ảnh: " + f.name); return null; }
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
  return { name: f.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", data: await b64(blob), preview: c.toDataURL("image/jpeg", 0.5) };
}
