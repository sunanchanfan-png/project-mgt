// src/pages/Foreman/ForemanApp.jsx
// หน้าเฉพาะสำหรับ foreman — ไม่มี Sidebar/เมนูอื่นเลย เห็นแค่ตัวเลือกโครงการ + Tab งานสัปดาห์นี้/หน้า/
// S-Curve แล้วเข้าหน้าจอที่เกี่ยวข้องทันที ตามที่ตกลงกันไว้ (ระดับ 2: แยก route แต่ใช้โค้ด/ฐานข้อมูล/API
// เดียวกันกับหน้าคอมพิวเตอร์ทั้งหมด — ไม่ต้องทำแอปแยกจริง)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import MobileForemanTab from '../Mobile/MobileForemanTab';
import ForemanSCurveTab from './ForemanSCurveTab';
import './ForemanApp.css';

const TABS = [
  { key: 'this', label: 'งานสัปดาห์นี้' },
  { key: 'next', label: 'งานสัปดาห์หน้า' },
  { key: 'scurve', label: 'S-Curve' },
];

export default function ForemanApp() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('this');

  useEffect(() => {
    // foreman เห็นเฉพาะโครงการที่ "เปิดอยู่" เหมือนเมนูอื่นๆ ในระบบ
    client.get('/projects', { params: { status: 'on' } }).then((res) => {
      setProjects(res.data.projects);
      if (res.data.projects.length > 0) setProjectId(res.data.projects[0].id);
    });
  }, []);

  return (
    <div className="foreman-app">
      <header className="foreman-app__header">
        <span className="foreman-app__title">SIKARIN - งานภาคสนาม</span>
        <button type="button" className="foreman-app__logout" onClick={logout}>ออกจากระบบ</button>
      </header>

      <div className="foreman-app__user">{user?.name || user?.username}</div>

      <div className="foreman-app__selectors">
        <select
          className="foreman-app__select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.project_code} - {p.name}</option>
          ))}
        </select>

        {/* Tab สลับ 3 อย่าง: งานสัปดาห์นี้/หน้า (กรอกงาน) และ S-Curve (ดูผลงานรวมทั้งโครงการ อ่านอย่าง
            เดียว ไม่มีการกรอกอะไร) — เพิ่มเป็น array TABS แทนปุ่ม 2 ปุ่มแบบเดิม ให้ขยายเพิ่ม Tab ทีหลังได้
            ง่ายโดยไม่ต้องแก้โครงสร้าง JSX ใหม่ */}
        <div className="foreman-app__week-toggle">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`foreman-app__week-btn ${activeTab === t.key ? 'foreman-app__week-btn--active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {projectId && activeTab !== 'scurve' && (
        <MobileForemanTab key={`${projectId}-${activeTab}`} projectId={projectId} week={activeTab} />
      )}
      {projectId && activeTab === 'scurve' && (
        <ForemanSCurveTab key={projectId} projectId={projectId} />
      )}
    </div>
  );
}
