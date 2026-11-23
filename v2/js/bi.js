// B16 Số liệu BI: số AI đọc từ ảnh chụp app BI (thư mục Drive "00 - Nhập doanh thu và thi đua")
//  • doanh thu từng siêu thị + toàn siêu thị: lũy kế / target, dự kiến, còn thiếu, cần bán mỗi ngày còn lại
//  • xếp hạng NV theo thẻ BI; thẻ chỉ tiêu của chính NV (trang Hôm nay)
//  • QL: đọc ảnh mới trong Drive, chọn ảnh từ máy, xem ảnh đọc lỗi / đọc lại
import { esc, fmt, toast, dmy, dm } from "./ui.js";
import { sb, rpc, callFn, errMsg } from "./store.js";
import { compress } from "./photos.js";

const COLS = "id,file_id,name,url,kind,channel,staff_id,captured_at,data_through,month,data,status,error,processed_at";
const CH = { TGD: "TGDĐ", AAR: "Topzone" };
const n = (x) => (x === null || x === undefined || x === "" || isNaN(Number(x)) ? null : Number(x));
const newer = (a, b) => (a.data_through || "") > (b.data_through || "") || ((a.data_through || "") === (b.data_through || "") && (a.captured_at || "") > (b.captured_at || ""));

// Số ngày còn lại trong tháng khi không có ảnh BI: tính theo lịch (hôm nay vẫn còn bán)
function calDays() {
  const d = new Date(Date.now() + 7 * 36e5), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const tot = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { el: day - 1, tot };
}

// Chỉ số kế hoạch từ (lũy kế, target, ngày đã qua, tổng ngày)
export function plan(actual, target, el, tot, forecast = null) {
  const left = el && tot ? Math.max(0, tot - el) : null;
  const gap = target ? Math.max(0, target - actual) : null;
  const pace = el ? actual / el : null;
  const fc = forecast ?? (pace !== null && tot ? pace * tot : null);
  return { actual, target, el, tot, left, gap, pace, fc, pct: target ? (actual * 100) / target : null, fcPct: target && fc !== null ? (fc * 100) / target : null, perDay: gap !== null ? (left ? gap / left : gap) : null };
}

export async function loadBi() {
  const { data, error } = await sb.from("bi_files").select(COLS).order("processed_at", { ascending: false }).limit(800);
  if (error) throw error;
  const ok = (data || []).filter((r) => r.status === "ok");
  const month = ok.map((r) => r.month).filter(Boolean).sort().pop() || null;
  const inM = ok.filter((r) => r.month === month);
  const rev = {}, contest = {}, cards = new Map();
  for (const r of inM) {
    if (r.kind === "store_revenue" && r.channel && (!rev[r.channel] || newer(r, rev[r.channel]))) rev[r.channel] = r;
    if (r.kind === "store_contest" && r.channel && (!contest[r.channel] || newer(r, contest[r.channel]))) contest[r.channel] = r;
    if (r.kind === "staff_card") { const k = r.staff_id || "?" + (r.data?.staff?.code || r.data?.staff?.name || r.file_id); if (!cards.has(k) || newer(r, cards.get(k))) cards.set(k, r); }
  }
  const P = {};
  for (const [ch, r] of Object.entries(rev)) { const v = r.data?.revenue || {}; P[ch] = { ...plan(n(v.dt_qd) || 0, n(v.target), n(r.data?.days_elapsed), n(r.data?.days_total), n(v.forecast)), row: r, v }; }
  const chs = Object.values(P);
  let total = null;
  if (chs.length) {
    const a = chs.reduce((s, x) => s + x.actual, 0), t = chs.every((x) => x.target) ? chs.reduce((s, x) => s + x.target, 0) : null;
    const fc = chs.every((x) => x.fc !== null) ? chs.reduce((s, x) => s + x.fc, 0) : null;
    total = plan(a, t, chs[0].el, chs[0].tot, fc);
  }
  const days = chs[0] ? { el: chs[0].el, tot: chs[0].tot, left: chs[0].left } : (() => { const c = calDays(); return { el: c.el, tot: c.tot, left: c.tot - c.el }; })();
  const through = [...Object.values(rev), ...Object.values(contest)].map((r) => r.data_through).filter(Boolean).sort().pop() || null;
  const maxOf = (rows, k) => rows.map((r) => r[k]).filter(Boolean).sort().pop() || null;
  return { month, rev: P, total, contest, cards: [...cards.values()], errors: (data || []).filter((r) => r.status === "error"), count: (data || []).length, days, through,
    last: (data || [])[0]?.processed_at || null,
    // thời gian cập nhật: tool đọc ảnh lúc (processed_at) · BI chụp / cập nhật lúc (captured_at)
    revAt: maxOf(Object.values(rev), "processed_at"), revCap: maxOf(Object.values(rev), "captured_at"),
    contestAt: maxOf(Object.values(contest), "processed_at"), contestCap: maxOf(Object.values(contest), "captured_at"),
    cardAt: maxOf([...cards.values()], "processed_at") };
}

