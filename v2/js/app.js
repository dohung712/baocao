// Khởi động ứng dụng: đăng nhập, điều hướng, đồng bộ
import { $, esc, toast, modal, enableAutoSort } from "./ui.js";
import { initHelp, helpOn, setHelp } from "./help.js";
import { renderReminders } from "./reminders.js";
import { sb, S, loadMe, loadAll, startRealtime, stopRealtime, onLive, onChange, isManager, roleLabel, errMsg, setting, SUPABASE_URL, staffEmail, isHidden } from "./store.js";
import * as report from "./pages/report.js";
import * as historyPage from "./pages/history.js";
import * as store from "./pages/store.js";
import * as admin from "./pages/admin.js";
import * as cv from "./pages/cv.js";
import * as rules from "./pages/rules.js";
import * as assistant from "./pages/assistant.js";
import * as rankhub from "./pages/rankhub.js";
import * as today from "./pages/today.js";
import * as jobs from "./pages/jobs.js";
import * as duyet from "./pages/duyet.js";
import { registerSW } from "./push.js";
import { setViewAs } from "./viewas.js";

// Menu gọn (23/11/2026): chức năng chính trên menu, phần còn lại trong "☰ Thêm".
// tab: hiện ở thanh dưới (điện thoại) · more: chỉ nằm trong ☰ Thêm · nav: có liệt kê không (vẫn mở được bằng địa chỉ / nút)
// alias: trang con của trang khác (Xếp hạng gộp Điểm · Sao · Của tôi) · ok: điều kiện mở thay cho Ẩn trang theo id
const hubOk = rankhub.anyOpen;
const PAGES = [
  { id: "today", icon: "🏠", label: "Hôm nay", mod: today, tab: true },
  { id: "report", icon: "📝", label: "Báo cáo", mod: report, tab: true },
  { id: "jobs", icon: "📋", label: "Giao việc", mod: jobs, manager: true, tab: true },
  { id: "duyet", icon: "📥", label: "Duyệt", mod: duyet, manager: true, tab: true },
  { id: "score", icon: "🏅", label: "Xếp hạng", mod: { render: rankhub.make("score") }, tab: true, ok: hubOk, group: ["ranking", "me"] },
  { id: "store", icon: "🏢", label: "Siêu thị", mod: store, tab: () => !isManager() },
  { id: "admin", icon: "⚙️", label: "Quản lý", mod: admin, manager: true },
  { id: "cv", icon: "🗂️", label: "CV", mod: cv, more: true, nav: () => isManager() || !isHidden("cv.nav") },
  { id: "history", icon: "🕒", label: "Báo cáo đã nộp", mod: historyPage, more: true, nav: () => isManager() },
  { id: "assistant", icon: "🤖", label: "Trợ lý", mod: assistant, more: true },
  { id: "rules", icon: "📖", label: "Rule", mod: rules, more: true },
  { id: "ranking", icon: "⭐", label: "BXH sao", mod: { render: rankhub.make("ranking") }, ok: hubOk, alias: true },
  { id: "me", icon: "👤", label: "Của tôi", mod: { render: rankhub.make("me") }, ok: hubOk, alias: true },
];
const allowed = () => PAGES.filter((p) => (!p.manager || isManager()) && (p.ok ? p.ok() : !isHidden(p.id)));
let current = null, cleanup = null, navToken = 0;

function show(id) { for (const x of ["boot", "login", "app"]) $("#" + x).hidden = x !== id; }

