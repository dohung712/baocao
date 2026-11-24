// Edge Function "accounts": chủ quản tạo / đặt lại mật khẩu đăng nhập bằng Mã NV cho nhân viên.
// Nhân viên đăng nhập bằng Mã NV + mật khẩu (tài khoản nội bộ nv<mã>@thidua351.vn, không gửi email).
import { json, CORS, rest, authAdmin, member } from "../_shared/common.ts";

export const staffEmail = (id: string) => `nv${String(id).trim().toLowerCase()}@thidua351.vn`;

async function allUsers() {
  const out: any[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await authAdmin(`users?page=${page}&per_page=200`);
    const list = r.users || [];
    out.push(...list);
    if (list.length < 200) break;
  }
  return out;
}

async function ensureLogin(staff: any, password: string, users: any[]) {
  const mems = await rest("memberships?select=email,role,staff_id,active&staff_id=eq." + encodeURIComponent(staff.id));
  let mem = mems.find((m: any) => m.active) || mems[0];
  let email = mem?.email || staffEmail(staff.id);
  if (!mem) {
    await rest("memberships", { method: "POST", body: JSON.stringify({ email, role: "employee", staff_id: staff.id, stores: [staff.dept].filter(Boolean), active: true }) });
  } else if (!mem.active) {
    await rest("memberships?email=eq." + encodeURIComponent(mem.email), { method: "PATCH", body: JSON.stringify({ active: true }) });
  }
  const u = users.find((x) => String(x.email || "").toLowerCase() === email);
  if (u) await authAdmin("users/" + u.id, { method: "PUT", body: JSON.stringify({ password, user_metadata: { ...(u.user_metadata || {}), staff_id: staff.id, must_change: true } }) });
  else await authAdmin("users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { staff_id: staff.id, must_change: true } }) });
  return email;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const m = await member(req);
    if (m.role !== "owner") throw new Error("Chỉ Admin / Quản lý được xem tài khoản.");
    const body = await req.json().catch(() => ({}));
    const staffAll = await rest("staff?select=id,name,dept,hidden&order=sort,id");
    if (body.mode === "list") {
      const [mems, users] = await Promise.all([rest("memberships?select=email,role,staff_id,active"), allUsers()]);
      const byEmail = new Map(users.map((u: any) => [String(u.email || "").toLowerCase(), u]));
      return json({ status: "success", accounts: staffAll.map((s: any) => {
        const mem = mems.find((x: any) => x.staff_id === s.id && x.active) || mems.find((x: any) => x.staff_id === s.id);
        const u = mem ? byEmail.get(mem.email) : null;
        return { staff_id: s.id, name: s.name, hidden: s.hidden, email: mem?.email || null, role: mem?.role || null, active: mem?.active ?? null,
          has_login: !!u, by_code: mem?.email === `nv${s.id.toLowerCase()}@thidua351.vn`, last_sign_in: u?.last_sign_in_at || null };
      }) });
    }
    // D18: đặt mật khẩu / tạo đăng nhập — chỉ Admin
    const adm = (await rest("memberships?select=is_admin&email=eq." + encodeURIComponent(m.email)))[0]?.is_admin === true;
    if (!adm) throw new Error("Chỉ Admin được đặt mật khẩu.");
    const pw = String(body.password || "");
    if (pw.length < 6) throw new Error("Mật khẩu ít nhất 6 ký tự.");
    const users = await allUsers();
    if (body.mode === "set_password") {
      const s = staffAll.find((x: any) => x.id === String(body.staff_id));
      if (!s) throw new Error("Không tìm thấy nhân viên.");
      const email = await ensureLogin(s, pw, users);
      return json({ status: "success", message: `Đã đặt mật khẩu cho ${s.name}. Đăng nhập bằng ${email.endsWith("@thidua351.vn") ? "Mã NV " + s.id : email}.` });
    }
    if (body.mode === "set_member_password") {   // chủ quản đặt mật khẩu cho tài khoản email (quản lý) trong Phân quyền
      const email = String(body.email || "").trim().toLowerCase();
      const mem = (await rest("memberships?select=email,role,staff_id&email=eq." + encodeURIComponent(email)))[0];
      if (!mem) throw new Error("Email chưa có trong Phân quyền.");
      if (email === m.email) throw new Error("Đổi mật khẩu của chính bạn ở nút 👤 → Đổi mật khẩu.");
      const must = body.must_change !== false, u = users.find((x) => String(x.email || "").toLowerCase() === email);
      if (u) await authAdmin("users/" + u.id, { method: "PUT", body: JSON.stringify({ password: pw, email_confirm: true, user_metadata: { ...(u.user_metadata || {}), must_change: must } }) });
      else await authAdmin("users", { method: "POST", body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { must_change: must } }) });
      await rest("audit_log", { method: "POST", body: JSON.stringify({ actor: m.email, action: "SET_MEMBER_PASSWORD", target: email, details: { must_change: must } }) });
      return json({ status: "success", message: `Đã đặt mật khẩu cho ${email}. Đăng nhập bằng email + mật khẩu này${must ? " (lần đầu sẽ được yêu cầu đổi)" : ""}.` });
    }
    if (body.mode === "bulk") {
      const mems = await rest("memberships?select=staff_id&active=eq.true");
      const has = new Set(mems.map((x: any) => x.staff_id));
      const todo = staffAll.filter((s: any) => !s.hidden && !has.has(s.id));
      for (const s of todo) await ensureLogin(s, pw, users);
      return json({ status: "success", message: `Đã tạo tài khoản cho ${todo.length} nhân viên.`, created: todo.map((s: any) => s.id) });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
