// src/context/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * @param {string[]} [roles] - ถ้าระบุ จะเช็ค role ของ user เพิ่มเติมด้วย (นอกจากแค่ login แล้วหรือยัง)
 *   ใช้กับหน้าที่จำกัดเฉพาะ role บางกลุ่ม เช่น "/permissions" ให้เฉพาะ system_mgr/admin
 * @param {boolean} [isForemanRoute] - true เฉพาะ route "/foreman" เท่านั้น — ใช้กันไม่ให้ role foreman
 *   เข้าเมนูอื่นในระบบได้เลยแม้จะพิมพ์ URL ตรงๆ เอง (เช่น /dashboard, /project-management) โดยไม่ต้องไป
 *   เพิ่ม roles={...} ที่ทุก route ทีละอัน — เช็คจุดเดียวตรงนี้ครอบคลุมทุก route ที่เหลือทั้งหมดอัตโนมัติ
 * @param {boolean} [isClientRoute] - เหมือน isForemanRoute แต่สำหรับ role='client' (ลูกค้าดูความคืบหน้า
 *   งาน) — กันไม่ให้ client เข้าเมนูภายในอื่นๆ ของระบบได้เลยแม้จะพิมพ์ URL ตรงๆ เอง
 */
export default function ProtectedRoute({ children, roles, isForemanRoute = false, isClientRoute = false }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'foreman' && !isForemanRoute) {
    return <Navigate to="/foreman" replace />;
  }
  if (user.role === 'client' && !isClientRoute) {
    return <Navigate to="/client" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
