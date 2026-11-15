import { revenueMsg, scoreMsg, tiktokMsg, cleanMsg, busyMsg, rsMsg, serviceMsg } from "../functions/notify/summary2.ts";
const board = [{ staff_id: "1", name: "Nguyễn Văn An", revenue: 210, revenue_target: 300, rev_pct: 70, rev_score: 28, contest_score: 30, service_score: 20, violation_points: 2, total: 76, rank: 1, s5: 20, s4: 1, s3: 0, s2: 0, s1: 0, complaints: 0, service_raw: 19 },
  { staff_id: "2", name: "Lê Thị Bình", revenue: 90, revenue_target: null, rev_pct: null, rev_score: 0, contest_score: 25, service_score: 10, violation_points: 0, total: 35, rank: 2, s5: 10, s4: 0, s3: 0, s2: 0, s1: 0, complaints: 0, service_raw: 10 }];
const names = new Map([["1", "Nguyễn Văn An"], ["2", "Lê Thị Bình"]]);
console.log(revenueMsg("ST 351", "2026-11-15", "triệu đ", board, new Map([["1", 12]])), "\n---");
console.log(scoreMsg("ST 351", "2026-11-01", "2026-11-15", board, { r: 40, c: 40, s: 20 }), "\n---");
console.log(tiktokMsg("ST 351", "2026-11-17", [{ id: "1", name: "Nguyễn Văn An" }, { id: "2", name: "Lê Thị Bình" }], [{ staff_id: "1", due: "2026-11-17" }], "2026-11-17", new Map([["Lê Thị Bình", ["2026-11-13"]]])), "\n---");
console.log(cleanMsg("ST 351", "2026-11-15", [{ clean_date: "2026-11-15", staff_id: "1", photos: [] }], names), "\n---");
console.log(busyMsg("ST 351", "2026-11-15", [{ busy_date: "2026-11-16", staff_id: "2", type: "BAN", shifts: [1, 2] }], names), "\n---");
console.log(rsMsg("ST 351", "2026-11-15", "20:00", [{ rs_date: "2026-11-15", rs_time: "06:30", staff_id: "1", photos: ["a", "b", "c"], km: 5.2, minutes: 35 }], names), "\n---");
console.log(serviceMsg("ST 351", "2026-11-09", "2026-11-15", board, [{ staff_id: "2", v_date: "2026-11-10", type: "Đi trễ", note: "", points: 2 }], names));
