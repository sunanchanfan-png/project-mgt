// src/pages/ProjectManagement/WeeklyProgressTab.jsx
// ใช้ร่วมกันสำหรับ Tab 1 "งานสัปดาห์นี้" (editable=true) และ Tab 2 "งานสัปดาห์หน้า" (editable=false)
// แสดงกิจกรรมงานที่ตกอยู่ในสัปดาห์นั้น (ช่วงวันที่ทับซ้อนกับสัปดาห์) พร้อมกรอก % ความคืบหน้าที่ทำได้
// "สัปดาห์นี้" ได้ (ปัจจุบัน = ส่วนที่เพิ่มขึ้นมาใหม่ ไม่ใช่ตัวสะสม) แล้วระบบจะรวมกับ "ก่อนหน้า" ให้เอง
import { useEffect, useState } from 'react';
import client from '../../api/client';
import { buildPrintTableHTML } from './printUtils';

// CSS ของตารางพิมพ์ แบบสมบูรณ์ในตัวเอง (เทคนิคเดียวกับ Tab ตารางงานรวม/Gantt — เปิดหน้าต่างใหม่แยก
// ต่างหากพร้อม <table><thead> จริง เพื่อให้หัวตารางซ้ำทุกหน้าพิมพ์ได้เสถียร)
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
  .progress-table__label-col { text-align: left; }
  .progress-table__row--l1 td { font-weight: 700; background: #EDEFF0; }
  .progress-table__row--l2 td { font-weight: 600; }
  .progress-table__row--l3 td { color: #4B5D6B; }
  .progress-table__row--l2 .progress-table__label-col { padding-left: 14px; }
  .progress-table__row--l3 .progress-table__label-col { padding-left: 28px; }
`;

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  return `${Number(v).toFixed(1)}%`;
}

// แปลง YYYY-MM-DD เป็น dd/mm/yyyy (ปี ค.ศ. ตรงๆ)
function fmtDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function WeeklyProgressTab({ projectId, week, editable }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // แถวไหนกำลังอยู่ในโหมดแก้ไขอยู่ (มีได้ทีละแถว) — null = ไม่มีแถวไหนกำลังแก้ไข
  const [editingId, setEditingId] = useState(null);
  // ค่าที่กำลังพิมพ์อยู่ตอนแก้ไข (key = activity id) — พอกดบันทึกสำเร็จแล้วจะออกจากโหมดแก้ไข
  // "ปัจจุบัน" ตอนไม่ได้แก้ไขจะไม่ใช้ค่านี้เลย แต่คำนวณจากข้อมูลจริงที่ดึงมา (actual - ก่อนหน้า) แทน
  // เพื่อให้ "ค้างตัวเลขไว้" ตามที่ขอ ไม่หายไปหลังบันทึก/รีเฟรชข้อมูล
  const [editValues, setEditValues] = useState({});
  const [editPhotos, setEditPhotos] = useState({});
  const [savingId, setSavingId] = useState(null);
  // เปิด popup ดูรูปที่แนบไว้แล้ว (ไม่ได้อยู่ในโหมดแก้ไข) — เก็บ activity object ของแถวที่กำลังดูอยู่
  const [viewingPhotosAct, setViewingPhotosAct] = useState(null);

  function fetchData() {
    if (!projectId) return;
    setLoading(true);
    client.get('/progress/weekly', { params: { project_id: projectId, week } })
      .then((res) => {
        setData(res.data);
        setError('');
      })
      .catch(() => setError('ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [projectId, week]);

  // % ที่ทำได้ใน "สัปดาห์นี้เอง" (ไม่รวมของก่อนหน้า) — คำนวณจากข้อมูลจริงเสมอ (actual - ก่อนหน้า)
  // ไม่ใช่ local state ที่หายไปตอน refresh — นี่คือสิ่งที่ทำให้ตัวเลขในช่อง "ปัจจุบัน" ค้างอยู่ถาวรตามที่ขอ
  function thisWeekIncrement(act) {
    return Math.max(0, (act.actual_percent || 0) - (act.previous_percent || 0));
  }

  function startEdit(act) {
    setEditingId(act.id);
    setEditValues((prev) => ({ ...prev, [act.id]: thisWeekIncrement(act).toString() }));
    // ถ้ายังไม่มีอะไรอยู่ใน editPhotos ของแถวนี้เลย (เช่น เพิ่งโหลดหน้าเว็บมาสดๆ แล้วกด "แก้ไข" ครั้งแรก)
    // ให้ดึงรูปที่เคยบันทึกไว้แล้วจริงจาก act.photos มาใส่ก่อน — ไม่งั้นจะมองไม่เห็นรูปเดิมเลย แล้วพอกด
    // "บันทึก" โดยไม่ได้แตะรูปอะไรเลย backend จะลบรูปเดิมทิ้งหมด (เพราะฝั่ง backend ทำงานแบบ "แทนที่รูป
    // ทั้งหมดด้วยชุดใหม่ที่ส่งมา" ไม่ใช่ append) ทำให้รูปที่เคยแนบไว้หายไปทั้งที่ผู้ใช้ไม่ได้ตั้งใจจะลบเลย
    setEditPhotos((prev) => {
      if (prev[act.id]) return prev; // มีอยู่แล้ว (จากการแก้ไขในเซสชันนี้ค้างไว้) ใช้ของเดิมต่อ ไม่ทับ
      const existing = (act.photos || []).map((p) => ({ tempId: `existing-${p.id}`, name: '', url: p.url, uploading: false }));
      return { ...prev, [act.id]: existing };
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  const MAX_PHOTOS = 6; // แนบรูปได้สูงสุด 6 รูปต่อการบันทึกความคืบหน้า 1 ครั้ง (ต่อกิจกรรมงาน 1 แถว)

  // อัปโหลดจริงขึ้น Cloudinary ทันทีที่เลือกไฟล์ (ไม่รอกดบันทึกแถว) — ใส่ placeholder "กำลังอัปโหลด..."
  // ไว้ก่อนให้เห็น feedback ทันที แล้วค่อยแทนที่ด้วย URL จริงเมื่ออัปโหลดเสร็จ ถ้าอัปโหลดพลาดก็ลบ
  // placeholder นั้นทิ้งไปเลย (ต้องเลือกไฟล์ใหม่อีกครั้ง)
  async function addPhotos(actId, fileList) {
    const files = Array.from(fileList);
    const current = editPhotos[actId] || [];
    const room = MAX_PHOTOS - current.length;
    if (room <= 0) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อครั้ง`);
      return;
    }
    const toUpload = files.slice(0, room);
    if (files.length > room) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อครั้ง — เพิ่มให้ได้อีก ${room} รูปเท่านั้น`);
    }

    // ใช้ id ชั่วคราวต่อไฟล์ กันสับสนเวลาเลือกไฟล์ชื่อซ้ำกันหลายไฟล์ในการอัปโหลดเดียวกัน
    const placeholders = toUpload.map((f) => ({ tempId: `${Date.now()}-${Math.random()}`, name: f.name, url: null, uploading: true }));
    setEditPhotos((prev) => ({ ...prev, [actId]: [...(prev[actId] || []), ...placeholders] }));

    for (let i = 0; i < toUpload.length; i += 1) {
      const file = toUpload[i];
      const tempId = placeholders[i].tempId;
      const formData = new FormData();
      formData.append('photo', file);
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await client.post('/photos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setEditPhotos((prev) => ({
          ...prev,
          [actId]: (prev[actId] || []).map((p) => (p.tempId === tempId ? { ...p, url: res.data.url, uploading: false } : p)),
        }));
      } catch (err) {
        alert(err.response?.data?.error || `อัปโหลดรูป "${file.name}" ไม่สำเร็จ`);
        setEditPhotos((prev) => ({ ...prev, [actId]: (prev[actId] || []).filter((p) => p.tempId !== tempId) }));
      }
    }
  }

  function removePhoto(actId, tempId) {
    setEditPhotos((prev) => ({ ...prev, [actId]: (prev[actId] || []).filter((p) => p.tempId !== tempId) }));
  }

  // ลบ "รายการล่าสุด" ทิ้ง (รายการจริงล่าสุดของกิจกรรมงานนี้ ไม่จำกัดช่วงวันที่) — ย้อนค่ากลับไปเป็น
  // ค่าก่อนหน้าถัดไป (ไม่ใช่ลบทั้งประวัติ) ไม่ระบุ on_or_before เพราะตอนนี้ entry_date = วันที่บันทึกจริง
  // เสมอ (ไม่ใช่ปลายสัปดาห์) "ล่าสุดจริง" กับ "ล่าสุดของแท็บนี้" จึงเป็นรายการเดียวกันอยู่แล้วในทางปฏิบัติ
  async function deleteLatest(act) {
    if (!window.confirm(`ยืนยันลบข้อมูลความคืบหน้าล่าสุดของ "${act.name}" ?`)) return;
    setSavingId(act.id);
    try {
      await client.delete('/progress/entries/latest', {
        params: { wbs_level3_id: act.id },
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    } finally {
      setSavingId(null);
    }
  }

  async function saveRow(act) {
    const inc = parseFloat(editValues[act.id]);
    if (isNaN(inc) || inc < 0) {
      alert('กรุณากรอก % ที่ทำได้ (0 ขึ้นไป)');
      return;
    }
    const currentPhotos = editPhotos[act.id] || [];
    if (currentPhotos.some((p) => p.uploading)) {
      alert('กรุณารอให้อัปโหลดรูปเสร็จก่อนบันทึก');
      return;
    }
    // ฐานคือ previous_percent (ก่อนสัปดาห์ที่กำลังดูอยู่เริ่ม) เสมอ — เพราะ "ปัจจุบัน" คือค่าที่แก้ไขให้เป็น
    // ยอด "ทั้งหมดของสัปดาห์นี้" ใหม่ (ไม่ใช่ค่าที่บวกเพิ่มไปเรื่อยๆ) กด "แก้ไข" แล้วเปลี่ยนตัวเลขคือ "แก้ยอดใหม่"
    const newTotal = Math.min(100, act.previous_percent + inc);
    setSavingId(act.id);
    try {
      // สำคัญ: ไม่ส่ง entry_date จาก client เองแล้ว (เดิมใช้นาฬิกาเครื่อง/browser ซึ่งอาจไม่ตรงกับเซิร์ฟเวอร์
      // เป๊ะ ทำให้ query "ณ วันนี้" ที่ backend หา entry ไม่เจอในบางกรณี) — ให้ backend คำนวณ "วันนี้"
      // จากนาฬิกาเซิร์ฟเวอร์เองเสมอ (แหล่งเดียว รับประกันว่าตรงกับที่ backend ใช้ query เทียบทุกที่)
      // photo_urls = URL จริงจาก Cloudinary ที่อัปโหลดเสร็จแล้วเท่านั้น (กรอง uploading ทิ้ง กันเผื่อหลุดมา)
      await client.post('/progress/entries', {
        wbs_level3_id: act.id,
        actual_percent: newTotal,
        photo_urls: currentPhotos.filter((p) => p.url).map((p) => p.url),
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingId(null);
    }
  }

  function handlePrint() {
    // 9 คอลัมน์เมื่อ editable: โครงสร้างงาน(0) %W(1) แผน(2) ก่อนหน้า(3) ปัจจุบัน(4) รวมผลงาน(5)
    // คงเหลือ(6) รูปถ่าย(7) การจัดการ(8) — ตัด "รูปถ่าย" กับ "การจัดการ" ออกตอนพิมพ์ตามที่ตกลง
    // (ไม่มีประโยชน์บนกระดาษ) แล้วเอาความกว้างไปเพิ่มให้คอลัมน์แรกแทน
    const excludeIdx = editable ? [7, 8] : [7];
    const printHtml = buildPrintTableHTML('.progress-table-scroll .progress-table', excludeIdx);
    if (!printHtml) return;
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('เบราว์เซอร์บล็อกการเปิดหน้าต่างพิมพ์ กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้แล้วลองใหม่');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="th">
<head><meta charset="utf-8" /><title>รายงานความคืบหน้า${week === 'next' ? 'สัปดาห์หน้า' : 'สัปดาห์นี้'}</title><style>${PRINT_CSS}</style></head>
<body>
  <h2>รายงานความคืบหน้า${week === 'next' ? 'งานสัปดาห์หน้า' : 'งานสัปดาห์นี้'}</h2>
  <p class="p-sub">ช่วงวันที่ ${fmtDMY(data.week_start)} - ${fmtDMY(data.week_end)}</p>
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

  if (loading && !data) return <p>กำลังโหลดข้อมูล...</p>;
  if (error) return <p className="pdata-status pdata-status--warn">{error}</p>;
  if (!data || data.groups.length === 0) {
    return <p className="pdata-status pdata-status--warn">ไม่มีกิจกรรมงานที่ตกอยู่ในช่วงสัปดาห์นี้</p>;
  }

  return (
    <div className="progress-table-wrap">
      <div className="progress-table__toolbar">
        <p className="progress-table__week-label">
          ช่วงวันที่ {fmtDMY(data.week_start)} - {fmtDMY(data.week_end)}
        </p>
        <button className="btn-primary btn-primary--sm" onClick={handlePrint}>🖨 Print</button>
      </div>
      <div className="progress-table-scroll">
        <table className="progress-table">
        {/* ความกว้างคอลัมน์เป็น % ตามที่กำหนด (250,100,110×5,200,120 รวม 1220px) ให้ตารางเต็มกรอบพอดี
            ไม่ใช่ px ตายตัว — คำนวณจาก px/1220px ให้เป็นสัดส่วนที่ responsive ตามความกว้างจริงของกรอบ */}
        <colgroup>
          <col style={{ width: '20.49%' }} />
          <col style={{ width: '8.20%' }} />
          <col style={{ width: '9.02%' }} />
          <col style={{ width: '9.02%' }} />
          <col style={{ width: '9.02%' }} />
          <col style={{ width: '9.02%' }} />
          <col style={{ width: '9.02%' }} />
          <col style={{ width: '16.39%' }} />
          {editable && <col style={{ width: '9.84%' }} />}
        </colgroup>
        <thead>
          <tr>
            <th className="progress-table__label-col">โครงสร้างงาน</th>
            <th>%W</th>
            <th>แผน(สะสม)</th>
            <th>ก่อนหน้า</th>
            <th>ปัจจุบัน</th>
            <th>รวมผลงาน</th>
            <th>คงเหลือ</th>
            <th>รูปถ่าย</th>
            {editable && <th>การจัดการ</th>}
          </tr>
        </thead>
        <tbody>
          {data.groups.flatMap((g) => [
            <tr key={`g-${g.id}`} className="progress-table__row progress-table__row--l1">
              <td className="progress-table__label-col">{g.code} {g.name}</td>
              <td>{fmtPct(g.weight_percent)}</td>
              <td>{fmtPct(g.plan_percent)}</td>
              <td>{fmtPct(g.previous_percent)}</td>
              <td></td>
              <td>{fmtPct(g.actual_percent)}</td>
              <td>{fmtPct(100 - g.actual_percent)}</td>
              <td></td>
              {editable && <td></td>}
            </tr>,
            ...g.items.flatMap((it) => [
              <tr key={`it-${it.id}`} className="progress-table__row progress-table__row--l2">
                <td className="progress-table__label-col">{it.code} {it.name}</td>
                <td>{fmtPct(it.weight_percent)}</td>
                <td>{fmtPct(it.plan_percent)}</td>
                <td>{fmtPct(it.previous_percent)}</td>
                <td></td>
                <td>{fmtPct(it.actual_percent)}</td>
                <td>{fmtPct(100 - it.actual_percent)}</td>
                <td></td>
                {editable && <td></td>}
              </tr>,
              ...it.activities.map((act) => {
                // ถ้าอยู่ Tab สัปดาห์หน้า และกิจกรรมงานนี้ "ก็โผล่ในสัปดาห์นี้อยู่แล้วด้วย" (ช่วงวันที่ทับซ้อน
                // ทั้ง 2 สัปดาห์) ให้แก้ไขได้แค่จาก Tab สัปดาห์นี้เท่านั้น — ที่นี่แสดงไว้ให้ดูอย่างเดียว
                // กันข้อมูลสับสน/ขัดแย้งจากการแก้ไขคนละจุดสำหรับกิจกรรมงานเดียวกัน
                const canEditHere = editable && !act.also_in_this_week;
                const isEditing = canEditHere && editingId === act.id;
                const savedIncrement = thisWeekIncrement(act);
                const typedInc = isEditing ? (parseFloat(editValues[act.id]) || 0) : savedIncrement;
                // "รวมผลงาน" (live): ตอนแก้ไขอยู่ = ก่อนหน้า + ตัวเลขที่กำลังพิมพ์ (อัปเดตสดตามที่ขอ)
                // ตอนไม่ได้แก้ไข = ใช้ actual_percent จริงจากเซิร์ฟเวอร์ตรงๆ (ไม่คำนวณเอง กันคลาดเคลื่อน)
                const displayTotal = isEditing ? Math.min(100, act.previous_percent + typedInc) : act.actual_percent;
                return (
                  <tr key={`act-${act.id}`} className="progress-table__row progress-table__row--l3">
                    <td className="progress-table__label-col">{act.code} {act.name}</td>
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
                      ) : canEditHere ? fmtPct(savedIncrement) : '-'}
                    </td>
                    <td>{fmtPct(displayTotal)}</td>
                    <td>{fmtPct(100 - displayTotal)}</td>
                    <td>
                      {isEditing ? (
                        <div className="progress-table__photo-cell">
                          {(editPhotos[act.id] || []).length < MAX_PHOTOS && (
                            <label className="progress-table__photo-btn">
                              📷
                              <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(act.id, e.target.files)} />
                            </label>
                          )}
                          {(editPhotos[act.id] || []).map((p) => (
                            <span key={p.tempId} className="progress-table__photo-chip">
                              {p.uploading ? (
                                <span className="progress-table__photo-uploading">⏳ กำลังอัปโหลด...</span>
                              ) : (
                                <img src={p.url} alt={p.name} className="progress-table__photo-thumb" />
                              )}
                              <button type="button" onClick={() => removePhoto(act.id, p.tempId)} disabled={p.uploading}>✕</button>
                            </span>
                          ))}
                          <span className="progress-table__photo-count">{(editPhotos[act.id] || []).length}/{MAX_PHOTOS}</span>
                        </div>
                      ) : (act.photos && act.photos.length > 0) ? (
                        <button
                          type="button"
                          className="progress-table__photo-view-btn"
                          onClick={() => setViewingPhotosAct(act)}
                        >
                          🖼 {act.photos.length} รูป
                        </button>
                      ) : '-'}
                    </td>
                    {editable && (
                      <td>
                        {!canEditHere ? (
                          <span className="progress-table__hint">ดูที่ Tab สัปดาห์นี้</span>
                        ) : isEditing ? (
                          <div className="progress-table__action-group">
                            <button
                              type="button"
                              className="progress-table__link-btn"
                              onClick={() => saveRow(act)}
                              disabled={savingId === act.id || (editPhotos[act.id] || []).some((p) => p.uploading)}
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
                    )}
                  </tr>
                );
              }),
            ]),
          ])}
        </tbody>
      </table>
      </div>

      {viewingPhotosAct && (
        <div className="scurve-modal-backdrop" onClick={() => setViewingPhotosAct(null)}>
          <div className="scurve-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="scurve-modal__toolbar">
              <button className="scurve-modal__close" onClick={() => setViewingPhotosAct(null)} aria-label="ปิด">✕</button>
            </div>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>รูปถ่าย — {viewingPhotosAct.code} {viewingPhotosAct.name}</h3>
            <div className="view-photos-grid">
              {viewingPhotosAct.photos.map((p) => (
                <img key={p.id} src={p.url} alt="" className="view-photos-grid__img" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
