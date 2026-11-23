// CV → 📅 Lịch bận (làm lại 23/11/2026, D12d): đăng ký bận / OFF theo tuần trên điện thoại (bận theo đúng Ca 1–6 của tool sắp ca),
// nối với lịch ca: file ca mới đọc vào → so với lịch bận → báo chỗ xếp nhầm (Telegram "shiftcheck" + thông báo QL + tab Đối chiếu).
import { $, esc, toast, vnToday, vnHM, addDays, weekStart, dmy, dm, dow, shortName } from "../ui.js";
import { sb, S, rpc, isManager, visibleStaff, staffById, setting, errMsg } from "../store.js";

const SL = () => { const s = setting("SHIFT_SLOTS", []); return Array.isArray(s) ? s : []; };
const rng = (x) => { const s = [...(x || [])].sort((a, b) => a - b), g = []; for (const v of s) { const l = g[g.length - 1]; if (l && v === l[1] + 1) l[1] = v; else g.push([v, v]); } return g.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", "); };
const tm = (x) => { const s = [...(x || [])].sort((a, b) => a - b); if (!s.length) return ""; const t1 = String(SL()[s[0] - 1] || "").split("-")[0], t2 = String(SL()[s[s.length - 1] - 1] || "").split("-")[1]; return t1 && t2 ? `${t1}–${t2}` : ""; };
const lockOn = () => setting("BUSY_LOCK_ENABLED", true) === true || setting("BUSY_LOCK_ENABLED", true) === "true";
// Hạn đăng ký cho tuần bắt đầu wk (thứ 2): BUSY_DEADLINE_HM thứ 6 tuần trước
function deadline(wk) { const fri = addDays(wk, -3), hm = setting("BUSY_DEADLINE_HM", "22:00"), t = vnToday(); return { fri, hm, passed: t > fri || (t === fri && vnHM() >= hm) }; }

let W = { wk: null, staff: null };

