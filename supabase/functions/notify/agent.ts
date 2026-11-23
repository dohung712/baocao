// D14 🤖 Trợ lý vận hành — chạy trong mỗi lượt (5 phút) của Edge Function "notify", không dùng AI (không tốn lượt Gemini):
//  1. Đi kiểm tra việc trong ngày: việc quá hạn AGENT_ESC_MIN phút (hoặc đã nhắc AGENT_ESC_NAGS lần mà NV không bấm mở)
//     → báo ngay trưởng ca đang trong ca + QL bộ phận (thông báo đẩy) và đưa vào hộp duyệt (cho nộp bù / ghi trễ)
//  2. Hết mỗi ca: đối soát việc của khung ca đó còn chưa nộp → báo trưởng ca / QL
//  3. Canh lỗi hệ thống: chưa có lịch ca ngày mai (AGENT_SHIFT_CHECK), ảnh BI đọc lỗi / chưa có (AGENT_BI_CHECK),
//     đọc trang tính lỗi, NV có việc mà chưa bật thông báo, lịch ca trùng lịch bận, số BI kẹt
//  4. Khung giờ AGENT_TIMES: gom hộp duyệt gửi Giám đốc / QL (thông báo đẩy + Telegram); CN khung cuối kèm phân tích tuần
// Mọi danh sách tên NV chỉ nằm trong thuộc tính không liệt kê (không in ra log công khai).
import { rest, rpc, vnParts, addDays } from "../_shared/common.ts";
import { pushMany, type PushData } from "../_shared/webpush.ts";

