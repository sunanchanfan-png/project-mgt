// src/context/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * @param {string[]} [roles] - ถ้าระบุ จะเช็ค role ของ user เพิ่มเติมด้วย (นอกจากแค่ login แล้วหรือยัง)
 *   ใช้กับหน้าที่จำกัดเฉพาะ role บางกลุ่ม เช่น "/permissions" ให้เฉพาะ system_mgr/admin
 */
export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
