// Trang CV: Việc, TikTok, Vệ sinh, Lịch bận, Roadshow, Biên bản vi phạm (cv-vio.js), Quỹ, Thống kê
import { $, $$, esc, fmt, toast, modal, confirmBox, vnToday, vnHM, addDays, weekStart, dmy, dm, dow, monthGrid, ymOf, shiftMonth, monthLabel, shortName, norm, copyText, download, csv, centerTab } from "../ui.js";
import { sb, S, rpc, onChange, isManager, visibleStaff, staffById, setting, errMsg, isHidden } from "../store.js";
import { uploadAll, removeAll, fillPhotos, compress } from "../photos.js";
import { parseSchedule } from "../lib-hrm.js";
import { fund } from "./cv-fund.js";
import { tasks, pendingCount } from "./cv-tasks.js";
import { zones } from "./cv-zones.js";
import { violationDocs } from "./cv-vio.js";

const TABS = [["tasks", "📋 Việc"], ["tiktok", "📱 TikTok"], ["clean", "🧹 Vệ sinh"], ["busy", "📅 Lịch bận"], ["rs", "🏃 Roadshow"], ["vio", "📄 Biên bản"], ["fund", "💵 Quỹ"], ["stats", "📊 Thống kê"]];
const RS_TIMES = (() => { const o = []; const add = (a, b) => { for (let t = a; t <= b; t += 30) o.push(String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0")); }; add(360, 630); add(900, 1080); return o; })();
let tab = localStorage.getItem("thidua-v2-cv") || "tasks", ym = ymOf(vnToday()), root;
const D = { tiktok: [], clean: [], busy: [], rs: [] };

export async function render(view) {
  root = view;
  try { tab = localStorage.getItem("thidua-v2-cv") || tab; } catch { /* bỏ qua */ }
  view.innerHTML = `<div class="page-h"><div><h1>Công việc (CV)</h1><p>Việc cần làm, TikTok, lịch vệ sinh, lịch bận/OFF, roadshow, quỹ thu chi và thống kê</p></div></div>
    <div class="subtabs" id="cvTabs"></div><div id="cvBody"></div>`;
  $("#cvTabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; localStorage.setItem("thidua-v2-cv", tab); draw(); } };
  await draw();
  const off = onChange((w) => { if (w === "cv" && $("#cvBody")) draw(true); });
  return () => off();
}

const name = (id) => staffById(id)?.name || id;
const me = () => S.me.staff_id;
function staffPicker(id = "cvStaff", sel = me()) {
  if (isManager() && !visibleStaff().some((s) => s.id === sel)) sel = visibleStaff()[0]?.id;
  if (!isManager()) return `<input value="${esc(name(me()) || "Chưa gắn mã NV")}" disabled><input type="hidden" id="${id}" value="${esc(me() || "")}">`;
  return `<select id="${id}">${visibleStaff().map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
}
const calNav = () => `<div class="cal-nav"><button class="btn small" data-m="-1" type="button">‹</button><h3>${monthLabel(ym)}</h3><button class="btn small" data-m="1" type="button">›</button><button class="btn small ghost" data-m="0" type="button">Hôm nay</button></div>`;
function bindNav(body) { body.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { ym = b.dataset.m === "0" ? ymOf(vnToday()) : shiftMonth(ym, Number(b.dataset.m)); draw(); }); }

async function load(table, col, from, to) {
  const { data, error } = await sb.from(table).select("*").gte(col, from).lte(col, to).order(col);
  if (error) throw error; return data;
}
async function draw(quiet = false) {
  const tabs = TABS.filter(([id]) => !isHidden("cv." + id));
  if (!tabs.length) { $("#cvBody").innerHTML = `<div class="empty">Không có chức năng nào đang mở.</div>`; return; }
  if (!tabs.some(([id]) => id === tab)) tab = tabs[0][0];
  $("#cvTabs").innerHTML = tabs.map(([id, l]) => `<button type="button" data-t="${id}" class="${id === tab ? "on" : ""}">${l}</button>`).join("");
  centerTab($("#cvTabs"));
  const body = $("#cvBody"); body.onclick = null;
  if (!quiet) body.innerHTML = `<div class="empty">Đang tải…</div>`;
  try { await ({ tiktok, clean, busy, rs, stats, vio: violationDocs, fund: (b) => fund(b, quiet), tasks: (b) => tasks(b, quiet) })[tab](body); if (tab === "tasks") tabBadge(); }
  catch (e) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}
const err = (e) => toast(errMsg(e), 4500);
function tabBadge() { const b = $('#cvTabs [data-t="tasks"]'), n = pendingCount(); if (b) b.innerHTML = "📋 Việc" + (n ? ` <b class="badge">${n}</b>` : ""); }
const files = (inputs) => inputs.map((i) => i._blob || i.files?.[0]).filter(Boolean);
function pickerHtml(labels, name = "ph") { return `<div class="pick">${labels.map((l, i) => `<label>${esc(l)}<input type="file" accept="image/*" capture="environment" data-${name}="${i}"></label>`).join("")}</div>`; }
// Chọn ảnh xong là đọc + nén NGAY vào bộ nhớ (điện thoại Android hay làm mất file tạm của ô chụp ảnh nếu để lâu mới đọc)
function bindPicker(box) {
  box.querySelectorAll('.pick input[type=file]').forEach((inp) => inp.onchange = async () => {
    const f = inp.files[0], lb = inp.closest("label"); inp._blob = null; lb.querySelector("img")?.remove();
    if (!f) return;
    try {
      const blob = await compress(f); inp._blob = blob;
      const im = document.createElement("img"); im.src = URL.createObjectURL(blob); lb.appendChild(im);
    } catch (x) { inp.value = ""; toast("Ảnh này không đọc được, hãy chụp / chọn lại", 4500); }
  });
}

// =================== TikTok ===================
const dueDates = (from, to) => { const o = []; if (!from || !to || from > to) return o; for (let d = from; d <= to; d = addDays(d, 1)) { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w === 2 || w === 5) o.push(d); } return o; };
const ttLabel = (d) => ({ 2: "Thứ 3", 5: "Thứ 6" }[new Date(d + "T00:00:00Z").getUTCDay()] || "") + " " + dm(d);
function ttTarget(staffId, today, start) {
  const mine = new Set(D.tiktok.filter((t) => t.staff_id === staffId).map((t) => t.due));
  const over = dueDates(start, addDays(today, -1)).find((d) => !mine.has(d));
  if (over) return { due: over, late: true };
  const from = start > today ? start : today;
  return { due: dueDates(from, addDays(from, 10))[0], late: false };
}
async function tiktok(body) {
  const today = vnToday(), start = String(setting("TIKTOK_START_DATE", today)).slice(0, 10);
  D.tiktok = await load("tiktok_submissions", "due", addDays(start, -1) < addDays(today, -90) ? addDays(today, -90) : addDays(start, -1), addDays(today, 14));
  const reward = setting("TIKTOK_REWARD", 100), pen = setting("TIKTOK_PENALTY", 300), minL = setting("TIKTOK_MIN_LINKS", 1);
  const cols = dueDates(start > addDays(today, -35) ? start : addDays(today, -35), addDays(today, 7)).slice(-10);
  const sel = isManager() ? ($("#cvStaff")?.value || me() || visibleStaff()[0]?.id) : me();
  body.innerHTML = `
    <div class="grid2" style="margin-bottom:14px">
      <div class="card"><div class="card-h"><h2>📱 Nộp link TikTok</h2><span class="pill info">Hạn Thứ 3 & Thứ 6</span></div>
        <ol class="small muted" style="margin:0 0 10px;padding-left:18px"><li>Úp video lên <b>TikTok</b> → Chia sẻ → Sao chép liên kết → dán ô ①.</li><li>Úp lên <b>Facebook cá nhân</b> (Công khai) → Sao chép liên kết → dán ô ②.</li><li>Mỗi link 1 dòng. Link phải mới: không trùng link kỳ trước, không trùng link của người khác.</li></ol>
        <div class="stack"><label>Nhân viên${staffPicker()}</label>
          <div id="ttTarget"></div>
          <label>① Link TikTok (tối thiểu ${minL})<textarea id="ttLinks" placeholder="https://vt.tiktok.com/…"></textarea></label>
          <label>② Link Facebook cá nhân<textarea id="ttFb" placeholder="https://www.facebook.com/…"></textarea></label>
          <button class="btn primary" id="ttSend" type="button">📤 Gửi link</button></div></div>
      <div class="card"><div class="card-h"><h2>Quy định</h2></div><ul class="small" style="margin:0;padding-left:18px;line-height:1.7">
        <li>Nộp <b>trước</b> ngày hạn: <b class="pos">+${fmt(reward)}⭐</b>.</li>
        <li>Nộp <b>đúng ngày hạn</b>: không thưởng, không trừ.</li>
        <li>Quá hạn chưa nộp: mỗi ngày bị trừ <b class="neg">−${fmt(pen)}⭐</b> vào báo cáo cuối ngày cho tới khi nộp.</li>
        <li>Nộp trễ: ghi nhận, không thưởng. Kỳ được miễn (nghỉ phép, ốm…) do quản lý đánh dấu.</li>
        <li>Bắt đầu tính từ ${dmy(start)}.</li></ul></div>
    </div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>📊 Theo dõi các kỳ (cả team)</h2>${isManager() ? '<span class="small muted">Bấm ô để miễn / xoá kỳ</span>' : ""}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th>${cols.map((d) => `<th class="num">${ttLabel(d)}</th>`).join("")}</tr></thead><tbody>
      ${visibleStaff().map((s) => `<tr><td>${esc(shortName(s.name))}</td>${cols.map((d) => { const t = D.tiktok.find((x) => x.staff_id === s.id && x.due === d);
        const [ic, cl, tt] = t ? (t.status === "SỚM" ? ["🌟", "pos", "Nộp sớm " + dm(t.submit_date) + " (+thưởng)"] : t.status === "ĐÚNG HẠN" ? ["✅", "pos", "Đúng hạn"] : t.status === "MIỄN" ? ["🛡️", "muted", "Miễn"] : ["⏰", "", "Nộp trễ " + dm(t.submit_date)]) : d < today ? ["❌", "neg", "Chưa nộp — đang bị trừ"] : ["⏳", "muted", "Chưa tới hạn"];
        return `<td class="num ${cl}" title="${esc(tt)}" ${isManager() ? `data-tt="${esc(s.id)}|${d}" style="cursor:pointer"` : ""}>${ic}</td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div>
      <div class="legend"><span>🌟 Nộp sớm (+thưởng)</span><span>✅ Đúng ngày hạn</span><span>⏰ Nộp trễ</span><span>❌ Chưa nộp (đang bị trừ mỗi ngày)</span><span>⏳ Chưa tới hạn</span><span>🛡️ Được miễn</span></div></div>
    <div class="card"><div class="card-h"><h3>🧾 Link đã nộp gần đây</h3></div>
      ${D.tiktok.filter((t) => t.status !== "MIỄN").length ? `<div class="tbl-wrap"><table><tbody>${D.tiktok.filter((t) => t.status !== "MIỄN").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30).map((t) => `<tr><td>${esc(shortName(name(t.staff_id)))}</td><td>${ttLabel(t.due)}</td><td><span class="pill ${t.status === "TRỄ" ? "warn" : "ok"}">${esc(t.status)}</span></td>
        <td class="small">${[...t.tiktok_links, ...t.fb_links].map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\//, "").slice(0, 38))}</a>${ttPosted(l) ? ` <span class="tiny muted">· đăng ${ttPosted(l)}</span>` : ""}`).join("<br>")}</td><td class="tiny muted">${dmy(t.submit_date)} ${esc(t.submit_time)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có.</p>`}</div>`;
  const showTarget = () => {
    const sid = $("#cvStaff")?.value; if (!sid) return;
    const t = ttTarget(sid, today, start);
    $("#ttTarget").innerHTML = t.due ? `<div class="banner ${t.late ? "bad" : "info"}" style="margin:0"><div><b>Kỳ đang nộp: ${ttLabel(t.due)}</b>${t.late ? "Quá hạn — nộp ngay để dừng bị trừ sao (nộp trễ không có thưởng)." : `Nộp trước ngày ${dmy(t.due)} được +${fmt(reward)}⭐ · nộp đúng ngày ${dm(t.due)} không thưởng, không trừ.`}</div></div>` : "";
  };
  const selEl = $("#cvStaff"); if (sel && selEl?.tagName === "SELECT" && [...selEl.options].some((o) => o.value === sel)) selEl.value = sel;
  $("#cvStaff")?.addEventListener("change", showTarget); showTarget();
  const split = (v) => v.split(/[\s,;]+/).map((x) => x.trim().replace(/^[\s"'(<\[]+|[\s"')>\]\.,;]+$/g, "")).filter(Boolean).map((x) => /^[a-z]+:\/\//i.test(x) ? x : "https://" + x);
  $("#ttSend").onclick = async (e) => {
    const sid = $("#cvStaff").value; if (!sid) return toast("Chưa gắn mã nhân viên");
    e.target.disabled = true;
    try { const r = await rpc("tiktok_submit", { p_staff: sid, p_links: split($("#ttLinks").value), p_fb: split($("#ttFb").value) }); toast("✅ " + r.message, 4000); draw(); }
    catch (x) { err(x); e.target.disabled = false; }
  };
  body.onclick = async (e) => {
    const c = e.target.closest("[data-tt]"); if (!c) return;
    const [sid, due] = c.dataset.tt.split("|"); const t = D.tiktok.find((x) => x.staff_id === sid && x.due === due);
    const v = await modal(`<h3>${esc(name(sid))} · ${ttLabel(due)}</h3><p class="muted">${t ? `Trạng thái: <b>${esc(t.status)}</b>` : "Chưa có bản ghi."}</p>
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button>${t ? `<button class="btn danger" data-v="delete">Xoá bản ghi</button>` : `<button class="btn primary" data-v="excuse">🛡️ Miễn kỳ này</button>`}</div>`);
    if (!v) return;
    try { await rpc("tiktok_manage", { p_action: v, p_staff: sid, p_due: due }); toast(v === "excuse" ? "Đã miễn kỳ" : "Đã xoá"); draw(); } catch (x) { err(x); }
  };
}

// =================== Vệ sinh ===================
async function clean(body) {
  const from = ym + "-01", to = shiftMonth(ym, 1) + "-01", today = vnToday();
  D.clean = await load("cleaning", "clean_date", from, addDays(to, -1));
  const byDay = (d) => D.clean.find((c) => c.clean_date === d && !staffById(c.staff_id)?.hidden) || D.clean.find((c) => c.clean_date === d);
  body.innerHTML = `<div id="zonesBox"></div><div class="card"><div class="card-h"><h2>🧹 Lịch vệ sinh</h2><span class="small muted">Mỗi ngày 1 người · nộp 3 ảnh khi xong · người trực được nhắc trên tool hôm trước & trong ngày · quản lý đổi người / xoá được</span></div>
    ${calNav()}
    ${monthGrid(ym, (d) => { const c = byDay(d); if (!c) return d >= today ? `<span class="free">+ Còn trống</span>` : "";
      const st = c.photos.length >= 3 ? "ok" : d < today ? "bad" : "info"; return `<span class="tag ${st}">${esc(shortName(name(c.staff_id)))}</span>${c.photos.length >= 3 ? '<span class="tag ok">✅ Đã nộp ảnh</span>' : d < today ? '<span class="tag bad">⚠️ Chưa nộp</span>' : ""}`; })}
    <div class="legend"><span>🟦 Đã đăng ký</span><span>✅ Đã nộp ảnh</span><span>⚠️ Quá ngày chưa nộp ảnh</span></div></div>`;
  bindNav(body);
  zones($("#zonesBox", body)).catch((x) => console.warn(x));
  body.onclick = async (e) => {
    const cell = e.target.closest("[data-day]"); if (!cell) return;
    const d = cell.dataset.day, c = byDay(d);
    if (!c) {
      if (d < today) return toast("Không đăng ký được ngày đã qua");
      const v = await modal(`<h3>Đăng ký vệ sinh ${dow(d)} ${dmy(d)}</h3><form class="stack"><label>Nhân viên${staffPicker("clStaff")}</label></form>
        <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="ok">Đăng ký</button></div>`,
        { onOpen: (b) => b.querySelector("[data-v=ok]").addEventListener("click", () => { state.clStaff = b.querySelector("#clStaff")?.value || me(); }, true) });
      if (v !== "ok") return;
      try { const r = await rpc("clean_register", { p_staff: state.clStaff, p_date: d }); toast("✅ " + r.message); draw(); } catch (x) { err(x); }
      return;
    }
    const mine = isManager() || c.staff_id === me(), canReport = mine && d <= today && c.photos.length < 3;
    await modal(`<h3>🧹 ${dow(d)} ${dmy(d)} · ${esc(name(c.staff_id))}</h3>
      <p class="small muted">Đăng ký lúc ${dmy(c.reg_date)} ${esc(c.reg_time)}${c.report_date ? ` · nộp ảnh ${dmy(c.report_date)} ${esc(c.report_time || "")}` : ""}</p>
      ${c.photos.length ? `<div class="photos" id="clPhotos"></div>` : canReport ? `<p><b>Nộp 3 ảnh báo cáo</b></p>${pickerHtml(["Ảnh 1", "Ảnh 2", "Ảnh 3"])}` : `<p class="muted">${d > today ? "Chưa tới ngày, chưa nộp ảnh được." : "Chưa nộp ảnh."}</p>`}
      ${isManager() ? `<div class="row" style="margin-top:10px"><label class="grow">🔁 Đổi người trực${staffPicker("clSwap", c.staff_id)}</label><button class="btn" data-v="swap" type="button" style="align-self:flex-end">Đổi người</button></div>` : ""}
      <div class="modal-actions">${isManager() ? `<button class="btn danger" data-v="del">Xoá đăng ký</button>${c.photos.length ? `<button class="btn" data-v="delph">Xoá ảnh (cho nộp lại)</button>` : ""}<span class="grow"></span>` : ""}<button class="btn" data-v="cancel">Đóng</button>${canReport ? `<button class="btn primary" data-v="send">📤 Nộp ảnh</button>` : ""}</div>`,
      { onOpen: (b) => { if (c.photos.length) fillPhotos(b.querySelector("#clPhotos"), c.photos); bindPicker(b); b.addEventListener("click", (ev) => handle(ev, b)); } });
    async function handle(ev, b) {
      const v = ev.target.closest("[data-v]")?.dataset.v; if (!v || v === "cancel") return;
      ev.stopPropagation();
      try {
        if (v === "send") {
          const fs = files([...b.querySelectorAll("[data-ph]")]); if (fs.length !== 3) return toast("Chọn đủ 3 ảnh");
          ev.target.disabled = true; ev.target.textContent = "⏳ Đang tải ảnh…";
          const paths = await uploadAll(`clean/${d}/${c.staff_id}`, fs);
          const r = await rpc("clean_report", { p_date: d, p_photos: paths }); toast("✅ " + r.message); document.dispatchEvent(new Event("remind:refresh"));
        } else if (v === "swap") {
          const to = b.querySelector("#clSwap").value; if (!to || to === c.staff_id) return toast("Chọn người khác để đổi");
          const r = await rpc("clean_reassign", { p_date: d, p_staff: to }); toast("✅ " + r.message);
        } else if (v === "del" || v === "delph") {
          if (!(await confirmBox(v === "del" ? "Xoá đăng ký vệ sinh?" : "Xoá ảnh báo cáo?", `${esc(name(c.staff_id))} · ${dmy(d)}`, "Xoá", true))) return;
          const r = await rpc("clean_delete", { p_date: d, p_only_photos: v === "delph" }); await removeAll(r.photos); toast("Đã xoá");
        }
        $("#modal").hidden = true; draw();
      } catch (x) { err(x); ev.target.disabled = false; }
    }
  };
}

// =================== Lịch bận ===================
let busySub = "reg", hrmHtml = "";
async function busy(body) {
  const from = ym + "-01", to = addDays(shiftMonth(ym, 1) + "-01", -1), today = vnToday(), max = setting("BUSY_MAX_WEEKDAY", 3);
  D.busy = await load("busy", "busy_date", busySub === "hrm" ? addDays(today, -14) : from, busySub === "hrm" ? addDays(today, 40) : to);
  const on = (d) => D.busy.filter((b) => b.busy_date === d && !staffById(b.staff_id)?.hidden);
  const isWk = (d) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; };
  body.innerHTML = `<div class="seg" style="margin-bottom:12px" id="bzSub"><button data-s="reg" class="${busySub === "reg" ? "on" : ""}" type="button">📝 Đăng ký Bận / OFF</button><button data-s="hrm" class="${busySub === "hrm" ? "on" : ""}" type="button">🗓️ Kiểm tra ca HRM</button></div><div id="bzBody"></div>`;
  $("#bzSub").onclick = (e) => { const b = e.target.closest("[data-s]"); if (b) { busySub = b.dataset.s; draw(); } };
  const bz = $("#bzBody");
  if (busySub === "hrm") return busyHrm(bz);
  bz.innerHTML = `<div class="card"><div class="card-h"><h2>📅 Lịch bận việc / OFF</h2><span class="small muted">Thứ 2–6 tối đa ${max} người/ngày · Thứ 7, CN không giới hạn · chỉ quản lý xoá</span></div>
    ${setting("BUSY_LOCK_ENABLED", true) === true || setting("BUSY_LOCK_ENABLED", true) === "true" ? (() => { const hm = setting("BUSY_DEADLINE_HM", "22:00"), mon = weekStart(today), fri = addDays(mon, 4), passed = today > fri || (today === fri && vnHM() >= hm), dl = passed ? addDays(fri, 7) : fri;
      return `<div class="banner ${passed ? "info" : "warn"}"><div><b>⏰ Hạn đăng ký bận/OFF tuần ${dmy(addDays(dl, 3)).slice(0, 5)}–${dmy(addDays(dl, 9)).slice(0, 5)}: ${esc(hm)} thứ 6 ${dmy(dl).slice(0, 5)}</b>Sau hạn nhân viên không tự đăng ký được cho tuần đó — nhờ quản lý đăng ký hộ.</div></div>`; })() : ""}
    ${calNav()}
    ${monthGrid(ym, (d) => { const l = on(d); return l.map((b) => `<span class="tag ${b.type === "OFF" ? "bad" : "warn"}">${b.type === "OFF" ? "OFF" : "B"} ${esc(shortName(name(b.staff_id)))}${b.shifts?.length ? " · C" + b.shifts.join(",") : ""}</span>`).join("") + (isWk(d) && l.length >= max ? `<span class="tag bad">🔒 Đủ ${max}</span>` : d >= today ? `<span class="free">+ Còn trống</span>` : ""); }, { cls: (d) => isWk(d) && on(d).length >= max ? "full" : "" })}
    <div class="legend"><span>B = Bận việc (C = ca bận)</span><span>OFF = Nghỉ</span><span>🔒 Đủ người</span></div></div>`;
  bindNav(bz);
  body.onclick = async (e) => {
    const cell = e.target.closest("[data-day]"); if (!cell) return;
    const d = cell.dataset.day, l = on(d);
    const v = await modal(`<h3>📅 ${dow(d)} ${dmy(d)}</h3>
      ${l.length ? `<div class="stack" style="gap:6px;margin-bottom:12px">${l.map((b) => `<div class="row"><span class="pill ${b.type === "OFF" ? "bad" : "warn"}">${b.type === "OFF" ? "OFF" : "Bận"}</span><b class="grow">${esc(name(b.staff_id))}</b><span class="small muted">${b.shifts?.length ? "Ca " + b.shifts.join(", ") : ""}</span>${isManager() ? `<button class="btn small ghost danger" data-v="del:${esc(b.staff_id)}" type="button">Xoá</button>` : ""}</div>`).join("")}</div>` : `<p class="muted">Chưa ai đăng ký.</p>`}
      <form class="stack"><label>Nhân viên${staffPicker("bzStaff")}</label>
        <div class="seg" id="bzType"><button type="button" data-ty="BAN" class="on">Bận việc</button><button type="button" data-ty="OFF">OFF (nghỉ)</button></div>
        <div id="bzShifts"><p class="small muted" style="margin:0 0 4px">Ca bận (bỏ trống nếu chưa rõ):</p><div class="shiftbox">${[1, 2, 3, 4, 5, 6].map((c) => `<label><input type="checkbox" value="${c}"> Ca ${c}</label>`).join("")}</div></div></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button><button class="btn primary" data-v="reg">Đăng ký</button></div>`,
      { onOpen: (b) => { const seg = b.querySelector("#bzType"); seg.onclick = (ev) => { const x = ev.target.closest("[data-ty]"); if (!x) return; seg.querySelectorAll("button").forEach((y) => y.classList.toggle("on", y === x)); b.querySelector("#bzShifts").hidden = x.dataset.ty === "OFF"; };
        b.querySelector("[data-v=reg]").addEventListener("click", () => { state.type = seg.querySelector(".on").dataset.ty; state.shifts = [...b.querySelectorAll("#bzShifts input:checked")].map((i) => Number(i.value)); state.staff = b.querySelector("#bzStaff")?.value || me(); }, true); } });
    if (!v || v === "cancel") return;
    try {
      if (v.startsWith("del:")) {
        const sid = v.slice(4); if (!(await confirmBox("Xoá đăng ký?", `${esc(name(sid))} · ${dmy(d)}`, "Xoá", true))) return;
        await rpc("busy_delete", { p_staff: sid, p_date: d }); toast("Đã xoá");
      } else {
        const r = await rpc("busy_register", { p_staff: state.staff, p_date: d, p_type: state.type, p_shifts: state.shifts });
        toast((r.status === "full" ? "⛔ " : "✅ ") + r.message, 4500);
      }
      draw();
    } catch (x) { err(x); }
  };
}
const state = {};

function busyHrm(bz) {
  let saved = null; try { saved = JSON.parse(localStorage.getItem("thidua-v2-hrm") || "null"); } catch { saved = null; }
  bz.innerHTML = `<div class="card"><div class="card-h"><h2>🗓️ Kiểm tra trùng ca với lịch Bận / OFF</h2></div>
    <p class="small muted">Vào HRM → Quản lý phân ca → bấm <b>Xem</b> → kéo chọn toàn bộ bảng (từ chữ <b>“Nhân viên”</b> đến hết hàng nhân viên cuối) → <b>Ctrl+C</b> → bấm vào ô bên dưới → <b>Ctrl+V</b>. Tool tự kiểm tra ngay.</p>
    <textarea id="hrmText" style="font:12px ui-monospace,Consolas,monospace;min-height:110px" placeholder="Dán (Ctrl+V) bảng phân ca vào đây…"></textarea>
    <div class="row" style="margin:8px 0"><button class="btn" id="hrmCheck" type="button">🔍 Kiểm tra</button><button class="btn ghost" id="hrmClear" type="button">Xoá</button></div>
    <div id="hrmOut"></div></div>`;
  const ta = $("#hrmText");
  ta.addEventListener("paste", (e) => { hrmHtml = e.clipboardData?.getData("text/html") || ""; setTimeout(check, 50); });
  $("#hrmCheck").onclick = check;
  $("#hrmClear").onclick = () => { ta.value = ""; hrmHtml = ""; localStorage.removeItem("thidua-v2-hrm"); $("#hrmOut").innerHTML = ""; };
  if (saved) show(saved);
  function check() {
    if (!ta.value.trim()) return toast("Dán bảng phân ca vào ô trước");
    const sch = parseSchedule(ta.value, hrmHtml);
    if (!sch.ok) { $("#hrmOut").innerHTML = `<div class="banner bad"><div>⚠️ ${esc(sch.msg)}</div></div>`; return; }
    try { localStorage.setItem("thidua-v2-hrm", JSON.stringify(sch)); } catch { /* bỏ qua */ }
    show(sch);
  }
  function match(st) {
    const byId = S.staff.find((s) => String(s.id) === String(st.hrmId)); if (byId) return byId;
    const nn = norm(st.name), last = nn.split(/\s+/).pop();
    const c = S.staff.filter((s) => { const f = norm(s.name); return f === nn || f.split(/\s+/).pop() === last; });
    return c.length === 1 ? c[0] : null;
  }
  function show(sch) {
    const conflicts = [], warns = [], unmatched = [], dayBad = {};
    const rows = sch.staff.map((st) => {
      const ns = match(st); if (!ns) unmatched.push(st.name);
      let tds = "";
      sch.days.forEach((d, di) => {
        const rec = ns ? D.busy.find((r) => r.staff_id === ns.id && r.busy_date === d.date) : null;
        const worked = []; for (let c = 0; c < 6; c++) if ((st.cells[di * 6 + c] || 0) > 0) worked.push(c + 1);
        const isOff = rec?.type === "OFF", ban = rec && !isOff ? rec.shifts || [] : [];
        const bad = isOff ? worked.slice() : rec && ban.length ? worked.filter((c) => ban.includes(c)) : [];
        const lbl = `${d.label} ${dm(d.date)}`;
        if (bad.length) { conflicts.push({ d: d.date, h: `⛔ <b>${esc(ns.name)}</b> — ${lbl}: đăng ký <b>${isOff ? "OFF" : "bận Ca " + ban.join(", ")}</b> nhưng bị xếp <b>Ca ${bad.join(", ")}</b>` }); dayBad[di] = 1; }
        else if (rec && !isOff && !ban.length && worked.length) warns.push(`⚠️ <b>${esc(ns.name)}</b> — ${lbl}: đăng ký Bận (chưa ghi ca) mà được xếp Ca ${worked.join(", ")} — hỏi lại nhân viên`);
        for (let c = 0; c < 6; c++) {
          const v = st.cells[di * 6 + c] || 0, ca = c + 1;
          const style = bad.includes(ca) ? "background:var(--bad);color:#fff;font-weight:700" : v > 0 ? "background:var(--info-soft)" : ban.includes(ca) ? "background:var(--warn-soft);color:var(--warn);font-weight:700" : isOff ? "background:var(--bad-soft)" : "";
          tds += `<td style="text-align:center;padding:2px;min-width:24px;font-size:11px;${c === 0 ? "border-left:2px solid var(--line2);" : ""}${style}">${bad.includes(ca) || v > 0 ? v : ban.includes(ca) ? "B" : ""}</td>`;
        }
      });
      return `<tr><td style="white-space:nowrap;font-size:12px;position:sticky;left:0;background:var(--card)">${esc(st.name)} <span class="tiny muted">${esc(st.hrmId)}</span>${ns ? "" : ' <i class="muted">(chưa khớp)</i>'}</td>${tds}</tr>`;
    }).join("");
    conflicts.sort((a, b) => a.d.localeCompare(b.d));
    $("#hrmOut").innerHTML = `
      ${sch.method === "guess" ? `<div class="banner warn"><div>Bản copy làm mất ô trống nên vị trí ca chỉ là <strong>ước đoán</strong>${sch.unique ? "" : " (có nhiều cách xếp)"} — hãy Ctrl+V trực tiếp từ HRM để chính xác.</div></div>` : ""}
      ${sch.check ? `<p class="small ${sch.check.ok === sch.check.total ? "pos" : "neg"}">${sch.check.ok === sch.check.total ? "✓" : "⚠️"} Tổng giờ công khớp ${sch.check.ok}/${sch.check.total} cột.</p>` : ""}
      ${conflicts.length ? `<div class="banner bad"><div><b>🚨 Phát hiện ${conflicts.length} xếp ca trùng ngày Bận / OFF</b>${conflicts.map((c) => `<div>${c.h}</div>`).join("")}</div></div>` : `<div class="banner ok"><div><b>✅ Không ai bị xếp ca trùng ngày Bận / OFF đã đăng ký.</b></div></div>`}
      ${warns.length ? `<div class="banner warn"><div>${warns.join("<br>")}</div></div>` : ""}
      ${unmatched.length ? `<p class="small muted">Chưa khớp với nhân sự trong tool: ${unmatched.map(esc).join(", ")} (mã NV trong HRM cần trùng mã trong tool).</p>` : ""}
      <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th>${sch.days.map((d, di) => `<th colspan="6" style="text-align:center;${dayBad[di] ? "background:var(--bad);color:#fff" : ""}">${d.label} (${dm(d.date)})</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
}

// =================== Roadshow ===================
async function rs(body) {
  const from = ym + "-01", to = addDays(shiftMonth(ym, 1) + "-01", -1), today = vnToday();
  D.rs = await load("roadshow", "rs_date", from, to);
  const on = (d) => D.rs.filter((r) => r.rs_date === d).sort((a, b) => a.rs_time.localeCompare(b.rs_time));
  const minKm = setting("RS_MIN_KM", 5), minMin = setting("RS_MIN_MIN", 30);
  body.innerHTML = `<div class="card"><div class="card-h"><h2>🏃 Lịch Roadshow</h2><span class="small muted">Sáng 6h–10h30, chiều 15h–18h (30 phút/khung) · mỗi lượt ≥ ${minKm} km & ≥ ${minMin} phút · tối thiểu 3 ảnh</span></div>
    ${calNav()}
    ${monthGrid(ym, (d) => { const l = on(d); return l.map((r) => { const done = r.photos.length >= 3, late = !done && (d < today || (d === today && r.rs_time <= vnHM()));
      return `<span class="tag ${done ? "ok" : late ? "bad" : "info"}">${r.rs_time} ${esc(shortName(name(r.staff_id)))}${r.source === "QL" ? " 📌" : ""}</span>`; }).join("") + (!l.length && d >= today ? `<span class="free">+ Còn trống</span>` : ""); })}
    <div class="legend"><span>🟦 Đã đăng ký</span><span>✅ Đã nộp báo cáo</span><span>⚠️ Quá giờ chưa nộp</span><span>📌 Quản lý xếp</span></div></div>`;
  bindNav(body);
  body.onclick = async (e) => {
    const cell = e.target.closest("[data-day]"); if (!cell) return;
    openRsDay(cell.dataset.day);
  };
  async function openRsDay(d) {
    const l = on(d), canReg = d >= today;
    const v = await modal(`<h3>🏃 ${dow(d)} ${dmy(d)}</h3>
      ${l.length ? `<div class="stack" style="gap:8px;margin-bottom:12px">${l.map((r) => { const done = r.photos.length >= 3, can = (isManager() || r.staff_id === me()) && !done && (d < today || (d === today && r.rs_time <= vnHM()));
        return `<div class="card" style="padding:10px;box-shadow:none"><div class="row"><b>${r.rs_time}</b><span class="grow">${esc(name(r.staff_id))}${r.source === "QL" ? ' <span class="pill info">QL xếp</span>' : ""}</span>${done ? `<span class="pill ok">✅ ${fmt(r.km, 1)} km · ${fmt(r.minutes)} phút</span>` : ""}
          ${can ? `<button class="btn small primary" data-v="rep:${esc(r.staff_id)}|${r.rs_time}" type="button">Nộp báo cáo</button>` : ""}${isManager() ? `${done ? `<button class="btn small ghost" data-v="delph:${esc(r.staff_id)}|${r.rs_time}" type="button">Xoá ảnh</button>` : ""}<button class="btn small ghost danger" data-v="del:${esc(r.staff_id)}|${r.rs_time}" type="button">Xoá</button>` : ""}</div>
          ${done ? `<div class="photos" data-ph="${esc(r.staff_id)}|${r.rs_time}" style="margin-top:6px"></div>` : ""}</div>`; }).join("")}</div>` : `<p class="muted">Chưa có lượt nào.</p>`}
      ${canReg ? `<form class="stack"><div class="fields"><label>Nhân viên${staffPicker("rsStaff")}</label><label>Khung giờ<select id="rsTime">${RS_TIMES.filter((t) => d > today || t >= vnHM()).map((t) => `<option>${t}</option>`).join("")}</select></label></div>
        ${isManager() ? `<details><summary class="small">📌 Xếp lịch nhiều người cùng khung giờ</summary><div class="chips" style="margin-top:6px">${visibleStaff().map((s) => `<label class="chip inline"><input type="checkbox" class="rsMany" value="${esc(s.id)}"> ${esc(shortName(s.name))}</label>`).join("")}</div></details>` : ""}</form>` : ""}
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button>${canReg ? `<button class="btn primary" data-v="reg">Đăng ký</button>` : ""}</div>`,
      { onOpen: (b) => { b.querySelectorAll("[data-ph]").forEach((el) => { const [sid, t] = el.dataset.ph.split("|"); const r = l.find((x) => x.staff_id === sid && x.rs_time === t); fillPhotos(el, r.photos); });
        b.querySelector("[data-v=reg]")?.addEventListener("click", () => { state.rsTime = b.querySelector("#rsTime")?.value; state.rsStaff = b.querySelector("#rsStaff")?.value || me(); state.rsMany = [...b.querySelectorAll(".rsMany:checked")].map((i) => i.value); }, true); } });
    if (!v || v === "cancel") return;
    try {
      if (v === "reg") {
        if (!state.rsTime) return toast("Hết khung giờ hôm nay");
        const r = state.rsMany?.length ? await rpc("rs_assign", { p_date: d, p_time: state.rsTime, p_staffs: state.rsMany }) : await rpc("rs_register", { p_staff: state.rsStaff, p_date: d, p_time: state.rsTime });
        toast("✅ " + r.message); return draw();
      }
      const [act, rest] = [v.split(":")[0], v.slice(v.indexOf(":") + 1)]; const [sid, t] = rest.split("|");
      if (act === "rep") return rsReport(d, sid, t);
      if (!(await confirmBox(act === "del" ? "Xoá lượt Roadshow?" : "Xoá ảnh báo cáo?", `${esc(name(sid))} · ${t} ${dmy(d)}`, "Xoá", true))) return;
      const r = await rpc("rs_delete", { p_staff: sid, p_date: d, p_time: t, p_only_photos: act === "delph" }); await removeAll(r.photos); toast("Đã xoá"); draw();
    } catch (x) { err(x); }
  }
  async function rsReport(d, sid, t) {
    const v = await modal(`<h3>Báo cáo Roadshow ${t} · ${dmy(d)}</h3><p class="small muted">${esc(name(sid))} · tối thiểu ${minKm} km và ${minMin} phút, 3–6 ảnh</p>
      <form class="stack"><div class="fields"><label>Quãng đường (km)<input name="km" type="number" step="0.1" min="0" required></label><label>Thời gian (phút)<input name="min" type="number" step="1" min="0" required></label></div>
      ${pickerHtml(["Ảnh trước khi chạy", "Ảnh app Strava", "Ảnh loa & USB (khu vực sạc)", "Ảnh thêm", "Ảnh thêm", "Ảnh thêm"])}</form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">📤 Nộp báo cáo</button></div>`,
      { onOpen: (b) => { bindPicker(b); b.querySelector("[data-v=submit]").addEventListener("click", () => { state.rsFiles = files([...b.querySelectorAll("[data-ph]")]); }, true); } });
    if (!v) return;
    if ((state.rsFiles || []).length < 3) return toast("Cần ít nhất 3 ảnh");
    if (Number(v.km) < minKm || Number(v.min) < minMin) return toast(`Cần ≥ ${minKm} km và ≥ ${minMin} phút`);
    try {
      toast("⏳ Đang tải ảnh…", 8000);
      const paths = await uploadAll(`rs/${d}/${sid}`, state.rsFiles);
      const r = await rpc("rs_report", { p_staff: sid, p_date: d, p_time: t, p_km: Number(v.km), p_minutes: Number(v.min), p_photos: paths });
      toast("✅ " + r.message); draw();
    } catch (x) { err(x); }
  }
}

// =================== Thống kê ===================
async function stats(body) {
  const from = ym + "-01", to = addDays(shiftMonth(ym, 1) + "-01", -1), today = vnToday(), end = to < today ? to : today;
  const start = String(setting("TIKTOK_START_DATE", today)).slice(0, 10);
  const [tt, cl, bz, rr, res] = await Promise.all([
    load("tiktok_submissions", "due", from, to), load("cleaning", "clean_date", from, to), load("busy", "busy_date", from, to), load("roadshow", "rs_date", from, to),
    sb.from("daily_results").select("report_date,staff_id,compensation").gte("report_date", from).lte("report_date", to).limit(20000).then((r) => r.data || []),
  ]);
  const dues = dueDates(start > from ? start : from, end < to ? addDays(end, -1) : to).filter((d) => d < today);
  const list = visibleStaff().map((s) => {
    const mine = (a, k = "staff_id") => a.filter((x) => x[k] === s.id);
    const t = mine(tt), c = mine(cl), b = mine(bz), r = mine(rr);
    const days = new Set(res.filter((x) => x.staff_id === s.id).map((x) => x.report_date));
    return { s, days: days.size, ban: b.filter((x) => x.type === "BAN").length, off: b.filter((x) => x.type === "OFF").length,
      ttOk: t.filter((x) => x.status === "ĐÚNG HẠN" || x.status === "SỚM").length, ttLate: t.filter((x) => x.status === "TRỄ").length, ttMiss: dues.filter((d) => !t.some((x) => x.due === d)).length,
      links: t.reduce((a, x) => a + x.tiktok_links.length + x.fb_links.length, 0), clReg: c.length, clDone: c.filter((x) => x.photos.length >= 3).length,
      rsReg: r.length, rsDone: r.filter((x) => x.photos.length >= 3).length, km: r.reduce((a, x) => a + (Number(x.km) || 0), 0), late: res.filter((x) => x.staff_id === s.id && x.compensation === "PHAT_TRE").length, t, c, b, r };
  });
  body.innerHTML = `<div class="card"><div class="card-h"><h2>📊 Thống kê công việc theo nhân viên</h2><button class="btn small" id="stCopy" type="button">📋 Copy</button><button class="btn small" id="stCsv" type="button">⬇️ CSV</button></div>
    ${calNav().replace("Hôm nay", "Tháng này")}
    <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th class="num">Ngày BC</th><th class="num">Trễ BC</th><th class="num">Bận</th><th class="num">OFF</th><th class="num">TikTok đúng hạn</th><th class="num">Trễ</th><th class="num">Chưa nộp</th><th class="num">Vệ sinh</th><th class="num">Roadshow</th><th class="num">Km</th></tr></thead><tbody>
    ${list.map((x, i) => `<tr><td><a href="#" data-st="${i}">${esc(x.s.name)}</a></td><td class="num">${x.days}</td><td class="num ${x.late ? "neg" : ""}">${x.late || ""}</td><td class="num">${x.ban || ""}</td><td class="num">${x.off || ""}</td>
      <td class="num pos">${x.ttOk || ""}</td><td class="num">${x.ttLate || ""}</td><td class="num ${x.ttMiss ? "neg" : ""}">${x.ttMiss || ""}</td>
      <td class="num">${x.clDone}${x.clReg !== x.clDone ? ` <span class="muted">(${x.clReg})</span>` : ""}</td><td class="num">${x.rsDone}${x.rsReg !== x.rsDone ? ` <span class="muted">(${x.rsReg})</span>` : ""}</td><td class="num">${x.km ? fmt(x.km, 1) : ""}</td></tr>`).join("")}
    </tbody></table></div><p class="small muted">Vệ sinh & Roadshow: số lần đã nộp báo cáo (trong ngoặc: số lần đăng ký). Bấm tên để xem chi tiết.</p></div>`;
  bindNav(body);
  body.onclick = (e) => {
    const a = e.target.closest("[data-st]"); if (!a) return; e.preventDefault();
    const x = list[Number(a.dataset.st)];
    modal(`<h3>${esc(x.s.name)} · ${monthLabel(ym)}</h3>
      <p><b>Bận / OFF:</b> ${x.b.length ? x.b.map((b) => `${dm(b.busy_date)} ${b.type === "OFF" ? "OFF" : "Bận" + (b.shifts.length ? " C" + b.shifts.join(",") : "")}`).join(" · ") : "—"}</p>
      <p><b>TikTok:</b> ${x.t.length ? x.t.map((t) => `${ttLabel(t.due)} ${t.status}`).join(" · ") : "—"}</p>
      ${x.t.some((t) => t.tiktok_links.length) ? `<p class="small">${x.t.flatMap((t) => [...t.tiktok_links, ...t.fb_links]).map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\//, "").slice(0, 50))}</a>`).join("<br>")}</p>` : ""}
      <p><b>Vệ sinh:</b> ${x.c.length ? x.c.map((c) => `${dm(c.clean_date)}${c.photos.length >= 3 ? " ✅" : " ⚠️"}`).join(" · ") : "—"}</p>
      <p><b>Roadshow:</b> ${x.r.length ? x.r.map((r) => `${dm(r.rs_date)} ${r.rs_time}${r.photos.length >= 3 ? ` ✅ ${fmt(r.km, 1)}km` : " ⚠️"}`).join(" · ") : "—"}</p>
      <div class="modal-actions"><button class="btn primary" data-v="ok">Đóng</button></div>`);
  };
  const rows = () => [["Nhân viên", "Ngày BC", "Trễ BC", "Bận", "OFF", "TikTok đúng hạn", "TikTok trễ", "TikTok chưa nộp", "Vệ sinh nộp/ĐK", "Roadshow nộp/ĐK", "Km"],
    ...list.map((x) => [x.s.name, x.days, x.late, x.ban, x.off, x.ttOk, x.ttLate, x.ttMiss, `${x.clDone}/${x.clReg}`, `${x.rsDone}/${x.rsReg}`, x.km])];
  $("#stCsv").onclick = () => download(`thong-ke-cv_${ym}.csv`, csv(rows()));
  $("#stCopy").onclick = async () => toast((await copyText([`📊 THỐNG KÊ CÔNG VIỆC ${monthLabel(ym).toUpperCase()}`, ...list.map((x) => `• ${x.s.name}: BC ${x.days} ngày · Bận ${x.ban} · OFF ${x.off} · TikTok ✅${x.ttOk} ⏰${x.ttLate} ❌${x.ttMiss} · VS ${x.clDone} · RS ${x.rsDone}${x.km ? ` (${fmt(x.km, 1)}km)` : ""}`)].join("\n"))) ? "Đã copy" : "Không copy được");
}

// Thời điểm đăng video TikTok đọc từ mã video trong link dạng …/video/<id> (32 bit đầu của id = giây Unix). Link rút gọn vt.tiktok.com không đọc được.
function ttPosted(link) {
  const m = String(link).match(/tiktok\.com\/.*?\/(?:video|photo)\/(\d{15,20})/); if (!m) return "";
  try { const sec = Number(BigInt(m[1]) >> 32n); if (sec < 1.4e9 || sec > Date.now() / 1000 + 86400) return ""; return new Date(sec * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); } catch { return ""; }
}
