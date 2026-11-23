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
import { rtSync } from "../_shared/rtask.ts";

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
    rest(`jobs?select=id,type_id,staff_id,title,due_at,status,done_at,late_min,photos,group_key,done_staff&due_at=gte.${dayStart(from)}&due_at=lt.${dayStart(addDays(to, 1))}&order=due_at&limit=5000`),
    rest("job_types?select=id,name,icon,sort,tg&order=sort,id"),
  ]);
  return { jobs: collapseGroups(jobs as any[]), types: types as any[] };
}
// D13: việc của cả ca (cùng group_key) tính 1 việc — đã nộp: ghi người nộp; chưa nộp / bỏ lỡ: staff_ids = cả ca
function collapseGroups(jobs: any[]) {
  const out: any[] = [], g = new Map<string, any>();
  for (const j of jobs) {
    if (!j.group_key) { out.push({ ...j, staff_ids: [j.staff_id] }); continue; }
    let rep = g.get(j.group_key);
    if (!rep) { rep = { ...j, staff_ids: [] }; g.set(j.group_key, rep); out.push(rep); }
    rep.staff_ids.push(j.staff_id);
    if (j.status === "done" && j.done_staff === j.staff_id) Object.assign(rep, { ...j, staff_ids: rep.staff_ids });   // việc của người đã nộp làm đại diện
  }
  for (const r of out) if (r.status === "done" && r.done_staff) r.staff_id = r.done_staff;
  return out;
}
const who = (j: any, names: Map<string, string>) => (j.staff_ids?.length > 1 ? `Ca (${j.staff_ids.map((id: string) => short(names.get(id) || id)).join(", ")})` : short(names.get(j.staff_id) || j.staff_id));
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
// Số lần trễ theo NV: nộp trễ + bỏ lỡ + quá hạn chưa nộp → "Tên 3 (1 bỏ lỡ) · Tên 1"
function lateSummary(all: any[], names: Map<string, string>, nowIso: string) {
  const per = new Map<string, { late: number; miss: number; open: number }>();
  for (const j of all) {
    const k = isLate(j) ? "late" : j.status === "missed" ? "miss" : j.status === "todo" && j.due_at < nowIso ? "open" : null;
    if (!k) continue;
    // nộp trễ → người nộp; bỏ lỡ / chưa nộp việc của cả ca → tính cho mọi người trong ca
    for (const id of k === "late" ? [j.staff_id] : (j.staff_ids?.length ? j.staff_ids : [j.staff_id])) { const x = per.get(id) || { late: 0, miss: 0, open: 0 }; x[k]++; per.set(id, x); }
  }
  return [...per.entries()].map(([id, x]) => ({ id, n: x.late + x.miss + x.open, x })).sort((a, b) => b.n - a.n)
    .map(({ id, n, x }) => `${esc(short(names.get(id) || id))} <b>${n}</b>${x.miss || x.open ? ` (${[x.miss ? `${x.miss} bỏ lỡ` : "", x.open ? `${x.open} chưa nộp` : ""].filter(Boolean).join(", ")})` : ""}`).join(" · ");
}

// Nhắc qua Telegram ngay khi việc sắp tới hạn / vừa quá hạn mà chưa nộp ảnh (cùng lúc với thông báo đẩy)
export function jobDueMsg(store: string, soon: any[], over: any[], names: Map<string, string>, before: number) {
  if (!soon.length && !over.length) return null;
  const line = (j: any) => `• <b>${esc(short(names.get(j.staff_id) || j.staff_id))}</b>: ${esc(j.title)} (hạn ${when(j.due_at)})`;
  const L = [`⏰ <b>NHẮC CÔNG VIỆC</b> · ${esc(store)}`];
  if (soon.length) L.push("", `🕐 <b>Sắp tới hạn</b> (trong ${mins(before)}):`, ...soon.map(line));
  if (over.length) L.push("", `⚠️ <b>Quá hạn, chưa nộp ảnh</b> — nộp ngay để tránh bị trừ sao:`, ...over.map(line));
  L.push("", `Nộp ảnh: ${APP}#today`);
  return L.join("\n");
}