function pendingCount() { return (S.pending.proposals || 0) + (S.pending.changes || 0) + (S.pending.hot || 0) + (S.pending.agent || 0); }
const isTab = (p) => (typeof p.tab === "function" ? p.tab() : !!p.tab);
function renderNav() {
  const pages = allowed().filter((p) => !p.alias && (!p.nav || p.nav() || p.id === current));
  const on = (p) => current === p.id || (p.group || []).includes(current);
  const badgeOf = (p) => (p.id === "duyet" && pendingCount() ? `<b class="badge">${pendingCount()}</b>` : "");   // D14b: mọi mục chờ duyệt gom về 📥 Duyệt
  const main = pages.filter((p) => !p.more), extra = pages.filter((p) => p.more);
  const tabs = main.filter(isTab), sheet = [...main.filter((p) => !isTab(p)), ...extra];
  // Máy tính: chức năng chính + ☰ Thêm · Điện thoại: thanh dưới + ☰ Thêm (phần còn lại)
  $("#nav").innerHTML = main.map((p) => `<button type="button" data-page="${p.id}" class="${on(p) ? "on" : ""}"><span>${p.icon}</span> ${p.label}${badgeOf(p)}</button>`).join("")
    + (extra.length ? `<button type="button" class="nav-more ${extra.some(on) ? "on" : ""}" data-more="1"><span>☰</span> Thêm</button>` : "");
  const moreBadge = pendingCount() && sheet.some((p) => p.id === "duyet") ? `<b class="badge">${pendingCount()}</b>` : "";
  $("#tabbar").innerHTML = tabs.map((p) => `<button type="button" data-page="${p.id}" class="${on(p) ? "on" : ""}"><span>${p.icon}</span>${p.label}${badgeOf(p)}</button>`).join("")
    + (sheet.length ? `<button type="button" id="btnMore" data-more="2" class="${sheet.some(on) ? "on" : ""}"><span>☰</span>Thêm${moreBadge}</button>` : "");
  const openSheet = async (list) => {
    const v = await modal(`<h3>Chức năng khác</h3><div class="sheet">${list.map((p) => `<button type="button" data-v="${p.id}"><span>${p.icon}</span>${p.label}${badgeOf(p) ? " " + badgeOf(p) : ""}</button>`).join("")}</div>`);
    if (v) go(v);
  };
  $("#nav").querySelector("[data-more]")?.addEventListener("click", () => openSheet(extra));
  $("#btnMore")?.addEventListener("click", () => openSheet(sheet));
}

async function go(id, params = {}) {
  const page = allowed().find((p) => p.id === id) || allowed()[0] || PAGES[0];
  if (cleanup) { try { cleanup(); } catch { /* bỏ qua */ } cleanup = null; }
  current = page.id;
  if (location.hash.slice(1).split("?")[0] !== page.id) history_replace(page.id);
  renderNav();
  const view = $("#view");
  view.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto 8px"></div>Đang tải…</div>`;
  const token = ++navToken;
  try {
    const c = (await page.mod.render(view, params, { go })) || null;
    if (token !== navToken) { try { c?.(); } catch { /* bỏ qua */ } return; } // đã chuyển trang khác trong lúc tải
    cleanup = c;
  } catch (e) {
    if (token !== navToken) return;
    console.error(e); view.innerHTML = `<div class="banner bad"><div><b>Không tải được trang</b>${esc(errMsg(e))}</div></div>`;
  }
  window.scrollTo(0, 0);
}
function history_replace(id) { try { history.replaceState(null, "", "#" + id); } catch { location.hash = id; } }

// Nhắc việc theo lịch đăng ký (vệ sinh) — gắn sự kiện 1 lần
let remBound = false;
function remind() {
  const rem = () => renderReminders(go).catch(() => {});
  rem(); if (remBound) return; remBound = true;
  onChange((w) => { if (w === "cv") rem(); }); document.addEventListener("remind:refresh", rem);
}

