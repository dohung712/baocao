// D12 Bảng việc trong Edge Function "notify":
//  • jobDayMsg / jobWeekMsg: tin Telegram báo cáo công việc theo hạng mục (ngày / tuần)
//  • jobMaintenance: mỗi lần tick — chuyển việc quá lâu chưa nộp sang "Bỏ lỡ" (trừ sao), thông báo đẩy (việc mới, sắp tới hạn, quá hạn),
//    30 phút 1 lần đọc file lịch ca mới nhất trong Drive (tool sắp ca bỏ vào) và lưu vào bảng shifts.
import * as XLSX from "npm:xlsx@0.18.5";
import { rest, rpc, vnParts, addDays } from "../_shared/common.ts";
import { pushMany, type PushData } from "../_shared/webpush.ts";
import { drive, driveReady, driveVersion } from "../_shared/drive.ts";
import { parseShiftAoa, matchStaff } from "../_shared/shift.ts";
import { biSync } from "../_shared/bi.ts";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dm = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dow = (d: string) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];
const short = (n: string) => String(n || "").trim().split(/\s+/).slice(-2).join(" ");
const vnHmDm = (iso: string) => { const p = vnParts(new Date(iso)); return { date: p.date, hm: p.hm }; };
const mins = (n: number) => n >= 1440 ? `${Math.floor(n / 1440)} ngày` : n >= 60 ? `${Math.floor(n / 60)}g${n % 60 ? String(n % 60).padStart(2, "0") : ""}` : `${n}p`;
const nPhotos = (j: any) => Array.isArray(j.photos) ? j.photos.length : 0;
const dayStart = (d: string) => encodeURIComponent(`${d}T00:00:00+07:00`);
const APP = "https://dohung712.github.io/baocao/v2/";

export async function loadJobs(from: string, to: string) {
  const [jobs, types] = await Promise.all([
    rest(`jobs?select=id,type_id,staff_id,title,due_at,status,done_at,late_min,photos&due_at=gte.${dayStart(from)}&due_at=lt.${dayStart(addDays(to, 1))}&order=due_at&limit=5000`),
    rest("job_types?select=id,name,icon,sort,tg&order=sort,id"),
  ]);
  return { jobs: jobs as any[], types: types as any[] };
}
function byType(jobs: any[], types: any[]) {
  const t = new Map(types.map((x) => [x.id, x]));
  const groups = new Map<string, { name: string; icon: string; sort: number; list: any[] }>();
  for (const j of jobs) {
    const ty = t.get(j.type_id);
    if (ty && ty.tg === false) continue;
    const k = ty ? String(ty.id) : "0";
    if (!groups.has(k)) groups.set(k, { name: ty?.name || "Việc khác", icon: ty?.icon || "📌", sort: ty?.sort ?? 99, list: [] });
    groups.get(k)!.list.push(j);
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort);
}
const isLate = (j: any) => j.status === "done" && Number(j.late_min) > 0;

