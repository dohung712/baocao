// D17 🤖 Xếp ca tự động — bộ xếp ca (thuần JS, không DOM; chạy được bằng node để kiểm thử).
// Thứ tự ưu tiên (người dùng chốt 23/11/2026):
//   1. Lịch OFF  → cứng: ngày OFF không xếp ca
//   2. Lịch bận  → cứng: không xếp ca trùng ca bận (bận chưa ghi ca = bận cả ngày)
//   3. Rule QL   → mềm theo trọng số: tối thiểu ngày OFF / tuần > đủ người mỗi ca (chỉ đếm bộ phận trong count_pos)
//                  > cặp NV "trái ca" (không làm chung giờ nếu có thể) > chia đều giờ công > ít ca thừa
// Mỗi ngày NV làm 1 khối ca liền mạch (VD Ca 1–3), tổng giờ ≤ max_day_h.

export const W = { short: 1000, off: 50000, pair: 80, over: 30, day: 15, bal: 1 };   // off > thiếu cả ngày → luôn đủ ngày nghỉ tối thiểu

// Giờ từng ca từ cài đặt SHIFT_SLOTS ["07:30-09:00", …] → [1.5, 3, 3, 3, 3, 1]
export function slotHours(slots) {
  const def = [1.5, 3, 3, 3, 3, 1];
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const m = String((slots || [])[i] || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return def[i];
    const h = (Number(m[3]) * 60 + Number(m[4]) - Number(m[1]) * 60 - Number(m[2])) / 60;
    return h > 0 ? h : def[i];
  });
}

// Các khối ca liền mạch [a..b] có tổng giờ ≤ maxH (kèm khối rỗng = nghỉ)
export function patterns(hours, maxH) {
  const out = [[]];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
    const p = []; let h = 0;
    for (let x = a; x <= b; x++) { p.push(x); h += hours[x - 1]; }
    if (h <= maxH + 1e-9) out.push(p);
  }
  return out;
}

// Số người cần cho thứ isodow (1 = T2 … 7 = CN) → mảng 6 số
export function needOf(store, isodow) {
  const n = store?.need?.[String(isodow)];
  return [0, 1, 2, 3, 4, 5].map((i) => Math.max(0, Number(Array.isArray(n) ? n[i] : 0) || 0));
}

const isoDow = (d) => { const x = new Date(d + "T00:00:00Z").getUTCDay(); return x === 0 ? 7 : x; };

