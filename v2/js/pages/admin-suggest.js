// F2c: dán kết quả thi đua siêu thị → gợi ý sao thưởng / phạt từng môn để đẩy số
// Nhóm (ưu tiên từ trên xuống): Đã về số lũy kế (0đ, không trừ) > Tập trung (5đ) > Target thấp (3đ) > Gần về số: dự kiến 70–100% (2đ) > Môn khác (1đ)
import { $, $$, esc, fmt, toast, confirmBox, vnToday, copyText } from "../ui.js";
import { sb, S, rpc, setting, loadItems, loadSettings, depts, errMsg } from "../store.js";
import { parseTargetReport } from "../lib-targets.js";
import { guessDept } from "./admin-score.js";

const DEF = { bonus: 100, penalty: 50, focus: 5, low: 3, near: 2, other: 1, done: 0, near_min: 70, hot_stars: 2000, hot_store_pct: 30, hot_staff_pct: 1000 };
export const starPoints = () => ({ ...DEF, ...(setting("STAR_POINTS", {}) || {}) });
const GROUPS = { done: ["✅ Đã về số", "ok"], focus: ["🎯 Tập trung", "bad"], low: ["🌱 Target thấp", "info"], near: ["⚡ Gần về số", "warn"], other: ["Môn khác", "mute"] };

let R = null, lastText = ""; // kết quả đã đọc + trạng thái chỉnh (giữ khi trang vẽ lại)
const findItem = (dept, name) => S.items.find((i) => i.store === dept && i.name === name) || S.items.find((i) => i.store === "Chung" && i.name === name) || S.items.find((i) => i.name === name);

export function suggestHtml() {
  const P = starPoints(), n = (k, w = 64) => `<input type="number" step="any" min="0" class="sgP" data-k="${k}" value="${P[k]}" style="width:${w}px;text-align:right">`;
  return `<details class="card" id="sgBox" style="margin-bottom:14px" open><summary><b>📊 Gợi ý sao theo kết quả siêu thị</b> <span class="muted small">— dán kết quả hiện tại, tool đề xuất thưởng/phạt từng môn để đẩy số</span></summary>
    <textarea id="sgText" style="margin-top:10px;min-height:110px;font:12px ui-monospace,Consolas,monospace" placeholder="Dán báo cáo “📊 TỔNG HỢP BÁO CÁO…” (có Tổng | %Đạt từng môn)"></textarea>
    <div class="sg-rules small">
      <div><b>Quy đổi:</b> 1 điểm = +${n("bonus")} thưởng / −${n("penalty")} phạt</div>
      <div>🎯 Tập trung ${n("focus", 52)} đ · 🌱 Target thấp ${n("low", 52)} đ · ⚡ Gần về số (dự kiến ${n("near_min", 52)}–100%) ${n("near", 52)} đ · Môn khác ${n("other", 52)} đ · ✅ Đã về số lũy kế: 0 sao, không trừ</div>
      <div>🔥 <b>Thưởng nóng</b> môn target thấp: ${n("hot_stars", 80)}⭐ khi NV bán trong ngày ≥ ${n("hot_store_pct", 52)}% target tháng siêu thị hoặc &gt; ${n("hot_staff_pct", 64)}% target ngày (quản lý duyệt)</div>
      <div class="row"><button class="btn small" id="sgSaveP" type="button">💾 Lưu quy đổi</button><span class="muted">Ngày đã qua <input type="number" id="sgPassed" min="1" max="31" style="width:56px"> / <input type="number" id="sgDays" min="1" max="31" style="width:56px"> ngày (để tính % dự kiến)</span></div>
    </div>
    <div id="sgPrev"></div></details>`;
}

