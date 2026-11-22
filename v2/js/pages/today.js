// 🏠 Hôm nay (D12): trang mở đầu của NV — mọi việc cần làm theo hạn (việc QL giao + việc ở các mục cũ: TikTok, vệ sinh, tờ rơi, roadshow…),
// nộp ảnh ngay trên thẻ việc, ca làm hôm nay (lịch ca từ tool sắp ca), bật thông báo đẩy, lối vào mọi chức năng.
import { $, esc, toast, vnToday, addDays, dm, dow, dmy } from "../ui.js";
import { sb, S, rpc, onChange, isManager, isHidden, setting, staffById, errMsg } from "../store.js";
import { openCum } from "../cumulative.js";
import { loadTypes, jobCard, openSubmit, stateOf, vnAt, nPhotos, openCv } from "../jobs-common.js";
import { slotText } from "../lib-shift.js";
import { pushState, enablePush, disablePush, isIOS } from "../push.js";
import { myBiHtml } from "../bi.js";

const APPS = [
  ["report", "📝", "Báo cáo ngày"], ["cv:tiktok", "🎬", "TikTok"], ["cv:clean", "🧹", "Vệ sinh"], ["cv:flyer", "📄", "Tờ rơi"],
  ["cv:busy", "🗓️", "Lịch bận / OFF"], ["cv:rs", "🏍️", "Roadshow"], ["cv:tasks", "📢", "Triển khai"], ["score", "🏅", "Xếp hạng"],
  ["me", "👤", "Của tôi"], ["ranking", "🏆", "BXH sao"], ["history", "🕒", "Lịch sử"], ["cv:vio", "📋", "Biên bản"],
  ["cv:fund", "💵", "Quỹ"], ["store", "🏢", "Siêu thị"], ["assistant", "🤖", "Trợ lý"], ["rules", "📖", "Rule"],
];
const appOk = (k) => k.startsWith("cv:") ? !isHidden("cv") && !isHidden("cv." + k.slice(3)) : !isHidden(k);
let root, goFn, J = [], legacy = [], shifts = [], tok = 0, biHtml = "";

export async function render(view, _p, ctx = {}) {
  root = view; goFn = ctx.go || ((id) => { location.hash = id; }); pushSt = null;
  view.innerHTML = `<div class="page-h"><div><h1>🏠 Hôm nay</h1><p>${dow(vnToday())} ${dmy(vnToday())} · việc cần làm theo hạn, nộp ảnh ngay trên thẻ việc</p></div></div><div id="tdBody"><div class="empty">Đang tải…</div></div>`;
  view.onclick = onClick;
  await load();
  const off = onChange((w) => { if ((w === "jobs" || w === "cv" || w === "contest") && $("#tdBody")) load(true); });
  const timer = setInterval(() => { if ($("#tdBody")) draw(); }, 60000);   // cập nhật "còn x phút / quá hạn"
  return () => { off(); clearInterval(timer); };
}

