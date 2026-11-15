// Luật thưởng / trừ sao (F2): đọc cài đặt, mô phỏng chuỗi ngày chưa về số, trình chỉnh trong Quản lý → Cài đặt
import { $, $$, esc, fmt, toast } from "./ui.js";
import { setting } from "./store.js";

export const DEF = { STREAK_OVERTIME: 3, STREAK_PENALTY_STAR: 5, PEN_T2_MIN: 4, PEN_T3_MIN: 6, PEN_T4_MIN: 8, PEN_M1: 1, PEN_M2: 1.5, PEN_M3: 2, PEN_M4: 5, DOUBLE_BONUS_RATE: 150, TRIPLE_BONUS_RATE: 200 };
export const NO_OT = 99; // ngưỡng tăng ca "không bao giờ"
export const readRules = () => Object.fromEntries(Object.entries(DEF).map(([k, d]) => [k, Number(setting(k, d)) || (k.startsWith("PEN_M") ? d : 0)]));

// Ngày chưa về số thứ `day` liên tiếp (chuỗi trước đó = day − 1) → hình thức. Giống _compute_report ở máy chủ.
export function dayOutcome(c, day) {
  const s = day - 1, ot = c.STREAK_OVERTIME, pen = c.STREAK_PENALTY_STAR;
  const mult = s >= c.PEN_T4_MIN ? c.PEN_M4 : s >= c.PEN_T3_MIN ? c.PEN_M3 : s >= c.PEN_T2_MIN ? c.PEN_M2 : c.PEN_M1;
  if (s < ot && s < pen) return { kind: "note", mult };
  if (s < pen) return { kind: "ot", mult };
  if (s < ot) return { kind: "pen", mult };
  return { kind: "choose", mult };
}
export function outcomeLabel(o, penalty) {
  const stars = `<b class="neg">−${fmt(Math.round(penalty * o.mult))}⭐</b>${o.mult !== 1 ? ` <span class="tiny muted">(×${fmt(o.mult, 2)})</span>` : ""}`;
  return { note: '<span class="pill mute">Chỉ ghi nhận chuỗi</span>', ot: '<span class="pill info">Tăng ca ⏰</span>', pen: `<span class="pill bad">Trừ sao</span> ${stars}`, choose: `<span class="pill bad">Trừ sao</span> ${stars} <span class="small muted">hoặc NV chọn tăng ca</span>` }[o.kind];
}
export const ladderRows = (c, penalty, days = 10) => Array.from({ length: days }, (_, i) => `<tr><td>Ngày thứ <b>${i + 1}</b></td><td>${outcomeLabel(dayOutcome(c, i + 1), penalty)}</td></tr>`).join("");

