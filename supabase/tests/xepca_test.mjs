// node supabase/tests/xepca_test.mjs — kiểm thử bộ xếp ca D17 (v2/js/lib-xepca.js), dữ liệu giả
import { solve, report, sheetAoa, importRows, patterns, slotHours } from "../../v2/js/lib-xepca.js";
import assert from "node:assert/strict";

const SLOTS = ["07:30-09:00", "09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-21:00", "21:00-22:00"];
const days = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"];
const wk = (a) => a, rep = (n, v) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [String(i), n(i) ?? v]));
const S933 = { need: rep((i) => (i >= 5 ? [2, 3, 2, 3, 3, 2] : [2, 2, 2, 2, 2, 2])) };
const S10341 = { need: rep((i) => (i >= 6 ? [2, 4, 2, 4, 3, 2] : [2, 3, 2, 3, 3, 2])) };
const A = [{ id: "a1", name: "Thy" }, { id: "a2", name: "Nhân" }, { id: "a3", name: "Trang" }, { id: "a4", name: "Trâm" }];
const B = [{ id: "b1", name: "Linh" }, { id: "b2", name: "Trinh" }, { id: "b3", name: "Hiếu" }, { id: "b4", name: "MTrang" }, { id: "b5", name: "QAnh" }];

assert.deepEqual(slotHours(SLOTS), [1.5, 3, 3, 3, 3, 1]);
assert.ok(patterns(slotHours(SLOTS), 9).every((p) => p.reduce((s, x) => s + [1.5, 3, 3, 3, 3, 1][x - 1], 0) <= 9));

for (const [name, staff, store, pairs, maxH] of [["933 9h", A, S933, [["a1", "a2"]], 9], ["933 12h", A, S933, [["a1", "a2"]], 12], ["10341 9h", B, S10341, [["b3", "b5"]], 9], ["10341 12h", B, S10341, [["b3", "b5"]], 12]]) {
  const busy = [{ staff_id: staff[0].id, busy_date: days[2], type: "OFF", shifts: [] }, { staff_id: staff[1].id, busy_date: days[4], type: "BAN", shifts: [1, 2] }];
  const cfg = { max_day_h: maxH, min_off: 1, pairs };
  const t = Date.now();
  const r = solve({ days, staff, busy, cfg, store, slots: SLOTS });
  const ms = Date.now() - t;
  // Ưu tiên 1 + 2: tuyệt đối không trùng OFF / bận
  assert.equal(r.busyHits.length, 0, name + " trùng lịch bận");
  assert.deepEqual(r.grid[staff[0].id + "|" + days[2]], []);
  assert.ok(!r.grid[staff[1].id + "|" + days[4]].some((x) => x <= 2));
  assert.equal(r.gaps.length, 0); assert.equal(r.longDays.length, 0); assert.equal(r.noOff.length, 0, name + " thiếu ngày OFF");
  console.log(`${name}: ${ms}ms · thiếu ${r.missingHours}h (${r.short.length} ô) · cặp trùng ${r.pairHits.length} · giờ ${r.per.map((p) => p.name + " " + p.hours).join(", ")}`);
}

// Ô chốt tay được giữ nguyên, báo cáo lịch sửa tay bắt được trùng bận
const r2 = solve({ days, staff: A, busy: [], cfg: { max_day_h: 9, min_off: 1, pairs: [] }, store: S933, slots: SLOTS, fixed: { "a1|2026-11-30": [5, 6] } });
assert.deepEqual(r2.grid["a1|2026-11-30"], [5, 6]);
const rp = report({ days, staff: A, grid: { ...r2.grid, "a2|2026-12-01": [1, 2] }, cfg: { pairs: [] }, store: S933, slots: SLOTS, busy: [{ staff_id: "a2", busy_date: "2026-12-01", type: "BAN", shifts: [2] }] });
assert.deepEqual(rp.busyHits, [{ id: "a2", d: "2026-12-01", kind: "ban", slots: [2] }]);

// File Excel: đọc lại bằng parser của baocao ra đúng lịch
const { parseShiftAoa } = await import("../../v2/js/lib-shift.js");
const rows = [{ id: "18450", name: "Đỗ Xuân Hùng", pos: "BP Quản Lý Siêu Thị - ĐMX" }, { id: "29649", name: "Nguyễn Thị Thy", pos: "BP All In One - ĐMX" }];
const grid = { "18450|2026-11-30": [4, 5, 6], "29649|2026-11-30": [1, 2, 3], "29649|2026-12-06": [2, 3, 4, 5] };
const { aoa } = sheetAoa({ days, rows, grid, slots: SLOTS });
const back = parseShiftAoa(aoa, "2026-11-28");
assert.ok(back.ok); assert.equal(back.days.length, 7);
assert.deepEqual(back.people.map((p) => [p.user, p.dept, p.days["2026-11-30"].slots, p.days["2026-12-06"].slots]),
  [["18450", "BP Quản Lý Siêu Thị - ĐMX", [4, 5, 6], []], ["29649", "BP All In One - ĐMX", [1, 2, 3], [2, 3, 4, 5]]]);
assert.equal(aoa[2][3], 7); assert.equal(aoa[3][3], 19.5);
assert.equal(importRows({ days, rows, grid, slots: SLOTS }).find((x) => x.staff_id === "29649" && x.d === "2026-12-06").hours, 12);
console.log("✅ xepca OK");
