// D18 phân cấp quyền: Admin (1 tài khoản, memberships.is_admin) · Quản lý (role owner / manager) · Nhân viên
// Admin độc quyền: cấp quyền Quản lý, ẩn chức năng, đặt mật khẩu. Quản lý: còn lại như Admin.
import { S } from "./store.js";

export const isAdmin = () => S.me?.role === "owner" && S.me?.is_admin === true && !S.me?.viewAs;
export const roleName = (m) => (!m ? "" : m.is_admin && m.role === "owner" ? "Admin" : m.role === "owner" || m.role === "manager" ? "Quản lý" : m.role === "employee" ? "Nhân viên" : m.role);
