// src/App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './context/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Login/Register';
import OpenProject from './pages/OpenProject';
import ProjectData from './pages/ProjectData';
import ProjectManagement from './pages/ProjectManagement/ProjectManagement';
import PermissionApproval from './pages/PermissionApproval/PermissionApproval';
import Reports from './pages/Reports/Reports';

// lazy() เฉพาะ ForemanApp/ClientApp เท่านั้น — คนละสถานการณ์กับหน้า staff ด้านบน: foreman/client เป็นแอป
// มือถือที่ "เข้าแค่หน้าเดียวจบ" ไม่เคยสลับไปเมนูอื่นในเซสชันเดียวกันเลย จึงได้ประโยชน์เต็มๆ จากการแยกไฟล์
// (ไม่โหลดโค้ดของหน้า staff ที่ตัวเองไม่มีสิทธิ์เข้าไปด้วย) โดยไม่มีข้อเสีย — ต่างจากหน้า staff ที่แต่ก่อน
// เคยลอง lazy() ทั้งหมดแล้วเจอปัญหา: สลับเมนูไปมาบ่อยๆ ในเซสชันเดียว ทำให้เห็นตารางไม่มี style (เส้น grid
// เริ่มต้นของ browser) กระพริบแวบเดียวทุกครั้งที่สลับเมนู เพราะ JS chunk เริ่มวาดตารางก่อน CSS chunk ของ
// หน้านั้นโหลดเสร็จ — จึงย้ายกลับมา import ตรงๆ (bundle รวมเป็นไฟล์เดียวเหมือนเดิม) ให้เฉพาะฝั่ง staff
const ForemanApp = lazy(() => import('./pages/Foreman/ForemanApp'));
const ClientApp = lazy(() => import('./pages/Client/ClientApp'));

// หน้าจอระหว่างรอโหลดไฟล์ JS ของ ForemanApp/ClientApp (เห็นแวบเดียวตอนเน็ตช้า/เปิดแอปครั้งแรก) — ใช้ inline
// style ล้วนๆ ไม่พึ่ง CSS ไฟล์ไหน เพราะต้องขึ้นได้แม้ CSS ของหน้านั้นยังโหลดไม่เสร็จด้วยซ้ำ
function RouteLoadingFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '14px', color: '#666', fontFamily: 'sans-serif',
    }}
    >
      กำลังโหลด...
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/foreman"
            element={
              <ProtectedRoute roles={['foreman']} isForemanRoute>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <ForemanApp />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/client"
            element={
              <ProtectedRoute roles={['client']} isClientRoute>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <ClientApp />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions"
            element={
              <ProtectedRoute roles={['system_mgr', 'admin']}>
                <PermissionApproval />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <OpenProject />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project-data"
            element={
              <ProtectedRoute>
                <ProjectData />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project-management"
            element={
              <ProtectedRoute>
                <ProjectManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
