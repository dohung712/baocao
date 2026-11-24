// D19 🗓️ Lịch làm việc PG theo tuần — PG điền lịch TUẦN SAU trong trang Báo cáo (hạn trước 22:00 thứ 7).
// Mỗi ngày: OFF hoặc nhiều khung giờ trong 07:30–22:00 (ca gãy / ca liền tuỳ ngày). Lưu → pg_week_save → vào lịch ca của tool.
// pgWeekTable: bảng lịch PG cả tuần cho Quản lý (Giao việc → 🗓️ Lịch ca).
import { $, esc, toast, modal, shortName } from "./ui.js";
import { sb, S, rpc, errMsg, setting, staffById, visibleStaff } from "./store.js";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const iso = (d) => d.toISOString().slice(0, 10);
const addD = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monday = (s) => { const d = new Date(s + "T00:00:00Z"); return addD(s, -((d.getUTCDay() + 6) % 7)); };
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const dowOf = (s) => DOW[new Date(s + "T00:00:00Z").getUTCDay()];
const FROM = () => setting("PG_WEEK_FROM", "07:30"), TO = () => setting("PG_WEEK_TO", "22:00");
const isPg = (s) => !!s && (setting("PG_DEPTS", ["PG"]) || ["PG"]).includes(s.dept);
const rangeTxt = (r) => (r.off ? "OFF" : (r.ranges || []).map((x) => `${x[0]}–${x[1]}`).join(", ") || "—");

