// B16d Phân tích NV từ thẻ BI: đang tập trung gì · hiệu quả khai thác · thi đua · trả chậm · tăng giảm (so tháng trước, TB 3 tháng, lần đọc trước).
// Số so sánh "TB" = trung bình nhóm in trên thẻ BI. NV chỉ xem được thẻ của mình (RLS bi_files), QL xem mọi NV.
import { esc, fmt, modal, dm } from "./ui.js";
import { sb, staffById } from "./store.js";

const n = (x) => (x === null || x === undefined || x === "" || isNaN(Number(x)) ? null : Number(x));
const f1 = (x) => (x === null ? "—" : fmt(x, Math.abs(x) >= 100 ? 0 : 1));
const pc = (x) => (x === null ? "—" : fmt(x, 0) + "%");
const sign = (x, unit = "") => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${f1(Math.abs(x))}${unit}`);
const cls = (x) => (x === null ? "" : x >= 0 ? "pos" : "neg");
const vs = (v, avg) => (n(v) !== null && n(avg) ? ((n(v) - n(avg)) * 100) / n(avg) : null);   // % so với TB
const upd = (iso) => { if (!iso) return ""; const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute} ${p.day}/${p.month}`; };
const isInst = (name) => /trả\s*chậm|tra\s*cham|trả\s*góp|homecredit|fe\s*credit|fecredit|home\s*credit|shinhan|mcredit|samsung\s*f\+|kredivo|hd\s*saison/i.test(name || "");

