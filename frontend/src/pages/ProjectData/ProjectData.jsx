// src/pages/ProjectData/ProjectData.jsx
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import WbsLevel1Modal from './WbsLevel1Modal';
import WbsLevel2Modal from './WbsLevel2Modal';
import WbsLevel3Modal from './WbsLevel3Modal';
import GanttView from './GanttView';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './ProjectData.css';

const MENU_KEY = 'project_data';

const ALL_TABS = [
  { key: 'group', label: 'กลุ่มงานหลัก' },
  { key: 'item', label: 'รายการงาน' },
  { key: 'activity', label: 'กิจกรรมงาน' },
  { key: 'gantt', label: 'Gantt (ภาพรวม)' },
];

const ALL_VALUE = 'all';

function formatMoney(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// แปลงวันที่ให้เป็น dd/mm/yyyy (ปี ค.ศ. ตรงๆ ไม่แปลงเป็น พ.ศ.) ใช้กับตาราง Tab 3 กิจกรรมงาน
function formatDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  if (!y || !m || !d) return '-';
  return `${d}/${m}/${y}`;
}

export default function ProjectData() {
  const { canAccessTab } = useAuth();
  const TABS = ALL_TABS.filter((t) => canAccessTab(MENU_KEY, t.key));

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [activeTab, setActiveTab] = useState(null);
  const [projectInfo, setProjectInfo] = useState(null);
  // มีการแก้ไข Gantt (Tab 4) ที่ยังไม่ได้บันทึกอยู่หรือไม่ — ใช้เตือนก่อนสลับ Tab หรือเปลี่ยนโครงการ
  const [ganttDirty, setGanttDirty] = useState(false);

  // ตั้งค่า Tab เริ่มต้นเป็น Tab แรกที่มีสิทธิ์เข้าถึงได้เสมอ (รายชื่อ Tab ที่มีสิทธิ์อาจยังไม่พร้อมตอน mount
  // แรกสุดถ้า permissions ยังโหลดไม่เสร็จ จึงต้องคอยอัปเดตทุกครั้งที่ TABS เปลี่ยน ไม่ใช่แค่ตอน mount ครั้งเดียว)
  useEffect(() => {
    if (TABS.length === 0) { setActiveTab(null); return; }
    if (!TABS.some((t) => t.key === activeTab)) setActiveTab(TABS[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS.map((t) => t.key).join(',')]);

  function confirmLeaveGanttIfDirty() {
    if (activeTab === 'gantt' && ganttDirty) {
      return window.confirm('มีการแก้ไขในแท็บ Gantt ที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้โดยไม่บันทึกหรือไม่?');
    }
    return true;
  }

  // ===== Tab 1: กลุ่มงานหลัก (Level 1) =====
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // ===== Tab 2: รายการงาน (Level 2) =====
  const [level1List, setLevel1List] = useState([]);
  const [selectedLevel1Id, setSelectedLevel1Id] = useState('');

  // มุมมองกลุ่มเดียว
  const [level2Group, setLevel2Group] = useState(null);
  const [level2Items, setLevel2Items] = useState([]);
  const [level2Totals, setLevel2Totals] = useState(null);
  const [level2Complete, setLevel2Complete] = useState(false);

  // มุมมอง "ทั้งหมด" (ทุกกลุ่มพร้อมกัน)
  const [allGroupsData, setAllGroupsData] = useState(null);

  const [level2Loading, setLevel2Loading] = useState(false);
  const [level2Error, setLevel2Error] = useState('');
  const [level2ModalOpen, setLevel2ModalOpen] = useState(false);
  const [level2EditingItem, setLevel2EditingItem] = useState(null);
  const [level2EditingContext, setLevel2EditingContext] = useState(null); // { level1Id, items, groupCode, groupRemainingAmount }

  // ===== Tab 3: กิจกรรมงาน (Level 3) =====
  const [activityGroupId, setActivityGroupId] = useState(''); // dropdown 1: กลุ่มงาน
  const [activityLevel2List, setActivityLevel2List] = useState([]); // dropdown 2 options
  const [activityLevel2Id, setActivityLevel2Id] = useState(''); // dropdown 2: รายการงาน
  const [level3Item2Info, setLevel3Item2Info] = useState(null);
  const [level3Items, setLevel3Items] = useState([]);
  const [level3Totals, setLevel3Totals] = useState(null);
  const [level3Complete, setLevel3Complete] = useState(false);
  const [level3Loading, setLevel3Loading] = useState(false);
  const [level3Error, setLevel3Error] = useState('');
  const [level3ModalOpen, setLevel3ModalOpen] = useState(false);
  const [level3EditingItem, setLevel3EditingItem] = useState(null);

  useEffect(() => {
    client.get('/projects').then((res) => {
      setProjects(res.data.projects);
      if (res.data.projects.length > 0) setProjectId(res.data.projects[0].id);
    });
  }, []);

  async function fetchGroupData(pid) {
    if (!pid) return;
    setLoading(true);
    try {
      const res = await client.get('/wbs-level1', { params: { project_id: pid } });
      setProjectInfo(res.data.project);
      setItems(res.data.items);
      setTotals(res.data.totals);
      setError('');
    } catch (err) {
      setError('ดึงข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchGroupData(projectId); }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    client.get('/wbs-level1', { params: { project_id: projectId } }).then((res) => {
      setLevel1List(res.data.items);
      setSelectedLevel1Id(ALL_VALUE); // default เปิดเป็น "ทั้งหมด" ให้เห็นภาพรวมก่อน
    });
  }, [projectId]);

  async function fetchLevel2Single(level1Id) {
    setLevel2Loading(true);
    try {
      const res = await client.get('/wbs-level2', { params: { level1_id: level1Id } });
      setLevel2Group(res.data.group);
      setLevel2Items(res.data.items);
      setLevel2Totals(res.data.totals);
      setLevel2Complete(res.data.is_complete);
      setLevel2Error('');
    } catch (err) {
      setLevel2Error('ดึงข้อมูลไม่สำเร็จ');
    } finally {
      setLevel2Loading(false);
    }
  }

  async function fetchLevel2All(pid) {
    setLevel2Loading(true);
    try {
      const res = await client.get('/wbs-level2/by-project', { params: { project_id: pid } });
      setAllGroupsData(res.data);
      setLevel2Error('');
    } catch (err) {
      setLevel2Error('ดึงข้อมูลไม่สำเร็จ');
    } finally {
      setLevel2Loading(false);
    }
  }

  function refetchLevel2() {
    if (selectedLevel1Id === ALL_VALUE) fetchLevel2All(projectId);
    else fetchLevel2Single(selectedLevel1Id);
  }

  useEffect(() => {
    if (!selectedLevel1Id) return;
    if (selectedLevel1Id === ALL_VALUE) fetchLevel2All(projectId);
    else fetchLevel2Single(selectedLevel1Id);
  }, [selectedLevel1Id]);

  function openCreateModal() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEditModal(item) {
    setEditingItem(item);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    fetchGroupData(projectId);
  }

  async function handleDelete(item) {
    if (!window.confirm(`ยืนยันลบ "${item.name}" ?`)) return;
    try {
      await client.delete(`/wbs-level1/${item.id}`);
      fetchGroupData(projectId);
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  // เปิด modal เพิ่ม/แก้ไข รายการงาน โดยรองรับทั้งมุมมองกลุ่มเดียวและมุมมองทั้งหมด
  function openLevel2Create() {
    if (selectedLevel1Id === ALL_VALUE) return; // ต้องเลือกกลุ่มเจาะจงก่อนถึงเพิ่มได้
    setLevel2EditingItem(null);
    setLevel2EditingContext({
      level1Id: selectedLevel1Id,
      items: level2Items,
      groupCode: level2Group?.code,
      groupRemainingAmount: level2Group?.remaining_amount || 0,
    });
    setLevel2ModalOpen(true);
  }

  function openLevel2Edit(item, groupCtx) {
    setLevel2EditingItem(item);
    setLevel2EditingContext(groupCtx);
    setLevel2ModalOpen(true);
  }

  function handleLevel2Saved() {
    setLevel2ModalOpen(false);
    refetchLevel2();
  }

  async function handleLevel2Delete(item) {
    if (!window.confirm(`ยืนยันลบ "${item.name}" ?`)) return;
    try {
      await client.delete(`/wbs-level2/${item.id}`);
      refetchLevel2();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  // ----- Tab 3: กิจกรรมงาน -----
  // dropdown 1 (กลุ่มงาน) เปลี่ยน -> โหลด dropdown 2 (รายการงาน)
  // ถ้าเลือก "-ทั้งหมด-" ให้ดึงรายการงานของ "ทุกกลุ่มงาน" มารวมเป็น list เดียว (ใช้ endpoint by-project
  // ตัวเดียวกับที่ Tab รายการงานใช้ทำ "-ทั้งหมด-" อยู่แล้ว) พร้อมติด code ของกลุ่มงานไว้ให้แยกแยะได้
  // ทั้ง 2 dropdown default เป็น "-ทั้งหมด-" เสมอ (ตามที่ตกลง) — และมี .catch() ทุกจุด กัน promise
  // ที่พังเงียบๆ ไม่มีการจัดการ error ทำให้ state ค้าง/แอปพังทั้งหน้าโดยไม่มี error message ให้เห็น
  useEffect(() => {
    if (!activityGroupId) {
      setActivityLevel2List([]);
      setActivityLevel2Id('');
      return;
    }
    if (activityGroupId === ALL_VALUE) {
      client.get('/wbs-level2/by-project', { params: { project_id: projectId } })
        .then((res) => {
          const flat = (res.data.groups || []).flatMap((g) => g.items.map((it) => ({ ...it, level1_code: g.level1.code })));
          setActivityLevel2List(flat);
          setActivityLevel2Id(ALL_VALUE);
        })
        .catch((err) => {
          console.error(err);
          setActivityLevel2List([]);
          setActivityLevel2Id('');
          setLevel3Error('ดึงข้อมูลรายการงานไม่สำเร็จ');
        });
      return;
    }
    client.get('/wbs-level2', { params: { level1_id: activityGroupId } })
      .then((res) => {
        setActivityLevel2List(res.data.items);
        setActivityLevel2Id(ALL_VALUE);
      })
      .catch((err) => {
        console.error(err);
        setActivityLevel2List([]);
        setActivityLevel2Id('');
        setLevel3Error('ดึงข้อมูลรายการงานไม่สำเร็จ');
      });
  }, [activityGroupId]);

  // ตั้งค่ากลุ่มงานเป็น "-ทั้งหมด-" อัตโนมัติเมื่อโหลด level1List เสร็จ (เปิด Tab นี้มาให้เห็นภาพรวมทันที)
  useEffect(() => {
    if (level1List.length > 0 && !activityGroupId) {
      setActivityGroupId(ALL_VALUE);
    }
  }, [level1List]);

  async function fetchLevel3Data(level2Id) {
    if (!level2Id) {
      setLevel3Item2Info(null);
      setLevel3Items([]);
      setLevel3Totals(null);
      return;
    }
    setLevel3Loading(true);
    try {
      if (level2Id === ALL_VALUE) {
        // "-ทั้งหมด-" ของรายการงาน: ดึงกิจกรรมงานของ "ทุกรายการงาน" ที่อยู่ใน activityLevel2List ตอนนี้
        // (ขอบเขตตามที่ filter กลุ่มงานเลือกไว้อยู่แล้ว — ถ้ากลุ่มงานก็เป็น "ทั้งหมด" ด้วย จะได้ทุกกิจกรรมงาน
        // ทั้งโปรเจกต์) มารวมเป็นตารางเดียว — ไม่มีแถวรวม/is_complete เพราะ %Share ของแต่ละรายการงานอิงฐาน
        // (มูลค่ารายการงานพ่อ) คนละค่ากัน รวมกันแล้วไม่มีความหมาย
        const results = await Promise.all(
          activityLevel2List.map((it) =>
            client.get('/wbs-level3', { params: { level2_id: it.id } }).then((res) => ({ it, res }))
          )
        );
        const merged = results.flatMap(({ it, res }) =>
          (res.data.items || []).map((row) => ({ ...row, level2_code: it.code, level2_name: it.name }))
        );
        setLevel3Item2Info(null);
        setLevel3Items(merged);
        setLevel3Totals(null);
        setLevel3Complete(false);
        setLevel3Error('');
        return;
      }
      const res = await client.get('/wbs-level3', { params: { level2_id: level2Id } });
      setLevel3Item2Info(res.data.item2);
      setLevel3Items(res.data.items);
      setLevel3Totals(res.data.totals);
      setLevel3Complete(res.data.is_complete);
      setLevel3Error('');
    } catch (err) {
      setLevel3Error('ดึงข้อมูลไม่สำเร็จ');
    } finally {
      setLevel3Loading(false);
    }
  }

  useEffect(() => { fetchLevel3Data(activityLevel2Id); }, [activityLevel2Id]);

  function openLevel3Create() {
    setLevel3EditingItem(null);
    setLevel3ModalOpen(true);
  }

  function openLevel3Edit(item) {
    setLevel3EditingItem(item);
    setLevel3ModalOpen(true);
  }

  function handleLevel3Saved() {
    setLevel3ModalOpen(false);
    fetchLevel3Data(activityLevel2Id);
  }

  async function handleLevel3Delete(item) {
    if (!window.confirm(`ยืนยันลบ "${item.name}" ?`)) return;
    try {
      await client.delete(`/wbs-level3/${item.id}`);
      fetchLevel3Data(activityLevel2Id);
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  function renderLevel2Table(groupItems, groupTotals, isComplete, groupCtx) {
    return (
      <>
        <div className="table-scroll">
          <table className="group-table">
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่องาน</th>
                <th>มูลค่า</th>
                <th>%Share</th>
                <th>%Weight</th>
                <th>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {groupItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="group-table__empty">ยังไม่มีรายการงาน</td>
                </tr>
              )}
              {groupItems.map((item) => (
                <tr key={item.id} onClick={() => openLevel2Edit(item, groupCtx)}>
                  <td className="mono">{item.code}</td>
                  <td>{item.name}</td>
                  <td className="mono">{formatMoney(item.amount)}</td>
                  <td className="mono">{Number(item.share_percent).toFixed(2)}%</td>
                  <td className="mono">{Number(item.weight_percent).toFixed(2)}%</td>
                  <td className="group-table__actions">
                    <div className="group-table__actions-inner">
                      <button className="link-btn" onClick={(e) => { e.stopPropagation(); openLevel2Edit(item, groupCtx); }}>แก้ไข</button>
                      <button className="link-btn link-btn--danger" onClick={(e) => { e.stopPropagation(); handleLevel2Delete(item); }}>ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {groupTotals && groupItems.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ textAlign: 'center' }}>รวม</td>
                  <td style={{ textAlign: 'center' }}></td>
                  <td className="mono" style={{ textAlign: 'center' }}>{formatMoney(groupTotals.amount)}</td>
                  <td className="mono" style={{ textAlign: 'center', color: isComplete ? 'var(--steel)' : 'var(--danger)' }}>
                    {groupTotals.share_percent.toFixed(2)}%
                  </td>
                  <td className="mono" style={{ textAlign: 'center' }}>
                    {groupItems.reduce((s, i) => s + i.weight_percent, 0).toFixed(2)}%
                  </td>
                  <td style={{ textAlign: 'center' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {groupItems.length > 0 && (
          <p className={`pdata-status ${isComplete ? 'pdata-status--ok' : 'pdata-status--warn'}`}>
            {isComplete
              ? '✓ แตกครบ 100% แล้ว'
              : `⚠ ยังไม่ครบ 100% (ตอนนี้ ${groupTotals.share_percent.toFixed(2)}% — ${groupTotals.share_percent < 100 ? 'ขาดอีก' : 'เกินไป'} ${Math.abs(100 - groupTotals.share_percent).toFixed(2)}%)`}
          </p>
        )}
      </>
    );
  }

  return (
    <Layout title="สร้างข้อมูลโครงการ">
      <div className="pdata-toolbar">
        <div className="pdata-toolbar__filter">
          <span>เลือกโครงการ</span>
          <select
            value={projectId}
            onChange={(e) => {
              if (!confirmLeaveGanttIfDirty()) return;
              setProjectId(e.target.value);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_code} - {p.name}</option>
            ))}
          </select>
        </div>
        {projectInfo && (
          <div className="pdata-toolbar__budget">
            <span>มูลค่า</span>
            <span className="mono">{formatMoney(projectInfo.budget_total)}</span>
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
              onClick={() => {
                if (!confirmLeaveGanttIfDirty()) return;
                setActiveTab(t.key);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ===== Tab 3: กิจกรรมงาน ===== */}
      {activeTab === 'activity' && (
        <>
          <div className="pdata-toolbar" style={{ marginTop: 0 }}>
            <div className="pdata-toolbar__filters-group">
              <div className="pdata-toolbar__filter">
                <span>กลุ่มงาน</span>
                <select value={activityGroupId} onChange={(e) => setActivityGroupId(e.target.value)}>
                  <option value={ALL_VALUE}>-ทั้งหมด-</option>
                  {level1List.map((g) => (
                    <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
                  ))}
                </select>
              </div>
              <div className="pdata-toolbar__filter">
                <span>รายการงาน</span>
                <select value={activityLevel2Id} onChange={(e) => setActivityLevel2Id(e.target.value)}>
                  {activityLevel2List.length === 0 && <option value="">ยังไม่มีรายการงาน</option>}
                  {activityLevel2List.length > 0 && <option value={ALL_VALUE}>-ทั้งหมด-</option>}
                  {activityLevel2List.map((it) => (
                    <option key={it.id} value={it.id}>
                      {activityGroupId === ALL_VALUE ? `${it.level1_code} / ${it.code} - ${it.name}` : `${it.code} - ${it.name}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {activityLevel2Id && activityLevel2Id !== ALL_VALUE && (
              <button className="btn-primary btn-primary--sm" onClick={openLevel3Create}>+ เพิ่ม</button>
            )}
          </div>

          {level1List.length === 0 && (
            <div className="pdata-placeholder">ยังไม่มีกลุ่มงานหลัก — ไปสร้างที่ Tab "กลุ่มงานหลัก" ก่อน</div>
          )}
          {level1List.length > 0 && !activityLevel2Id && (
            <div className="pdata-placeholder">ยังไม่มีรายการงานในกลุ่มนี้ — ไปสร้างที่ Tab "รายการงาน" ก่อน</div>
          )}

          {level3Loading && <p>กำลังโหลดข้อมูล...</p>}
          {level3Error && <p className="dash__error">{level3Error}</p>}

          {activityLevel2Id && !level3Loading && !level3Error && (
            <>
              <div className="table-scroll">
                <table className="group-table">
                  <colgroup>
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>รหัส</th>
                      <th>ชื่อกิจกรรมงาน</th>
                      <th>มูลค่า</th>
                      <th>%Share</th>
                      <th>%Weight</th>
                      <th>จำนวนวัน</th>
                      <th>วันที่เริ่ม</th>
                      <th>วันที่เสร็จ</th>
                      <th>% ต่อวัน</th>
                      <th>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {level3Items.length === 0 && (
                      <tr>
                        <td colSpan={10} className="group-table__empty">
                          ยังไม่มีกิจกรรมงาน — กด "+ เพิ่ม" เพื่อเริ่มต้น
                        </td>
                      </tr>
                    )}
                    {level3Items.map((item) => (
                      <tr key={item.id} onClick={() => openLevel3Edit(item)}>
                        <td className="mono">{item.code}</td>
                        <td>
                          {item.name}
                          {activityLevel2Id === ALL_VALUE && (
                            <span style={{ display: 'block', fontSize: '10px', color: 'var(--ink-soft)' }}>
                              {item.level2_code} - {item.level2_name}
                            </span>
                          )}
                        </td>
                        <td className="mono">{formatMoney(item.amount)}</td>
                        <td className="mono">{Number(item.share_percent).toFixed(2)}%</td>
                        <td className="mono">{Number(item.weight_percent).toFixed(2)}%</td>
                        <td className="mono">{item.duration_days ?? '-'}</td>
                        <td className="mono">{formatDMY(item.start_date)}</td>
                        <td className="mono">{formatDMY(item.end_date)}</td>
                        <td className="mono">{Number(item.percent_per_day).toFixed(3)}%</td>
                        <td className="group-table__actions">
                          <div className="group-table__actions-inner">
                            <button className="link-btn" onClick={(e) => { e.stopPropagation(); openLevel3Edit(item); }}>แก้ไข</button>
                            <button className="link-btn link-btn--danger" onClick={(e) => { e.stopPropagation(); handleLevel3Delete(item); }}>ลบ</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {level3Totals && level3Items.length > 0 && (
                    <tfoot>
                      <tr>
                        <td style={{ textAlign: 'center' }}>รวม</td>
                        <td style={{ textAlign: 'center' }}></td>
                        <td className="mono" style={{ textAlign: 'center' }}>{formatMoney(level3Totals.amount)}</td>
                        <td className="mono" style={{ textAlign: 'center', color: level3Complete ? 'var(--steel)' : 'var(--danger)' }}>
                          {level3Totals.share_percent.toFixed(2)}%
                        </td>
                        <td className="mono" style={{ textAlign: 'center' }}>{level3Totals.weight_percent.toFixed(2)}%</td>
                        <td style={{ textAlign: 'center' }}></td>
                        <td style={{ textAlign: 'center' }}></td>
                        <td style={{ textAlign: 'center' }}></td>
                        <td style={{ textAlign: 'center' }}></td>
                        <td style={{ textAlign: 'center' }}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {level3Items.length > 0 && level3Totals && (
                <p className={`pdata-status ${level3Complete ? 'pdata-status--ok' : 'pdata-status--warn'}`}>
                  {level3Complete
                    ? '✓ แตกครบ 100% แล้ว'
                    : `⚠ ยังไม่ครบ 100% (ตอนนี้ ${level3Totals.share_percent.toFixed(2)}% — ${level3Totals.share_percent < 100 ? 'ขาดอีก' : 'เกินไป'} ${Math.abs(100 - level3Totals.share_percent).toFixed(2)}%)`}
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* ===== Tab 1: กลุ่มงานหลัก ===== */}
      {activeTab === 'group' && (
        <>
          <div className="pdata-actions">
            <button className="btn-primary btn-primary--sm" onClick={openCreateModal} disabled={!projectId}>
              + เพิ่ม
            </button>
          </div>

          {loading && <p>กำลังโหลดข้อมูล...</p>}
          {error && <p className="dash__error">{error}</p>}

          {!loading && !error && (
            <div className="table-scroll">
              <table className="group-table">
                <colgroup>
                  <col style={{ width: '11.90%' }} />
                  <col style={{ width: '23.81%' }} />
                  <col style={{ width: '14.29%' }} />
                  <col style={{ width: '10.71%' }} />
                  <col style={{ width: '14.29%' }} />
                  <col style={{ width: '10.71%' }} />
                  <col style={{ width: '14.29%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>ชื่อกลุ่ม</th>
                    <th>มูลค่า</th>
                    <th>% หัก</th>
                    <th>มูลค่าเหลือ</th>
                    <th>%Weight</th>
                    <th>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="group-table__empty">
                        ยังไม่มีกลุ่มงานหลัก — กด "+ เพิ่ม" เพื่อเริ่มต้น
                      </td>
                    </tr>
                  )}
                  {items.map((item) => (
                    <tr key={item.id} onClick={() => openEditModal(item)}>
                      <td className="mono">{item.code}</td>
                      <td>{item.name}{item.is_final_group && <span className="final-badge">สุดท้าย</span>}</td>
                      <td className="mono">{item.is_final_group ? '0.00' : formatMoney(item.amount)}</td>
                      <td className="mono">{Number(item.deduct_percent).toFixed(2)}%</td>
                      <td className="mono">{formatMoney(item.remaining_amount)}</td>
                      <td className="mono">{Number(item.weight_percent).toFixed(2)}%</td>
                      <td className="group-table__actions">
                        <div className="group-table__actions-inner">
                          <button className="link-btn" onClick={(e) => { e.stopPropagation(); openEditModal(item); }}>แก้ไข</button>
                          <button className="link-btn link-btn--danger" onClick={(e) => { e.stopPropagation(); handleDelete(item); }}>ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && items.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center' }}>รวม</td>
                      <td className="mono" style={{ textAlign: 'center' }}>{formatMoney(totals.amount)}</td>
                      <td style={{ textAlign: 'center' }}></td>
                      <td className="mono" style={{ textAlign: 'center' }}>{formatMoney(totals.remaining_amount)}</td>
                      <td className="mono" style={{ textAlign: 'center' }}>{totals.weight_percent.toFixed(2)}%</td>
                      <td style={{ textAlign: 'center' }}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== Tab 2: รายการงาน ===== */}
      {activeTab === 'item' && (
        <>
          <div className="pdata-toolbar" style={{ marginTop: 0 }}>
            <div className="pdata-toolbar__filter">
              <span>กลุ่มงาน</span>
              <select value={selectedLevel1Id} onChange={(e) => setSelectedLevel1Id(e.target.value)}>
                <option value={ALL_VALUE}>-ทั้งหมด-</option>
                {level1List.map((g) => (
                  <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
                ))}
              </select>
            </div>
            {selectedLevel1Id !== ALL_VALUE && level2Group && (
              <>
                <div className="pdata-toolbar__budget">
                  <span>Weight</span>
                  <span className="mono">{Number(level2Group.weight_percent).toFixed(2)}%</span>
                </div>
                <div className="pdata-toolbar__budget">
                  <span>มูลค่า</span>
                  <span className="mono">{formatMoney(level2Group.remaining_amount)}</span>
                </div>
              </>
            )}
            {selectedLevel1Id !== ALL_VALUE && (
              <button className="btn-primary btn-primary--sm" onClick={openLevel2Create}>+ เพิ่ม</button>
            )}
          </div>

          {level1List.length === 0 && (
            <div className="pdata-placeholder">ยังไม่มีกลุ่มงานหลัก — ไปสร้างที่ Tab "กลุ่มงานหลัก" ก่อน</div>
          )}

          {level2Loading && <p>กำลังโหลดข้อมูล...</p>}
          {level2Error && <p className="dash__error">{level2Error}</p>}

          {/* ===== มุมมองกลุ่มเดียว ===== */}
          {level1List.length > 0 && selectedLevel1Id !== ALL_VALUE && !level2Loading && !level2Error && (
            renderLevel2Table(level2Items, level2Totals, level2Complete, {
              level1Id: selectedLevel1Id,
              items: level2Items,
              groupCode: level2Group?.code,
              groupRemainingAmount: level2Group?.remaining_amount || 0,
            })
          )}

          {/* ===== มุมมองทั้งหมด (ทุกกลุ่มเรียงตามรหัส) ===== */}
          {level1List.length > 0 && selectedLevel1Id === ALL_VALUE && !level2Loading && !level2Error && allGroupsData && (
            <>
              <p className={`pdata-status ${allGroupsData.overall.is_fully_complete ? 'pdata-status--ok' : 'pdata-status--warn'}`}>
                {allGroupsData.overall.is_fully_complete
                  ? `✓ ทุกกลุ่มแตกครบ 100% แล้ว — รวมมูลค่า ${formatMoney(allGroupsData.overall.total_level2_amount)} บาท ตรงกับมูลค่าเหลือรวมของกลุ่มงานหลัก (Tab 1)`
                  : `⚠ ยังมีกลุ่มที่แตกไม่ครบ 100% — มูลค่าที่แตกแล้วรวม ${formatMoney(allGroupsData.overall.total_level2_amount)} บาท จากมูลค่าเหลือรวม ${formatMoney(allGroupsData.overall.total_level1_remaining)} บาท (ต่างกัน ${formatMoney(Math.abs(allGroupsData.overall.total_level1_remaining - allGroupsData.overall.total_level2_amount))} บาท)`}
              </p>

              {allGroupsData.groups.map((g) => (
                <div key={g.level1.id} className="pdata-group-block">
                  <div className="pdata-group-block__header">
                    <span className="mono">{g.level1.code}</span>
                    <span>{g.level1.name}</span>
                    <span className={`pdata-group-block__badge ${g.is_complete ? 'pdata-group-block__badge--ok' : 'pdata-group-block__badge--warn'}`}>
                      {g.is_complete ? 'ครบ 100%' : `${g.totals.share_percent.toFixed(2)}%`}
                    </span>
                  </div>
                  {renderLevel2Table(g.items, g.totals, g.is_complete, {
                    level1Id: g.level1.id,
                    items: g.items,
                    groupCode: g.level1.code,
                    groupRemainingAmount: g.level1.remaining_amount,
                  })}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ===== Tab 4: Gantt (ภาพรวม) — ดูอย่างเดียวโดยดีฟอลต์ ต้องกด "แก้ไขข้อมูล" ก่อนถึงจะแก้วันที่ได้ ===== */}
      {activeTab === 'gantt' && (
        <GanttView projectId={projectId} onDirtyChange={setGanttDirty} />
      )}

      {modalOpen && (
        <WbsLevel1Modal
          projectId={projectId}
          item={editingItem}
          items={items}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {level2ModalOpen && level2EditingContext && (
        <WbsLevel2Modal
          level1Id={level2EditingContext.level1Id}
          item={level2EditingItem}
          items={level2EditingContext.items}
          groupCode={level2EditingContext.groupCode}
          groupRemainingAmount={level2EditingContext.groupRemainingAmount}
          onClose={() => setLevel2ModalOpen(false)}
          onSaved={handleLevel2Saved}
        />
      )}

      {level3ModalOpen && (
        <WbsLevel3Modal
          level2Id={activityLevel2Id === ALL_VALUE ? (level3EditingItem?.level2_id || '') : activityLevel2Id}
          item={level3EditingItem}
          items={level3Items}
          groupCode={level3Item2Info?.code}
          groupAmount={level3Item2Info?.amount || 0}
          onClose={() => setLevel3ModalOpen(false)}
          onSaved={handleLevel3Saved}
        />
      )}
    </Layout>
  );
}
