// Nhắc việc cho NV theo lịch đăng ký: trực vệ sinh hôm nay / ngày mai (lịch CV → Vệ sinh) và khu vực vệ sinh của mình chưa báo xong.
import { $, esc, vnToday, addDays, dmy, dow } from "./ui.js";
import { sb, S } from "./store.js";
import { zoneStaff } from "./pages/cv-zones.js";

const KEY = "thidua-v2-remind-off";
const off = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o.d === vnToday() ? o.k || [] : []; } catch { return []; } };
let busy = 0;

export async function renderReminders(go) {
  const box = $("#remind"); if (!box) return;
  const me = S.me?.staff_id; if (!me) { box.innerHTML = ""; return; }
  const today = vnToday(), tm = addDays(today, 1), tok = ++busy;
  const [cl, zs, ck] = await Promise.all([
    sb.from("cleaning").select("clean_date,staff_id,photos").eq("staff_id", me).gte("clean_date", today).lte("clean_date", tm),
    sb.from("clean_zones").select("id,dept,kind,name,staff_text,staff_ids").eq("kind", "zone"),
    sb.from("clean_zone_checks").select("zone_id").eq("d", today).eq("staff_id", me),
  ]).catch(() => [{}, {}, {}]);
  if (tok !== busy) return;
  const items = [], c0 = (cl.data || []).find((c) => c.clean_date === today), c1 = (cl.data || []).find((c) => c.clean_date === tm);
  if (c0 && (c0.photos || []).length < 3) items.push(["cl" + today, `🧹 <b>Hôm nay (${dow(today)} ${dmy(today)}) bạn trực vệ sinh</b> theo lịch đăng ký — làm xong nộp 3 ảnh.`]);
  if (c1) items.push(["cl" + tm, `🧹 <b>Ngày mai (${dow(tm)} ${dmy(tm)}) bạn trực vệ sinh</b> theo lịch đăng ký.`]);
  const done = new Set((ck.data || []).map((x) => x.zone_id));
  const mine = (zs.data || []).filter((z) => zoneStaff(z).includes(me) && !done.has(z.id));
  if (mine.length) items.push(["zone" + today, `🧽 <b>Khu vực vệ sinh của bạn:</b> ${mine.map((z) => esc(z.name)).join(" · ")} — làm xong bấm “Xong hôm nay”.`]);
  const hide = off(), show = items.filter(([k]) => !hide.includes(k));
  box.innerHTML = show.map(([k, t]) => `<div class="remind-i"><span class="grow">${t}</span><button class="btn small primary" type="button" data-ro="1">Mở</button><button class="btn small ghost" type="button" data-rx="${k}" title="Ẩn hôm nay">✕</button></div>`).join("");
  box.onclick = (e) => {
    const x = e.target.closest("[data-rx]");
    if (x) { try { localStorage.setItem(KEY, JSON.stringify({ d: today, k: [...off(), x.dataset.rx] })); } catch { /* bỏ qua */ } x.closest(".remind-i").remove(); return; }
    if (e.target.closest("[data-ro]")) { try { localStorage.setItem("thidua-v2-cv", "clean"); } catch { /* bỏ qua */ } go?.("cv"); }
  };
}
