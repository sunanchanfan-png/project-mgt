// src/pages/Foreman/ForemanApp.jsx
// หน้าเฉพาะสำหรับ foreman — ไม่มี Sidebar/เมนูอื่นเลย เห็นแค่ตัวเลือกโครงการ + dropdown เลือกรายงานย้อนหลัง
// + Tab งานสัปดาห์นี้/หน้า/ความปลอดภัย/เล่มรายงาน แล้วเข้าหน้าจอที่เกี่ยวข้องทันที ตามที่ตกลงกันไว้ (ระดับ 2:
// แยก route แต่ใช้โค้ด/ฐานข้อมูล/API เดียวกันกับหน้าคอมพิวเตอร์ทั้งหมด — ไม่ต้องทำแอปแยกจริง)
//
// เลย์เอาต์เหมือน ClientApp.jsx ทุกประการตามที่ตกลงกันไว้ (แถว 1 เลือกโครงการ, แถว 2 เลือกรายงานครั้งที่,
// แถว 3 สลับ Tab) ต่างกันแค่ Tab "เล่มรายงาน" ของ foreman ใช้ component เดียวกับ client เป๊ะ (ClientReportTab
// — อ่านอย่างเดียว ดูรายงานย้อนหลังได้) ส่วน Tab งานสัปดาห์นี้/หน้า/ความปลอดภัย ยังกรอกข้อมูล+แนบรูปได้ตามเดิม
// ไม่เปลี่ยนแปลง — และตัด Tab "S-Curve" แยกออกจากแถว Tab ไปแล้ว (ย้ายไปโชว์อยู่ในเล่มรายงานแทน เหมือนที่
// CompiledReportTab.jsx/ClientReportTab.jsx ฝัง S-Curve ไว้ในส่วน "1. แผนงานและความคืบหน้างาน" อยู่แล้ว)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import MobileForemanTab from '../Mobile/MobileForemanTab';
import ForemanSafetyTab from './ForemanSafetyTab';
import ClientReportTab from '../Client/ClientReportTab';
import './ForemanApp.css';

const TABS = [
  { key: 'this', label: 'งานสัปดาห์นี้' },
  { key: 'next', label: 'งานสัปดาห์หน้า' },
  { key: 'safety', label: 'ความปลอดภัย' },
  { key: 'report', label: 'เล่มรายงาน' },
];

