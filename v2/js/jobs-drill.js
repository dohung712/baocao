// D25 Thống kê → bấm số xem ngay danh sách việc + 🔎 tìm nhanh bằng từ khoá + 🤖 AI nhận xét danh sách đang xem
import { esc, addDays, dm, dow } from "./ui.js";
import { staffById, callFn, errMsg } from "./store.js";
import { typeOf, STATE, vnAt, whenTxt, nPhotos, minsTxt } from "./jobs-common.js";

const nv = (s) => String(s || "").replace(/Đ/g, "D").replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pad = (n) => String(n).padStart(2, "0");
const STOP = new Set(["cv", "viec", "cua", "cac", "nhung", "xem", "tim", "nao", "gi", "la", "va", "nv", "co", "bi", "duoc", "o", "trong"]);

// Loại số bấm được
export const KIND = {
  all: ["📋", "Tất cả việc"], done: ["✅", "Nộp đúng hạn"], sub: ["📤", "Đã nộp"], late: ["⏰", "Nộp trễ"], miss: ["❌", "Bỏ lỡ"],
  open: ["⏳", "Chưa nộp"], over: ["🔥", "Quá hạn chưa nộp"], ph: ["📷", "Có ảnh"], pen: ["⭐", "Bị trừ sao"],
};
export function byKind(l, k, st) {
  const f = { all: () => true, done: (j) => st(j) === "done", sub: (j) => j.status === "done", late: (j) => st(j) === "late", miss: (j) => j.status === "missed",
    open: (j) => j.status === "todo", over: (j) => st(j) === "over", ph: (j) => nPhotos(j) > 0, pen: (j) => (j.penalty || 0) > 0 }[k] || (() => true);
  return l.filter(f);
}

// Gợi ý từ khoá (bấm là tìm)
export const KW_CHIPS = ["trễ", "bỏ lỡ", "chưa nộp", "quá hạn", "trễ > 60p", "không ảnh", "hôm nay", "hôm qua", "Topzone trễ", "TGDĐ bỏ lỡ", "PG chưa nộp"];

// Hiểu câu tìm: trạng thái (trễ / bỏ lỡ / chưa nộp / quá hạn / đúng hạn / đã nộp / không ảnh) · ngày (hôm nay, hôm qua, 24/11, T2…CN)
// · trễ hơn N phút / giờ (> 30p, > 1 giờ) · bộ phận (TGDĐ, Topzone, PG) · chữ còn lại: tên NV / tên việc / hạng mục / ghi chú
export function kwFilter(jobs, q, { st, today }) {
  let t = ` ${nv(q)} `;
  const f = { states: new Set(), dates: new Set(), dows: new Set(), depts: new Set(), minLate: 0, noPhoto: false }, said = [];
  const take = (re, fn) => { t = t.replace(re, (...m) => { fn(m); return " "; }); };
  take(/(?:tre\s*)?(?:>|tren|hon)\s*(\d+)\s*(phut|p|gio|g|h)\b/g, (m) => { f.minLate = Number(m[1]) * (/^[gh]/.test(m[2]) ? 60 : 1); said.push(`trễ ≥ ${minsTxt(f.minLate)}`); });
  take(/\b(nop tre|tre|muon)\b/g, () => f.states.add("late"));
  take(/\b(bo lo|miss)\b/g, () => f.states.add("miss"));
  take(/\b(qua han)\b/g, () => f.states.add("over"));
  take(/\b(chua nop|chua lam|chua xong)\b/g, () => f.states.add("open"));
  take(/\b(dung han)\b/g, () => f.states.add("done"));
  take(/\b(da nop|da xong|hoan tat)\b/g, () => f.states.add("sub"));
  take(/\b(khong anh|0 anh|thieu anh)\b/g, () => { f.noPhoto = true; said.push("không có ảnh"); });
  take(/\bhom nay\b/g, () => f.dates.add(today));
  take(/\bhom qua\b/g, () => f.dates.add(addDays(today, -1)));
  take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (m) => f.dates.add(`${m[3] || today.slice(0, 4)}-${pad(m[2])}-${pad(m[1])}`));
  take(/\b(?:thu\s*([2-7])|t([2-7])|(chu nhat|cn))\b/g, (m) => f.dows.add(m[3] ? 0 : Number(m[1] || m[2]) - 1));
  take(/\b(tgdd|topzone|pg|quan ly)\b/g, (m) => f.depts.add(m[1]));
  const words = t.split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w));
  for (const s of f.states) said.unshift(KIND[s][1].toLowerCase());
  if (f.dates.size) said.push([...f.dates].map((d) => dm(d)).join(", "));
  if (f.dows.size) said.push([...f.dows].map((d) => ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d]).join(", "));
  if (f.depts.size) said.push([...f.depts].map((d) => ({ tgdd: "TGDĐ", topzone: "Topzone", pg: "PG", "quan ly": "Quản lý" }[d])).join(", "));
  if (words.length) said.push(`có chữ “${words.join(" ")}”`);
  const list = jobs.filter((j) => {
    if (f.states.size && ![...f.states].some((k) => byKind([j], k, st).length)) return false;
    if (f.minLate && !((j.late_min || 0) >= f.minLate)) return false;
    if (f.noPhoto && !(j.status === "done" && nPhotos(j) === 0)) return false;
    const d = vnAt(j.due_at).date;
    if (f.dates.size && !f.dates.has(d)) return false;
    if (f.dows.size && !f.dows.has(new Date(`${d}T12:00:00+07:00`).getUTCDay())) return false;
    const s = staffById(j.staff_id);
    if (f.depts.size && ![...f.depts].some((x) => nv(s?.dept).includes(x))) return false;
    if (words.length) { const hay = nv([s?.name, s?.id, s?.dept, j.title, typeOf(j.type_id)?.name, j.note].join(" ")); if (!words.every((w) => hay.includes(w))) return false; }
    return true;
  });
  return { list, said: said.join(" · ") || "tất cả" };
}

