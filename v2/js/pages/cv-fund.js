// CV → 💵 Quỹ: thu chi của siêu thị (thay tool quỹ cũ dùng Firebase). Mọi thành viên xem & thêm; quản lý sửa/xoá (người tạo được sửa trong 24 giờ).
import { $, $$, esc, toast, modal, confirmBox, vnToday, dmy, dm, ymOf, shiftMonth, monthLabel, download, csv, copyText } from "../ui.js";
import { sb, S, rpc, notify, isManager, isOwner, visibleStaff, staffById, setting, errMsg } from "../store.js";

const money = (n) => (Number(n) || 0).toLocaleString("vi-VN") + "đ";
const short = (n) => { const v = Math.abs(Number(n) || 0), s = n < 0 ? "−" : ""; return v >= 1e9 ? s + (v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ" : v >= 1e6 ? s + (v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr" : s + v.toLocaleString("vi-VN") + "đ"; };
const cats = () => { const c = setting("FUND_CATEGORIES", []); return Array.isArray(c) ? c : []; };
const people = () => [...new Set([...visibleStaff().map((s) => s.name), ...(setting("FUND_PARTNERS", []) || [])])];
let F = { ym: "", kind: "", cat: "", person: "", q: "", edit: null }, ROWS = [];
const canEdit = (r) => isManager() || (r.created_by === S.me.email && Date.now() - new Date(r.created_at).getTime() < 864e5);

export async function fund(body, quiet = false) {
  if (!F.ym) F.ym = ymOf(vnToday());
  const { data, error } = await sb.from("fund_tx").select("*").order("tx_date", { ascending: false }).order("id", { ascending: false }).limit(5000);
  if (error) throw error;
  ROWS = data || [];
  // Cập nhật thời gian thực: đang nhập dở thì chỉ làm mới danh sách, không xoá form
  if (quiet && $("#fForm") && ($("#fTitle")?.value || $("#fAmt")?.value || F.edit)) { list(); log(); return; }
  draw(body);
}

function draw(body) {
  const all = ROWS, thu = sum(all, "thu"), chi = sum(all, "chi");
  const mon = all.filter((r) => r.tx_date.slice(0, 7) === F.ym), mThu = sum(mon, "thu"), mChi = sum(mon, "chi");
  const meName = staffById(S.me.staff_id)?.name || "";
  body.innerHTML = `
    ${isManager() ? `<div class="row fund-tele"><span class="small muted grow">Telegram tự gửi báo cáo quỹ theo lịch ở Quản lý → Telegram (mặc định thứ 2, 09:00).</span><button class="btn small" id="fTele" type="button">📤 Báo cáo Telegram</button></div>` : ""}
    <div class="fund-kpi">
      <div class="fk du"><small>Số dư quỹ</small><b>${money(thu - chi)}</b><span>Thu ${short(thu)} · Chi ${short(chi)}</span></div>
      <div class="fk thu"><small>Thu ${monthLabel(F.ym)}</small><b>+${short(mThu)}</b></div>
      <div class="fk chi"><small>Chi ${monthLabel(F.ym)}</small><b>−${short(mChi)}</b></div>
    </div>
    <div class="grid2" style="margin-bottom:14px">
      <div class="card" id="fForm"><div class="card-h"><h2>${F.edit ? "✏️ Sửa khoản" : "➕ Thêm khoản"}</h2>${F.edit ? '<button class="btn small ghost" id="fCancel" type="button">Huỷ sửa</button>' : ""}</div>
        <div class="seg fund-kind" id="fKind"><button type="button" data-k="thu" class="thu">💰 Thu</button><button type="button" data-k="chi" class="chi">💸 Chi</button></div>
        <div class="fields" style="margin-top:10px">
          <label style="grid-column:1/-1">Tên khoản<input id="fTitle" placeholder="VD: Mua nước, Thưởng thi đua…" maxlength="300"></label>
          <label>Số tiền (đ)<input id="fAmt" inputmode="numeric" placeholder="0" autocomplete="off"></label>
          <label>Ngày<input id="fDate" type="date" max="${addDaysStr(vnToday(), 31)}"></label>
          <label>Danh mục<select id="fCat"><option value="">— Chọn —</option>${cats().map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
          <label>Người chuyển / nhận<input id="fPerson" list="fPeople" placeholder="Chọn hoặc gõ tên"><datalist id="fPeople">${people().map((p) => `<option value="${esc(p)}">`).join("")}</datalist></label>
          <label style="grid-column:1/-1">Ghi chú<input id="fNote" placeholder="Tuỳ chọn" maxlength="500"></label>
        </div>
        <div class="chips fund-quick">${[50000, 100000, 200000, 500000, 1000000].map((v) => `<button class="chip" type="button" data-amt="${v}">${short(v)}</button>`).join("")}</div>
        <button class="btn primary big block" id="fSave" type="button" style="margin-top:10px">💾 ${F.edit ? "Lưu thay đổi" : "Lưu khoản"}</button></div>
      <div class="card"><div class="card-h"><h2>📊 Thống kê</h2><span class="small muted">${monthLabel(F.ym)} · chi theo danh mục</span></div>
        ${bars(group(mon.filter((r) => r.kind === "chi"), "category"), "chi") || '<p class="muted small">Chưa có khoản chi trong tháng.</p>'}
        <details style="margin-top:8px"><summary class="small"><b>Ai chuyển vào quỹ nhiều nhất</b> (mọi thời gian)</summary>${bars(group(all.filter((r) => r.kind === "thu"), "person").slice(0, 8), "thu") || '<p class="muted small">Chưa có.</p>'}</details>
        <details><summary class="small"><b>Ai nhận / chi nhiều nhất</b> (mọi thời gian)</summary>${bars(group(all.filter((r) => r.kind === "chi"), "person").slice(0, 8), "chi") || '<p class="muted small">Chưa có.</p>'}</details>
        <details><summary class="small"><b>Thu – chi 12 tháng</b></summary>${months12(all)}</details>
      </div>
    </div>
    <div class="card fund-hist"><div class="card-h"><h2>🧾 Lịch sử thu chi</h2>
        <div class="row"><button class="btn small" data-m="-1" type="button">‹</button><b>${F.ym === "all" ? "Tất cả" : monthLabel(F.ym)}</b><button class="btn small" data-m="1" type="button">›</button><button class="btn small ghost" data-m="all" type="button">Tất cả</button>
        <button class="btn small" id="fCopy" type="button">📋 Copy</button>${isManager() ? '<button class="btn small" id="fCsv" type="button">⬇️ CSV</button>' : ""}${isOwner() ? '<button class="btn small" id="fCats" type="button">🏷️ Danh mục</button>' : ""}</div></div>
      <div class="row fund-filter"><div class="seg" id="fFk"><button data-f="" type="button">Tất cả</button><button data-f="thu" type="button">Thu</button><button data-f="chi" type="button">Chi</button></div>
        <select id="fFc" style="width:auto"><option value="">Mọi danh mục</option>${[...new Set([...cats(), ...ROWS.map((r) => r.category).filter(Boolean)])].map((c) => `<option ${F.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <select id="fFp" style="width:auto"><option value="">Mọi người</option>${[...new Set([...people(), ...ROWS.map((r) => r.person).filter(Boolean)])].map((p) => `<option ${F.person === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
        <input id="fQ" placeholder="Tìm tên, ghi chú…" value="${esc(F.q)}" style="width:auto;flex:1;min-width:140px"></div>
      <div id="fList"></div>
      <details style="margin-top:10px"><summary class="small muted">Nhật ký thêm / sửa / xoá</summary><div id="fLog" class="small"></div></details></div>`;
  // form
  const setKind = (k) => { $$("#fKind button").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); $("#fKind").dataset.k = k; };
  const e = F.edit;
  setKind(e?.kind || "chi"); $("#fTitle").value = e?.title || ""; $("#fAmt").value = e ? Number(e.amount).toLocaleString("vi-VN") : "";
  $("#fDate").value = e?.tx_date || vnToday(); $("#fCat").value = e?.category || ""; $("#fPerson").value = e ? e.person : meName; $("#fNote").value = e?.note || "";
  if (e?.category && !cats().includes(e.category)) $("#fCat").insertAdjacentHTML("beforeend", `<option selected>${esc(e.category)}</option>`);
  $("#fKind").onclick = (ev) => { const b = ev.target.closest("[data-k]"); if (b) setKind(b.dataset.k); };
  $("#fTele")?.addEventListener("click", () => teleReport());
  $("#fAmt").oninput = (ev) => { const d = ev.target.value.replace(/\D/g, ""); ev.target.value = d ? Number(d).toLocaleString("vi-VN") : ""; };
  $$(".fund-quick [data-amt]").forEach((b) => b.onclick = () => { $("#fAmt").value = Number(b.dataset.amt).toLocaleString("vi-VN"); });
  $("#fCancel")?.addEventListener("click", () => { F.edit = null; draw(body); });
  $("#fSave").onclick = async (ev) => {
    const amount = Number($("#fAmt").value.replace(/\D/g, "")), title = $("#fTitle").value.trim(), kind = $("#fKind").dataset.k;
    if (!title) return toast("Nhập tên khoản"); if (!(amount > 0)) return toast("Nhập số tiền");
    if (!F.edit && !(await confirmBox(kind === "thu" ? "Lưu khoản THU?" : "Lưu khoản CHI?", `<b>${esc(title)}</b>: <b class="${kind === "thu" ? "pos" : "neg"}">${kind === "thu" ? "+" : "−"}${money(amount)}</b> · ${dmy($("#fDate").value)}${$("#fPerson").value ? " · " + esc($("#fPerson").value) : ""}`, "Lưu"))) return;
    ev.target.disabled = true;
    try {
      const res = await rpc("fund_save", { p_id: F.edit?.id ?? null, p_kind: kind, p_title: title, p_amount: amount, p_date: $("#fDate").value || vnToday(), p_category: $("#fCat").value, p_person: $("#fPerson").value.trim(), p_note: $("#fNote").value.trim() });
      toast(res.message); F.edit = null; await fund(body);
    } catch (x) { toast(errMsg(x), 4500); ev.target.disabled = false; }
  };
  // bộ lọc + danh sách
  $$("#fFk button").forEach((b) => b.classList.toggle("on", b.dataset.f === F.kind));
  $("#fFk").onclick = (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; F.kind = b.dataset.f; $$("#fFk button").forEach((x) => x.classList.toggle("on", x === b)); list(); };
  $("#fFc").onchange = (ev) => { F.cat = ev.target.value; list(); };
  $("#fFp").onchange = (ev) => { F.person = ev.target.value; list(); };
  $("#fQ").oninput = (ev) => { F.q = ev.target.value; list(); };
  body.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { F.ym = b.dataset.m === "all" ? "all" : shiftMonth(F.ym === "all" ? ymOf(vnToday()) : F.ym, Number(b.dataset.m)); draw(body); });
  $("#fCsv")?.addEventListener("click", () => download(`quy_${F.ym}.csv`, csv([["Ngày", "Loại", "Tên", "Số tiền", "Danh mục", "Người", "Ghi chú", "Người nhập"], ...filtered().map((r) => [r.tx_date, r.kind === "thu" ? "Thu" : "Chi", r.title, r.kind === "thu" ? r.amount : -r.amount, r.category, r.person, r.note, r.created_by])])));
  $("#fCopy").onclick = async () => { const L = filtered(); toast((await copyText([`💵 QUỸ ${F.ym === "all" ? "" : monthLabel(F.ym).toUpperCase()} — Thu ${money(sum(L, "thu"))} · Chi ${money(sum(L, "chi"))} · Dư quỹ ${money(thu - chi)}`, ...L.slice(0, 60).map((r) => `${dm(r.tx_date)} ${r.kind === "thu" ? "➕" : "➖"} ${money(r.amount)} · ${r.title}${r.person ? " · " + r.person : ""}`)].join("\n"))) ? "Đã copy" : "Không copy được"); };
  $("#fCats")?.addEventListener("click", editCats);
  $("#fList").onclick = async (ev) => {
    const ed = ev.target.closest("[data-fedit]"), del = ev.target.closest("[data-fdel]");
    if (ed) { F.edit = ROWS.find((r) => r.id === Number(ed.dataset.fedit)); draw(body); $("#fForm").scrollIntoView({ behavior: "smooth", block: "start" }); }
    if (del) { const r = ROWS.find((x) => x.id === Number(del.dataset.fdel)); if (!(await confirmBox("Xoá khoản này?", `<b>${esc(r.title)}</b> ${r.kind === "thu" ? "+" : "−"}${money(r.amount)} (${dmy(r.tx_date)}). Có ghi nhật ký.`, "Xoá", true))) return;
      try { toast((await rpc("fund_delete", { p_id: r.id })).message); await fund(body); } catch (x) { toast(errMsg(x), 4500); } }
  };
  list(); log();
}
function filtered() {
  const q = F.q.trim().toLowerCase();
  return ROWS.filter((r) => (F.ym === "all" || r.tx_date.slice(0, 7) === F.ym) && (!F.kind || r.kind === F.kind) && (!F.cat || r.category === F.cat) && (!F.person || r.person === F.person)
    && (!q || (r.title + " " + r.note + " " + r.person + " " + r.category).toLowerCase().includes(q)));
}
function list() {
  const L = filtered(), el = $("#fList"); if (!el) return;
  el.innerHTML = `<p class="small" style="margin:8px 0">${L.length} khoản · Thu <b class="pos">${money(sum(L, "thu"))}</b> · Chi <b class="neg">${money(sum(L, "chi"))}</b> · Chênh <b>${money(sum(L, "thu") - sum(L, "chi"))}</b></p>`
    + (L.length ? `<div class="tbl-wrap"><table class="fund-tbl"><thead><tr><th>Ngày</th><th>Khoản</th><th class="num">Số tiền</th><th>Danh mục</th><th>Người</th><th class="nosort"></th></tr></thead><tbody>
    ${L.slice(0, 500).map((r) => `<tr><td data-sortv="${dmy(r.tx_date)}">${dm(r.tx_date)}</td><td><b>${esc(r.title)}</b>${r.note ? `<div class="tiny muted">${esc(r.note)}</div>` : ""}<div class="tiny muted m-only">${esc([r.category, r.person].filter(Boolean).join(" · "))}</div></td>
      <td class="num ${r.kind === "thu" ? "pos" : "neg"}" data-sortv="${r.kind === "thu" ? r.amount : -r.amount}"><b>${r.kind === "thu" ? "+" : "−"}${money(r.amount)}</b></td>
      <td class="small">${esc(r.category)}</td><td class="small">${esc(r.person)}</td>
      <td class="num">${canEdit(r) ? `<button class="btn small ghost" data-fedit="${r.id}" type="button" title="Sửa">✏️</button><button class="btn small ghost danger" data-fdel="${r.id}" type="button" title="Xoá">🗑️</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Không có khoản nào.</div>`);
}
async function log() {
  const el = $("#fLog"); if (!el) return;
  const { data } = await sb.rpc("fund_log", { p_limit: 40 }); if (!$("#fLog")) return;
  const lab = { FUND_ADD: ["Thêm", "ok"], FUND_EDIT: ["Sửa", "info"], FUND_DELETE: ["Xoá", "bad"] };
  el.innerHTML = (data || []).length ? (data || []).map((l) => { const d = l.details || {}, x = d.after || d; const [t, c] = lab[l.action] || [l.action, "mute"];
    return `<div class="row" style="gap:8px;padding:4px 0;border-bottom:1px dashed var(--line)"><span class="pill ${c}">${t}</span><span class="grow">${esc(x.title || "")} · ${x.kind === "thu" ? "+" : "−"}${money(x.amount)}${d.before ? ` <span class="muted">(trước: ${money(d.before.amount)})</span>` : ""}</span><span class="tiny muted">${esc(l.actor || "")} · ${new Date(l.at).toLocaleString("vi-VN")}</span></div>`; }).join("") : '<p class="muted">Chưa có.</p>';
}
async function editCats() {
  const v = await modal(`<h3>🏷️ Danh mục quỹ</h3><form class="stack"><label>Mỗi dòng 1 danh mục (có thể thêm biểu tượng)<textarea name="c" style="min-height:240px">${esc(cats().join("\n"))}</textarea></label>
    <label>Người ngoài danh sách nhân viên (hãng, đối tác), mỗi dòng 1 tên<textarea name="p" style="min-height:90px">${esc((setting("FUND_PARTNERS", []) || []).join("\n"))}</textarea></label></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
  if (!v) return;
  const lines = (s) => [...new Set(String(s).split("\n").map((x) => x.trim()).filter(Boolean))];
  const now = new Date().toISOString();
  const { error } = await sb.from("settings").upsert([{ key: "FUND_CATEGORIES", value: lines(v.c), updated_by: S.me.email, updated_at: now }, { key: "FUND_PARTNERS", value: lines(v.p), updated_by: S.me.email, updated_at: now }]);
  if (error) return toast(errMsg(error)); const { loadSettings } = await import("../store.js"); await loadSettings(); toast("Đã lưu danh mục"); const b = $("#cvBody"); if (b) fund(b);
}
// ---- tiện ích ----
const sum = (L, k) => L.filter((r) => r.kind === k).reduce((a, r) => a + Number(r.amount), 0);
function group(L, key) { const m = new Map(); for (const r of L) { const k = r[key] || "(trống)"; m.set(k, (m.get(k) || 0) + Number(r.amount)); } return [...m].sort((a, b) => b[1] - a[1]); }
function bars(G, kind) { if (!G.length) return ""; const max = G[0][1]; return `<div class="fund-bars">${G.map(([n, v]) => `<div class="fb"><span class="fb-n">${esc(n)}</span><span class="fb-b"><i class="${kind}" style="width:${Math.max(3, (v / max) * 100)}%"></i></span><b>${short(v)}</b></div>`).join("")}</div>`; }
function months12(all) {
  const out = []; let ym = ymOf(vnToday());
  for (let i = 0; i < 12; i++) { const L = all.filter((r) => r.tx_date.slice(0, 7) === ym); out.push([ym, sum(L, "thu"), sum(L, "chi")]); ym = shiftMonth(ym, -1); }
  const max = Math.max(1, ...out.flatMap(([, a, b]) => [a, b]));
  return `<div class="fund-bars">${out.filter(([, a, b]) => a || b).map(([m, a, b]) => `<div class="fb"><span class="fb-n">${m.slice(5)}/${m.slice(0, 4)}</span><span class="fb-b two"><i class="thu" style="width:${(a / max) * 100}%"></i><i class="chi" style="width:${(b / max) * 100}%"></i></span><b><span class="pos">+${short(a)}</span> <span class="neg">−${short(b)}</span></b></div>`).join("") || '<p class="muted small">Chưa có.</p>'}</div>`;
}
function addDaysStr(d, n) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// 📤 Báo cáo quỹ qua Telegram (quản lý): chọn khoảng ngày → xem trước → gửi vào nhóm (Edge Function notify, đầu mục "fund")
async function teleReport() {
  const today = vnToday(); let ref = {};
  const v = await modal(`<h3>📤 Báo cáo quỹ qua Telegram</h3>
    <p class="small muted" style="margin:-4px 0 10px">Chi tiết từng khoản thu / chi, tổng thu, tổng chi, số dư. <b>Từ ngày</b> bỏ trống = từ lần gửi báo cáo quỹ trước.</p>
    <div class="fields"><label>Từ ngày<input type="date" id="ftFrom" max="${today}"></label><label>Đến ngày<input type="date" id="ftTo" value="${today}" max="${today}"></label></div>
    <div class="row" style="gap:6px;margin-top:8px"><button type="button" class="chip" data-ft="7">7 ngày</button><button type="button" class="chip" data-ft="m">Từ đầu tháng</button><button type="button" class="chip" data-ft="">Từ lần gửi trước</button></div>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="preview">👀 Xem trước</button></div>`, {
    onOpen(box) {
      ref = { from: box.querySelector("#ftFrom"), to: box.querySelector("#ftTo") };
      box.querySelectorAll("[data-ft]").forEach((b) => b.onclick = () => { const to = ref.to.value || today, k = b.dataset.ft;
        ref.from.value = k === "7" ? addDaysStr(to, -6) : k === "m" ? to.slice(0, 8) + "01" : ""; });
    },
  });
  if (v !== "preview") return;
  const args = { kind: "fund", date: ref.to.value || today, from: ref.from.value || "" };
  try {
    const r = await notify({ mode: "preview", ...args });
    const text = String(r.text || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const go = await modal(`<h3>👀 Xem trước báo cáo quỹ</h3><pre class="preview" style="max-height:55vh;overflow:auto;white-space:pre-wrap">${esc(text)}</pre>
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button><button class="btn primary" data-v="send">📤 Gửi vào nhóm Telegram</button></div>`);
    if (go !== "send") return;
    toast((await notify({ mode: "send", ...args })).message || "Đã gửi");
  } catch (x) { toast(errMsg(x), 5000); }
}
