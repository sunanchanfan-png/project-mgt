// src/pages/OpenProject/OpenProject.jsx — เมนู "เปิดโครงการ"
import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import ProjectModal from './ProjectModal';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './OpenProject.css';

// กำหนดคอลัมน์และสัดส่วนความกว้าง (%w) ตามสเปคที่กำหนด รวมกัน = 100%
const COLUMNS = [
  { key: 'project_code', label: 'รหัส', width: 7.38 },
  { key: 'name', label: 'ชื่อโครงการ', width: 21.31 },
  { key: 'client_name', label: 'ชื่อผู้ว่าจ้าง', width: 18.85 },
  { key: 'contract_number', label: 'เลขที่สัญญา', width: 8.20 },
  { key: 'budget_total', label: 'มูลค่างาน', width: 8.20 },
  { key: 'duration_days', label: 'ระยะเวลา (วัน)', width: 6.97 },
  { key: 'contract_start', label: 'สัญญาเริ่มต้น', width: 6.97 },
  { key: 'contract_end', label: 'สัญญาสิ้นสุด', width: 6.97 },
  { key: 'status', label: 'สถานะ', width: 6.97 },
  { key: 'actions', label: 'การจัดการ', width: 8.20 },
];

function formatMoney(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: '2-digit', month: '2-digit', day: '2-digit' });
}

export default function Dashboard() {
  const { canAccessMenu } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null); // null = โหมดเพิ่มใหม่

  async function fetchProjects(year) {
    setLoading(true);
    try {
      const res = await client.get('/projects', { params: year ? { year } : {} });
      setProjects(res.data.projects);
      setError('');
    } catch (err) {
      setError('ดึงข้อมูลโปรเจกต์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProjects(); }, []);

  // สร้างตัวเลือกปีจากรหัสโครงการที่มีอยู่จริง (SK-YYNN -> YY) ไม่ซ้ำกัน
  const yearOptions = useMemo(() => {
    const years = new Set(
      projects
        .map((p) => p.project_code?.match(/^SK-(\d{2})/)?.[1])
        .filter(Boolean)
    );
    const currentYY = String((new Date().getFullYear() + 543)).slice(-2);
    years.add(currentYY);
    return Array.from(years).sort().reverse();
  }, [projects]);

  function handleYearChange(e) {
    const y = e.target.value;
    setYearFilter(y);
    fetchProjects(y || undefined);
  }

  function openCreateModal() {
    setEditingProject(null);
    setModalOpen(true);
  }

  function openEditModal(project) {
    setEditingProject(project);
    setModalOpen(true);
  }

  // บันทึกสำเร็จ: ปิด popup อัตโนมัติ และ update แค่แถวที่เปลี่ยน (ไม่ reload ทั้งหน้า)
  function handleSaved(saved) {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    setModalOpen(false);
  }

  async function handleCancelProject(project) {
    if (!window.confirm(`ยืนยันลบ/ยกเลิกโครงการ "${project.name}" ?\n\n(ถ้ายังไม่มีข้อมูลผูกกับเมนูอื่น จะลบถาวร ถ้ามีแล้วจะเปลี่ยนเป็น Closed แทน)`)) return;
    try {
      const res = await client.delete(`/projects/${project.id}`);
      if (res.data.mode === 'deleted') {
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
      } else {
        // mode === 'closed' - อัปเดตแค่แถวนั้น ไม่ลบออกจากตาราง
        handleSaved(res.data.project);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'ดำเนินการไม่สำเร็จ');
    }
  }

  if (!canAccessMenu('open_project')) {
    return (
      <Layout title="รายชื่อโครงการ">
        <p className="dash__error">คุณไม่มีสิทธิ์เข้าถึงเมนูนี้ กรุณาติดต่อผู้ดูแลระบบ</p>
      </Layout>
    );
  }

  return (
    <Layout title="รายชื่อโครงการ">
      <div className="proj-toolbar">
        <div className="proj-toolbar__filter">
          <span>เลือกดู</span>
          <select value={yearFilter} onChange={handleYearChange}>
            <option value="">ทั้งหมด</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>พ.ศ. 25{y}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary btn-primary--sm" onClick={openCreateModal}>
          + เพิ่มโครงการ
        </button>
      </div>

      {loading && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="dash__error">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="proj-table">
            <colgroup>
              {COLUMNS.map((c) => (
                <col key={c.key} style={{ width: `${c.width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="proj-table__empty">
                    ยังไม่มีโครงการในระบบ — กด "+ เพิ่มโครงการ" เพื่อเริ่มต้น
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.id} onClick={() => openEditModal(p)}>
                  <td className="mono">{p.project_code}</td>
                  <td>{p.name}</td>
                  <td>{p.client_name || '-'}</td>
                  <td className="mono">{p.contract_number || '-'}</td>
                  <td className="mono">{formatMoney(p.budget_total)}</td>
                  <td className="mono">{p.duration_days ?? '-'}</td>
                  <td className="mono">{formatDate(p.contract_start)}</td>
                  <td className="mono">{formatDate(p.contract_end)}</td>
                  <td>
                    <span className={`status-pill status-pill--${p.status}`}>
                      {p.status === 'on' ? 'On' : 'Closed'}
                    </span>
                  </td>
                  <td className="proj-table__actions">
                    <div className="proj-table__actions-inner">
                      <button className="link-btn" onClick={(e) => { e.stopPropagation(); openEditModal(p); }}>แก้ไข</button>
                      <button className="link-btn link-btn--danger" onClick={(e) => { e.stopPropagation(); handleCancelProject(p); }}>ยกเลิก</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProjectModal
          project={editingProject}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  );
}
