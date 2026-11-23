// Gọn tool (23/11/2026, theo chủ quản): các chức năng đã gộp / bỏ — lọc ở một chỗ để bật lại dễ.
//  • CV → 📋 Việc và CV → 📊 Thống kê: bỏ, giao việc dùng 📋 Giao việc (D12). Dữ liệu cũ vẫn giữ.
//  • 📈 Cập nhật lũy kế tay thứ 2 (C12): tắt, lũy kế lấy từ ảnh BI (B16). Bật lại: cài đặt CUM_MANUAL = true.
//  • D13 (23/11): TikTok + báo cáo vệ sinh theo lịch đăng ký chuyển sang Bảng việc (việc lặp lại từ trang tính) →
//    bỏ tab CV → TikTok và các nhắc cũ (tt_*, cl_*). Đăng ký lịch vệ sinh + khu vực vệ sinh vẫn ở CV → Vệ sinh.
import { setting } from "./store.js";

export const CV_DROPPED = new Set(["tasks", "stats", "tiktok"]);
export const cumManual = () => setting("CUM_MANUAL", false) === true;
const DROP_K = /^(tt_|cl_)/;
// Bỏ các mục nhắc trỏ tới chức năng đã bỏ (todo_list của máy chủ vẫn trả về)
export const keepTodo = (list) => (Array.isArray(list) ? list : []).filter((t) => !(t?.go === "cv:tasks" || t?.go === "cv:stats" || t?.go === "cv:tiktok" || DROP_K.test(String(t?.k || "")) || (t?.go === "cum" && !cumManual())));
