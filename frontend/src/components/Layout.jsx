// src/components/Layout.jsx
import { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

export default function Layout({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user } = useAuth();

  function toggleSidebar() {
    setSidebarOpen((o) => !o);
  }

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />

      <div className="app-shell__viewport">
        <header className="app-shell__topbar">
          {/* ปุ่มนี้แสดงเฉพาะตอน sidebar ปิดอยู่ (เพราะปิด = หายไปหมด
              ไม่มีปุ่มให้กดข้างในแล้ว) กดเพื่อเปิด sidebar กลับมา */}
          <button
            className={`app-shell__menu-btn ${sidebarOpen ? 'app-shell__menu-btn--hidden' : ''}`}
            onClick={toggleSidebar}
            aria-label="เปิดเมนู"
          >
            ☰
          </button>
          <h1 className="app-shell__title">{title}</h1>
          <div className="app-shell__user">
            <span className="app-shell__user-name">{user?.name}</span>
            <span className="app-shell__user-role mono">{user?.role}</span>
          </div>
        </header>

        <main className="app-shell__content">
          {children}
        </main>
      </div>
    </div>
  );
}
