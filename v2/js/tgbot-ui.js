// D27 🤖 Bot Telegram nhắc việc (Admin): bật bot, lấy mã nối, xem trạng thái, tắt
import { esc, toast, confirmBox } from "./ui.js";
import { callFn, errMsg } from "./store.js";

export async function tgBotBox(box) {
  box.innerHTML = `<div class="card" style="margin-bottom:14px"><p class="small muted">Đang kiểm tra bot nhắc việc…</p></div>`;
  let st;
  try { st = await callFn("tgbot", { mode: "status" }); } catch (e) { box.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>💬 Bot nhắc việc qua Telegram</h2></div><p class="small" style="color:var(--bad)">${esc(errMsg(e))}</p></div>`; return; }
  box.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h2>💬 Bot nhắc việc qua Telegram</h2>
      <span class="pill ${st.on && st.linked ? "ok" : "warn"}">${st.on && st.linked ? "Đang chạy" : st.on ? "Chờ nối" : "Chưa bật"}</span></div>
    <p class="small">Anh nhắn bot <b>@${esc(st.bot || "…")}</b> bằng lời (thêm / sửa / tắt việc lặp lại, giao việc 1 lần, thông báo cho mọi người, chữ chạy) → bot hiện bản xem trước → bấm <b>✅ Lưu</b> là ghi vào trang tính và app cập nhật ngay. Chỉ tài khoản Telegram đã nối mới ra lệnh được.</p>
    ${st.error ? `<p class="tiny" style="color:var(--warn)">Telegram báo lỗi gần nhất: ${esc(st.error)}</p>` : ""}
    <div class="row"><button class="btn primary" type="button" id="tbSetup">${st.on ? "🔑 Lấy mã nối mới" : "▶️ Bật bot & lấy mã nối"}</button>${st.on ? `<button class="btn ghost danger" type="button" id="tbOff">⏹️ Tắt bot</button>` : ""}
      <span class="small muted">${st.linked ? `Đã nối ${st.linked} tài khoản Telegram` : ""}</span></div>
    <div id="tbCode" style="margin-top:10px"></div></div>`;
  box.querySelector("#tbSetup").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await callFn("tgbot", { mode: "setup" });
      box.querySelector("#tbCode").innerHTML = `<div class="banner ok"><div>Mở Telegram → bot <a href="https://t.me/${esc(r.bot)}" target="_blank" rel="noopener"><b>@${esc(r.bot)}</b></a> → nhắn: <b style="font-size:18px">/noi ${esc(r.code)}</b><br><span class="small">Mã dùng 1 lần trong 10 phút. Nối xong bot trả lời "Đã nối" kèm ví dụ cách nhắn.</span></div></div>`;
    } catch (x) { toast(errMsg(x), 6000); } finally { e.target.disabled = false; }
  };
  const off = box.querySelector("#tbOff");
  if (off) off.onclick = async () => {
    if (!(await confirmBox("Tắt bot nhắc việc?", "Bot ngừng nhận tin, cần bật + nối lại khi dùng.", "Tắt bot", true))) return;
    try { const r = await callFn("tgbot", { mode: "off" }); toast(r.message); tgBotBox(box); } catch (x) { toast(errMsg(x), 6000); }
  };
}
