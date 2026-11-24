// 📋 Giao việc (D12, quản lý): 📊 Hôm nay · ➕ Giao việc · 📈 Thống kê (NV × ngày × hạng mục, số ảnh) · 🗂️ Hạng mục · 🗓️ Lịch ca · 🤖 Xếp ca (D17, jobs-xepca.js) · ⚙️ Cài đặt
import { $, $$, esc, toast, modal, confirmBox, vnToday, addDays, dm, dow, dmy, shortName, csv, download, weekStart, monthStart } from "../ui.js";
import { sb, S, rpc, callFn, onChange, setting, staffById, visibleStaff, errMsg, depts, loadSettings } from "../store.js";
import { loadTypes, typeOf, typeLabel, stateOf, STATE, vnAt, whenTxt, nPhotos, thumb, openManage, minsTxt } from "../jobs-common.js";
import { rtTab } from "./jobs-rt.js";
import { xepTab } from "./jobs-xepca.js";
import { parseShiftAoa, matchStaff, readSheet, slotText } from "../lib-shift.js";

const TABS = [["board", "📊 Hôm nay"], ["assign", "➕ Giao việc"], ["ticker", "📢 Chữ chạy"], ["rt", "🔁 Lặp lại"], ["stats", "📈 Thống kê"], ["types", "🗂️ Hạng mục"], ["shift", "🗓️ Lịch ca"], ["xep", "🤖 Xếp ca"], ["cfg", "⚙️ Cài đặt"]];
let tab = "board", root, folders = {}, busyDraw = 0;
const V = { day: vnToday(), dept: "", from: weekStart(vnToday()), to: vnToday(), type: "", who: "", sweek: weekStart(vnToday()) };
const err = (e) => toast(errMsg(e), 5000);
const vnStart = (d) => new Date(`${d}T00:00:00+07:00`).toISOString();
const staffList = () => visibleStaff().filter((s) => !V.dept || s.dept === V.dept);
async function saveSetting(key, value) {
  const { error } = await sb.from("settings").upsert({ key, value, updated_by: S.me.email, updated_at: new Date().toISOString() });
  if (error) throw new Error(/row-level|permission/i.test(error.message) ? "Chỉ chủ quản đổi được cài đặt này." : error.message);
  await loadSettings();
}
async function loadFolders() {
  const { data } = await sb.from("job_folders").select("staff_id,folder_url");
  folders = Object.fromEntries((data || []).map((f) => [f.staff_id, f.folder_url]));
}