// ---------- 📝 Đăng ký theo tuần ----------
export async function busyWeek(bz, redraw) {
  const today = vnToday(), thisWk = weekStart(today);
  if (!W.wk) W.wk = deadline(addDays(thisWk, 7)).passed ? addDays(thisWk, 14) : addDays(thisWk, 7);
  const staff = isManager() ? (W.staff && visibleStaff().some((s) => s.id === W.staff) ? W.staff : (S.me.staff_id && visibleStaff().some((s) => s.id === S.me.staff_id) ? S.me.staff_id : visibleStaff()[0]?.id)) : S.me.staff_id;
  W.staff = staff;
  if (!staff) { bz.innerHTML = `<div class="empty">Tài khoản chưa gắn mã nhân viên.</div>`; return; }
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(W.wk, i)), max = Number(setting("BUSY_MAX_WEEKDAY", 3));
  const [bq, sq, cq] = await Promise.all([
    sb.from("busy").select("busy_date,staff_id,type,shifts").gte("busy_date", days[0]).lte("busy_date", days[6]),
    sb.from("shifts").select("d,slots").eq("staff_id", staff).gte("d", days[0]).lte("d", days[6]),
    rpc("shift_conflicts", { p_from: days[0], p_to: days[6] }).catch(() => []),
  ]);
  const all = (bq.data || []).filter((b) => !staffById(b.staff_id)?.hidden);
  const mine = new Map(all.filter((b) => b.staff_id === staff).map((b) => [b.busy_date, b]));
  const sh = new Map((sq.data || []).map((x) => [x.d, x.slots || []]));
  const conf = new Map((Array.isArray(cq) ? cq : []).filter((c) => c.staff_id === staff).map((c) => [c.d, c]));
  const dl = deadline(W.wk), locked = !isManager() && lockOn() && dl.passed;
  const wkBtn = (off, label) => { const w = addDays(thisWk, off); return `<button type="button" data-bw="${w}" class="${w === W.wk ? "on" : ""}">${label}<small>${dm(w)}–${dm(addDays(w, 6))}</small></button>`; };
  bz.innerHTML = `<div class="card bw">
    <div class="seg bw-weeks">${wkBtn(0, "Tuần này")}${wkBtn(7, "Tuần sau")}${wkBtn(14, "2 tuần nữa")}</div>
    ${isManager() ? `<label class="small" style="margin-top:8px">Nhân viên<select id="bwStaff">${visibleStaff().map((s) => `<option value="${esc(s.id)}" ${s.id === staff ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>` : ""}
    ${lockOn() ? `<div class="banner ${locked ? "bad" : "warn"} bw-dl"><div>${locked ? `🔒 Đã quá hạn đăng ký tuần này (${esc(dl.hm)} thứ 6 ${dm(dl.fri)}) — nhờ quản lý đăng ký hộ.` : `⏰ Hạn đăng ký tuần ${dm(W.wk)}–${dm(days[6])}: <b>${esc(dl.hm)} thứ 6 ${dm(dl.fri)}</b>. Sau hạn chỉ quản lý sửa được.`}</div></div>` : ""}
    <p class="tiny muted" style="margin:6px 0 2px">Chọn từng ngày: <b>Đi làm</b> · <b>OFF</b> (nghỉ cả ngày) · <b>Bận</b> (chọn ca bận). Tool sắp ca dựa vào đây; khi có lịch ca mới, tool tự báo nếu bị xếp vào giờ bận.</p>
    <div class="bw-days">${days.map((d) => {
      const b = mine.get(d), st = b ? (b.type === "OFF" ? "OFF" : "BAN") : "", wd = new Date(d + "T00:00:00Z").getUTCDay(), weekday = wd >= 1 && wd <= 5;
      const n = all.filter((x) => x.busy_date === d).length, full = weekday && n >= max && !b;
      const ro = locked || (!isManager() && d < today), s = sh.get(d), c = conf.get(d);
      return `<div class="bw-day ${st ? "has-" + st.toLowerCase() : ""} ${c ? "conf" : ""}" data-bd="${d}">
        <div class="bw-h"><b>${dow(d)} ${dm(d)}</b><span class="tiny muted">${weekday ? `${n}/${max} người đăng ký` : "T7, CN không giới hạn"}</span></div>
        <div class="seg bw-type">${[["", "Đi làm"], ["OFF", "OFF"], ["BAN", "Bận"]].map(([v, l]) => `<button type="button" data-bt="${v}" class="${st === v ? "on" : ""}" ${ro || (full && v) ? "disabled" : ""}>${l}</button>`).join("")}</div>
        ${st === "BAN" ? `<div class="bw-ca">${[1, 2, 3, 4, 5, 6].map((i) => `<label class="${(b.shifts || []).includes(i) ? "on" : ""}"><input type="checkbox" value="${i}" ${(b.shifts || []).includes(i) ? "checked" : ""} ${ro ? "disabled" : ""}><b>Ca ${i}</b><small>${esc(SL()[i - 1] || "")}</small></label>`).join("")}</div>
          ${!(b.shifts || []).length ? `<p class="tiny neg" style="margin:4px 0 0">Chọn ca bận để tool sắp ca tránh đúng giờ.</p>` : ""}` : ""}
        ${full ? `<p class="tiny neg" style="margin:4px 0 0">🔒 Ngày này đã đủ ${max} người — liên hệ quản lý.</p>` : ""}
        ${s ? `<p class="tiny ${c ? "neg" : "muted"} bw-sh">🗓️ Lịch ca: ${s.length ? `Ca ${rng(s)} · ${tm(s)}` : "OFF"}${c ? ` — ⚠️ trùng ${c.kind === "off" ? "ngày OFF" : c.kind === "ban" ? `giờ bận (Ca ${rng(c.overlap)})` : "ngày bận"}` : ""}</p>` : ""}
      </div>`; }).join("")}</div></div>`;
  bz.onclick = async (e) => {
    const w = e.target.closest("[data-bw]"); if (w) { W.wk = w.dataset.bw; return redraw(); }
    const t = e.target.closest("[data-bt]"); if (!t || t.disabled) return;
    const d = t.closest("[data-bd]").dataset.bd, v = t.dataset.bt, cur = mine.get(d);
    if ((cur ? cur.type : "") === v) return;
    await save(d, v || "NONE", v === "BAN" ? (cur?.shifts || []) : [], redraw);
  };
  bz.onchange = async (e) => {
    if (e.target.id === "bwStaff") { W.staff = e.target.value; return redraw(); }
    const box = e.target.closest(".bw-ca"); if (!box) return;
    const d = box.closest("[data-bd]").dataset.bd;
    await save(d, "BAN", [...box.querySelectorAll("input:checked")].map((i) => Number(i.value)), redraw);
  };
  async function save(d, type, shifts, done) {
    try { const r = await rpc("busy_set", { p_staff: staff, p_date: d, p_type: type, p_shifts: shifts }); toast((r.status === "full" ? "⛔ " : "✅ ") + r.message, 3000); }
    catch (x) { toast(errMsg(x), 5000); }
    done();
  }
}

// ---------- ⚠️ Đối chiếu lịch ca với lịch bận ----------
export async function busyCheck(bz) {
  const today = vnToday(), from = weekStart(today), to = addDays(from, 20), last = setting("SHIFT_LAST", null);
  const list = await rpc("shift_conflicts", { p_from: from, p_to: to }).catch((x) => { toast(errMsg(x), 5000); return []; });
  const L = Array.isArray(list) ? list : [];
  const what = (c) => c.kind === "off" ? "đăng ký <b>OFF</b>" : c.kind === "ban" ? `bận <b>Ca ${rng(c.busy)}</b> (${tm(c.busy)})` : "bận nhưng <b>chưa ghi ca</b>";
  bz.innerHTML = `<div class="card"><div class="card-h"><h2>⚠️ Đối chiếu lịch ca với lịch bận / OFF</h2><span class="small muted">${dm(from)} – ${dm(to)}</span></div>
    <p class="small muted">Tool sắp ca bỏ file vào Drive → tool đọc (30 phút / lần) → tự so với lịch bận NV đã đăng ký. Chỗ trùng được báo ngay qua Telegram và thông báo cho quản lý.</p>
    ${last ? `<p class="small">File lịch ca gần nhất: <b>${esc(last.source || "")}</b> · ${last.from ? dm(last.from) + " – " + dm(last.to) : ""} · đọc lúc ${last.at ? new Date(last.at).toLocaleString("vi-VN") : "?"}</p>` : `<p class="small muted">Chưa có file lịch ca nào.</p>`}
    ${L.length ? `<div class="banner bad"><div><b>${L.length} chỗ xếp ca trùng lịch bận / OFF</b> — sửa ở tool sắp ca rồi bỏ file mới vào Drive.</div></div>
      <div class="bw-conf">${L.map((c) => `<div class="bw-ci"><b>${dow(c.d)} ${dm(c.d)}</b><span><b>${esc(shortName(c.name))}</b>: ${what(c)} nhưng được xếp <b>Ca ${rng(c.slots)}</b> (${tm(c.slots)})${c.kind === "ban" ? ` → trùng Ca ${rng(c.overlap)}` : ""}</span></div>`).join("")}</div>`
      : `<div class="banner ok"><div>✅ Lịch ca ${dm(from)} – ${dm(to)} không trùng lịch bận / OFF nào.</div></div>`}
  </div>`;
}
