// src/components/Layout.jsx
import { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import useIsMobile from '../hooks/useIsMobile';
import './Layout.css';

export default function Layout({ title, children }) {
  const isMobile = useIsMobile();
  // เปิดผ่านมือถือ (จอแคบ) ให้ sidebar ปิดไว้เป็นค่าเริ่มต้นเสมอ กันไม่ให้บังเนื้อหาทั้งจอตอนเพิ่งเข้ามา —
  // เปิดผ่าน PC (จอกว้าง) ยังคงเปิดไว้เป็นค่าเริ่มต้นเหมือนเดิมทุกอย่าง ไม่กระทบพฤติกรรมเดิมของ PC เลย
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const { user } = useAuth();

  function toggleSidebar() {
    setSidebarOpen((o) => !o);
  }

  // กดเลือกเมนูใน sidebar แล้ว — ปิด sidebar ให้อัตโนมัติเฉพาะตอนเปิดผ่านมือถือ (PC ยังคงเปิดค้างไว้ตามปกติ
  // ไม่ต้องปิดเอง เพราะจอกว้างพอที่จะเห็นทั้ง sidebar และเนื้อหาพร้อมกันได้อยู่แล้ว)
  function handleNavigate() {
    if (isMobile) setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} onNavigate={handleNavigate} />

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
