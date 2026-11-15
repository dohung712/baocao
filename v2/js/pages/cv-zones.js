// D8 Khu vực vệ sinh: từng bộ phận có khu vực + người phụ trách + tiêu chí chi tiết. NV bấm "Xong hôm nay"; QL thêm/sửa/xoá.
import { esc, toast, modal, confirmBox, vnToday } from "../ui.js";
import { sb, S, rpc, isManager, isOwner, setting, depts, staffById, visibleStaff, errMsg, loadSettings } from "../store.js";

const KEY = "thidua-v2-zone-dept";
const GROUPS = [["zone", "📍 Khu vực & người phụ trách"], ["shift", "🕐 Việc theo ca"], ["spot", "📌 Vị trí cần vệ sinh & tiêu chí"]];
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const low = (x) => String(x || "").normalize("NFC").toLowerCase().trim();
const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const err = (x) => toast(errMsg(x), "bad");

// NV phụ trách: ưu tiên danh sách QL đã chọn; chưa chọn thì đoán theo tên trong cột "Nhân viên" (VD "Trâm + PG Oppo")
export function zoneStaff(z, staff = visibleStaff()) {
  if (z.staff_ids?.length) return z.staff_ids;
  // "Hiếu Linh" không khớp ai thì tách từng tên (Hiếu + Linh); "PG SS" tìm trong NV bộ phận PG (VD "Diện SS")
  const hit = (n, t) => n === t || n.endsWith(" " + t);
  const pool = (pg) => staff.filter((s) => (pg ? /^pg$/i.test(s.dept) : s.dept === z.dept));
  const out = new Set();
  for (let t of String(z.staff_text || "").split(/[+,/&]| và /i).map(low).filter((t) => t && t !== "new")) {
    const pg = /^pg\s/.test(t); if (pg) t = t.slice(3).trim();
    const ps = pool(pg); let m = ps.filter((s) => hit(low(s.name), t));
    if (!m.length && !pg && t.includes(" ")) m = t.split(/\s+/).flatMap((w) => ps.filter((s) => hit(low(s.name), w)));
    if (m.length === 1 || (!pg && m.length)) m.forEach((s) => out.add(s.id));
  }
  return [...out];
}