export function bindSuggest(onApplied) {
  if (!$("#sgBox")) return;
  const t = vnToday(), days = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7), 0)).getUTCDate();
  $("#sgPassed").value = Math.max(1, Number(t.slice(8, 10)) - 1); $("#sgDays").value = days;
  const parse = () => {
    lastText = $("#sgText").value; const r = parseTargetReport(lastText);
    if (!r.blocks.length) { $("#sgPrev").innerHTML = `<p class="small neg">Không nhận ra báo cáo — cần dòng “=== SIÊU THỊ … ===” và “+ … : Tổng … | %Đạt … | Mỗi NV …”.</p>`; R = null; return; }
    R = { blocks: r.blocks.map((b) => { const dept = guessDept(b.label); return { ...b, dept, rows: b.items.map((it) => rowState(dept, it)) }; }) };
    draw();
  };
  $("#sgText").addEventListener("paste", () => setTimeout(parse, 30));
  if (lastText) { $("#sgText").value = lastText; parse(); }
  $("#sgText").addEventListener("change", parse);
  $("#sgBox").addEventListener("input", (e) => {
    if (e.target.matches(".sgP, #sgPassed, #sgDays")) { if (R) { R.blocks.forEach((b) => b.rows.forEach((r) => { r.edited = false; })); draw(); } return; }
    const tr = e.target.closest("[data-r]"); if (!tr || !R) return;
    const [bi, ri] = tr.dataset.r.split(".").map(Number), r = R.blocks[bi].rows[ri];
    if (e.target.matches(".sgF")) { r.focus = e.target.checked; r.edited = false; }
    if (e.target.matches(".sgL")) { r.low = e.target.checked; r.edited = false; }
    if (e.target.matches(".sgB")) { r.bonus = Number(e.target.value) || 0; r.edited = true; return; }
    if (e.target.matches(".sgPen")) { r.penalty = Number(e.target.value) || 0; r.edited = true; return; }
    draw();
  });
  $("#sgBox").addEventListener("change", (e) => {
    if (!e.target.matches(".sgDept") || !R) return;
    const b = R.blocks[Number(e.target.dataset.b)]; b.dept = e.target.value; b.rows = b.items.map((it) => rowState(b.dept, it)); draw();
  });
  $("#sgSaveP").onclick = async () => {
    const v = Object.fromEntries($$(".sgP").map((i) => [i.dataset.k, Number(i.value) || 0]));
    const { error } = await sb.from("settings").upsert({ key: "STAR_POINTS", value: { ...starPoints(), ...v }, updated_by: S.me.email, updated_at: new Date().toISOString() });
    if (error) return toast(errMsg(error)); await loadSettings(); toast("Đã lưu quy đổi điểm → sao");
  };
  $("#sgBox").addEventListener("click", async (e) => {
    if (e.target.id === "sgCopy") toast((await copyText(summary())) ? "Đã copy — dán vào nhóm Zalo/Line" : "Không copy được");
    if (e.target.id === "sgApply") apply(e.target, onApplied);
  });
}

