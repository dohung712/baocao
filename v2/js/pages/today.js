// 🏠 Hôm nay (D12 + H1): trang mở đầu của NV, làm cho điện thoại, gồm 4 mục theo thứ tự:
//   1. 📌 Công việc cần làm (deadline, bấm thẻ việc để báo cáo bằng ảnh; QL chèn thêm việc) + nhắc ở các mục cũ (TikTok, vệ sinh, tờ rơi…)
//   2. 💰 Doanh thu siêu thị (số BI: lũy kế / target, dự kiến, còn thiếu, cần bán mỗi ngày) + chỉ tiêu của chính NV
//   3. 🏁 Thi đua siêu thị (môn sát nút, còn thiếu, cần mỗi ngày)
//   4. 🏅 Xếp hạng điểm tháng: hạng của mình + đồng đội, bấm 1 người để xem chi tiết
// Cuối trang: lịch ca 7 ngày, tất cả chức năng.
import { $, esc, fmt, toast, vnToday, addDays, dm, dow, dmy } from "../ui.js";
import { sb, S, rpc, onChange, isManager, isHidden, setting, staffById, errMsg } from "../store.js";
import { openCum } from "../cumulative.js";
import { loadTypes, jobCard, openSubmit, stateOf, vnAt, nPhotos, openCv } from "../jobs-common.js";
import { slotText } from "../lib-shift.js";
import { pushState, enablePush, disablePush, isIOS } from "../push.js";
import { myBiHtml, loadBi } from "../bi.js";
import { scoreDetail } from "../score-detail.js";
import { keepTodo } from "../simplify.js";