// "06:32 23/11" theo giờ Việt Nam
const upd = (iso) => { if (!iso) return ""; const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute} ${p.day}/${p.month}`; };
const money = (x) => (x === null ? "—" : fmt(x, x >= 100 ? 0 : 1));
const pctTxt = (x) => (x === null ? "—" : fmt(x, 1) + "%");
const barCls = (p) => (p >= 100 ? "" : p >= 85 ? "mid" : "low");
function revCard(title, p, sub = "") {
  if (!p) return "";
  return `<div class="card bi-rev"><div class="bi-rev-h"><b>${esc(title)}</b>${sub ? `<span class="tiny muted">${sub}</span>` : ""}</div>
    <div class="bi-big"><b>${money(p.actual)}</b><span class="muted"> / ${money(p.target)} tr</span></div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ${barCls(p.fcPct ?? 0)}" style="flex:1"><i style="width:${Math.min(100, p.pct ?? 0)}%"></i></div><b class="small">${pctTxt(p.pct)}</b></div>
    <div class="bi-kv">
      <span><small>Dự kiến cả tháng</small><b class="${(p.fcPct ?? 0) >= 100 ? "pos" : "neg"}">${money(p.fc)} tr · ${pctTxt(p.fcPct)}</b></span>
      <span><small>Còn thiếu</small><b>${p.gap === null ? "—" : p.gap ? money(p.gap) + " tr" : "✅ Đạt"}</b></span>
      <span><small>Cần bán / ngày${p.left !== null ? ` (${p.left} ngày)` : ""}</small><b class="star">${p.gap ? money(p.perDay) + " tr" : "—"}</b></span>
      <span><small>Đang bán / ngày</small><b>${p.pace === null ? "—" : money(p.pace) + " tr"}</b></span>
    </div></div>`;
}

// Khối doanh thu & mục tiêu (trang 🏢 Siêu thị)
export function biRevenueHtml(bi) {
  if (!bi.total) return "";
  const sub = (p) => { const v = p.v || {}; return [v.ssg_pct !== null && v.ssg_pct !== undefined ? `SSG ${fmt(v.ssg_pct, 1)}%` : "", v.bills ? `${fmt(v.bills)} bill` : "", v.installment_pct ? `trả chậm ${fmt(v.installment_pct, 1)}%` : ""].filter(Boolean).join(" · "); };
  return `<h3 class="td-sec">📊 Doanh thu quy đổi & mục tiêu tháng ${esc((bi.month || "").slice(5, 7))} <span class="tiny muted">· số BI tới hết ${bi.through ? dmy(bi.through) : "?"} · ngày ${bi.days.el ?? "?"}/${bi.days.tot ?? "?"}</span></h3>
    <p class="tiny muted bi-upd">🕒 Cập nhật lúc <b>${upd(bi.revAt) || "—"}</b>${bi.revCap ? ` · BI chụp ${upd(bi.revCap)}` : ""}</p>
    <div class="bi-grid">${revCard("Toàn siêu thị", bi.total)}${["TGD", "AAR"].map((ch) => bi.rev[ch] ? revCard(CH[ch], bi.rev[ch], esc(sub(bi.rev[ch]))) : "").join("")}</div>`;
}

// Bảng xếp hạng NV theo thẻ BI (QL thấy hết; NV chỉ thấy thẻ của mình theo quyền)
export function biStaffHtml(bi, nameOf) {
  if (!bi.cards.length) return "";
  const rows = bi.cards.map((r) => {
    const s = r.data?.staff || {}, el = n(r.data?.days_elapsed) ?? bi.days.el, tot = n(r.data?.days_total) ?? bi.days.tot;
    return { r, s, p: plan(n(s.revenue_qd) || 0, n(s.revenue_target), el, tot), name: (r.staff_id && nameOf(r.staff_id)) || s.name || "?" };
  }).sort((a, b) => (b.p.fcPct ?? -1) - (a.p.fcPct ?? -1));
  return `<h3 class="td-sec">👥 Nhân viên theo BI · ${rows.length} <span class="tiny muted">· 🕒 cập nhật ${upd(bi.cardAt) || "—"}</span></h3>
    <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Nhân viên</th><th class="num">DT QĐ</th><th class="num">MT</th><th>% dự kiến</th><th class="num">Còn thiếu</th><th class="num">Cần/ngày</th><th class="num">Bill</th><th class="num">Bán kèm</th><th class="num">Thi đua đạt</th><th class="num">Hạng nhóm</th></tr></thead><tbody>
    ${rows.map(({ r, s, p, name }, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(name)}</b><div class="tiny muted">${esc(r.staff_id || s.code || "")}${s.dept ? " · " + esc(s.dept) : ""}${r.staff_id ? "" : ' · <span class="pill warn">chưa khớp mã</span>'}</div></td>
      <td class="num">${money(p.actual)}</td><td class="num">${money(p.target)}</td>
      <td><div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ${barCls(p.fcPct ?? 0)}" style="width:70px"><i style="width:${Math.min(100, p.fcPct ?? 0)}%"></i></div><b class="small">${pctTxt(p.fcPct)}</b></div></td>
      <td class="num">${p.gap === null ? "—" : p.gap ? money(p.gap) : "✅"}</td><td class="num">${p.gap ? money(p.perDay) : "—"}</td>
      <td class="num">${s.bills ?? "—"}</td><td class="num">${s.attach_pct === null || s.attach_pct === undefined ? "—" : fmt(s.attach_pct, 1) + "%"}</td>
      <td class="num">${s.contest_total ? `${s.contest_passed ?? 0}/${s.contest_total}` : "—"}</td><td class="num">${s.group_rank ? `${s.group_rank}/${s.group_size ?? "?"}` : "—"}</td></tr>`).join("")}
    </tbody></table></div><p class="tiny muted">Tiền tính bằng triệu đồng. % dự kiến = tốc độ bán hiện tại kéo tới hết tháng so với MT.</p>`;
}

// Thanh công cụ QL + danh sách ảnh đọc lỗi
export function biToolsHtml(bi) {
  return `<details class="card" id="biTools" style="margin-bottom:14px"><summary><b>📥 Số liệu BI từ ảnh chụp</b> <span class="muted small">— ${bi.count} ảnh đã đọc${bi.errors.length ? ` · <span class="neg">${bi.errors.length} lỗi</span>` : ""}${bi.last ? ` · lần cuối ${new Date(bi.last).toLocaleString("vi-VN")}` : ""}</span></summary>
    <p class="small muted" style="margin:8px 0">Chụp màn hình app BI (Doanh thu hợp nhất, BC Thi đua lũy kế, thẻ nhân viên) bỏ vào thư mục Drive <b>Tool Báo Cáo / 00 - Nhập doanh thu và thi đua</b>. Tool tự xem thư mục mỗi 5 phút (06:00–23:00) và <b>chỉ đọc ảnh úp trong ngày</b> (ảnh cũ bỏ qua cho nhanh); ảnh đọc lỗi tự đọc lại sau 10 phút, tối đa 4 lần. Ảnh BC Thi đua mới nhất sẽ thay bảng thi đua bên dưới.</p>
    <div class="row"><button class="btn primary" id="biSync" type="button">📥 Đọc ảnh mới trong Drive</button><label class="btn" for="biFile">📷 Chọn ảnh từ máy</label><input type="file" id="biFile" accept="image/*" multiple hidden><button class="btn ghost small" id="biAi" type="button">🤖 Kiểm tra AI</button><span class="small muted" id="biMsg">${esc(biBusy.last || "")}</span></div>
    ${bi.errors.length ? `<div style="margin-top:10px">${bi.errors.map((r) => `<div class="row small" style="gap:6px;margin-top:4px"><span class="pill bad">Lỗi</span><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a><span class="muted">${esc(r.error)}${r.data?.tries ? ` · đã thử ${r.data.tries}/4` : ""}</span><button class="btn ghost small" type="button" data-biforget="${esc(r.file_id)}">Đọc lại</button></div>`).join("")}</div>` : ""}
  </details>`;
}

const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("Không đọc được ảnh")); r.readAsDataURL(blob); });