// Tính mọi chỉ số + nhận định từ 1 thẻ (cur) và thẻ đọc trước đó (prev, có thể null)
export function analyze(cur, prev) {
  const d = cur?.data || {}, s = d.staff || {};
  const el = n(d.days_elapsed), tot = n(d.days_total), dt = n(s.revenue_qd), mt = n(s.revenue_target);
  const fc = dt !== null && el && tot ? (dt / el) * tot : null, left = el && tot ? Math.max(0, tot - el) : null;
  const gap = mt !== null && dt !== null ? Math.max(0, mt - dt) : null;
  // Tháng: cột DT QĐ từng tháng; tháng hiện tại so theo TỐC ĐỘ (dự kiến cả tháng) với tháng trước & TB 3 tháng trước
  const mon = [...(d.monthly || [])].filter((x) => n(x.value) !== null && /^\d{4}-\d{2}$/.test(String(x.month || ""))).sort((a, b) => (a.month < b.month ? -1 : 1));
  const curM = d.month || (cur?.data_through || "").slice(0, 7);
  const before = mon.filter((x) => x.month < curM), lastM = before[before.length - 1] || null;
  const avg3 = before.length ? before.slice(-3).reduce((a, x) => a + Number(x.value), 0) / before.slice(-3).length : null;
  const vsLast = fc !== null && lastM ? ((fc - Number(lastM.value)) * 100) / Number(lastM.value) : null;
  const vs3 = fc !== null && avg3 ? ((fc - avg3) * 100) / avg3 : null;
  const mix = [...(d.category_mix || [])].filter((x) => n(x.pct) !== null).sort((a, b) => b.pct - a.pct);
  const eff = [...(d.efficiency || [])].map((x) => ({ name: String(x.name || "").replace(/^%\s*/, ""), pct: n(x.pct) }));
  const effStrong = eff.filter((x) => x.pct !== null && x.pct >= 100).sort((a, b) => b.pct - a.pct);
  const effWeak = eff.filter((x) => x.pct !== null && x.pct < 50).sort((a, b) => a.pct - b.pct);
  const progs = [...(d.programs || [])].filter((x) => n(x.pct) !== null).map((x) => ({ name: x.name, pct: Number(x.pct) })).sort((a, b) => b.pct - a.pct);
  const near = progs.filter((x) => x.pct >= 70 && x.pct < 100), push = progs.filter((x) => x.pct < 100).slice(0, 3);
  const instProgs = progs.filter((x) => isInst(x.name)), instNoData = (d.nodata_programs || []).filter(isInst);
  // So với lần đọc trước (thẻ cũ hơn của cùng NV)
  let delta = null;
  if (prev?.data?.staff) {
    const ps = prev.data.staff, pd = prev.data_through, days = pd && cur.data_through ? Math.round((Date.parse(cur.data_through) - Date.parse(pd)) / 864e5) : null;
    const pp = new Map((prev.data.programs || []).map((x) => [String(x.name), n(x.pct)]));
    const moves = progs.map((x) => ({ name: x.name, d: pp.get(String(x.name)) !== undefined && pp.get(String(x.name)) !== null ? x.pct - pp.get(String(x.name)) : null })).filter((x) => x.d !== null && x.d !== 0).sort((a, b) => b.d - a.d);
    const sameMonth = (prev.data.month || pd?.slice(0, 7)) === curM;
    delta = { from: pd, days, sameMonth, dt: sameMonth && n(ps.revenue_qd) !== null && dt !== null ? dt - n(ps.revenue_qd) : null,
      contest: n(ps.contest_pct) !== null && n(s.contest_pct) !== null ? n(s.contest_pct) - n(ps.contest_pct) : null,
      target: n(ps.pct_target) !== null && n(s.pct_target) !== null ? n(s.pct_target) - n(ps.pct_target) : null,
      up: moves.filter((x) => x.d > 0).slice(0, 3), down: moves.filter((x) => x.d < 0).slice(-3).reverse() };
  }
  // Nhận định (ngắn, dễ hành động)
  const say = [];
  const dtVs = vs(dt, s.revenue_avg), tgVs = n(s.pct_target) !== null && n(s.pct_target_avg) !== null ? n(s.pct_target) - n(s.pct_target_avg) : null;
  if (dt !== null) say.push({ lv: dtVs === null ? "info" : dtVs >= 0 ? "ok" : "bad", t: `💰 DT QĐ ${f1(dt)} tr${dtVs !== null ? ` — ${dtVs >= 0 ? "cao hơn" : "thấp hơn"} TB nhóm ${f1(Math.abs(dtVs))}%` : ""}${mt ? ` · % target ${pc(n(s.pct_target))}${tgVs !== null ? ` (TB ${pc(n(s.pct_target_avg))})` : ""}` : ""}${gap ? ` · còn thiếu ${f1(gap)} tr → cần ${f1(gap / Math.max(1, left || 1))} tr/ngày` : mt ? " · ✅ đã đạt MT" : ""}` });
  if (vsLast !== null || vs3 !== null) say.push({ lv: (vsLast ?? vs3) >= 0 ? "ok" : "bad", t: `📈 Tốc độ tháng này (dự kiến ${f1(fc)} tr) ${vsLast !== null ? `${vsLast >= 0 ? "tăng" : "giảm"} ${f1(Math.abs(vsLast))}% so với tháng trước (${f1(Number(lastM.value))} tr)` : ""}${vs3 !== null ? `${vsLast !== null ? ", " : ""}${vs3 >= 0 ? "cao hơn" : "thấp hơn"} TB 3 tháng ${f1(Math.abs(vs3))}%` : ""}` });
  if (mix.length) {
    const weakCat = mix.filter((x) => x.pct < 5).map((x) => x.name);
    say.push({ lv: mix[0].pct >= 70 ? "warn" : "info", t: `🧭 Đang tập trung: ${esc(mix[0].name)} ${pc(mix[0].pct)}${mix[1] ? `, ${esc(mix[1].name)} ${pc(mix[1].pct)}` : ""}${mix[0].pct >= 70 ? " — quá dồn 1 ngành hàng" : ""}${weakCat.length ? ` · còn yếu: ${weakCat.map(esc).join(", ")}` : ""}` });
  }
  if (eff.length) say.push({ lv: effStrong.length >= effWeak.length ? "ok" : "warn", t: `⚡ Hiệu quả khai thác (100% = TB): mạnh ${effStrong.length ? effStrong.slice(0, 3).map((x) => `${esc(x.name)} ${pc(x.pct)}`).join(", ") : "chưa có mục nào ≥ TB"}${effWeak.length ? ` · yếu ${effWeak.slice(0, 4).map((x) => `${esc(x.name)} ${pc(x.pct)}`).join(", ")}` : ""}` });
  if (n(s.contest_pct) !== null || progs.length) {
    const cAvg = n(s.contest_store_avg);
    say.push({ lv: n(s.contest_pct) !== null && cAvg !== null ? (n(s.contest_pct) >= cAvg ? "ok" : "bad") : "info", t: `🏁 Thi đua ${pc(n(s.contest_pct))}${cAvg !== null ? ` (TB siêu thị ${pc(cAvg)})` : ""}${s.contest_total ? ` · đạt ${s.contest_passed ?? 0}/${s.contest_total}` : ""}${near.length ? ` · sát nút: ${near.map((x) => `${esc(x.name)} ${pc(x.pct)}`).join(", ")}` : ""}${push.length && !near.length ? ` · gần nhất: ${push.map((x) => `${esc(x.name)} ${pc(x.pct)}`).join(", ")}` : ""}${n(s.contest_nodata) ? ` · ${s.contest_nodata} môn chưa có số` : ""}` });
  }
  { const ip = n(s.installment_pct), ia = n(s.installment_avg);
    const focus = instProgs.length ? instProgs.map((x) => `${esc(x.name)} ${pc(x.pct)}`).join(", ") : "";
    if (ip !== null || instProgs.length || instNoData.length)
      say.push({ lv: ip !== null && ia !== null ? (ip >= ia ? "ok" : "bad") : instProgs.some((x) => x.pct >= 70) ? "ok" : instNoData.length ? "bad" : "info",
        t: `💳 Trả chậm: ${ip !== null ? `tỷ trọng ${pc(ip)}${ia !== null ? ` (TB ${pc(ia)})` : ""}` : "chưa có tỷ trọng trên thẻ"}${focus ? ` · thi đua: ${focus}` : ""}${instNoData.length ? ` · chưa có số: ${instNoData.map(esc).join(", ")}` : ""} — ${instProgs.some((x) => x.pct >= 70) || (ip !== null && ia !== null && ip >= ia) ? "có tập trung" : "chưa tập trung"}` });
  }
  if (n(s.erp_per_hour) !== null) { const v = vs(s.erp_per_hour, s.erp_per_hour_avg); say.push({ lv: v === null ? "info" : v >= 0 ? "ok" : "bad", t: `⚙️ Năng suất: điểm thưởng / giờ công ${fmt(n(s.erp_per_hour))}${v !== null ? ` (${v >= 0 ? "+" : "−"}${f1(Math.abs(v))}% so TB)` : ""}${n(s.dtqd_per_hour) !== null ? ` · ĐTQĐ / giờ công ${fmt(n(s.dtqd_per_hour), 2)}${n(s.dtqd_per_hour_avg) !== null ? ` (TB ${fmt(n(s.dtqd_per_hour_avg), 2)})` : ""}` : ""}` }); }
  if (delta && (delta.dt !== null || delta.contest !== null)) say.push({ lv: (delta.dt ?? delta.contest) >= 0 ? "ok" : "bad", t: `🔁 So lần đọc trước (số tới ${dm(delta.from)}${delta.days ? `, ${delta.days} ngày` : ""}): ${delta.dt !== null ? `DT ${sign(delta.dt, " tr")}${delta.days ? ` (~${f1(delta.dt / delta.days)} tr/ngày)` : ""}` : ""}${delta.contest !== null ? `${delta.dt !== null ? " · " : ""}thi đua ${sign(delta.contest, " điểm %")}` : ""}${delta.up.length ? ` · tăng: ${delta.up.map((x) => `${esc(x.name)} ${sign(x.d, "%")}`).join(", ")}` : ""}` });
  const topMix = mix[0] ? `${mix[0].name} ${fmt(mix[0].pct, 0)}%` : "";
  return { d, s, el, tot, dt, mt, fc, gap, left, mon, curM, lastM, avg3, vsLast, vs3, mix, eff, effStrong, effWeak, progs, near, push, instProgs, instNoData, delta, say, topMix, dtVs };
}

