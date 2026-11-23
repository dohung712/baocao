// Gọn tool (23/11/2026, theo chủ quản): các chức năng đã gộp / bỏ — lọc ở một chỗ để bật lại dễ.
//  • CV → 📋 Việc và CV → 📊 Thống kê: bỏ, giao việc dùng 📋 Giao việc (D12). Dữ liệu cũ vẫn giữ.
//  • 📈 Cập nhật lũy kế tay thứ 2 (C12): tắt, lũy kế lấy từ ảnh BI do QL duyệt (B16b). Bật lại: cài đặt CUM_MANUAL = true.
import { setting } from "./store.js";

export const CV_DROPPED = new Set(["tasks", "stats"]);
export const cumManual = () => setting("CUM_MANUAL", false) === true;
// Bỏ các mục nhắc trỏ tới chức năng đã bỏ (todo_list của máy chủ vẫn trả về)
export const keepTodo = (list) => (Array.isArray(list) ? list : []).filter((t) => !(t?.go === "cv:tasks" || t?.go === "cv:stats" || (t?.go === "cum" && !cumManual())));