const APPS = [
  ["report", "📝", "Báo cáo ngày"], ["cv:tiktok", "🎬", "TikTok"], ["cv:clean", "🧹", "Vệ sinh"], ["cv:flyer", "📄", "Tờ rơi"],
  ["cv:busy", "🗓️", "Lịch bận / OFF"], ["cv:rs", "🏍️", "Roadshow"], ["score", "🏅", "Xếp hạng"],
  ["history", "🕒", "Báo cáo đã nộp"], ["cv:vio", "📋", "Biên bản"],
  ["cv:fund", "💵", "Quỹ"], ["store", "🏢", "Siêu thị"], ["assistant", "🤖", "Trợ lý"], ["rules", "📖", "Rule"],
];
const appOk = (k) => k.startsWith("cv:") ? !isHidden("cv") && !isHidden("cv." + k.slice(3)) : !isHidden(k);
let root, goFn, J = [], legacy = [], shifts = [], tok = 0, biHtml = "", BI = null, CT = [], BOARD = [], rkScope = "dept", MYUPD = null;
// "06:32 23/11" theo giờ Việt Nam
const upd = (iso) => { if (!iso) return ""; const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute} ${p.day}/${p.month}`; };

export async function render(view, _p, ctx = {}) {
  root = view; goFn = ctx.go || ((id) => { location.hash = id; }); pushSt = null;
  try { rkScope = localStorage.getItem("thidua-v2-td-rk") || "dept"; } catch { /* bỏ qua */ }
  view.innerHTML = `<div class="page-h td-head"><div><h1>🏠 Hôm nay</h1><p>${dow(vnToday())} ${dmy(vnToday())}</p></div></div><div id="tdBody"><div class="empty">Đang tải…</div></div>`;
  view.onclick = onClick;
  await load();
  const off = onChange((w) => { if (["jobs", "cv", "contest", "score", "results"].includes(w) && $("#tdBody")) load(true); });
  const timer = setInterval(() => { if ($("#tdBody")) draw(); }, 60000);   // cập nhật "còn x phút / quá hạn"
  return () => { off(); clearInterval(timer); };
}

const monthFrom = () => vnToday().slice(0, 8) + "01";
const showStore = () => !isHidden("store"), showScore = () => !isHidden("score");

async function load() {
  const me = S.me?.staff_id, today = vnToday(), t = ++tok;
  try {
    await loadTypes();
    const [jr, sr, td, fl, bh, bi, ct, bd, bu] = await Promise.all([
      me ? sb.from("jobs").select("*").eq("staff_id", me).gte("due_at", new Date(Date.now() - 3 * 864e5).toISOString()).lte("due_at", new Date(Date.now() + 8 * 864e5).toISOString()).order("due_at") : { data: [] },
      me ? sb.from("shifts").select("d,slots,hours").eq("staff_id", me).gte("d", today).lte("d", addDays(today, 6)).order("d") : { data: [] },
      me ? rpc("todo_list", { p_staff: me, p_date: today }).catch(() => []) : [],
      me ? rpc("flyer_todo", { p_staff: me, p_date: today }).catch(() => []) : [],
      me && showStore() ? myBiHtml(me).catch(() => "") : "",
      showStore() ? loadBi().catch(() => null) : null,
      showStore() ? sb.from("store_contest").select("name,type,actual,target,rate_month,forecast,branch,updated_at").eq("branch", "TỔNG") : { data: [] },
      showScore() ? rpc("score_board", { p_from: monthFrom(), p_to: today, p_full: false }).catch(() => []) : [],
      me && showScore() ? sb.from("bi_proposals").select("as_of,reviewed_at").eq("staff_id", me).eq("status", "approved").order("reviewed_at", { ascending: false }).limit(1) : { data: [] },
    ]);
    MYUPD = bu?.data?.[0] || null;
    if (t !== tok || !$("#tdBody")) return;
    if (jr.error) throw jr.error;
    J = jr.data || []; shifts = sr.data || []; biHtml = bh || ""; BI = bi; CT = ct?.data || []; BOARD = Array.isArray(bd) ? bd : [];
    legacy = keepTodo([...(Array.isArray(td) ? td : []), ...(Array.isArray(fl) ? fl.map((f) => ({ ...f, go: "cv:flyer" })) : [])]);
    draw();
  } catch (e) { if ($("#tdBody")) $("#tdBody").innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}

// Số ngày còn lại để bán trong tháng: theo ảnh BI, không có thì theo lịch (tính cả hôm nay)
function daysLeft() {
  if (BI?.days?.left !== null && BI?.days?.left !== undefined) return BI.days.left;
  const d = new Date(Date.now() + 7 * 36e5), tot = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return tot - d.getUTCDate() + 1;
}
const money = (x) => (x === null || x === undefined ? "—" : fmt(x, x >= 100 ? 0 : 1));
const pctTxt = (x) => (x === null || x === undefined ? "—" : fmt(x, 1) + "%");
const barCls = (p) => (p >= 100 ? "" : p >= 85 ? "mid" : "low");
const secH = (n, id, icon, title, right = "") => `<div class="td-h2" id="${id}"><h2><span class="td-n">${n}</span>${icon} ${title}</h2>${right}</div>`;

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
  const todo = todayAll.filter((j) => j.status === "todo").length + over.length + legBad.length;
  const secs = [["td-jobs", "📌", "Việc", todo || ""], showStore() && ["td-rev", "💰", "Doanh thu"], showStore() && ["td-ct", "🏁", "Thi đua"], showScore() && ["td-rk", "🏅", "Xếp hạng"]].filter(Boolean);
  body.innerHTML = `
    <div id="tdPush"></div>
    ${me ? `<div class="card td-hero">
      <div class="td-ring" style="--p:${pct}"><b>${doneN}/${todayAll.length}</b><small>hôm nay</small></div>
      <div class="td-who"><b>${esc(staff?.name || "")}</b><span class="small muted">${esc(staff?.dept || "")} · mã ${esc(me)}</span>
        <span class="td-shift ${sh && !sh.slots?.length ? "off" : ""}">🕑 ${sh ? (sh.slots?.length ? esc(slotText(sh.slots, slots)) : "OFF hôm nay") : "Chưa có lịch ca"}</span></div>
      <div class="td-nums"><span><b>${todayAll.filter((j) => j.status === "todo").length}</b>cần nộp</span><span class="bad"><b>${over.length + legBad.length}</b>quá hạn</span><span><b>${todayAll.reduce((a, j) => a + nPhotos(j), 0)}</b>ảnh đã nộp</span></div>
    </div>` : `<div class="banner info"><div>Tài khoản chưa gắn mã nhân viên nên không có việc cá nhân.</div></div>`}
    <nav class="td-nav">${secs.map(([id, i, l, b]) => `<button type="button" data-sec="${id}">${i} ${l}${b ? `<i class="badge">${b}</i>` : ""}</button>`).join("")}</nav>
    ${S.realMe?.role === "owner" && !S.me.viewAs ? `<div class="card td-mgr"><div><b>👁️ Xem thử giao diện</b><span class="small muted">Xem đúng màn hình nhân viên hoặc quản lý thấy</span></div><div class="row"><button class="btn small" type="button" data-viewas="emp">👤 Nhân viên</button><button class="btn small" type="button" data-viewas="mgr">🧑‍💼 Quản lý</button></div></div>` : ""}

    ${secH(1, "td-jobs", "📌", "Công việc cần làm", isManager() ? `<button class="btn small primary" type="button" data-assign>➕ Giao việc</button>` : "")}
    ${over.length || legBad.length ? `<h3 class="td-sec bad">⚠️ Quá hạn · ${over.length + legBad.length}</h3><div class="jb-list">${over.map(card).join("")}${legBad.map(leg).join("")}</div>` : ""}
    ${me ? `<h3 class="td-sec">Hôm nay · ${todayJ.length}</h3><div class="jb-list">${todayJ.length ? todayJ.map(card).join("") : `<div class="empty small">Hôm nay chưa có việc được giao.</div>`}${doneOld.map(card).join("")}</div>` : ""}
    ${legRest.length ? `<h3 class="td-sec">🔔 Nhắc từ các mục khác · ${legRest.length}</h3><div class="jb-list">${legRest.map(leg).join("")}</div>` : ""}
    ${next.length ? `<h3 class="td-sec">📅 Sắp tới · ${next.length}</h3><div class="jb-list">${next.map(card).join("")}</div>` : ""}
    <p class="tiny muted td-hint">Bấm vào thẻ việc → chụp / chọn ảnh → Nộp. Sắp tới hạn và quá hạn sẽ được nhắc qua thông báo + Telegram.</p>

    ${showStore() ? revHtml() + contestHtml() : ""}
    ${showScore() ? rankHtml() : ""}

    ${shifts.length > 1 ? `<h3 class="td-sec">🗓️ Lịch ca 7 ngày</h3><div class="td-week">${shifts.map((x) => `<span class="${x.d === today ? "on" : ""} ${x.slots?.length ? "" : "off"}"><b>${dow(x.d)} ${dm(x.d)}</b>${x.slots?.length ? esc(slotText(x.slots, slots).replace(/ · /g, "\n")) : "OFF"}</span>`).join("")}</div>` : ""}
    ${isManager() ? `<div class="card td-mgr"><div><b>📋 Điều hành công việc</b><span class="small muted">Giao việc, xem ảnh từng NV, thống kê, lịch ca</span></div><button class="btn primary small" type="button" data-page="jobs">Mở Giao việc ›</button></div>` : ""}
    <details class="td-allapps"><summary><h3 class="td-sec" style="display:inline">▦ Tất cả chức năng</h3></summary>
      <div class="td-apps">${APPS.filter(([k]) => appOk(k)).map(([k, i, l]) => { const b = legacy.filter((x) => x.go === k && x.lv !== "info").length; return `<button type="button" class="td-app" data-go="${k}"><span>${i}</span>${esc(l)}${b ? `<i class="badge">${b}</i>` : ""}</button>`; }).join("")}</div></details>`;
  drawPush();
}

// 2. Doanh thu siêu thị
function revHtml() {
  const more = `<button class="btn small" type="button" data-go="store">Chi tiết ›</button>`;
  if (!BI?.total) return `${secH(2, "td-rev", "💰", "Doanh thu siêu thị", more)}<div class="empty small">Chưa có số doanh thu từ BI${isManager() ? " — bỏ ảnh chụp app BI vào thư mục Drive 00 hoặc bấm Đọc ảnh ở trang Siêu thị" : ""}.</div>${biHtml}`;
  const t = BI.total;
  const mini = (label, p) => p ? `<div class="td-mini"><small>${label}</small><b>${money(p.actual)}<span class="muted"> / ${money(p.target)}</span></b>
    <div class="bar ${barCls(p.fcPct ?? 0)}"><i style="width:${Math.min(100, p.pct ?? 0)}%"></i></div>
    <span class="tiny">Dự kiến <b class="${(p.fcPct ?? 0) >= 100 ? "pos" : "neg"}">${pctTxt(p.fcPct)}</b></span>
    <span class="tiny">${p.gap ? `Thiếu <b>${money(p.gap)}</b> · cần <b class="star">${money(p.perDay)}</b>/ngày` : "✅ Đã đạt target"}</span></div>` : "";
  return `${secH(2, "td-rev", "💰", "Doanh thu siêu thị", more)}
    <div class="card td-revbig">
      <div class="row" style="justify-content:space-between;align-items:baseline"><small class="muted">Toàn siêu thị · DT quy đổi (triệu)</small><span class="tiny muted">số tới hết ${BI.through ? dm(BI.through) : "?"} · ngày ${BI.days.el ?? "?"}/${BI.days.tot ?? "?"}</span></div>
      <span class="td-upd">🕒 Cập nhật lúc <b>${upd(BI.revAt) || "—"}</b>${BI.revCap ? ` · BI chụp ${upd(BI.revCap)}` : ""}</span>
      <div class="bi-big"><b>${money(t.actual)}</b><span class="muted"> / ${money(t.target)} tr</span> <b class="small">${pctTxt(t.pct)}</b></div>
      <div class="bar ${barCls(t.fcPct ?? 0)}"><i style="width:${Math.min(100, t.pct ?? 0)}%"></i></div>
      <div class="td-kv"><span><small>Dự kiến</small><b class="${(t.fcPct ?? 0) >= 100 ? "pos" : "neg"}">${pctTxt(t.fcPct)}</b></span><span><small>Còn thiếu</small><b>${t.gap ? money(t.gap) : "✅"}</b></span><span><small>Cần/ngày · ${t.left ?? "?"}n</small><b class="star">${t.gap ? money(t.perDay) : "—"}</b></span></div>
    </div>
    <div class="td-mini2">${mini("TGDĐ", BI.rev.TGD)}${mini("Topzone", BI.rev.AAR)}</div>
    ${biHtml}`;
}

// 3. Thi đua siêu thị (toàn siêu thị): môn sát nút trước, rồi môn thấp
function contestHtml() {
  const more = `<button class="btn small" type="button" data-go="store">Xem đủ ›</button>`;
  if (!CT.length) return `${secH(3, "td-ct", "🏁", "Thi đua siêu thị", more)}<div class="empty small">Chưa có số liệu thi đua.</div>`;
  const left = Math.max(1, daysLeft()), f = (r) => Number(r.forecast) || 0;
  const done = CT.filter((r) => f(r) >= 100).length, near = CT.filter((r) => f(r) >= 70 && f(r) < 100), zero = CT.filter((r) => !f(r)).length;
  const push = [...near.sort((a, b) => f(b) - f(a)), ...CT.filter((r) => f(r) > 0 && f(r) < 70).sort((a, b) => f(b) - f(a))].slice(0, 6);
  const row = (r) => { const gap = Math.max(0, Number(r.target) - Number(r.actual)), sl = r.type === "SỐ LƯỢNG"; return `<div class="td-crow"><div class="td-cname"><b>${esc(r.name)}</b><span class="tiny muted">${sl ? "SL" : "DT"} · ${fmt(r.actual, 2)} / ${fmt(r.target, 2)}</span></div>
    <div class="td-cbar"><div class="bar ${barCls(f(r))}"><i style="width:${Math.min(100, f(r))}%"></i></div><b class="small">${fmt(f(r), 0)}%</b></div>
    <span class="tiny td-cneed">${gap ? `thiếu <b>${fmt(gap, sl ? 0 : 1)}</b> · <b class="star">${fmt(gap / left, sl ? 1 : 1)}</b>/ngày` : "✅"}</span></div>`; };
  const ctAt = CT.map((r) => r.updated_at).filter(Boolean).sort().pop();
  return `${secH(3, "td-ct", "🏁", "Thi đua siêu thị", more)}
    ${ctAt ? `<p class="td-upd">🕒 Cập nhật lúc <b>${upd(ctAt)}</b>${BI?.contestCap ? ` · BI chụp ${upd(BI.contestCap)}` : ""}</p>` : ""}
    <div class="td-stats"><span><b>${CT.length}</b>môn</span><span class="pos"><b>${done}</b>dự báo về số</span><span class="star"><b>${near.length}</b>sát nút</span><span class="neg"><b>${zero}</b>chưa phát sinh</span></div>
    ${push.length ? `<h3 class="td-sec">🎯 Cần đẩy (${left} ngày còn lại)</h3><div class="card td-clist">${push.map(row).join("")}</div>` : ""}`;
}

// 4. Xếp hạng điểm tháng: hạng của mình + đồng đội (bấm để xem chi tiết)
function rankHtml() {
  const more = `<button class="btn small" type="button" data-go="score">Bảng đầy đủ ›</button>`;
  if (!BOARD.length) return `${secH(4, "td-rk", "🏅", "Xếp hạng tháng", more)}<div class="empty small">Chưa có dữ liệu xếp hạng.</div>`;
  const me = S.me?.staff_id, mine = BOARD.find((r) => r.staff_id === me), dept = mine?.dept || staffById(me)?.dept;
  const depts = new Set(BOARD.map((r) => r.dept)), scope = depts.size > 1 && dept ? rkScope : "all";
  const list = [...BOARD].filter((r) => scope === "all" || r.dept === dept).sort((a, b) => a.rank - b.rank);
  const W = { r: Number(setting("W_REVENUE", 40)), c: Number(setting("W_CONTEST", 40)), s: Number(setting("W_SERVICE", 20)) };
  const bar = (v, max) => `<div class="bar ${max && v / max >= 0.7 ? "" : max && v / max >= 0.4 ? "mid" : "low"}"><i style="width:${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%"></i></div>`;
  const dRank = (r) => list.findIndex((x) => x.staff_id === r.staff_id) + 1;
  return `${secH(4, "td-rk", "🏅", "Xếp hạng tháng", more)}
    <p class="td-upd">🕒 Tính đến lúc mở trang${MYUPD ? ` · DT & môn của bạn cập nhật từ BI lúc <b>${upd(MYUPD.reviewed_at)}</b> (số tới hết ${dm(MYUPD.as_of)})` : ""}</p>
    ${mine ?`<button type="button" class="card td-myrank" data-sd="${esc(mine.staff_id)}">
      <span class="td-bigrank"><b>${scope === "all" ? mine.rank : dRank(mine)}</b><small>/${list.length}</small></span>
      <span class="td-myr"><b>Hạng của bạn</b><span class="tiny muted">${scope === "all" ? "cả siêu thị" : esc(dept)} · bấm xem điểm đến từ đâu</span>
        <span class="td-3bars"><span>DT ${bar(mine.rev_score, W.r)}<b>${fmt(mine.rev_score, 1)}</b></span><span>TĐ ${bar(mine.contest_score, W.c)}<b>${fmt(mine.contest_score, 1)}</b></span><span>PV ${bar(mine.service_score, W.s)}<b>${fmt(mine.service_score, 1)}</b></span></span></span>
      <b class="star td-pts">${fmt(mine.total, 1)}<small>điểm</small></b></button>` : ""}
    ${depts.size > 1 && dept ? `<div class="seg td-rkseg"><button type="button" data-rk="dept" class="${scope === "dept" ? "on" : ""}">${esc(dept)}</button><button type="button" data-rk="all" class="${scope === "all" ? "on" : ""}">Cả siêu thị</button></div>` : ""}
    <div class="td-rklist">${list.map((r, i) => `<button type="button" class="td-rk ${r.staff_id === me ? "mine" : ""}" data-sd="${esc(r.staff_id)}">
      <span class="rank ${i < 3 ? "r" + (i + 1) : ""}">${scope === "all" ? r.rank : i + 1}</span>
      <span class="td-rkn"><b>${esc(r.name)}${r.staff_id === me ? ' <span class="pill info">Bạn</span>' : ""}</b><span class="tiny muted">DT ${fmt(r.rev_score, 1)} · TĐ ${fmt(r.contest_score, 1)} · PV ${fmt(r.service_score, 1)}${Number(r.violation_points) ? ` · <span class="neg">VP −${fmt(r.violation_points)}</span>` : ""}</span></span>
      <b class="star">${fmt(r.total, 1)}</b><span class="muted">›</span></button>`).join("")}</div>
    <p class="tiny muted td-hint">Bấm tên đồng đội để xem chi tiết điểm: doanh thu, từng môn thi đua, phục vụ, vi phạm.</p>`;
}

let pushSt = null;   // trạng thái thông báo: hỏi 1 lần mỗi lần mở trang (draw chạy lại mỗi phút)
async function drawPush(force = false) {
  const box = $("#tdPush"); if (!box || !S.me?.staff_id) return;
  if (force || !pushSt) pushSt = await pushState().catch(() => "unsupported");
  const st = pushSt;
  if (!$("#tdPush")) return;
  const dismissed = (() => { try { return localStorage.getItem("thidua-v2-push-hide") === vnToday(); } catch { return false; } })();
  if (st === "on") { box.innerHTML = `<p class="tiny muted td-pushok">🔔 Thông báo trên máy này: <b>đang bật</b> · <a href="#" class="linkish" data-push="off">Tắt</a></p>`; return; }
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
  const sec = e.target.closest("[data-sec]");
  if (sec) { document.getElementById(sec.dataset.sec)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const sd = e.target.closest("[data-sd]");
  if (sd) { const today = vnToday(); scoreDetail(BOARD, sd.dataset.sd, { from: monthFrom(), to: today, full: false }); return; }
  const rk = e.target.closest("[data-rk]");
  if (rk) { rkScope = rk.dataset.rk; try { localStorage.setItem("thidua-v2-td-rk", rkScope); } catch { /* bỏ qua */ } draw(); document.getElementById("td-rk")?.scrollIntoView({ block: "start" }); return; }
  if (e.target.closest("[data-assign]")) { try { localStorage.setItem("thidua-v2-jobs", "assign"); } catch { /* bỏ qua */ } return goFn("jobs"); }
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