export async function zones(box) {
  const today = vnToday();
  const [{ data: zs, error }, { data: ck }] = await Promise.all([
    sb.from("clean_zones").select("*").order("sort").order("id"),
    sb.from("clean_zone_checks").select("*").eq("d", today),
  ]);
  if (!box.isConnected) return;
  if (error) { box.innerHTML = `<div class="card"><p class="muted">${esc(errMsg(error))}</p></div>`; return; }
  const mgr = isManager(), myId = S.me?.staff_id;
  const all = zs || [], ds = all.length ? [...new Set(all.map((z) => z.dept))] : depts();
  let dept = null; try { dept = localStorage.getItem(KEY); } catch { /* bỏ qua */ }
  if (!ds.includes(dept)) dept = ds.includes(staffById(myId)?.dept) ? staffById(myId).dept : ds[0];
  const list = all.filter((z) => z.dept === dept);
  const mine = all.filter((z) => myId && zoneStaff(z).includes(myId));
  const doneBy = (z) => (ck || []).filter((c) => c.zone_id === z.id);
  const crit = String(setting("CLEAN_CRITERIA", "") || "");

  const card = (z) => {
    const who = zoneStaff(z), isMine = myId && who.includes(myId), done = doneBy(z), meDone = done.some((c) => c.staff_id === myId);
    const lines = String(z.detail || "").split("\n").map((l) => l.trim()).filter(Boolean);
    return `<div class="zone ${isMine ? "mine" : ""} ${done.length ? "done" : ""}" data-z="${z.id}">
      <div class="zone-h"><b>${esc(z.name)}</b>${z.staff_text ? `<span class="pill info">👤 ${esc(z.staff_text)}</span>` : ""}${isMine ? '<span class="pill ok">Khu vực của bạn</span>' : ""}
        ${mgr ? `<button class="btn small ghost" data-ze="${z.id}" type="button" title="Sửa">✏️</button>` : ""}</div>
      ${lines.length ? `<ul class="zone-l">${lines.map((l) => `<li>${md(l)}</li>`).join("")}</ul>` : `<p class="tiny muted">Chưa có tiêu chí${mgr ? " — bấm ✏️ để thêm" : ""}.</p>`}
      <div class="zone-f">${done.length ? `<span class="tiny ok-t">✅ ${done.map((c) => `${esc(staffById(c.staff_id)?.name?.split(" ").slice(-1)[0] || c.staff_id)} ${hm(c.at)}`).join(" · ")}</span>` : `<span class="tiny muted">Hôm nay chưa báo xong</span>`}
        ${isMine || (mgr && z.kind === "zone") ? `<button class="btn small ${meDone ? "" : "primary"}" data-zc="${z.id}" type="button">${meDone ? "↩️ Huỷ xong" : "✅ Xong hôm nay"}</button>` : ""}</div></div>`;
  };

  box.innerHTML = `<div class="card zones-card" style="margin-bottom:14px"><div class="card-h"><h2>🧽 Khu vực vệ sinh</h2>
      <div class="row">${ds.length > 1 ? `<div class="seg" id="zDept">${ds.map((d) => `<button type="button" data-zd="${esc(d)}" class="${d === dept ? "on" : ""}">${esc(d)}</button>`).join("")}</div>` : ""}
      ${mgr ? `<button class="btn small primary" id="zAdd" type="button">+ Thêm</button>` : ""}</div></div>
    ${crit ? `<div class="banner warn zone-crit"><div class="grow">${((l) => `<b>${esc(l[0])}</b>${l.slice(1).map(esc).join("<br>")}`)(crit.split("\n"))}</div>${isOwner() ? `<button class="btn small ghost" id="zCrit" type="button">✏️</button>` : ""}</div>` : isOwner() ? `<button class="btn small" id="zCrit" type="button">+ Tiêu chí chung</button>` : ""}
    ${mine.length && mine.some((z) => z.dept !== dept) ? `<p class="small">📍 Khu vực của bạn: ${mine.map((z) => `<b>${esc(z.name)}</b>`).join(", ")}</p>` : ""}
    ${GROUPS.map(([k, label]) => { const g = list.filter((z) => z.kind === k).sort((a, b) => (myId && zoneStaff(b).includes(myId)) - (myId && zoneStaff(a).includes(myId)) || a.sort - b.sort);
      return g.length ? `<h3 class="zone-g">${label}</h3><div class="zone-grid">${g.map(card).join("")}</div>` : ""; }).join("")}
    ${list.length ? "" : `<p class="muted">Bộ phận này chưa có khu vực vệ sinh.${mgr ? " Bấm <b>+ Thêm</b>." : ""}</p>`}</div>`;

  const redraw = () => zones(box);
  box.onclick = async (e) => {
    const d = e.target.closest("[data-zd]"), ed = e.target.closest("[data-ze]"), c = e.target.closest("[data-zc]");
    if (d) { try { localStorage.setItem(KEY, d.dataset.zd); } catch { /* bỏ qua */ } return redraw(); }
    if (e.target.closest("#zAdd")) return edit(null, dept, redraw);
    if (e.target.closest("#zCrit")) return editCrit(crit, redraw);
    if (ed) return edit(all.find((z) => String(z.id) === ed.dataset.ze), dept, redraw);
    if (c) {
      const z = all.find((x) => String(x.id) === c.dataset.zc); let staff = myId;
      if (!(myId && zoneStaff(z).includes(myId))) { // QL bấm hộ: chọn NV phụ trách
        const who = zoneStaff(z); if (!who.length) return toast("Khu vực chưa gắn nhân viên trong tool — bấm ✏️ để chọn", "bad");
        staff = who.length === 1 ? who[0] : await pick(who); if (!staff) return;
      }
      c.disabled = true;
      try { const r = await rpc("zone_check", { p_id: z.id, p_staff: staff }); toast(r.message); redraw(); document.dispatchEvent(new Event("remind:refresh")); } catch (x) { err(x); c.disabled = false; }
    }
  };
}

async function pick(ids) {
  const v = await modal(`<h3>Báo xong hộ nhân viên</h3><form class="stack"><label>Nhân viên<select name="s">${ids.map((id) => `<option value="${esc(id)}">${esc(staffById(id)?.name || id)}</option>`).join("")}</select></label></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Xác nhận</button></div>`);
  return v && v.s;
}

