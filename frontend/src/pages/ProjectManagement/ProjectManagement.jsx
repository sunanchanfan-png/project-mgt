// src/pages/ProjectManagement/ProjectManagement.jsx
// Menu 3: การจัดการโครงการ — 5 Tab: งานสัปดาห์นี้/หน้า, ตารางงานรวม, Main S-Curve, Group S-Curve
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import useIsMobile from '../../hooks/useIsMobile';
import WeeklyProgressTab from './WeeklyProgressTab';
import OverallProgressTab from './OverallProgressTab';
import SCurveTab from './SCurveTab';
import { pickDefaultProjectId, setLastProjectId } from '../../utils/lastProject';
import GroupSCurveGrid from './GroupSCurveGrid';
import MobileForemanTab from '../Mobile/MobileForemanTab';
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
  const { canAccessTab, user } = useAuth();
  const isNarrowScreen = useIsMobile();
  // เห็นหน้าจอมือถือ (ทีละกิจกรรมงาน) เฉพาะ role foreman เท่านั้น — role อื่น (admin, pm, system_mgr ฯลฯ)
  // ต้องเห็นตาราง Plan&Progress แบบ PC เสมอไม่ว่าจอจะแคบแค่ไหน (ตามที่ตกลงกันไว้ — role พวกนี้ต้องดูภาพรวม
  // ทั้งต้นไม้ WBS ได้ ไม่ใช่กรอกงานทีละอย่างแบบ foreman)
  const showMobileFlow = isNarrowScreen && user?.role === 'foreman';
  // เห็นเฉพาะ Tab ที่ system_mgr ให้สิทธิ์ไว้เท่านั้น (ถ้ายังไม่มีเลย จะไม่เห็น Tab ไหนเลย — โชว์ข้อความ
  // แจ้งแทน กันสับสนว่าหน้าเสีย)
  const TABS = ALL_TABS.filter((t) => canAccessTab(MENU_KEY, t.key));

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [projectInfo, setProjectInfo] = useState(null);
  const [level1List, setLevel1List] = useState([]);
  const [activeTab, setActiveTab] = useState(null);

  // "เลือกสัปดาห์ที่" — ฟีเจอร์ทำรายงานย้อนหลัง เฉพาะ admin/system_mgr เท่านั้น (ตรงกับสิทธิ์ backdate ที่
  // ตกลงกันไว้ก่อนหน้า) เลือกสัปดาห์ไหน Tab งานสัปดาห์นี้/หน้า จะโหลด/แก้ไขข้อมูลของสัปดาห์นั้นตรงๆ ทันที
  // เหมือนกำลังทำงานสัปดาห์นั้นอยู่จริง — null หมายถึง "ใช้สัปดาห์ปัจจุบันแบบ live" (ค่าเริ่มต้นเสมอ ตาม
  // ที่ตกลงกันไว้ว่า default ต้องเป็นสัปดาห์ปัจจุบัน)
  const canPickWeek = user?.role === 'admin' || user?.role === 'system_mgr';
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(null);
  // สัปดาห์ปัจจุบันจริง + วันสิ้นสุดของ "สัปดาห์ที่กำลังดูอยู่ตอนนี้" (ไม่ว่าจะ live หรือเลือกไว้เอง) — ดึง
  // แยกต่างหากจาก Tab1 โดยตรง (ไม่พึ่งว่า Tab "งานสัปดาห์นี้" ต้องถูก mount อยู่ก่อน) เพื่อให้ Tab3/4/5
  // (ตารางงานรวม/S-Curve) รู้ขอบเขตวันที่ที่ต้อง freeze ข้อมูลไว้ได้เสมอ ไม่ว่าผู้ใช้จะเปิด Tab ไหนอยู่ก็ตาม
  const [currentWeekNumber, setCurrentWeekNumber] = useState(null);
  const [selectedWeekEnd, setSelectedWeekEnd] = useState(null);

  useEffect(() => {
    if (!projectId || !canPickWeek) { setCurrentWeekNumber(null); setSelectedWeekEnd(null); return; }
    const params = { project_id: projectId, week: 'this' };
    if (selectedWeekNumber !== null) params.week_number = selectedWeekNumber;
    // ยืมใช้ /progress/weekly เพื่อดึงแค่ week_number/week_end (ไม่ได้ใช้ groups ที่ตอบมาด้วยเลย) — เลือกใช้
    // endpoint นี้เพราะมีสูตรคำนวณเลขสัปดาห์แบบ contract-anchored ที่ถูกต้องอยู่แล้ว ไม่ต้องเขียนซ้ำฝั่ง
    // frontend หรือเพิ่ม endpoint ใหม่แค่สำหรับข้อมูล 2 ค่านี้
    client.get('/progress/weekly', { params }).then((res) => {
      if (selectedWeekNumber === null) setCurrentWeekNumber(res.data.week_number);
      setSelectedWeekEnd(res.data.week_end);
    }).catch(() => {});
  }, [projectId, canPickWeek, selectedWeekNumber]);

  // ตั้งค่า Tab เริ่มต้นเป็น Tab แรกที่มีสิทธิ์เข้าถึงได้เสมอ (รายชื่อ Tab ที่มีสิทธิ์อาจยังไม่พร้อมตอน mount
  // แรกสุดถ้า permissions ยังโหลดไม่เสร็จ จึงต้องคอยอัปเดตทุกครั้งที่ TABS เปลี่ยน ไม่ใช่แค่ตอน mount ครั้งเดียว)
  useEffect(() => {
    if (TABS.length === 0) { setActiveTab(null); return; }
    if (!TABS.some((t) => t.key === activeTab)) setActiveTab(TABS[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS.map((t) => t.key).join(',')]);

  useEffect(() => {
    // เมนูนี้ (การจัดการโครงการ) ให้เลือกได้เฉพาะโครงการที่ "เปิดอยู่" (status=on) เท่านั้น — ตัดโครงการ
    // ที่ปิดแล้วออกจาก dropdown ตามที่ตกลงกันไว้
    client.get('/projects', { params: { status: 'on' } }).then((res) => {
      setProjects(res.data.projects);
      // default ตาม "โครงการที่เลือกล่าสุด" ข้ามเมนู (เช่น เพิ่งเปิดดู/แก้ไขจากเมนู "เปิดโครงการ" มา) แทนที่
      // จะเลือกโครงการแรกในลิสต์เสมอเหมือนเดิม — ถ้าโครงการนั้นไม่มีอยู่ในลิสต์นี้แล้ว (เช่น ปิดงานไปแล้ว)
      // จะ fallback ไปโครงการแรกให้อัตโนมัติเหมือนพฤติกรรมเดิม
      setProjectId(pickDefaultProjectId(res.data.projects));
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    client.get('/wbs-level1', { params: { project_id: projectId } }).then((res) => {
      setProjectInfo(res.data.project);
      setLevel1List(res.data.items);
    });
    // เปลี่ยนโครงการ = เลขสัปดาห์คนละชุดกันเลย (แต่ละโครงการนับสัปดาห์จากวันเริ่มสัญญาตัวเอง) รีเซ็ตกลับ
    // ไปเป็น "สัปดาห์ปัจจุบันแบบ live" เสมอ กันเอาเลขสัปดาห์ของโครงการเก่ามาใช้ผิดโครงการ
    setSelectedWeekNumber(null);
    setCurrentWeekNumber(null);
  }, [projectId]);

  const projectLabel = projects.find((p) => String(p.id) === String(projectId));
  const projectLabelText = projectLabel ? `${projectLabel.project_code} - ${projectLabel.name}` : '';

  return (
    <Layout title="การจัดการโครงการ">
      <div className="pdata-toolbar">
        <div className="pdata-toolbar__filter">
          <span>เลือกโครงการ</span>
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLastProjectId(e.target.value); }}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} - {p.name}</option>
            ))}
          </select>
        </div>
        <div className="pdata-toolbar__filter">
          <span>มูลค่า</span>
          <span className="mono">{formatMoney(projectInfo?.budget_total)}</span>
        </div>
        {/* เลือกสัปดาห์ที่ (ทำรายงานย้อนหลัง) — เฉพาะ admin/system_mgr และต้องรู้ "สัปดาห์ปัจจุบัน" ก่อน
            (จาก currentWeekNumber ที่ WeeklyProgressTab แจ้งมาตอนโหลด live ครั้งแรก) ถึงจะสร้างรายการ
            ตัวเลือก 1..สัปดาห์ปัจจุบันได้ */}
        {canPickWeek && currentWeekNumber && (
          <div className="pdata-toolbar__filter">
            <span>สัปดาห์ที่</span>
            <select
              value={selectedWeekNumber ?? currentWeekNumber}
              onChange={(e) => {
                const n = Number(e.target.value);
                // เลือกตรงกับสัปดาห์ปัจจุบันพอดี = กลับไปโหมด live ปกติ (null) ไม่ต้องบังคับ override
                // เป็นเลขเดิมซ้ำ กันปัญหา default วันที่ของ popup กลายเป็น "วันสิ้นสุดสัปดาห์" ซึ่งอาจเป็น
                // วันในอนาคตสำหรับสัปดาห์ที่ยังไม่จบ (ต้องเป็นวันนี้จริงเสมอสำหรับสัปดาห์ปัจจุบัน)
                setSelectedWeekNumber(n === currentWeekNumber ? null : n);
              }}
            >
              {Array.from({ length: currentWeekNumber }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  สัปดาห์ที่ {n}{n === currentWeekNumber ? ' (ปัจจุบัน)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
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
        showMobileFlow
          ? <MobileForemanTab projectId={projectId} week="this" />
          : (
            <WeeklyProgressTab
              projectId={projectId}
              week="this"
              editable
              weekNumberOverride={selectedWeekNumber}
            />
          )
      )}
      {projectId && activeTab === 'next-week' && (
        showMobileFlow
          ? <MobileForemanTab projectId={projectId} week="next" />
          : <WeeklyProgressTab projectId={projectId} week="next" editable weekNumberOverride={selectedWeekNumber} />
      )}
      {projectId && activeTab === 'overall' && (
        <OverallProgressTab
          projectId={projectId}
          level1List={level1List}
          projectLabel={projectLabelText}
          contractStart={projectLabel?.contract_start}
          asOf={selectedWeekEnd}
          readOnly={selectedWeekNumber !== null}
        />
      )}
      {projectId && activeTab === 'scurve-main' && (
        <SCurveTab
          projectId={projectId}
          projectLabel={projectLabelText}
          contractStart={projectLabel?.contract_start}
          asOf={selectedWeekEnd}
        />
      )}
      {projectId && activeTab === 'scurve-group' && (
        <GroupSCurveGrid
          projectId={projectId}
          level1List={level1List}
          contractStart={projectLabel?.contract_start}
          asOf={selectedWeekEnd}
        />
      )}
    </Layout>
  );
}
