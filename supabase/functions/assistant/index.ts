// Edge Function "assistant": trả lời câu hỏi tự do bằng AI (Gemini) dựa trên số liệu thi đua hiện tại.
// Chỉ quản lý / chủ quản dùng; câu hỏi thống kê thường được giao diện tự trả lời không cần AI.
import { json, CORS, rest, rpc, member, vnParts, addDays, gemini } from "../_shared/common.ts";

async function context() {
  const today = vnParts().date, month = today.slice(0, 8) + "01", in7 = addDays(today, 7), from30 = addDays(today, -30);
  const [settings, staff, results, streaks, busy, clean, rs, tiktok, props, changes, contest] = await Promise.all([
    rest("settings?select=key,value"),
    rest("staff_stars?select=id,name,dept,total_star&hidden=eq.false&order=sort,id"),
    rest(`daily_results?select=report_date,staff_id,item_name,actual,rate_pct,star_change,status,compensation&report_date=gte.${from30 < month ? from30 : month}&limit=20000`),
    rpc("current_streaks", {}),
    rest(`busy?select=busy_date,staff_id,type,shifts&busy_date=gte.${addDays(today, -7)}&busy_date=lte.${in7}`),
    rest(`cleaning?select=clean_date,staff_id,photos&clean_date=gte.${addDays(today, -7)}&clean_date=lte.${in7}`),
    rest(`roadshow?select=rs_date,rs_time,staff_id,photos,km,minutes&rs_date=gte.${addDays(today, -7)}&rs_date=lte.${in7}`),
    rest(`tiktok_submissions?select=staff_id,due,status,reward,submit_date&due=gte.${from30}`),
    rest("extra_proposals?select=staff_name,content,stars&status=eq." + encodeURIComponent("Chờ duyệt")),
    rest("change_requests?select=staff_id,report_date,reason&status=eq.pending"),
    rest("store_contest?select=name,type,actual,target,rate_month,forecast,rank,branch&branch=eq." + encodeURIComponent("TỔNG")),
  ]);
  const cfg = Object.fromEntries(settings.map((r: any) => [r.key, r.value]));
  const name = new Map(staff.map((s: any) => [s.id, s.name]));
  const days: Record<string, any> = {};
  for (const r of results) {
    const k = r.report_date;
    (days[k] ||= {});
    const x = (days[k][name.get(r.staff_id) || r.staff_id] ||= { ve_so: 0, so_mon: 0, sao: 0, chi_tiet: [] as string[] });
    if (r.status === "Về số" || r.status === "Chưa về") { x.so_mon++; if (r.status === "Về số") x.ve_so++; }
    x.sao += r.star_change;
    if (k >= addDays(today, -2)) x.chi_tiet.push(`${r.item_name}:${r.actual}(${r.rate_pct ?? "-"}%,${r.compensation},${r.star_change})`);
  }
  return {
    hom_nay: today, gio_chot: cfg.CUTOFF_TIME, sieu_thi: cfg.STORE_NAME,
    quy_tac: { chuoi_tang_ca: cfg.STREAK_OVERTIME, chuoi_tru_sao: cfg.STREAK_PENALTY_STAR, x2_tu: cfg.DOUBLE_BONUS_RATE, phat_tre_moi_lan: cfg.LATE_STEP, tiktok_thuong: cfg.TIKTOK_REWARD, tiktok_phat_moi_ngay: cfg.TIKTOK_PENALTY },
    nhan_vien: staff.map((s: any) => ({ ma: s.id, ten: s.name, bo_phan: s.dept, tong_sao: s.total_star })),
    bao_cao_theo_ngay: days,
    chuoi_chua_ve: streaks.filter((s: any) => s.streak >= 2).map((s: any) => ({ nv: name.get(s.staff_id), mon: s.item_name, ngay: s.streak })),
    lich_ban_off: busy.map((b: any) => ({ ngay: b.busy_date, nv: name.get(b.staff_id), loai: b.type, ca: b.shifts })),
    ve_sinh: clean.map((c: any) => ({ ngay: c.clean_date, nv: name.get(c.staff_id), da_nop_anh: c.photos.length >= 3 })),
    roadshow: rs.map((r: any) => ({ ngay: r.rs_date, gio: r.rs_time, nv: name.get(r.staff_id), da_bao_cao: r.photos.length >= 3, km: r.km, phut: r.minutes })),
    tiktok_30_ngay: tiktok.map((t: any) => ({ nv: name.get(t.staff_id), han: t.due, trang_thai: t.status, ngay_nop: t.submit_date })),
    cho_duyet: { ban_them: props, sua_bao_cao: changes.map((c: any) => ({ nv: name.get(c.staff_id), ngay: c.report_date, ly_do: c.reason })) },
    thi_dua_sieu_thi: contest,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const m = await member(req);
    if (!["owner", "manager"].includes(m.role)) throw new Error("Trợ lý AI chỉ dành cho quản lý.");
    const body = await req.json().catch(() => ({}));
    const q = String(body.question || "").slice(0, 1500).trim();
    if (!q) throw new Error("Chưa có câu hỏi.");
    const keyRow = await rest("private_settings?select=value&key=eq.GEMINI_API_KEY");
    const key = keyRow[0]?.value;
    if (!key) throw new Error("Chưa cài khoá AI (Quản lý → Cài đặt → Trợ lý AI).");
    const ctx = await context();
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
      .map((h: any) => ({ role: h.role === "ai" ? "model" : "user", parts: [{ text: String(h.text || "").slice(0, 2000) }] }));
    const system = "Bạn là trợ lý thi đua bán hàng của siêu thị (Thế Giới Di Động / Topzone). Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào số liệu, dùng gạch đầu dòng khi liệt kê. " +
      "CHỈ dùng dữ liệu JSON được cung cấp; nếu dữ liệu không có thì nói rõ là không có. Không bịa số. Ngày hiển thị dạng dd/mm. Sao ký hiệu ⭐.\n\nDỮ LIỆU:\n" + JSON.stringify(ctx);
    const text = await gemini(key, { systemInstruction: { parts: [{ text: system }] }, contents: [...history, { role: "user", parts: [{ text: q }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1500 } });
    return json({ status: "success", answer: text || "AI không trả lời được câu này." });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
