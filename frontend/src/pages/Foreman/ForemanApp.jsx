// src/pages/Foreman/ForemanApp.jsx
// หน้าเฉพาะสำหรับ foreman — ไม่มี Sidebar/เมนูอื่นเลย เห็นแค่ตัวเลือกโครงการ + สัปดาห์นี้/หน้า แล้วเข้า
// หน้าจอกรอกงานแบบมือถือ (MobileForemanTab) ทันที ตามที่ตกลงกันไว้ (ระดับ 2: แยก route แต่ใช้โค้ด/
// ฐานข้อมูล/API เดียวกันกับหน้าคอมพิวเตอร์ทั้งหมด — ไม่ต้องทำแอปแยกจริง)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import MobileForemanTab from '../Mobile/MobileForemanTab';
import './ForemanApp.css';

export default function ForemanApp() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [week, setWeek] = useState('this');

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

        <div className="foreman-app__week-toggle">
          <button
            type="button"
            className={`foreman-app__week-btn ${week === 'this' ? 'foreman-app__week-btn--active' : ''}`}
            onClick={() => setWeek('this')}
          >
            งานสัปดาห์นี้
          </button>
          <button
            type="button"
            className={`foreman-app__week-btn ${week === 'next' ? 'foreman-app__week-btn--active' : ''}`}
            onClick={() => setWeek('next')}
          >
            งานสัปดาห์หน้า
          </button>
        </div>
      </div>

      {projectId && <MobileForemanTab key={`${projectId}-${week}`} projectId={projectId} week={week} />}
    </div>
  );
}