export function jobDayMsg(store: string, date: string, jobs: any[], types: any[], names: Map<string, string>) {
  const groups = byType(jobs, types);
  const all = groups.flatMap((g) => g.list);
  if (!all.length) return null;
  const nowIso = new Date().toISOString();
  const done = all.filter((j) => j.status === "done"), miss = all.filter((j) => j.status === "missed");
  const open = all.filter((j) => j.status === "todo"), over = open.filter((j) => j.due_at < nowIso);
  const L = [`📋 <b>CÔNG VIỆC · ${dow(date)} ${dm(date)}</b>`, esc(store), "",
    `Tổng <b>${all.length}</b> việc · ✅ <b>${done.length}</b> đã nộp${done.some(isLate) ? ` (${done.filter(isLate).length} trễ)` : ""} · ⏳ <b>${open.length}</b> chưa nộp${over.length ? ` (${over.length} quá hạn)` : ""}${miss.length ? ` · ❌ <b>${miss.length}</b> bỏ lỡ` : ""} · 📷 <b>${all.reduce((a, j) => a + nPhotos(j), 0)}</b> ảnh`];
  for (const g of groups) {
    const d = g.list.filter((j) => j.status === "done");
    L.push("", `${g.icon} <b>${esc(g.name)}</b> · ${d.length}/${g.list.length} việc · 📷 ${g.list.reduce((a, j) => a + nPhotos(j), 0)}`);
    const per = new Map<string, { p: number; late: number; n: number }>();
    for (const j of d) { const x = per.get(j.staff_id) || { p: 0, late: 0, n: 0 }; x.p += nPhotos(j); x.n++; if (isLate(j)) x.late = Math.max(x.late, Number(j.late_min)); per.set(j.staff_id, x); }
    if (per.size) L.push("✅ " + [...per.entries()].map(([id, x]) => `${esc(short(names.get(id) || id))}${x.n > 1 ? ` ×${x.n}` : ""} ${x.p}📷${x.late ? ` ⏰trễ ${mins(x.late)}` : ""}`).join(" · "));
    for (const j of g.list.filter((x) => x.status === "todo")) L.push(`${j.due_at < nowIso ? "⚠️" : "⏳"} ${esc(short(names.get(j.staff_id) || j.staff_id))}: ${esc(j.title)} (hạn ${vnHmDm(j.due_at).hm})`);
    for (const j of g.list.filter((x) => x.status === "missed")) L.push(`❌ ${esc(short(names.get(j.staff_id) || j.staff_id))}: ${esc(j.title)} — bỏ lỡ`);
  }
  L.push("", `Xem ảnh từng NV: ${APP}#jobs`);
  return L.join("\n");
}

export function jobWeekMsg(store: string, from: string, to: string, jobs: any[], types: any[], names: Map<string, string>) {
  const groups = byType(jobs, types);
  const all = groups.flatMap((g) => g.list);
  if (!all.length) return null;
  const pct = (a: number, b: number) => b ? Math.round((a * 100) / b) : 0;
  const onTime = (l: any[]) => l.filter((j) => j.status === "done" && !Number(j.late_min)).length;
  const L = [`📋 <b>TỔNG KẾT CÔNG VIỆC TUẦN ${dm(from)} – ${dm(to)}</b>`, esc(store), "",
    `Tổng <b>${all.length}</b> việc · đúng hạn <b>${pct(onTime(all), all.length)}%</b> · trễ ${all.filter(isLate).length} · bỏ lỡ ${all.filter((j) => j.status === "missed").length} · 📷 ${all.reduce((a, j) => a + nPhotos(j), 0)} ảnh`];
  for (const g of groups) {
    L.push("", `${g.icon} <b>${esc(g.name)}</b> · ${g.list.length} việc · đúng hạn ${pct(onTime(g.list), g.list.length)}% · 📷 ${g.list.reduce((a, j) => a + nPhotos(j), 0)}`);
    const per = new Map<string, any[]>(); for (const j of g.list) per.set(j.staff_id, [...(per.get(j.staff_id) || []), j]);
    L.push("   " + [...per.entries()].sort((a, b) => pct(onTime(b[1]), b[1].length) - pct(onTime(a[1]), a[1].length)).map(([id, l]) => {
      const d = l.filter((j) => j.status === "done").length, late = l.filter(isLate).length, miss = l.filter((j) => j.status === "missed").length;
      return `${esc(short(names.get(id) || id))} ${d}/${l.length}${late ? ` (${late} trễ)` : ""}${miss ? ` (${miss} bỏ lỡ)` : ""}`;
    }).join(" · "));
  }
  const per = new Map<string, any[]>(); for (const j of all) per.set(j.staff_id, [...(per.get(j.staff_id) || []), j]);
  const rank = [...per.entries()].map(([id, l]) => ({ id, n: l.length, p: pct(onTime(l), l.length), bad: l.filter((j) => j.status !== "done" || isLate(j)).length }));
  const top = rank.filter((r) => r.p === 100 && r.n >= 2).map((r) => esc(short(names.get(r.id) || r.id)));
  const low = rank.filter((r) => r.bad >= 2).sort((a, b) => b.bad - a.bad).slice(0, 5).map((r) => `${esc(short(names.get(r.id) || r.id))} (${r.bad})`);
  if (top.length) L.push("", `🏅 Đúng hạn 100%: ${top.join(", ")}`);
  if (low.length) L.push(`🆘 Cần nhắc (trễ / bỏ lỡ): ${low.join(", ")}`);
  L.push("", `Chi tiết: ${APP}#jobs`);
  return L.join("\n");
}

