// src/pages/Foreman/ForemanApp.jsx
// หน้าเฉพาะสำหรับ foreman — ไม่มี Sidebar/เมนูอื่นเลย เห็นแค่ตัวเลือกโครงการ + Tab งานสัปดาห์นี้/หน้า/
// S-Curve/ความปลอดภัย แล้วเข้าหน้าจอที่เกี่ยวข้องทันที ตามที่ตกลงกันไว้ (ระดับ 2: แยก route แต่ใช้โค้ด/
// ฐานข้อมูล/API เดียวกันกับหน้าคอมพิวเตอร์ทั้งหมด — ไม่ต้องทำแอปแยกจริง)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import MobileForemanTab from '../Mobile/MobileForemanTab';
import ForemanSCurveTab from './ForemanSCurveTab';
import ForemanSafetyTab from './ForemanSafetyTab';
import './ForemanApp.css';

const TABS = [
  { key: 'this', label: 'งานสัปดาห์นี้' },
  { key: 'next', label: 'งานสัปดาห์หน้า' },
  { key: 'safety', label: 'ความปลอดภัย' },
  { key: 'scurve', label: 'S-Curve' },
];

export default function ForemanApp() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('this');
  // reportId ของ "สัปดาห์ปัจจุบัน" ของโครงการที่เลือกอยู่ — ต้องมีก่อนถึงจะเปิด Tab ความปลอดภัยได้ (Tab
  // งานสัปดาห์นี้/หน้า และ S-Curve ไม่ต้องใช้ reportId เพราะดึงข้อมูลจาก progress_entries ตรงๆ ผ่าน
  // project_id อย่างเดียว แต่ Tab ความปลอดภัยผูกกับ report_items ที่ต้องรู้ reportId ก่อน)
  const [reportId, setReportId] = useState('');
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    // foreman เห็นเฉพาะโครงการที่ "เปิดอยู่" เหมือนเมนูอื่นๆ ในระบบ
    client.get('/projects', { params: { status: 'on' } })
      .then((res) => {
        setProjects(res.data.projects);
        if (res.data.projects.length > 0) setProjectId(res.data.projects[0].id);
      })
      .catch((err) => setReportError(err.response?.data?.error || 'ดึงรายชื่อโครงการไม่สำเร็จ'));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setReportError('');
    client.get('/reports/current', { params: { project_id: projectId } })
      .then((res) => setReportId(res.data.report.id))
      .catch((err) => setReportError(err.response?.data?.error || 'เตรียมรายงานสัปดาห์ปัจจุบันไม่สำเร็จ'));
  }, [projectId]);

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

        {/* Tab สลับ 4 อย่าง: งานสัปดาห์นี้/หน้า (กรอกงาน), ความปลอดภัย (เพิ่มหัวข้อ+แนบรูป), S-Curve (ดูผลงาน
            รวมทั้งโครงการ อ่านอย่างเดียว) — ใช้ array TABS แทนปุ่มแยกทีละอัน ให้ขยายเพิ่ม Tab ทีหลังได้ง่าย */}
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

      {projectId && (activeTab === 'this' || activeTab === 'next') && (
        <MobileForemanTab key={`${projectId}-${activeTab}`} projectId={projectId} week={activeTab} />
      )}
      {projectId && activeTab === 'scurve' && (
        <ForemanSCurveTab key={projectId} projectId={projectId} />
      )}
      {projectId && activeTab === 'safety' && (
        reportError ? (
          <p className="fsafety__status fsafety__status--warn" style={{ padding: '24px 12px' }}>{reportError}</p>
        ) : reportId ? (
          <ForemanSafetyTab key={reportId} reportId={reportId} />
        ) : (
          <p className="fsafety__status" style={{ padding: '24px 12px' }}>กำลังเตรียมรายงานสัปดาห์ปัจจุบัน...</p>
        )
      )}
    </div>
  );
}