export function jobDayMsg(store: string, date: string, jobs: any[], types: any[], names: Map<string, string>) {
  const groups = byType(jobs, types);
  const all = groups.flatMap((g) => g.list);
  if (!all.length) return null;
  const nowIso = new Date().toISOString();
  const done = all.filter((j) => j.status === "done"), miss = all.filter((j) => j.status === "missed");
  const open = all.filter((j) => j.status === "todo"), over = open.filter((j) => j.due_at < nowIso);
  const L = [`📋 <b>CÔNG VIỆC · ${dow(date)} ${dm(date)}</b>`, esc(store), "",
    `Tổng <b>${all.length}</b> việc · ✅ <b>${done.length}</b> đã nộp${done.some(isLate) ? ` (${done.filter(isLate).length} trễ)` : ""} · ⏳ <b>${open.length}</b> chưa nộp${over.length ? ` (${over.length} quá hạn)` : ""}${miss.length ? ` · ❌ <b>${miss.length}</b> bỏ lỡ` : ""} · 📷 <b>${all.reduce((a, j) => a + nPhotos(j), 0)}</b> ảnh`];
  const lateLine = lateSummary(all, names, nowIso);
  if (lateLine) L.push(`⏰ <b>Trễ hôm nay</b>: ${lateLine}`);
  for (const g of groups) {
    const d = g.list.filter((j) => j.status === "done");
    L.push("", `${g.icon} <b>${esc(g.name)}</b> · ${d.length}/${g.list.length} việc · 📷 ${g.list.reduce((a, j) => a + nPhotos(j), 0)}`);
    const per = new Map<string, { p: number; late: number; n: number }>();
    for (const j of d) { const x = per.get(j.staff_id) || { p: 0, late: 0, n: 0 }; x.p += nPhotos(j); x.n++; if (isLate(j)) x.late = Math.max(x.late, Number(j.late_min)); per.set(j.staff_id, x); }
    if (per.size) L.push("✅ " + [...per.entries()].map(([id, x]) => `${esc(short(names.get(id) || id))}${x.n > 1 ? ` ×${x.n}` : ""} ${x.p}📷${x.late ? ` ⏰trễ ${mins(x.late)}` : ""}`).join(" · "));
    for (const j of g.list.filter((x) => x.status === "todo")) L.push(`${j.due_at < nowIso ? "⚠️" : "⏳"} ${esc(who(j, names))}: ${esc(j.title)} (hạn ${vnHmDm(j.due_at).hm})`);
    for (const j of g.list.filter((x) => x.status === "missed")) L.push(`❌ ${esc(who(j, names))}: ${esc(j.title)} — bỏ lỡ`);
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
  const lateLine = lateSummary(all, names, new Date().toISOString());
  if (top.length) L.push("", `🏅 Đúng hạn 100%: ${top.join(", ")}`);
  if (lateLine) L.push(`${top.length ? "" : "\n"}⏰ <b>Số lần trễ trong tuần</b>: ${lateLine}`);
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
  // D13 việc lặp lại: 30 phút 1 lần đọc lại trang tính; mỗi lượt giao việc hôm nay theo lịch ca (thêm người mới vào ca, bỏ người đã đổi ca)
  try { const r = await rtAuto(cfg); if (r) out.rt = r; } catch (e) { out.rtError = String((e as Error).message).slice(0, 200); }
  // Không nhắc sau RT_NAG_UNTIL (22:15) tới 06:00 — việc quá hạn để trễ hẹn
  const vn = vnParts(), quiet = vn.hm >= String(cfg.RT_NAG_UNTIL || "22:15") || vn.hm < "06:00";
  if (quiet) { out.quiet = true; }
  else try {
    const now = Date.now(), nowIso = new Date(now).toISOString();
    const before = Math.max(5, Number(cfg.JOB_REMIND_BEFORE_MIN ?? 60) || 60);
    const sel = "jobs?select=id,staff_id,title,due_at,template_id,group_key,overdue_at,nag_at&status=eq.todo";
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
      ...groupPush(over, (j) => ({ title: "⚠️ Quá hạn: " + j.title, body: `Hạn ${when(j.due_at)} · ${j.template_id ? "nộp ngay (trễ được ghi nhận)" : "nộp ngay để tránh bị trừ sao"}`, url: APP + "#today", tag: "job-" + j.id }),
        (l) => ({ title: `⚠️ ${l.length} việc quá hạn`, body: l.slice(0, 4).map((j) => `• ${j.title}`).join("\n"), url: APP + "#today", tag: "jobs-over" })),
    ];
    // D13: còn 5 phút → nhắc lại; quá hạn → cứ 15 phút nhắc 1 lần (chỉ việc hạn trong hôm nay)
    const soonMin = Math.max(1, Number(cfg.RT_REMIND_SOON_MIN ?? 5) || 5), every = Math.max(5, Number(cfg.RT_NAG_EVERY_MIN ?? 15) || 15);
    const near: any[] = await rest(`${sel}&remind5_at=is.null&due_at=gt.${encodeURIComponent(nowIso)}&due_at=lte.${encodeURIComponent(new Date(now + soonMin * 60000).toISOString())}&order=due_at&limit=300`);
    const nag = ((await rest(`${sel}&overdue_at=not.is.null&due_at=lt.${encodeURIComponent(nowIso)}&due_at=gte.${dayStart(vn.date)}&order=due_at&limit=500`)) as any[])
      .filter((j) => !over.some((o) => o.id === j.id) && Date.parse(j.nag_at || j.overdue_at) <= now - every * 60000);
    msgs.push(
      ...groupPush(near, (j) => ({ title: `⏰ Còn ${soonMin} phút: ${j.title}`, body: `Hạn ${when(j.due_at)} · nộp ảnh ngay trên tool`, url: APP + "#today", tag: "job-" + j.id }),
        (l) => ({ title: `⏰ ${l.length} việc còn ${soonMin} phút`, body: l.slice(0, 4).map((j) => `• ${j.title} (hạn ${when(j.due_at)})`).join("\n"), url: APP + "#today", tag: "jobs-near" })),
      ...groupPush(nag, (j) => ({ title: `⚠️ Quá hạn ${mins(Math.floor((now - Date.parse(j.due_at)) / 60000))}: ${j.title}`, body: `Hạn ${when(j.due_at)} · nộp ngay`, url: APP + "#today", tag: "job-" + j.id }),
        (l) => ({ title: `⚠️ Còn ${l.length} việc quá hạn chưa nộp`, body: l.slice(0, 4).map((j) => `• ${j.title} (hạn ${when(j.due_at)})`).join("\n"), url: APP + "#today", tag: "jobs-nag" })),
    );
    try { msgs.push(...(await shiftStartNudges(vn))); } catch (e) { out.nudgeError = String((e as Error).message).slice(0, 120); }
    if (msgs.length) out.push = await pushMany(msgs);
    const soonFresh = fresh.filter((j) => j.due_at <= soonAt).map((j) => j.id);
    if (fresh.length) await mark(fresh.map((j) => j.id), "pushed_at");
    if (soon.length || soonFresh.length) await mark([...soon.map((j) => j.id), ...soonFresh], "reminded_at");
    if (over.length) await mark(over.map((j) => j.id), "overdue_at");
    if (near.length) await mark(near.map((j) => j.id), "remind5_at");
    if (nag.length) await mark(nag.map((j) => j.id), "nag_at");
    // cho tick gửi Telegram "Nhắc công việc" (mục jobdue) — việc lặp lại chỉ nhắc bằng thông báo đẩy (chủ quản chọn)
    const manual = (l: any[]) => l.filter((j) => !j.template_id);
    Object.defineProperty(out, "due", { value: { soon: manual([...soon, ...fresh.filter((j) => j.due_at <= soonAt)]), over: manual(over), before }, enumerable: false });
  } catch (e) { out.pushError = String((e as Error).message); }
  try { const s = await shiftAuto(cfg); if (s) out.shift = s; } catch (e) { out.shiftError = String((e as Error).message); }
  try { const b = await biAuto(); if (b) out.bi = { read: b.read, errors: b.errors, remaining: b.remaining }; } catch (e) { out.biError = String((e as Error).message); }
  return out;
}

