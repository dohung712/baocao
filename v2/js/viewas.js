// 👁️ Xem như (chỉ chủ quản): xem thử đúng giao diện của NHÂN VIÊN (1 mã NV) hoặc QUẢN LÝ (các bộ phận được giao)
// mà không cần tài khoản khác. Chỉ đổi phía trình duyệt: vai trò, menu, trang, danh sách nhân sự (lọc như RLS: NV chỉ thấy mình,
// QL chỉ thấy bộ phận). Máy chủ vẫn nhận quyền chủ quản → thao tác (nộp ảnh, báo cáo…) vẫn ghi thật cho NV đang xem.
// File riêng (không thêm export vào store.js) để trình duyệt còn giữ store.js cũ trong bộ nhớ đệm không bị lỗi import.
const KEY = "thidua-v2-viewas";

export function getViewAs() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && (v.role === "employee" ? !!v.staff_id : v.role === "manager") ? v : null;
  } catch { return null; }
}
export function setViewAs(v) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
}
// Dòng memberships dùng cho giao diện (S.me) từ dòng thật (S.realMe)
export function applyMe(real) {
  const va = real?.role === "owner" ? getViewAs() : null;
  if (!va) return real;
  return { ...real, role: va.role, staff_id: va.role === "employee" ? va.staff_id : real.staff_id, stores: va.role === "manager" ? (va.stores || []) : [], viewAs: va };
}
// Danh sách nhân sự như tài khoản thật nhìn thấy (RLS can_see_staff)
export function filterStaff(rows, me) {
  const va = me?.viewAs;
  if (!va) return rows;
  if (va.role === "employee") return rows.filter((s) => s.id === me.staff_id);
  return rows.filter((s) => (me.stores || []).includes(s.dept));
}
