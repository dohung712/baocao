// Quản lý → Điểm & DT: target tháng, doanh thu, phục vụ, vi phạm, chỉnh sao / reset, lịch sử điều chỉnh
import { $, $$, esc, fmt, sign, toast, modal, confirmBox, vnToday, addDays, weekStart, monthStart, dmy, dm, dow, shiftMonth, monthLabel, centerTab } from "../ui.js";
import { sb, S, rpc, callFn, isOwner, visibleStaff, staffById, setting, errMsg, loadStaff, loadItems, loadSettings, depts } from "../store.js";
import { parseTargetReport } from "../lib-targets.js";
import { openCum, MEASURE, measureTag } from "../cumulative.js";
import { dailyTarget, dailyPct, dailyMin } from "../star-rules.js";

const SUBS = [["targets", "🎯 Target tháng"], ["cum", "📈 Lũy kế tuần"], ["media", "📣 Truyền thông"], ["rank", "🏆 Thưởng hạng"], ["revenue", "💰 Doanh thu"], ["service", "🤝 Phục vụ"], ["violations", "⚠️ Vi phạm"], ["stars", "⭐ Sao & reset"], ["log", "🧾 Lịch sử"]];
let sub = "targets", ym = vnToday().slice(0, 7), host;
export const setScoreSub = (s) => { sub = s; };
const err = (e) => toast(errMsg(e), 4500);
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
const unit = () => setting("REVENUE_UNIT", "");

