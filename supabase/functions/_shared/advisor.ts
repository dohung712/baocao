// D15 🧠 Cố vấn AI cho Giám đốc — 3 Agent dùng AI chữ (Gemini, không đọc ảnh → rất ít tốn lượt):
//  • biz    📊 Cố vấn thi đua: doanh thu kênh, thi đua siêu thị, thẻ BI từng NV → tổng quan, rủi ro, điểm sáng, NV kéo / cần hỗ trợ, 3 việc làm ngay
//  • people 💚 Sức khoẻ nhân sự: việc đúng hạn, thông báo có mở, tải ca (giờ, ngày liền, ca tối), số BI tháng này vs tháng trước
//           → 🌟 phong độ tốt · ⚠️ cần quan tâm · 🔴 rủi ro (quá tải / sa sút / né việc), gợi ý trao đổi 1-1
//  • ask    💬 Hỏi đáp: Giám đốc hỏi bằng lời trên điện thoại, AI trả lời từ dữ liệu thật (thi đua, nhân sự, việc hôm nay, hộp duyệt)
// Số liệu tính sẵn bằng code rồi mới đưa AI viết nhận định — AI không tự tính, không bịa số.
import { rest, rpc, vnParts, addDays, gemini } from "./common.ts";

const dayStart = (d: string) => encodeURIComponent(`${d}T00:00:00+07:00`);
const r1 = (x: unknown) => (x === null || x === undefined || x === "" || Number.isNaN(Number(x)) ? null : Math.round(Number(x) * 10) / 10);
const short = (n: string) => String(n || "").trim().split(/\s+/).slice(-2).join(" ");

export async function aiKey() {
  const k = (await rest("private_settings?select=value&key=eq.GEMINI_API_KEY"))[0]?.value;
  if (!k) throw new Error("Chưa cài khoá AI (Quản lý → Cài đặt → Trợ lý AI).");
  return k as string;
}
function daysLeft(date: string) {
  const [y, m, d] = date.split("-").map(Number), tot = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { total: tot, elapsed: d, left: tot - d + 1 };
}
function card(data: any) {   // thẻ BI 1 NV: giữ số chính, bỏ phần dài
  const s = data?.staff || {};
  const keep = ["revenue_qd", "revenue_target", "pct_target", "pct_target_avg", "complete_pct", "score", "score_max", "group_rank", "group_size", "bills", "conversion_pct",
    "installment_pct", "installment_avg", "attach_pct", "erp_points", "contest_pct", "contest_passed", "contest_total", "contest_store_avg", "contest_near", "contest_need", "dtqd_per_hour", "dtqd_per_hour_avg", "avg_price"];
  const o: Record<string, unknown> = {};
  for (const k of keep) if (s[k] !== null && s[k] !== undefined) o[k] = s[k];
  if (Array.isArray(data?.programs)) o.thi_dua = data.programs.slice(0, 14).map((p: any) => `${p.name}: ${p.pct ?? "-"}%`);
  if (Array.isArray(data?.notes)) o.nhan_xet_bi = data.notes.slice(0, 4);
  if (Array.isArray(data?.monthly)) o.dt_theo_thang = data.monthly.slice(-4).map((x: any) => `${x.month}: ${x.value}`);
  return o;
}

// ---------- Số liệu thi đua ----------
export async function bizSnapshot() {
  const vn = vnParts(), month = vn.date.slice(0, 7), dl = daysLeft(vn.date);
  const [rev, contest, cards, staff] = await Promise.all([
    rest(`bi_files?select=store_code,channel,data_through,captured_at,data&kind=eq.store_revenue&status=eq.ok&month=eq.${month}&order=data_through.desc.nullslast,processed_at.desc&limit=12`) as Promise<any[]>,
    rest("store_contest?select=name,type,actual,target,rate_month,forecast,rank,branch&limit=200") as Promise<any[]>,
    rest(`bi_files?select=staff_id,data_through,data&kind=eq.staff_card&status=eq.ok&month=eq.${month}&staff_id=not.is.null&order=data_through.desc.nullslast,processed_at.desc&limit=200`) as Promise<any[]>,
    rest("staff?select=id,name,dept&hidden=eq.false") as Promise<any[]>,
  ]);
  const nm = new Map(staff.map((s) => [s.id, s.name]));
  const kenh: any[] = [], seenK = new Set<string>();
  for (const r of rev) { const k = r.store_code + "|" + r.channel; if (seenK.has(k)) continue; seenK.add(k); kenh.push({ kenh: r.channel === "AAR" ? "Topzone" : r.channel === "TGD" ? "TGDĐ" : r.channel, so_lieu_toi_ngay: r.data_through, ...(r.data?.revenue || {}), ngay_qua: r.data?.days_elapsed, tong_ngay: r.data?.days_total }); }
  const seenS = new Set<string>(), nv: any[] = [];
  for (const c of cards) { if (seenS.has(c.staff_id)) continue; seenS.add(c.staff_id); nv.push({ ten: nm.get(c.staff_id) || c.staff_id, bo_phan: staff.find((s) => s.id === c.staff_id)?.dept, so_lieu_toi_ngay: c.data_through, ...card(c.data) }); }
  const ct = contest.map((x) => ({ chuong_trinh: x.name, loai: x.type, kenh: x.branch, thuc_hien: r1(x.actual), target: r1(x.target), dat_pct: r1(x.rate_month), du_kien_pct: r1(x.forecast), hang_vung: x.rank }))
    .sort((a, b) => (a.du_kien_pct ?? 999) - (b.du_kien_pct ?? 999));
  return { hom_nay: vn.date, ngay_trong_thang: dl, doanh_thu_kenh: kenh, thi_dua_sieu_thi: ct, nhan_vien_bi: nv };
}