export async function pgWeekCard(el, staffId) {
  if (!el) return;
  const today = iso(vnNow()), next = addD(monday(today), 7);
  let week = next;
  const draw = async () => {
    const days = [...Array(7)].map((_, i) => addD(week, i));
    const { data, error } = await sb.from("pg_schedule").select("d,off,ranges,late,updated_at").eq("staff_id", staffId).gte("d", week).lte("d", days[6]);
    if (error) { el.innerHTML = `<div class="banner bad"><div>${esc(errMsg(error))}</div></div>`; return; }
    const have = new Map((data || []).map((r) => [r.d, r]));
    const st = days.map((d) => { const r = have.get(d); return { d, off: r ? r.off : false, ranges: r ? (r.ranges || []).map((x) => [...x]) : [] }; });
    const dead = `${addD(week, -2)}`, last = (data || []).reduce((a, r) => (r.updated_at > a ? r.updated_at : a), "");
    const late = (data || []).some((r) => r.late);
    const paint = () => {
      el.innerHTML = `<div class="card pgw"><div class="card-h"><h2>🗓️ Lịch làm việc ${week === next ? "tuần sau" : "tuần này"}</h2>
        <span class="pill ${data?.length ? (late ? "warn" : "ok") : "bad"}">${data?.length ? (late ? "Đã điền · trễ" : "Đã điền") : "Chưa điền"}</span></div>
        <p class="small muted" style="margin:-4px 0 8px">${dm(week)} – ${dm(days[6])} · giờ làm trong ${FROM()}–${TO()} · ${week === next ? `<b>hạn trước 22:00 ${dowOf(dead)} ${dm(dead)}</b>` : "đang trong tuần"}${last ? ` · lưu lúc ${new Date(last).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}</p>
        <div class="chips" style="margin-bottom:8px"><button type="button" class="chip ${week === next ? "on" : ""}" data-wk="next">Tuần sau</button><button type="button" class="chip ${week !== next ? "on" : ""}" data-wk="this">Tuần này</button></div>
        ${st.map((x, i) => `<div class="pgw-day ${x.off ? "off" : ""}" data-i="${i}">
          <div class="pgw-h"><b>${dowOf(x.d)} ${dm(x.d)}</b><label class="pgw-off"><input type="checkbox" data-off="${i}" ${x.off ? "checked" : ""}> OFF</label>
            ${i > 0 ? `<button type="button" class="btn small ghost" data-copy="${i}" title="Giống ngày trước">↺ Như hôm trước</button>` : ""}</div>
          ${x.off ? "" : `${x.ranges.map((r, k) => `<div class="pgw-r"><input type="time" step="900" min="${FROM()}" max="${TO()}" value="${esc(r[0])}" data-a="${i}:${k}"> – <input type="time" step="900" min="${FROM()}" max="${TO()}" value="${esc(r[1])}" data-b="${i}:${k}"><button type="button" class="btn small ghost" data-rm="${i}:${k}" title="Bỏ khung giờ">✕</button></div>`).join("")}
            <div class="pgw-q"><button type="button" class="btn small" data-add="${i}">＋ Khung giờ</button><button type="button" class="btn small ghost" data-pre="${i}:${FROM()}-15:00">Sáng ${FROM()}–15:00</button><button type="button" class="btn small ghost" data-pre="${i}:15:00-${TO()}">Chiều 15:00–${TO()}</button><button type="button" class="btn small ghost" data-pre="${i}:${FROM()}-${TO()}">Cả ngày</button></div>`}
        </div>`).join("")}
        <p class="tiny muted">Làm không liền ca thì bấm ＋ Khung giờ để thêm nhiều khung trong ngày. Ngày không làm: tick OFF. Lịch lưu xong vào lịch ca của tool (giao việc, nhắc vào ca theo giờ này).</p>
        <div class="row"><span class="grow small" id="pgwMsg"></span><button class="btn primary" type="button" id="pgwSave">💾 Lưu lịch tuần</button></div></div>`;
    };
    paint();
    el.oninput = (e) => {
      const a = e.target.dataset.a, b = e.target.dataset.b;
      if (a) { const [i, k] = a.split(":").map(Number); st[i].ranges[k][0] = e.target.value; }
      if (b) { const [i, k] = b.split(":").map(Number); st[i].ranges[k][1] = e.target.value; }
    };
    el.onchange = (e) => { const o = e.target.dataset.off; if (o !== undefined) { st[o].off = e.target.checked; if (!st[o].off && !st[o].ranges.length) st[o].ranges = [[FROM(), "15:00"]]; paint(); } };
    el.onclick = async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.wk) { week = t.dataset.wk === "next" ? next : monday(today); return draw(); }
      if (t.dataset.add) { const x = st[t.dataset.add], lastEnd = x.ranges.at(-1)?.[1]; x.ranges.push(lastEnd && lastEnd < TO() ? [lastEnd, TO()] : [FROM(), "15:00"]); return paint(); }
      if (t.dataset.rm) { const [i, k] = t.dataset.rm.split(":").map(Number); st[i].ranges.splice(k, 1); return paint(); }
      if (t.dataset.pre) { const [i, r] = [t.dataset.pre.slice(0, t.dataset.pre.indexOf(":")), t.dataset.pre.slice(t.dataset.pre.indexOf(":") + 1)]; st[i].ranges = [r.split("-")]; st[i].off = false; return paint(); }
      if (t.dataset.copy) { const i = Number(t.dataset.copy); st[i].off = st[i - 1].off; st[i].ranges = st[i - 1].ranges.map((x) => [...x]); return paint(); }
      if (t.id === "pgwSave") {
        const msg = (x) => { const m = $("#pgwMsg"); if (m) m.textContent = x; };
        for (const x of st) if (!x.off && !x.ranges.length) return msg(`${dowOf(x.d)} ${dm(x.d)}: thêm khung giờ hoặc tick OFF.`);
        t.disabled = true;
        try { const r = await rpc("pg_week_save", { p_staff: staffId, p_week: week, p_days: st.map((x) => ({ d: x.d, off: x.off, ranges: x.off ? [] : x.ranges })) }); toast(r.message, 4500); draw(); }
        catch (x) { msg("⚠️ " + errMsg(x)); t.disabled = false; }
      }
    };
  };
  await draw();
}

// Bảng lịch PG cả tuần (Quản lý)
export async function pgWeekTable() {
  const today = iso(vnNow());
  let week = addD(monday(today), 7);
  const pgs = visibleStaff().filter(isPg);
  const body = async () => {
    const days = [...Array(7)].map((_, i) => addD(week, i));
    const { data } = await sb.from("pg_schedule").select("staff_id,d,off,ranges,late").gte("d", week).lte("d", days[6]);
    const get = (id, d) => (data || []).find((r) => r.staff_id === id && r.d === d);
    const missing = pgs.filter((s) => !days.some((d) => get(s.id, d)));
    return `<h3>🗓️ Lịch làm việc PG · ${dm(week)} – ${dm(days[6])}</h3>
      <div class="chips" style="margin-bottom:8px"><button type="button" class="chip" data-v="prev">‹ Tuần trước</button><button type="button" class="chip" data-v="next">Tuần sau ›</button></div>
      ${missing.length ? `<div class="banner warn" style="margin-bottom:8px"><div>Chưa điền: <b>${missing.map((s) => esc(shortName(s.name))).join(", ")}</b> (hạn 22:00 thứ 7 ${dm(addD(week, -2))})</div></div>` : ""}
      <div class="tbl-wrap"><table class="nosort"><thead><tr><th>PG</th>${days.map((d) => `<th>${dowOf(d)} ${dm(d)}</th>`).join("")}</tr></thead><tbody>
      ${pgs.map((s) => `<tr><td><b>${esc(shortName(s.name))}</b></td>${days.map((d) => { const r = get(s.id, d); return `<td class="small ${r?.off ? "muted" : ""}">${r ? esc(rangeTxt(r)) + (r.late ? " ⏰" : "") : '<span class="c-bad">—</span>'}</td>`; }).join("")}</tr>`).join("") || `<tr><td colspan="8" class="muted">Chưa có nhân viên bộ phận PG.</td></tr>`}
      </tbody></table></div><p class="tiny muted">⏰ = lưu sau hạn. Lịch đã đưa vào lịch ca của tool.</p>
      <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button></div>`;
  };
  for (;;) {
    const v = await modal(await body());
    if (v === "prev") { week = addD(week, -7); continue; }
    if (v === "next") { week = addD(week, 7); continue; }
    break;
  }
}