async function editCrit(cur, redraw) {
  const v = await modal(`<h3>Tiêu chí vệ sinh chung</h3><form class="stack"><label>Mỗi dòng 1 ý (dòng đầu in đậm)<textarea name="t" rows="5">${esc(cur)}</textarea></label></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
  if (!v) return;
  const { error } = await sb.from("settings").upsert({ key: "CLEAN_CRITERIA", value: v.t.trim(), updated_by: S.me.email, updated_at: new Date().toISOString() });
  if (error) return err(error);
  await loadSettings(); toast("Đã lưu tiêu chí"); redraw();
}

async function edit(z, dept, redraw) {
  const isNew = !z; z = z || { dept, kind: "zone", name: "", detail: "", staff_text: "", staff_ids: [], sort: null };
  const guess = zoneStaff(z);
  const staffBox = (d) => visibleStaff().filter((s) => s.dept === d || /^pg$/i.test(s.dept)).sort((a, b) => (a.dept !== d) - (b.dept !== d)).map((s) => `<label class="chip inline tiny"><input type="checkbox" name="st_${esc(s.id)}" ${guess.includes(s.id) ? "checked" : ""}> ${esc(s.name)}${s.dept !== d ? ` <span class="muted">(${esc(s.dept)})</span>` : ""}</label>`).join("") || `<span class="tiny muted">Không có NV</span>`;
  const v = await modal(`<h3>${isNew ? "Thêm khu vực vệ sinh" : "Sửa: " + esc(z.name)}</h3><form class="stack">
      <div class="fields"><label>Bộ phận<select name="dept">${[...new Set([...depts(), z.dept])].map((d) => `<option ${d === z.dept ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></label>
        <label>Loại<select name="kind">${GROUPS.map(([k, l]) => `<option value="${k}" ${k === z.kind ? "selected" : ""}>${l.replace(/^\S+\s/, "")}</option>`).join("")}</select></label></div>
      <label>Tên khu vực / ca / vị trí<input name="name" required value="${esc(z.name)}" placeholder="VD: TỦ PHONE"></label>
      <label>Người phụ trách (ghi như bảng)<input name="staff_text" value="${esc(z.staff_text)}" placeholder="VD: Trâm + PG Oppo"></label>
      <fieldset style="border:1px solid var(--line);border-radius:9px;padding:8px 10px"><legend class="small muted">Gắn NV trong tool (để hiện “Khu vực của bạn” và bấm Xong)</legend><div class="chips" id="zStaff">${staffBox(z.dept)}</div></fieldset>
      <label>Tiêu chí — mỗi dòng 1 ý, bọc **chữ** để in đậm<textarea name="detail" rows="7">${esc(z.detail)}</textarea></label>
      <label>Thứ tự hiển thị<input name="sort" type="number" value="${z.sort ?? ""}" placeholder="Tự động"></label></form>
    <div class="modal-actions">${isNew ? "" : `<button class="btn danger" data-v="delete" type="button">Xoá</button><span class="grow"></span>`}<button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`,
    { onOpen: (b) => { const sel = b.querySelector("[name=dept]"); sel.onchange = () => { b.querySelector("#zStaff").innerHTML = staffBox(sel.value); }; } });
  if (!v) return;
  try {
    if (v === "delete") {
      if (!(await confirmBox("Xoá khu vực?", `“${esc(z.name)}” sẽ bị xoá khỏi danh sách vệ sinh.`, "Xoá", true))) return;
      await rpc("zone_delete", { p_id: z.id }); toast("Đã xoá"); return redraw();
    }
    const ids = Object.keys(v).filter((k) => k.startsWith("st_") && v[k] === "on").map((k) => k.slice(3));
    await rpc("zone_save", { p_id: z.id ?? null, p_data: { dept: v.dept, kind: v.kind, name: v.name, staff_text: v.staff_text, staff_ids: ids, detail: v.detail, sort: v.sort === "" ? null : Number(v.sort) } });
    try { localStorage.setItem(KEY, v.dept); } catch { /* bỏ qua */ }
    toast("Đã lưu khu vực"); redraw();
  } catch (x) { err(x); }
}