// D13: phút 0–4 và 30–34 đọc lại trang tính việc lặp lại (Apps Script bản 4); mọi lượt giao việc hôm nay theo lịch ca
async function rtAuto(cfg: Record<string, any>) {
  const vn = vnParts(), m = Number(vn.hm.slice(3)) % 30;
  if (m < 5 && cfg.RT_SHEET_ID && (await driveReady()) && (await driveVersion()) >= 4) {
    const r = await rtSync("tu-dong");
    return { sync: r.rows, new: r.new, removed: r.removed };
  }
  const tpl: any[] = await rest("job_templates?select=id&active=eq.true&limit=1");
  if (!tpl.length) return null;
  const g = await rpc("rt_generate", { p_date: vn.date });
  return g?.new || g?.removed ? { new: g.new, removed: g.removed } : null;
}

// D13: lúc vào ca (15 phút trước → 15 phút sau giờ bắt đầu ca đầu tiên) báo tổng quan việc hôm nay — mỗi NV mỗi ngày 1 lần
const toMin = (hm: string) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
async function shiftStartNudges(vn: { date: string; hm: string }) {
  const slots: string[] = ((await rest("settings?select=value&key=eq.SHIFT_SLOTS"))[0]?.value || []).map(String);
  const shifts: any[] = await rest(`shifts?select=staff_id,slots&d=eq.${vn.date}`);
  const now = toMin(vn.hm);
  const starting = shifts.filter((x) => (x.slots || []).length).filter((x) => { const st = toMin(String(slots[Math.min(...x.slots) - 1] || "").split("-")[0]); return st >= 0 && now >= st - 15 && now < st + 15; });
  if (!starting.length) return [];
  const ids = starting.map((x) => encodeURIComponent(x.staff_id)).join(",");
  const sent = new Set(((await rest(`job_nudges?select=staff_id&d=eq.${vn.date}&kind=eq.shift&staff_id=in.(${ids})`)) as any[]).map((x) => x.staff_id));
  const todo = starting.filter((x) => !sent.has(x.staff_id));
  if (!todo.length) return [];
  const jobs: any[] = await rest(`jobs?select=staff_id,title,due_at&status=eq.todo&staff_id=in.(${todo.map((x) => encodeURIComponent(x.staff_id)).join(",")})&due_at=gte.${dayStart(vn.date)}&due_at=lt.${dayStart(addDays(vn.date, 1))}&order=due_at&limit=1000`);
  await rest("job_nudges?on_conflict=staff_id,d,kind", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(todo.map((x) => ({ staff_id: x.staff_id, d: vn.date, kind: "shift" }))) });
  return todo.map((x) => ({ x, l: jobs.filter((j) => j.staff_id === x.staff_id) })).filter(({ l }) => l.length)
    .map(({ x, l }) => ({ staff_id: x.staff_id, data: { title: `🕑 Vào ca: bạn có ${l.length} việc hôm nay`, body: l.slice(0, 6).map((j) => `• ${j.title} (hạn ${when(j.due_at)})`).join("\n"), url: APP + "#today", tag: "shift-start" } as PushData }));
}

