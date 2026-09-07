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

        {TABS.length > 0 && (
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
        )}
      </div>

      {error && <p className="client-app__status client-app__status--warn">{error}</p>}
      {!error && TABS.length === 0 && (
        <p className="client-app__status">ยังไม่มีสิทธิ์เข้าดูส่วนใดเลย กรุณาติดต่อผู้ดูแลระบบ</p>
      )}

      {projectId && (activeTab === 'this-week' || activeTab === 'next-week') && (
        <ClientWeeklyTab key={`${projectId}-${activeTab}`} projectId={projectId} week={activeTab === 'next-week' ? 'next' : 'this'} />
      )}
      {projectId && activeTab === 'scurve' && (
        <ClientSCurveTab key={projectId} projectId={projectId} />
      )}
      {projectId && activeTab === 'full-report' && (
        <ClientReportTab key={projectId} projectId={projectId} project={currentProject} />
      )}
    </div>
  );
}
