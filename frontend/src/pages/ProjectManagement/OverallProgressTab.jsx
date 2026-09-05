// src/pages/ProjectManagement/OverallProgressTab.jsx
// Tab 3 "ตารางงานรวม" — แสดงความคืบหน้าทั้งโปรเจกต์ (ไม่กรองตามสัปดาห์) filter ตามกลุ่มงานได้ + พิมพ์ได้
// ใช้ format/logic เดียวกับ Tab งานสัปดาห์นี้-หน้าทุกอย่าง (แก้ไข/บันทึก/ลบแบบเดียวกัน) ต่างแค่:
//   - ไม่กรองตามช่วงวันที่ (โชว์ทุกกิจกรรมงานเสมอ รวมที่เสร็จ 100% แล้วด้วย)
//   - "ก่อนหน้า" = ค่า ณ เมื่อวาน, "ปัจจุบัน" = ส่วนที่เพิ่มขึ้น "วันนี้" (ไม่ใช่ตามสัปดาห์)
//   - คอลัมน์ "รูปถ่าย" ถูกแทนที่ด้วย "สถานะ" (เทียบแผน-ผลงานจริง)
// แก้ไขที่นี่ยิงเข้า /progress/entries เอนด์พอยต์เดียวกับ Tab 1/2 เป๊ะ จึงสะท้อนกลับไปที่ Tab 1/2
// อัตโนมัติเสมอ (ข้อมูลชุดเดียวกัน ไม่มีการ sync แยกต่างหาก)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { buildPrintTableHTML } from './printUtils';

const ALL_VALUE = 'all';

// แปลง YYYY-MM-DD เป็น dd/mm/yyyy (ปี ค.ศ. ตรงๆ) — ใช้แบบเดียวกับ Tab งานสัปดาห์นี้/หน้า
function fmtDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  return `${Number(v).toFixed(1)}%`;
}

function statusClass(status) {
  if (status === 'เร็วกว่าแผน') return 'progress-status--ahead';
  if (status === 'ช้ากว่าแผน') return 'progress-status--behind';
  if (status === 'ตามแผน') return 'progress-status--ontrack';
  return '';
}

