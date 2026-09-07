// src/App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './context/ProtectedRoute';

// โหลดแต่ละหน้าแบบ lazy (code splitting) — เดิม import ตรงๆ ทุกหน้าจะถูกรวมเข้า JS ก้อนเดียวกันหมด (ก้อน
// เดียวหนัก ~500KB) ทำให้ client/foreman ที่เข้าแค่ 1 หน้าของตัวเอง ต้องโหลดโค้ดของทุกหน้าที่ไม่เกี่ยวกับ
// ตัวเองไปด้วย (WBS, ProjectManagement, Reports ฯลฯ) เปลี่ยนเป็น lazy() ทำให้แต่ละหน้าแยกเป็นไฟล์ JS ของ
// ตัวเอง โหลดเฉพาะตอนเข้า route นั้นจริงๆ เท่านั้น — เว็บเบราว์เซอร์ cache ไฟล์ที่โหลดแล้วให้เองในครั้งถัดไป
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Login/Register'));
const OpenProject = lazy(() => import('./pages/OpenProject'));
const ProjectData = lazy(() => import('./pages/ProjectData'));
const ProjectManagement = lazy(() => import('./pages/ProjectManagement/ProjectManagement'));
const PermissionApproval = lazy(() => import('./pages/PermissionApproval/PermissionApproval'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const ForemanApp = lazy(() => import('./pages/Foreman/ForemanApp'));
const ClientApp = lazy(() => import('./pages/Client/ClientApp'));

// หน้าจอระหว่างรอโหลดไฟล์ JS ของแต่ละ route (เห็นแวบเดียวตอนเน็ตช้า/เปิดหน้าใหม่ครั้งแรก) — ใช้ inline
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
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/foreman"
              element={
                <ProtectedRoute roles={['foreman']} isForemanRoute>
                  <ForemanApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/client"
              element={
                <ProtectedRoute roles={['client']} isClientRoute>
                  <ClientApp />
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
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