function rowState(dept, it) {
  const item = dept ? findItem(dept, it.name) : null;
  return { name: it.name, total: it.total, pct: it.pct ?? 0, item, focus: !!item?.focus, low: !!item?.low_target, bonus: 0, penalty: 0, edited: false };
}
const P = () => ({ ...starPoints(), ...Object.fromEntries($$(".sgP").map((i) => [i.dataset.k, Number(i.value) || 0])) });
const forecast = (pct) => { const p = Math.max(1, Number($("#sgPassed").value) || 1), d = Math.max(p, Number($("#sgDays").value) || 30); return (pct * d) / p; };
function classify(r, pt) {
  const fc = forecast(r.pct);
  if (r.pct >= 100) return "done";
  if (r.focus) return "focus";
  if (r.low) return "low";
  if (fc >= pt.near_min && fc < 100) return "near";
  return "other";
}
function draw() {
  const pt = P();
  for (const b of R.blocks) for (const r of b.rows) {
    r.group = classify(r, pt); r.points = pt[r.group] ?? 0;
    if (!r.edited) { r.bonus = r.group === "done" ? 0 : Math.round(r.points * pt.bonus); r.penalty = r.group === "done" ? 0 : Math.round(r.points * pt.penalty); }
  }
  $("#sgPrev").innerHTML = R.blocks.map((b, bi) => `<div class="card sg-blk" style="box-shadow:none;margin-top:12px"><div class="card-h"><h3>Siêu thị ${esc(b.code)} · ${esc(b.label)}</h3>
      <label class="inline small">Áp dụng cho bộ phận <select class="sgDept" data-b="${bi}" style="width:auto">${["", ...depts()].map((d) => `<option value="${esc(d)}" ${d === b.dept ? "selected" : ""}>${d ? esc(d) : "— chọn —"}</option>`).join("")}</select></label></div>
    <div class="tbl-wrap"><table class="sg-tbl"><thead><tr><th>Môn</th><th class="num">%Đạt</th><th class="num">Dự kiến</th><th title="Môn tập trung của tháng">Tập trung</th><th title="Môn target thấp, chạy đầu tháng">Target thấp</th><th>Nhóm</th><th class="num">Thưởng</th><th class="num">Phạt</th><th class="num">Hiện tại</th></tr></thead><tbody>
    ${b.rows.map((r, ri) => { const g = GROUPS[r.group]; return `<tr data-r="${bi}.${ri}" class="${r.item ? "" : "muted"}"><td><b>${esc(r.name)}</b>${r.item ? "" : '<div class="tiny neg">chưa có môn này trong tool</div>'}</td>
      <td class="num">${fmt(r.pct, 1)}%</td><td class="num ${forecast(r.pct) >= 100 ? "pos" : ""}">${fmt(forecast(r.pct), 0)}%</td>
      <td><input type="checkbox" class="sgF" ${r.focus ? "checked" : ""} ${r.item ? "" : "disabled"}></td><td><input type="checkbox" class="sgL" ${r.low ? "checked" : ""} ${r.item ? "" : "disabled"}></td>
      <td><span class="pill ${g[1]}">${g[0]}</span> <span class="tiny muted">${r.points}đ</span></td>
      <td class="num"><input type="number" class="sgB" step="50" min="0" value="${r.bonus}" style="width:84px;text-align:right" ${r.item ? "" : "disabled"}></td>
      <td class="num"><input type="number" class="sgPen" step="50" min="0" value="${r.penalty}" style="width:84px;text-align:right" ${r.item ? "" : "disabled"}></td>
      <td class="num small muted">${r.item ? `+${fmt(r.item.bonus_star)} / −${fmt(r.item.penalty_star)}` : "—"}</td></tr>`; }).join("")}
    </tbody></table></div></div>`).join("")
    + `<div class="row" style="margin-top:12px"><button class="btn primary" id="sgApply" type="button">✅ Áp dụng sao cho các môn</button><button class="btn" id="sgCopy" type="button">📋 Copy kết quả + gợi ý</button>
      <span class="small muted">Tick Tập trung / Target thấp được lưu cho cả tháng. Ô Thưởng/Phạt sửa tay được.</span></div>`;
}
function summary() {
  if (!R) return "";
  const pt = P(), out = [`📊 KẾT QUẢ THI ĐUA & SAO ÁP DỤNG (${vnToday().slice(8, 10)}/${vnToday().slice(5, 7)})`];
  for (const b of R.blocks) {
    out.push("", `🏬 ${b.code} · ${b.label}`);
    for (const g of ["focus", "low", "near", "other", "done"]) {
      const rows = b.rows.filter((r) => r.group === g); if (!rows.length) continue;
      out.push(`${GROUPS[g][0]}:`);
      rows.forEach((r) => out.push(`  • ${r.name}: ${fmt(r.pct, 1)}% (dự kiến ${fmt(forecast(r.pct), 0)}%)${g === "done" ? "" : ` → +${fmt(r.bonus)} / −${fmt(r.penalty)}⭐`}`));
    }
  }
  if (pt.hot_stars > 0) out.push("", `🔥 Thưởng nóng ${fmt(pt.hot_stars)}⭐: môn target thấp bán trong ngày ≥ ${fmt(pt.hot_store_pct)}% target siêu thị hoặc > ${fmt(pt.hot_staff_pct)}% target ngày của bạn!`);
  return out.join("\n");
}
async function apply(btn, onApplied) {
  if (!R) return;
  const blocks = R.blocks.filter((b) => b.rows.some((r) => r.item));
  if (blocks.some((b) => !b.dept)) return toast("Chọn bộ phận cho từng siêu thị");
  const n = blocks.reduce((a, b) => a + b.rows.filter((r) => r.item).length, 0);
  if (!(await confirmBox("Áp dụng sao?", `Cập nhật sao thưởng/phạt cho <b>${n}</b> môn. Báo cáo từ giờ trở đi tính theo mức mới (báo cáo đã nộp không đổi).`, "Áp dụng"))) return;
  btn.disabled = true;
  try {
    const msgs = [];
    for (const b of blocks) {
      const res = await rpc("apply_star_suggestions", { p_dept: b.dept, p_as_of: vnToday(), p_rows: b.rows.filter((r) => r.item).map((r) => ({ name: r.name, bonus: r.bonus, penalty: r.penalty, focus: r.focus, low: r.low, store_target: r.total, store_pct: r.pct })) });
      msgs.push(res.message);
    }
    await loadItems(); toast("✅ " + msgs.join(" · "), 5000); onApplied?.();
  } catch (x) { toast(errMsg(x), 5000); btn.disabled = false; }
}
