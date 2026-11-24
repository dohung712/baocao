// D20 🙈 Ẩn chức năng — dễ nhất cho Admin:
//  • Nút 🙈 trên đầu trang (chỉ Admin) bật "chế độ ẩn": mọi trang trên menu, tab, mục của trang hiện nút nhỏ (👁️ ai cũng thấy · ◐ ẩn 1 số bộ phận · 🙈 ẩn hết NV)
//    bấm → hộp "Ai đang thấy": Admin & Quản lý luôn thấy, tick / bỏ tick từng bộ phận NV → tự lưu, mục mờ đi ngay
//  • Thanh trên cùng: 🔎 tìm chức năng theo tên (cả mục chưa mở), 📋 danh sách đang ẩn, ✕ Xong
//  • Với NV: tab / mục bị ẩn biến mất hẳn (trang bị ẩn đã không vào được qua menu / địa chỉ — app.js allowed())
import { sb, S, setting, loadSettings, isHidden, depts } from "./store.js";
import { isAdmin } from "./roles.js";
import { esc, toast, modal } from "./ui.js";

const LEGACY = [["cv.nav", "Tab CV trên thanh menu"], ["report.revenue", "Báo cáo › Ô doanh thu QĐ"], ["report.media", "Báo cáo › Báo cáo truyền thông ngày"], ["report.extra", "Báo cáo › Bán thêm ngoài thi đua"],
  ["cv.tiktok", "CV › TikTok"], ["cv.clean", "CV › Vệ sinh"], ["cv.busy", "CV › Lịch bận"], ["cv.rs", "CV › Roadshow"], ["cv.flyer", "CV › Phát tờ rơi"], ["cv.vio", "CV › Biên bản vi phạm"], ["cv.fund", "CV › Quỹ thu chi"]];
const CAT = "thidua-v2-hide-cat";
let PAGES = [], on = false, obs = null, raf = 0;
const page = () => location.hash.slice(1).split("?")[0] || "today";
const pageLabel = (id) => PAGES.find((p) => p.id === id)?.label || id;
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const slug = (t) => norm(t).replace(/[0-9]/g, " ").replace(/[^a-z]+/g, "-").split("-").filter(Boolean).slice(0, 5).join("-");
const clean = (el) => (el?.textContent || "").replace(/[📸👁️◐🙈]/gu, "").replace(/\s+/g, " ").trim();
const emp = () => S.me?.role === "employee";
const H2 = () => setting("HIDE2", {}) || {};

// ---------- các chỗ ẩn được trên màn hình ----------
function targets() {
  const out = [], p = page(), view = document.getElementById("view");
  for (const b of document.querySelectorAll("#nav [data-page], #tabbar [data-page]")) out.push({ key: b.dataset.page, label: pageLabel(b.dataset.page), el: b, nodes: [b], kind: "nav" });
  if (!view) return out;
  for (const b of view.querySelectorAll(".subtabs button[data-t], .subtabs button[data-hub]")) {
    const key = b.dataset.hub || `${p}.${b.dataset.t}`;
    out.push({ key, label: b.dataset.hub ? pageLabel(b.dataset.hub) : `${pageLabel(p)} › ${clean(b)}`, el: b, nodes: [b], kind: "tab" });
  }
  const heads = [...view.querySelectorAll(".td-h2")];
  if (heads.length) for (const h of heads) {
    const nodes = [h]; let n = h.nextElementSibling;
    while (n && !n.classList.contains("td-h2")) { nodes.push(n); n = n.nextElementSibling; }
    const t = clean(h.querySelector("h2") || h), s = slug(t);
    if (s) out.push({ key: `${p}.s.${s}`, label: `${pageLabel(p)} › ${t}`, el: h, nodes, kind: "sec", secId: h.id });
  }
  else {
    const seen = [];
    for (const el of view.querySelectorAll(".card, .ag-sec, .gd-day, .av-card, .pgw")) {
      if (seen.some((x) => x.contains(el)) || el.closest("#modal")) continue;
      const t = clean(el.querySelector("h1, h2, h3, summary")), s = slug(t);
      if (!s) continue;
      seen.push(el);
      out.push({ key: `${p}.s.${s}`, label: `${pageLabel(p)} › ${t}`, el, nodes: [el], kind: "sec" });
    }
  }
  return out;
}

// ---------- NV: tab / mục bị ẩn biến mất ----------
function enforce() {
  for (const t of targets()) {
    if (t.kind === "nav" || !isHidden(t.key)) continue;
    for (const n of t.nodes) n.style.display = "none";
    if (t.kind === "tab" && t.el.classList.contains("on")) {   // tab đang mở bị ẩn → chuyển sang tab đầu còn hiện
      const first = [...t.el.parentElement.querySelectorAll("button")].find((b) => b.style.display !== "none");
      setTimeout(() => first?.click(), 0);
    }
    if (t.secId) document.querySelectorAll(`#view [data-sec="${t.secId}"]`).forEach((x) => (x.style.display = "none"));
  }
}