export async function render(view) {
  root = view;
  try { tab = localStorage.getItem("thidua-v2-jobs") || tab; } catch { /* bỏ qua */ }
  view.innerHTML = `<div class="page-h"><div><h1>📋 Giao việc</h1><p>Giao việc cho NV, xem ảnh nộp về Google Drive theo từng NV và hạng mục, thống kê, lịch ca</p></div></div>
    <div class="subtabs" id="jTabs"></div><div id="jBody"></div>`;
  $("#jTabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; try { localStorage.setItem("thidua-v2-jobs", tab); } catch { /* bỏ qua */ } draw(); };
  await loadTypes(true).catch(() => {});
  await draw();
  const off = onChange((w) => { if (w === "jobs" && ["board", "stats"].includes(tab) && $("#jBody")) draw(true); });
  return () => off();
}
async function draw(quiet = false) {
  $("#jTabs").innerHTML = TABS.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("");
  const body = $("#jBody"), t = ++busyDraw;
  if (!quiet) body.innerHTML = `<div class="empty">Đang tải…</div>`;
  body.onclick = null; body.onchange = null; body.oninput = null;
  try { await ({ board, assign, ticker: (b, a) => import("../ticker.js").then((m) => m.tickerTab(b, a)), rt: rtTab, stats, types, shift, xep: xepTab, cfg })[tab](body, () => t === busyDraw && $("#jBody") === body); }
  catch (e) { if ($("#jBody")) body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}
const deptChips = () => `<div class="chips">${["", ...depts()].map((d) => `<button type="button" class="chip ${V.dept === d ? "on" : ""}" data-dept="${esc(d)}">${d ? esc(d) : "Tất cả bộ phận"}</button>`).join("")}</div>`;

// =================== 📊 Hôm nay ===================
async function board(body, alive) {
  const d = V.day, from = vnStart(d), to = vnStart(addDays(d, 1));
  const [jr, or, sr, push] = await Promise.all([
    sb.from("jobs").select("*").gte("due_at", from).lt("due_at", to).order("due_at"),
    sb.from("jobs").select("*").eq("status", "todo").lt("due_at", from).gte("due_at", new Date(Date.parse(from) - 3 * 864e5).toISOString()).order("due_at"),
    sb.from("shifts").select("staff_id,slots").eq("d", d),
    rpc("push_overview").catch(() => ({})),
    loadFolders(),
  ]);
  if (jr.error) throw jr.error;
  if (!alive()) return;
  const staff = staffList(), ids = new Set(staff.map((s) => s.id));
  const jobs = [...(or.data || []), ...(jr.data || [])].filter((j) => ids.has(j.staff_id));
  const sh = new Map((sr.data || []).map((x) => [x.staff_id, x.slots || []]));
  const now = Date.now(), cnt = (f) => jobs.filter(f).length;
  const st = (j) => stateOf(j, now);
  const slots = setting("SHIFT_SLOTS", []);
  const rows = staff.map((s) => ({ s, js: jobs.filter((j) => j.staff_id === s.id) }))
    .sort((a, b) => b.js.filter((j) => st(j) === "over").length - a.js.filter((j) => st(j) === "over").length || b.js.length - a.js.length);
  const shown = rows.filter((r) => r.js.length || sh.has(r.s.id)), idle = rows.filter((r) => !r.js.length && !sh.has(r.s.id));
  body.innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn small" data-day="-1" type="button">‹</button><input type="date" id="bDay" value="${d}" style="width:auto"><button class="btn small" data-day="1" type="button">›</button><button class="btn small ghost" data-day="0" type="button">Hôm nay</button><span class="grow"></span>${deptChips()}</div>
    <div class="stats">
      <div class="stat"><small>Việc trong ngày</small><b>${cnt((j) => vnAt(j.due_at).date === d)}</b></div>
      <div class="stat"><small>Đã nộp</small><b style="color:var(--ok)">${cnt((j) => j.status === "done")}</b><span class="tiny muted">${cnt((j) => st(j) === "late")} trễ</span></div>
      <div class="stat"><small>Chưa nộp</small><b>${cnt((j) => j.status === "todo")}</b><span class="tiny muted">${cnt((j) => st(j) === "over")} quá hạn</span></div>
      <div class="stat"><small>Bỏ lỡ</small><b style="color:var(--bad)">${cnt((j) => j.status === "missed")}</b></div>
      <div class="stat"><small>Ảnh đã nộp</small><b>${jobs.reduce((a, j) => a + nPhotos(j), 0)}</b></div>
    </div>
    ${!jobs.length ? `<div class="empty">Chưa có việc nào ${d === vnToday() ? "hôm nay" : "ngày " + dmy(d)}. <a href="#" class="linkish" data-goassign>➕ Giao việc</a></div>` : ""}
    <div class="jb-board">${shown.map(({ s, js }) => {
      const over = js.filter((j) => st(j) === "over").length, done = js.filter((j) => j.status === "done").length;
      const sl = sh.get(s.id);
      return `<div class="jb-row ${over ? "has-over" : ""}">
        <div class="jb-who" data-sid="${esc(s.id)}"><b>${esc(s.name)}</b><span class="tiny muted">${esc(s.dept)}${sl ? " · " + (sl.length ? esc(slotText(sl, slots)) : "OFF") : ""}${push[s.id] ? " · 🔔" : js.length ? ' · <span class="c-bad" title="Chưa bật thông báo trên điện thoại">🔕</span>' : ""}</span></div>
        <div class="jb-chips">${js.map((j) => { const x = st(j); return `<button type="button" class="jb-chip st-${x}" data-mj="${j.id}" title="${esc(STATE[x][1])} · hạn ${esc(whenTxt(j.due_at))}${j.status === "todo" ? (j.seen_at ? " · đã xem " + esc(whenTxt(j.seen_at)) : " · chưa mở xem") : ""}">${typeOf(j.type_id)?.icon || "📌"} ${esc(j.title.length > 26 ? j.title.slice(0, 25) + "…" : j.title)} <small>${vnAt(j.due_at).hm}${nPhotos(j) ? " · " + nPhotos(j) + "📷" : ""}${j.status === "todo" && j.seen_at ? " · 👀" : ""}</small></button>`; }).join("") || `<span class="tiny muted">Không có việc</span>`}</div>
        <div class="jb-act"><span class="small"><b>${done}/${js.length}</b></span>${over ? `<button class="btn small" type="button" data-nudge="${esc(s.id)}" title="Gửi thông báo nhắc">🔔 Nhắc</button>` : ""}${folders[s.id] ? `<a class="btn small ghost" href="${esc(folders[s.id])}" target="_blank" rel="noopener" title="Thư mục ảnh trên Drive">📁</a>` : ""}</div></div>`;
    }).join("")}</div>
    ${idle.length ? `<p class="small muted" style="margin-top:10px">Không có việc, không có lịch ca: ${idle.map((r) => esc(shortName(r.s.name))).join(", ")}</p>` : ""}`;
  $("#bDay").onchange = (e) => { V.day = e.target.value || vnToday(); draw(); };
  body.onclick = async (e) => {
    const dd = e.target.closest("[data-day]"); if (dd) { V.day = dd.dataset.day === "0" ? vnToday() : addDays(V.day, Number(dd.dataset.day)); return draw(); }
    const dp = e.target.closest("[data-dept]"); if (dp) { V.dept = dp.dataset.dept; return draw(); }
    if (e.target.closest("[data-goassign]")) { e.preventDefault(); tab = "assign"; return draw(); }
    const mj = e.target.closest("[data-mj]"); if (mj) { const j = jobs.find((x) => String(x.id) === mj.dataset.mj); if (j && (await openManage(j, folders))) draw(true); return; }
    const n = e.target.closest("[data-nudge]");
    if (n) {
      const list = jobs.filter((j) => j.staff_id === n.dataset.nudge && st(j) === "over");
      try { const r = await callFn("push", { mode: "send", ids: [n.dataset.nudge], title: `⚠️ ${list.length} việc quá hạn`, body: list.slice(0, 4).map((j) => "• " + j.title).join("\n") + "\nMở tool để nộp ảnh", tag: "jobs-over", jobs: list.map((j) => j.id) }); toast(r.message, 4000); } catch (x) { err(x); }
    }
  };
}

// =================== ➕ Giao việc ===================
async function assign(body, alive) {
  const types = (S.jobTypes || []).filter((t) => t.active);
  const slots = setting("SHIFT_SLOTS", []);
  const A = { mode: "shift", proof: "photo", sel: new Set(), slots: new Set(), depts: new Set(), date: vnToday(), shifts: new Map(), busy: new Map() };
  body.innerHTML = `<form class="card stack" id="asForm" autocomplete="off">
    <div class="fields"><label>Hạng mục<select name="type_id">${types.map((t) => `<option value="${t.id}">${esc(t.icon)} ${esc(t.name)}</option>`).join("")}<option value="">📌 Không phân loại</option></select></label>
      <label style="grid-column:span 2">Tên việc<input name="title" required minlength="3" maxlength="150" placeholder="VD: Vệ sinh kệ iPhone, chụp trước và sau"></label></div>
    <label>Hướng dẫn / tiêu chí đạt (NV đọc khi nộp)<textarea name="detail" rows="3" maxlength="2000" placeholder="Làm gì, chụp góc nào, cần thấy rõ điều gì…"></textarea></label>
    <div class="fields"><label>Ngày hạn<input type="date" name="due_date" id="asDate" value="${A.date}" required></label><label>Giờ hạn<input type="time" name="due_hm" value="21:00" required></label>
      <label title="Bỏ trống = chỉ 1 ngày">Lặp mỗi ngày đến (tuỳ chọn)<input type="date" name="repeat_until" id="asRep"></label></div>
    <div><b>Người làm</b> <span class="small muted" id="asCount"></span></div>
    <div class="seg" id="asMode"><button type="button" data-m="shift" class="on">Theo ca làm</button><button type="button" data-m="pick">Chọn người</button><button type="button" data-m="dept">Cả bộ phận</button></div>
    <div id="asWho"></div>
    <div><b>Minh chứng</b></div>
    <div class="seg" id="asProof"><button type="button" data-p="photo" class="on">📷 Ảnh</button><button type="button" data-p="check">☑️ Checklist + ảnh</button><button type="button" data-p="none">✅ Chỉ bấm hoàn thành</button><button type="button" data-p="info">📢 Thông báo (bấm Đã nhận)</button></div>
    <div id="asProofX"></div>
    <div class="fields"><label>⭐ Trừ khi nộp trễ<input type="number" name="pen_late" min="0" step="50" value="0"></label><label>⭐ Trừ khi bỏ lỡ<input type="number" name="pen_miss" min="0" step="50" value="0"></label></div>
    <p class="small muted">Bỏ lỡ = quá hạn ${esc(setting("JOB_MISS_HOURS", 24))} giờ mà chưa nộp. Giao xong NV thấy ngay ở trang 🏠 Hôm nay; máy đã bật thông báo nhận tin trong ≤ 5 phút, ${esc(setting("JOB_REMIND_BEFORE_MIN", 60))} phút trước hạn được nhắc lại.</p>
    <div class="row"><button class="btn primary" type="submit">📌 Giao việc</button><span class="small muted" id="asMsg"></span></div></form>`;
  const f = $("#asForm");
  async function loadDay() {
    const [sr, br] = await Promise.all([sb.from("shifts").select("staff_id,slots").eq("d", A.date), sb.from("busy").select("staff_id,type,shifts").eq("busy_date", A.date)]);
    A.shifts = new Map((sr.data || []).map((x) => [x.staff_id, x.slots || []]));
    A.busy = new Map((br.data || []).map((x) => [x.staff_id, x]));
  }
  const offTxt = (id) => { const b = A.busy.get(id), s = A.shifts.get(id); return s && !s.length ? "OFF" : b ? (b.type === "OFF" ? "đăng ký OFF" : "bận ca " + (b.shifts || []).join(",")) : ""; };
  function who() {
    const box = $("#asWho"); if (!box) return;
    const all = visibleStaff();
    if (A.mode === "shift") {
      if (!A.shifts.size) { box.innerHTML = `<div class="banner warn"><div>Chưa có lịch ca ngày ${dmy(A.date)} (tab 🗓️ Lịch ca). Dùng <b>Chọn người</b> hoặc <b>Cả bộ phận</b>.</div></div>`; A.sel.clear(); count(); return; }
      if (!A.slots.size) [1, 2, 3, 4, 5, 6].forEach((x) => A.slots.add(x));
      const inShift = all.filter((s) => (A.shifts.get(s.id) || []).some((x) => A.slots.has(x)));
      A.sel = new Set([...A.sel].filter((id) => inShift.some((s) => s.id === id)));
      if (!A.sel.size) inShift.forEach((s) => A.sel.add(s.id));
      box.innerHTML = `<div class="chips" style="margin-bottom:8px">${[1, 2, 3, 4, 5, 6].map((x) => `<button type="button" class="chip ${A.slots.has(x) ? "on" : ""}" data-slot="${x}">Ca ${x}${slots[x - 1] ? ` <small>${esc(slots[x - 1])}</small>` : ""}</button>`).join("")}</div>
        <div class="as-people">${inShift.map((s) => pick(s)).join("") || `<span class="small muted">Không có ai làm các ca đã chọn.</span>`}</div>`;
    } else if (A.mode === "pick") {
      box.innerHTML = depts().map((d) => { const l = all.filter((s) => s.dept === d); return l.length ? `<div class="as-group"><div class="small"><b>${esc(d)}</b> <a href="#" class="linkish" data-alld="${esc(d)}">chọn cả nhóm</a></div><div class="as-people">${l.map((s) => pick(s)).join("")}</div></div>` : ""; }).join("");
    } else {
      box.innerHTML = `<div class="chips">${depts().map((d) => `<button type="button" class="chip ${A.depts.has(d) ? "on" : ""}" data-dp="${esc(d)}">${esc(d)} (${all.filter((s) => s.dept === d).length})</button>`).join("")}</div>
        <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="asSkipOff" checked> Bỏ người OFF / đăng ký OFF ngày đó</label>`;
      deptSel();
    }
    count();
  }
  function deptSel() {
    const skip = $("#asSkipOff")?.checked !== false;
    A.sel = new Set(visibleStaff().filter((s) => A.depts.has(s.dept) && !(skip && /OFF/.test(offTxt(s.id)))).map((s) => s.id));
  }
  const pick = (s) => { const o = offTxt(s.id); return `<label class="as-p ${o ? "off" : ""}"><input type="checkbox" data-pp="${esc(s.id)}" ${A.sel.has(s.id) ? "checked" : ""}> ${esc(s.name)}${o ? ` <small>(${esc(o)})</small>` : ""}${A.mode === "shift" ? ` <small>${esc(slotText(A.shifts.get(s.id), slots).replace(/ · .*/, ""))}</small>` : ""}</label>`; };
  const count = () => { const c = $("#asCount"); if (c) c.textContent = A.sel.size ? `· đã chọn ${A.sel.size} người` : "· chưa chọn ai"; };
  function proofX() {
    const x = $("#asProofX"); if (!x) return;
    x.innerHTML = A.proof === "info" ? `<p class="small muted">Việc thông báo (họp, học, triển khai…): NV đọc rồi bấm 👍 Đã nhận, không cần ảnh. Có giờ diễn ra thì tool nhắc trước 60 và 15 phút, thẻ việc hiện "📅 Diễn ra …".</p>
        <div class="fields"><label>Ngày diễn ra (trống = ngày hạn)<input type="date" name="event_date"></label><label>Giờ diễn ra (tuỳ chọn)<input type="time" name="event_hm"></label></div>`
      : A.proof === "none" ? `<p class="small muted">NV chỉ bấm Hoàn thành (ảnh không bắt buộc).</p>`
      : `${A.proof === "check" ? `<label>Các mục checklist (mỗi dòng 1 mục)<textarea name="checklist" rows="4" placeholder="Lau kính\nXếp máy demo thẳng hàng\nGom dây sạc"></textarea></label>` : ""}
        <div class="fields"><label>Số ảnh tối thiểu<input type="number" name="photo_min" min="${A.proof === "check" ? 0 : 1}" max="10" value="${A.proof === "check" ? 1 : 2}"></label><label>Số ảnh tối đa<input type="number" name="photo_max" min="1" max="10" value="6"></label></div>`;
  }
  await loadDay(); if (!alive()) return;
  who(); proofX();
  $("#asDate").onchange = async (e) => { A.date = e.target.value || vnToday(); A.sel.clear(); await loadDay(); who(); };
  f.onclick = (e) => {
    const m = e.target.closest("[data-m]"); if (m) { A.mode = m.dataset.m; $$("#asMode button").forEach((b) => b.classList.toggle("on", b === m)); A.sel.clear(); who(); return; }
    const p = e.target.closest("[data-p]"); if (p) { A.proof = p.dataset.p; $$("#asProof button").forEach((b) => b.classList.toggle("on", b === p)); proofX(); return; }
    const sl = e.target.closest("[data-slot]"); if (sl) { const x = Number(sl.dataset.slot); A.slots.has(x) ? A.slots.delete(x) : A.slots.add(x); A.sel.clear(); who(); return; }
    const dp = e.target.closest("[data-dp]"); if (dp) { const d = dp.dataset.dp; A.depts.has(d) ? A.depts.delete(d) : A.depts.add(d); who(); return; }
    const ad = e.target.closest("[data-alld]"); if (ad) { e.preventDefault(); const l = visibleStaff().filter((s) => s.dept === ad.dataset.alld); const all = l.every((s) => A.sel.has(s.id)); l.forEach((s) => all ? A.sel.delete(s.id) : A.sel.add(s.id)); who(); }
  };
  f.onchange = (e) => {
    const pp = e.target.closest("[data-pp]"); if (pp) { pp.checked ? A.sel.add(pp.dataset.pp) : A.sel.delete(pp.dataset.pp); count(); }
    if (e.target.id === "asSkipOff") { deptSel(); count(); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f));
    if (!A.sel.size) return toast("Chọn ít nhất 1 nhân viên");
    const p = { ...fd, proof: A.proof, staff_ids: [...A.sel], checklist: String(fd.checklist || "").split("\n").map((x) => x.trim()).filter(Boolean) };
    if (A.proof === "none") { p.photo_min = 0; p.photo_max = 6; }
    if (A.proof === "info") { p.proof = "none"; p.info = true; p.photo_min = 0; p.photo_max = 6; }   // D23 việc thông báo
    const btn = e.submitter; btn.disabled = true;
    try {
      const r = await rpc("job_assign", { p });
      toast(r.message, 4500);
      // D22: báo ngay cho NV được giao để sắp xếp thời gian làm
      if (r.batch) callFn("push", { mode: "job_new", batch: r.batch }).then((x) => toast(`${r.message} · 🔔 ${x.message}`, 5000)).catch(() => {});
      V.day = fd.due_date; tab = "board"; draw();
    } catch (x) { err(x); btn.disabled = false; }
  };
}

// =================== 📈 Thống kê ===================
async function stats(body, alive) {
  const { from, to } = V;
  const [jr] = await Promise.all([
    sb.from("jobs").select("id,type_id,staff_id,title,due_at,status,done_at,late_min,penalty,photos,note").gte("due_at", vnStart(from)).lt("due_at", vnStart(addDays(to, 1))).order("due_at").limit(5000),
    loadFolders(),
  ]);
  if (jr.error) throw jr.error;
  if (!alive()) return;
  const staff = staffList(), ids = new Set(staff.map((s) => s.id));
  const jobs = (jr.data || []).filter((j) => ids.has(j.staff_id) && (!V.type || String(j.type_id || "") === V.type));
  const now = Date.now(), st = (j) => stateOf(j, now);
  const agg = (l) => ({ n: l.length, done: l.filter((j) => j.status === "done").length, ontime: l.filter((j) => st(j) === "done").length, late: l.filter((j) => st(j) === "late").length,
    miss: l.filter((j) => j.status === "missed").length, open: l.filter((j) => j.status === "todo").length, ph: l.reduce((a, j) => a + nPhotos(j), 0), pen: l.reduce((a, j) => a + (j.penalty || 0), 0) });
  const pct = (a, b) => (b ? Math.round((a * 100) / b) + "%" : "—");
  const T = agg(jobs);
  const days = []; for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
  const per = staff.map((s) => ({ s, l: jobs.filter((j) => j.staff_id === s.id) })).filter((x) => x.l.length).map((x) => ({ ...x, a: agg(x.l) }))
    .sort((a, b) => (b.a.ontime / b.a.n) - (a.a.ontime / a.a.n) || b.a.ph - a.a.ph);
  const types = [...new Set(jobs.map((j) => j.type_id || 0))].map((id) => ({ id, l: jobs.filter((j) => (j.type_id || 0) === id) }));
  const cell = (l) => {
    if (!l.length) return `<td class="num muted">·</td>`;
    const a = agg(l), cls = a.miss ? "c-miss" : a.open ? (l.some((j) => st(j) === "over") ? "c-over" : "c-open") : a.late ? "c-late" : "c-ok";
    return `<td class="num ${cls}" title="${a.done}/${a.n} đã nộp · ${a.ph} ảnh${a.late ? ` · ${a.late} trễ` : ""}${a.miss ? ` · ${a.miss} bỏ lỡ` : ""}">${a.ph || (a.done ? "✓" : "–")}</td>`;
  };
  const W = V.who && per.find((x) => x.s.id === V.who);
  body.innerHTML = `<div class="row" style="margin-bottom:10px;gap:6px">
      <button class="btn small" type="button" data-rg="today">Hôm nay</button><button class="btn small" type="button" data-rg="week">Tuần này</button><button class="btn small" type="button" data-rg="lastweek">Tuần trước</button><button class="btn small" type="button" data-rg="month">Tháng này</button>
      <input type="date" id="sFrom" value="${from}" style="width:auto"> – <input type="date" id="sTo" value="${to}" style="width:auto">
      <select id="sType" style="width:auto"><option value="">Mọi hạng mục</option>${(S.jobTypes || []).map((t) => `<option value="${t.id}" ${V.type === String(t.id) ? "selected" : ""}>${esc(t.icon)} ${esc(t.name)}</option>`).join("")}</select>
      <button class="btn small ghost" type="button" id="sCsv">⬇️ CSV</button></div>
    ${deptChips()}
    <div class="stats" style="margin-top:10px">
      <div class="stat"><small>Việc</small><b>${T.n}</b></div><div class="stat"><small>Đã nộp</small><b style="color:var(--ok)">${T.done}</b><span class="tiny muted">đúng hạn ${pct(T.ontime, T.n)}</span></div>
      <div class="stat"><small>Nộp trễ</small><b style="color:var(--warn)">${T.late}</b></div><div class="stat"><small>Bỏ lỡ</small><b style="color:var(--bad)">${T.miss}</b><span class="tiny muted">${T.pen ? `đã trừ ${T.pen}⭐` : ""}</span></div>
      <div class="stat"><small>Chưa nộp</small><b>${T.open}</b></div><div class="stat"><small>Ảnh</small><b>${T.ph}</b></div></div>
    ${!jobs.length ? `<div class="empty">Không có việc trong khoảng này.</div>` : `
    ${W ? whoPanel(W) : ""}
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>👥 Theo nhân viên</h3><span class="small muted">bấm tên để xem từng việc và ảnh</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th class="num">Việc</th><th class="num">Đã nộp</th><th class="num">Đúng hạn</th><th class="num">Trễ</th><th class="num">Bỏ lỡ</th><th class="num">Ảnh</th><th class="num">⭐ trừ</th><th class="nosort"></th></tr></thead><tbody>
      ${per.map(({ s, a }) => `<tr class="${V.who === s.id ? "sel" : ""}"><td><a href="#" class="linkish" data-who="${esc(s.id)}">${esc(s.name)}</a> <span class="tiny muted">${esc(s.dept)}</span></td><td class="num">${a.n}</td><td class="num">${a.done}</td><td class="num"><b>${pct(a.ontime, a.n)}</b></td><td class="num">${a.late || ""}</td><td class="num" style="color:var(--bad)">${a.miss || ""}</td><td class="num">${a.ph}</td><td class="num">${a.pen ? "−" + a.pen : ""}</td><td>${folders[s.id] ? `<a href="${esc(folders[s.id])}" target="_blank" rel="noopener" title="Thư mục ảnh trên Drive">📁</a>` : ""}</td></tr>`).join("")}
      </tbody></table></div></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>📅 Nhân viên × ngày</h3><span class="small muted">số ảnh đã nộp · <span class="c-ok">xanh</span> đúng hạn · <span class="c-late">vàng</span> trễ · <span class="c-over">cam</span> quá hạn · <span class="c-miss">đỏ</span> bỏ lỡ</span></div>
      <div class="tbl-wrap"><table class="jb-grid nosort"><thead><tr><th>NV</th>${days.map((d) => `<th class="num">${dow(d)}<br>${dm(d)}</th>`).join("")}</tr></thead><tbody>
      ${per.map(({ s, l }) => `<tr><td style="white-space:nowrap">${esc(shortName(s.name))}</td>${days.map((d) => cell(l.filter((j) => vnAt(j.due_at).date === d))).join("")}</tr>`).join("")}
      </tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>🗂️ Theo hạng mục</h3></div>
      <div class="tbl-wrap"><table><thead><tr><th>Hạng mục</th><th class="num">Việc</th><th class="num">Đã nộp</th><th class="num">Đúng hạn</th><th class="num">Trễ</th><th class="num">Bỏ lỡ</th><th class="num">Ảnh</th></tr></thead><tbody>
      ${types.map(({ id, l }) => { const a = agg(l); return `<tr><td>${esc(typeLabel(id || null))}</td><td class="num">${a.n}</td><td class="num">${a.done}</td><td class="num"><b>${pct(a.ontime, a.n)}</b></td><td class="num">${a.late || ""}</td><td class="num" style="color:var(--bad)">${a.miss || ""}</td><td class="num">${a.ph}</td></tr>`; }).join("")}
      </tbody></table></div></div>`}`;
  const range = { today: [vnToday(), vnToday()], week: [weekStart(vnToday()), vnToday()], lastweek: [addDays(weekStart(vnToday()), -7), addDays(weekStart(vnToday()), -1)], month: [monthStart(vnToday()), vnToday()] };
  body.onclick = async (e) => {
    const rg = e.target.closest("[data-rg]"); if (rg) { [V.from, V.to] = range[rg.dataset.rg]; return draw(); }
    const dp = e.target.closest("[data-dept]"); if (dp) { V.dept = dp.dataset.dept; return draw(); }
    const w = e.target.closest("[data-who]"); if (w) { e.preventDefault(); V.who = V.who === w.dataset.who ? "" : w.dataset.who; return draw(); }
    const mj = e.target.closest("[data-mj]"); if (mj) { const { data } = await sb.from("jobs").select("*").eq("id", mj.dataset.mj).single(); if (data && (await openManage(data, folders))) draw(true); return; }
    if (e.target.closest("#sCsv")) {
      const rows = [["Ngày", "Giờ hạn", "Hạng mục", "Việc", "Mã NV", "Nhân viên", "Bộ phận", "Trạng thái", "Nộp lúc", "Trễ (phút)", "Số ảnh", "Sao trừ", "Ghi chú", "Link ảnh"]];
      for (const j of jobs) { const s = staffById(j.staff_id), due = vnAt(j.due_at); rows.push([due.date, due.hm, typeOf(j.type_id)?.name || "", j.title, j.staff_id, s?.name || "", s?.dept || "", STATE[st(j)][1], j.done_at ? whenTxt(j.done_at) : "", j.late_min || "", nPhotos(j), j.penalty || "", j.note || "", (j.photos || []).map((p) => p.url).join(" ")]); }
      download(`cong-viec_${from}_${to}.csv`, csv(rows));
    }
  };
  body.onchange = (e) => {
    if (e.target.id === "sFrom" || e.target.id === "sTo") { V.from = $("#sFrom").value || V.from; V.to = $("#sTo").value || V.to; if (V.to < V.from) V.to = V.from; draw(); }
    if (e.target.id === "sType") { V.type = e.target.value; draw(); }
  };
}
function whoPanel({ s, l }) {
  const list = [...l].sort((a, b) => b.due_at.localeCompare(a.due_at));
  return `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>🧑 ${esc(s.name)} · ${list.length} việc</h3>${folders[s.id] ? `<a class="btn small" href="${esc(folders[s.id])}" target="_blank" rel="noopener">📁 Thư mục ảnh trên Drive</a>` : ""}<button class="btn small ghost" type="button" data-who="${esc(s.id)}">✕</button></div>
    <div class="jb-hist">${list.map((j) => { const x = stateOf(j); return `<div class="jb-h"><div class="row"><span class="pill ${STATE[x][2]}">${STATE[x][0]} ${STATE[x][1]}</span><b class="grow"><a href="#" class="linkish" data-mj="${j.id}">${esc(typeOf(j.type_id)?.icon || "📌")} ${esc(j.title)}</a></b><span class="small muted">hạn ${esc(whenTxt(j.due_at))}${j.done_at ? " · nộp " + esc(whenTxt(j.done_at)) : ""}${j.late_min ? " · trễ " + minsTxt(j.late_min) : ""}</span></div>
      ${nPhotos(j) ? `<div class="jb-photos">${j.photos.map((f, i) => `<span class="jb-th"><a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${thumb(f, 300)}" alt="Ảnh ${i + 1}" loading="lazy"></a></span>`).join("")}</div>` : ""}${j.note ? `<div class="small">📝 ${esc(j.note)}</div>` : ""}</div>`; }).join("")}</div></div>`;
}

// =================== 🗂️ Hạng mục ===================
async function types(body) {
  await loadTypes(true);
  const row = (t = {}) => `<tr data-id="${t.id || ""}"><td><input name="icon" value="${esc(t.icon || "📌")}" style="width:56px;text-align:center"></td><td><input name="name" value="${esc(t.name || "")}" placeholder="Tên hạng mục"></td>
    <td><input name="sort" type="number" value="${t.sort ?? 0}" style="width:70px"></td><td class="num"><input type="checkbox" name="active" ${t.active !== false ? "checked" : ""}></td><td class="num"><input type="checkbox" name="tg" ${t.tg !== false ? "checked" : ""}></td>
    <td><button class="btn small primary" type="button" data-save>💾</button> ${t.id ? `<button class="btn small ghost danger" type="button" data-del>🗑️</button>` : ""}</td></tr>`;
  body.innerHTML = `<div class="card"><div class="card-h"><h3>🗂️ Hạng mục công việc</h3><button class="btn small" type="button" id="tyAdd">+ Thêm hạng mục</button></div>
    <p class="small muted">Mỗi hạng mục là 1 thư mục con trong thư mục ảnh của từng NV trên Drive. <b>Telegram</b>: đưa vào báo cáo công việc ngày / tuần. Tắt <b>Đang dùng</b> = không hiện khi giao việc mới.</p>
    <div class="tbl-wrap"><table class="nosort"><thead><tr><th>Biểu tượng</th><th>Tên</th><th>Thứ tự</th><th class="num">Đang dùng</th><th class="num">Telegram</th><th></th></tr></thead><tbody id="tyRows">${(S.jobTypes || []).map(row).join("")}</tbody></table></div></div>`;
  $("#tyAdd").onclick = () => $("#tyRows").insertAdjacentHTML("beforeend", row({ sort: ((S.jobTypes || []).at(-1)?.sort || 0) + 1 }));
  body.onclick = async (e) => {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    const id = tr.dataset.id ? Number(tr.dataset.id) : null, v = (n) => tr.querySelector(`[name=${n}]`);
    try {
      if (e.target.closest("[data-save]")) { const r = await rpc("job_type_save", { p_id: id, p_name: v("name").value, p_icon: v("icon").value, p_sort: Number(v("sort").value) || 0, p_active: v("active").checked, p_tg: v("tg").checked }); toast(r.message); draw(); }
      if (e.target.closest("[data-del]") && (await confirmBox("Xoá hạng mục?", "Hạng mục đã có việc thì chỉ tắt, không xoá.", "Xoá", true))) { const r = await rpc("job_type_delete", { p_id: id }); toast(r.message, 4000); draw(); }
    } catch (x) { err(x); }
  };
}

// =================== 🗓️ Lịch ca ===================
async function shift(body, alive) {
  const last = setting("SHIFT_LAST", null), slots = setting("SHIFT_SLOTS", []);
  const wk = V.sweek, days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(wk, i));
  const [{ data, error }, cf] = await Promise.all([sb.from("shifts").select("staff_id,d,slots,pos,private").gte("d", days[0]).lte("d", days[6]), rpc("shift_conflicts", { p_from: days[0], p_to: days[6] }).catch(() => [])]);
  if (error) throw error;
  if (!alive()) return;
  const map = new Map((data || []).map((x) => [x.staff_id + "|" + x.d, x.slots || []])), priv = new Set((data || []).filter((x) => x.private).map((x) => x.staff_id));
  const conf = Array.isArray(cf) ? cf : [], cmap = new Map(conf.map((c) => [c.staff_id + "|" + c.d, c]));   // D12d: xếp ca trùng lịch bận / OFF
  const staff = staffList().filter((s) => days.some((d) => map.has(s.id + "|" + d)));
  const P = { parsed: null, file: null };
  body.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>📥 Cập nhật lịch ca</h3></div>
      <p class="small muted">Tool sắp ca bỏ file Excel vào thư mục Drive <b>${esc((setting("SHIFT_DRIVE_PATH", []) || []).join(" / "))}</b> — tool tự đọc 30 phút / lần, rồi tự so với lịch bận NV đã đăng ký (trùng → báo Telegram + thông báo QL). Có thể lấy ngay hoặc chọn file trên máy. File dạng bảng “Quản lý phân ca” HRM: hàng ngày <i>T2 (23/11)</i>, cột <i>Bộ phận · Nhân viên (18450 - Hùng) · Ca 1 … Ca 6</i>. Ca của <b>Quản lý / Trưởng ca</b> 🔒 nhân viên không thấy.</p>
      ${last ? `<p class="small">Lần cập nhật gần nhất: <b>${esc(last.source || "")}</b> · ${last.from ? dmy(last.from) + " – " + dmy(last.to) : ""} · ${last.n || 0} dòng${last.unmatched ? ` · <span style="color:var(--warn)">${last.unmatched} người chưa khớp</span>` : ""} · ${last.at ? esc(whenTxt(last.at)) : ""} · ${last.by === "tu-dong" ? "tự động" : esc(last.by || "")}</p>` : `<p class="small muted">Chưa có lịch ca.</p>`}
      <div class="row"><button class="btn primary" type="button" id="shDrive">📥 Lấy file mới nhất từ Drive</button><label class="btn">📂 Chọn file trên máy<input type="file" id="shFile" accept=".xlsx,.xls,.csv" hidden></label>
        <button class="btn" type="button" onclick="import('./js/pg-week.js').then((m) => m.pgWeekTable())">🗓️ Lịch PG tuần</button></div>
      <div id="shPrev"></div></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>🗓️ Lịch ca tuần ${dm(days[0])} – ${dm(days[6])}</h3><button class="btn small" type="button" data-wk="-7">‹</button><button class="btn small" type="button" data-wk="7">›</button>${deptChips()}</div>
      ${conf.length ? `<div class="banner bad"><div><b>⚠️ ${conf.length} chỗ xếp ca trùng lịch bận / OFF</b> (ô đỏ): ${conf.slice(0, 6).map((c) => `${dow(c.d)} ${dm(c.d)} ${esc(shortName(c.name))} — ${c.kind === "off" ? "OFF" : c.kind === "ban" ? "bận Ca " + c.busy.join(",") : "bận chưa ghi ca"}, xếp Ca ${c.slots.join(",")}`).join(" · ")}${conf.length > 6 ? " …" : ""}. Xem đủ ở CV → Lịch bận → ⚠️ Đối chiếu ca.</div></div>` : (staff.length ? `<div class="banner ok"><div>✅ Tuần này không xếp ca trùng lịch bận / OFF.</div></div>` : "")}
      ${staff.length ? `<div class="tbl-wrap"><table class="nosort jb-grid"><thead><tr><th>NV</th>${days.map((d) => `<th class="num">${dow(d)}<br>${dm(d)}</th>`).join("")}</tr></thead><tbody>
      ${staff.map((s) => `<tr><td style="white-space:nowrap">${esc(shortName(s.name))}${priv.has(s.id) ? ` <span title="Quản lý / Trưởng ca — nhân viên không thấy ca này">🔒</span>` : ""}</td>${days.map((d) => { const x = map.get(s.id + "|" + d), c = cmap.get(s.id + "|" + d); return `<td class="num ${x && !x.length ? "c-off" : ""} ${c ? "c-bad" : ""}" title="${x ? esc(slotText(x, slots)) : "chưa có"}${c ? " — trùng lịch " + (c.kind === "off" ? "OFF" : "bận") : ""}">${x ? (x.length ? esc(slotRange(x)) : "OFF") : "·"}${c ? " ⚠️" : ""}</td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div>` : `<div class="empty small">Chưa có lịch ca tuần này.</div>`}</div>
    <div class="card"><div class="card-h"><h3>⏰ Giờ của từng ca</h3><button class="btn small primary" type="button" id="slSave">💾 Lưu</button></div>
      <div class="fields">${[1, 2, 3, 4, 5, 6].map((i) => `<label>Ca ${i}<input class="sl" placeholder="07:30-09:00" value="${esc(slots[i - 1] || "")}"></label>`).join("")}</div></div>`;
  async function preview(buf, file) {
    const box = $("#shPrev"); box.innerHTML = `<p class="small muted">Đang đọc file…</p>`;
    try {
      const sch = parseShiftAoa(await readSheet(buf), vnToday());
      if (!sch.ok) { box.innerHTML = `<div class="banner bad"><div>${esc(sch.msg)}</div></div>`; return; }
      const m = matchStaff(sch.people, visibleStaff());
      P.parsed = m; P.file = file;
      box.innerHTML = `<div class="banner ${m.unmatched.length ? "warn" : "ok"}" style="margin-top:10px"><div><b>${esc(file.name)}</b>: ${dmy(sch.days[0])} – ${dmy(sch.days.at(-1))} · khớp ${m.pairs.length}/${sch.people.length} người${m.unmatched.length ? ` · chưa khớp: ${m.unmatched.map((p) => esc(`${p.name} (${p.user})`)).join(", ")} — kiểm tra mã NV trong Nhân sự` : ""}</div></div>
        <div class="tbl-wrap"><table class="nosort jb-grid"><thead><tr><th>NV</th>${sch.days.map((d) => `<th class="num">${dow(d)}<br>${dm(d)}</th>`).join("")}</tr></thead><tbody>
        ${m.pairs.map(({ p, st }) => `<tr><td style="white-space:nowrap">${esc(shortName(st.name))}<div class="tiny muted">${esc(p.dept || "")}</div></td>${sch.days.map((d) => { const x = p.days[d]?.slots || []; return `<td class="num ${x.length ? "" : "c-off"}">${x.length ? esc(slotRange(x)) : "OFF"}</td>`; }).join("")}</tr>`).join("")}
        </tbody></table></div><div class="row" style="margin-top:8px"><button class="btn primary" type="button" id="shSave">💾 Lưu lịch ca (${m.rows.length} dòng)</button></div>`;
    } catch (x) { box.innerHTML = `<div class="banner bad"><div>${esc(errMsg(x))}</div></div>`; }
  }
  body.onclick = async (e) => {
    const w = e.target.closest("[data-wk]"); if (w) { V.sweek = addDays(V.sweek, Number(w.dataset.wk)); return draw(); }
    const dp = e.target.closest("[data-dept]"); if (dp) { V.dept = dp.dataset.dept; return draw(); }
    if (e.target.closest("#shDrive")) {
      const b = e.target.closest("#shDrive"); b.disabled = true;
      try {
        const r = await callFn("tasks", { mode: "shift_latest" });
        if (!r.file) { $("#shPrev").innerHTML = `<div class="banner warn"><div>Thư mục Drive chưa có file Excel / CSV nào.${r.folder?.url ? ` <a href="${esc(r.folder.url)}" target="_blank" rel="noopener">Mở thư mục</a>` : ""}</div></div>`; }
        else { const bin = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)); await preview(bin.buffer, r.file); }
      } catch (x) { err(x); }
      b.disabled = false; return;
    }
    if (e.target.closest("#shSave") && P.parsed) {
      try { const r = await rpc("shift_import", { p_rows: P.parsed.rows, p_source: P.file.name, p_file: P.file.id ? { id: P.file.id, updated: P.file.updated, unmatched: P.parsed.unmatched.length } : { unmatched: P.parsed.unmatched.length } }); toast(r.message, 4000); await loadSettings(); draw(); } catch (x) { err(x); }
      return;
    }
    if (e.target.closest("#slSave")) {
      const v = $$(".sl").map((i) => i.value.trim());
      if (v.some((x) => x && !/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(x))) return toast("Giờ ca dạng 07:30-09:00");
      try { await saveSetting("SHIFT_SLOTS", v.map((x) => x.replace(/\s+/g, ""))); toast("Đã lưu giờ các ca"); } catch (x) { err(x); }
    }
  };
  body.onchange = async (e) => {
    if (e.target.id === "shFile" && e.target.files[0]) { const f = e.target.files[0]; await preview(await f.arrayBuffer(), { name: f.name }); e.target.value = ""; }
  };
}
const slotRange = (x) => { const s = [...x].sort((a, b) => a - b), g = []; for (const v of s) { const l = g[g.length - 1]; if (l && v === l[1] + 1) l[1] = v; else g.push([v, v]); } return g.map(([a, b]) => (a === b ? a : a + "–" + b)).join(","); };

// =================== ⚙️ Cài đặt ===================
async function cfg(body, alive) {
  const push = await rpc("push_overview").catch(() => ({}));
  if (!alive()) return;
  const hide = setting("HIDE", {}) || {}, cvHidden = (hide.employee || []).includes("cv.nav");
  const staff = visibleStaff(), on = staff.filter((s) => push[s.id]), off = staff.filter((s) => !push[s.id]);
  body.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>⚙️ Luật việc</h3><button class="btn small primary" type="button" id="cfSave">💾 Lưu</button></div>
      <div class="fields"><label>Quá hạn bao nhiêu giờ thì thành “Bỏ lỡ”<input type="number" id="cfMiss" min="1" max="168" value="${esc(setting("JOB_MISS_HOURS", 24))}"></label>
        <label>Thông báo nhắc trước hạn (phút)<input type="number" id="cfRem" min="5" max="1440" value="${esc(setting("JOB_REMIND_BEFORE_MIN", 60))}"></label></div>
      <p class="small muted">Sao trừ khi nộp trễ / bỏ lỡ do QL khai báo ở từng lần giao việc. Bỏ lỡ trừ sao một lần; QL mở lại việc thì hoàn sao.</p></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>🗂️ Tab CV cũ trên menu của NV</h3></div>
      <p class="small">Hiện tại: <b>${cvHidden ? "đang ẩn" : "đang hiện"}</b>. Khi ẩn, NV vào TikTok, Vệ sinh, Tờ rơi, Lịch bận… từ trang 🏠 Hôm nay (mỗi lần mở đúng 1 chức năng).</p>
      <button class="btn" type="button" id="cfCv">${cvHidden ? "👁️ Hiện lại tab CV cho NV" : "🙈 Ẩn tab CV với NV"}</button></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>🔔 Thông báo trên điện thoại</h3><span class="pill ${on.length ? "ok" : "mute"}">${on.length}/${staff.length} NV đã bật</span></div>
      <p class="small muted">NV bật ở trang 🏠 Hôm nay (iPhone cần thêm tool ra màn hình chính trước). Tool gửi: việc mới, nhắc trước hạn, báo quá hạn; QL bấm 🔔 Nhắc ở bảng Hôm nay.</p>
      ${off.length ? `<p class="small"><b>Chưa bật:</b> ${off.map((s) => esc(shortName(s.name))).join(", ")}</p>` : ""}</div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>📨 Telegram</h3></div>
      <p class="small">Báo cáo công việc theo hạng mục: <b>📋 Công việc trong ngày</b> (mặc định 21:45) và <b>📋 Tổng kết công việc tuần</b> (mặc định thứ 2 09:05). Đổi giờ, tần suất, bật / tắt ở <a href="#admin" class="linkish">Quản lý → Telegram</a>. Hạng mục nào không đưa vào: bỏ tick Telegram ở tab 🗂️ Hạng mục.</p></div>
    <div class="card"><div class="card-h"><h3>📁 Google Drive</h3><button class="btn small" type="button" id="cfDrive">Kiểm tra kết nối</button></div>
      <p class="small muted">Ảnh lưu ở <b>${esc((setting("JOB_DRIVE_PATH", []) || []).join(" / "))} / &lt;Mã - Tên NV&gt; / &lt;Hạng mục&gt;</b>, tên ảnh bắt đầu bằng ngày giờ nộp. Lịch ca đọc từ <b>${esc((setting("SHIFT_DRIVE_PATH", []) || []).join(" / "))}</b>.</p><p class="small" id="cfDriveMsg"></p></div>`;
  body.onclick = async (e) => {
    try {
      if (e.target.closest("#cfSave")) {
        const miss = Number($("#cfMiss").value), rem = Number($("#cfRem").value);
        if (!(miss >= 1 && miss <= 168) || !(rem >= 5 && rem <= 1440)) return toast("Số giờ / phút chưa hợp lệ");
        await saveSetting("JOB_MISS_HOURS", miss); await saveSetting("JOB_REMIND_BEFORE_MIN", rem); toast("Đã lưu");
      }
      if (e.target.closest("#cfCv")) {
        const emp = new Set(hide.employee || []); cvHidden ? emp.delete("cv.nav") : emp.add("cv.nav");
        await saveSetting("HIDE", { ...hide, employee: [...emp], manager: hide.manager || [] }); toast(cvHidden ? "Đã hiện tab CV cho NV" : "Đã ẩn tab CV với NV"); draw();
      }
      if (e.target.closest("#cfDrive")) {
        const m = $("#cfDriveMsg"); m.textContent = "Đang kiểm tra…";
        try { const r = await callFn("tasks", { mode: "shift_latest" }); m.innerHTML = `✅ Đã nối Apps Script bản 2.${r.folder?.url ? ` <a href="${esc(r.folder.url)}" target="_blank" rel="noopener">Mở thư mục lịch ca</a>` : ""}`; }
        catch (x) { m.innerHTML = `❌ ${esc(errMsg(x))}`; }
      }
    } catch (x) { err(x); }
  };
}