// B16: mỗi lượt (5 phút) từ 06:00 đến 22:59 xem thư mục "00 - Nhập doanh thu và thi đua", có ảnh mới thì đọc (mỗi lượt ≤ 3 ảnh trong ~35 giây)
//   → 12 ảnh úp trước 9h đọc xong trong khoảng 30 phút
async function biAuto() {
  const h = Number(vnParts().hm.slice(0, 2));
  if (h < 6 || h >= 23) return null;
  if (!(await driveReady()) || (await driveVersion()) < 3) return null;
  const r = await biSync("tu-dong", 3, [], 25000);   // ≤ 25 giây bắt đầu ảnh mới (còn chỗ cho Telegram trong 150 giây)
  return r.read || r.errors ? r : null;
}

// Đọc file lịch ca mới nhất trong Drive (30 phút / lần); file chưa đổi thì Apps Script không gửi lại nội dung
async function shiftAuto(cfg: Record<string, any>, force = false) {
  const p = vnParts();
  if (!force && Number(p.hm.slice(3)) % 30 >= 5) return null;
  if (!(await driveReady())) return null;
  const ver = await driveVersion();
  if (ver < 2) return null;   // Apps Script bản 1 chưa có "latest"
  const last = cfg.SHIFT_LAST && typeof cfg.SHIFT_LAST === "object" ? cfg.SHIFT_LAST : {};
  const path = Array.isArray(cfg.SHIFT_DRIVE_PATH) ? cfg.SHIFT_DRIVE_PATH.map(String) : ["Tool Báo Cáo", "02 - Lịch ca làm việc"];
  if (ver >= 3) return await shiftAll(cfg, path);   // bản 3: đọc MỌI file mới / vừa sửa (TGDĐ, Topzone… mỗi bên 1 file)
  const r = await drive({ action: "latest", path, since: last.updated || "", since_id: last.file_id || "" });
  if (!r.version || !r.file || !r.data) return null;
  return await importShiftFile(r.file, r.data, "tu-dong");
}
// Mọi file Excel / CSV trong thư mục lịch ca sửa trong 21 ngày gần đây mà chưa đọc (hoặc đã sửa từ lần đọc trước) → đọc lần lượt (≤ 3 file / lượt).
// Nhớ file đã đọc ở cài đặt SHIFT_SEEN {file_id: updated}. Mỗi file chỉ thay lịch của NV có trong file đó.
async function shiftAll(cfg: Record<string, any>, path: string[]) {
  const l = await drive({ action: "list", path });
  const since = new Date(Date.now() - 21 * 864e5).toISOString();
  const seen: Record<string, string> = cfg.SHIFT_SEEN && typeof cfg.SHIFT_SEEN === "object" ? { ...cfg.SHIFT_SEEN } : {};
  const todo = ((l.files || []) as any[]).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name) && f.updated >= since && seen[f.id] !== f.updated)
    .sort((a, b) => (a.updated < b.updated ? -1 : 1)).slice(0, 3);
  if (!todo.length) return null;
  const done: any[] = [], list: any[] = [];
  for (const f of todo) {
    try {
      const g = await drive({ action: "get", id: f.id, path });
      const r: any = await importShiftFile({ id: f.id, name: f.name, updated: f.updated }, g.data, "tu-dong");
      done.push({ file: r.file, n: r.n, unmatched: r.unmatched, conflicts: r.conflicts }); list.push(...(r.list || []));
    } catch (e) { done.push({ file: f.name, error: String((e as Error).message).slice(0, 200) }); }
    seen[f.id] = f.updated;   // lỗi cũng đánh dấu để không đọc lại mãi — sửa file thì đọc lại
  }
  for (const k of Object.keys(seen)) if (!((l.files || []) as any[]).some((f) => f.id === k)) delete seen[k];   // file đã xoá
  await rest("settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "SHIFT_SEEN", value: seen, updated_by: "tu-dong" }) });
  const out = { files: done, conflicts: list.length, file: done.map((x) => x.file).join(", ") };
  Object.defineProperty(out, "list", { value: list, enumerable: false });
  return out;
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
  const conf: any[] = Array.isArray(res?.conflicts) ? res.conflicts : [];
  if (conf.length) {   // D12d: xếp ca trùng lịch bận / OFF → báo QL ngay trên điện thoại (Telegram gửi ở tick)
    try {
      const mgr: any[] = await rest("memberships?select=staff_id&active=eq.true&role=in.(owner,manager)&staff_id=not.is.null");
      await pushMany(mgr.map((x) => ({ staff_id: x.staff_id, data: { title: `⚠️ Lịch ca trùng lịch bận: ${conf.length} chỗ`, body: conf.slice(0, 4).map((c) => `• ${dm(c.d)} ${short(c.name)}: ${c.kind === "off" ? "OFF" : "bận"} nhưng có ca`).join("\n"), url: APP + "#cv", tag: "shift-conflict" } })));
    } catch { /* không có máy nào bật thông báo */ }
  }
  const out = { file: file.name, n: res?.n ?? rows.length, unmatched: unmatched.length, conflicts: conf.length };
  Object.defineProperty(out, "list", { value: conf, enumerable: false });   // cho tin Telegram, không đưa tên ra kết quả trả về
  return out;
}