export async function scoreAdmin(body) {
  host = body;
  body.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="seg" id="asSub">${SUBS.map(([k, l]) => `<button type="button" data-s="${k}" class="${k === sub ? "on" : ""}">${l}</button>`).join("")}</div>
    <span class="row" style="gap:4px" id="asNav"><button class="btn small" data-mm="-1" type="button">‹</button><b>${monthLabel(ym)}</b><button class="btn small" data-mm="1" type="button">›</button></span></div><div id="asBody"></div>`;
  $("#asSub").onclick = (e) => { const b = e.target.closest("[data-s]"); if (b) { sub = b.dataset.s; scoreAdmin(host); } };
  centerTab($("#asSub"));
  $("#asNav").onclick = (e) => { const b = e.target.closest("[data-mm]"); if (b) { ym = shiftMonth(ym, Number(b.dataset.mm)); scoreAdmin(host); } };
  const el = $("#asBody"); el.onclick = null;
  try { await ({ targets, cum, media, rank, revenue, service, violations, stars, log })[sub](el); } catch (e) { el.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}
const month = () => ym + "-01";
const monthEnd = () => addDays(shiftMonth(ym, 1) + "-01", -1);
const staffItems = (s) => { const list = S.items.filter((i) => i.active && (s.assigned_items?.length ? s.assigned_items.includes(i.name) : i.store === "Chung" || i.store.toLowerCase() === (s.dept || "").toLowerCase()));
  const m = new Map(); for (const i of list) if (!m.has(i.name) || i.store === s.dept) m.set(i.name, i); return [...m.values()]; };

// ---------- Lũy kế tuần (C12): mở khoá, loại đo từng môn, ai đã cập nhật ----------
const guessMeasure = (t) => (Number.isInteger(Number(t)) && Number(t) <= 200 ? "sl" : "dtqd");
async function cum(el) {
  const today = vnToday(), mon = weekStart(today);
  const [tg, logs, ms] = await Promise.all([q(sb.from("monthly_targets").select("staff_id,items").eq("month", month())),
    q(sb.from("score_log").select("staff_id,at,actor,detail").eq("kind", "cumulative").gte("at", addDays(mon, -7) + "T00:00:00+07:00").order("at", { ascending: false })), q(sb.from("item_measures").select("name,measure"))]);
  const u = setting("CUM_UNLOCK", null), unlocked = u && new Date(u.until) > new Date(), uStaff = u?.staff || [];
  const names = new Map(); for (const t of tg) for (const i of t.items || []) if (!names.has(i.name)) names.set(i.name, Number(i.target));
  const eff = (n) => { const it = ms.find((i) => i.name === n); return it ? { m: it.measure, g: false } : { m: guessMeasure(names.get(n)), g: true }; };
  const people = visibleStaff().filter((s) => tg.some((t) => t.staff_id === s.id));
  const last = (sid) => logs.find((l) => l.staff_id === sid);
  const isMon = new Date(today + "T00:00:00Z").getUTCDay() === 1;
  el.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>📈 Cập nhật lũy kế tuần</h2>
      <span class="pill ${isMon || unlocked ? "ok" : "mute"}">${isMon ? "Hôm nay thứ 2 — NV đang cập nhật" : unlocked ? `Đang mở khoá đến ${new Date(u.until).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}${uStaff.length ? ` · ${uStaff.length} NV` : " · tất cả NV"}` : "Đang khoá (tự mở thứ 2)"}</span></div>
    <p class="small muted">NV nhập <b>lũy kế tháng đến hết hôm qua</b> (DT QĐ + từng môn theo đúng loại) vào <b>thứ 2 hằng tuần</b>. Tool tự ghi phần chênh lệch nên bảng điểm, Của tôi, Telegram dùng số đúng. Ngày khác muốn NV sửa lại thì <b>mở khoá</b> bên dưới; quản lý luôn cập nhật hộ được.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-end"><label>Mở khoá đến<input type="datetime-local" id="cuUntil" value="${today}T23:59" style="width:auto"></label>
      <details class="grow"><summary class="small">Chỉ mở cho một số NV (để trống = tất cả)</summary><div class="chips" id="cuStaff">${people.map((s) => `<label class="chip inline tiny"><input type="checkbox" value="${esc(s.id)}" ${uStaff.includes(s.id) ? "checked" : ""}> ${esc(s.name)}</label>`).join("")}</div></details>
      <button class="btn primary" id="cuOpen" type="button">🔓 Mở khoá</button>${unlocked ? `<button class="btn" id="cuClose" type="button">🔒 Khoá lại</button>` : ""}</div></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🏷️ Loại tính của từng môn</h2><span class="small muted">NV sẽ thấy nhãn này khi nhập</span></div>
      <p class="small muted">${Object.values(MEASURE).map((x) => `<b>${x.icon} ${x.label}</b>: ${esc(x.hint)}`).join("<br>")}<br>Nhãn có dấu <b>?</b> là tool đang đoán — chọn lại cho đúng.</p>
      ${names.size ? `<div class="tbl-wrap"><table><thead><tr><th>Môn tháng ${ym.slice(5)}</th><th>Loại tính</th></tr></thead><tbody>${[...names.keys()].map((n) => { const e = eff(n);
        return `<tr><td><b>${esc(n)}</b> ${measureTag(e.m, e.g)}</td><td><select data-ms="${esc(n)}" style="width:auto">${Object.entries(MEASURE).map(([k, x]) => `<option value="${k}" ${k === e.m ? "selected" : ""}>${x.icon} ${x.label}</option>`).join("")}</select></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">Chưa có môn thi đua tháng này.</p>`}</div>
    <div class="card"><div class="card-h"><h2>👥 Ai đã cập nhật</h2><span class="small muted">Tuần từ thứ 2 ${dmy(mon)}</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th>Lần gần nhất</th><th>Đã chỉnh</th><th></th></tr></thead><tbody>
      ${people.map((s) => { const l = last(s.id), ok = l && new Date(l.at) >= new Date(mon + "T00:00:00+07:00");
        return `<tr><td><b>${esc(s.name)}</b><div class="tiny muted">${esc(s.dept)}</div></td><td>${l ? `${ok ? '<span class="pill ok">✅ Tuần này</span>' : '<span class="pill warn">Tuần trước</span>'} <span class="tiny muted">${new Date(l.at).toLocaleString("vi-VN")}${l.actor && !l.actor.startsWith("nv") ? " · " + esc(l.actor) : ""}</span>` : '<span class="pill bad">⏳ Chưa cập nhật</span>'}</td>
          <td class="small">${l ? `${l.detail?.changed ?? 0} mục` : ""}</td><td class="num"><button class="btn small" data-cu="${esc(s.id)}" type="button">Cập nhật hộ</button></td></tr>`; }).join("") || `<tr><td colspan="4" class="empty">Chưa giao target tháng.</td></tr>`}</tbody></table></div></div>`;
  el.onclick = async (e) => {
    const b = e.target.closest("[data-cu]");
    if (b) return openCum(b.dataset.cu, () => cum(el));
    if (e.target.closest("#cuOpen")) {
      const until = new Date($("#cuUntil").value); if (!(until > new Date())) return toast("Chọn thời hạn ở tương lai");
      const staff = $$("#cuStaff input:checked").map((x) => x.value);
      try { const r = await rpc("cum_unlock", { p_until: until.toISOString(), p_staff: staff }); await loadSettings(); toast(r.message); cum(el); } catch (x) { err(x); }
    }
    if (e.target.closest("#cuClose")) { try { const r = await rpc("cum_unlock", { p_until: null, p_staff: [] }); await loadSettings(); toast(r.message); cum(el); } catch (x) { err(x); } }
  };
  el.onchange = async (e) => {
    const sel = e.target.closest("[data-ms]"); if (!sel) return;
    try { await rpc("set_item_measure", { p_name: sel.dataset.ms, p_measure: sel.value }); toast("Đã lưu loại môn"); cum(el); } catch (x) { err(x); }
  };
}

// ---------- Truyền thông ngày (B13) ----------
async function media(el) {
  const rows = await q(sb.from("media_reports").select("*").gte("report_date", month()).lte("report_date", monthEnd()));
  const days = [...new Set(rows.map((r) => r.report_date))].sort();
  el.innerHTML = `<div class="card"><div class="card-h"><h2>📣 Báo cáo truyền thông tháng ${ym.slice(5)}/${ym.slice(0, 4)}</h2><span class="small muted">NV chọn trong báo cáo cuối ngày · chỉ ghi nhận</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th class="num">Số ngày báo cáo</th><th class="num">Tổng lần truyền thông</th><th class="num">Tổng báo cáo Line</th><th class="num">TB/ngày</th><th>7 ngày gần nhất (TT/Line)</th></tr></thead><tbody>
    ${visibleStaff().map((s) => { const m = rows.filter((r) => r.staff_id === s.id), tp = m.reduce((a, r) => a + r.posts, 0), tl = m.reduce((a, r) => a + r.line_reports, 0);
      return `<tr><td><b>${esc(s.name)}</b><div class="tiny muted">${esc(s.dept)}</div></td><td class="num">${m.length}</td><td class="num"><b>${tp}</b></td><td class="num"><b>${tl}</b></td><td class="num">${m.length ? fmt(tp / m.length, 1) : "—"}</td>
        <td class="small">${days.slice(-7).map((d) => { const r = m.find((x) => x.report_date === d); return `<span class="pill ${r ? "info" : "mute"}" title="${dmy(d)}">${dm(d)} ${r ? `${r.posts}/${r.line_reports}` : "–"}</span>`; }).join(" ")}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
}

// ---------- Thưởng hạng tháng (C13): xếp riêng từng bộ phận, top 5 → 4000/3500/3000/2500/2000⭐, QL chốt mới cộng ----------
async function rank(el) {
  const rows = await rpc("rank_reward_preview", { p_month: month() });
  const rw = setting("RANK_REWARDS", [4000, 3500, 3000, 2500, 2000]);
  const by = new Map(); for (const r of rows) { if (!by.has(r.dept)) by.set(r.dept, []); by.get(r.dept).push(r); }
  const pend = rows.filter((r) => r.stars > 0 && !r.closed), total = pend.reduce((a, r) => a + r.stars, 0);
  el.innerHTML = `<div class="card"><div class="card-h"><h2>🏆 Thưởng hạng tháng ${ym.slice(5)}/${ym.slice(0, 4)}</h2>
      <button class="btn primary" id="rkClose" type="button" ${pend.length ? "" : "disabled"}>✅ Chốt & cộng ${fmt(total)}⭐ (${pend.length} NV)</button></div>
    <p class="small muted">Xếp hạng theo <b>bảng điểm xếp hạng</b> (DT + Thi đua + Phục vụ − vi phạm), <b>mỗi bộ phận xếp riêng</b>. Top ${rw.length}: ${rw.map((v, i) => `hạng ${i + 1} = <b>${fmt(v)}⭐</b>`).join(" · ")}. Người 0 điểm không được thưởng; bằng điểm thì cùng hạng. Tháng đang chạy chỉ là <b>đề xuất tạm</b>; bấm Chốt mới cộng sao (mỗi NV một lần cho mỗi tháng, ghi vào Lịch sử).</p></div>
    ${[...by.entries()].map(([d, list]) => `<div class="card"><div class="card-h"><h2>${esc(d)}</h2></div><div class="tbl-wrap"><table><thead><tr><th>Hạng</th><th>Nhân viên</th><th class="num">Điểm</th><th class="num">Thưởng</th><th>Trạng thái</th></tr></thead><tbody>
      ${list.map((r) => `<tr><td><b>${r.rank}</b></td><td>${esc(r.name)}</td><td class="num">${fmt(r.total, 2)}</td><td class="num">${r.stars ? `<b>+${fmt(r.stars)}⭐</b>` : "—"}</td><td>${r.stars ? (r.closed ? '<span class="pill ok">✅ Đã cộng</span>' : '<span class="pill warn">Đề xuất</span>') : ""}</td></tr>`).join("")}
      </tbody></table></div></div>`).join("") || '<div class="banner info"><div>Chưa có dữ liệu điểm cho tháng này.</div></div>'}`;
  $("#rkClose")?.addEventListener("click", async () => {
    if (!(await confirmBox("Chốt thưởng hạng?", `Cộng sao cho <b>${pend.length}</b> nhân viên, tổng <b>${fmt(total)}⭐</b>. Mỗi NV chỉ được cộng một lần cho tháng ${ym.slice(5)}/${ym.slice(0, 4)}.`, "Chốt & cộng"))) return;
    try { const r = await rpc("rank_reward_close", { p_month: month() }); toast(r.message, 4500); rank(el); } catch (x) { err(x); }
  });
}

// ---------- Target tháng ----------
async function targets(el) {
  const rows = await q(sb.from("monthly_targets").select("*").eq("month", month()));
  const by = new Map(rows.map((r) => [r.staff_id, r]));
  el.innerHTML = `${isOwner() ? `<details class="card" id="imp" style="margin-bottom:14px" ${rows.length ? "" : "open"}><summary><b>📥 Dán báo cáo target tháng</b> <span class="muted small">— tự gán target DT + môn tháng cho từng nhân viên theo siêu thị</span></summary>
      <textarea id="impText" style="margin-top:10px;min-height:140px;font:12px ui-monospace,Consolas,monospace" placeholder="=== SIÊU THỊ 933 (TGDĐ - 4 NS) ===&#10;• Doanh thu mỗi NV: 811.0 tr&#10;+ T11 - Laptop: Tổng 520.25 | %Đạt: 46.9% | Mỗi NV: 130.1&#10;…"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="impParse" type="button">⚡ Đọc báo cáo</button><span class="small muted" id="impMsg"></span></div><div id="impPrev"></div></details>` : ""}
    <div class="card"><div class="card-h"><h2>🎯 Target tháng ${ym.slice(5)}/${ym.slice(0, 4)}</h2><button class="btn small" id="tgFill" type="button">⚡ Tạo nhanh môn cho NV chưa có</button><button class="btn small primary" id="tgSaveRev" type="button">💾 Lưu target DT</button></div>
    <p class="small muted">Nhập target doanh thu quy đổi tháng (${esc(unit())}) và giao môn thi đua + target tháng cho từng nhân viên. <b>Nhân viên đã được giao môn sẽ báo cáo ngày đúng các môn thi đua này</b> (target báo cáo ngày = <b>${dailyPct()}%</b> × target tháng ÷ số ngày làm việc, tối thiểu <b>${dailyMin()}</b>; xếp hạng thi đua vẫn tính theo target tháng); chưa giao môn thì báo cáo theo môn của bộ phận. Lũy kế môn cộng từ thực đạt trong báo cáo ngày.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th class="num">Target DT tháng</th><th>Môn thi đua tháng (target)</th><th></th></tr></thead><tbody>
    ${visibleStaff().map((s) => { const t = by.get(s.id); return `<tr><td><b>${esc(s.name)}</b><div class="tiny muted">${esc(s.dept)}</div></td>
      <td class="num"><input type="number" step="any" min="0" data-rev="${esc(s.id)}" value="${t?.revenue_target ?? ""}" style="width:110px;text-align:right" placeholder="—"></td>
      <td class="small">${t?.items?.length ? `<span class="pill">${t.items.length} môn · ${t.work_days || defDays()} ngày làm</span> ` + t.items.map((i) => `${esc(i.name)} <b>${fmt(i.target, 2)}</b>`).join(" · ") : '<span class="neg">Chưa giao môn — báo cáo theo môn bộ phận</span>'}</td>
      <td class="num"><button class="btn small" data-items="${esc(s.id)}" type="button">Giao môn</button></td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  $("#impParse")?.addEventListener("click", () => importPreview(el));
  $("#impText")?.addEventListener("paste", () => setTimeout(() => importPreview(el), 30));
  $("#tgSaveRev").onclick = async () => {
    try {
      let n = 0;
      for (const inp of $$("[data-rev]", el)) {
        const sid = inp.dataset.rev, t = by.get(sid), v = inp.value === "" ? null : Number(inp.value);
        if ((t?.revenue_target ?? null) === v) continue;
        await rpc("save_monthly_target", { p_staff: sid, p_month: month(), p_revenue: v, p_items: t?.items || [] }); n++;
      }
      toast(n ? `Đã lưu target DT ${n} nhân viên` : "Không có thay đổi"); targets(el);
    } catch (e) { err(e); }
  };
  $("#tgFill").onclick = async () => {
    const days = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const v = await modal(`<h3>Tạo nhanh môn thi đua tháng</h3><form class="stack"><p class="small muted">Với nhân viên chưa được giao môn: lấy các môn hiện có của họ, target tháng = target ngày × số ngày làm việc.</p>
      <label>Số ngày làm việc trong tháng<input name="d" type="number" min="1" max="31" value="${Math.max(1, days - 4)}"></label></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Tạo</button></div>`);
    if (!v) return;
    try {
      let n = 0;
      for (const s of visibleStaff()) {
        if (by.get(s.id)?.items?.length) continue;
        const items = staffItems(s).map((i) => ({ name: i.name, target: Math.round(i.target * Number(v.d) * 100) / 100 }));
        if (!items.length) continue;
        await rpc("save_monthly_target", { p_staff: s.id, p_month: month(), p_revenue: by.get(s.id)?.revenue_target ?? null, p_items: items, p_work_days: Number(v.d) }); n++;
      }
      toast(`Đã giao môn cho ${n} nhân viên — kiểm tra và chỉnh lại target từng người nếu cần`, 4500); targets(el);
    } catch (e) { err(e); }
  };
  el.onclick = async (e) => {
    const b = e.target.closest("[data-items]"); if (!b) return;
    const s = staffById(b.dataset.items), t = by.get(s.id), cur = new Map((t?.items || []).map((i) => [i.name, i.target]));
    const all = [...new Set([...staffItems(s).map((i) => i.name), ...cur.keys()])];
    const v = await modal(`<h3>Giao môn tháng · ${esc(s.name)}</h3><p class="small muted">Tick môn cần thi đua trong tháng và nhập target tháng. Nhân viên sẽ báo cáo ngày <b>đúng các môn được tick</b>; môn không tick không báo cáo, không tính điểm.</p>
      <form class="stack"><label>Số ngày làm việc trong tháng (target báo cáo ngày = ${dailyPct()}% × target tháng ÷ số ngày, tối thiểu ${dailyMin()})<input type="number" id="miWd" min="1" max="31" value="${t?.work_days || defDays()}"></label>
      <div class="tbl-wrap"><table><thead><tr><th></th><th>Môn</th><th class="num">Target tháng</th><th class="num" title="${dailyPct()}% × (target tháng ÷ số ngày), tối thiểu ${dailyMin()}">Target báo cáo ngày</th></tr></thead><tbody>
      ${all.map((n) => { const it = S.items.find((i) => i.name === n); return `<tr><td><input type="checkbox" class="mi" value="${esc(n)}" ${cur.has(n) ? "checked" : ""}></td><td>${esc(n)}<div class="tiny muted">${it ? `target ngày ${fmt(it.target, 2)}` : ""}</div></td>
        <td class="num"><input type="number" step="any" min="0" data-mt="${esc(n)}" value="${cur.get(n) ?? ""}" style="width:100px;text-align:right"></td><td class="num miDay" data-n="${esc(n)}"></td></tr>`; }).join("")}
      </tbody></table></div><label>Thêm môn khác (tên)<input id="miNew" placeholder="Tuỳ chọn"></label></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="ok">Lưu</button></div>`,
      { onOpen: (box) => { const upd = () => { const d = Math.max(1, Number(box.querySelector("#miWd").value) || 1); box.querySelectorAll(".miDay").forEach((c) => { const x = Number(box.querySelector(`[data-mt="${CSS.escape(c.dataset.n)}"]`).value) || 0; c.textContent = x ? fmt(dailyTarget(x / d), 2) : ""; }); };
        box.addEventListener("input", upd); upd(); box.querySelector("[data-v=ok]").addEventListener("click", () => { state.wd = Number(box.querySelector("#miWd").value) || null;
        state.items = [...box.querySelectorAll(".mi:checked")].map((c) => ({ name: c.value, target: Number(box.querySelector(`[data-mt="${CSS.escape(c.value)}"]`).value) || 0 }));
        const nn = box.querySelector("#miNew").value.trim(); if (nn) state.items.push({ name: nn, target: 1 });
      }, true); } });
    if (v !== "ok") return;
    const bad = state.items.filter((i) => !(i.target > 0)); if (bad.length) return toast("Nhập target tháng > 0 cho: " + bad.map((i) => i.name).join(", "));
    try { await rpc("save_monthly_target", { p_staff: s.id, p_month: month(), p_revenue: t?.revenue_target ?? null, p_items: state.items, p_work_days: state.wd }); toast("Đã lưu"); targets(el); } catch (x) { err(x); }
  };
}
const state = {};
const defDays = () => Math.max(1, new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate() - (Number(setting("DAYS_OFF", 4)) || 0));

// ---------- Nhập target từ báo cáo ----------
export function guessDept(label) {
  const L = label.toLowerCase(), ds = depts();
  if (/topzone|aar/.test(L)) return ds.find((d) => /topzone/i.test(d)) || "";
  if (/tgd|thế giới|the gioi|tgdd/.test(L)) return ds.find((d) => /th[ếe] gi[ớo]i|tgd/i.test(d)) || "";
  if (/đmx|dmx|điện máy/.test(L)) return ds.find((d) => /đi[ệe]n m[áa]y|dmx/i.test(d)) || "";
  return ds.find((d) => d.toLowerCase().includes(L)) || "";
}
function importPreview(el) {
  const r = parseTargetReport($("#impText").value);
  if (!r.blocks.length) { $("#impMsg").textContent = "Không nhận ra báo cáo — cần các dòng “=== SIÊU THỊ … ===”, “Doanh thu mỗi NV”, “+ … Tổng … | %Đạt … | Mỗi NV …”."; $("#impPrev").innerHTML = ""; return; }
  const repMonth = r.month ? `${ym.slice(0, 4)}-${String(r.month).padStart(2, "0")}` : ym;
  const days = new Date(Date.UTC(+repMonth.slice(0, 4), +repMonth.slice(5, 7), 0)).getUTCDate();
  $("#impMsg").textContent = `Đọc được ${r.blocks.length} siêu thị, ${r.blocks.reduce((a, b) => a + b.items.length, 0)} môn.`;
  const per = (b, it) => Math.round((b.ns ? it.total / b.ns : it.perStaff) * 100) / 100;
  $("#impPrev").innerHTML = `<div class="fields" style="margin:12px 0"><label>Áp dụng cho tháng<input type="month" id="impMonth" value="${repMonth}"></label><label>Số ngày làm việc (để chia target ngày)<input type="number" id="impDays" min="1" max="31" value="${Math.max(1, days - 4)}"></label></div>
    ${r.blocks.map((b, bi) => { const dept = guessDept(b.label), staff = visibleStaff().filter((s) => s.dept === dept);
      return `<div class="card" style="box-shadow:none;margin-bottom:12px" data-blk="${bi}"><div class="card-h"><h3>Siêu thị ${esc(b.code)} · ${esc(b.label)}${b.ns ? ` · ${b.ns} NS` : ""}</h3>
        <label class="inline">Gán cho bộ phận <select class="impDept" style="width:auto">${["", ...depts()].map((d) => `<option value="${esc(d)}" ${d === dept ? "selected" : ""}>${d ? esc(d) : "— chọn —"}</option>`).join("")}</select></label></div>
        <p class="small">Target DT QĐ mỗi NV: <b>${b.revenue != null ? fmt(b.revenue, 1) + " " + esc(unit()) : "—"}</b> · Nhân viên nhận target: <span class="impStaff">${staffChips(staff)}</span>${b.ns && staff.length && b.ns !== staff.length ? ` <span class="pill warn">Báo cáo ${b.ns} NS, tool có ${staff.length} NV</span>` : ""}</p>
        <div class="tbl-wrap"><table><thead><tr><th>Môn</th><th class="num">Target siêu thị</th><th class="num">%Đạt hiện tại</th><th class="num">Target tháng / NV</th><th class="num" title="Target báo cáo ngày = ${dailyPct()}% × (target tháng ÷ số ngày), tối thiểu ${dailyMin()}">Target báo cáo ngày (chia ngày)</th></tr></thead><tbody>
        ${b.items.map((it) => `<tr><td>${esc(it.name)}</td><td class="num">${fmt(it.total, 2)}</td><td class="num">${fmt(it.pct, 1)}%</td><td class="num"><b>${fmt(per(b, it), 2)}</b></td><td class="num impDay" data-m="${per(b, it)}"></td></tr>`).join("")}
        </tbody></table></div></div>`; }).join("")}
    <div class="stack" style="gap:6px"><label class="inline"><input type="checkbox" id="oRev" checked> Cập nhật target doanh thu QĐ tháng</label>
      <label class="inline"><input type="checkbox" id="oItems" checked> Giao các môn trên làm môn thi đua tháng — nhân viên báo cáo ngày đúng các môn này, tính điểm xếp hạng</label>
      <label class="inline"><input type="checkbox" id="oDaily" checked> Cập nhật luôn danh sách môn của bộ phận theo báo cáo (dùng cho NV chưa được giao môn)</label>
      <label class="inline" style="margin-left:22px"><input type="checkbox" id="oOff" checked> Tắt các môn báo cáo ngày cũ không có trong danh sách (lịch sử vẫn giữ)</label>
      <label class="inline" style="margin-left:22px"><input type="checkbox" id="oNoPen" checked> Môn có target ngày dưới 1 (đánh dấu ⚠️): không trừ sao khi chưa đạt nhiều ngày liền — vẫn tính % thi đua tháng</label>
      <label class="inline" style="margin-left:22px"><input type="checkbox" id="oClear" checked> Bỏ “môn riêng” đang giao cho các nhân viên này</label></div>
    <p class="small muted">Môn mới dùng sao thưởng/phạt mặc định +200 / −100 (môn trùng tên giữ mức cũ) — chỉnh lại ở <b>Quản lý → Môn & sao thưởng/phạt</b>.</p>
    <div class="row"><button class="btn primary" id="impApply" type="button">✅ Áp dụng target</button></div>`;
  const upd = () => { const d = Math.max(1, Number($("#impDays").value) || 1); $$(".impDay", el).forEach((c) => { const v = Number(c.dataset.m) / d; c.innerHTML = `<b>${fmt(dailyTarget(v), 2)}</b> <span class="tiny muted">(${fmt(v, 3)})</span>` + (v > 0 && v < 1 ? ' <span title="Target chia ngày dưới 1">⚠️</span>' : ""); }); };
  $("#impDays").oninput = upd; upd();
  $$(".impDept", el).forEach((sel) => sel.onchange = () => { const box = sel.closest("[data-blk]"); box.querySelector(".impStaff").innerHTML = staffChips(visibleStaff().filter((s) => s.dept === sel.value)); });
  $("#impApply").onclick = async (e) => {
    const month = $("#impMonth").value + "-01", d = Math.max(1, Number($("#impDays").value) || 1);
    const blocks = r.blocks.map((b, bi) => { const box = el.querySelector(`[data-blk="${bi}"]`);
      return { dept: box.querySelector(".impDept").value, staff_ids: [...box.querySelectorAll(".impSid:checked")].map((c) => c.value), revenue: b.revenue,
        items: b.items.map((it) => ({ name: it.name, month: per(b, it), day: Math.round((per(b, it) / d) * 1000) / 1000 })) }; });
    if (blocks.some((b) => !b.dept)) return toast("Chọn bộ phận cho từng siêu thị");
    const opts = { set_revenue: $("#oRev").checked, set_items: $("#oItems").checked, set_daily: $("#oDaily").checked, deactivate_old: $("#oOff").checked, clear_assigned: $("#oClear").checked, work_days: d, nopen_below: $("#oNoPen").checked ? 1 : 0 };
    if (!(await confirmBox("Áp dụng target tháng?", `Tháng <b>${month.slice(5, 7)}/${month.slice(0, 4)}</b> cho <b>${blocks.reduce((a, b) => a + b.staff_ids.length, 0)}</b> nhân viên${opts.set_daily ? ", đổi môn báo cáo ngày theo báo cáo" : ""}.`, "Áp dụng"))) return;
    e.target.disabled = true;
    try { const res = await rpc("import_month_targets", { p_month: month, p_blocks: blocks, p_opts: opts }); toast("✅ " + res.message + (res.warning ? " · " + res.warning : ""), 6000); await loadItems(); await loadStaff(); ym = month.slice(0, 7); scoreAdmin(host); }
    catch (x) { err(x); e.target.disabled = false; }
  };
}
const staffChips = (list) => list.length ? list.map((s) => `<label class="chip inline" style="padding:2px 8px"><input type="checkbox" class="impSid" value="${esc(s.id)}" checked> ${esc(s.name)}</label>`).join(" ") : '<span class="neg">Chưa có nhân viên — chọn bộ phận</span>';

// ---------- Doanh thu ----------
async function revenue(el) {
  const [rows, tg] = await Promise.all([q(sb.from("revenue_entries").select("*").gte("entry_date", month()).lte("entry_date", monthEnd())), q(sb.from("monthly_targets").select("staff_id,revenue_target").eq("month", month()))]);
  const tmap = new Map(tg.map((r) => [r.staff_id, r.revenue_target])), today = vnToday();
  el.innerHTML = `<div class="card"><div class="card-h"><h2>💰 Lũy kế doanh thu QĐ ${ym.slice(5)}/${ym.slice(0, 4)}</h2><span class="small muted">Đơn vị: ${esc(unit())}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th><th class="num">Số ngày đã nhập</th><th class="num">Hôm nay</th><th class="num">Điều chỉnh</th><th class="num">Lũy kế</th><th class="num">Target</th><th class="num">%</th><th></th></tr></thead><tbody>
    ${visibleStaff().map((s) => { const mine = rows.filter((r) => r.staff_id === s.id), daily = mine.filter((r) => r.kind === "daily"), adj = mine.filter((r) => r.kind === "adjust");
      const sum = mine.reduce((a, r) => a + Number(r.amount), 0), t = tmap.get(s.id), td = daily.find((r) => r.entry_date === today);
      return `<tr><td><b>${esc(s.name)}</b></td><td class="num">${daily.length}</td><td class="num">${td ? fmt(td.amount, 2) : '<span class="neg tiny">chưa nhập</span>'}</td><td class="num">${adj.length ? sign(adj.reduce((a, r) => a + Number(r.amount), 0)) : ""}</td>
        <td class="num"><b>${fmt(sum, 2)}</b></td><td class="num">${t != null ? fmt(t, 2) : "—"}</td><td class="num">${t ? Math.round(sum * 100 / t) + "%" : ""}</td>
        <td class="num"><button class="btn small" data-rv="${esc(s.id)}" type="button">Chi tiết / điều chỉnh</button></td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  el.onclick = async (e) => {
    const b = e.target.closest("[data-rv]"); if (!b) return;
    const s = staffById(b.dataset.rv), mine = rows.filter((r) => r.staff_id === s.id).sort((a, c) => c.entry_date.localeCompare(a.entry_date));
    const v = await modal(`<h3>${esc(s.name)} · DT tháng ${ym.slice(5)}</h3>
      <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table><tbody>${mine.map((r) => `<tr><td>${dow(r.entry_date)} ${dmy(r.entry_date)} ${r.kind === "adjust" ? '<span class="pill info">Điều chỉnh</span>' : ""}</td><td class="num"><b>${r.kind === "adjust" && r.amount > 0 ? "+" : ""}${fmt(r.amount, 2)}</b></td>
        <td class="small muted">${esc(r.note || "")} ${esc(r.created_by || "")}</td><td class="num">${r.kind === "adjust" ? `<button class="btn small ghost danger" data-v="del:${r.id}" type="button">Xoá</button>` : `<button class="btn small ghost" data-v="edit:${r.entry_date}|${r.amount}" type="button">Sửa</button>`}</td></tr>`).join("") || `<tr><td class="empty">Chưa có.</td></tr>`}</tbody></table></div>
      <form class="stack" style="margin-top:12px"><p class="small"><b>Nhập / sửa DT một ngày</b></p><div class="fields"><label>Ngày<input name="d" type="date" value="${vnToday()}" max="${vnToday()}"></label><label>DT QĐ<input name="a" type="number" step="any" min="0"></label></div>
        <p class="small"><b>Hoặc điều chỉnh lũy kế (+/−)</b></p><div class="fields"><label>Số điều chỉnh<input name="adj" type="number" step="any" placeholder="VD: -5 hoặc 12"></label><label>Lý do<input name="r" placeholder="Bắt buộc khi sửa / điều chỉnh"></label></div></form>
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button><button class="btn primary" data-v="submit">Lưu</button></div>`,
      { onOpen: (box) => box.addEventListener("click", (ev) => { const x = ev.target.closest('[data-v^="edit:"]'); if (!x) return; ev.stopPropagation(); const [d, a] = x.dataset.v.slice(5).split("|"); box.querySelector("[name=d]").value = d; box.querySelector("[name=a]").value = a; box.querySelector("[name=r]").focus(); }, true) });
    if (!v) return;
    try {
      if (typeof v === "string" && v.startsWith("del:")) { if (!(await confirmBox("Xoá điều chỉnh?", "Lũy kế sẽ được tính lại.", "Xoá", true))) return; await rpc("delete_revenue_adjust", { p_id: Number(v.slice(4)) }); toast("Đã xoá"); return revenue(el); }
      if (v.adj) { await rpc("adjust_revenue", { p_staff: s.id, p_date: v.d || vnToday(), p_delta: Number(v.adj), p_reason: v.r }); toast("Đã điều chỉnh lũy kế"); }
      if (v.a !== "") { await rpc("save_revenue", { p_staff: s.id, p_date: v.d, p_amount: Number(v.a), p_reason: v.r || null }); toast("Đã lưu DT ngày"); }
      revenue(el);
    } catch (x) { err(x); }
  };
}

// ---------- Phục vụ ----------
let period = "lastweek";
async function service(el) {
  const t = vnToday(), ws = weekStart(t);
  const opts = { lastweek: [addDays(ws, -7), addDays(ws, -1), "Tuần trước"], week: [ws, addDays(ws, 6), "Tuần này"], month: [month(), monthEnd(), `Cả tháng ${ym.slice(5)}`] };
  const [a, b] = opts[period];
  const rows = await q(sb.from("ratings").select("*").eq("period_start", a).eq("period_end", b));
  const all = await q(sb.from("ratings").select("*").gte("period_end", month()).lte("period_start", monthEnd()).order("period_start"));
  const by = new Map(rows.map((r) => [r.staff_id, r])), K = ["s5", "s4", "s3", "s2", "s1", "complaints"], L = { s5: "5★", s4: "4★", s3: "3★", s2: "2★", s1: "1★", complaints: "Khiếu nại" };
  el.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>🤝 Nhập đánh giá phục vụ</h2>
      <div class="seg" id="svP">${Object.entries(opts).map(([k, o]) => `<button type="button" data-p="${k}" class="${k === period ? "on" : ""}">${o[2]}</button>`).join("")}</div><button class="btn small primary" id="svSave" type="button">💾 Lưu</button></div>
    <p class="small muted">Kỳ ${dmy(a)} → ${dmy(b)}. Nhập số lượt đánh giá của từng nhân viên (thứ 2 hằng tuần hoặc cuối tháng). Điểm thô = 5★ − 4★×1 − 3★×2 − 2★×3 − 1★×4 − KN×5.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Nhân viên</th>${K.map((k) => `<th class="num">${L[k]}</th>`).join("")}<th class="num">Điểm thô</th><th>Nguồn</th></tr></thead><tbody>
    ${visibleStaff().map((s) => { const r = by.get(s.id) || {}; return `<tr data-sv="${esc(s.id)}"><td><b>${esc(s.name)}</b></td>${K.map((k) => `<td class="num"><input type="number" min="0" step="1" data-k="${k}" value="${r[k] ?? ""}" style="width:70px;text-align:right"></td>`).join("")}
      <td class="num"><b>${r.id ? fmt(r.s5 - r.s4 - 2 * r.s3 - 3 * r.s2 - 4 * r.s1 - 5 * r.complaints) : ""}</b></td><td class="small">${r.id ? (r.source === "QL" ? "Quản lý" : "NV tự nhập") : ""}</td></tr>`; }).join("")}
    </tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>Các kỳ đã nhập trong tháng</h3></div>${all.length ? `<div class="tbl-wrap"><table><tbody>${all.map((r) => `<tr><td>${esc(staffById(r.staff_id)?.name || r.staff_id)}</td><td>${dm(r.period_start)}–${dm(r.period_end)}</td><td class="small">5★ ${r.s5} · 4★ ${r.s4} · 3★ ${r.s3} · 2★ ${r.s2} · 1★ ${r.s1} · KN ${r.complaints}</td><td class="small muted">${r.source === "QL" ? "Quản lý" : "NV"}</td><td class="num"><button class="btn small ghost danger" data-del="${r.id}" type="button">Xoá</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có.</p>`}</div>`;
  $("#svP").onclick = (e) => { const x = e.target.closest("[data-p]"); if (x) { period = x.dataset.p; service(el); } };
  $("#svSave").onclick = async () => {
    try {
      let n = 0;
      for (const tr of $$("[data-sv]", el)) {
        const sid = tr.dataset.sv, r = by.get(sid), c = {}; let any = false;
        tr.querySelectorAll("[data-k]").forEach((i) => { c[i.dataset.k] = i.value === "" ? 0 : Number(i.value); if (i.value !== "") any = true; });
        if (!any && !r) continue;
        if (r && K.every((k) => r[k] === c[k])) continue;
        await rpc("save_rating", { p_staff: sid, p_start: a, p_end: b, p_counts: c }); n++;
      }
      toast(n ? `Đã lưu ${n} nhân viên` : "Không có thay đổi"); service(el);
    } catch (e) { err(e); }
  };
  el.onclick = async (e) => { const x = e.target.closest("[data-del]"); if (!x) return; if (!(await confirmBox("Xoá kỳ đánh giá?", "Điểm phục vụ sẽ tính lại.", "Xoá", true))) return; try { await rpc("delete_rating", { p_id: Number(x.dataset.del) }); toast("Đã xoá"); service(el); } catch (z) { err(z); } };
}

// ---------- Vi phạm ----------
async function violations(el) {
  const rows = await q(sb.from("violations").select("*").gte("v_date", month()).lte("v_date", monthEnd()).order("v_date", { ascending: false }));
  const types = Array.isArray(setting("VIOLATION_TYPES", [])) ? setting("VIOLATION_TYPES", []) : [];
  el.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>⚠️ Ghi lỗi / vi phạm</h2><span class="pill bad">Mỗi lỗi −${fmt(setting("VIOLATION_POINTS", 2))} điểm</span></div>
      <form id="vf" class="fields"><label>Nhân viên<select name="s">${visibleStaff().map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>Ngày<input name="d" type="date" value="${vnToday()}" max="${vnToday()}"></label><label>Loại lỗi<select name="t">${types.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label>
      <label>Ghi chú<input name="n" placeholder="Mô tả ngắn"></label><div style="align-self:end"><button class="btn primary" type="submit">Ghi lỗi</button></div></form></div>
    <div class="card"><div class="card-h"><h3>Vi phạm tháng ${ym.slice(5)} (${rows.length})</h3></div>${rows.length ? `<div class="tbl-wrap"><table><tbody>${rows.map((v) => `<tr><td>${dmy(v.v_date)}${v.v_time ? ` <span class="tiny muted">${esc(String(v.v_time).slice(0, 5))}</span>` : ""}</td><td><b>${esc(staffById(v.staff_id)?.name || v.staff_id)}</b></td><td>${esc(v.type)}${v.note ? `<div class="tiny muted">${esc(v.note)}</div>` : ""}${(v.photos || []).length ? `<div class="tiny">📷 ${v.photos.length} ảnh biên bản · xem ở CV → 📄 Biên bản</div>` : ""}</td><td class="num neg">−${fmt(v.points)}</td><td class="tiny muted">${esc(v.created_by || "")}</td><td class="num"><button class="btn small ghost danger" data-del="${v.id}" type="button">Xoá</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Không có vi phạm.</p>`}</div>`;
  $("#vf").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { const r = await rpc("add_violation", { p_staff: f.s, p_date: f.d, p_type: f.t, p_note: f.n }); toast(r.message); violations(el); } catch (x) { err(x); } };
  el.onclick = async (e) => {
    const x = e.target.closest("[data-del]"); if (!x) return;
    const v = await modal(`<h3>Xoá lỗi vi phạm?</h3><form><label>Lý do xoá<input name="r" required minlength="3"></label></form><div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn danger" data-v="submit">Xoá</button></div>`);
    if (!v) return;
    try {
      const r = await rpc("delete_violation", { p_id: Number(x.dataset.del), p_reason: v.r });
      const ids = (r?.photos || []).filter((t) => /^[\w-]{20,}$/.test(t));   // ảnh biên bản trên Drive → thùng rác
      if (ids.length) callFn("tasks", { mode: "delete", ids }).catch(() => {});
      toast("Đã xoá"); violations(el);
    } catch (z) { err(z); }
  };
}

// ---------- Sao & reset ----------
async function stars(el) {
  const adj = await q(sb.from("star_adjustments").select("*").order("created_at", { ascending: false }).limit(80));
  el.innerHTML = `<div class="grid2" style="margin-bottom:14px">
    <div class="card"><div class="card-h"><h2>➕ Cộng / trừ sao</h2></div><form id="sf" class="stack">
      <div class="row"><button class="btn small" type="button" data-all="1">Chọn tất cả</button><button class="btn small" type="button" data-all="0">Bỏ chọn</button></div>
      <div class="chips">${visibleStaff().map((s) => `<label class="chip inline"><input type="checkbox" class="sp" value="${esc(s.id)}"> ${esc(s.name)} <span class="tiny muted">${fmt(s.total_star)}⭐</span></label>`).join("")}</div>
      <div class="fields"><label>Số sao (âm để trừ)<input name="d" type="number" step="1" required placeholder="VD: 500 hoặc -200"></label><label>Lý do<input name="r" required minlength="3" placeholder="VD: Thưởng doanh số tuần"></label></div>
      <button class="btn primary" type="submit">Áp dụng</button></form></div>
    <div class="card"><div class="card-h"><h2>🔄 Reset</h2></div>
      ${isOwner() ? `<form id="rf" class="stack"><p class="small muted">Đưa <b>tổng sao</b> của nhân viên đang chọn bên trái (hoặc tất cả nếu không chọn ai) về cùng một mức — dùng khi bắt đầu kỳ thi đua mới. Có lưu lịch sử từng người.</p>
        <div class="fields"><label>Mức sao mới<input name="v" type="number" step="1" value="0" required></label><label>Lý do<input name="r" value="Reset kỳ mới tháng ${ym.slice(5)}/${ym.slice(0, 4)}"></label></div><button class="btn danger" type="submit">Reset tổng sao</button></form><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">` : ""}
      <p class="small muted">Reset <b>chuỗi chưa về</b> (tính lại từ hôm nay) cho nhân viên đang chọn, hoặc tất cả nếu không chọn ai.</p><button class="btn" id="rsk" type="button">↺ Reset chuỗi</button></div></div>
    <div class="card"><div class="card-h"><h3>Lịch sử điều chỉnh sao</h3></div>${adj.length ? `<div class="tbl-wrap"><table><tbody>${adj.map((a) => `<tr><td class="small">${new Date(a.created_at).toLocaleString("vi-VN")}</td><td><b>${esc(staffById(a.staff_id)?.name || a.staff_id)}</b></td><td class="num ${a.delta >= 0 ? "pos" : "neg"}">${sign(a.delta)}⭐</td><td>${a.kind === "reset" ? '<span class="pill warn">Reset</span> ' : ""}${esc(a.reason)}</td><td class="tiny muted">${esc(a.created_by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có.</p>`}</div>`;
  const picked = () => $$(".sp:checked", el).map((c) => c.value);
  el.querySelectorAll("[data-all]").forEach((b) => b.onclick = () => $$(".sp", el).forEach((c) => c.checked = b.dataset.all === "1"));
  $("#sf").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const ids = picked(); if (!ids.length) return toast("Chọn nhân viên");
    try { const r = await rpc("adjust_stars", { p_staffs: ids, p_delta: Number(f.d), p_reason: f.r }); toast(r.message); await loadStaff(); stars(el); } catch (x) { err(x); } };
  $("#rf")?.addEventListener("submit", async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const ids = picked().length ? picked() : visibleStaff().map((s) => s.id);
    if (!(await confirmBox("Reset tổng sao?", `Đưa tổng sao của <b>${ids.length}</b> nhân viên về <b>${fmt(Number(f.v))}⭐</b>. Lịch sử báo cáo vẫn giữ nguyên.`, "Reset", true))) return;
    try { const r = await rpc("reset_stars", { p_staffs: ids, p_value: Number(f.v), p_reason: f.r }); toast(r.message); await loadStaff(); stars(el); } catch (x) { err(x); } });
  $("#rsk").onclick = async () => { const ids = picked().length ? picked() : visibleStaff().map((s) => s.id);
    if (!(await confirmBox("Reset chuỗi?", `Chuỗi chưa về của <b>${ids.length}</b> nhân viên sẽ tính lại từ hôm nay.`, "Reset"))) return;
    try { const r = await rpc("reset_streaks", { p_staffs: ids }); toast(r.message); } catch (x) { err(x); } };
}

// ---------- Lịch sử ----------
async function log(el) {
  const rows = await q(sb.from("score_log").select("*").gte("at", month() + "T00:00:00+07:00").lte("at", monthEnd() + "T23:59:59+07:00").order("at", { ascending: false }).limit(500));
  const K = { cumulative: "Lũy kế tuần", revenue: "Doanh thu", target: "Target", rating: "Phục vụ", violation: "Vi phạm", star: "Sao", streak: "Chuỗi" };
  el.innerHTML = `<div class="card"><div class="card-h"><h2>🧾 Lịch sử điều chỉnh tháng ${ym.slice(5)}</h2><select id="lgK" style="width:auto"><option value="">Tất cả</option>${Object.entries(K).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
    <div class="tbl-wrap"><table><thead><tr><th>Thời gian</th><th>Người làm</th><th>Nhân viên</th><th>Mục</th><th>Chi tiết</th><th>Lý do</th></tr></thead><tbody id="lgB"></tbody></table></div></div>`;
  const draw = () => { const k = $("#lgK").value; $("#lgB").innerHTML = rows.filter((r) => !k || r.kind === k).map((r) => `<tr><td class="small">${new Date(r.at).toLocaleString("vi-VN")}</td><td class="small">${esc(r.actor || "")}</td><td>${esc(staffById(r.staff_id)?.name || r.staff_id || "")}</td><td>${K[r.kind] || esc(r.kind)} · ${esc(r.action)}</td><td class="tiny muted">${esc(JSON.stringify(r.detail))}</td><td class="small">${esc(r.reason || "")}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Chưa có.</td></tr>`; };
  $("#lgK").onchange = draw; draw();
}
