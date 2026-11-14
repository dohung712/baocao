// Kiểm tra sau triển khai — chỉ in số lượng, không in dữ liệu cá nhân (log GitHub Actions là công khai).
import { sql } from "./apply-migrations.mjs";
const check = await sql("select public.migrate_check() as c");
console.log("Đối chiếu dữ liệu:", JSON.stringify(check[0]?.c));
const counts = await sql(`select (select count(*) from public.staff) staff, (select count(*) from public.items) items,
  (select count(*) from public.daily_results) results, (select count(*) from public.extra_proposals) proposals,
  (select count(*) from public.store_contest) contest, (select count(*) from public.memberships where active) members`);
console.log("Số dòng:", JSON.stringify(counts[0]));
try {
  const job = await sql("select jobname, schedule, active from cron.job where jobname = 'thidua-notify'");
  console.log("Lịch tự động:", JSON.stringify(job));
} catch (e) { console.log("Lịch tự động: chưa có (" + e.message.slice(0, 200) + ")"); }
const mism = check[0]?.c?.total_star_mismatch;
if (mism) { console.error(`::warning::Có ${mism} nhân viên lệch tổng sao giữa bản cũ và v2`); }