async function enterApp() {
  show("boot");
  try {
    const me = await loadMe();
    if (!me) {
      show("login");
      $("#loginMsg").className = "msg err";
      $("#loginMsg").innerHTML = `Tài khoản <b>${esc(S.user?.email || "")}</b> chưa được cấp quyền. Nhờ chủ quản thêm email này trong <i>Quản lý → Phân quyền</i>. <a href="#" id="lnkOut">Đăng xuất</a>`;
      $("#lnkOut").onclick = (e) => { e.preventDefault(); sb.auth.signOut().then(() => location.reload()); };
      return;
    }
    await loadAll();
  } catch (e) { show("login"); $("#loginMsg").className = "msg err"; $("#loginMsg").textContent = errMsg(e); return; }
  $("#storeName").textContent = setting("STORE_NAME", "");
  $("#btnMe").textContent = S.me.viewAs ? `👁️ ${roleLabel(S.me.role)} · ${S.me.role === "employee" ? (S.allStaff || []).find((s) => s.id === S.me.staff_id)?.name || S.me.staff_id : (S.me.stores || []).join(", ")}` : `👤 ${S.me.email.split("@")[0]} · ${roleLabel(S.me.role)}`;
  show("app");
  renderViewAs();
  startRealtime();
  registerSW();   // nhận thông báo đẩy (sw.js) — không lưu đệm trang
  if (S.user?.user_metadata?.must_change) setTimeout(() => setPassword(false, true), 300);
  const id = location.hash.slice(1).split("?")[0] || "today";
  go(id);
  remind();
}

