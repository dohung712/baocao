// Trang Của tôi: nhân viên xem lại toàn bộ số liệu thi đua của mình (quản lý chọn được nhân viên)
import { $, $$, esc, fmt, sign, starHtml, toast, modal, vnToday, addDays, weekStart, monthStart, dmy, dm, dow, shiftMonth, monthLabel, initials } from "../ui.js";
import { sb, S, rpc, onChange, isManager, visibleStaff, staffById, setting, errMsg, isHidden } from "../store.js";

let st;
export async function render(view) {
  const sid = S.me.staff_id && staffById(S.me.staff_id) ? S.me.staff_id : isManager() ? visibleStaff()[0]?.id : null;
  if (!sid) { view.innerHTML = `<div class="banner warn"><div><b>Tài khoản chưa gắn mã nhân viên</b>Nhờ chủ quản gắn mã NV trong Quản lý → Phân quyền.</div></div>`; return; }
  st = { sid, ym: vnToday().slice(0, 7) };
  view.innerHTML = `<div class="page-h"><div><h1>Của tôi</h1><p>Sao, điểm xếp hạng, doanh thu, môn thi đua, phục vụ, vi phạm và lịch sử điều chỉnh</p></div>
    <div class="row">${isManager() ? `<select id="meStaff" style="width:auto">${visibleStaff().map((s) => `<option value="${esc(s.id)}" ${s.id === sid ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
      <button class="btn small" data-mm="-1" type="button">‹</button><b id="meMonth"></b><button class="btn small" data-mm="1" type="button">›</button></div></div>
    <div id="meBody"></div>`;
  $("#meStaff")?.addEventListener("change", (e) => { st.sid = e.target.value; load(); });
  view.querySelectorAll("[data-mm]").forEach((b) => b.onclick = () => { st.ym = shiftMonth(st.ym, Number(b.dataset.mm)); load(); });
  await load();
  const off = onChange((w) => { if (["score", "results", "staff", "cv"].includes(w) && $("#meBody")) load(true); });
  return () => off();
}

async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
async function load(quiet = false) {
  const body = $("#meBody"); if (!body) return;
  if (!quiet) body.innerHTML = `<div class="empty">Đang tải…</div>`;
  const today = vnToday(), from = st.ym + "-01", endM = addDays(shiftMonth(st.ym, 1) + "-01", -1), to = endM < today ? endM : today;
  $("#meMonth").textContent = monthLabel(st.ym);
  try {
    const [board, form, res, rev, tgt, rat, vio, adj, tt, props, logs] = await Promise.all([
      rpc("score_board", { p_from: from, p_to: to, p_full: false }),
      rpc("report_form", { p_staff: st.sid, p_date: addDays(today, 1) }),
      q(sb.from("daily_results").select("report_date,item_name,actual,rate_pct,star_change,status,compensation").eq("staff_id", st.sid).gte("report_date", from).lte("report_date", endM).order("report_date", { ascending: false })),
      q(sb.from("revenue_entries").select("*").eq("staff_id", st.sid).gte("entry_date", from).lte("entry_date", endM).order("entry_date", { ascending: false })),
      q(sb.from("monthly_targets").select("*").eq("staff_id", st.sid).eq("month", from)),
      q(sb.from("ratings").select("*").eq("staff_id", st.sid).gte("period_end", from).lte("period_start", endM).order("period_start", { ascending: false })),
      q(sb.from("violations").select("*").eq("staff_id", st.sid).gte("v_date", from).lte("v_date", endM).order("v_date", { ascending: false })),
      q(sb.from("star_adjustments").select("*").eq("staff_id", st.sid).order("created_at", { ascending: false }).limit(50)),
      q(sb.from("tiktok_submissions").select("due,status,reward,submit_date").eq("staff_id", st.sid).gte("due", from).lte("due", endM)),
      q(sb.from("extra_proposals").select("report_date,content,stars,status").eq("staff_id", st.sid).gte("report_date", from).lte("report_date", endM)),
      q(sb.from("score_log").select("*").eq("staff_id", st.sid).order("at", { ascending: false }).limit(60)),
    ]);
    const me = board.find((r) => r.staff_id === st.sid) || null, s = staffById(st.sid) || {}, unit = setting("REVENUE_UNIT", "");
    const days = [...new Set(res.map((r) => r.report_date))];
    const items = res.filter((r) => r.status === "Về số" || r.status === "Chưa về"), ok = items.filter((r) => r.status === "Về số").length;
    const monthStar = res.reduce((a, r) => a + r.star_change, 0) + tt.reduce((a, t) => a + t.reward, 0) + props.filter((p) => p.status === "Đã duyệt").reduce((a, p) => a + p.stars, 0)
      + adj.filter((a) => a.created_at.slice(0, 7) === st.ym).reduce((x, a) => x + a.delta, 0);
    const daily = rev.filter((r) => r.kind === "daily"), adjR = rev.filter((r) => r.kind === "adjust");
    body.innerHTML = `
      <div class="card staff-card" style="margin-bottom:14px"><div class="avatar">${esc(initials(s.name))}</div><div class="who"><b>${esc(s.name)}</b><span class="muted small">${esc(s.dept || "")} · mã ${esc(st.sid)}</span></div>
        <div class="kpis"><div><small>Tổng sao</small><b class="star">${fmt(form.total_star)}⭐</b></div><div><small>Sao tháng</small><b class="${monthStar >= 0 ? "pos" : "neg"}">${sign(monthStar)}</b></div>
        ${me ? `<div><small>Điểm xếp hạng</small><b>${fmt(me.total, 1)}</b></div><div><small>Hạng</small><b>${me.rank}${board.length > 1 ? "/" + board.length : ""}</b></div>` : ""}</div></div>
      ${me ? `<div class="stats"><div class="stat"><small>Doanh thu QĐ (${esc(unit)})</small><b>${fmt(me.revenue, 1)}</b><span class="tiny muted">${me.revenue_target != null ? `target tiến độ ${fmt(me.revenue_target, 1)} · ${fmt(me.rev_pct)}%` : "chưa có target"}</span></div>
        <div class="stat"><small>Điểm DT</small><b>${fmt(me.rev_score, 1)}<span class="small muted">/${fmt(setting("W_REVENUE", 40))}</span></b></div>
        <div class="stat"><small>Điểm thi đua</small><b>${fmt(me.contest_score, 1)}<span class="small muted">/${fmt(setting("W_CONTEST", 40))}</span></b><span class="tiny muted">${fmt(me.items_done, 2)}/${me.items_total} môn</span></div>
        <div class="stat"><small>Điểm phục vụ</small><b>${fmt(me.service_score, 1)}<span class="small muted">/${fmt(setting("W_SERVICE", 20))}</span></b><span class="tiny muted">5★ ${me.s5}${me.complaints ? ` · KN ${me.complaints}` : ""}</span></div>
        <div class="stat"><small>Vi phạm</small><b class="${me.violations ? "neg" : ""}">${me.violations ? `${me.violations} (−${fmt(me.violation_points)})` : "0"}</b></div></div>` : ""}
      <div class="grid2">
        ${isHidden("report.revenue") ? "" : `<div class="card"><div class="card-h"><h3>💰 Doanh thu QĐ tháng</h3><button class="btn small" id="meRevAdd" type="button">+ Nhập DT ngày</button></div>
          ${daily.length || adjR.length ? `<div class="tbl-wrap"><table><tbody>${daily.map((r) => `<tr><td>${dow(r.entry_date)} ${dmy(r.entry_date)}</td><td class="num"><b>${fmt(r.amount, 2)}</b></td><td class="num"><button class="btn small ghost" data-rev="${r.entry_date}|${r.amount}" type="button">Sửa</button></td></tr>`).join("")}
            ${adjR.map((r) => `<tr><td>${dmy(r.entry_date)} <span class="pill info">Điều chỉnh</span></td><td class="num ${r.amount >= 0 ? "pos" : "neg"}">${r.amount > 0 ? "+" : ""}${fmt(r.amount, 2)}</td><td class="small muted">${esc(r.note || "")} · ${esc(r.created_by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa nhập doanh thu tháng này.</p>`}
          ${tgt[0]?.revenue_target != null ? `<p class="small muted">Target tháng: <b>${fmt(tgt[0].revenue_target, 1)}</b> ${esc(unit)}</p>` : ""}</div>`}
        <div class="card"><div class="card-h"><h3>📋 Môn thi đua tháng</h3></div>
          ${me?.items_detail?.length ? `<div class="tbl-wrap"><table><thead><tr><th>Môn</th><th class="num">Lũy kế</th><th class="num">Target tiến độ</th><th class="num">%</th></tr></thead><tbody>${me.items_detail.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${fmt(i.actual, 2)}</td><td class="num">${fmt(i.target, 2)}</td><td class="num ${i.pct >= 100 ? "pos" : ""}"><b>${fmt(i.pct)}%</b></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Quản lý chưa giao môn thi đua tháng.</p>`}
          <p class="small" style="margin:10px 0 4px"><b>Chuỗi chưa về hiện tại:</b> ${form.items.filter((i) => i.streak > 0).map((i) => `${esc(i.name)} <b class="${i.streak >= 3 ? "neg" : ""}">${i.streak}</b>`).join(" · ") || "không có ✅"}</p>
          <p class="small muted" style="margin:0">Tháng này: ${days.length} ngày báo cáo · về số ${items.length ? Math.round(ok * 100 / items.length) : 0}% (${ok}/${items.length})</p></div>
        <div class="card"><div class="card-h"><h3>🤝 Đánh giá phục vụ</h3><button class="btn small" id="meRate" type="button">+ Tự nhập</button></div>
          ${rat.length ? `<div class="tbl-wrap"><table><thead><tr><th>Kỳ</th><th class="num">5★</th><th class="num">4★</th><th class="num">3★</th><th class="num">2★</th><th class="num">1★</th><th class="num">KN</th><th>Nguồn</th></tr></thead><tbody>${rat.map((r) => `<tr><td>${dm(r.period_start)}–${dm(r.period_end)}</td><td class="num">${r.s5}</td><td class="num">${r.s4}</td><td class="num">${r.s3}</td><td class="num">${r.s2}</td><td class="num">${r.s1}</td><td class="num">${r.complaints}</td><td class="small">${r.source === "QL" ? "Quản lý" : "Tự nhập"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có đánh giá kỳ này.</p>`}</div>
        <div class="card"><div class="card-h"><h3>⚠️ Vi phạm</h3></div>
          ${vio.length ? `<div class="tbl-wrap"><table><tbody>${vio.map((v) => `<tr><td>${dmy(v.v_date)}</td><td>${esc(v.type)}${v.note ? `<div class="tiny muted">${esc(v.note)}</div>` : ""}</td><td class="num neg">−${fmt(v.points)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Không có vi phạm ✅</p>`}</div>
      </div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>⭐ Lịch sử sao tháng</h3></div>
        <div class="tbl-wrap"><table><tbody>${starTimeline(res, tt, props, adj.filter((a) => a.created_at.slice(0, 7) === st.ym)).map((x) => `<tr><td>${x.d ? dow(x.d) + " " + dmy(x.d) : ""}</td><td>${x.label}</td><td class="num">${starHtml(x.v)}</td></tr>`).join("") || `<tr><td class="empty">Chưa có biến động.</td></tr>`}</tbody></table></div></div>
      <div class="card" style="margin-top:14px"><div class="card-h"><h3>🧾 Lịch sử điều chỉnh</h3></div>
        ${logs.length ? `<div class="tbl-wrap"><table><tbody>${logs.map((l) => `<tr><td class="small">${new Date(l.at).toLocaleString("vi-VN")}</td><td class="small">${esc(l.actor || "")}</td><td>${logLabel(l)}</td><td class="small muted">${esc(l.reason || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Chưa có điều chỉnh.</p>`}</div>`;
    $("#meRevAdd")?.addEventListener("click", () => editRevenue(today, ""));
    body.querySelectorAll("[data-rev]").forEach((b) => b.onclick = () => { const [d, v] = b.dataset.rev.split("|"); editRevenue(d, v); });
    $("#meRate").onclick = rateSelf;
  } catch (e) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}

function starTimeline(res, tt, props, adj) {
  const by = new Map();
  for (const r of res) { const x = by.get(r.report_date) || { d: r.report_date, v: 0, n: 0, late: 0, tk: 0 }; x.v += r.star_change; x.n++; if (r.compensation === "PHAT_TRE") x.late += r.star_change; if (r.compensation === "TIKTOK_PHAT") x.tk += r.star_change; by.set(r.report_date, x); }
  const out = [...by.values()].map((x) => ({ d: x.d, v: x.v, label: `Báo cáo ca ngày${x.late ? ` (gồm phạt trễ ${sign(x.late)})` : ""}${x.tk ? ` (gồm phạt TikTok ${sign(x.tk)})` : ""}` }));
  tt.filter((t) => t.reward).forEach((t) => out.push({ d: t.submit_date, v: t.reward, label: `Thưởng TikTok đúng hạn kỳ ${dm(t.due)}` }));
  props.filter((p) => p.status === "Đã duyệt").forEach((p) => out.push({ d: p.report_date, v: p.stars, label: `Bán thêm: ${esc(p.content)}` }));
  adj.forEach((a) => out.push({ d: a.created_at.slice(0, 10), v: a.delta, label: `${a.kind === "reset" ? "Reset kỳ" : "Quản lý điều chỉnh"}: ${esc(a.reason)}` }));
  return out.sort((a, b) => b.d.localeCompare(a.d));
}
function logLabel(l) {
  const d = l.detail || {};
  const map = {
    "revenue:enter": `Nhập DT ${dmy(d.date)}: ${fmt(d.to, 2)}`, "revenue:edit": `Sửa DT ${dmy(d.date)}: ${fmt(d.from, 2)} → ${fmt(d.to, 2)}`,
    "revenue:adjust": `Điều chỉnh lũy kế DT ${d.delta > 0 ? "+" : ""}${fmt(d.delta, 2)}`, "revenue:delete_adjust": `Xoá điều chỉnh DT ${fmt(d.delta, 2)}`,
    "target:save": `Đặt target tháng ${d.month ? dm(d.month).slice(3) : ""}: DT ${d.revenue_to ?? "—"}, ${(d.items || []).length} môn`,
    "rating:enter": "Nhập đánh giá phục vụ", "rating:edit": "Sửa đánh giá phục vụ", "rating:delete": "Xoá đánh giá phục vụ",
    "violation:add": `Ghi lỗi: ${esc(d.type)} (−${d.points})`, "violation:delete": `Xoá lỗi: ${esc(d.type)}`,
    "star:adjust": `Điều chỉnh sao ${sign(d.delta)}`, "star:reset": `Reset sao ${fmt(d.from)} → ${fmt(d.to)}`, "star:set_total": `Chỉnh tổng sao ${fmt(d.from)} → ${fmt(d.to)}`, "streak:reset": "Reset chuỗi",
  };
  return map[l.kind + ":" + l.action] || esc(l.kind + " " + l.action);
}

async function editRevenue(date, val) {
  const v = await modal(`<h3>Doanh thu quy đổi</h3><form class="stack"><div class="fields"><label>Ngày<input name="d" type="date" max="${vnToday()}" value="${date}" required></label>
    <label>DT QĐ (${esc(setting("REVENUE_UNIT", ""))})<input name="a" type="number" step="any" min="0" value="${esc(val)}" required></label></div>
    ${isManager() ? `<label>Lý do (khi sửa)<input name="r" placeholder="VD: nhập nhầm"></label>` : ""}</form>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
  if (!v) return;
  try { await rpc("save_revenue", { p_staff: st.sid, p_date: v.d, p_amount: Number(v.a), p_reason: v.r || null }); toast("Đã lưu doanh thu"); load(true); } catch (e) { toast(errMsg(e), 4000); }
}
async function rateSelf() {
  const t = vnToday(), ws = weekStart(t), lastWs = addDays(ws, -7);
  const v = await modal(`<h3>Nhập đánh giá phục vụ</h3><p class="small muted">Nhập số lượt đánh giá khách hàng theo kỳ. Kỳ quản lý đã nhập thì không sửa được. Khiếu nại do quản lý ghi nhận.</p>
    <form class="stack"><label>Kỳ<select name="p"><option value="${lastWs}|${addDays(lastWs, 6)}">Tuần trước (${dm(lastWs)}–${dm(addDays(lastWs, 6))})</option><option value="${ws}|${addDays(ws, 6)}">Tuần này (${dm(ws)}–${dm(addDays(ws, 6))})</option><option value="${monthStart(t)}|${addDays(shiftMonth(t.slice(0, 7), 1) + "-01", -1)}">Cả tháng ${t.slice(5, 7)}</option></select></label>
    <div class="fields">${["s5", "s4", "s3", "s2", "s1"].map((k) => `<label>${k.slice(1)}★<input name="${k}" type="number" min="0" step="1" value="0"></label>`).join("")}</div></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
  if (!v) return;
  const [a, b] = v.p.split("|");
  try { await rpc("save_rating", { p_staff: st.sid, p_start: a, p_end: b, p_counts: { s5: +v.s5, s4: +v.s4, s3: +v.s3, s2: +v.s2, s1: +v.s1 } }); toast("Đã lưu đánh giá"); load(true); } catch (e) { toast(errMsg(e), 4000); }
}