// ---------- Admin: chế độ ẩn ----------
const state = (key) => { const e = H2()[key]; if (!e?.hide?.length) return "all"; return e.hide.includes("*") ? "none" : "some"; };
function annotate() {
  const cat = loadCat();
  for (const t of targets()) {
    cat[t.key] = t.label;
    const st = state(t.key);
    t.el.classList.toggle("hm-none", st === "none"); t.el.classList.toggle("hm-some", st === "some");
    for (const n of t.nodes.slice(1)) { n.classList.toggle("hm-none", st === "none"); n.classList.toggle("hm-some", st === "some"); }
    let c = [...t.el.children].find((x) => x.classList?.contains("hm-chip"));
    if (!c) {
      c = document.createElement("hm-chip"); c.className = "hm-chip hm-" + t.kind;   // thẻ riêng: không bị kiểu "span" của menu ẩn đi c.setAttribute("role", "button"); c.tabIndex = 0;
      c.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); editor(t.key, t.label); }, true);
      if (t.kind === "sec" && getComputedStyle(t.el).position === "static") t.el.style.position = "relative";
      t.el.appendChild(c);
    }
    const icon = st === "all" ? "👁️" : st === "some" ? "◐" : "🙈", tip = `${t.label}: ${who(t.key)} — bấm để chỉnh`;
    if (c.textContent !== icon) c.textContent = icon;   // chỉ đổi khi khác (tránh vòng lặp với MutationObserver)
    if (c.title !== tip) c.title = tip;
  }
  saveCat(cat);
}
function clearMarks() { document.querySelectorAll(".hm-chip").forEach((x) => x.remove()); document.querySelectorAll(".hm-none, .hm-some").forEach((x) => x.classList.remove("hm-none", "hm-some")); }
function loadCat() { try { return JSON.parse(localStorage.getItem(CAT) || "{}"); } catch { return {}; } }
function saveCat(c) { try { localStorage.setItem(CAT, JSON.stringify(c)); } catch { /* bỏ qua */ } }
function who(key) {
  const e = H2()[key]; if (!e?.hide?.length) return "mọi NV thấy";
  if (e.hide.includes("*")) return "ẩn với mọi NV";
  return "ẩn với " + e.hide.join(", ");
}
// cấp cha đang ẩn → ghi chú
const parentHidden = (key) => { const p = key.split("."); for (let i = p.length - 1; i > 0; i--) { const k = p.slice(0, i).join("."), e = H2()[k]; if (e?.hide?.length) return { k, e }; } return null; };

async function save(key, label, hide) {
  const h2 = { ...H2() };
  if (!hide.length) delete h2[key]; else h2[key] = { label, hide };
  const { error } = await sb.from("settings").upsert({ key: "HIDE2", value: h2, updated_by: S.me.email, updated_at: new Date().toISOString() });
  if (error) throw error;
  await loadSettings();
}

async function editor(key, label) {
  const D = depts(), e = H2()[key], hide = new Set(e?.hide || []);
  const all = hide.has("*"), par = parentHidden(key);
  const v = await modal(`<h3>🙈 ${esc(label)}</h3>
    <p class="small muted" style="margin:-4px 0 8px">Ai đang thấy chức năng này? Bỏ tick = ẩn với NV bộ phận đó. Tự lưu.</p>
    ${par ? `<div class="banner warn" style="margin-bottom:8px"><div>Cấp trên <b>${esc(par.e.label || par.k)}</b> đang ${esc(who(par.k))} — phần này cũng ẩn theo với những NV đó.</div></div>` : ""}
    <div class="hm-who">
      <label class="hm-row lock"><input type="checkbox" checked disabled> 🧑‍💼 Admin &amp; Quản lý <span class="tiny muted">luôn thấy</span></label>
      <label class="hm-row"><input type="checkbox" id="hmAll" ${all ? "" : "checked"}> 👥 <b>Mọi nhân viên</b></label>
      ${D.map((d) => `<label class="hm-row sub"><input type="checkbox" data-d="${esc(d)}" ${all || hide.has(d) ? "" : "checked"} ${all ? "disabled" : ""}> NV bộ phận <b>${esc(d)}</b></label>`).join("")}
    </div>
    <p class="small" id="hmMsg" style="min-height:1.2em"></p>
    <div class="modal-actions"><button class="btn" type="button" data-v="cancel">Xong</button></div>`, {
    onOpen(body) {
      const msg = (t) => { const m = body.querySelector("#hmMsg"); if (m) m.textContent = t; };
      const allBox = body.querySelector("#hmAll"), boxes = [...body.querySelectorAll("[data-d]")];
      body.addEventListener("change", async (ev) => {
        if (ev.target === allBox) boxes.forEach((c) => { c.checked = allBox.checked; c.disabled = !allBox.checked; });   // bật "Mọi NV" = mọi bộ phận thấy lại
        let hideList = !allBox.checked ? ["*"] : boxes.filter((c) => !c.checked).map((c) => c.dataset.d);
        if (allBox.checked && D.length && hideList.length === D.length) { hideList = ["*"]; allBox.checked = false; boxes.forEach((c) => (c.disabled = true)); }
        msg("Đang lưu…");
        try { await save(key, label, hideList); msg(hideList.length ? `✅ Đã lưu — ${who(key)}` : "✅ Đã lưu — mọi NV thấy"); }
        catch (x) { msg("⚠️ " + (x.message || x)); }
      });
    },
  });
  if (on) schedule();
  return v;
}

