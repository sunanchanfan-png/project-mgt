// src/pages/Client/ClientApp.jsx
// หน้าเฉพาะสำหรับ role "client" (ลูกค้าเจ้าของโครงการ) — ไม่มี Sidebar/เมนูอื่นเลย เห็นแค่ตัวเลือก
// โครงการ (เฉพาะโครงการที่ถูกผูกให้ดูได้ผ่าน client_project_access) + Tab งานสัปดาห์นี้/หน้า/S-Curve/
// เล่มรายงาน ตามที่ตกลงกันไว้ (ระดับ 2 เหมือน ForemanApp: แยก route แต่ใช้โค้ด/ฐานข้อมูลเดียวกันกับ
// หน้าคอมพิวเตอร์ ต่างจาก foreman แค่ endpoint ทั้งหมดอยู่ใต้ /api/client/* และเป็น "อ่านอย่างเดียว" ล้วนๆ
// ไม่มีปุ่มแก้ไข/บันทึกใดๆ เลยสักจุด)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ClientWeeklyTab from './ClientWeeklyTab';
import ClientSCurveTab from './ClientSCurveTab';
import ClientReportTab from './ClientReportTab';
import './ClientApp.css';

const ALL_TABS = [
  { key: 'this-week', label: 'งานสัปดาห์นี้' },
  { key: 'next-week', label: 'งานสัปดาห์หน้า' },
  { key: 'scurve', label: 'S-Curve' },
  { key: 'full-report', label: 'เล่มรายงาน' },
];

const CLIENT_MENU_KEY = 'client-app';

