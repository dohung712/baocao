// Đọc báo cáo target tháng dạng:
// === SIÊU THỊ 933 (TGDĐ - 4 NS) ===
// • Doanh thu mỗi NV: 811.0 tr
// + T11 - Laptop: Tổng 520.25 | %Đạt: 46.9% | Mỗi NV: 130.1
const num = (s) => { const t = String(s || "").trim(); if (!t) return null; const v = parseFloat(/,\d{1,2}$/.test(t) && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
export function parseTargetReport(text) {
  const blocks = []; let cur = null, month = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let m = line.match(/SI[ÊE]U\s*TH[ỊI]\s*([\w-]+)\s*\(\s*([^()]*?)\s*(?:-\s*(\d+)\s*NS)?\s*\)/i);
    if (m) { cur = { code: m[1], label: m[2].trim(), ns: m[3] ? Number(m[3]) : null, revenue: null, items: [] }; blocks.push(cur); continue; }
    if (!cur) continue;
    m = line.match(/Doanh\s*thu\s*m[ỗo]i\s*NV\s*:\s*([\d.,]+)/i);
    if (m) { cur.revenue = num(m[1]); continue; }
    m = line.match(/^[+\-•*·]?\s*(?:T(\d{1,2})\s*[-–:]\s*)?(.+?)\s*:\s*T[ổo]ng\s*([\d.,]+)\s*\|\s*%\s*Đ[ạa]t\s*:\s*([\d.,]+)\s*%?\s*\|\s*M[ỗo]i\s*NV\s*:\s*([\d.,]+)/i);
    if (m) { if (m[1] && !month) month = Number(m[1]); cur.items.push({ name: m[2].trim(), total: num(m[3]), pct: num(m[4]), perStaff: num(m[5]) }); }
  }
  return { month, blocks: blocks.filter((b) => b.items.length || b.revenue != null) };
}