// ---------- Số liệu sức khoẻ nhân sự ----------
export async function peopleSnapshot() {
  const vn = vnParts(), from = addDays(vn.date, -13), month = vn.date.slice(0, 7);
  const pm = (() => { const [y, m] = month.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const nowIso = new Date().toISOString();
  const [staff, jobs, pl, subs, sh, busy, cards, stars] = await Promise.all([
    rest("staff?select=id,name,dept&hidden=eq.false&order=sort,id") as Promise<any[]>,
    rest(`jobs?select=staff_id,status,late_min,due_at,seen_at,group_key,done_staff&excused=eq.false&due_at=gte.${dayStart(from)}&due_at=lt.${encodeURIComponent(nowIso)}&limit=8000`) as Promise<any[]>,
    rest(`push_log?select=staff_id,sent,clicked_at,closed_at&kind=in.(new,soon,near,over,nag,shift,manual,escalate)&at=gte.${dayStart(from)}&limit=10000`) as Promise<any[]>,
    rest("push_subs?select=staff_id") as Promise<any[]>,
    rest(`shifts?select=staff_id,d,slots,hours&d=gte.${from}&d=lte.${addDays(vn.date, 6)}&limit=5000`) as Promise<any[]>,
    rest(`busy?select=staff_id,busy_date,type&busy_date=gte.${from}&busy_date=lte.${addDays(vn.date, 6)}&limit=2000`).catch(() => []) as Promise<any[]>,
    rest(`bi_files?select=staff_id,month,data_through,data&kind=eq.staff_card&status=eq.ok&month=in.(${month},${pm})&staff_id=not.is.null&order=data_through.desc.nullslast&limit=400`) as Promise<any[]>,
    rest("staff_stars?select=id,total_star").catch(() => []) as Promise<any[]>,
  ]);
  const sub = new Set(subs.map((x) => x.staff_id));
  const out = staff.map((s) => {
    // việc 14 ngày (việc cả ca do người khác nộp: không tính cho người này)
    const js = jobs.filter((j) => j.staff_id === s.id && !(j.group_key && j.status === "done" && j.done_staff && j.done_staff !== s.id));
    const late = js.filter((j) => j.status === "done" && Number(j.late_min) > 0).length, miss = js.filter((j) => j.status === "missed" || j.status === "todo").length;
    const p = pl.filter((x) => x.staff_id === s.id && x.sent > 0);
    const past = sh.filter((x) => x.staff_id === s.id && x.d <= vn.date && (x.slots || []).length).map((x) => x.d).sort();
    let run = 0, best = 0, prev = "";
    for (const d of past) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const myShifts = sh.filter((x) => x.staff_id === s.id && x.d <= vn.date);
    const next7 = sh.filter((x) => x.staff_id === s.id && x.d > vn.date && (x.slots || []).length).length;
    const night = myShifts.filter((x) => (x.slots || []).some((n: number) => n >= 5)).length;
    const cur = cards.find((c) => c.staff_id === s.id && c.month === month), old = cards.find((c) => c.staff_id === s.id && c.month === pm);
    const bi = (c: any) => c ? { pct_target: c.data?.staff?.pct_target, hoan_thanh_pct: c.data?.staff?.complete_pct, dt_qd: c.data?.staff?.revenue_qd, thi_dua_dat: c.data?.staff?.contest_passed !== undefined ? `${c.data.staff.contest_passed}/${c.data.staff.contest_total}` : undefined, tra_cham_pct: c.data?.staff?.installment_pct, hang_nhom: c.data?.staff?.group_rank ? `${c.data.staff.group_rank}/${c.data.staff.group_size}` : undefined, toi_ngay: c.data_through } : null;
    return {
      ten: s.name, bo_phan: s.dept,
      viec_14_ngay: { tong: js.length, dung_han: js.length - late - miss, nop_tre: late, bo_lo_chua_nop: miss, ti_le_dung_han_pct: js.length ? Math.round(((js.length - late - miss) * 100) / js.length) : null, da_xem_viec_pct: js.length ? Math.round((js.filter((j) => j.seen_at).length * 100) / js.length) : null },
      thong_bao_14_ngay: { da_bat: sub.has(s.id), nhan: p.length, bam_mo: p.filter((x) => x.clicked_at).length, gat_tat: p.filter((x) => x.closed_at && !x.clicked_at).length },
      ca_lam: { so_ngay_14_ngay: past.length, tong_gio_14_ngay: r1(myShifts.reduce((a, x) => a + (Number(x.hours) || 0), 0)), ngay_lien_tiep_dai_nhat: best, so_ngay_co_ca_toi: night, so_ngay_co_ca_7_ngay_toi: next7,
        dang_ky_ban_off: busy.filter((b) => b.staff_id === s.id).length },
      bi_thang_nay: bi(cur), bi_thang_truoc: bi(old),
      tong_sao: stars.find((x) => x.id === s.id)?.total_star ?? null,
    };
  });
  return { hom_nay: vn.date, khoang: `${from} → ${vn.date}`, ghi_chu: "ca tối = ca 5 (18–21h) hoặc ca 6 (21–22h)", nhan_vien: out };
}

// ---------- Số liệu công việc trong ngày (D15b, báo cáo 21:00) ----------
export async function daySnapshot() {
  const vn = vnParts(), nowIso = new Date().toISOString();
  const [staff, jobs, box, pl, subs] = await Promise.all([
    rest("staff?select=id,name,dept") as Promise<any[]>,
    rest(`jobs?select=id,staff_id,title,due_at,status,late_min,seen_at,group_key,done_staff,excused,note&due_at=gte.${dayStart(vn.date)}&due_at=lt.${dayStart(addDays(vn.date, 1))}&order=due_at&limit=3000`) as Promise<any[]>,
    rest("agent_items?select=kind,title,detail&status=eq.open&needs_decision=eq.true&limit=80") as Promise<any[]>,
    rest(`push_log?select=staff_id,sent,clicked_at&kind=in.(new,soon,near,over,nag,shift,manual,escalate)&at=gte.${dayStart(vn.date)}&limit=8000`) as Promise<any[]>,
    rest("push_subs?select=staff_id") as Promise<any[]>,
  ]);
  const nm = new Map(staff.map((s) => [s.id, short(s.name)]));
  const n = (id: string) => nm.get(id) || id;
  const st = (j: any) => j.excused ? "được miễn / dời hạn" : j.status === "done" ? (Number(j.late_min) > 0 ? `nộp trễ ${j.late_min} phút` : "đúng hạn") : j.status === "missed" ? "bỏ lỡ" : j.due_at < nowIso ? "quá hạn chưa nộp" : "chưa tới hạn";
  // việc cả ca gộp 1 dòng
  const seen = new Set<string>(), viec: any[] = [];
  for (const j of jobs) {
    const k = j.group_key || "j" + j.id; if (seen.has(k)) continue; seen.add(k);
    const g = jobs.filter((x) => (x.group_key || "j" + x.id) === k), rep = g.find((x) => x.status === "done" && x.done_staff === x.staff_id) || j;
    viec.push({ viec: j.title, han: vnParts(new Date(j.due_at)).hm, nguoi: g.length > 1 ? `Ca (${g.map((x) => n(x.staff_id)).join(", ")})` : n(j.staff_id), trang_thai: st(rep), nguoi_nop: rep.status === "done" && rep.done_staff ? n(rep.done_staff) : undefined, chua_xem: g.filter((x) => x.status === "todo" && !x.seen_at).map((x) => n(x.staff_id)) });
  }
  const sub = new Set(subs.map((x) => x.staff_id));
  const per = [...new Set(jobs.map((j) => j.staff_id))].map((id) => {
    const js = jobs.filter((j) => j.staff_id === id && !j.excused && !(j.group_key && j.status === "done" && j.done_staff && j.done_staff !== id));
    const p = pl.filter((x) => x.staff_id === id && x.sent > 0);
    return { nv: n(id), tong: js.length, dung_han: js.filter((j) => j.status === "done" && !Number(j.late_min)).length, tre: js.filter((j) => j.status === "done" && Number(j.late_min) > 0).length,
      chua_nop_qua_han: js.filter((j) => j.status === "missed" || (j.status === "todo" && j.due_at < nowIso)).length, nhac: p.length, bam_mo: p.filter((x) => x.clicked_at).length, da_bat_thong_bao: sub.has(id) };
  });
  const all = viec.filter((v) => v.trang_thai !== "được miễn / dời hạn");
  return { hom_nay: vn.date, gio: vn.hm, tong_viec: all.length, dung_han: all.filter((v) => v.trang_thai === "đúng hạn").length, tre: all.filter((v) => v.trang_thai.startsWith("nộp trễ")).length,
    con_sot: all.filter((v) => ["quá hạn chưa nộp", "bỏ lỡ"].includes(v.trang_thai)).length, chua_toi_han: all.filter((v) => v.trang_thai === "chưa tới hạn").length,
    viec, theo_nguoi: per, hop_duyet_cho_quyet: box };
}

const SYS = "Bạn là cố vấn vận hành cho Giám đốc một siêu thị Thế Giới Di Động / Topzone. Viết tiếng Việt, ngắn gọn, dễ đọc trên điện thoại. " +
  "CHỈ dùng số trong dữ liệu JSON; thiếu số thì nói 'chưa có số', tuyệt đối không bịa. Tiền tính bằng triệu đồng (tr). " +
  "Định dạng văn bản thường (KHÔNG dùng markdown, không dùng dấu * hay #); mỗi mục bắt đầu bằng emoji tiêu đề; gạch đầu dòng bằng '•'.";
const P_BIZ = "Viết BÁO CÁO THI ĐUA cho Giám đốc (tối đa ~220 chữ) theo đúng khung:\n" +
  "📊 Tổng quan: 1–2 câu (DT quy đổi từng kênh, % target, dự kiến cuối tháng, còn bao nhiêu ngày).\n" +
  "🔴 Rủi ro: tối đa 4 dòng — chương trình thi đua / kênh có % dự kiến thấp nhất, mỗi dòng nói cần bù bao nhiêu (nếu tính được từ thực hiện, target, số ngày còn lại: (target − thực hiện) / ngày còn lại).\n" +
  "🟢 Điểm sáng: tối đa 3 dòng.\n" +
  "👥 Nhân viên: ai đang kéo (top), ai cần hỗ trợ (đuối nhất) — nêu số.\n" +
  "✅ Việc làm ngay hôm nay: đúng 3 việc cụ thể, giao cho ai / ngành hàng nào.";
const P_PEOPLE = "Viết BÁO CÁO SỨC KHOẺ NHÂN SỰ (tinh thần & hiệu suất làm việc, KHÔNG phải sức khoẻ y tế; không suy đoán đời tư) cho Giám đốc, tối đa ~260 chữ, đúng khung:\n" +
  "💚 Tổng quan: 1–2 câu về cả đội (tỉ lệ đúng hạn chung, tải ca).\n" +
  "🌟 Phong độ tốt (nên khen): tối đa 3 người, mỗi người 1 lý do có số.\n" +
  "⚠️ Cần quan tâm: những người có dấu hiệu: quá tải (≥ 7 ngày làm liên tiếp, nhiều ca tối, giờ cao), sa sút (% target / thi đua giảm so tháng trước), né việc (trễ / bỏ lỡ nhiều, nhận nhắc mà không mở, chưa bật thông báo). Mỗi người: dấu hiệu có số + 1 câu gợi ý khi trao đổi 1-1.\n" +
  "🔴 Rủi ro cao: chỉ ghi nếu có người dính ≥ 2 nhóm dấu hiệu cùng lúc; không có thì ghi 'Không có'.\n" +
  "✅ Việc Giám đốc nên làm tuần này: 2–3 việc.";

const P_DAY = "Viết BÁO CÁO CÔNG VIỆC TRONG NGÀY cho Giám đốc lúc cuối ngày (tối đa ~230 chữ), đúng khung:\n" +
  "📋 Tổng quan: x/y việc đã xong, bao nhiêu đúng hạn / trễ / còn sót / chưa tới hạn.\n" +
  "❌ Còn sót, thiếu: liệt kê việc quá hạn chưa nộp hoặc bỏ lỡ — tên việc, ai (cả ca thì ghi ca), hạn; ai chưa mở xem việc.\n" +
  "⏰ Nộp trễ: tối đa 4 dòng, ai trễ bao lâu.\n" +
  "👥 Theo người: 🌟 làm tốt (đúng hạn hết) · ⚠️ cần nhắc (trễ / sót nhiều, nhận nhắc mà không mở, chưa bật thông báo).\n" +
  "📥 Còn chờ duyệt: số mục + loại (nếu có).\n" +
  "✅ Việc cần xử lý trước khi hết ngày: tối đa 3 việc cụ thể (nhắc ai, cho nộp bù việc gì…).";

export async function runReport(kind: "biz" | "people" | "day", by: string) {
  const key = await aiKey();
  const snap = kind === "biz" ? await bizSnapshot() : kind === "day" ? await daySnapshot() : await peopleSnapshot();
  const text = await gemini(key, {
    systemInstruction: { parts: [{ text: SYS }] },
    contents: [{ role: "user", parts: [{ text: (kind === "biz" ? P_BIZ : kind === "day" ? P_DAY : P_PEOPLE) + "\n\nDỮ LIỆU:\n" + JSON.stringify(snap) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: "low" } },
  });
  if (!text) throw new Error("AI không trả lời.");
  const row = (await rest("advisor_reports?select=id,created_at", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ kind, text: text.slice(0, 8000), by }) }))[0];
  return { id: row?.id, created_at: row?.created_at, text };
}

export async function ask(question: string, history: { role: string; text: string }[]) {
  const key = await aiKey();
  const vn = vnParts();
  const [biz, people, today, box, last] = await Promise.all([
    bizSnapshot(), peopleSnapshot(),
    rest(`jobs?select=staff_id,title,due_at,status,late_min,excused&due_at=gte.${dayStart(vn.date)}&due_at=lt.${dayStart(addDays(vn.date, 1))}&limit=1000`) as Promise<any[]>,
    rest("agent_items?select=kind,title,detail&status=eq.open&limit=60") as Promise<any[]>,
    rest("advisor_reports?select=kind,created_at,text&order=created_at.desc&limit=2") as Promise<any[]>,
  ]);
  const staff: any[] = await rest("staff?select=id,name");
  const nm = new Map(staff.map((s) => [s.id, s.name]));
  const now = new Date().toISOString();
  const viec = today.filter((j) => !j.excused).map((j) => ({ nv: short(nm.get(j.staff_id) || j.staff_id), viec: j.title, han: vnParts(new Date(j.due_at)).hm, trang_thai: j.status === "done" ? (Number(j.late_min) > 0 ? "nộp trễ" : "đã nộp") : j.status === "missed" ? "bỏ lỡ" : j.due_at < now ? "quá hạn chưa nộp" : "chưa tới hạn" }));
  const ctx = { gio_hien_tai: vn.date + " " + vn.hm, thi_dua: biz, nhan_su: people, viec_hom_nay: viec, hop_duyet_dang_mo: box, bao_cao_ai_gan_nhat: last };
  const hist = (history || []).slice(-6).map((h) => ({ role: h.role === "ai" ? "model" : "user", parts: [{ text: String(h.text || "").slice(0, 2000) }] }));
  const text = await gemini(key, {
    systemInstruction: { parts: [{ text: SYS + " Trả lời câu hỏi của Giám đốc thật ngắn (≤ 150 chữ trừ khi được yêu cầu chi tiết), số liệu cụ thể, kết thúc bằng 1 gợi ý hành động nếu hợp lý.\n\nDỮ LIỆU:\n" + JSON.stringify(ctx) }] },
    contents: [...hist, { role: "user", parts: [{ text: question.slice(0, 1500) }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingLevel: "low" } },
  });
  return text || "AI chưa trả lời được câu này.";
}

// Gửi Telegram dạng chữ thường (không HTML) — chats rỗng thì bỏ qua
export async function tgPlain(chats: string[], text: string) {
  const token = (await rest("private_settings?select=value&key=eq.TELEGRAM_BOT_TOKEN"))[0]?.value;
  if (!token || !chats.length) return 0;
  const parts: string[] = []; let s = text;
  while (s.length > 3900) { const i = s.lastIndexOf("\n", 3900); parts.push(s.slice(0, i > 1000 ? i : 3900)); s = s.slice(i > 1000 ? i : 3900); }
  parts.push(s);
  for (const c of chats) for (const p of parts) await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: c, text: p, disable_web_page_preview: true }) });
  return chats.length;
}
export { rpc };
