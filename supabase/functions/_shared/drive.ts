// Gọi Apps Script trên Google Drive (địa chỉ + mã bí mật nằm ở private_settings, không lộ ra trình duyệt)
import { rest } from "./common.ts";

const secret = async (k: string) => (await rest("private_settings?select=value&key=eq." + k))[0]?.value as string | undefined;
export async function driveReady() { return !!(await secret("DRIVE_UPLOAD_URL")) && !!(await secret("DRIVE_UPLOAD_SECRET")); }
export async function drive(payload: Record<string, unknown>) {
  const [url, sec] = await Promise.all([secret("DRIVE_UPLOAD_URL"), secret("DRIVE_UPLOAD_SECRET")]);
  if (!url || !sec) throw new Error("Chưa nối Google Drive (thiếu địa chỉ Apps Script).");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, secret: sec }), redirect: "follow" });
  const t = await r.text(); let j: any; try { j = JSON.parse(t); } catch { throw new Error("Drive trả lời không hợp lệ (HTTP " + r.status + ")"); }
  if (!j.ok) throw new Error("Drive lỗi: " + (j.error || "không rõ"));
  return j;
}