// CSS ของตารางพิมพ์ แบบสมบูรณ์ในตัวเอง (ใช้เทคนิคเดียวกับที่ทำไว้ใน Gantt: เปิดหน้าต่างใหม่แยกต่างหาก
// พร้อม <table><thead> จริง เพื่อให้หัวตารางซ้ำทุกหน้าพิมพ์ได้เสถียร — ดูรายละเอียดเหตุผลใน GanttView.jsx)
const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', system-ui, sans-serif; margin: 16px; color: #12202E; }
  h2 { font-size: 16px; margin: 0 0 4px 0; }
  p.p-sub { font-size: 12px; color: #4B5D6B; margin: 0 0 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
  th, td { border: 1px solid #C7CDD1; padding: 3px 6px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  thead { display: table-header-group; }
  thead th { background: #EDEFF0; font-weight: 700; }
  tbody tr { page-break-inside: avoid; }
  .p-label-col { text-align: left; }
  .p-l1 td { font-weight: 700; background: #EDEFF0; }
  .p-l2 td { font-weight: 600; }
  .p-l3 td { color: #4B5D6B; }
  .p-l2 .p-label-col { padding-left: 14px; }
  .p-l3 .p-label-col { padding-left: 28px; }
`;

export default function OverallProgressTab({ projectId, level1List, projectLabel, contractStart }) {
  const [level1Filter, setLevel1Filter] = useState(ALL_VALUE);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingId, setSavingId] = useState(null);

  function fetchData() {
    if (!projectId) return;
    setLoading(true);
    const params = { project_id: projectId };
    if (level1Filter !== ALL_VALUE) params.level1_id = level1Filter;
    client.get('/progress/overall', { params })
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError('ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [projectId, level1Filter]);

  // % ที่ทำได้ "วันนี้" (ไม่รวมของเมื่อวาน) — คำนวณจากข้อมูลจริงเสมอ (actual - ก่อนหน้า) เหมือน Tab 1/2
  function todayIncrement(act) {
    return Math.max(0, (act.actual_percent || 0) - (act.previous_percent || 0));
  }

  function startEdit(act) {
    setEditingId(act.id);
    setEditValues((prev) => ({ ...prev, [act.id]: todayIncrement(act).toString() }));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveRow(act) {
    const inc = parseFloat(editValues[act.id]);
    if (isNaN(inc) || inc < 0) {
      alert('กรุณากรอก % ที่ทำได้ (0 ขึ้นไป)');
      return;
    }
    const newTotal = Math.min(100, act.previous_percent + inc);
    setSavingId(act.id);
    try {
      // ไม่ส่ง entry_date จาก client เอง — ให้ backend คำนวณ "วันนี้" จากนาฬิกาเซิร์ฟเวอร์เองเสมอ
      // (แหล่งเดียว รับประกันว่าตรงกับที่ backend ใช้ query เทียบทุกที่ กันปัญหานาฬิกาเครื่อง client
      // ไม่ตรงกับเซิร์ฟเวอร์ ทำให้ query "ณ วันนี้" หา entry ที่เพิ่งบันทึกไม่เจอ)
      await client.post('/progress/entries', {
        wbs_level3_id: act.id,
        actual_percent: newTotal,
        photo_urls: [],
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteLatest(act) {
    if (!window.confirm(`ยืนยันลบข้อมูลความคืบหน้าล่าสุดของ "${act.name}" ?`)) return;
    setSavingId(act.id);
    try {
      await client.delete('/progress/entries/latest', { params: { wbs_level3_id: act.id } });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    } finally {
      setSavingId(null);
    }
  }

  function handlePrint() {
    // Tab3 มี 9 คอลัมน์: โครงสร้างงาน(0) %W(1) แผน(2) ก่อนหน้า(3) ปัจจุบัน(4) รวมผลงาน(5) คงเหลือ(6)
    // สถานะ(7) การจัดการ(8) — ตัดคอลัมน์ "การจัดการ" (มีแต่ปุ่มแก้ไข/ลบ ไม่มีประโยชน์บนกระดาษ) ออก
    // แล้วเอาความกว้างไปเพิ่มให้คอลัมน์แรกแทน ตามที่ตกลง
    const printHtml = buildPrintTableHTML('.progress-overall-table', [8]);
    if (!printHtml) return;
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('เบราว์เซอร์บล็อกการเปิดหน้าต่างพิมพ์ กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้แล้วลองใหม่');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="th">
<head><meta charset="utf-8" /><title>รายงานความคืบหน้ารวมทั้งโครงการ</title><style>${PRINT_CSS}</style></head>
<body>
  <h2>รายงานความคืบหน้ารวมทั้งโครงการ</h2>
  <p class="p-sub">ช่วงวันที่ ${fmtDMY(contractStart)} - ${fmtDMY(data?.as_of)}</p>
  ${printHtml}
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    let printed = false;
    function triggerOnce() { if (printed) return; printed = true; printWindow.print(); }
    printWindow.onload = triggerOnce;
    setTimeout(triggerOnce, 300);
    printWindow.addEventListener('afterprint', () => printWindow.close());
  }

  return (
    <div className="progress-table-wrap">
      <div className="pdata-toolbar" style={{ marginTop: 0 }}>
        <div className="pdata-toolbar__filter">
          <span>เลือกกลุ่มงาน</span>
          <select value={level1Filter} onChange={(e) => setLevel1Filter(e.target.value)}>
            <option value={ALL_VALUE}>-ทั้งหมด-</option>
            {level1List.map((g) => (
              <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary btn-primary--sm" onClick={handlePrint}>🖨 Print</button>
      </div>

      {loading && !data && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}

      {data && (
        <div className="progress-table-scroll">
          <table className="progress-table progress-overall-table">
            {/* ความกว้างคอลัมน์เป็น % ตามที่กำหนด (280,100,120×7 รวม 1220px) ให้ตารางเต็มกรอบพอดี */}
            <colgroup>
              <col style={{ width: '22.95%' }} />
              <col style={{ width: '8.20%' }} />
              <col style={{ width: '9.84%' }} />
              <col style={{ width: '9.84%' }} />
              <col style={{ width: '9.84%' }} />
              <col style={{ width: '9.84%' }} />
              <col style={{ width: '9.84%' }} />
              <col style={{ width: '9.84%' }} />
              <col style={{ width: '9.84%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="progress-table__label-col p-label-col">โครงสร้างงาน</th>
                <th>%W</th>
                <th>แผน(สะสม)</th>
                <th>ก่อนหน้า</th>
                <th>ปัจจุบัน</th>
                <th>รวมผลงาน</th>
                <th>คงเหลือ</th>
                <th>สถานะ</th>
                <th>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.length === 0 && (
                <tr><td colSpan={9}>ไม่มีข้อมูล</td></tr>
              )}
              {data.groups.flatMap((g) => [
                <tr key={`g-${g.id}`} className="progress-table__row progress-table__row--l1 p-l1">
                  <td className="progress-table__label-col p-label-col">{g.code} {g.name}</td>
                  <td>{fmtPct(g.weight_percent)}</td>
                  <td>{fmtPct(g.plan_percent)}</td>
                  <td>{fmtPct(g.previous_percent)}</td>
                  <td></td>
                  <td>{fmtPct(g.actual_percent)}</td>
                  <td>{fmtPct(100 - g.actual_percent)}</td>
                  <td className={statusClass(g.status)}>{g.status || '-'}</td>
                  <td></td>
                </tr>,
                ...g.items.flatMap((it) => [
                  <tr key={`it-${it.id}`} className="progress-table__row progress-table__row--l2 p-l2">
                    <td className="progress-table__label-col p-label-col">{it.code} {it.name}</td>
                    <td>{fmtPct(it.weight_percent)}</td>
                    <td>{fmtPct(it.plan_percent)}</td>
                    <td>{fmtPct(it.previous_percent)}</td>
                    <td></td>
                    <td>{fmtPct(it.actual_percent)}</td>
                    <td>{fmtPct(100 - it.actual_percent)}</td>
                    <td className={statusClass(it.status)}>{it.status || '-'}</td>
                    <td></td>
                  </tr>,
                  ...it.activities.map((act) => {
                    const isEditing = editingId === act.id;
                    const savedIncrement = todayIncrement(act);
                    const typedInc = isEditing ? (parseFloat(editValues[act.id]) || 0) : savedIncrement;
                    const displayTotal = isEditing ? Math.min(100, act.previous_percent + typedInc) : act.actual_percent;
                    return (
                      <tr key={`act-${act.id}`} className="progress-table__row progress-table__row--l3 p-l3">
                        <td className="progress-table__label-col p-label-col">{act.code} {act.name}</td>
                        <td>{Math.round(act.share_percent)}%</td>
                        <td>{fmtPct(act.plan_percent)}</td>
                        <td>{fmtPct(act.previous_percent)}</td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              className="progress-table__input"
                              value={editValues[act.id] ?? ''}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [act.id]: e.target.value }))}
                              onFocus={(e) => {
                                // ถ้าค่าตอนนี้คือ 0 ให้เคลียร์ช่องว่างไว้เลย พิมพ์ตัวเลขใหม่ได้ทันที
                                // ไม่ต้องกดลบ 0 ทิ้งก่อน
                                if (e.target.value === '0') {
                                  setEditValues((prev) => ({ ...prev, [act.id]: '' }));
                                }
                                e.target.select();
                              }}
                              placeholder="0"
                              autoFocus
                            />
                          ) : fmtPct(savedIncrement)}
                        </td>
                        <td>{fmtPct(displayTotal)}</td>
                        <td>{fmtPct(100 - displayTotal)}</td>
                        <td className={statusClass(act.status)}>{act.status || '-'}</td>
                        <td>
                          {isEditing ? (
                            <div className="progress-table__action-group">
                              <button
                                type="button"
                                className="progress-table__link-btn"
                                onClick={() => saveRow(act)}
                                disabled={savingId === act.id}
                              >
                                {savingId === act.id ? '...' : 'บันทึก'}
                              </button>
                              <button type="button" className="progress-table__link-btn" onClick={cancelEdit}>
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <div className="progress-table__action-group">
                              <button type="button" className="progress-table__link-btn" onClick={() => startEdit(act)}>
                                แก้ไข
                              </button>
                              {savedIncrement > 0 && (
                                <button
                                  type="button"
                                  className="progress-table__link-btn progress-table__link-btn--danger"
                                  onClick={() => deleteLatest(act)}
                                  disabled={savingId === act.id}
                                >
                                  ลบ
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                ]),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
