// B16b Duyệt số BI của NV: thẻ NV đọc từ ảnh BI thành đề xuất; QL tick dòng cần lấy (DT QĐ, từng môn) rồi Duyệt
// → ghi vào lũy kế tháng (như 📈 Cập nhật lũy kế C12), bảng điểm C10 / Của tôi dùng số mới. Từ chối = không ghi gì.
import { esc, fmt, toast, dm, confirmBox } from "./ui.js";
import { sb, rpc, staffById, errMsg } from "./store.js";

const n2 = (x, d = 2) => (x === null || x === undefined ? "—" : fmt(x, d));
const ST = { approved: ["ok", "Đã duyệt"], rejected: ["bad", "Từ chối"], superseded: ["mute", "Có ảnh mới hơn"] };

export async function loadProposals() {
  const [p, h] = await Promise.all([
    sb.from("bi_proposals").select("*").eq("status", "pending").order("as_of", { ascending: false }).limit(200),
    sb.from("bi_proposals").select("id,staff_id,as_of,status,reviewed_by,reviewed_at,result").neq("status", "pending").order("reviewed_at", { ascending: false }).limit(12),
  ]);
  if (p.error) throw p.error;
  const list = p.data || [];
  // DT QĐ đang có trong tool tới ngày số liệu BI (để QL thấy chênh lệch)
  const tool = {};
  if (list.length) {
    const ids = [...new Set(list.map((x) => x.staff_id))], from = list.map((x) => x.month).sort()[0];
    const { data } = await sb.from("revenue_entries").select("staff_id,entry_date,amount").in("staff_id", ids).gte("entry_date", from).limit(20000);
    for (const x of list) tool[x.id] = (data || []).filter((r) => r.staff_id === x.staff_id && r.entry_date >= x.month && r.entry_date <= x.as_of).reduce((s, r) => s + Number(r.amount), 0);
  }
  return { list, tool, hist: h.data || [] };
}

export function proposalsHtml(P) {
  if (!P.list.length && !P.hist.length) return "";
  const name = (id) => staffById(id)?.name || id;
  const card = (x) => {
    const t = P.tool[x.id] ?? 0, d = x.revenue === null ? null : x.revenue - t;
    const ok = x.items.filter((i) => i.name && i.value !== null && i.value !== undefined), miss = x.items.filter((i) => !i.name);
    return `<div class="card bi-prop" data-pid="${x.id}">
      <label class="row" style="gap:8px"><input type="checkbox" class="bp-sel" checked><b>${esc(name(x.staff_id))}</b><span class="tiny muted">${esc(x.staff_id)} · số BI đến hết ${dm(x.as_of)}</span></label>
      ${x.revenue !== null ? `<label class="bp-line"><input type="checkbox" class="bp-rev" checked> <b>DT QĐ</b>: tool ${n2(t, 1)} → BI <b>${n2(x.revenue, 1)}</b> tr <span class="${d > 0 ? "pos" : d < 0 ? "neg" : "muted"}">(${d > 0 ? "+" : ""}${n2(d, 1)})</span></label>` : ""}
      ${ok.length ? `<div class="bp-items">${ok.map((i) => `<label class="bp-chip"><input type="checkbox" class="bp-item" value="${esc(i.name)}" checked> ${esc(i.name)} <b>${fmt(i.pct, 0)}%</b> → ${n2(i.value, i.sl ? 0 : 2)}/${n2(i.target)}</label>`).join("")}</div>` : `<p class="tiny muted">Không có môn nào ghép được với môn thi đua tháng của NV trong tool.</p>`}
      ${miss.length ? `<p class="tiny muted" style="margin:4px 0 0">Chưa ghép (không có trong môn tháng của NV): ${miss.map((i) => `${esc(i.bi_name)} ${fmt(i.pct, 0)}%`).join(" · ")}</p>` : ""}
      <div class="row" style="margin-top:8px"><button class="btn primary small" type="button" data-bp="ok">✅ Duyệt</button><button class="btn ghost small" type="button" data-bp="no">✖ Từ chối</button></div>
    </div>`;
  };
  return `<h3 class="td-sec">🟡 Số BI của NV chờ duyệt · ${P.list.length}</h3>
    ${P.list.length ? `<p class="small muted" style="margin:0 0 8px">Duyệt = ghi số BI làm <b>lũy kế tháng</b> đến ngày số liệu (giống 📈 Cập nhật lũy kế): DT QĐ và môn được tick sẽ thay số trong tool → bảng điểm, Của tôi dùng số mới. Môn tính theo % trên thẻ BI × target tháng trong tool. Bỏ tick dòng nào thì giữ số cũ của dòng đó.</p>
      <div class="row" style="margin-bottom:8px"><button class="btn primary" type="button" id="bpAll">✅ Duyệt các NV đã chọn</button></div>
      <div class="bi-props">${P.list.map(card).join("")}</div>` : `<p class="small muted">Không có đề xuất nào đang chờ.</p>`}
    ${P.hist.length ? `<details style="margin-top:8px"><summary class="small">Lịch sử duyệt</summary>${P.hist.map((h) => `<div class="small row" style="gap:6px;margin-top:4px"><span class="pill ${ST[h.status]?.[0] || "mute"}">${ST[h.status]?.[1] || h.status}</span>${esc(name(h.staff_id))} · số đến ${dm(h.as_of)}${h.result ? ` · ${h.result.changed} điều chỉnh` : ""}<span class="tiny muted">${h.reviewed_by ? esc(h.reviewed_by.split("@")[0]) + " · " : ""}${h.reviewed_at ? new Date(h.reviewed_at).toLocaleString("vi-VN") : ""}</span></div>`).join("")}</details>` : ""}`;
}

function pick(cardEl) {
  const id = cardEl.dataset.pid, rev = cardEl.querySelector(".bp-rev");
  return [id, { revenue: rev ? rev.checked : false, items: [...cardEl.querySelectorAll(".bp-item:checked")].map((x) => x.value) }];
}

export function bindProposals(box, reload) {
  box.onclick = async (e) => {
    const b = e.target.closest("[data-bp], #bpAll"); if (!b) return;
    let cards, ok;
    if (b.id === "bpAll") { cards = [...box.querySelectorAll(".bi-prop")].filter((c) => c.querySelector(".bp-sel")?.checked); ok = true; }
    else { cards = [b.closest(".bi-prop")]; ok = b.dataset.bp === "ok"; }
    if (!cards.length) { toast("Chưa chọn NV nào"); return; }
    if (ok && !(await confirmBox("Duyệt số BI", `Ghi số BI làm lũy kế tháng cho <b>${cards.length}</b> NV? Bảng điểm sẽ tính theo số mới (xem lại được ở Điểm & DT → Lịch sử).`, "Duyệt"))) return;
    if (!ok && !(await confirmBox("Từ chối", "Không ghi số BI này vào tool?", "Từ chối", true))) return;
    b.disabled = true;
    try {
      const r = await rpc("bi_review", { p_ids: cards.map((c) => Number(c.dataset.pid)), p_ok: ok, p_pick: ok ? Object.fromEntries(cards.map(pick)) : null });
      toast(r.message, 4000); reload();
    } catch (x) { toast(errMsg(x), 5000); b.disabled = false; }
  };
}