// Kỳ tuần: gửi CN → tuần đang kết thúc; ngày khác → tuần trước (T2–CN)
export function weekRange(date: string) {
  const w = new Date(date + "T00:00:00Z").getUTCDay();
  const to = w === 0 ? date : addDays(date, -w);
  return { from: addDays(to, -6), to };
}

// ---------- Định kỳ ----------
const idsIn = (ids: number[]) => `id=in.(${ids.join(",")})`;
async function mark(ids: number[], col: string) {
  for (let i = 0; i < ids.length; i += 150) await rest(`jobs?${idsIn(ids.slice(i, i + 150))}`, { method: "PATCH", body: JSON.stringify({ [col]: new Date().toISOString() }) });
}
function groupPush(list: any[], one: (j: any) => PushData, many: (l: any[]) => PushData) {
  const by = new Map<string, any[]>(); for (const j of list) by.set(j.staff_id, [...(by.get(j.staff_id) || []), j]);
  return [...by.entries()].map(([staff_id, l]) => ({ staff_id, data: l.length === 1 ? one(l[0]) : many(l) }));
}
const when = (iso: string) => { const p = vnHmDm(iso), today = vnParts().date; return p.date === today ? p.hm : `${p.hm} ${dow(p.date)} ${dm(p.date)}`; };

export async function jobMaintenance(cfg: Record<string, any>) {
  const out: Record<string, unknown> = {};
  try { out.missed = (await rpc("job_tick"))?.missed ?? 0; } catch (e) { out.tickError = String((e as Error).message); }
  try {
    const now = Date.now(), nowIso = new Date(now).toISOString();
    const before = Math.max(5, Number(cfg.JOB_REMIND_BEFORE_MIN ?? 60) || 60);
    const sel = "jobs?select=id,staff_id,title,due_at&status=eq.todo";
    const fresh: any[] = await rest(`${sel}&pushed_at=is.null&created_at=gte.${encodeURIComponent(new Date(now - 2 * 864e5).toISOString())}&order=due_at&limit=300`);
    const soonAt = new Date(now + before * 60000).toISOString();
    const soon: any[] = (await rest(`${sel}&reminded_at=is.null&due_at=gt.${encodeURIComponent(nowIso)}&due_at=lte.${encodeURIComponent(soonAt)}&order=due_at&limit=300`))
      .filter((j: any) => !fresh.some((f) => f.id === j.id));
    const over: any[] = await rest(`${sel}&overdue_at=is.null&due_at=lte.${encodeURIComponent(nowIso)}&due_at=gte.${encodeURIComponent(new Date(now - 864e5).toISOString())}&order=due_at&limit=300`);
    const msgs = [
      ...groupPush(fresh, (j) => ({ title: "📌 Việc mới: " + j.title, body: `Hạn ${when(j.due_at)} · bấm để xem và nộp ảnh`, url: APP + "#today", tag: "job-" + j.id }),
        (l) => ({ title: `📌 Bạn có ${l.length} việc mới`, body: l.slice(0, 4).map((j) => `• ${j.title} (hạn ${when(j.due_at)})`).join("\n"), url: APP + "#today", tag: "jobs-new" })),
      ...groupPush(soon, (j) => ({ title: "⏰ Sắp tới hạn: " + j.title, body: `Hạn ${when(j.due_at)} · nộp ảnh trên tool`, url: APP + "#today", tag: "job-" + j.id }),
        (l) => ({ title: `⏰ ${l.length} việc sắp tới hạn`, body: l.slice(0, 4).map((j) => `• ${j.title} (hạn ${when(j.due_at)})`).join("\n"), url: APP + "#today", tag: "jobs-soon" })),
      ...groupPush(over, (j) => ({ title: "⚠️ Quá hạn: " + j.title, body: `Hạn ${when(j.due_at)} · nộp ngay để tránh bị trừ sao`, url: APP + "#today", tag: "job-" + j.id }),
        (l) => ({ title: `⚠️ ${l.length} việc quá hạn`, body: l.slice(0, 4).map((j) => `• ${j.title}`).join("\n"), url: APP + "#today", tag: "jobs-over" })),
    ];
    if (msgs.length) out.push = await pushMany(msgs);
    const soonFresh = fresh.filter((j) => j.due_at <= soonAt).map((j) => j.id);
    if (fresh.length) await mark(fresh.map((j) => j.id), "pushed_at");
    if (soon.length || soonFresh.length) await mark([...soon.map((j) => j.id), ...soonFresh], "reminded_at");
    if (over.length) await mark(over.map((j) => j.id), "overdue_at");
  } catch (e) { out.pushError = String((e as Error).message); }
  try { const s = await shiftAuto(cfg); if (s) out.shift = s; } catch (e) { out.shiftError = String((e as Error).message); }
  try { const b = await biAuto(); if (b) out.bi = { read: b.read, errors: b.errors, remaining: b.remaining }; } catch (e) { out.biError = String((e as Error).message); }
  return out;
}