async function load() {
  const me = S.me?.staff_id, today = vnToday(), t = ++tok;
  try {
    await loadTypes();
    const [jr, sr, td, fl, bh] = await Promise.all([
      me ? sb.from("jobs").select("*").eq("staff_id", me).gte("due_at", new Date(Date.now() - 3 * 864e5).toISOString()).lte("due_at", new Date(Date.now() + 8 * 864e5).toISOString()).order("due_at") : { data: [] },
      me ? sb.from("shifts").select("d,slots,hours").eq("staff_id", me).gte("d", today).lte("d", addDays(today, 6)).order("d") : { data: [] },
      me ? rpc("todo_list", { p_staff: me, p_date: today }).catch(() => []) : [],
      me ? rpc("flyer_todo", { p_staff: me, p_date: today }).catch(() => []) : [],
      me && !isHidden("store") ? myBiHtml(me).catch(() => "") : "",
    ]);
    if (t !== tok || !$("#tdBody")) return;
    if (jr.error) throw jr.error;
    J = jr.data || []; shifts = sr.data || []; biHtml = bh || "";
    legacy = [...(Array.isArray(td) ? td : []), ...(Array.isArray(fl) ? fl.map((f) => ({ ...f, go: "cv:flyer" })) : [])];
    draw();
  } catch (e) { if ($("#tdBody")) $("#tdBody").innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}

function draw() {
  const body = $("#tdBody"); if (!body) return;
  const me = S.me?.staff_id, today = vnToday(), staff = me ? staffById(me) : null, now = Date.now();
  const mine = J.map((j) => ({ ...j, _st: stateOf(j, now), _d: vnAt(j.due_at).date }));
  const over = mine.filter((j) => j._st === "over");
  const todayJ = mine.filter((j) => j._d === today && j._st !== "over");
  const doneOld = mine.filter((j) => j._d < today && ["done", "late", "missed"].includes(j._st) && j._d >= addDays(today, -1));
  const next = mine.filter((j) => j._d > today && j.status === "todo");
  const todayAll = mine.filter((j) => j._d === today);
  const doneN = todayAll.filter((j) => j.status === "done").length;
  const sh = shifts.find((x) => x.d === today);
  const slots = setting("SHIFT_SLOTS", []);
  const legBad = legacy.filter((x) => x.lv === "bad"), legRest = legacy.filter((x) => x.lv !== "bad");
  const pct = todayAll.length ? Math.round((doneN * 100) / todayAll.length) : 0;
  const card = (j) => jobCard(j, { today });
  const leg = (x) => `<button type="button" class="jb-card leg lv-${esc(x.lv || "info")}" data-go="${esc(x.go || "")}"><span class="jb-ic">${esc(x.icon || "📌")}</span><span class="jb-main"><b>${esc(x.t)}</b>${x.d ? `<span class="jb-meta">${esc(x.d)}</span>` : ""}</span><span class="pill ${x.lv === "bad" ? "bad" : x.lv === "warn" ? "warn" : "info"}">Mở ›</span></button>`;
  const badgeFor = (k) => legacy.filter((x) => x.go === k && x.lv !== "info").length + (k === "report" ? 0 : 0);
  body.innerHTML = `
    <div id="tdPush"></div>
    ${S.realMe?.role === "owner" && !S.me.viewAs ? `<div class="card td-mgr"><div><b>👁️ Xem thử giao diện</b><span class="small muted">Xem đúng màn hình nhân viên hoặc quản lý thấy, không cần tài khoản khác</span></div><div class="row"><button class="btn" type="button" data-viewas="emp">👤 Nhân viên</button><button class="btn" type="button" data-viewas="mgr">🧑‍💼 Quản lý</button></div></div>` : ""}
    ${isManager() ? `<div class="card td-mgr"><div><b>📋 Điều hành công việc</b><span class="small muted">Giao việc, xem ảnh từng NV, thống kê, lịch ca</span></div><button class="btn primary" type="button" data-page="jobs">Mở Giao việc ›</button></div>` : ""}
    ${me ? `<div class="card td-hero">
      <div class="td-ring" style="--p:${pct}"><b>${doneN}/${todayAll.length}</b><small>hôm nay</small></div>
      <div class="td-who"><b>${esc(staff?.name || "")}</b><span class="small muted">${esc(staff?.dept || "")} · mã ${esc(me)}</span>
        <span class="td-shift ${sh && !sh.slots?.length ? "off" : ""}">🕑 ${sh ? (sh.slots?.length ? esc(slotText(sh.slots, slots)) : "OFF hôm nay") : "Chưa có lịch ca"}</span></div>
      <div class="td-nums"><span><b>${todayAll.filter((j) => j.status === "todo").length}</b>cần nộp</span><span class="bad"><b>${over.length + legBad.length}</b>quá hạn</span><span><b>${todayAll.reduce((a, j) => a + nPhotos(j), 0)}</b>ảnh đã nộp</span></div>
    </div><div id="tdBi">${biHtml}</div>` : `<div class="banner info"><div>Tài khoản chưa gắn mã nhân viên nên không có việc cá nhân.</div></div>`}
    ${over.length || legBad.length ? `<h3 class="td-sec bad">⚠️ Quá hạn · ${over.length + legBad.length}</h3><div class="jb-list">${over.map(card).join("")}${legBad.map(leg).join("")}</div>` : ""}
    ${me ? `<h3 class="td-sec">📌 Việc hôm nay · ${todayJ.length}</h3><div class="jb-list">${todayJ.length ? todayJ.map(card).join("") : `<div class="empty small">Hôm nay chưa có việc được giao.</div>`}${doneOld.map(card).join("")}</div>` : ""}
    ${legRest.length ? `<h3 class="td-sec">🔔 Nhắc từ các mục khác · ${legRest.length}</h3><div class="jb-list">${legRest.map(leg).join("")}</div>` : ""}
    ${next.length ? `<h3 class="td-sec">📅 Sắp tới · ${next.length}</h3><div class="jb-list">${next.map(card).join("")}</div>` : ""}
    ${shifts.length > 1 ? `<h3 class="td-sec">🗓️ Lịch ca 7 ngày</h3><div class="td-week">${shifts.map((x) => `<span class="${x.d === today ? "on" : ""} ${x.slots?.length ? "" : "off"}"><b>${dow(x.d)} ${dm(x.d)}</b>${x.slots?.length ? esc(slotText(x.slots, slots).replace(/ · /g, "\n")) : "OFF"}</span>`).join("")}</div>` : ""}
    <h3 class="td-sec">▦ Tất cả chức năng</h3>
    <div class="td-apps">${APPS.filter(([k]) => appOk(k)).map(([k, i, l]) => { const b = badgeFor(k); return `<button type="button" class="td-app" data-go="${k}"><span>${i}</span>${esc(l)}${b ? `<i class="badge">${b}</i>` : ""}</button>`; }).join("")}</div>`;
  drawPush();
}

let pushSt = null;   // trạng thái thông báo: hỏi 1 lần mỗi lần mở trang (draw chạy lại mỗi phút)
async function drawPush(force = false) {
  const box = $("#tdPush"); if (!box || !S.me?.staff_id) return;
  if (force || !pushSt) pushSt = await pushState().catch(() => "unsupported");
  const st = pushSt;
  if (!$("#tdPush")) return;
  const dismissed = (() => { try { return localStorage.getItem("thidua-v2-push-hide") === vnToday(); } catch { return false; } })();
  if (st === "on") { box.innerHTML = `<p class="small muted td-pushok">🔔 Thông báo trên máy này: <b>đang bật</b> · <a href="#" class="linkish" data-push="off">Tắt</a></p>`; return; }
  if (st === "unsupported" || dismissed) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="banner info td-push"><div class="grow"><b>🔔 Bật thông báo trên điện thoại</b>
    ${st === "ios-install" ? `<br>iPhone: bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên) → <b>Thêm vào MH chính</b>, mở tool từ biểu tượng ⚡ mới rồi bấm bật ở đây.`
      : st === "denied" ? `<br>Trình duyệt đang chặn thông báo của trang này: vào cài đặt trình duyệt → Thông báo → cho phép rồi tải lại trang.`
      : `<br>Nhận ngay việc mới, nhắc trước hạn và báo quá hạn trên màn hình khoá.${isIOS() ? "" : " Nên thêm tool ra màn hình chính (menu ⋮ → Thêm vào màn hình chính)."}`}</div>
    <div class="row">${st === "off" ? `<button class="btn primary small" type="button" data-push="on">Bật</button>` : ""}<button class="btn ghost small" type="button" data-push="hide">Để sau</button></div></div>`;
}

async function onClick(e) {
  const j = e.target.closest("[data-job]");
  if (j) { const job = J.find((x) => String(x.id) === j.dataset.job); if (job && (await openSubmit(job))) load(); return; }
  const va = e.target.closest("[data-viewas]");
  if (va) { document.dispatchEvent(new CustomEvent("viewas", { detail: va.dataset.viewas })); return; }
  const g = e.target.closest("[data-go]");
  if (g) {
    const k = g.dataset.go;
    if (!k) return;
    if (k === "cum") return openCum(S.me.staff_id);
    if (k.startsWith("cv:")) return openCv(goFn, k.slice(3));
    return goFn(k);
  }
  const p = e.target.closest("[data-push]");
  if (p) {
    e.preventDefault();
    if (p.dataset.push === "hide") { try { localStorage.setItem("thidua-v2-push-hide", vnToday()); } catch { /* bỏ qua */ } drawPush(); return; }
    p.disabled = true;
    try {
      if (p.dataset.push === "on") { await enablePush(); toast("Đã bật thông báo — có thông báo thử gửi tới máy này", 4000); }
      else { await disablePush(); toast("Đã tắt thông báo trên máy này"); }
    } catch (x) { toast(errMsg(x), 6000); }
    drawPush(true);
  }
}
