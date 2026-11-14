// So sánh cách tính sao của v2 (SQL) với bản PRO cũ (backend/policy.js trustedReport) trên dữ liệu giả lập.
// Chạy: node supabase/tests/compare_legacy.mjs  (cần Postgres cục bộ đã áp migrations, xem README v2)
import { execFileSync } from "node:child_process";
import { trustedReport } from "../../backend/policy.js";

const DB = process.env.TEST_DB || "t1";
const psql = (sql) => execFileSync("psql", ["-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", DB, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ---------- Dữ liệu giả lập ----------
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DEPTS = ["Thế Giới Di Động", "Topzone"];
const staff = Array.from({ length: 6 }, (_, i) => ({ id: String(1000 + i), name: "NV " + i, group: DEPTS[i % 2], baseStar: 500 + i * 100, assigned: i === 5 ? ["Sim", "Phụ kiện"] : [] }));
const items = [
  ["Chung", "Sim", 3, 200, 100, ""], ["Chung", "Bảo hiểm", 2, 300, 150, "X2"], ["Chung", "Phụ kiện", 5, 200, 100, ""],
  ["Thế Giới Di Động", "Laptop", 1, 400, 200, ""], ["Thế Giới Di Động", "Phụ kiện", 4, 250, 120, ""],
  ["Topzone", "AppleCare", 2, 500, 250, "TRUE"], ["Topzone", "Ốp lưng", 6, 150, 80, ""]
];
const rules = [{ item: "*", stores: ["Topzone"], staffIds: [], ot: 2, pen: 4 }, { item: "Laptop", staffIds: ["1002"], stores: [], noPen: true }];
const cfg = [["Key", "Value"], ["Chuỗi ngày được tăng ca", 3], ["Chuỗi ngày bị trừ sao", 5], ["Tỷ lệ thưởng nhân đôi X2 (%)", 150],
  ["Phạt lũy tiến - chuỗi bắt đầu bậc 2", 4], ["Phạt lũy tiến - hệ số bậc 2", 1.5], ["Quy tắc riêng từng môn", JSON.stringify(rules)],
  ["Ngày đã khóa chốt sổ", "2026-10-01,2026-10-02"]];

// Lịch sử ban đầu: 15 ngày, mỗi ngày mỗi môn đạt/không ngẫu nhiên
const itemsFor = (s) => {
  let list = items.filter((t) => s.assigned.length ? s.assigned.includes(t[1]) : (t[0] === "Chung" || t[0] === s.group));
  const m = new Map(); for (const t of list) if (!m.has(t[1]) || t[0] === s.group) m.set(t[1], t); return [...m.values()];
};
const kq = [["Ngày", "Mã NV", "Tên NV", "Tên Môn", "Thực Đạt", "% Đạt", "Sao", "Trạng Thái", "Phương Án"]];
for (let d = 1; d <= 15; d++) {
  const date = "2026-10-" + String(d).padStart(2, "0");
  for (const s of staff) {
    if (rnd() < 0.15) continue; // nghỉ
    for (const t of itemsFor(s)) {
      const ok = rnd() < 0.35, comp = ok ? "DUNG_SAO" : pick(["DUNG_SAO", "TANG_CA", "GHI_NHAN"]);
      kq.push([date + (d % 4 === 0 ? "T00:00:00.000Z" : ""), s.id, s.name, t[1], ok ? t[2] : 0, ok ? "100%" : "0%", ok ? t[3] : (comp === "DUNG_SAO" && rnd() < 0.5 ? -t[4] : 0), ok ? "Về số" : "Chưa về", comp]);
    }
  }
}
const deltas = {}; kq.slice(1).forEach((r) => deltas[r[1]] = (deltas[r[1]] || 0) + r[6]);
const ns = [["Mã NV", "Tên", "Bộ phận", "Sao gốc", "Tổng sao", "Reset", "Môn riêng", "Ẩn"],
  ...staff.map((s) => [Number(s.id), s.name, s.group, s.baseStar, s.baseStar + (deltas[s.id] || 0) + 77, s.id === "1003" ? "2026-10-08" : "", s.assigned.join(", "), ""])];
const payload = { sheets: { DM_NhanSu: ns, DM_ThiDua: [["Siêu thị", "Tên", "Target", "Thưởng", "Phạt", "X2"], ...items], Data_KetQua_Ngay: kq, CauHinh_QL: cfg,
  Data_DeXuat: [["Ngày", "Mã", "Tên", "ND", "Sao", "TT"], ["2026-10-05", "1001", "NV 1", "Bán thêm tủ lạnh", 300, "Đã duyệt"], ["2026-10-06", "1999", "NV cũ", "abc", 100, "Đã duyệt"]],
  Data_ThiDua_SieuThi: [["Tên", "Loại", "TĐ", "TG", "%", "DB", "Hạng", "CN"], ["VAS", "SỐ LƯỢNG", 59, 76, 77.6, 89.6, "-", "TỔNG"]] } };

psql("truncate public.app_state; insert into public.app_state(id, payload) values (1, " + q(JSON.stringify(payload)) + "::jsonb)");
console.log("migrate:", psql("select public.migrate_legacy()"));
console.log("check:", psql("select public.migrate_check()"));

// ---------- Trạng thái "all" giống bản cũ ----------
const all = {
  nhanSu: ns.slice(1).map((r) => ({ id: String(r[0]), name: r[1], group: r[2], baseStar: r[3], totalStar: r[4], resetDate: r[5], assignedItems: r[6] ? r[6].split(",").map((x) => x.trim()) : [] })),
  thiDua: items.map((r) => ({ store: r[0], name: r[1], target: r[2], bonusStar: r[3], penaltyStar: r[4], isX2: ["X2", "TRUE"].includes(String(r[5]).toUpperCase()) })),
  ketQua: kq.slice(1).map((r) => ({ date: r[0].slice(0, 10), staffId: r[1], staffName: r[2], itemName: r[3], actual: r[4], rate: r[5], starChange: r[6], status: r[7], compensation: r[8] })),
  config: { STREAK_OVERTIME: 3, STREAK_PENALTY_STAR: 5, DOUBLE_BONUS_RATE: 150, PEN_T2_MIN: 4, PEN_M2: 1.5, ITEM_RULES: JSON.stringify(rules), AUTO_STREAK_ENABLED: "ON" },
  lockedDates: []
};
// tổng sao bản cũ có +77 (vd thưởng TikTok) và +300 đề xuất đã duyệt của NV 1 nằm trong tổng => giữ nguyên
const legacyTotal = (id) => all.nhanSu.find((n) => n.id === id).totalStar;

// ---------- So sánh qua nhiều lần nộp liên tiếp ----------
let diffs = 0, n = 0;
for (let d = 16; d <= 31; d++) {
  const date = "2026-10-" + String(d).padStart(2, "0");
  for (const s of staff) {
    if (rnd() < 0.2) continue;
    const late = rnd() < 0.15;
    const now = new Date(date + (late ? "T15:40:00Z" : "T14:00:00Z")); // 22:40 hoặc 21:00 giờ VN
    const reports = itemsFor(s).map((t) => ({ itemName: t[1], actual: pick([0, 0, Math.floor(t[2] / 2), t[2], t[2] * 2]), compensation: pick(["DUNG_SAO", "TANG_CA"]) }));
    const legacy = trustedReport({ staffId: s.id, date, reports }, all, now).reports;
    const out = JSON.parse(psql(`select public._compute_report(${q(s.id)}, ${q(date)}::date, ${q(JSON.stringify(reports))}::jsonb, '', 0, 'test', ${q(now.toISOString())}::timestamptz, false)`));
    n++;
    const a = legacy.map((r) => [r.itemName, r.starChange, r.status, r.compensation].join("|")).join(" ; ");
    const b = out.rows.map((r) => [r.itemName, r.starChange, r.status, r.compensation].join("|")).join(" ; ");
    if (a !== b) { diffs++; if (diffs <= 5) console.log("DIFF", s.id, date, "\n legacy:", a, "\n v2    :", b); }
    // cập nhật trạng thái bản cũ như engine: xoá ca cũ rồi ghi ca mới, cập nhật tổng sao
    const old = all.ketQua.filter((r) => r.staffId === s.id && r.date === date).reduce((x, r) => x + r.starChange, 0);
    all.ketQua = all.ketQua.filter((r) => !(r.staffId === s.id && r.date === date)).concat(legacy.map((r) => ({ ...r, date, staffId: s.id })));
    const st = all.nhanSu.find((x) => x.id === s.id); st.totalStar += legacy.reduce((x, r) => x + r.starChange, 0) - old;
    const v2total = Number(psql(`select public.staff_total(${q(s.id)})`));
    if (v2total !== st.totalStar) { diffs++; console.log("TOTAL DIFF", s.id, date, st.totalStar, v2total); }
  }
}
console.log(`compared ${n} submissions, diffs=${diffs}`);
process.exit(diffs ? 1 : 0);
