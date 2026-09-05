// src/pages/ProjectManagement/ProjectManagement.jsx
// Menu 3: การจัดการโครงการ — 5 Tab: งานสัปดาห์นี้/หน้า, ตารางงานรวม, Main S-Curve, Group S-Curve
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import WeeklyProgressTab from './WeeklyProgressTab';
import OverallProgressTab from './OverallProgressTab';
import SCurveTab from './SCurveTab';
import GroupSCurveGrid from './GroupSCurveGrid';
import './ProjectManagement.css';

const MENU_KEY = 'project_management';

const ALL_TABS = [
  { key: 'this-week', label: 'งานสัปดาห์นี้' },
  { key: 'next-week', label: 'งานสัปดาห์หน้า' },
  { key: 'overall', label: 'ตารางงานรวม' },
  { key: 'scurve-main', label: 'Main S-Curve' },
  { key: 'scurve-group', label: 'Group S-Curve' },
];

function formatMoney(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProjectManagement() {
  const { canAccessTab } = useAuth();
  // เห็นเฉพาะ Tab ที่ system_mgr ให้สิทธิ์ไว้เท่านั้น (ถ้ายังไม่มีเลย จะไม่เห็น Tab ไหนเลย — โชว์ข้อความ
  // แจ้งแทน กันสับสนว่าหน้าเสีย)
  const TABS = ALL_TABS.filter((t) => canAccessTab(MENU_KEY, t.key));

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [projectInfo, setProjectInfo] = useState(null);
  const [level1List, setLevel1List] = useState([]);
  const [activeTab, setActiveTab] = useState(null);

  // ตั้งค่า Tab เริ่มต้นเป็น Tab แรกที่มีสิทธิ์เข้าถึงได้เสมอ (รายชื่อ Tab ที่มีสิทธิ์อาจยังไม่พร้อมตอน mount
  // แรกสุดถ้า permissions ยังโหลดไม่เสร็จ จึงต้องคอยอัปเดตทุกครั้งที่ TABS เปลี่ยน ไม่ใช่แค่ตอน mount ครั้งเดียว)
  useEffect(() => {
    if (TABS.length === 0) { setActiveTab(null); return; }
    if (!TABS.some((t) => t.key === activeTab)) setActiveTab(TABS[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS.map((t) => t.key).join(',')]);

  useEffect(() => {
    client.get('/projects').then((res) => {
      setProjects(res.data.projects);
      if (res.data.projects.length > 0) setProjectId(res.data.projects[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    client.get('/wbs-level1', { params: { project_id: projectId } }).then((res) => {
      setProjectInfo(res.data.project);
      setLevel1List(res.data.items);
    });
  }, [projectId]);

  const projectLabel = projects.find((p) => String(p.id) === String(projectId));
  const projectLabelText = projectLabel ? `${projectLabel.project_code} - ${projectLabel.name}` : '';

  return (
    <Layout title="การจัดการโครงการ">
      <div className="pdata-toolbar">
        <div className="pdata-toolbar__filter">
          <span>เลือกโครงการ</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} - {p.name}</option>
            ))}
          </select>
        </div>
        <div className="pdata-toolbar__filter">
          <span>มูลค่า</span>
          <span className="mono">{formatMoney(projectInfo?.budget_total)}</span>
        </div>
      </div>

      {TABS.length === 0 && (
        <p className="pdata-status pdata-status--warn">คุณยังไม่มีสิทธิ์เข้าถึง Tab ใดในเมนูนี้ กรุณาติดต่อผู้ดูแลระบบ</p>
      )}

      {TABS.length > 0 && (
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

      {projectId && activeTab === 'this-week' && (
        <WeeklyProgressTab projectId={projectId} week="this" editable />
      )}
      {projectId && activeTab === 'next-week' && (
        <WeeklyProgressTab projectId={projectId} week="next" editable />
      )}
      {projectId && activeTab === 'overall' && (
        <OverallProgressTab
          projectId={projectId}
          level1List={level1List}
          projectLabel={projectLabelText}
          contractStart={projectLabel?.contract_start}
        />
      )}
      {projectId && activeTab === 'scurve-main' && (
        <SCurveTab
          projectId={projectId}
          projectLabel={projectLabelText}
          contractStart={projectLabel?.contract_start}
        />
      )}
      {projectId && activeTab === 'scurve-group' && (
        <GroupSCurveGrid
          projectId={projectId}
          level1List={level1List}
          contractStart={projectLabel?.contract_start}
        />
      )}
    </Layout>
  );
}
