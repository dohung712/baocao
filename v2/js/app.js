// Khởi động ứng dụng: đăng nhập, điều hướng, đồng bộ
import { $, esc, toast, modal } from "./ui.js";
import { sb, S, loadMe, loadAll, startRealtime, stopRealtime, onLive, onChange, isManager, roleLabel, errMsg, setting, SUPABASE_URL } from "./store.js";
import * as report from "./pages/report.js";
import * as historyPage from "./pages/history.js";
import * as ranking from "./pages/ranking.js";
import * as store from "./pages/store.js";
import * as admin from "./pages/admin.js";

const PAGES = [
  { id: "report", icon: "📝", label: "Báo cáo", mod: report },
  { id: "history", icon: "🕒", label: "Lịch sử", mod: historyPage },
  { id: "ranking", icon: "🏆", label: "BXH", mod: ranking },
  { id: "store", icon: "🏢", label: "Siêu thị", mod: store },
  { id: "admin", icon: "⚙️", label: "Quản lý", mod: admin, manager: true },
];
let current = null, cleanup = null;

function show(id) { for (const x of ["boot", "login", "app"]) $("#" + x).hidden = x !== id; }

function pendingCount() { return (S.pending.proposals || 0) + (S.pending.changes || 0); }
function renderNav() {
  const pages = PAGES.filter((p) => !p.manager || isManager());
  const html = (p) => {
    const b = p.id === "admin" && pendingCount() ? `<b class="badge">${pendingCount()}</b>` : "";
    return `<button type="button" data-page="${p.id}" class="${current === p.id ? "on" : ""}"><span>${p.icon}</span> ${p.label}${b}</button>`;
  };
  $("#nav").innerHTML = pages.map(html).join("");
  $("#tabbar").innerHTML = pages.map((p) => {
    const b = p.id === "admin" && pendingCount() ? `<b class="badge">${pendingCount()}</b>` : "";
    return `<button type="button" data-page="${p.id}" class="${current === p.id ? "on" : ""}"><span>${p.icon}</span>${p.label}${b}</button>`;
  }).join("");
}

async function go(id, params = {}) {
  const page = PAGES.find((p) => p.id === id && (!p.manager || isManager())) || PAGES[0];
  if (cleanup) { try { cleanup(); } catch { /* bỏ qua */ } cleanup = null; }
  current = page.id;
  if (location.hash.slice(1).split("?")[0] !== page.id) history_replace(page.id);
  renderNav();
  const view = $("#view");
  view.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto 8px"></div>Đang tải…</div>`;
  try { cleanup = (await page.mod.render(view, params, { go })) || null; }
  catch (e) { console.error(e); view.innerHTML = `<div class="banner bad"><div><b>Không tải được trang</b>${esc(errMsg(e))}</div></div>`; }
  window.scrollTo(0, 0);
}
function history_replace(id) { try { history.replaceState(null, "", "#" + id); } catch { location.hash = id; } }

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
  $("#btnMe").textContent = `👤 ${S.me.email.split("@")[0]} · ${roleLabel(S.me.role)}`;
  show("app");
  startRealtime();
  const id = location.hash.slice(1).split("?")[0] || (isManager() ? "report" : "report");
  go(id);
}

// ---------- Đăng nhập ----------
function loginMsg(text, ok = false) { const m = $("#loginMsg"); m.className = "msg " + (ok ? "ok" : "err"); m.textContent = text; }
$("#fPass").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; loginMsg("");
  const { error } = await sb.auth.signInWithPassword({ email: $("#lEmail").value.trim().toLowerCase(), password: $("#lPass").value });
  btn.disabled = false;
  if (error) return loginMsg(/Invalid login/i.test(error.message) ? "Sai email hoặc mật khẩu. Nếu quên mật khẩu, dùng mục bên dưới." : errMsg(error));
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

async function setPassword(afterLink = false) {
  const v = await modal(`<h3>${afterLink ? "Đặt mật khẩu để lần sau đăng nhập nhanh" : "Đổi mật khẩu"}</h3>
    <form class="stack"><label>Mật khẩu mới (ít nhất 8 ký tự)<input name="p1" type="password" minlength="8" required autocomplete="new-password"></label>
    <label>Nhập lại<input name="p2" type="password" minlength="8" required autocomplete="new-password"></label></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">${afterLink ? "Để sau" : "Huỷ"}</button><button class="btn primary" data-v="submit">Lưu mật khẩu</button></div>`);
  if (!v) return;
  if (v.p1 !== v.p2) { toast("Hai lần nhập không khớp"); return setPassword(afterLink); }
  const { error } = await sb.auth.updateUser({ password: v.p1 });
  toast(error ? errMsg(error) : "Đã lưu mật khẩu mới");
}

$("#btnMe").onclick = async () => {
  const v = await modal(`<h3>${esc(S.me.email)}</h3><p class="muted">${roleLabel(S.me.role)}${S.me.staff_id ? " · Mã NV " + esc(S.me.staff_id) : ""}${S.me.stores?.length ? " · " + esc(S.me.stores.join(", ")) : ""}</p>
    <div class="stack"><button class="btn" data-v="pass">🔑 Đổi mật khẩu</button><button class="btn" data-v="old">↩️ Mở bản cũ</button><button class="btn danger" data-v="out">Đăng xuất</button></div>`);
  if (v === "pass") setPassword();
  if (v === "old") location.href = "../";
  if (v === "out") { stopRealtime(); await sb.auth.signOut(); location.reload(); }
};

// ---------- Điều hướng & đồng bộ ----------
document.addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b) go(b.dataset.page); });
window.addEventListener("hashchange", () => { const id = location.hash.slice(1).split("?")[0]; if (id && id !== current) go(id); });
onLive((ok) => { $("#live").classList.toggle("off", !ok); $("#live em").textContent = ok ? "Trực tuyến" : "Mất kết nối"; });
onChange((what) => { if (what === "pending") renderNav(); if (what === "settings") $("#storeName").textContent = setting("STORE_NAME", ""); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { stopRealtime(); show("login"); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me) loadAll().catch(() => {}); });

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) enterApp(); else show("login");
  console.info("Thi đua v2 ·", SUPABASE_URL);
})();