// ---------- Đăng nhập ----------
function loginMsg(text, ok = false) { const m = $("#loginMsg"); m.className = "msg " + (ok ? "ok" : "err"); m.textContent = text; }
$("#fPass").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; loginMsg("");
  const id = $("#lEmail").value.trim().toLowerCase(), isCode = !id.includes("@");
  const { error } = await sb.auth.signInWithPassword({ email: isCode ? staffEmail(id) : id, password: $("#lPass").value });
  btn.disabled = false;
  if (error) return loginMsg(/Invalid login/i.test(error.message) ? (isCode ? "Sai mã nhân viên hoặc mật khẩu. Quên mật khẩu: nhờ chủ quản đặt lại (Quản lý → Tài khoản NV)." : "Sai email hoặc mật khẩu. Nếu quên mật khẩu, dùng mục bên dưới.") : errMsg(error));
  enterApp();
});
$("#btnOtp").onclick = async () => {
  const email = $("#lEmail").value.trim().toLowerCase();
  if (!email) return loginMsg("Nhập email ở ô phía trên trước.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
  if (error) return loginMsg(errMsg(error));
  loginMsg("Đã gửi email. Mở email, copy link (hoặc mã) và dán vào ô bên dưới.", true);
};
$("#btnVerify").onclick = async () => {
  const raw = $("#lLink").value.trim(), email = $("#lEmail").value.trim().toLowerCase();
  if (!raw) return loginMsg("Dán link hoặc mã trong email vào ô.");
  let error;
  if (/^\d{6,10}$/.test(raw)) {
    if (!email) return loginMsg("Nhập email ở ô phía trên.");
    ({ error } = await sb.auth.verifyOtp({ email, token: raw, type: "email" }));
  } else {
    let u; try { u = new URL(raw); } catch { return loginMsg("Link không hợp lệ."); }
    const hash = new URLSearchParams(u.hash.slice(1));
    if (hash.get("access_token")) {
      ({ error } = await sb.auth.setSession({ access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token") }));
    } else {
      const th = u.searchParams.get("token_hash") || u.searchParams.get("token");
      const type = u.searchParams.get("type") || "magiclink";
      if (!th) return loginMsg("Không tìm thấy mã trong link.");
      ({ error } = await sb.auth.verifyOtp({ token_hash: th, type: type === "signup" ? "signup" : type === "recovery" ? "recovery" : "email" }));
      if (error && type === "magiclink") ({ error } = await sb.auth.verifyOtp({ token_hash: th, type: "magiclink" }));
    }
  }
  if (error) return loginMsg(/expired|invalid/i.test(error.message) ? "Link/mã đã hết hạn hoặc đã dùng. Gửi email mới." : errMsg(error));
  await enterApp();
  setTimeout(() => setPassword(true), 400);
};

async function setPassword(afterLink = false, forced = false) {
  const v = await modal(`<h3>${forced ? "Đổi mật khẩu lần đầu" : afterLink ? "Đặt mật khẩu để lần sau đăng nhập nhanh" : "Đổi mật khẩu"}</h3>${forced ? `<p class="muted small">Bạn đang dùng mật khẩu ban đầu do quản lý cấp. Hãy đặt mật khẩu riêng.</p>` : ""}
    <form class="stack"><label>Mật khẩu mới (ít nhất 8 ký tự)<input name="p1" type="password" minlength="8" required autocomplete="new-password"></label>
    <label>Nhập lại<input name="p2" type="password" minlength="8" required autocomplete="new-password"></label></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">${afterLink ? "Để sau" : "Huỷ"}</button><button class="btn primary" data-v="submit">Lưu mật khẩu</button></div>`);
  if (!v) { if (forced) toast("Nhớ đổi mật khẩu sớm nhé (bấm tên ở góc trên → Đổi mật khẩu)", 4000); return; }
  if (v.p1 !== v.p2) { toast("Hai lần nhập không khớp"); return setPassword(afterLink, forced); }
  const { error } = await sb.auth.updateUser({ password: v.p1, data: { must_change: false } });
  toast(error ? errMsg(error) : "Đã lưu mật khẩu mới");
}

// ---------- 👁️ Xem như (chủ quản xem thử giao diện NV / QL) ----------
function renderViewAs() {
  let el = $("#viewas");
  const va = S.me?.viewAs;
  if (!va) { el?.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "viewas"; el.className = "viewas"; $("#remind").before(el); }
  const name = (S.allStaff || []).find((s) => s.id === S.me.staff_id)?.name || S.me.staff_id;
  el.innerHTML = `<span class="grow">👁️ Đang xem như <b>${va.role === "employee" ? "NHÂN VIÊN " + esc(name) : "QUẢN LÝ " + esc((S.me.stores || []).join(", ") || "(chưa chọn bộ phận)")}</b> · nộp ảnh, báo cáo vẫn ghi thật</span>
    <button class="btn small" type="button" data-va="${va.role === "employee" ? "emp" : "mgr"}">Đổi</button><button class="btn small" type="button" data-va="${va.role === "employee" ? "mgr" : "emp"}">${va.role === "employee" ? "Xem như QL" : "Xem như NV"}</button><button class="btn small primary" type="button" data-va="off">Thoát</button>`;
  el.onclick = (e) => { const b = e.target.closest("[data-va]"); if (b) viewAsAction(b.dataset.va); };
}
async function viewAsAction(kind) {
  const all = (S.allStaff || S.staff).filter((s) => !s.hidden);
  if (kind === "off") { setViewAs(null); location.hash = "today"; return location.reload(); }
  if (kind === "emp") {
    const cur = S.me.viewAs?.role === "employee" ? S.me.staff_id : S.realMe?.staff_id;
    const own = S.realMe?.staff_id, ownOk = all.some((s) => s.id === own);
    const v = await modal(`<h3>👁️ Xem như nhân viên</h3><p class="muted small">Menu, trang 🏠 Hôm nay, CV… hiện đúng như NV đó thấy. Nộp ảnh / báo cáo vẫn ghi thật cho NV đang xem${ownOk ? ` — nên thử bằng mã của chính bạn (${esc(own)})` : own ? `. Mã của bạn (${esc(own)}) đang ẩn trong Nhân sự nên không nhận việc được: muốn thử nộp ảnh thì giao 1 việc thử cho 1 NV rồi xoá sau (xoá việc hoàn sao, ảnh vẫn nằm trong thư mục Drive của NV đó)` : ""}.</p>
      <form class="stack"><label>Nhân viên<select name="staff">${all.map((s) => `<option value="${esc(s.id)}" ${s.id === cur ? "selected" : ""}>${esc(s.name)} · ${esc(s.dept)} · ${esc(s.id)}</option>`).join("")}</select></label></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Xem như NV này</button></div>`);
    if (!v?.staff) return;
    setViewAs({ role: "employee", staff_id: v.staff }); location.hash = "today"; return location.reload();
  }
  if (kind === "mgr") {
    const ds = [...new Set(all.map((s) => s.dept).filter(Boolean))].sort();
    const cur = S.me.viewAs?.role === "manager" ? S.me.stores || [] : ds;
    const v = await modal(`<h3>👁️ Xem như quản lý</h3><p class="muted small">Quản lý chỉ thấy nhân sự và số liệu của bộ phận được giao, không có các mục chỉ dành cho chủ quản (Cài đặt, Tài khoản NV, Phân quyền…).</p>
      <form class="stack"><div class="chips">${ds.map((d, i) => `<label class="chip"><input type="checkbox" name="d${i}" value="${esc(d)}" ${cur.includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</div></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Xem như QL</button></div>`);
    if (!v) return;
    const stores = Object.values(v).filter(Boolean);
    if (!stores.length) return toast("Chọn ít nhất 1 bộ phận");
    setViewAs({ role: "manager", stores }); location.hash = "today"; return location.reload();
  }
}

document.addEventListener("viewas", (e) => viewAsAction(e.detail));   // nút "Xem thử giao diện" ở trang 🏠 Hôm nay

$("#btnMe").onclick = async () => {
  const real = S.realMe || S.me, ownerTools = real?.role === "owner";
  const v = await modal(`<h3>${esc(S.me.email)}</h3><p class="muted">${roleLabel(real.role)}${S.me.viewAs ? ` · đang xem như <b>${roleLabel(S.me.role)}</b>` : ""}${real.staff_id ? " · Mã NV " + esc(real.staff_id) : ""}${S.me.stores?.length ? " · " + esc(S.me.stores.join(", ")) : ""}</p>
    <div class="stack">${ownerTools ? `<div class="row" style="gap:6px"><button class="btn grow" data-v="va-emp">👁️ Xem như nhân viên</button><button class="btn grow" data-v="va-mgr">👁️ Xem như quản lý</button></div>${S.me.viewAs ? `<button class="btn primary" data-v="va-off">↩️ Về giao diện chủ quản</button>` : ""}` : ""}
    <button class="btn" data-v="pass">🔑 Đổi mật khẩu</button><button class="btn" data-v="help">💡 Gợi ý tự hiện: ${helpOn() ? "Đang bật — bấm để tắt" : "Đang tắt — bấm để bật"}</button><button class="btn" data-v="old">↩️ Mở bản cũ</button><button class="btn danger" data-v="out">Đăng xuất</button></div>`);
  if (v && v.startsWith?.("va-")) return viewAsAction(v.slice(3));
  if (v === "pass") setPassword();
  if (v === "help") { setHelp(!helpOn()); toast(helpOn() ? `Đã bật: rê chuột lên một mục ${setting("HELP_DELAY_S", 15)} giây (điện thoại: nhấn giữ) để xem gợi ý` : "Đã tắt gợi ý tự hiện"); }
  if (v === "old") location.href = "../";
  if (v === "out") { stopRealtime(); await sb.auth.signOut(); location.reload(); }
};

// ---------- Điều hướng & đồng bộ ----------
document.addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b) go(b.dataset.page); });
window.addEventListener("hashchange", () => { const id = location.hash.slice(1).split("?")[0]; if (id && id !== current) go(id); });
onLive((ok) => { $("#live").classList.toggle("off", !ok); $("#live em").textContent = ok ? "Trực tuyến" : "Mất kết nối"; });
onChange((what) => { if (what === "pending") renderNav(); if (what === "settings") { $("#storeName").textContent = setting("STORE_NAME", ""); renderNav(); } });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { stopRealtime(); show("login"); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me) loadAll().catch(() => {}); });

enableAutoSort();
initHelp();
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) enterApp(); else show("login");
  console.info("Thi đua v2 ·", SUPABASE_URL);
})();
