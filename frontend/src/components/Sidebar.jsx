// src/components/Sidebar.jsx
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

// ลำดับเมนูใน Sidebar — จัดให้ตรงกับ menuRegistry (Backend)
// เปิดโครงการ → สร้างข้อมูลโครงการ → การจัดการโครงการ → จัดทำรายงาน → (อนาคต: การจัดการต้นทุน, การวิเคราะห์)
const MENU_ITEMS = [
  { label: 'เปิดโครงการ', path: '/dashboard', menuKey: 'open_project' },
  { label: 'สร้างข้อมูลโครงการ', path: '/project-data', menuKey: 'project_data' },
  { label: 'การจัดการโครงการ', path: '/project-management', menuKey: 'project_management' },
  { label: 'จัดทำรายงาน', path: '/reports', menuKey: 'reports' }, // ← ย้ายมาอยู่ตรงนี้ (ต่อจาก Menu 3)
  { label: 'การจัดการต้นทุน', path: null, menuKey: null },
  { label: 'การวิเคราะห์', path: null, menuKey: null },
];

export default function Sidebar({ open, onToggle }) {
  const { logout, user, canAccessMenu } = useAuth();
  const isSystemMgr = user?.role === 'admin' || user?.role === 'system_mgr';

  // เมนูที่ path เป็น null (ยังไม่เปิดใช้งานจริง เช่น "การจัดการต้นทุน") โชว์ไว้เฉยๆ แบบ disabled เหมือนเดิม
  // เสมอ ไม่เกี่ยวกับสิทธิ์ ส่วนเมนูที่มี path จริงแล้ว ต้องเช็คสิทธิ์ก่อนถึงจะโชว์เป็นลิงก์ที่กดได้
  const visibleItems = MENU_ITEMS.filter((item) => !item.menuKey || canAccessMenu(item.menuKey));

  return (
    <aside className={`sidebar ${open ? 'sidebar--open' : 'sidebar--closed'}`}>
      <div className="sidebar__header">
        <span className="sidebar__title">SIKARIN - PROJECT MGT</span>
        <button className="sidebar__toggle" onClick={onToggle} aria-label="ปิด sidebar">
          ✕
        </button>
      </div>

      <nav className="sidebar__nav">
        {visibleItems.map((item) => (
          <a
            key={item.label}
            href={item.path || '#'}
            className={`sidebar__item ${!item.path ? 'sidebar__item--disabled' : ''}`}
            onClick={(e) => { if (!item.path) e.preventDefault(); }}
          >
            <span className="sidebar__item-dot" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        ))}

        {isSystemMgr && (
          <a href="/permissions" className="sidebar__item sidebar__item--admin">
            <span className="sidebar__item-dot" aria-hidden="true" />
            <span>อนุมัติและกำหนดสิทธิ์</span>
          </a>
        )}
      </nav>

      <button className="sidebar__logout" onClick={logout}>
        <span aria-hidden="true">⎋</span>
        <span>ออกจากระบบ</span>
      </button>
    </aside>
  );
}