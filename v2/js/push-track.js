// D13b: theo dõi thông báo của 1 việc (hộp chi tiết QL): mỗi NV — đã bật thông báo chưa, đã mở xem việc chưa,
// từng lần nhắc: tới máy / bấm mở / gạt tắt (iPhone không báo gạt tắt).
import { esc, shortName } from "./ui.js";
import { sb, rpc, staffById } from "./store.js";
import { whenTxt } from "./jobs-common.js";

const KIND = { new: "📌 Việc mới", soon: "⏰ Trước hạn", near: "⏰ Sắp hết hạn", over: "⚠️ Quá hạn", nag: "⚠️ Nhắc lại", shift: "🕑 Vào ca", manual: "🔔 QL nhắc", other: "🔔 Thông báo" };

export async function fillPushTrack(el, j) {
  if (!el) return;
  el.innerHTML = `<p class="small muted">Đang tải thông báo…</p>`;
  try {
    const sib = j.group_key ? await sb.from("jobs").select("id,staff_id,seen_at").eq("group_key", j.group_key) : { data: [{ id: j.id, staff_id: j.staff_id, seen_at: j.seen_at }] };
    const rows = sib.data?.length ? sib.data : [{ id: j.id, staff_id: j.staff_id, seen_at: j.seen_at }];
    const ids = rows.map((r) => r.id);
    const [lg, subs] = await Promise.all([
      sb.from("push_log").select("*").overlaps("job_ids", ids).order("at"),
      rpc("push_overview").catch(() => ({})),
    ]);
    if (lg.error) throw lg.error;
    const log = lg.data || [];
    el.innerHTML = `<div class="pt-box"><b class="small">📲 Thông báo & đã xem</b>${rows.map((r) => {
      const mine = log.filter((x) => x.staff_id === r.staff_id && (x.job_ids || []).includes(r.id));
      const dev = subs?.[r.staff_id] || 0;
      const head = `<b>${esc(shortName(staffById(r.staff_id)?.name || r.staff_id))}</b> · ${dev ? `🔔 ${dev} máy` : `<span class="c-bad">🔕 chưa bật thông báo</span>`} · ${r.seen_at ? `👀 đã xem ${esc(whenTxt(r.seen_at))}` : `<span class="c-bad">👀 chưa mở xem</span>`}`;
      const lines = mine.map((x) => {
        const st = !x.devices ? "🔕 không có máy nhận"
          : !x.sent ? `<span class="c-bad">❗ gửi không tới (máy đã tắt quyền?)</span>`
          : [x.delivered_at ? `✅ tới máy ${esc(whenTxt(x.delivered_at))}` : "⚪ máy chưa báo nhận",
             x.clicked_at ? `👆 bấm mở ${esc(whenTxt(x.clicked_at))}` : x.closed_at ? `<span class="c-bad">✖️ gạt tắt ${esc(whenTxt(x.closed_at))}</span>` : ""].filter(Boolean).join(" · ");
        return `<li><span class="muted">${esc(whenTxt(x.at))}</span> ${esc(KIND[x.kind] || KIND.other)} — ${st}</li>`;
      }).join("");
      return `<div class="pt-who">${head}${lines ? `<ul class="pt-list">${lines}</ul>` : `<p class="tiny muted" style="margin:2px 0 0">Chưa gửi thông báo nào cho việc này.</p>`}</div>`;
    }).join("")}<p class="tiny muted" style="margin:6px 0 0">iPhone không báo lại khi NV gạt tắt thông báo; "đã xem" = NV mở trang Hôm nay thấy việc.</p></div>`;
  } catch (e) {
    el.innerHTML = `<p class="small muted">Chưa xem được thông báo: ${esc(e.message || e)}</p>`;
  }
}
