import { execFileSync } from "node:child_process";
import { dailySummary, weeklySummary } from "../functions/notify/summary.ts";
const q = (sql: string) => JSON.parse(execFileSync("psql", ["-h","/tmp","-p","5433","-U","postgres","-d","t1","-At","-c",`select coalesce(json_agg(t),'[]') from (${sql}) t`], {encoding:"utf8"}));
const ctx = { storeName: "Siêu thị 351 Nguyễn Hữu Thọ", appUrl: "https://dohung712.github.io/baocao/v2/", penaltyStreak: 5,
  staff: q("select id,name,dept,total_star from staff_stars where not hidden"),
  rows: q("select report_date::text,staff_id,item_name,status,compensation,star_change,rate_pct from daily_results where report_date between '2026-10-26' and '2026-10-31'"),
  streaks: q("select * from current_streaks('2026-11-01')"),
  contest: [{name:"VAS",type:"SL",rate_month:77.6,forecast:89.6,branch:"TỔNG",rank:"-"},{name:"Tablet",type:"DT",rate_month:0,forecast:0,branch:"TỔNG",rank:"-"}],
  pendingProposals: 1, pendingChanges: 2 };
console.log(dailySummary(ctx as any, "2026-10-31")); console.log("\n==========\n");
console.log(weeklySummary(ctx as any, "2026-10-26", "2026-11-01", 7));