// Đang đọc ảnh → trang không vẽ lại thanh công cụ (giữ dòng tiến độ)
export const biBusy = { on: false };

// Gắn sự kiện cho thanh công cụ QL (gọi sau khi chèn biToolsHtml)
export function bindBiTools(box, reload) {
  const msg = (t) => { biBusy.last = t; const m = box.querySelector("#biMsg"); if (m) m.textContent = t; };
  const btn = box.querySelector("#biSync");
  if (btn) btn.onclick = async () => {
    btn.disabled = true; biBusy.on = true; let read = 0, err = 0, rows = null;
    try {
      for (let i = 0; i < 25; i++) {
        msg(`Đang đọc… (${read} ảnh xong)`);
        const r = await callFn("bi", { mode: "sync" });
        read += r.read; err += r.errors; rows = r.contestRows ?? rows;
        if (!r.remaining || (!r.read && !r.errors)) { msg(`${r.today ?? r.total} ảnh úp hôm nay · đọc mới ${read}${err ? ` · ${err} lỗi` : ""}${rows ? ` · cập nhật ${rows} dòng thi đua` : ""}${r.stopped ? ` · ${r.stopped}` : ""}`); break; }
      }
      toast(read ? `Đã đọc ${read} ảnh BI` : "Không có ảnh mới hôm nay");
    } catch (e) { msg(""); toast(errMsg(e), 5000); }
    btn.disabled = false; biBusy.on = false; reload(true);
  };
  const inp = box.querySelector("#biFile");
  if (inp) inp.onchange = async () => {
    const files = [...inp.files].slice(0, 12); inp.value = ""; if (!files.length) return;
    let done = 0; biBusy.on = true;
    try {
      for (let i = 0; i < files.length; i += 2) {
        msg(`Đang tải & đọc ${Math.min(files.length, i + 2)}/${files.length}…`);
        const part = [];
        for (const f of files.slice(i, i + 2)) { const b = await compress(f, 2800, 0.9); part.push({ name: f.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", data: await b64(b) }); }
        const r = await callFn("bi", { mode: "upload", files: part });
        done += r.files.filter((x) => !x.error).length;
        const bad = r.files.filter((x) => x.error); if (bad.length) toast(bad.map((x) => `${x.name}: ${x.error}`).join(" · "), 5000);
      }
      msg(`Đã đọc ${done}/${files.length} ảnh`); toast(`Đã đọc ${done} ảnh BI`);
    } catch (e) { msg(""); toast(errMsg(e), 5000); }
    biBusy.on = false; reload(true);
  };
  box.onclick = async (e) => {
    const b = e.target.closest("[data-biforget]"); if (!b) return;
    b.disabled = true; msg("Đang đọc lại…");
    try {   // đọc lại đúng ảnh này (kể cả ảnh cũ không phải hôm nay)
      const r = await callFn("bi", { mode: "sync", force: [b.dataset.biforget], limit: 1 });
      msg(r.read ? "✅ Đã đọc lại" : r.stopped || "Vẫn lỗi — xem dòng lỗi"); toast(r.read ? "Đã đọc lại ảnh" : "Vẫn lỗi", 3000); reload(true);
    } catch (x) { msg(""); toast(errMsg(x), 5000); b.disabled = false; }
  };
  const ai = box.querySelector("#biAi");
  if (ai) ai.onclick = async () => {   // 🤖 Kiểm tra AI: model nào đang chạy được
    ai.disabled = true; msg("Đang kiểm tra AI…");
    try { const r = await callFn("bi", { mode: "ai_check" }); msg(r.ok ? `✅ AI chạy tốt · model ${r.model}` : `⛔ ${r.error}`); }
    catch (x) { msg(""); toast(errMsg(x), 5000); }
    ai.disabled = false;
  };
}

// Thẻ chỉ tiêu của chính NV (trang 🏠 Hôm nay)
export async function myBiHtml(staffId) {
  if (!staffId) return "";
  const { data } = await sb.from("bi_files").select("data,data_through,captured_at,month,processed_at").eq("kind", "staff_card").eq("status", "ok").eq("staff_id", staffId)
    .order("month", { ascending: false }).order("data_through", { ascending: false, nullsFirst: false }).limit(1);
  const r = data?.[0]; if (!r) return "";
  const s = r.data?.staff || {}, el = n(r.data?.days_elapsed), tot = n(r.data?.days_total);
  const p = plan(n(s.revenue_qd) || 0, n(s.revenue_target), el, tot);
  const weak = (r.data?.programs || []).filter((x) => n(x.pct) !== null).sort((a, b) => a.pct - b.pct).slice(0, 4);
  return `<div class="card bi-me"><div class="bi-rev-h"><b>🎯 Chỉ tiêu tháng ${esc((r.month || "").slice(5, 7))} (BI)</b><span class="tiny muted">tới hết ${r.data_through ? dm(r.data_through) : "?"}${s.group_rank ? ` · hạng ${s.group_rank}/${s.group_size ?? "?"}` : ""} · 🕒 ${upd(r.processed_at)}</span></div>
    <div class="bi-big"><b>${money(p.actual)}</b><span class="muted"> / ${money(p.target)} tr DT QĐ</span></div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ${barCls(p.fcPct ?? 0)}" style="flex:1"><i style="width:${Math.min(100, p.pct ?? 0)}%"></i></div><b class="small">${pctTxt(p.pct)}</b></div>
    <div class="bi-kv"><span><small>Dự kiến</small><b class="${(p.fcPct ?? 0) >= 100 ? "pos" : "neg"}">${pctTxt(p.fcPct)}</b></span>
      <span><small>Còn thiếu</small><b>${p.gap === null ? "—" : p.gap ? money(p.gap) + " tr" : "✅ Đạt"}</b></span>
      <span><small>Cần bán / ngày${p.left !== null ? ` (${p.left} ngày)` : ""}</small><b class="star">${p.gap ? money(p.perDay) + " tr" : "—"}</b></span>
      <span><small>Thi đua đạt</small><b>${s.contest_total ? `${s.contest_passed ?? 0}/${s.contest_total}` : "—"}</b></span></div>
    ${weak.length ? `<p class="small" style="margin:8px 0 0">Cần đẩy: ${weak.map((x) => `<span class="pill ${x.pct < 50 ? "bad" : "warn"}">${esc(x.name)} ${fmt(x.pct, 0)}%</span>`).join(" ")}</p>` : ""}
  </div>`;
}
