// src/App.jsx
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
import ForemanApp from './pages/Foreman/ForemanApp';

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
                <ForemanApp />
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
