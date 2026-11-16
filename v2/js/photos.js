// Ảnh báo cáo: nén trên máy trước khi tải lên, lấy link xem cho ảnh mới (Supabase), ảnh bản PRO (cf_…) và ảnh Google Drive bản cũ
import { sb } from "./store.js";

// Giải mã ảnh: ưu tiên createImageBitmap (đúng chiều ảnh, ít tốn RAM), dự phòng thẻ <img>
async function decode(file) {
  if (window.createImageBitmap) { try { return { src: await createImageBitmap(file, { imageOrientation: "from-image" }), done() {} }; } catch { /* thử cách khác */ } }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Không đọc được ảnh")); i.src = url; });
    return { src: img, done() { URL.revokeObjectURL(url); } };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}
export async function compress(file, max = 1600, quality = 0.82) {
  if (file && file.ready) return file;            // đã nén sẵn lúc chọn ảnh
  const { src, done } = await decode(file);
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  src.close?.(); done();
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("Không nén được ảnh");
  blob.ready = true; return blob;
}

// Tải nhiều ảnh lên, trả về mã ảnh dạng "v2:<đường dẫn>"
export async function uploadAll(folder, files) {
  const out = [];
  for (const [i, f] of files.entries()) {
    const blob = await compress(f);
    const path = `${folder}/${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from("thidua-v2").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error("Không tải được ảnh " + (i + 1) + ": " + error.message);
    out.push("v2:" + path);
  }
  return out;
}
export async function removeAll(tokens) {
  const paths = (tokens || []).filter((t) => t.startsWith("v2:")).map((t) => t.slice(3));
  if (paths.length) await sb.storage.from("thidua-v2").remove(paths).catch(() => {});
}

const cache = new Map();
export async function photoUrl(token) {
  if (cache.has(token)) return cache.get(token);
  let url = null, full = null;
  if (token.startsWith("v2:")) {
    const { data } = await sb.storage.from("thidua-v2").createSignedUrl(token.slice(3), 3600); url = full = data?.signedUrl || null;
  } else if (/^cf_[a-f0-9-]{36}$/.test(token)) {
    const { data } = await sb.storage.from("thi-dua-media").createSignedUrl(token, 3600); url = full = data?.signedUrl || null;
  } else if (/^[\w-]{20,}$/.test(token)) {
    url = `https://drive.google.com/thumbnail?id=${encodeURIComponent(token)}&sz=w600`; full = `https://drive.google.com/file/d/${encodeURIComponent(token)}/view`;
  }
  const v = { url, full }; cache.set(token, v); return v;
}
// Vẽ dãy ảnh vào phần tử (không chặn giao diện)
export function fillPhotos(el, tokens) {
  el.innerHTML = tokens.map((_, i) => `<a class="ph" data-i="${i}" target="_blank" rel="noopener"><span>⏳</span></a>`).join("");
  tokens.forEach(async (t, i) => {
    const a = el.querySelector(`[data-i="${i}"]`); if (!a) return;
    const { url, full } = await photoUrl(t);
    if (!url) { a.innerHTML = "<span>Không mở được</span>"; return; }
    a.href = full; a.innerHTML = `<img src="${url}" alt="Ảnh ${i + 1}" loading="lazy">`;
  });
}
