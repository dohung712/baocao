// Đọc file lịch ca của tool sắp ca (cùng dạng bảng "Quản lý phân ca" HRM):
//   hàng ngày:   "T2 (23/11)" gộp 6 cột · hàng tiêu đề: Bộ phận | User | Họ tên | Tổng | Ca 1 … Ca 6 (lặp mỗi ngày)
//   ô số giờ > 0 = làm ca đó. Bản giống hệt ở v2/js/lib-shift.js (trình duyệt) — sửa thì sửa cả hai.
const s = (v: unknown) => String(v ?? "").trim();
const norm = (x: string) => s(x).replace(/Đ/g, "D").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ");

function toDate(day: number, month: number, year: number | null, today: string) {
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

export type ShiftPerson = { user: string; name: string; dept: string; days: Record<string, { slots: number[]; hours: number }> };
export function parseShiftAoa(aoa: unknown[][], today: string): { ok: boolean; msg?: string; days: string[]; people: ShiftPerson[] } {
  const hdr = aoa.findIndex((r) => Array.isArray(r) && r.some((c) => /^user$/i.test(s(c))) && r.some((c) => /^ca\s*\d$/i.test(s(c))));
  if (hdr < 1) return { ok: false, msg: "Không thấy hàng tiêu đề (User, Họ tên, Ca 1 … Ca 6).", days: [], people: [] };
  const H = aoa[hdr] as unknown[], D = (aoa[hdr - 1] || []) as unknown[];
  const cUser = H.findIndex((c) => /^user$/i.test(s(c)));
  const cName = H.findIndex((c) => /^(họ\s*tên|ho\s*ten|tên|ten)$/i.test(s(c)));
  const cDept = H.findIndex((c) => /^(bộ\s*phận|bo\s*phan)$/i.test(s(c)));
  const cols: { c: number; slot: number; d: string }[] = [];
  let day = "";
  for (let c = 0; c < H.length; c++) {
    if (s(D[c])) day = s(D[c]);
    const m = s(H[c]).match(/^ca\s*(\d)$/i), dm = day.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
    if (!m || !dm) continue;
    const d = toDate(Number(dm[1]), Number(dm[2]), dm[3] ? Number(dm[3]) : null, today);
    if (d) cols.push({ c, slot: Number(m[1]), d });
  }
  if (!cols.length) return { ok: false, msg: "Không đọc được ngày ở hàng trên tiêu đề (VD: T2 (23/11)).", days: [], people: [] };
  const days = [...new Set(cols.map((x) => x.d))].sort();
  const people: ShiftPerson[] = [];
  let dept = "";
  for (let r = hdr + 1; r < aoa.length; r++) {
    const row = (aoa[r] || []) as unknown[];
    if (cDept >= 0 && s(row[cDept])) dept = s(row[cDept]);
    const user = s(row[cUser]).replace(/\.0+$/, "");
    if (!user || !/^[\w.-]{1,40}$/.test(user)) continue;
    const p: ShiftPerson = { user, name: cName >= 0 ? s(row[cName]) : "", dept, days: {} };
    for (const d of days) p.days[d] = { slots: [], hours: 0 };
    for (const x of cols) {
      const v = Number(s(row[x.c]).replace(",", "."));
      if (v > 0) { p.days[x.d].slots.push(x.slot); p.days[x.d].hours += v; }
    }
    people.push(p);
  }
  if (!people.length) return { ok: false, msg: "File không có nhân viên nào.", days, people };
  return { ok: true, days, people };
}

// Ghép người trong file với danh sách NV: theo mã (User), không có thì theo họ tên (đầy đủ, hoặc tên riêng duy nhất)
export function matchStaff(people: ShiftPerson[], staff: { id: string; name: string }[]) {
  const rows: { staff_id: string; d: string; slots: number[]; hours: number }[] = [], unmatched: ShiftPerson[] = [];
  for (const p of people) {
    let st = staff.find((x) => String(x.id) === p.user);
    if (!st && p.name) {
      const nn = norm(p.name), last = nn.split(" ").pop();
      const full = staff.filter((x) => norm(x.name) === nn);
      const byLast = staff.filter((x) => norm(x.name).split(" ").pop() === last);
      st = full.length === 1 ? full[0] : byLast.length === 1 ? byLast[0] : undefined;
    }
    if (!st) { unmatched.push(p); continue; }
    for (const [d, v] of Object.entries(p.days)) rows.push({ staff_id: st.id, d, slots: [...new Set(v.slots)].sort((a, b) => a - b), hours: Math.round(v.hours * 100) / 100 });
  }
  return { rows, unmatched };
}