const APP = "https://dohung712.github.io/baocao/v2/";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (n: string) => String(n || "").trim().split(/\s+/).slice(-2).join(" ");
const dayStart = (d: string) => encodeURIComponent(`${d}T00:00:00+07:00`);
const toMin = (hm: string) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const hmOf = (iso: string) => vnParts(new Date(iso)).hm;
const inList = (ids: string[]) => ids.map((x) => encodeURIComponent('"' + String(x).replace(/"/g, "") + '"')).join(",");
const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

type Item = { key: string; kind: string; urgent?: boolean; needs_decision?: boolean; staff_id?: string | null; job_id?: number | null; title: string; detail?: string; data?: unknown };
async function addItems(list: Item[]) {
  if (!list.length) return [] as any[];
  return await rest("agent_items?on_conflict=key&select=id,key,kind,urgent,title", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(list.map((x) => ({ urgent: false, needs_decision: true, staff_id: null, job_id: null, detail: "", data: {}, ...x }))) }) as any[];
}
async function once(d: string, kind: string) {   // true = lần đầu (đánh dấu luôn)
  const r: any[] = await rest("job_nudges?on_conflict=staff_id,d,kind&select=kind", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([{ staff_id: "_agent", d, kind }]) });
  return r.length > 0;
}

// Người nhận: trưởng ca đang trong ca (slot) + QL phụ trách bộ phận của NV; không có ai → chủ quản
async function bosses(date: string, staffIds: string[], slot: number | null) {
  const [mem, staff, sh] = await Promise.all([
    rest("memberships?select=staff_id,role,stores&active=eq.true&role=in.(owner,manager)&staff_id=not.is.null") as Promise<any[]>,
    staffIds.length ? rest(`staff?select=id,dept&id=in.(${inList(staffIds)})`) as Promise<any[]> : Promise.resolve([] as any[]),
    rest(`shifts?select=staff_id,slots,pos&d=eq.${date}&pos=not.is.null`) as Promise<any[]>,
  ]);
  const depts = new Set(staff.map((s) => s.dept));
  const tc = sh.filter((x) => /truong ca/.test(norm(x.pos)) && slot !== null && (x.slots || []).includes(slot)).map((x) => x.staff_id);
  const mgr = mem.filter((m) => m.role === "manager" && (!(m.stores || []).length || (m.stores || []).some((s: string) => depts.has(s)))).map((m) => m.staff_id);
  let out = [...new Set([...tc, ...mgr])].filter((id) => !staffIds.includes(id));
  if (!out.length) out = mem.filter((m) => m.role === "owner").map((m) => m.staff_id);
  return out;
}
async function leaders() {   // Giám đốc / QL nhận hộp duyệt
  const mem: any[] = await rest("memberships?select=staff_id&active=eq.true&role=in.(owner,manager)&staff_id=not.is.null");
  return [...new Set(mem.map((m) => m.staff_id))];
}
function curSlot(slots: string[], hm: string) {
  const n = toMin(hm);
  const i = slots.findIndex((s) => { const [a, b] = String(s).split("-"); return n >= toMin(a) && n < toMin(b); });
  return i >= 0 ? i + 1 : null;
}

export async function agentTick(cfg: Record<string, any>, ctx: { rtError?: string } = {}) {
  const out: Record<string, unknown> = {};
  if (cfg.AGENT_ON === false) return null;
  const vn = vnParts(), now = Date.now(), nowIso = new Date(now).toISOString();
  if (vn.hm < "06:00") return null;
  const quiet = vn.hm >= String(cfg.RT_NAG_UNTIL || "22:15");
  const slots: string[] = (Array.isArray(cfg.SHIFT_SLOTS) ? cfg.SHIFT_SLOTS : []).map(String);
  const staffAll: any[] = await rest("staff?select=id,name,dept");
  const nm = new Map(staffAll.map((s) => [s.id, s.name]));
  const name = (id: string) => short(nm.get(id) || id);
  let alerts: string[] = [];

  // ---------- 1. Việc quá hạn → báo lên trên + hộp duyệt ----------
  if (!quiet) try {
    const escMin = Math.max(5, Number(cfg.AGENT_ESC_MIN ?? 30) || 30), escNags = Math.max(1, Number(cfg.AGENT_ESC_NAGS ?? 3) || 3);
    const over: any[] = await rest(`jobs?select=id,staff_id,title,due_at,group_key&status=eq.todo&excused=eq.false&escalated_at=is.null&due_at=gte.${dayStart(vn.date)}&due_at=lt.${encodeURIComponent(nowIso)}&order=due_at&limit=500`);
    if (over.length) {
      const pl: any[] = await rest(`push_log?select=job_ids,clicked_at&kind=in.(over,nag)&sent=gt.0&at=gte.${dayStart(vn.date)}&limit=5000`);
      const nag = new Map<number, number>();
      for (const p of pl) if (!p.clicked_at) for (const id of p.job_ids || []) nag.set(id, (nag.get(id) || 0) + 1);
      const hit = over.filter((j) => now - Date.parse(j.due_at) >= escMin * 60000 || (nag.get(j.id) || 0) >= escNags);
      // gộp việc của cả ca
      const groups = new Map<string, any[]>();
      for (const j of hit) { const k = j.group_key || "j" + j.id; groups.set(k, [...(groups.get(k) || []), j]); }
      const items: Item[] = [], lines: { staff: string[]; text: string }[] = [];
      for (const [k, l] of groups) {
        const j = l[0], who = l.map((x) => x.staff_id), late = Math.floor((now - Date.parse(j.due_at)) / 60000);
        const n = Math.max(...l.map((x) => nag.get(x.id) || 0));
        const whoTxt = who.length > 1 ? `Ca (${who.map(name).join(", ")})` : name(j.staff_id);
        items.push({ key: "late:" + k, kind: "late", staff_id: j.staff_id, job_id: j.id, title: j.title,
          detail: `${whoTxt} · hạn ${hmOf(j.due_at)} · trễ ${late} phút${n ? ` · đã nhắc ${n} lần chưa mở` : ""}`, data: { staff: who, due: j.due_at } });
        lines.push({ staff: who, text: `• ${whoTxt}: ${j.title} (hạn ${hmOf(j.due_at)}${n ? `, nhắc ${n} lần chưa mở` : ""})` });
      }
      await addItems(items);
      const slot = curSlot(slots, vn.hm);
      const by = new Map<string, string[]>();
      for (const ln of lines) for (const b of await bosses(vn.date, ln.staff, slot)) by.set(b, [...(by.get(b) || []), ln.text]);
      if (by.size) await pushMany([...by.entries()].map(([staff_id, l]) => ({ staff_id, data: { title: `🚨 ${l.length} việc quá hạn chưa nộp`, body: l.slice(0, 5).join("\n"), url: APP + "#duyet", tag: "agent-late", kind: "escalate", jobs: hit.map((j) => j.id) } as PushData })));
      for (let i = 0; i < hit.length; i += 150) await rest(`jobs?id=in.(${hit.slice(i, i + 150).map((j) => j.id).join(",")})`, { method: "PATCH", body: JSON.stringify({ escalated_at: nowIso }) });
      out.escalated = hit.length;
    }
    // việc trễ đã nộp / đã xử lý → tự đóng mục trong hộp duyệt
    const open: any[] = await rest("agent_items?select=id,job_id&status=eq.open&kind=eq.late&job_id=not.is.null&limit=500");
    if (open.length) {
      const js: any[] = await rest(`jobs?select=id,status&id=in.(${open.map((x) => x.job_id).join(",")})`);
      const fin = open.filter((x) => js.find((j) => j.id === x.job_id)?.status === "done").map((x) => x.id);
      if (fin.length) await rest(`agent_items?id=in.(${fin.join(",")})`, { method: "PATCH", body: JSON.stringify({ status: "done", note: "NV đã nộp", decided_at: nowIso, decided_by: "tro-ly", updated_at: nowIso }) });
    }
  } catch (e) { out.lateError = String((e as Error).message).slice(0, 160); }

  // ---------- 2. Hết ca: đối soát việc của khung ca ----------
  if (!quiet) try {
    for (const [i, s] of slots.entries()) {
      const [a, b] = String(s).split("-"), end = toMin(b), n = toMin(vn.hm);
      if (end < 0 || n < end || n >= end + 10) continue;
      if (!(await once(vn.date, "slotend-" + (i + 1)))) continue;
      const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      if (toMin(a) < 0) continue;
      const from = `${vn.date}T${hh(toMin(a))}:00+07:00`, to = `${vn.date}T${hh(end)}:00+07:00`;
      const left: any[] = await rest(`jobs?select=id,staff_id,title,due_at,group_key&status=eq.todo&excused=eq.false&due_at=gte.${encodeURIComponent(from)}&due_at=lte.${encodeURIComponent(to)}&limit=300`);
      if (!left.length) continue;
      const seen = new Set<string>(), lines: string[] = [];
      for (const j of left) { const k = j.group_key || "j" + j.id; if (seen.has(k)) continue; seen.add(k); const who = left.filter((x) => (x.group_key || "j" + x.id) === k).map((x) => x.staff_id); lines.push(`• ${who.length > 1 ? "Ca (" + who.map(name).join(", ") + ")" : name(j.staff_id)}: ${j.title} (hạn ${hmOf(j.due_at)})`); }
      const to2 = await bosses(vn.date, [...new Set(left.map((j) => j.staff_id))], i + 1);
      await pushMany(to2.map((staff_id) => ({ staff_id, data: { title: `🔚 Hết ca ${i + 1}: còn ${lines.length} việc chưa nộp`, body: lines.slice(0, 5).join("\n"), url: APP + "#jobs", tag: "agent-slot", kind: "slotend", jobs: left.map((j) => j.id) } as PushData })));
      out.slotEnd = (out.slotEnd as number || 0) + lines.length;
    }
  } catch (e) { out.slotError = String((e as Error).message).slice(0, 160); }

  // ---------- 3. Canh lỗi hệ thống (15 phút 1 lần) ----------
  if (Number(vn.hm.slice(3)) % 15 < 5) try {
    const items: Item[] = [], tomorrow = addDays(vn.date, 1);
    if (vn.hm >= String(cfg.AGENT_SHIFT_CHECK || "20:00")) {
      const [sh, tpl]: any[][] = await Promise.all([rest(`shifts?select=staff_id&d=eq.${tomorrow}&limit=1`), rest("job_templates?select=id&active=eq.true&limit=1")]);
      if (!sh.length && tpl.length) items.push({ key: "no_shift:" + tomorrow, kind: "no_shift", urgent: true, needs_decision: false, title: `Chưa có lịch ca ngày mai (${tomorrow.slice(8)}/${tomorrow.slice(5, 7)})`, detail: "Chưa có lịch ca thì ngày mai tool không giao được việc lặp lại theo ca. Bỏ file lịch ca vào thư mục 02 trên Drive (hoặc Giao việc → 🗓️ Lịch ca)." });
    }
    // lịch ca đã có → đóng cảnh báo cũ
    const ns: any[] = await rest("agent_items?select=id,key&status=eq.open&kind=eq.no_shift");
    for (const x of ns) { const d = x.key.split(":")[1]; const h: any[] = await rest(`shifts?select=staff_id&d=eq.${d}&limit=1`); if (h.length) await rest(`agent_items?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", note: "Đã có lịch ca", decided_at: nowIso, decided_by: "tro-ly" }) }); }
    if (vn.hm >= String(cfg.AGENT_BI_CHECK || "09:30")) {
      const bi: any[] = await rest(`bi_files?select=status,name&processed_at=gte.${dayStart(vn.date)}&limit=200`);
      const bad = bi.filter((x) => x.status === "error");
      if (!bi.length) items.push({ key: "bi:none:" + vn.date, kind: "bi", needs_decision: false, title: "Chưa có ảnh BI nào được đọc hôm nay", detail: "Kiểm tra đã úp ảnh doanh thu / thi đua / thẻ NV vào thư mục 00 chưa." });
      else if (bad.length) items.push({ key: "bi:err:" + vn.date, kind: "bi", needs_decision: false, title: `${bad.length} ảnh BI đọc lỗi hôm nay`, detail: "Mở Siêu thị → công cụ BI → Đọc lại, hoặc nhập tay." });
    }
    if (ctx.rtError) items.push({ key: "rt:" + vn.date, kind: "rt", urgent: true, needs_decision: false, title: "Không đọc được trang tính việc lặp lại", detail: ctx.rtError.slice(0, 300) });
    const todo: any[] = await rest(`jobs?select=staff_id&status=eq.todo&due_at=gte.${dayStart(vn.date)}&due_at=lt.${dayStart(tomorrow)}&limit=2000`);
    const ids = [...new Set(todo.map((x) => x.staff_id))];
    if (ids.length) {
      const subs = new Set(((await rest(`push_subs?select=staff_id&staff_id=in.(${inList(ids)})`)) as any[]).map((x) => x.staff_id));
      const off = ids.filter((id) => !subs.has(id));
      if (off.length) items.push({ key: "no_push:" + vn.date, kind: "no_push", needs_decision: false, title: `${off.length} NV có việc nhưng chưa bật thông báo`, detail: off.map(name).join(", ") + " — nhắc NV mở tool → bật 🔔 thông báo.", data: { staff: off } });
    }
    try {
      const cf = await rpc("_shift_conflicts", { p_from: vn.date, p_to: addDays(vn.date, 6) });
      if (Array.isArray(cf) && cf.length) items.push({ key: `shift_conflict:${vn.date}:${cf.length}`, kind: "shift_conflict", needs_decision: false, title: `${cf.length} chỗ lịch ca trùng lịch bận / OFF (7 ngày tới)`, detail: "Xem Giao việc → 🗓️ Lịch ca (ô tô đỏ)." });
    } catch { /* bỏ qua */ }
    const st: any[] = await rest("bi_proposals?select=id&status=eq.pending&limit=50").catch(() => []);
    if (st.length) items.push({ key: `bi_stuck:${vn.date}`, kind: "bi_stuck", needs_decision: false, title: `${st.length} thẻ số BI của NV đang kẹt chưa áp dụng`, detail: "Mở Quản lý → Duyệt số NV." });
    const added = await addItems(items);
    const urgent = added.filter((x) => x.urgent);
    if (urgent.length) {
      const to = await leaders();
      await pushMany(to.map((staff_id) => ({ staff_id, data: { title: "⚠️ Trợ lý vận hành: cần xử lý gấp", body: urgent.map((x) => "• " + x.title).join("\n"), url: APP + "#duyet", tag: "agent-urgent", kind: "agent" } as PushData })));
      await rest(`agent_items?id=in.(${urgent.map((x) => x.id).join(",")})`, { method: "PATCH", body: JSON.stringify({ alerted_at: nowIso }) });
      alerts = urgent.map((x) => x.title);
    }
    out.health = added.length;
  } catch (e) { out.healthError = String((e as Error).message).slice(0, 160); }

  // ---------- 4. Hộp duyệt theo khung giờ ----------
  let digest: string | null = null;
  try {
    const times: string[] = (Array.isArray(cfg.AGENT_TIMES) ? cfg.AGENT_TIMES : ["12:00", "17:00", "21:30"]).map(String).filter((t: string) => /^\d{2}:\d{2}$/.test(t)).sort();
    const t = times.find((x) => toMin(vn.hm) >= toMin(x) && toMin(vn.hm) < toMin(x) + 15);
    if (t && (await once(vn.date, "digest-" + t))) {
      const open: any[] = await rest("agent_items?select=id,kind,title,detail,urgent,needs_decision,digest_at,created_at&status=eq.open&order=urgent.desc,created_at&limit=300");
      const LABEL: Record<string, string> = { late: "⏰ Việc trễ — cho nộp bù / ghi trễ", req_delay: "🙋 NV xin dời hạn", req_excuse: "🙋 NV xin miễn việc", no_shift: "🗓️ Lịch ca", rt: "📄 Trang tính việc", bi: "📊 Ảnh BI", bi_stuck: "📊 Số BI kẹt", no_push: "🔕 Chưa bật thông báo", shift_conflict: "⚠️ Lịch ca trùng bận", weekly: "📈 Phân tích tuần" };
      const need = open.filter((x) => x.needs_decision), info = open.filter((x) => !x.needs_decision);
      const L = [`📥 <b>TRỢ LÝ VẬN HÀNH · ${t} ${vn.date.slice(8)}/${vn.date.slice(5, 7)}</b>`, esc(String(cfg.STORE_NAME || "")), "",
        need.length ? `Cần anh/chị duyệt: <b>${need.length}</b> mục${info.length ? ` · cần biết: ${info.length}` : ""}` : `✅ Không có mục nào cần duyệt${info.length ? ` · cần biết: ${info.length}` : ""}`];
      const kinds = [...new Set(open.map((x) => x.kind))];
      for (const k of kinds) {
        const l = open.filter((x) => x.kind === k);
        L.push("", `<b>${esc(LABEL[k] || k)}</b> (${l.length})`, ...l.slice(0, 8).map((x) => `${x.urgent ? "❗" : "•"} ${esc(x.title)}${x.detail && x.kind !== "weekly" ? " — " + esc(String(x.detail).slice(0, 140)) : ""}`));
        if (l.length > 8) L.push(`… và ${l.length - 8} mục khác`);
      }
      // CN, khung cuối: phân tích tuần
      if (vn.dow === 0 && t === times[times.length - 1]) {
        const wk = await weekly(vn.date, name);
        if (wk) { L.push("", ...wk.lines); await addItems([{ key: "weekly:" + vn.date, kind: "weekly", needs_decision: false, title: `Phân tích công việc tuần ${addDays(vn.date, -6).slice(8)}/${addDays(vn.date, -6).slice(5, 7)}–${vn.date.slice(8)}/${vn.date.slice(5, 7)}`, detail: wk.plain }]); }
      }
      L.push("", `Duyệt nhanh: ${APP}#duyet`);
      digest = L.join("\n");
      if (open.length) await rest(`agent_items?id=in.(${open.map((x) => x.id).join(",")})&digest_at=is.null`, { method: "PATCH", body: JSON.stringify({ digest_at: nowIso }) });
      if (need.length) {
        const to = await leaders();
        await pushMany(to.map((staff_id) => ({ staff_id, data: { title: `📥 ${need.length} mục chờ duyệt (${t})`, body: need.slice(0, 5).map((x) => "• " + x.title).join("\n"), url: APP + "#duyet", tag: "agent-digest", kind: "agent" } as PushData })));
      }
      out.digest = t;
    }
  } catch (e) { out.digestError = String((e as Error).message).slice(0, 160); }

  Object.defineProperty(out, "digestText", { value: digest, enumerable: false });
  Object.defineProperty(out, "alertText", { value: alerts.length ? `⚠️ <b>TRỢ LÝ VẬN HÀNH: CẦN XỬ LÝ GẤP</b>\n${alerts.map((a) => "• " + esc(a)).join("\n")}\n\nXem: ${APP}#duyet` : null, enumerable: false });
  return out;
}

// Phân tích tuần (7 ngày tới hôm nay): ai hay trễ, việc nào hay trễ, khung giờ nào hay trễ → gợi ý
async function weekly(date: string, name: (id: string) => string) {
  const from = addDays(date, -6);
  const jobs: any[] = await rest(`jobs?select=staff_id,title,due_at,status,late_min,excused,group_key,done_staff&excused=eq.false&due_at=gte.${dayStart(from)}&due_at=lt.${dayStart(addDays(date, 1))}&limit=5000`);
  if (!jobs.length) return null;
  const bad = (j: any) => j.status === "missed" || (j.status === "done" && Number(j.late_min) > 0) || (j.status === "todo" && j.due_at < new Date().toISOString());
  const per = new Map<string, { n: number; b: number }>(), task = new Map<string, { n: number; b: number }>(), hour = new Map<string, { n: number; b: number }>();
  const add = (m: Map<string, { n: number; b: number }>, k: string, b: boolean) => { const x = m.get(k) || { n: 0, b: 0 }; x.n++; if (b) x.b++; m.set(k, x); };
  const seenG = new Set<string>();
  for (const j of jobs) {
    const b = bad(j);
    // việc cả ca đã nộp: chỉ tính cho người nộp; chưa nộp: tính cho cả ca
    if (!(j.group_key && j.status === "done" && j.done_staff && j.done_staff !== j.staff_id)) add(per, j.staff_id, b);
    const gk = j.group_key ? j.group_key : "j" + j.staff_id + j.due_at + j.title;
    if (seenG.has(gk)) continue; seenG.add(gk);
    add(task, j.title.replace(/^(Nộp bù: )/, ""), b);
    add(hour, vnParts(new Date(j.due_at)).hm.slice(0, 2) + "h", b);
  }
  const pct = (x: { n: number; b: number }) => Math.round((x.b * 100) / x.n);
  const topStaff = [...per.entries()].filter(([, x]) => x.b >= 2).sort((a, b) => b[1].b - a[1].b).slice(0, 5);
  const topTask = [...task.entries()].filter(([, x]) => x.n >= 2 && x.b >= 2).sort((a, b) => pct(b[1]) - pct(a[1])).slice(0, 5);
  const topHour = [...hour.entries()].filter(([, x]) => x.n >= 3 && x.b > 0).sort((a, b) => pct(b[1]) - pct(a[1])).slice(0, 3);
  const all = [...task.values()].reduce((a, x) => ({ n: a.n + x.n, b: a.b + x.b }), { n: 0, b: 0 });
  const tips: string[] = [];
  for (const [t, x] of topTask) if (pct(x) >= 50) tips.push(`"${t}" trễ ${pct(x)}% số lần → cân nhắc dời giờ hạn hoặc giao người khác (sửa trang tính)`);
  for (const [id, x] of topStaff) if (x.b >= 3) tips.push(`${name(id)} trễ ${x.b}/${x.n} việc → nhắc riêng / xem lại ca`);
  const lines = [`📈 <b>Phân tích tuần</b>: ${all.n} việc · trễ / bỏ lỡ ${all.b} (${pct(all)}%)`];
  if (topStaff.length) lines.push("Hay trễ: " + topStaff.map(([id, x]) => `${esc(name(id))} ${x.b}/${x.n}`).join(" · "));
  if (topTask.length) lines.push("Việc hay trễ: " + topTask.map(([t, x]) => `${esc(t)} ${pct(x)}%`).join(" · "));
  if (topHour.length) lines.push("Giờ hạn hay trễ: " + topHour.map(([h, x]) => `${h} ${pct(x)}%`).join(" · "));
  if (tips.length) lines.push("💡 Gợi ý:", ...tips.map((x) => "• " + esc(x)));
  const plain = lines.join("\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { lines, plain };
}