export default function ForemanApp() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('this');

  // รายงาน "สัปดาห์ปัจจุบัน" ของโครงการที่เลือกอยู่ — ต้องมีก่อนถึงจะเปิด Tab ความปลอดภัยได้ (Tab งานสัปดาห์
  // นี้/หน้า ไม่ต้องใช้ค่านี้เพราะดึงข้อมูลจาก progress_entries ตรงๆ ผ่าน project_id อย่างเดียว แต่ Tab ความ
  // ปลอดภัยผูกกับ report_items ที่ต้องรู้ id ของรายงานสัปดาห์ปัจจุบันก่อน) — คนละตัวกับ "รายงานที่เลือกดู
  // ย้อนหลัง" ด้านล่าง (currentReportId เป็นรายงานที่กำลังทำอยู่เสมอ ไม่ใช่ตัวที่เลือกจาก dropdown)
  const [currentReportId, setCurrentReportId] = useState('');
  const [currentReportError, setCurrentReportError] = useState('');

  // รายชื่อรายงานย้อนหลัง (เฉพาะที่ staff กดอนุมัติแล้ว) — สำหรับ dropdown "รายงานครั้งที่ x" (แถว 2) และ
  // Tab "เล่มรายงาน" เหมือนกับ ClientApp.jsx เป๊ะ (ใช้ endpoint /client/reports ตัวเดียวกัน — ตอนนี้อนุญาต
  // ให้ role foreman เรียกได้แล้วด้วย ดู routes/client.js)
  const [historyReports, setHistoryReports] = useState([]);
  const [historyReportId, setHistoryReportId] = useState('');
  const [historyError, setHistoryError] = useState('');

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
      .catch((err) => setCurrentReportError(err.response?.data?.error || 'ดึงรายชื่อโครงการไม่สำเร็จ'));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setCurrentReportError('');
    client.get('/reports/current', { params: { project_id: projectId } })
      .then((res) => setCurrentReportId(res.data.report.id))
      .catch((err) => setCurrentReportError(err.response?.data?.error || 'เตรียมรายงานสัปดาห์ปัจจุบันไม่สำเร็จ'));
  }, [projectId]);

  // โหลดรายชื่อรายงานย้อนหลัง (เรียงล่าสุดก่อน) — เลือกฉบับล่าสุดเป็นค่าเริ่มต้นเสมอ เหมือน ClientApp.jsx
  useEffect(() => {
    if (!projectId) { setHistoryReports([]); setHistoryReportId(''); return; }
    setHistoryError('');
    client.get('/client/reports', { params: { project_id: projectId } })
      .then((res) => {
        setHistoryReports(res.data.reports);
        setHistoryReportId(res.data.reports.length > 0 ? res.data.reports[0].id : '');
      })
      .catch((err) => setHistoryError(err.response?.data?.error || 'ดึงรายชื่อรายงานไม่สำเร็จ'));
  }, [projectId]);

  const currentProject = projects.find((p) => String(p.id) === String(projectId));

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

        {/* แถว 2: เลือกดูรายงานย้อนหลัง (เฉพาะฉบับที่ staff อนุมัติแล้ว) — ตรึงไว้ตรงนี้เสมอเหมือน
            ClientApp.jsx ไม่ขยับตาม Tab ที่เลือกอยู่ */}
        {historyReports.length > 0 && (
          <select
            className="foreman-app__select"
            value={historyReportId}
            onChange={(e) => setHistoryReportId(e.target.value)}
          >
            {historyReports.map((r) => (
              <option key={r.id} value={r.id}>
                รายงานครั้งที่ {r.report_no} ({r.week_start?.slice(8, 10)}/{r.week_start?.slice(5, 7)} - {r.week_end?.slice(8, 10)}/{r.week_end?.slice(5, 7)})
              </option>
            ))}
          </select>
        )}
        {historyError && <p className="fsafety__status fsafety__status--warn" style={{ padding: 0, margin: 0 }}>{historyError}</p>}

        {/* แถว 3: สลับ Tab — งานสัปดาห์นี้/หน้า (กรอกงาน), ความปลอดภัย (เพิ่มหัวข้อ+แนบรูป), เล่มรายงาน
            (อ่านอย่างเดียว ดูย้อนหลังได้ — เหมือน client ทุกประการ รวม S-Curve ที่ย้ายมาอยู่ในนี้ด้วยแล้ว) */}
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
        ทั้ง 2 Tab งานสัปดาห์เสมอ (สมมาตรกัน เพราะบันทึกจาก Tab ไหนก็ได้ ไม่รู้ล่วงหน้าว่าจะเป็น Tab ไหน)
        บังคับให้ remount ดึงข้อมูลใหม่ทั้งหมดหลังบันทึกทุกครั้ง กันไม่ให้ Tab ที่ไม่ได้แก้ค้างข้อมูลเก่าที่
        preload ไว้ก่อนหน้า — Tab ความปลอดภัย/เล่มรายงาน ไม่ต้องผูก dataVersion เพราะข้อมูลคนละชุด
        (report_items / รายงานที่อนุมัติแล้ว) ไม่ถูกกระทบจากการบันทึกความคืบหน้างานรายวันเลย
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
        <div style={{ display: activeTab === 'safety' ? 'block' : 'none' }}>
          {currentReportError ? (
            <p className="fsafety__status fsafety__status--warn" style={{ padding: '24px 12px' }}>{currentReportError}</p>
          ) : currentReportId ? (
            <ForemanSafetyTab key={currentReportId} reportId={currentReportId} />
          ) : (
            <p className="fsafety__status" style={{ padding: '24px 12px' }}>กำลังเตรียมรายงานสัปดาห์ปัจจุบัน...</p>
          )}
        </div>
      )}
      {projectId && (
        <div style={{ display: activeTab === 'report' ? 'block' : 'none' }}>
          <ClientReportTab
            key={projectId}
            projectId={projectId}
            project={currentProject}
            reportId={historyReportId}
            report={historyReports.find((r) => String(r.id) === String(historyReportId))}
          />
        </div>
      )}
    </div>
  );
}