// Dòng tóm tắt cho bảng NV (store.js): tập trung · trả chậm · thi đua · so tháng trước
export function summaryCells(card) {
  const a = analyze(card, null), s = a.s;
  return {
    focus: a.topMix || "—",
    inst: n(s.installment_pct) !== null ? `${fmt(n(s.installment_pct), 0)}%` : a.instProgs.length ? a.instProgs.slice(0, 2).map((x) => `${x.name.replace(/^Trả chậm\s*/i, "").split(/[,(]/)[0].trim()} ${fmt(x.pct, 0)}%`).join(" · ") : "—",
    contest: n(s.contest_pct) !== null ? `${fmt(n(s.contest_pct), 0)}%${n(s.contest_store_avg) !== null ? ` / TB ${fmt(n(s.contest_store_avg), 0)}%` : ""}` : "—",
    vsLast: a.vsLast, contestCls: n(s.contest_pct) !== null && n(s.contest_store_avg) !== null ? (n(s.contest_pct) >= n(s.contest_store_avg) ? "pos" : "neg") : "",
  };
}

const bars = (list, { max = 100, marker = null, unit = "%", neutral = false } = {}) => list.map((x) => { const v = n(x.pct ?? x.value), w = v === null ? 0 : Math.min(100, (v * 100) / max); return `<div class="si-bar"><span class="si-bn">${esc(x.name)}</span><span class="si-bt"><i class="${neutral ? "nt" : v === null ? "" : v >= 100 && unit === "%" ? "ok" : v >= 70 ? "mid" : "low"}" style="width:${w}%"></i>${marker !== null ? `<b class="si-mk" style="left:${Math.min(100, (marker * 100) / max)}%"></b>` : ""}</span><b class="si-bv">${v === null ? "—" : fmt(v, v >= 100 ? 0 : 1) + unit}</b></div>`; }).join("");

