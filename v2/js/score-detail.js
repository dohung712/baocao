// Chi tiết điểm của 1 NV (bảng xếp hạng C10): điểm đến từ đâu — dùng ở trang Xếp hạng và mục 🏅 của trang Hôm nay.
// NV xem đồng đội: thấy DT, từng môn khi cài đặt SCORE_SEE_ALL = 'detail' (máy chủ quyết định, không có số thì báo).
import { esc, fmt, modal, dmy, dm } from "./ui.js";
import { sb, S, setting } from "./store.js";

export async function scoreDetail(rows, sid, { from, to, full = false } = {}) {
  const r = rows.find((x) => x.staff_id === sid); if (!r) return;
  const W = { r: Number(setting("W_REVENUE", 40)), c: Number(setting("W_CONTEST", 40)), s: Number(setting("W_SERVICE", 20)) }, unit = setting("REVENUE_UNIT", "");
  const d = { s4: 1, s3: 2, s2: 3, s1: 4, complaints: 5, ...(setting("RATING_DEDUCT", {}) || {}) };
  const has = r.revenue != null, top = Math.max(0, ...rows.map((x) => Number(x.service_raw) || 0));
  let vio = [];
  if (r.violations) { const { data } = await sb.from("violations").select("v_date,type,points,note").eq("staff_id", sid).gte("v_date", from).lte("v_date", to).order("v_date"); vio = data || []; }
  const pct = (x) => `${fmt(Math.min(100, x || 0), 0)}%`;
  const sec = (icon, title, score, max, body) => `<div class="sc-sec"><div class="row" style="justify-content:space-between"><b>${icon} ${title}</b><b class="star">${score < 0 ? "−" + fmt(-score, 2) : fmt(score, 2)}${max ? `<span class="small muted">/${fmt(max)}</span>` : ""}</b></div>${body}</div>`;
  const rev = has
    ? (r.revenue_target ? `<p class="small">Lũy kế <b>${fmt(r.revenue, 2)}</b> ÷ target ${full ? "tháng" : "tiến độ"} <b>${fmt(r.revenue_target, 2)}</b> ${esc(unit)} = <b>${fmt(r.rev_pct, 1)}%</b> → ${pct(r.rev_pct)} × ${fmt(W.r)}</p>` : `<p class="small neg">Chưa có target doanh thu tháng.</p>`)
    : `<p class="small muted">Số liệu doanh thu chỉ người đó và quản lý xem được.</p>`;
  const items = [...(r.items_detail || [])].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const con = !r.items_total ? `<p class="small neg">Chưa được giao môn thi đua tháng.</p>`
    : (items.length ? `<div class="sd-items">${items.map((i) => { const p = Number(i.pct) || 0; return `<div class="sd-item"><span>${esc(i.name)}</span><div class="bar ${p >= 100 ? "" : p >= 70 ? "mid" : "low"}"><i style="width:${Math.min(100, p)}%"></i></div><b class="${p >= 100 ? "pos" : ""}">${fmt(p)}%</b><small class="muted">${fmt(i.actual, 2)} / ${fmt(i.target, 2)}</small></div>`; }).join("")}</div>` : "")
      + `<p class="small">Trung bình % hoàn thành (mỗi môn tối đa 100%): <b>${fmt(r.items_done, 2)}/${r.items_total}</b> môn = ${pct((r.items_done / r.items_total) * 100)} × ${fmt(W.c)}</p>`;
  const svc = `<p class="small">5★ <b>${r.s5}</b>${r.s4 ? ` − 4★ ${r.s4}×${d.s4}` : ""}${r.s3 ? ` − 3★ ${r.s3}×${d.s3}` : ""}${r.s2 ? ` − 2★ ${r.s2}×${d.s2}` : ""}${r.s1 ? ` − 1★ ${r.s1}×${d.s1}` : ""}${r.complaints ? ` − KN ${r.complaints}×${d.complaints}` : ""} = <b>${fmt(r.service_raw)}</b> điểm thô.<br>
    Cao nhất siêu thị: <b>${fmt(top)}</b> → ${top > 0 ? `${fmt(Math.max(0, r.service_raw))} ÷ ${fmt(top)} × ${fmt(W.s)}` : "chưa có đánh giá"}</p>`;
  const vp = r.violations ? `<p class="small">${r.violations} lỗi × ${fmt(setting("VIOLATION_POINTS", 2))} điểm</p>${vio.length ? `<ul class="small" style="margin:0;padding-left:18px">${vio.map((v) => `<li>${dm(v.v_date)}: ${esc(v.type)}${v.note ? ` <span class="muted">(${esc(v.note)})</span>` : ""}</li>`).join("")}</ul>` : ""}` : `<p class="small muted">Không có vi phạm ✅</p>`;
  const v = await modal(`<h3>${esc(r.name)} · hạng ${r.rank}/${rows.length}</h3>
    <p class="small muted" style="margin:-4px 0 10px">${esc(r.dept || "")} · ${dmy(from)} → ${dmy(to)} · ${full ? "so target cả tháng" : "so tiến độ (target chia theo số ngày đã qua)"}</p>
    <div class="sc-total">${fmt(r.rev_score, 1)} <small>DT</small> + ${fmt(r.contest_score, 1)} <small>TĐ</small> + ${fmt(r.service_score, 1)} <small>PV</small>${Number(r.violation_points) ? ` − ${fmt(r.violation_points)} <small>VP</small>` : ""} = <b class="star">${fmt(r.total, 1)}</b></div>
    ${sec("💰", "Doanh thu QĐ", r.rev_score, W.r, rev)}${sec("📋", "Thi đua", r.contest_score, W.c, con)}${sec("🤝", "Phục vụ", r.service_score, W.s, svc)}${sec("⚠️", "Vi phạm", -Number(r.violation_points || 0), 0, vp)}
    <div class="modal-actions">${sid === S.me?.staff_id ? `<button class="btn" data-v="me" type="button">👤 Xem trang Của tôi</button>` : ""}<button class="btn primary" data-v="ok">Đóng</button></div>`);
  if (v === "me") document.querySelector('#nav [data-page="me"]')?.click();
}
