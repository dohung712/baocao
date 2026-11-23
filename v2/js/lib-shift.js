// Đọc file lịch ca của tool sắp ca (cùng dạng bảng "Quản lý phân ca" HRM) — bản trình duyệt.
//   hàng ngày:   "T2 (23/11)" gộp 6 cột · hàng tiêu đề: Bộ phận | User | Họ tên | Tổng | Ca 1 … Ca 6 (lặp mỗi ngày)
//   hoặc bảng HRM: Bộ phận | Nhân viên ("18450 - Hùng") | Giờ công | Ca 1 … Ca 6 — đọc được cả hai
//   ô số giờ > 0 = làm ca đó. Bản giống hệt ở supabase/functions/_shared/shift.ts (máy chủ tự đọc file trong Drive) — sửa thì sửa cả hai.
const s = (v) => String(v ?? "").trim();
const norm = (x) => s(x).replace(/Đ/g, "D").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ");

function toDate(day, month, year, today) {
  const ty = Number(today.slice(0, 4)), t = Date.parse(today);
  const ys = year ? [year < 100 ? 2000 + year : year] : [ty - 1, ty, ty + 1];
  let best = "", diff = Infinity;
  for (const y of ys) {
    const d = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const x = Date.parse(d); if (isNaN(x)) continue;
    if (Math.abs(x - t) < diff) { diff = Math.abs(x - t); best = d; }
  }
  return best;
}

export function parseShiftAoa(aoa, today) {
  // Hàng tiêu đề = hàng có các ô "Ca 1 … Ca 6"; hàng ngay trên là ngày "T2 (23/11)"
  const hdr = aoa.findIndex((r) => Array.isArray(r) && r.filter((c) => /^ca\s*\d$/i.test(s(c))).length >= 3);
  if (hdr < 1) return { ok: false, msg: "Không thấy hàng tiêu đề Ca 1 … Ca 6 (dưới hàng ngày T2 (23/11)).", days: [], people: [] };
  const H = aoa[hdr], D = aoa[hdr - 1] || [];
  const find = (re) => { let i = H.findIndex((c) => re.test(s(c))); if (i < 0) i = D.findIndex((c) => re.test(s(c))); return i; };
  const cName = find(/^(họ\s*tên|ho\s*ten|tên|ten)$/i);
  const cDept = find(/^(bộ\s*phận|bo\s*phan)$/i);
  const cols = [];
  let day = "";
  for (let c = 0; c < H.length; c++) {
    if (s(D[c])) day = s(D[c]);
    const m = s(H[c]).match(/^ca\s*(\d)$/i), dm = day.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
    if (!m || !dm) continue;
    const d = toDate(Number(dm[1]), Number(dm[2]), dm[3] ? Number(dm[3]) : null, today);
    if (d) cols.push({ c, slot: Number(m[1]), d });
  }
  if (!cols.length) return { ok: false, msg: "Không đọc được ngày ở hàng trên tiêu đề (VD: T2 (23/11)).", days: [], people: [] };
  const days = [...new Set(cols.map((x) => x.d))].sort(), first = Math.min(...cols.map((x) => x.c));
  const people = [];
  let dept = "";
  for (let r = hdr + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    // Mã NV: ô trước cột Ca đầu tiên dạng "18450" (cột User) hoặc "18450 - Hùng" (bảng HRM: cột Nhân viên gộp mã + tên)
    let u = -1, mm = null;
    for (let c = 0; c < first; c++) { const x = s(row[c]).match(/^(\d{3,9})(?:\.0+)?(?:\s*[-–]\s*(.+))?$/); if (x) { u = c; mm = x; break; } }
    const lead = row.slice(0, u < 0 ? first : u).map(s).filter((x) => x && !/^[\d.,]+$/.test(x));
    if (cDept >= 0 && s(row[cDept]) && cDept !== u) dept = s(row[cDept]); else if (lead.length) dept = lead[0];
    if (u < 0) continue;
    const name = mm[2] ? s(mm[2]) : cName >= 0 && cName !== u ? s(row[cName]) : (row.slice(u + 1, first).map(s).find((x) => x && !/^[\d.,]+$/.test(x)) || "");
    const p = { user: mm[1], name, dept, days: {} };
    for (const d of days) p.days[d] = { slots: [], hours: 0 };
    for (const x of cols) {
      const v = Number(s(row[x.c]).replace(",", "."));
      if (v > 0) { p.days[x.d].slots.push(x.slot); p.days[x.d].hours += v; }
    }
    people.push(p);
  }
  if (!people.length) return { ok: false, msg: "File không có nhân viên nào (cột mã NV dạng 18450 hoặc 18450 - Tên).", days, people };
  return { ok: true, days, people };
}

export function matchStaff(people, staff) {
  const rows = [], unmatched = [], pairs = [];
  for (const p of people) {
    let st = staff.find((x) => String(x.id) === p.user);
    if (!st && p.name) {
      const nn = norm(p.name), last = nn.split(" ").pop();
      const full = staff.filter((x) => norm(x.name) === nn);
      const byLast = staff.filter((x) => norm(x.name).split(" ").pop() === last);
      st = full.length === 1 ? full[0] : byLast.length === 1 ? byLast[0] : undefined;
    }
    if (!st) { unmatched.push(p); continue; }
    pairs.push({ p, st });
    for (const [d, v] of Object.entries(p.days)) rows.push({ staff_id: st.id, d, slots: [...new Set(v.slots)].sort((a, b) => a - b), hours: Math.round(v.hours * 100) / 100, pos: p.dept || "" });
  }
  return { rows, unmatched, pairs };
}

// Đọc file Excel / CSV (ArrayBuffer) → mảng hàng. Thư viện SheetJS tải khi cần.
let XLSX = null;
export async function readSheet(buf) {
  XLSX ||= await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
}

// Giờ của từng ca (cài đặt SHIFT_SLOTS) → "Ca 3–5 · 12:00–21:00"
export function slotText(slots, cfg) {
  if (!slots?.length) return "OFF";
  const times = Array.isArray(cfg) ? cfg : [];
  const groups = [];
  for (const x of [...slots].sort((a, b) => a - b)) { const g = groups[groups.length - 1]; if (g && x === g[1] + 1) g[1] = x; else groups.push([x, x]); }
  return groups.map(([a, b]) => {
    const t1 = String(times[a - 1] || "").split("-")[0], t2 = String(times[b - 1] || "").split("-")[1];
    return `Ca ${a === b ? a : a + "–" + b}${t1 && t2 ? ` · ${t1}–${t2}` : ""}`;
  }).join(", ");
}
