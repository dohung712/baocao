// C12 Cập nhật lũy kế tuần: NV nhập lũy kế tháng (DT QĐ + từng môn đúng loại) vào thứ 2 hoặc khi quản lý mở khoá
import { esc, fmt, toast, modal, confirmBox, dmy, dow } from "./ui.js";
import { rpc, setting, staffById, errMsg, isManager } from "./store.js";

export const MEASURE = {
  sl: { icon: "🔢", label: "Số lượng", cls: "m-sl", hint: "Nhập SỐ LƯỢNG (máy / cái / hồ sơ / hợp đồng) — số nguyên, KHÔNG nhập tiền" },
  dtqd: { icon: "💰", label: "DT quy đổi", cls: "m-qd", hint: "Nhập DOANH THU QUY ĐỔI (đã nhân hệ số), cùng đơn vị với target" },
  dtt: { icon: "💵", label: "DT thực", cls: "m-dtt", hint: "Nhập DOANH THU THỰC (tiền khách trả, chưa quy đổi), cùng đơn vị với target" },
};
export const measureTag = (m, guess) => { const x = MEASURE[m] || MEASURE.dtqd; return `<span class="mtag ${x.cls}" title="${esc(x.hint)}">${x.icon} ${x.label}${guess ? " ?" : ""}</span>`; };
export const windowText = (w) => w.why === "monday" ? "Hôm nay thứ 2 — ngày cập nhật lũy kế" : w.why === "unlock" ? `Quản lý đã mở khoá đến ${new Date(w.until).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}`
  : w.why === "manager" ? "Quản lý cập nhật hộ (không giới hạn ngày)" : `Đang khoá — mở lại vào thứ 2 ${w.next ? dmy(w.next) : ""} hoặc khi quản lý mở khoá`;

export async function openCum(staffId, after) {
  let f; try { f = await rpc("cum_form", { p_staff: staffId }); } catch (x) { return toast(errMsg(x), 4500); }
  const unit = setting("REVENUE_UNIT", ""), s = staffById(staffId), open = f.window.open, asof = `${dow(f.as_of)} ${dmy(f.as_of)}`;
  const kinds = [...new Set(f.items.map((i) => i.measure))];
  const v = await modal(`<h3>📈 Cập nhật lũy kế · ${esc(s?.name || staffId)}</h3>
    <div class="banner ${open ? "info" : "warn"}"><div><b>${esc(windowText(f.window))}</b>Lấy số <b>lũy kế tháng đến hết ${asof}</b> trên báo cáo công ty, nhập đúng từng ô. Tool tự tính phần chênh lệch với số đang có.</div></div>
    ${f.items.length ? `<div class="banner warn cum-warn"><div><b>⚠️ Mỗi môn tính theo loại khác nhau — xem nhãn trước khi nhập</b>${kinds.map((k) => `${measureTag(k)} ${esc(MEASURE[k]?.hint || "")}`).join("<br>")}</div></div>` : ""}
    ${f.done ? `<p class="small ok-t">✅ Đã cập nhật lúc ${new Date(f.last_at).toLocaleString("vi-VN")} — nhập lại sẽ ghi đè số mới.</p>` : ""}
    <form class="stack cum-form">
      <div class="cum-row"><div class="cum-n"><b>Doanh thu QĐ</b> ${measureTag("dtqd")}<div class="tiny muted">Tool đang có: <b>${fmt(f.revenue_tool, 2)}</b> ${esc(unit)}${f.revenue_target != null ? ` · target tháng ${fmt(f.revenue_target, 1)}` : ""}</div></div>
        <input name="rev" type="number" inputmode="decimal" step="any" min="0" placeholder="${fmt(f.revenue_tool, 2)}" ${open ? "" : "disabled"}></div>
      ${f.items.map((i, k) => `<div class="cum-row"><div class="cum-n"><b>${esc(i.name)}</b> ${measureTag(i.measure, i.guess && isManager())}<div class="tiny muted">Tool đang có: <b>${fmt(i.tool, 2)}</b> · target tháng ${fmt(i.target, 2)}</div></div>
        <input name="i${k}" data-m="${i.measure}" type="number" inputmode="${i.measure === "sl" ? "numeric" : "decimal"}" step="any" min="0" placeholder="${fmt(i.tool, 2)}" ${open ? "" : "disabled"}></div>`).join("")}
      ${f.items.length ? "" : `<p class="small muted">Chưa được giao môn thi đua tháng — chỉ cập nhật doanh thu.</p>`}
      <p class="tiny muted">Ô để trống = giữ nguyên số trong tool.</p></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">${open ? "Huỷ" : "Đóng"}</button>${open ? `<button class="btn primary" data-v="submit">💾 Lưu lũy kế</button>` : ""}</div>`);
  if (!v || v === "cancel") return;
  const items = f.items.map((i, k) => ({ name: i.name, measure: i.measure, tool: Number(i.tool), target: Number(i.target), value: v["i" + k] === "" ? null : Number(v["i" + k]) }));
  const warn = [];
  for (const i of items) {
    if (i.value == null) continue;
    if (i.measure === "sl" && !Number.isInteger(i.value)) warn.push(`<b>${esc(i.name)}</b> tính theo <b>Số lượng</b> nhưng bạn nhập số lẻ ${fmt(i.value, 2)}`);
    if (i.target > 0 && i.value > i.target * 5) warn.push(`<b>${esc(i.name)}</b>: ${fmt(i.value, 2)} gấp hơn 5 lần target tháng (${fmt(i.target, 2)}) — có nhập nhầm loại (SL / DT) không?`);
    if (i.value < i.tool * 0.5 && i.tool > 0) warn.push(`<b>${esc(i.name)}</b>: ${fmt(i.value, 2)} thấp hơn nhiều so với số đang có (${fmt(i.tool, 2)})`);
  }
  const rev = v.rev === "" ? null : Number(v.rev);
  if (rev != null && f.revenue_target > 0 && rev > f.revenue_target * 5) warn.push(`Doanh thu ${fmt(rev, 2)} gấp hơn 5 lần target tháng — kiểm tra đơn vị (${esc(unit)})`);
  if (warn.length && !(await confirmBox("Kiểm tra lại trước khi lưu", warn.join("<br>"), "Vẫn lưu"))) return openCum(staffId, after);
  try {
    const r = await rpc("cum_submit", { p_staff: staffId, p_revenue: rev, p_items: items.filter((i) => i.value != null).map((i) => ({ name: i.name, value: i.value })) });
    toast(r.message, 4000); document.dispatchEvent(new Event("remind:refresh")); after?.();
  } catch (x) { toast(errMsg(x), 4500); }
}
