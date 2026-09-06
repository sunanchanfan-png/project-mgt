// src/pages/Reports/Reports.jsx
// Menu 5: จัดทำรายงาน — รายงานความคืบหน้าประจำสัปดาห์ 1 ฉบับ = 1 "สัปดาห์ของโครงการ" ต่อโครงการ (นับ
// สัปดาห์แบบอิงวันเริ่มสัญญา — สัปดาห์ 1 = วันเริ่มสัญญา-อาทิตย์แรก, สัปดาห์ 2 เป็นต้นไป = จันทร์-อาทิตย์
// เต็มสัปดาห์ — ดู lib/progress.js) รายงานของสัปดาห์ปัจจุบันถูกสร้างให้อัตโนมัติเสมอ ไม่ต้องกดปุ่มสร้างเอง
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import useIsMobile from '../../hooks/useIsMobile';
import ReportItemsTab from './ReportItemsTab';
import PlanProgressTab from './PlanProgressTab';
import NextWeekTab from './NextWeekTab';
import PhotosTab from './PhotosTab';
import CompiledReportTab from './CompiledReportTab';
import './Reports.css';

const MENU_KEY = 'reports';

const ALL_TABS = [
  { key: 'plan-progress', label: 'Plan&Progress' },
  { key: 'quality', label: 'คุณภาพงาน', category: 'quality' },
  { key: 'safety', label: 'ความปลอดภัย', category: 'safety' },
  { key: 'photos', label: 'รูปถ่าย' },
  { key: 'next-week-plan', label: 'งานสัปดาห์หน้า' },
  { key: 'problems', label: 'ปัญหาอุปสรรค', category: 'problems' },
  { key: 'additional-work', label: 'งานเพิ่มลด', category: 'additional_work' },
  { key: 'pending', label: 'เรื่องที่ค้าง', category: 'pending' },
  { key: 'compiled', label: 'เล่มรายงาน' },
];

function fmtDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function Reports() {
  const { canAccessTab } = useAuth();
  const isMobile = useIsMobile();
  const TABS = ALL_TABS.filter((t) => canAccessTab(MENU_KEY, t.key));

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [level1List, setLevel1List] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportId, setReportId] = useState('');
  const [activeTab, setActiveTab] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  // ซ่อน filter+tabs+ปุ่มลบ เฉพาะตอนอยู่ Tab "เล่มรายงาน" บนมือถือ — default เป็นซ่อนไว้ก่อนเสมอ (เปิดดู
  // เล่มรายงานเต็มจอได้ทันทีไม่ต้องเลื่อนผ่านส่วนนี้) กดปุ่มเพื่อเปิดโชว์กลับมาได้ตลอดเวลา
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  const showCollapseToggle = isMobile && activeTab === 'compiled';

  useEffect(() => {
    if (TABS.length === 0) { setActiveTab(null); return; }
    if (!TABS.some((t) => t.key === activeTab)) setActiveTab(TABS[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS.map((t) => t.key).join(',')]);

  useEffect(() => {
    // เมนูนี้ (จัดทำรายงาน) ให้เลือกได้เฉพาะโครงการที่ "เปิดอยู่" (status=on) เท่านั้น — ตัดโครงการที่ปิด
    // แล้วออกจาก dropdown ตามที่ตกลงกันไว้
    client.get('/projects', { params: { status: 'on' } }).then((res) => {
      setProjects(res.data.projects);
      if (res.data.projects.length > 0) setProjectId(res.data.projects[0].id);
    });
  }, []);

  function fetchReports() {
    if (!projectId) return Promise.resolve();
    return client.get('/reports', { params: { project_id: projectId } }).then((res) => {
      setReports(res.data.reports);
      return res.data.reports;
    });
  }

  // ทุกครั้งที่เปลี่ยนโครงการ: เตรียมรายงานของ "สัปดาห์ปัจจุบัน" ให้อัตโนมัติก่อนเสมอ (สร้างให้เลยถ้ายังไม่มี
  // ไม่ต้องกดปุ่มสร้างเองแล้ว) แล้วค่อยโหลดรายชื่อรายงานทั้งหมดมาให้เลือกดูฉบับอื่นได้ด้วย
  useEffect(() => {
    if (!projectId) return;
    setPreparing(true);
    setError('');
    client.get('/reports/current', { params: { project_id: projectId } })
      .then((res) => {
        setReportId(res.data.report.id);
        return fetchReports();
      })
      .catch((err) => setError(err.response?.data?.error || 'เตรียมรายงานสัปดาห์ปัจจุบันไม่สำเร็จ'))
      .finally(() => setPreparing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    client.get('/wbs-level1', { params: { project_id: projectId } }).then((res) => {
      setLevel1List(res.data.items);
    });
  }, [projectId]);

  async function handleDeleteReport() {
    if (!window.confirm('ยืนยันลบรายงานฉบับนี้ทั้งหมด? ข้อมูลทุก Tab ในรายงานนี้จะหายไปด้วย กู้คืนไม่ได้ (ถ้าเป็นสัปดาห์ปัจจุบัน ระบบจะสร้างใหม่ให้อัตโนมัติตอนเปิดเมนูนี้อีกครั้ง)')) return;
    try {
      await client.delete(`/reports/${reportId}`);
      const list = await fetchReports();
      if (list && list.length > 0) setReportId(list[0].id);
      else setReportId('');
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  const currentReport = reports.find((r) => String(r.id) === String(reportId));
  const CATEGORY_TABS = ['quality', 'safety', 'problems', 'additional-work', 'pending'];

  return (
    <Layout title="จัดทำรายงาน">
      {/* ===== Sticky Header: Toolbar + Tabs ===== */}
      <div className="reports-sticky-header">
        {/* ปุ่มซ่อน/โชว์ ส่วน filter+tabs+print — โชว์เฉพาะตอนอยู่ Tab "เล่มรายงาน" บนมือถือเท่านั้น (Tab
            อื่นๆ หรือเปิดผ่าน PC ไม่มีปุ่มนี้ ทุกอย่างแสดงตามปกติเหมือนเดิมทุกจุด) */}
        {showCollapseToggle && (
          <button
            type="button"
            className="reports-header-collapse-toggle"
            onClick={() => setHeaderCollapsed((c) => !c)}
          >
            {headerCollapsed ? '▾ แสดงตัวเลือกโครงการ/แท็บ' : '▴ ซ่อนตัวเลือกโครงการ/แท็บ'}
          </button>
        )}

        <div className={showCollapseToggle && headerCollapsed ? 'reports-header-collapsible reports-header-collapsible--collapsed' : 'reports-header-collapsible'}>
          <div className="pdata-toolbar">
            <div className="pdata-toolbar__filters-group">
              <div className="pdata-toolbar__filter">
                <span>เลือกโครงการ</span>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.project_code} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div className="pdata-toolbar__filter">
                <span>รายงานฉบับที่</span>
                <select value={reportId} onChange={(e) => setReportId(e.target.value)} disabled={reports.length === 0}>
                  {reports.length === 0 && <option value="">ยังไม่มีรายงาน</option>}
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.report_no} ({fmtDMY(r.week_start)} - {fmtDMY(r.week_end)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pdata-toolbar__actions">
              {currentReport && (
                <button className="btn-secondary btn-secondary--sm" onClick={handleDeleteReport}>ลบรายงานฉบับนี้</button>
              )}
            </div>
          </div>

          {preparing && <p className="pdata-status">กำลังเตรียมรายงานสัปดาห์ปัจจุบัน...</p>}
          {error && <p className="pdata-status pdata-status--warn">{error}</p>}

          {TABS.length === 0 && (
            <p className="pdata-status pdata-status--warn">คุณยังไม่มีสิทธิ์เข้าถึง Tab ใดในเมนูนี้ กรุณาติดต่อผู้ดูแลระบบ</p>
          )}

          {TABS.length > 0 && !preparing && (
            <div className="pdata-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`pdata-tab ${activeTab === t.key ? 'pdata-tab--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Content ===== */}
      <div className="reports-content">
        {reportId && CATEGORY_TABS.includes(activeTab) && (
          <ReportItemsTab
            key={`${reportId}-${activeTab}`}
            reportId={reportId}
            category={ALL_TABS.find((t) => t.key === activeTab).category}
            tabLabel={ALL_TABS.find((t) => t.key === activeTab).label}
            allowPhotos={activeTab === 'quality' || activeTab === 'safety'}
          />
        )}

        {reportId && activeTab === 'plan-progress' && (
          <PlanProgressTab key={reportId} reportId={reportId} />
        )}
        {reportId && activeTab === 'photos' && (
          <PhotosTab key={reportId} reportId={reportId} />
        )}
        {reportId && activeTab === 'next-week-plan' && (
          <NextWeekTab key={reportId} reportId={reportId} level1List={level1List} />
        )}
        {reportId && activeTab === 'compiled' && (
          <CompiledReportTab
            key={reportId}
            reportId={reportId}
            reportLabel={currentReport ? `${projects.find((p) => String(p.id) === String(projectId))?.project_code}_report${currentReport.report_no}` : 'report'}
            project={projects.find((p) => String(p.id) === String(projectId))}
            report={currentReport}
            printBarHidden={showCollapseToggle && headerCollapsed}
          />
        )}
      </div>
    </Layout>
  );
}