export default function ClientApp() {
  const { user, logout, canAccessTab } = useAuth();
  const TABS = ALL_TABS.filter((t) => canAccessTab(CLIENT_MENU_KEY, t.key));

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState(null);
  const [error, setError] = useState('');
  // รายชื่อรายงาน (สำหรับ dropdown "รายงานครั้งที่ x") — ยกขึ้นมาไว้ที่นี่ (แทนที่จะอยู่ใน
  // ClientReportTab เหมือนเดิม) เพราะอยากให้กล่องนี้อยู่ต่อจากกล่องเลือกโครงการเสมอ ไม่ว่าจะเปิด Tab ไหน
  // อยู่ก็ตาม (เหมือน pattern เดียวกับหน้า Reports.jsx ฝั่ง staff ที่ตรึงตัวเลือกโครงการ+รายงานไว้ด้านบน
  // คงที่ ไม่ขยับตาม Tab) — ClientReportTab.jsx รับแค่ reportId ที่เลือกแล้วไปใช้ ไม่ได้จัดการ dropdown เอง
  const [reports, setReports] = useState([]);
  const [reportId, setReportId] = useState('');
  const [reportsError, setReportsError] = useState('');
  // เพิ่มค่านี้ทุกครั้งที่กดปุ่ม "รีเฟรช" — ผูกกับ key ของทุก Tab (ทั้ง 4 อัน) บังคับให้ remount ดึงข้อมูล
  // ล่าสุดใหม่หมดพร้อมกัน เพราะ client app preload ข้อมูลไว้ล่วงหน้าตอนเลือกโครงการแล้วไม่โหลดซ้ำเองอัตโนมัติ
  // (ตามที่ตกลงกันไว้) ถ้าระหว่างนั้นมีข้อมูลใหม่จากฝั่งโฟร์แมน ต้องกดปุ่มนี้เองถึงจะเห็น
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshVersion((v) => v + 1);
    setRefreshing(true);
    // แค่ทำปุ่มดูมีการตอบสนอง (spin/disable) สักครู่ — ตัว remount จริงเกิดทันทีที่ setRefreshVersion ทำงาน
    // ไม่ต้องรอ callback จาก Tab ไหนเลย (ทุก Tab ดึงข้อมูลของตัวเองใหม่เองพร้อมกันอัตโนมัติ)
    setTimeout(() => setRefreshing(false), 600);
  }

  useEffect(() => {
    // เห็นเฉพาะโครงการที่ system_mgr/admin ผูกให้ดูได้ผ่านหน้า "อนุมัติและกำหนดสิทธิ์" เท่านั้น (ดู
    // GET /api/client/my-projects) ต่างจาก ForemanApp ที่เห็นทุกโครงการที่ "เปิดอยู่" ในระบบ
    client.get('/client/my-projects')
      .then((res) => {
        setProjects(res.data.projects);
        if (res.data.projects.length > 0) setProjectId(res.data.projects[0].id);
        else setError('ยังไม่มีโครงการที่เปิดให้คุณดูได้ กรุณาติดต่อผู้ดูแลระบบ');
      })
      .catch((err) => setError(err.response?.data?.error || 'ดึงรายชื่อโครงการไม่สำเร็จ'));
  }, []);

  useEffect(() => {
    if (TABS.length === 0) { setActiveTab(null); return; }
    if (!TABS.some((t) => t.key === activeTab)) setActiveTab(TABS[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS.map((t) => t.key).join(',')]);

  // โหลดรายชื่อรายงานทั้งหมดของโครงการที่เลือกอยู่ (เรียงล่าสุดก่อน) เฉพาะตอนมีสิทธิ์เข้า Tab เล่มรายงาน
  // เท่านั้น — ผูก refreshVersion ไว้ด้วยเพื่อให้ปุ่มรีเฟรชอัปเดตรายชื่อรายงานตามด้วย (เผื่อ staff อนุมัติ
  // รายงานฉบับใหม่ระหว่างที่ client เปิดแอปค้างอยู่)
  useEffect(() => {
    if (!projectId || !TABS.some((t) => t.key === 'full-report')) { setReports([]); setReportId(''); return; }
    setReportsError('');
    client.get('/client/reports', { params: { project_id: projectId } })
      .then((res) => {
        setReports(res.data.reports);
        setReportId(res.data.reports.length > 0 ? res.data.reports[0].id : '');
      })
      .catch((err) => setReportsError(err.response?.data?.error || 'ดึงรายชื่อรายงานไม่สำเร็จ'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshVersion]);

  const currentProject = projects.find((p) => String(p.id) === String(projectId));

  return (
    <div className="client-app">
      <header className="client-app__header">
        <span className="client-app__title">SIKARIN - ความคืบหน้าโครงการ</span>
        <button type="button" className="client-app__logout" onClick={logout}>ออกจากระบบ</button>
      </header>

      <div className="client-app__user">{user?.name || user?.username}</div>

      <div className="client-app__selectors">
        {projects.length > 0 && (
          <select
            className="client-app__select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} - {p.name}</option>
            ))}
          </select>
        )}

        {TABS.some((t) => t.key === 'full-report') && reports.length > 0 && (
          <select
            className="client-app__select"
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
          >
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                รายงานครั้งที่ {r.report_no} ({r.week_start?.slice(8, 10)}/{r.week_start?.slice(5, 7)} - {r.week_end?.slice(8, 10)}/{r.week_end?.slice(5, 7)})
              </option>
            ))}
          </select>
        )}
        {reportsError && <p className="client-app__status client-app__status--warn" style={{ padding: 0 }}>{reportsError}</p>}

        {TABS.length > 0 && (
          <div className="client-app__tab-row">
            <div className="client-app__tab-toggle">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`client-app__tab-btn ${activeTab === t.key ? 'client-app__tab-btn--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="client-app__refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title="ดึงข้อมูลล่าสุด"
            >
              {refreshing ? '⏳' : '🔄'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="client-app__status client-app__status--warn">{error}</p>}
      {!error && TABS.length === 0 && (
        <p className="client-app__status">ยังไม่มีสิทธิ์เข้าดูส่วนใดเลย กรุณาติดต่อผู้ดูแลระบบ</p>
      )}

      {/*
        Mount ทุก Tab ที่มีสิทธิ์เข้าพร้อมกันทีเดียวตั้งแต่เลือกโครงการ (ไม่รอให้กดเข้า Tab ก่อนค่อยโหลด)
        แล้วสลับ Tab ด้วยการซ่อน/โชว์ผ่าน CSS display เท่านั้น — component ไม่ unmount จึง "ไม่โหลดข้อมูลซ้ำ"
        ทุกครั้งที่สลับ Tab ไปมา (state/ข้อมูลที่ดึงมาแล้วยังอยู่ในหน่วยความจำเหมือนเดิม) key ผูกกับทั้ง
        projectId (เปลี่ยนโครงการ = โหลดชุดใหม่ทั้งหมด) และ refreshVersion (กดปุ่มรีเฟรช = โหลดชุดใหม่
        ทั้งหมดเหมือนกัน โดยไม่ต้องเปลี่ยนโครงการ) — ข้อเสียเล็กน้อยคือช่วงแรกที่เลือกโครงการ/กดรีเฟรชจะยิง
        API รวดเดียว 4 ชุดพร้อมกัน แต่แลกมากับ "สลับ Tab ไปมาแล้วเห็นทันที ไม่มีจอโหลดซ้ำ"
      */}
      {projectId && TABS.some((t) => t.key === 'this-week') && (
        <div style={{ display: activeTab === 'this-week' ? 'block' : 'none' }}>
          <ClientWeeklyTab key={`${projectId}-this-${refreshVersion}`} projectId={projectId} week="this" />
        </div>
      )}
      {projectId && TABS.some((t) => t.key === 'next-week') && (
        <div style={{ display: activeTab === 'next-week' ? 'block' : 'none' }}>
          <ClientWeeklyTab key={`${projectId}-next-${refreshVersion}`} projectId={projectId} week="next" />
        </div>
      )}
      {projectId && TABS.some((t) => t.key === 'scurve') && (
        <div style={{ display: activeTab === 'scurve' ? 'block' : 'none' }}>
          <ClientSCurveTab key={`${projectId}-${refreshVersion}`} projectId={projectId} />
        </div>
      )}
      {projectId && TABS.some((t) => t.key === 'full-report') && (
        <div style={{ display: activeTab === 'full-report' ? 'block' : 'none' }}>
          <ClientReportTab
            key={`${projectId}-${refreshVersion}`}
            projectId={projectId}
            project={currentProject}
            reportId={reportId}
            report={reports.find((r) => String(r.id) === String(reportId))}
          />
        </div>
      )}
    </div>
  );
}