// ---------- Trình chỉnh (Quản lý → Cài đặt) ----------
export function starCardHtml() {
  const c = readRules(), noOt = c.STREAK_OVERTIME >= NO_OT;
  const n = (id, v, attrs = "") => `<input type="number" id="${id}" value="${v}" step="any" min="0" ${attrs} style="width:84px;text-align:right">`;
  return `<div class="card" style="margin-bottom:14px" id="starCard"><div class="card-h"><h2>⭐ Thưởng & trừ sao</h2>
      <div class="row"><button class="btn small" id="psOld" type="button">Như bản cũ</button><button class="btn small" id="psNow" type="button">Trừ ngay khi chưa đạt</button><button class="btn small primary" id="psSave" type="button">💾 Lưu</button></div></div>
    <div class="grid2">
      <div class="stack" style="gap:10px">
        <h3>Thưởng (đạt ≥ 100% target ngày)</h3>
        <p class="small muted" style="margin:0">Cộng <b>sao thưởng</b> khai báo của môn. Chỉ môn được đánh dấu mới nhân:</p>
        <label class="inline">Môn X2 hoặc X3 đạt ≥ ${n("ps_DOUBLE_BONUS_RATE", c.DOUBLE_BONUS_RATE)} % target → <b>×2</b></label>
        <label class="inline">Môn X3 đạt ≥ ${n("ps_TRIPLE_BONUS_RATE", c.TRIPLE_BONUS_RATE)} % target → <b>×3</b></label>
        <h3 style="margin-top:6px">Trừ sao (dưới 100%, chưa đạt nhiều ngày liền)</h3>
        <label class="inline">Bắt đầu <b>trừ sao</b> từ ngày chưa đạt thứ ${n("ps_pen", c.STREAK_PENALTY_STAR + 1, 'min="1" step="1"')}</label>
        <label class="inline">Cho <b>tăng ca</b> thay trừ sao từ ngày thứ ${n("ps_ot", noOt ? "" : c.STREAK_OVERTIME + 1, 'min="1" step="1"' + (noOt ? " disabled" : ""))}
          <span class="inline small"><input type="checkbox" id="ps_noot" ${noOt ? "checked" : ""}> không dùng tăng ca</span></label>
        <div class="small"><b>Hệ số trừ lũy tiến</b> (sao trừ = sao phạt của môn × hệ số)</div>
        <label class="inline">Từ ngày thứ 1: × ${n("ps_M1", c.PEN_M1)}</label>
        ${[2, 3, 4].map((k) => `<label class="inline">Từ ngày thứ ${n("ps_T" + k, c["PEN_T" + k + "_MIN"] + 1, 'min="1" step="1"')} : × ${n("ps_M" + k, c["PEN_M" + k])}</label>`).join("")}
        <p class="tiny muted" style="margin:0">Không đủ sao để trừ → tự chuyển tăng ca. Có 1 ngày về số → chuỗi về 0. Chọn tăng ca thì chuỗi không tăng. Môn/bộ phận/NV có ngưỡng riêng: bảng “Quy tắc riêng” bên dưới.</p>
      </div>
      <div><div class="row" style="justify-content:space-between"><h3>Xem trước</h3><label class="inline small">Môn có sao phạt ${n("ps_sample", 100)}</label></div>
        <div class="tbl-wrap"><table><thead><tr><th>Chưa đạt liên tiếp</th><th>Kết quả</th></tr></thead><tbody id="psPrev"></tbody></table></div></div>
    </div></div>`;
}
export function bindStarCard(save) {
  const box = $("#starCard"); if (!box) return;
  const val = (id) => Number($("#" + id).value);
  const cfg = () => ({
    DOUBLE_BONUS_RATE: val("ps_DOUBLE_BONUS_RATE") || 150, TRIPLE_BONUS_RATE: val("ps_TRIPLE_BONUS_RATE") || 200,
    STREAK_PENALTY_STAR: Math.max(0, Math.round(val("ps_pen") || 1) - 1),
    STREAK_OVERTIME: $("#ps_noot").checked ? NO_OT : Math.max(0, Math.round(val("ps_ot") || 1) - 1),
    PEN_M1: val("ps_M1") || 1, PEN_T2_MIN: Math.max(0, Math.round(val("ps_T2") || 1) - 1), PEN_M2: val("ps_M2") || 1,
    PEN_T3_MIN: Math.max(0, Math.round(val("ps_T3") || 1) - 1), PEN_M3: val("ps_M3") || 1, PEN_T4_MIN: Math.max(0, Math.round(val("ps_T4") || 1) - 1), PEN_M4: val("ps_M4") || 1,
  });
  const draw = () => { $("#psPrev").innerHTML = ladderRows(cfg(), val("ps_sample") || 100); };
  const fill = (c) => {
    for (const k of ["DOUBLE_BONUS_RATE", "TRIPLE_BONUS_RATE"]) $("#ps_" + k).value = c[k];
    $("#ps_pen").value = c.STREAK_PENALTY_STAR + 1; const no = c.STREAK_OVERTIME >= NO_OT; $("#ps_noot").checked = no; $("#ps_ot").disabled = no; $("#ps_ot").value = no ? "" : c.STREAK_OVERTIME + 1;
    $("#ps_M1").value = c.PEN_M1; for (const k of [2, 3, 4]) { $("#ps_T" + k).value = c["PEN_T" + k + "_MIN"] + 1; $("#ps_M" + k).value = c["PEN_M" + k]; }
    draw();
  };
  box.addEventListener("input", (e) => { if (e.target.id === "ps_noot") { $("#ps_ot").disabled = e.target.checked; if (!e.target.checked && !$("#ps_ot").value) $("#ps_ot").value = 4; } draw(); });
  $("#psOld").onclick = () => fill(DEF);
  $("#psNow").onclick = () => fill({ ...cfg(), STREAK_PENALTY_STAR: 0, STREAK_OVERTIME: NO_OT });
  $("#psSave").onclick = async () => {
    const c = cfg();
    if (c.TRIPLE_BONUS_RATE < c.DOUBLE_BONUS_RATE) return toast("Ngưỡng X3 phải ≥ ngưỡng X2");
    if (!(c.PEN_T2_MIN <= c.PEN_T3_MIN && c.PEN_T3_MIN <= c.PEN_T4_MIN)) return toast("Các mốc hệ số phải tăng dần");
    try { await save(Object.entries(c)); toast("Đã lưu luật thưởng / trừ sao"); } catch (x) { toast(x.message || String(x), 4000); }
  };
  draw();
}
export const multLabel = (i) => i.is_x3 || i.isX3 ? "X3" : i.is_x2 || i.isX2 ? "X2" : "";
// Target báo cáo ngày của NV đã giao môn tháng (giống _daily_target ở máy chủ): % × (target tháng ÷ ngày làm), làm tròn lên, tối thiểu
export const dailyPct = () => Number(setting("DAILY_TARGET_PCT", 200)) || 100;
export const dailyMin = () => Number(setting("DAILY_TARGET_MIN", 0.5)) || 0;
export const dailyTarget = (base) => Math.max(dailyMin(), Math.ceil(Math.round(base * dailyPct() * 100) / 100) / 100);
