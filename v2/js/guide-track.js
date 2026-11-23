// D16 📖 Hướng dẫn sống — dùng chung: đọc guide.json (nguồn duy nhất), "🆕 Có gì mới" khi mở tool (hiện lại tới khi bấm Đã hiểu),
// bài ✅ Nhập môn theo vai trò (tự đánh dấu khi làm xong: bật thông báo, mở trang, nộp việc, duyệt…), nhắc trên trang Hôm nay.
import { $, esc, toast, modal } from "./ui.js";
import { sb, S, rpc } from "./store.js";
import { pushState } from "./push.js";

let guideP = null, prog = null, newsShown = false;
export function loadGuide() {
  guideP ||= fetch("guide.json?v=" + Math.floor(Date.now() / 6e5), { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("Không tải được hướng dẫn"); return r.json(); }).catch((e) => { guideP = null; throw e; });
  return guideP;
}
// Vai trò hướng dẫn: nhân viên = nv · quản lý = ql · chủ quản = gd (xem cả phần quản lý)
export const roleKey = () => (S.me?.role === "owner" ? "gd" : S.me?.role === "manager" ? "ql" : "nv");
export const forMe = (roles = []) => { const r = roleKey(); return roles.includes(r) || (r === "gd" && roles.includes("ql")); };
export const onboardList = (g) => (roleKey() === "nv" ? g.onboard.nv : g.onboard.ql) || [];

export async function progress(force = false) {
  if (prog && !force) return prog;
  const { data } = await sb.from("guide_progress").select("kind,item").eq("email", S.me.email);
  prog = { news: new Set(), onboard: new Set(), seen: new Set() };
  for (const r of data || []) prog[r.kind]?.add(r.item);
  return prog;
}
export async function ack(kind, items) {
  items = items.filter((x) => !(prog?.[kind]?.has(x)));
  if (!items.length) return;
  try { await rpc("guide_ack", { p_kind: kind, p_items: items }); items.forEach((x) => prog?.[kind]?.add(x)); } catch { /* lần sau thử lại */ }
  if (kind === "onboard") finishCheck();
}

// Mở tool: đánh dấu lần đầu, hiện "Có gì mới" chưa đọc (mục trong 21 ngày gần đây, đúng vai trò)
export async function start(go) {
  if (!S.me || S.me.viewAs) return;
  try {
    const [g, p] = await Promise.all([loadGuide(), progress(true)]);
    if (!p.seen.has("first")) await ack("seen", ["first"]);
    autoCheck().catch(() => {});
    if (newsShown) return;
    const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
    const list = g.news.filter((n) => forMe(n.roles) && n.date >= since && !p.news.has(n.id));
    if (!list.length) return;
    newsShown = true;
    const v = await modal(`<h3>🆕 Có gì mới trong tool</h3>
      ${list.slice(0, 4).map((n) => `<div class="gd-news"><b>${esc(n.title)}</b> <span class="tiny muted">${esc(n.date.slice(8))}/${esc(n.date.slice(5, 7))}</span><ul>${n.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("")}
      <div class="modal-actions"><button class="btn" data-v="guide">📖 Xem hướng dẫn</button><button class="btn primary" data-v="ok">✅ Đã hiểu</button></div>`);
    if (v === "ok" || v === "guide") await ack("news", list.slice(0, 4).map((n) => n.id));
    if (v === "guide") { try { localStorage.setItem("thidua-v2-guide", "news"); } catch { /* bỏ qua */ } location.hash = "#guide"; setTimeout(() => { if (!document.querySelector("#gdBody")) go("guide"); }, 400); }
  } catch { /* không chặn tool */ }
}

// Mở 1 trang (hoặc 1 phần của trang Hướng dẫn) → tick bước nhập môn "visit:<id>"
export async function visit(id) {
  if (!S.me || S.me.viewAs) return;
  try {
    const [g, p] = await Promise.all([loadGuide(), progress()]);
    const hit = onboardList(g).filter((x) => x.check === "visit:" + id && !p.onboard.has(x.id)).map((x) => x.id);
    if (hit.length) await ack("onboard", hit);
  } catch { /* bỏ qua */ }
}
export async function askedOnce() { try { const g = await loadGuide(); await ack("onboard", onboardList(g).filter((x) => x.check === "ask").map((x) => x.id)); } catch { /* bỏ qua */ } }

// Các bước tự kiểm tra từ dữ liệu: bật thông báo, đã nộp việc, đã duyệt 1 mục
export async function autoCheck() {
  const [g, p] = await Promise.all([loadGuide(), progress()]);
  const todo = onboardList(g).filter((x) => !p.onboard.has(x.id));
  const done = [];
  for (const x of todo) {
    try {
      if (x.check === "push" && (await pushState()) === "on") done.push(x.id);
      if (x.check === "submit" && S.me.staff_id) {
        const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("done_by", S.me.email).eq("status", "done");
        if (count) done.push(x.id);
      }
      if (x.check === "decide") {
        const [a, h] = await Promise.all([
          sb.from("agent_items").select("id", { count: "exact", head: true }).eq("decided_by", S.me.email),
          sb.from("hot_bonuses").select("id", { count: "exact", head: true }).eq("reviewed_by", S.me.email),
        ]);
        if (a.count || h.count) done.push(x.id);
      }
    } catch { /* bỏ qua bước này */ }
  }
  if (done.length) await ack("onboard", done);
}
async function finishCheck() {
  try {
    const [g, p] = await Promise.all([loadGuide(), progress()]);
    const list = onboardList(g);
    if (!p.onboard.has("done") && list.length && list.every((x) => p.onboard.has(x.id))) {
      await rpc("guide_ack", { p_kind: "onboard", p_items: ["done"] }); p.onboard.add("done");
      toast("🎉 Bạn đã hoàn thành bài Nhập môn!", 4000);
    }
  } catch { /* bỏ qua */ }
}

// Trang Hôm nay: còn bước nhập môn → 1 dòng nhắc
export async function todayBanner(el, go) {
  if (!el || !S.me || S.me.viewAs) return;
  try {
    await autoCheck();
    const [g, p] = await Promise.all([loadGuide(), progress()]);
    const list = onboardList(g), n = list.filter((x) => p.onboard.has(x.id)).length;
    if (p.onboard.has("done") || !list.length || n >= list.length) { el.innerHTML = ""; return; }
    const next = list.find((x) => !p.onboard.has(x.id));
    el.innerHTML = `<button type="button" class="gd-banner" id="gdGo"><b>✅ Nhập môn ${n}/${list.length}</b><span>Tiếp theo: ${esc(next.title)}</span><span class="pill info">Làm tiếp ›</span></button>`;
    $("#gdGo").onclick = () => { try { localStorage.setItem("thidua-v2-guide", "onboard"); } catch { /* bỏ qua */ } go("guide"); };
  } catch { /* bỏ qua */ }
}
