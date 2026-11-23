// Nhắc việc cho NV theo lịch đăng ký: trực vệ sinh hôm nay / ngày mai (lịch CV → Vệ sinh), khu vực vệ sinh chưa báo xong, lịch phát tờ rơi (D11).
import { $, esc, vnToday, addDays, dmy, dow } from "./ui.js";
import { sb, S, rpc, setting } from "./store.js";
import { openCum } from "./cumulative.js";
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
  // C12 nhập lũy kế tay thứ 2: tắt từ 23/11/2026 (số lũy kế lấy từ ảnh BI, QL duyệt) — bật lại bằng cài đặt CUM_MANUAL = true
  const [cum, fl] = await Promise.all([setting("CUM_MANUAL", false) === true ? rpc("cum_form", { p_staff: me }).catch(() => null) : null,rpc("flyer_todo", { p_staff: me, p_date: today }).catch(() => [])]);
  if (tok !== busy) return;
  const items = [], c0 = (cl.data || []).find((c) => c.clean_date === today), c1 = (cl.data || []).find((c) => c.clean_date === tm);
  // D13: báo cáo vệ sinh theo lịch đăng ký là việc trong 🏠 Hôm nay (nộp 4 ảnh) — dải nhắc chỉ báo trước ngày mai
  void c0;
  if (c1) items.push(["cl" + tm, `🧹 <b>Ngày mai (${dow(tm)} ${dmy(tm)}) bạn trực vệ sinh</b> theo lịch đăng ký — việc sẽ hiện ở 🏠 Hôm nay.`]);
  const done = new Set((ck.data || []).map((x) => x.zone_id));
  const mine = (zs.data || []).filter((z) => zoneStaff(z).includes(me) && !done.has(z.id));
  if (mine.length) items.push(["zone" + today, `🧽 <b>Khu vực vệ sinh của bạn:</b> ${mine.map((z) => esc(z.name)).join(" · ")} — làm xong bấm “Xong hôm nay”.`]);
  if (setting("CUM_MANUAL", false) === true && cum && cum.window.open && ["monday", "unlock"].includes(cum.window.why) && !cum.done)
    items.unshift(["cum" + today + (cum.window.since || ""), `📈 <b>${cum.window.why === "monday" ? "Thứ 2: cập nhật lũy kế tháng" : "Quản lý mở khoá: cập nhật lại lũy kế"}</b> đến hết ${dow(cum.as_of)} ${dmy(cum.as_of)} — DT QĐ và từng môn đúng loại (🔢 Số lượng · 💰 DT quy đổi · 💵 DT thực).`, "cum"]);
  // Tờ rơi (D11): quá hạn / hôm nay / mai / lịch sắp tới — hiện ngay khi QL vừa tạo đợt
  for (const f of Array.isArray(fl) ? fl : []) {
    const k = f.k + today + ":" + String(f.d || "").length;   // lịch đổi (thêm / bớt tuyến) thì hiện lại dù đã ẩn
    const tail = f.k === "fl_over" ? " — nộp ảnh album ngay" : f.k === "fl_today" ? " — phát xong chụp màn hình album nộp trên tool" : "";
    (f.lv === "bad" ? items.unshift.bind(items) : items.push.bind(items))([k, `${f.icon} <b>${esc(f.t)}:</b> ${esc(f.d)}${tail}`, "flyer"]);
  }
  const hide = off(), show = items.filter(([k]) => !hide.includes(k));
  box.innerHTML = show.map(([k, t, act]) => `<div class="remind-i"><span class="grow">${t}</span><button class="btn small primary" type="button" data-ro="${act || "cv"}">${act === "cum" ? "Cập nhật" : "Mở"}</button><button class="btn small ghost" type="button" data-rx="${k}" title="Ẩn hôm nay">✕</button></div>`).join("");
  box.onclick = (e) => {
    const x = e.target.closest("[data-rx]");
    if (x) { try { localStorage.setItem(KEY, JSON.stringify({ d: today, k: [...off(), x.dataset.rx] })); } catch { /* bỏ qua */ } x.closest(".remind-i").remove(); return; }
    const ro = e.target.closest("[data-ro]");
    if (ro?.dataset.ro === "cum") return openCum(me);
    if (ro) { try { localStorage.setItem("thidua-v2-cv", ro.dataset.ro === "flyer" ? "flyer" : "clean"); } catch { /* bỏ qua */ } go?.("cv"); }
  };
}
