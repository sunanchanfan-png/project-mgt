// src/context/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * @param {string[]} [roles] - ถ้าระบุ จะเช็ค role ของ user เพิ่มเติมด้วย (นอกจากแค่ login แล้วหรือยัง)
 *   ใช้กับหน้าที่จำกัดเฉพาะ role บางกลุ่ม เช่น "/permissions" ให้เฉพาะ system_mgr/admin
 * @param {boolean} [isForemanRoute] - true เฉพาะ route "/foreman" เท่านั้น — ใช้กันไม่ให้ role foreman
 *   เข้าเมนูอื่นในระบบได้เลยแม้จะพิมพ์ URL ตรงๆ เอง (เช่น /dashboard, /project-management) โดยไม่ต้องไป
 *   เพิ่ม roles={...} ที่ทุก route ทีละอัน — เช็คจุดเดียวตรงนี้ครอบคลุมทุก route ที่เหลือทั้งหมดอัตโนมัติ
 */
export default function ProtectedRoute({ children, roles, isForemanRoute = false }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'foreman' && !isForemanRoute) {
    return <Navigate to="/foreman" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