// thanh công cụ chế độ ẩn: tìm theo tên, danh sách đang ẩn
function bar() {
  let b = document.getElementById("hmBar");
  if (!on) { b?.remove(); return; }
  if (b) { b.querySelector("#hmCount").textContent = Object.keys(H2()).length; return; }
  b = document.createElement("div"); b.id = "hmBar";
  b.innerHTML = `<b>🙈 Chế độ ẩn</b><span class="tiny">bấm 👁️ / ◐ / 🙈 trên từng menu, tab, mục</span>
    <div class="hm-search"><input id="hmQ" placeholder="🔎 Tìm chức năng theo tên…" autocomplete="off"><div id="hmRes"></div></div>
    <button class="btn small" type="button" id="hmList">📋 Đang ẩn (<span id="hmCount">${Object.keys(H2()).length}</span>)</button>
    <button class="btn small primary" type="button" id="hmDone">✕ Xong</button>`;
  document.body.appendChild(b);
  const q = b.querySelector("#hmQ"), res = b.querySelector("#hmRes");
  const catalog = () => {
    const c = { ...Object.fromEntries(PAGES.map((p) => [p.id, p.label])), ...Object.fromEntries(LEGACY), ...loadCat() };
    for (const [k, e] of Object.entries(H2())) c[k] = c[k] || e.label || k;
    return Object.entries(c);
  };
  q.oninput = () => {
    const s = norm(q.value.trim());
    if (!s) { res.innerHTML = ""; return; }
    const hits = catalog().filter(([k, l]) => norm(l).includes(s) || norm(k).includes(s)).slice(0, 12);
    res.innerHTML = hits.map(([k, l]) => `<button type="button" data-k="${esc(k)}" data-l="${esc(l)}">${state(k) === "all" ? "👁️" : state(k) === "some" ? "◐" : "🙈"} ${esc(l)}</button>`).join("") || `<div class="tiny muted" style="padding:6px">Không thấy — mở trang có chức năng đó để tool ghi nhận tên.</div>`;
  };
  res.onclick = (e) => { const x = e.target.closest("[data-k]"); if (x) { res.innerHTML = ""; q.value = ""; editor(x.dataset.k, x.dataset.l); } };
  b.querySelector("#hmList").onclick = async () => {
    const list = Object.entries(H2());
    const v = await modal(`<h3>📋 Đang ẩn (${list.length})</h3>${list.length ? `<div class="hm-list">${list.map(([k, e]) => `<div class="hm-li"><span class="grow"><b>${esc(e.label || k)}</b><br><span class="tiny muted">${esc(who(k))}</span></span><button class="btn small" type="button" data-v="edit:${esc(k)}">Chỉnh</button></div>`).join("")}</div>` : `<p class="muted">Chưa ẩn gì — mọi NV thấy đủ chức năng.</p>`}
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button></div>`);
    if (v && String(v).startsWith("edit:")) { const k = String(v).slice(5); setTimeout(() => editor(k, H2()[k]?.label || k), 200); }
  };
  b.querySelector("#hmDone").onclick = () => toggle(false);
}

function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); }
function run() {
  if (on && isAdmin()) { annotate(); bar(); }
  else if (emp()) enforce();
}
function toggle(v) {
  on = v; document.documentElement.classList.toggle("hide-mode", on);
  const btn = document.getElementById("btnHide"); if (btn) btn.classList.toggle("on", on);
  if (!on) { clearMarks(); bar(); } else { schedule(); toast("🙈 Chế độ ẩn: bấm biểu tượng trên menu / tab / mục để chọn ai được thấy", 4500); }
}

export function initHide(pages) {
  PAGES = pages || PAGES;
  if (!obs) {
    obs = new MutationObserver((ms) => { if (ms.every((m) => [...m.addedNodes].every((n) => n.classList?.contains("hm-chip")))) return; schedule(); });
    for (const id of ["view", "nav", "tabbar"]) { const el = document.getElementById(id); if (el) obs.observe(el, { childList: true, subtree: true }); }
  }
  const me = document.getElementById("btnMe");
  let b = document.getElementById("btnHide");
  if (isAdmin() && me && !b) {
    b = document.createElement("button"); b.id = "btnHide"; b.type = "button"; b.className = "btn ghost small"; b.textContent = "🙈"; b.title = "Ẩn chức năng với nhân viên (chế độ ẩn)";
    b.onclick = () => toggle(!on);
    me.parentElement.insertBefore(b, me);
  } else if (!isAdmin() && b) { b.remove(); if (on) toggle(false); }
  schedule();
}

// mở chế độ ẩn từ nơi khác (Quản lý → Cài đặt)
export function openHideMode() { if (isAdmin()) toggle(true); }