// Xếp ca 1 tuần cho 1 siêu thị.
//   days:   7 ngày "YYYY-MM-DD" (T2 → CN)
//   staff:  [{ id, name }] — chỉ NV được đếm (bộ phận trong count_pos)
//   busy:   [{ staff_id, busy_date, type: "OFF"|"BAN", shifts: [..] }]
//   cfg:    { max_day_h, min_off, pairs: [[id, id]] }, store: { need: { "1": [6 số], … } }
//   fixed:  { "<id>|<d>": [ca…] } — ô QL đã chốt tay, giữ nguyên
export function solve({ days, staff, busy, cfg, store, slots, fixed = {}, seed = 1, restarts = 24 }) {
  const hours = slotHours(slots), maxH = Number(cfg?.max_day_h) || 9, minOff = Math.max(0, Math.min(7, Number(cfg?.min_off ?? 1)));
  const P = patterns(hours, maxH), PH = P.map((p) => p.reduce((s, x) => s + hours[x - 1], 0));
  const need = days.map((d) => needOf(store, isoDow(d)));
  const S = staff.length, D = days.length;
  const idx = new Map(staff.map((s, i) => [String(s.id), i]));
  const pairs = (cfg?.pairs || []).map(([a, b]) => [idx.get(String(a)), idx.get(String(b))]).filter(([a, b]) => a !== undefined && b !== undefined && a !== b);
  const bmap = new Map((busy || []).map((b) => [String(b.staff_id) + "|" + b.busy_date, b]));

  // Khối được phép cho từng ô (NV × ngày): ưu tiên 1 + 2 là ràng buộc cứng
  const allowed = [], locked = [];
  for (let i = 0; i < S; i++) {
    allowed.push([]); locked.push([]);
    for (let j = 0; j < D; j++) {
      const key = String(staff[i].id) + "|" + days[j];
      if (fixed[key]) {
        const f = [...fixed[key]].sort((a, b) => a - b);
        let k = P.findIndex((p) => p.length === f.length && p.every((x, t) => x === f[t]));
        if (k < 0) { P.push(f); PH.push(f.reduce((s, x) => s + hours[x - 1], 0)); k = P.length - 1; }
        allowed[i].push([k]); locked[i].push(true); continue;
      }
      const b = bmap.get(key);
      let ok = P.map((_, k) => k);
      if (b) {
        const sh = Array.isArray(b.shifts) ? b.shifts.map(Number) : [];
        ok = b.type === "OFF" || !sh.length ? [0] : ok.filter((k) => !P[k].some((x) => sh.includes(x)));
      }
      allowed[i].push(ok); locked[i].push(false);
    }
  }

  // Chi phí của cả lịch (đủ nhỏ để tính lại toàn bộ mỗi lần thử)
  function cost(g) {
    let c = 0;
    const tot = new Array(S).fill(0);
    for (let j = 0; j < D; j++) {
      const cnt = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < S; i++) { const k = g[i][j]; for (const x of P[k]) cnt[x - 1]++; tot[i] += PH[k]; if (k) c += W.day; }
      for (let x = 0; x < 6; x++) { const d = need[j][x] - cnt[x]; c += d > 0 ? d * W.short * hours[x] : -d * W.over * hours[x]; }
      for (const [a, b] of pairs) { const pa = P[g[a][j]]; for (const x of P[g[b][j]]) if (pa.includes(x)) c += W.pair * hours[x - 1]; }
    }
    for (let i = 0; i < S; i++) { let w = 0; for (let j = 0; j < D; j++) if (g[i][j]) w++; const ex = w - (D - minOff); if (ex > 0) c += ex * W.off; }
    const mean = tot.reduce((s, x) => s + x, 0) / (S || 1);
    for (const t of tot) c += W.bal * (t - mean) * (t - mean);
    return c;
  }

  let rnd = seed >>> 0 || 1;
  const rand = () => { rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5; return (rnd >>> 0) / 4294967296; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cells = []; for (let i = 0; i < S; i++) for (let j = 0; j < D; j++) if (!locked[i][j] && allowed[i][j].length > 1) cells.push([i, j]);

  let best = null, bestC = Infinity;
  for (let r = 0; r < Math.max(1, restarts); r++) {
    const g = allowed.map((row) => row.map((ok) => (ok.length === 1 ? ok[0] : r === 0 ? 0 : ok[Math.floor(rand() * ok.length)])));
    let cur = cost(g);
    for (let sweep = 0; sweep < 30; sweep++) {
      let improved = false;
      for (const [i, j] of shuffle(cells.slice())) {
        const old = g[i][j]; let bk = old, bc = cur;
        for (const k of allowed[i][j]) { if (k === old) continue; g[i][j] = k; const c = cost(g); if (c < bc - 1e-9) { bc = c; bk = k; } }
        g[i][j] = bk; if (bk !== old) { cur = bc; improved = true; }
      }
      // Đổi chéo khối của 2 NV trong cùng ngày (thoát cực tiểu cục bộ khi chia đều giờ / cặp trái ca)
      for (let j = 0; j < D; j++) for (let a = 0; a < S; a++) for (let b = a + 1; b < S; b++) {
        const ka = g[a][j], kb = g[b][j];
        if (ka === kb || locked[a][j] || locked[b][j] || !allowed[a][j].includes(kb) || !allowed[b][j].includes(ka)) continue;
        g[a][j] = kb; g[b][j] = ka; const c = cost(g);
        if (c < cur - 1e-9) { cur = c; improved = true; } else { g[a][j] = ka; g[b][j] = kb; }
      }
      if (!improved) break;
    }
    if (cur < bestC) { bestC = cur; best = g.map((row) => row.slice()); }
  }

  const grid = {};
  for (let i = 0; i < S; i++) for (let j = 0; j < D; j++) grid[String(staff[i].id) + "|" + days[j]] = P[best ? best[i][j] : 0].slice();
  return { grid, cost: Math.round(bestC), ...report({ days, staff, grid, cfg, store, slots, busy }) };
}

