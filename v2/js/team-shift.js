// 👥 Ca cả nhóm (D12d): chọn ngày → từng ca có ai làm. NV không thấy ca của Quản lý / Trưởng ca (máy chủ lọc theo SHIFT_PRIVATE_POS).
import { esc, modal, vnToday, addDays, dm, dow, shortName } from "./ui.js";
import { sb, S, staffById, setting, isManager } from "./store.js";

export async function openTeamShift(start = vnToday()) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i)), slots = setting("SHIFT_SLOTS", []) || [];
  const { data } = await sb.from("shifts").select("staff_id,d,slots,pos,private").gte("d", days[0]).lte("d", days[6]);
  const rows = (data || []).filter((r) => staffById(r.staff_id) && !staffById(r.staff_id).hidden);
  let cur = days[0];
  const body = () => {
    const on = rows.filter((r) => r.d === cur), me = S.me?.staff_id;
    const who = (r) => `<span class="ts-p ${r.staff_id === me ? "me" : ""}">${esc(shortName(staffById(r.staff_id)?.name || r.staff_id))}${isManager() && r.private ? " 🔒" : ""}</span>`;
    const off = on.filter((r) => !(r.slots || []).length);
    return `<div class="seg ts-days">${days.map((d) => `<button type="button" data-tsd="${d}" class="${d === cur ? "on" : ""}">${dow(d)}<small>${dm(d)}</small></button>`).join("")}</div>
      ${on.length ? `<div class="ts-list">${[1, 2, 3, 4, 5, 6].map((i) => { const l = on.filter((r) => (r.slots || []).includes(i)); return `<div class="ts-ca"><div><b>Ca ${i}</b><small>${esc(slots[i - 1] || "")}</small></div><div class="ts-ps">${l.length ? l.map(who).join("") : '<span class="muted tiny">—</span>'}</div><span class="ts-n">${l.length}</span></div>`; }).join("")}
        ${off.length ? `<div class="ts-ca off"><div><b>OFF</b></div><div class="ts-ps">${off.map(who).join("")}</div><span class="ts-n">${off.length}</span></div>` : ""}</div>`
        : `<div class="empty small">Chưa có lịch ca ngày này.</div>`}
      <p class="tiny muted">${isManager() ? "🔒 = Quản lý / Trưởng ca (nhân viên không thấy)." : "Chỉ hiện ca của nhân viên (không gồm Quản lý, Trưởng ca)."}</p>`;
  };
  await modal(`<h3>👥 Ca cả nhóm</h3><div id="tsBody">${body()}</div><div class="modal-actions"><button class="btn primary" data-v="ok">Đóng</button></div>`, {
    onOpen: (m) => { m.addEventListener("click", (e) => { const b = e.target.closest("[data-tsd]"); if (!b) return; cur = b.dataset.tsd; m.querySelector("#tsBody").innerHTML = body(); }); },
  });
}