// Mở bảng phân tích 1 NV (thẻ BI mới nhất + thẻ trước đó để so)
export async function openStaffInsight(staffId) {
  const { data, error } = await sb.from("bi_files").select("file_id,url,data,data_through,captured_at,processed_at,month").eq("kind", "staff_card").eq("status", "ok").eq("staff_id", staffId)
    .order("data_through", { ascending: false, nullsFirst: false }).order("processed_at", { ascending: false }).limit(8);
  const name = staffById(staffId)?.name || staffId;
  if (error || !data?.length) { await modal(`<h3>📊 ${esc(name)}</h3><p class="muted">Chưa có thẻ BI của nhân viên này (hoặc bạn không có quyền xem).</p><div class="modal-actions"><button class="btn primary" data-v="ok">Đóng</button></div>`); return; }
  const cur = data[0], prev = data.find((x) => x.data_through && cur.data_through && x.data_through < cur.data_through) || null;
  const a = analyze(cur, prev), s = a.s, d = a.d;
  const secs = (d.sections || []).map((x) => { const r = n(x.total) ? n(x.got) / n(x.total) : null; return `<span class="si-sec ${r === null ? "" : r >= 0.6 ? "ok" : r >= 0.3 ? "mid" : "low"}"><small>${esc(x.name)}</small><b>${f1(n(x.got))}/${f1(n(x.total))}</b></span>`; }).join("");
  const kv = (label, v, avg, unit = "", better = 1) => { const x = n(v), g = n(avg), dif = x !== null && g !== null ? (x - g) * better : null; return `<div class="si-kv"><small>${label}</small><b>${x === null ? "—" : fmt(x, Math.abs(x) >= 100 ? 0 : 2) + unit}</b>${g !== null ? `<span class="tiny ${dif >= 0 ? "pos" : "neg"}">TB ${fmt(g, Math.abs(g) >= 100 ? 0 : 2)}${unit}</span>` : ""}</div>`; };
  const maxM = Math.max(1, ...a.mon.map((x) => Number(x.value)), a.fc || 0);
  const html = `<div class="si">
    <div class="si-h"><div><h3 style="margin:0">📊 ${esc(s.name || name)}</h3><p class="tiny muted" style="margin:2px 0 0">${esc(s.code || staffId)} · ${esc(s.dept || "")}${s.group_rank ? ` · hạng ${s.group_rank}/${s.group_size ?? "?"}` : ""}${n(s.score) !== null ? ` · điểm ${f1(n(s.score))}/${f1(n(s.score_max))}` : ""}${n(s.complete_pct) !== null ? ` · hoàn thành ${pc(n(s.complete_pct))}` : ""}</p>
      <p class="tiny muted" style="margin:2px 0 0">Số tới hết ${cur.data_through ? dm(cur.data_through) : "?"}${a.el ? ` · ngày ${a.el}/${a.tot}` : ""} · 🕒 ${upd(cur.processed_at)}${cur.url ? ` · <a href="${esc(cur.url)}" target="_blank" rel="noopener">ảnh gốc</a>` : ""}</p></div></div>
    ${secs ? `<div class="si-secs">${secs}</div>` : ""}
    <h4 class="si-t">📌 Đánh giá nhanh</h4>
    <ul class="si-say">${a.say.map((x) => `<li class="${x.lv}">${x.t}</li>`).join("")}</ul>
    ${(d.notes || []).length ? `<p class="tiny muted si-notes">BI nhận xét: ${(d.notes || []).map(esc).join(" · ")}</p>` : ""}
    <h4 class="si-t">💰 Doanh thu</h4>
    <div class="si-grid">${kv("DT QĐ (tr)", s.revenue_qd, s.revenue_avg)}${kv("% Target", s.pct_target, s.pct_target_avg, "%")}${kv("Dự kiến cả tháng", a.fc, null, " tr")}${kv("Còn thiếu MT", a.gap, null, " tr")}${kv("Số bill", s.bills, s.bills_avg)}${kv("% Bán kèm", s.attach_pct, s.attach_avg, "%")}${kv("% Trả chậm", s.installment_pct, s.installment_avg, "%")}${kv("% Quy đổi", s.conversion_pct, null, "%")}</div>
    ${a.gap ? `<p class="tiny muted">Cần ${f1(a.gap / Math.max(1, a.left || 1))} tr/ngày trong ${a.left} ngày còn lại để đạt MT ${f1(a.mt)} tr.</p>` : ""}
    ${a.mon.length ? `<h4 class="si-t">📈 DT QĐ từng tháng <span class="tiny muted">(tháng này: cột nhạt = dự kiến theo tốc độ)</span></h4>
      <div class="si-mon">${a.mon.map((x) => { const isCur = x.month === a.curM; return `<div><span class="tiny">${f1(Number(x.value))}</span><i style="height:${(Number(x.value) * 100) / maxM}%" class="${isCur ? "cur" : ""}">${isCur && a.fc ? `<em style="height:${Math.max(0, ((a.fc - Number(x.value)) * 100) / Number(x.value || 1))}%"></em>` : ""}</i><small>${x.month.slice(5)}/${x.month.slice(2, 4)}</small></div>`; }).join("")}</div>
      <p class="tiny">${a.vsLast !== null ? `So tháng trước: <b class="${cls(a.vsLast)}">${sign(a.vsLast, "%")}</b>` : ""}${a.vs3 !== null ? ` · so TB 3 tháng: <b class="${cls(a.vs3)}">${sign(a.vs3, "%")}</b>` : ""}${a.fc ? ` · dự kiến ${f1(a.fc)} tr` : ""}</p>` : ""}
    ${a.mix.length ? `<h4 class="si-t">🧭 Đang tập trung (tỷ trọng ngành hàng)</h4>${bars(a.mix, { neutral: true })}` : ""}
    ${a.eff.length ? `<h4 class="si-t">⚡ Hiệu quả khai thác <span class="tiny muted">(vạch = 100% TB nhóm)</span></h4>${bars([...a.eff].sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1)), { max: Math.max(150, ...a.eff.map((x) => x.pct || 0)), marker: 100 })}` : ""}
    ${a.progs.length ? `<h4 class="si-t">🏁 Thi đua ${pc(n(s.contest_pct))}${n(s.contest_store_avg) !== null ? ` <span class="tiny muted">· TB siêu thị ${pc(n(s.contest_store_avg))}</span>` : ""}</h4>
      <p class="tiny">${s.contest_total ? `Đạt <b>${s.contest_passed ?? 0}</b>/${s.contest_total}` : ""}${n(s.contest_near) !== null ? ` · gần đạt <b>${s.contest_near}</b>` : ""}${n(s.contest_need) !== null ? ` · cần cố gắng <b>${s.contest_need}</b>` : ""}${n(s.contest_nodata) !== null ? ` · chưa có số <b>${s.contest_nodata}</b>` : ""}</p>
      ${bars(a.progs, { max: Math.max(100, ...a.progs.map((x) => Math.min(400, x.pct))), marker: 100 })}
      ${(d.nodata_programs || []).length ? `<p class="tiny muted">Chưa có số: ${(d.nodata_programs || []).map(esc).join(" · ")}</p>` : ""}` : ""}
    ${(d.unit_prices || []).some((x) => n(x.value) !== null) ? `<h4 class="si-t">🏷️ Đơn giá (tr)</h4><div class="si-grid">${(d.unit_prices || []).filter((x) => n(x.value) !== null).map((x) => kv(esc(x.name), x.value, x.avg)).join("")}</div>` : ""}
    ${n(s.erp_points) !== null ? `<h4 class="si-t">⚙️ Năng suất</h4><div class="si-grid">${kv("Điểm thưởng ERP", s.erp_points, s.erp_avg)}${kv("Điểm thưởng / giờ công", s.erp_per_hour, s.erp_per_hour_avg)}${kv("ĐTQĐ / giờ công", s.dtqd_per_hour, s.dtqd_per_hour_avg)}</div>` : ""}
    ${a.delta ? `<h4 class="si-t">🔁 So với lần đọc trước <span class="tiny muted">(số tới ${dm(a.delta.from)})</span></h4>
      <p class="tiny">${a.delta.dt !== null ? `DT QĐ <b class="${cls(a.delta.dt)}">${sign(a.delta.dt, " tr")}</b> · ` : ""}${a.delta.target !== null ? `% target <b class="${cls(a.delta.target)}">${sign(a.delta.target, " điểm")}</b> · ` : ""}${a.delta.contest !== null ? `thi đua <b class="${cls(a.delta.contest)}">${sign(a.delta.contest, " điểm")}</b>` : ""}</p>
      ${a.delta.up.length || a.delta.down.length ? `<p class="tiny">${a.delta.up.length ? `▲ ${a.delta.up.map((x) => `${esc(x.name)} ${sign(x.d, "%")}`).join(", ")}` : ""}${a.delta.down.length ? `<br>▼ ${a.delta.down.map((x) => `${esc(x.name)} ${sign(x.d, "%")}`).join(", ")}` : ""}</p>` : ""}` : `<p class="tiny muted">Chưa có thẻ BI cũ hơn để so (từ mai sẽ có).</p>`}
  </div>`;
  await modal(`${html}<div class="modal-actions"><button class="btn primary" data-v="ok">Đóng</button></div>`);
}