// Báo cáo 1 lịch (kể cả lịch QL đã sửa tay): thiếu / thừa người từng ca, giờ từng NV, cặp trùng giờ, trùng lịch bận
export function report({ days, staff, grid, cfg, store, slots, busy }) {
  const hours = slotHours(slots), maxH = Number(cfg?.max_day_h) || 9, minOff = Number(cfg?.min_off ?? 1);
  const ids = new Set(staff.map((s) => String(s.id)));
  const short = [], over = [], pairHits = [], busyHits = [], longDays = [], noOff = [], gaps = [];
  const cover = {};
  days.forEach((d) => {
    const need = needOf(store, isoDow(d)), cnt = [0, 0, 0, 0, 0, 0];
    for (const s of staff) for (const x of grid[s.id + "|" + d] || []) cnt[x - 1]++;
    cover[d] = need.map((n, x) => ({ need: n, have: cnt[x] }));
    need.forEach((n, x) => { if (cnt[x] < n) short.push({ d, slot: x + 1, need: n, have: cnt[x] }); if (cnt[x] > n) over.push({ d, slot: x + 1, need: n, have: cnt[x] }); });
    for (const [a, b] of cfg?.pairs || []) {
      if (!ids.has(String(a)) || !ids.has(String(b))) continue;
      const pa = grid[a + "|" + d] || [], both = (grid[b + "|" + d] || []).filter((x) => pa.includes(x));
      if (both.length) pairHits.push({ d, a: String(a), b: String(b), slots: both });
    }
  });
  const per = staff.map((s) => {
    let h = 0, w = 0;
    for (const d of days) {
      const g = grid[s.id + "|" + d] || [];
      const hh = g.reduce((t, x) => t + hours[x - 1], 0); h += hh; if (g.length) w++;
      if (hh > maxH + 1e-9) longDays.push({ id: String(s.id), d, h: hh });
      const so = [...g].sort((a, b) => a - b); if (so.some((x, t) => t && x !== so[t - 1] + 1)) gaps.push({ id: String(s.id), d });
      const b = (busy || []).find((x) => String(x.staff_id) === String(s.id) && x.busy_date === d);
      if (b && g.length) {
        const sh = Array.isArray(b.shifts) ? b.shifts.map(Number) : [];
        const hit = b.type === "OFF" || !sh.length ? g : g.filter((x) => sh.includes(x));
        if (hit.length) busyHits.push({ id: String(s.id), d, kind: b.type === "OFF" ? "off" : "ban", slots: hit });
      }
    }
    if (days.length - w < minOff) noOff.push({ id: String(s.id), off: days.length - w });
    return { id: String(s.id), name: s.name, hours: Math.round(h * 10) / 10, days: w };
  });
  const missing = short.reduce((t, x) => t + (x.need - x.have) * hours[x.slot - 1], 0);
  return { cover, short, over, pairHits, busyHits, longDays, noOff, gaps, per, missingHours: Math.round(missing * 10) / 10 };
}

// Bảng Excel cùng dạng "CA LÀM VIỆC.xlsx" (tool khác & baocao v2 đều đọc được):
//   hàng 1: 4 ô trống + "T2 (23/11)" gộp 6 cột × 7 ngày · hàng 2: Bộ phận | User | Họ tên | Tổng | Ca 1 … Ca 6 (lặp)
//   rows: [{ id, name, pos }] theo thứ tự hiển thị · grid: { "<id>|<d>": [ca…] }
export function sheetAoa({ days, rows, grid, slots }) {
  const hours = slotHours(slots), DOW = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const h1 = ["", "", "", ""], h2 = ["Bộ phận", "User", "Họ tên", "Tổng"], merges = [];
  days.forEach((d, j) => {
    h1.push(`${DOW[isoDow(d)]} (${d.slice(8, 10)}/${d.slice(5, 7)})`, "", "", "", "", "");
    merges.push({ s: { r: 0, c: 4 + j * 6 }, e: { r: 0, c: 9 + j * 6 } });
    for (let x = 1; x <= 6; x++) h2.push("Ca " + x);
  });
  const body = rows.map((r) => {
    const cells = []; let tot = 0;
    for (const d of days) { const g = grid[r.id + "|" + d] || []; for (let x = 1; x <= 6; x++) { const on = g.includes(x); cells.push(on ? hours[x - 1] : ""); if (on) tot += hours[x - 1]; } }
    return [r.pos || "", Number(r.id) || r.id, r.name || "", Math.round(tot * 10) / 10, ...cells];
  });
  return { aoa: [h1, h2, ...body], merges };
}

// Dòng gửi rpc shift_import (cùng dạng matchStaff trong lib-shift.js)
export function importRows({ days, rows, grid, slots }) {
  const hours = slotHours(slots), out = [];
  for (const r of rows) for (const d of days) {
    const g = [...(grid[r.id + "|" + d] || [])].sort((a, b) => a - b);
    out.push({ staff_id: String(r.id), d, slots: g, hours: Math.round(g.reduce((t, x) => t + hours[x - 1], 0) * 100) / 100, pos: r.pos || "" });
  }
  return out;
}