// Bảng danh sách việc (mới nhất trên cùng) — bấm tên việc mở chi tiết (data-mj)
export function drillPanel(list, title, st) {
  const L = [...list].sort((a, b) => b.due_at.localeCompare(a.due_at)).slice(0, 300);
  const late = list.filter((j) => j.late_min > 0), sumLate = late.reduce((a, j) => a + j.late_min, 0);
  return `<div class="card jd-card" id="jdPanel" style="margin-bottom:14px"><div class="card-h"><h3>${title} · ${list.length} việc</h3>
      <span class="row" style="gap:6px">${list.length ? `<button class="btn small" type="button" id="jdAi">🤖 AI nhận xét</button>` : ""}<button class="btn small ghost" type="button" data-jdclose>✕ Đóng</button></span></div>
    ${late.length ? `<p class="small muted" style="margin:0 0 6px">Trễ ${late.length} lần · tổng ${minsTxt(sumLate)} · trung bình ${minsTxt(Math.round(sumLate / late.length))}</p>` : ""}
    <div id="jdAiOut"></div>
    ${!list.length ? `<div class="empty">Không có việc nào khớp.</div>` : `<div class="tbl-wrap"><table class="nosort jd-tbl"><thead><tr><th>Ngày</th><th>Hạn</th><th>Nhân viên</th><th>Việc</th><th>Trạng thái</th><th>Nộp lúc</th><th class="num">Trễ</th><th class="num">Ảnh</th></tr></thead><tbody>
      ${L.map((j) => { const x = st(j), d = vnAt(j.due_at), s = staffById(j.staff_id);
        return `<tr><td style="white-space:nowrap">${dow(d.date)} ${dm(d.date)}</td><td>${d.hm}</td><td style="white-space:nowrap">${esc(s?.name || j.staff_id)}</td>
          <td><a href="#" class="linkish" data-mj="${j.id}">${esc(typeOf(j.type_id)?.icon || "📌")} ${esc(j.title)}</a>${j.note ? `<div class="tiny muted">📝 ${esc(String(j.note).slice(0, 120))}</div>` : ""}</td>
          <td><span class="pill ${STATE[x][2]}">${STATE[x][0]} ${STATE[x][1]}</span></td><td style="white-space:nowrap">${j.done_at ? esc(whenTxt(j.done_at)) : ""}</td>
          <td class="num" style="color:var(--warn)">${j.late_min ? minsTxt(j.late_min) : ""}</td><td class="num">${nPhotos(j) || ""}</td></tr>`; }).join("")}
      </tbody></table></div>${list.length > L.length ? `<p class="tiny muted">Hiện ${L.length} / ${list.length} việc mới nhất — thu hẹp ngày hoặc từ khoá để xem hết.</p>` : ""}`}</div>`;
}

// 🤖 AI nhận xét danh sách đang xem (Cố vấn AI)
export async function drillAi(box, list, title, st) {
  box.innerHTML = `<p class="small muted">🤖 AI đang đọc ${list.length} việc…</p>`;
  const rows = [...list].sort((a, b) => b.due_at.localeCompare(a.due_at)).slice(0, 80).map((j) => {
    const d = vnAt(j.due_at), s = staffById(j.staff_id);
    return `${dm(d.date)} ${d.hm} | ${s?.name || j.staff_id} (${s?.dept || ""}) | ${j.title} | ${STATE[st(j)][1]}${j.late_min ? ` ${j.late_min} phút` : ""}`;
  });
  const q = `Đây là danh sách việc của nhân viên (${title.replace(/<[^>]+>/g, "")}, ${list.length} việc). Hãy phân tích ngắn gọn bằng gạch đầu dòng: `
    + `1) NV nào trễ / bỏ lỡ nhiều nhất, 2) việc nào và khung giờ / ngày nào hay bị trễ, 3) dấu hiệu bất thường, 4) 3 việc quản lý nên làm ngay. Chỉ dựa trên danh sách:\n` + rows.join("\n");
  try {
    const r = await callFn("advisor", { mode: "ask", question: q.slice(0, 7000) });
    box.innerHTML = `<div class="jd-ai">${esc(r.answer || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</div>`;
  } catch (e) { box.innerHTML = `<p class="small" style="color:var(--bad)">AI lỗi: ${esc(errMsg(e))}</p>`; }
}
