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
  // เพิ่มค่านี้ทุกครั้งที่บันทึกงานสำเร็จที่ Tab ไหนก็ตาม (ผ่าน onDataChanged) — ใช้ผูกกับ key ของ Tab
  // "อื่น" ที่ preload ค้างไว้อยู่แล้ว (ไม่ใช่ Tab ที่เพิ่งบันทึก เพราะ Tab นั้นรีเฟรชตัวเองอยู่แล้ว) เพื่อ
  // บังคับให้ remount ดึงข้อมูลใหม่ตาม ไม่งั้นจะค้างข้อมูลเก่าที่ preload ไว้ก่อนหน้า
  const [dataVersion, setDataVersion] = useState(0);
  const bumpDataVersion = () => setDataVersion((v) => v + 1);

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

      {/*
        Mount ทุก Tab พร้อมกันตั้งแต่เลือกโครงการ (preload) แล้วสลับ Tab ด้วยการซ่อน/โชว์ผ่าน CSS เท่านั้น
        (เหมือนที่ทำกับ ClientApp) — ต่างจาก client ตรงที่ foreman แก้ไขข้อมูลได้ พอบันทึกสำเร็จที่ Tab ไหน
        ก็ตาม ("สัปดาห์นี้"/"สัปดาห์หน้า") จะเรียก onDataChanged เพิ่ม dataVersion ซึ่งผูกอยู่กับ key ของ
        ทั้ง 2 Tab งานสัปดาห์ + S-Curve เสมอ (สมมาตรกัน เพราะบันทึกจาก Tab ไหนก็ได้ ไม่รู้ล่วงหน้าว่าจะเป็น
        Tab ไหน) บังคับให้ remount ดึงข้อมูลใหม่ทั้งหมดหลังบันทึกทุกครั้ง กันไม่ให้ Tab ที่ไม่ได้แก้ค้าง
        ข้อมูลเก่าที่ preload ไว้ก่อนหน้า (เช่น บันทึกงานที่ "สัปดาห์นี้" แล้ว S-Curve/สัปดาห์หน้าต้องขยับตาม)
        Tab ความปลอดภัย ไม่ต้องผูก dataVersion เพราะข้อมูลคนละชุด (report_items) ไม่ถูกกระทบจากการบันทึก
        ความคืบหน้างานเลย
      */}
      {projectId && (
        <div style={{ display: activeTab === 'this' ? 'block' : 'none' }}>
          <MobileForemanTab key={`${projectId}-this-${dataVersion}`} projectId={projectId} week="this" onDataChanged={bumpDataVersion} />
        </div>
      )}
      {projectId && (
        <div style={{ display: activeTab === 'next' ? 'block' : 'none' }}>
          <MobileForemanTab key={`${projectId}-next-${dataVersion}`} projectId={projectId} week="next" onDataChanged={bumpDataVersion} />
        </div>
      )}
      {projectId && (
        <div style={{ display: activeTab === 'scurve' ? 'block' : 'none' }}>
          <ForemanSCurveTab key={`${projectId}-${dataVersion}`} projectId={projectId} />
        </div>
      )}
      {projectId && (
        <div style={{ display: activeTab === 'safety' ? 'block' : 'none' }}>
          {reportError ? (
            <p className="fsafety__status fsafety__status--warn" style={{ padding: '24px 12px' }}>{reportError}</p>
          ) : reportId ? (
            <ForemanSafetyTab key={reportId} reportId={reportId} />
          ) : (
            <p className="fsafety__status" style={{ padding: '24px 12px' }}>กำลังเตรียมรายงานสัปดาห์ปัจจุบัน...</p>
          )}
        </div>
      )}
    </div>
  );
}