// B16: 30 phút 1 lần (phút 10–14, 40–44) đọc ảnh BI mới trong thư mục "00 - Nhập doanh thu và thi đua" (mỗi lần ≤ 2 ảnh)
async function biAuto() {
  const m = Number(vnParts().hm.slice(3)) % 30;
  if (m < 10 || m >= 15) return null;
  if (!(await driveReady()) || (await driveVersion()) < 3) return null;
  const r = await biSync("tu-dong", 2);
  return r.read || r.errors ? r : null;
}

// Đọc file lịch ca mới nhất trong Drive (30 phút / lần); file chưa đổi thì Apps Script không gửi lại nội dung
async function shiftAuto(cfg: Record<string, any>, force = false) {
  const p = vnParts();
  if (!force && Number(p.hm.slice(3)) % 30 >= 5) return null;
  if (!(await driveReady()) || (await driveVersion()) < 2) return null;   // Apps Script bản 1 chưa có "latest"
  const last = cfg.SHIFT_LAST && typeof cfg.SHIFT_LAST === "object" ? cfg.SHIFT_LAST : {};
  const path = Array.isArray(cfg.SHIFT_DRIVE_PATH) ? cfg.SHIFT_DRIVE_PATH.map(String) : ["Tool Báo Cáo", "02 - Lịch ca làm việc"];
  const r = await drive({ action: "latest", path, since: last.updated || "", since_id: last.file_id || "" });
  if (!r.version || !r.file || !r.data) return null;
  return await importShiftFile(r.file, r.data, "tu-dong");
}
export async function importShiftFile(file: { id: string; name: string; updated: string }, b64: string, actor: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  const sch = parseShiftAoa(aoa, vnParts().date);
  if (!sch.ok) throw new Error("File lịch ca " + file.name + ": " + sch.msg);
  const staff = await rest("staff?select=id,name&hidden=eq.false");
  const { rows, unmatched } = matchStaff(sch.people, staff);
  if (!rows.length) throw new Error("File lịch ca " + file.name + ": không khớp được nhân viên nào.");
  const res = await rpc("_shift_save", { p_rows: rows, p_source: file.name, p_actor: actor, p_file: { id: file.id, updated: file.updated, unmatched: unmatched.length } });
  return { file: file.name, n: res?.n ?? rows.length, unmatched: unmatched.length };
}