// Tin Telegram: các chỗ xếp ca trùng lịch bận / OFF NV đã đăng ký
export function shiftConflictMsg(store: string, file: string, list: any[], slots: string[]) {
  if (!list.length) return null;
  const rng = (x: number[]) => { const s = [...x].sort((a, b) => a - b), g: number[][] = []; for (const v of s) { const l = g[g.length - 1]; if (l && v === l[1] + 1) l[1] = v; else g.push([v, v]); } return g.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", "); };
  const time = (x: number[]) => { const s = [...x].sort((a, b) => a - b), t1 = String(slots[s[0] - 1] || "").split("-")[0], t2 = String(slots[s[s.length - 1] - 1] || "").split("-")[1]; return t1 && t2 ? ` (${t1}–${t2})` : ""; };
  const L = [`⚠️ <b>LỊCH CA TRÙNG LỊCH BẬN / OFF</b> · ${esc(store)}`, `File: ${esc(file)} · ${list.length} chỗ cần xem lại`, ""];
  for (const c of list) {
    const what = c.kind === "off" ? "đăng ký <b>OFF</b>" : c.kind === "ban" ? `bận <b>Ca ${rng(c.busy)}</b>` : "bận (chưa ghi ca)";
    L.push(`• ${dow(c.d)} ${dm(c.d)} · <b>${esc(short(c.name))}</b>: ${what} nhưng xếp Ca ${rng(c.slots)}${time(c.slots)}${c.kind === "ban" ? ` → trùng Ca ${rng(c.overlap)}` : ""}`);
  }
  L.push("", `Sửa lại ở tool sắp ca rồi bỏ file mới vào Drive. Xem: ${APP}#cv`);
  return L.join("\n");
}
