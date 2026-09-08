// src/pages/ProjectManagement/WeeklyProgressTab.jsx
// ใช้ร่วมกันสำหรับ Tab 1 "งานสัปดาห์นี้" (editable=true) และ Tab 2 "งานสัปดาห์หน้า" (editable=false)
// แสดงกิจกรรมงานที่ตกอยู่ในสัปดาห์นั้น (ช่วงวันที่ทับซ้อนกับสัปดาห์) พร้อมกรอก % ความคืบหน้าที่ทำได้
// "สัปดาห์นี้" ได้ (ปัจจุบัน = ส่วนที่เพิ่มขึ้นมาใหม่ ไม่ใช่ตัวสะสม) แล้วระบบจะรวมกับ "ก่อนหน้า" ให้เอง
//
// วิธีกรอกข้อมูล (Tab 1 เท่านั้น): กดที่แถวกิจกรรมงานเลย (ทั้งแถวคลิกได้ ไม่ใช่แค่ปุ่มเล็กๆ) จะเด้ง popup
// ขึ้นมาให้กรอก %สัปดาห์นี้ + แนบรูป + พิมพ์รายละเอียดงาน ในหน้าต่างเดียวจบ กด "บันทึก" แล้วปิด popup ให้
// อัตโนมัติ — "รายละเอียดงาน" ที่พิมพ์ที่นี่คือช่องเดียวกับ "remark" ที่ Menu "จัดทำรายงาน" Tab Plan&Progress
// ใช้แสดง/แก้ไข (บันทึกเข้า report_progress_remarks ของรายงาน "สัปดาห์ปัจจุบัน" ของโครงการนั้นโดยตรง) ตาม
// หลักที่ตกลงกันไว้: Menu นี้ (การจัดการโครงการ) ให้กรอกข้อมูลจริงให้ครบตั้งแต่ต้น ส่วน Menu จัดทำรายงานเป็น
// แค่จุดปรับแต่งก่อนออกเล่มรายงานเท่านั้น ไม่ต้องพิมพ์ซ้ำ
//
// ข้อจำกัดที่ควรรู้: การบันทึก "รายละเอียดงาน" ต้องอาศัย endpoint ของ Menu "จัดทำรายงาน"
// (PUT /api/reports/:id/remarks) ซึ่งกำหนดสิทธิ์แยกไว้คนละ Tab (reports/plan-progress) — ถ้าผู้ใช้ที่กรอก
// ที่นี่ไม่มีสิทธิ์ Tab นั้นด้วย ระบบจะบันทึก %และรูปได้ตามปกติ แต่จะข้ามการบันทึกรายละเอียดงานไปเงียบๆ
// (แจ้งเตือนให้ทราบแทนที่จะบันทึกไม่สำเร็จทั้งหมด)
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

const MAX_PHOTOS = 6; // แนบรูปได้สูงสุด 6 รูปต่อการบันทึกความคืบหน้า 1 ครั้ง (ต่อกิจกรรมงาน 1 แถว)

// helper กันพัง เผื่อเรียกตอน editingAct เป็น null ระหว่าง state transition สั้นๆ
function savedIncrementSafe(act) {
  if (!act) return 0;
  return Math.max(0, (act.actual_percent || 0) - (act.previous_percent || 0));
}

export default function WeeklyProgressTab({ projectId, week, editable }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // รายงาน "สัปดาห์ปัจจุบัน" ของโครงการนี้ — ใช้เป็นที่เก็บ "รายละเอียดงาน" (remark) ร่วมกับ Menu จัดทำ
  // รายงาน (ดึง/สร้างอัตโนมัติครั้งเดียวตอนเปิด Tab นี้ ผ่าน endpoint เดียวกับที่ Reports.jsx ใช้)
  const [currentReportId, setCurrentReportId] = useState(null);
  // map ของ "รายละเอียดงาน" ที่เคยพิมพ์ไว้แล้ว key = `level3:${activityId}` — ดึงมาทั้งชุดครั้งเดียว
  // ตอนเปิด Tab (ไม่ใช่ทีละแถว) ใช้ prefill ตอนเปิด popup ของแถวนั้นๆ
  const [remarksMap, setRemarksMap] = useState({});

  // แถวที่กำลังเปิด popup กรอกข้อมูลอยู่ (null = ไม่มี popup เปิดอยู่) — เก็บ activity object ทั้งก้อนไว้เลย
  const [editingAct, setEditingAct] = useState(null);
  const [modalPercent, setModalPercent] = useState('');
  const [modalRemark, setModalRemark] = useState('');
  const [modalPhotos, setModalPhotos] = useState([]);
  const [modalSaving, setModalSaving] = useState(false);

  // เปิด popup ดูรูปที่แนบไว้แล้ว (เฉพาะ Tab ที่ editable=false เช่น "งานสัปดาห์หน้า" ที่ไม่มี popup
  // แก้ไขให้กด — Tab ที่ editable=true ดูรูปได้จาก popup แก้ไขโดยตรงอยู่แล้ว ไม่ต้องมีอันนี้ซ้ำ)
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

  // เตรียม "รายงานสัปดาห์ปัจจุบัน" + โหลดรายละเอียดงานที่เคยพิมพ์ไว้แล้วทั้งชุด — เฉพาะ Tab ที่ editable
  // เท่านั้น (Tab สัปดาห์หน้าไม่ต้องใช้ ไม่มี popup ให้กรอกอะไรอยู่แล้ว) เงียบไว้ถ้าดึงไม่สำเร็จ (เช่น ยังไม่ได้
  // กรอกวันเริ่มสัญญา หรือไม่มีสิทธิ์ Tab จัดทำรายงาน) — ผู้ใช้ยังกรอก %/รูปได้ตามปกติ แค่ช่องรายละเอียดงาน
  // จะใช้งานไม่ได้เท่านั้น (แจ้งเตือนตอนกดบันทึกแทน)
  useEffect(() => {
    if (!projectId || !editable) return;
    client.get('/reports/current', { params: { project_id: projectId } })
      .then((res) => {
        const reportId = res.data.report.id;
        setCurrentReportId(reportId);
        return client.get(`/reports/${reportId}/remarks`);
      })
      .then((res) => {
        const map = {};
        res.data.remarks.forEach((r) => { map[`${r.wbs_level}:${r.wbs_id}`] = r.remark; });
        setRemarksMap(map);
      })
      .catch(() => { setCurrentReportId(null); });
  }, [projectId, editable]);

  // % ที่ทำได้ใน "สัปดาห์นี้เอง" (ไม่รวมของก่อนหน้า) — คำนวณจากข้อมูลจริงเสมอ (actual - ก่อนหน้า)
  // ไม่ใช่ local state ที่หายไปตอน refresh — นี่คือสิ่งที่ทำให้ตัวเลขในช่อง "ปัจจุบัน" ค้างอยู่ถาวรตามที่ขอ
  function thisWeekIncrement(act) {
    return Math.max(0, (act.actual_percent || 0) - (act.previous_percent || 0));
  }

  function openEditModal(act) {
    setEditingAct(act);
    setModalPercent(thisWeekIncrement(act).toString());
    setModalRemark(remarksMap[`level3:${act.id}`] || '');
    setModalPhotos((act.photos || []).map((p) => ({ tempId: `existing-${p.id}`, name: '', url: p.url, uploading: false })));
  }

  function closeEditModal() {
    setEditingAct(null);
  }

  // อัปโหลดจริงขึ้น Cloudinary ทันทีที่เลือกไฟล์ (ไม่รอกดบันทึก) — ใส่ placeholder "กำลังอัปโหลด..."
  // ไว้ก่อนให้เห็น feedback ทันที แล้วค่อยแทนที่ด้วย URL จริงเมื่ออัปโหลดเสร็จ ถ้าอัปโหลดพลาดก็ลบ
  // placeholder นั้นทิ้งไปเลย (ต้องเลือกไฟล์ใหม่อีกครั้ง)
  async function addPhotos(fileList) {
    const files = Array.from(fileList);
    const room = MAX_PHOTOS - modalPhotos.length;
    if (room <= 0) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อครั้ง`);
      return;
    }
    const toUpload = files.slice(0, room);
    if (files.length > room) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อครั้ง — เพิ่มให้ได้อีก ${room} รูปเท่านั้น`);
    }

    const placeholders = toUpload.map((f) => ({ tempId: `${Date.now()}-${Math.random()}`, name: f.name, url: null, uploading: true }));
    setModalPhotos((prev) => [...prev, ...placeholders]);

    for (let i = 0; i < toUpload.length; i += 1) {
      const file = toUpload[i];
      const tempId = placeholders[i].tempId;
      const formData = new FormData();
      formData.append('photo', file);
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await client.post('/photos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setModalPhotos((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, url: res.data.url, uploading: false } : p)));
      } catch (err) {
        alert(err.response?.data?.error || `อัปโหลดรูป "${file.name}" ไม่สำเร็จ`);
        setModalPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
      }
    }
  }

  function removePhoto(tempId) {
    setModalPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  // ลบ "รายการล่าสุด" ทิ้ง (รายการจริงล่าสุดของกิจกรรมงานนี้ ไม่จำกัดช่วงวันที่) — ย้อนค่ากลับไปเป็น
  // ค่าก่อนหน้าถัดไป (ไม่ใช่ลบทั้งประวัติ) ไม่ระบุ on_or_before เพราะตอนนี้ entry_date = วันที่บันทึกจริง
  // เสมอ (ไม่ใช่ปลายสัปดาห์) "ล่าสุดจริง" กับ "ล่าสุดของแท็บนี้" จึงเป็นรายการเดียวกันอยู่แล้วในทางปฏิบัติ
  async function deleteLatest(act) {
    if (!window.confirm(`ยืนยันลบข้อมูลความคืบหน้าล่าสุดของ "${act.name}" ?`)) return;
    setModalSaving(true);
    try {
      await client.delete('/progress/entries/latest', { params: { wbs_level3_id: act.id } });
      closeEditModal();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    } finally {
      setModalSaving(false);
    }
  }

  async function saveModal() {
    const inc = parseFloat(modalPercent);
    if (isNaN(inc) || inc < 0) {
      alert('กรุณากรอก % ที่ทำได้ (0 ขึ้นไป)');
      return;
    }
    if (modalPhotos.some((p) => p.uploading)) {
      alert('กรุณารอให้อัปโหลดรูปเสร็จก่อนบันทึก');
      return;
    }
    // ฐานคือ previous_percent (ก่อนสัปดาห์ที่กำลังดูอยู่เริ่ม) เสมอ — เพราะ "ปัจจุบัน" คือค่าที่แก้ไขให้เป็น
    // ยอด "ทั้งหมดของสัปดาห์นี้" ใหม่ (ไม่ใช่ค่าที่บวกเพิ่มไปเรื่อยๆ) กด "แก้ไข" แล้วเปลี่ยนตัวเลขคือ "แก้ยอดใหม่"
    const newTotal = Math.min(100, editingAct.previous_percent + inc);
    setModalSaving(true);
    try {
      // สำคัญ: ไม่ส่ง entry_date จาก client เองแล้ว (เดิมใช้นาฬิกาเครื่อง/browser ซึ่งอาจไม่ตรงกับเซิร์ฟเวอร์
      // เป๊ะ ทำให้ query "ณ วันนี้" ที่ backend หา entry ไม่เจอในบางกรณี) — ให้ backend คำนวณ "วันนี้"
      // จากนาฬิกาเซิร์ฟเวอร์เองเสมอ (แหล่งเดียว รับประกันว่าตรงกับที่ backend ใช้ query เทียบทุกที่)
      // photo_urls = URL จริงจาก Cloudinary ที่อัปโหลดเสร็จแล้วเท่านั้น (กรอง uploading ทิ้ง กันเผื่อหลุดมา)
      await client.post('/progress/entries', {
        wbs_level3_id: editingAct.id,
        actual_percent: newTotal,
        photo_urls: modalPhotos.filter((p) => p.url).map((p) => p.url),
      });

      // บันทึก "รายละเอียดงาน" เข้ารายงานสัปดาห์ปัจจุบันด้วย (ช่องเดียวกับ remark ของ Menu จัดทำรายงาน) —
      // ทำเป็นขั้นตอนแยกต่างหาก ถ้าพลาด (เช่น ไม่มีสิทธิ์ Tab จัดทำรายงาน) ไม่ทำให้การบันทึก %/รูปที่เพิ่ง
      // สำเร็จไปแล้วเสียหายไปด้วย แค่แจ้งเตือนแยกให้รู้ว่าส่วนนี้ไม่ได้บันทึก
      if (currentReportId) {
        try {
          await client.put(`/reports/${currentReportId}/remarks`, {
            wbs_level: 'level3',
            wbs_id: editingAct.id,
            remark: modalRemark,
          });
          setRemarksMap((prev) => ({ ...prev, [`level3:${editingAct.id}`]: modalRemark }));
        } catch (remarkErr) {
          alert('บันทึก %/รูปสำเร็จ แต่บันทึก "รายละเอียดงาน" ไม่สำเร็จ (อาจไม่มีสิทธิ์ Tab จัดทำรายงาน) — % และรูปถูกบันทึกเรียบร้อยแล้ว');
        }
      } else if (modalRemark.trim()) {
        alert('บันทึก %/รูปสำเร็จ แต่ระบบยังไม่พร้อมบันทึก "รายละเอียดงาน" (ตรวจสอบว่ากรอกวันเริ่มสัญญาของโครงการไว้แล้วหรือยัง) — % และรูปถูกบันทึกเรียบร้อยแล้ว');
      }

      closeEditModal();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally {
      setModalSaving(false);
    }
  }

  function handlePrint() {
    // 8 คอลัมน์เสมอตอนนี้ (ตัดคอลัมน์ "การจัดการ" ออกแล้ว เพราะเปลี่ยนไปกดที่แถวเปิด popup แทน):
    // โครงสร้างงาน(0) %W(1) แผน(2) ก่อนหน้า(3) ปัจจุบัน(4) รวมผลงาน(5) คงเหลือ(6) รูปถ่าย(7)
    // ตัด "รูปถ่าย" ออกตอนพิมพ์ตามที่ตกลง (ไม่มีประโยชน์บนกระดาษ) แล้วเอาความกว้างไปเพิ่มให้คอลัมน์แรกแทน
    const printHtml = buildPrintTableHTML('.progress-table-scroll .progress-table', [7]);
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
        {/* ความกว้างคอลัมน์เป็น % ตามที่กำหนด — ตัดคอลัมน์ "การจัดการ" ออกแล้ว เหลือ 8 คอลัมน์เสมอไม่ว่า
            editable หรือไม่ (ปุ่มแก้ไข/ลบเดิมย้ายไปอยู่ใน popup แทน กดที่แถวเพื่อเปิด) */}
        <colgroup>
          <col style={{ width: '22.73%' }} />
          <col style={{ width: '9.09%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '18.18%' }} />
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
              </tr>,
              ...it.activities.map((act) => {
                // ถ้าอยู่ Tab สัปดาห์หน้า และกิจกรรมงานนี้ "ก็โผล่ในสัปดาห์นี้อยู่แล้วด้วย" (ช่วงวันที่ทับซ้อน
                // ทั้ง 2 สัปดาห์) ให้แก้ไขได้แค่จาก Tab สัปดาห์นี้เท่านั้น — ที่นี่แสดงไว้ให้ดูอย่างเดียว
                // กันข้อมูลสับสน/ขัดแย้งจากการแก้ไขคนละจุดสำหรับกิจกรรมงานเดียวกัน
                const canEditHere = editable && !act.also_in_this_week;
                const savedIncrement = thisWeekIncrement(act);
                const hasRemark = !!remarksMap[`level3:${act.id}`];
                return (
                  <tr
                    key={`act-${act.id}`}
                    className={`progress-table__row progress-table__row--l3 ${canEditHere ? 'progress-table__row--clickable' : ''}`}
                    onClick={canEditHere ? () => openEditModal(act) : undefined}
                    title={canEditHere ? 'กดเพื่อกรอก %/รูปถ่าย/รายละเอียดงาน' : undefined}
                  >
                    <td className="progress-table__label-col">
                      {act.code} {act.name}
                      {hasRemark && <span title="มีรายละเอียดงานแล้ว"> 📝</span>}
                    </td>
                    <td>{Math.round(act.share_percent)}%</td>
                    <td>{fmtPct(act.plan_percent)}</td>
                    <td>{fmtPct(act.previous_percent)}</td>
                    <td>{canEditHere ? fmtPct(savedIncrement) : '-'}</td>
                    <td>{fmtPct(act.actual_percent)}</td>
                    <td>{fmtPct(100 - act.actual_percent)}</td>
                    <td onClick={(e) => { if (!canEditHere) e.stopPropagation(); }}>
                      {(act.photos && act.photos.length > 0) ? (
                        canEditHere ? (
                          `🖼 ${act.photos.length} รูป`
                        ) : (
                          <button
                            type="button"
                            className="progress-table__photo-view-btn"
                            onClick={() => setViewingPhotosAct(act)}
                          >
                            🖼 {act.photos.length} รูป
                          </button>
                        )
                      ) : canEditHere ? '👆 กดกรอกข้อมูล' : '-'}
                    </td>
                  </tr>
                );
              }),
            ]),
          ])}
        </tbody>
      </table>
      </div>

      {/* popup กรอก %/รูป/รายละเอียดงาน — เปิดจากการกดที่แถว (เฉพาะ Tab ที่ editable=true) */}
      {editingAct && (
        <div className="scurve-modal-backdrop" onClick={closeEditModal}>
          <div className="scurve-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="scurve-modal__toolbar">
              <button className="scurve-modal__close" onClick={closeEditModal} aria-label="ปิด">✕</button>
            </div>
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>{editingAct.code} {editingAct.name}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--ink-soft)' }}>
              แผน(สะสม) {fmtPct(editingAct.plan_percent)} • ก่อนหน้า {fmtPct(editingAct.previous_percent)}
            </p>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              % ที่ทำได้สัปดาห์นี้
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              className="progress-table__input"
              style={{ width: '100%', marginBottom: 4, boxSizing: 'border-box' }}
              value={modalPercent}
              onChange={(e) => setModalPercent(e.target.value)}
              onFocus={(e) => { if (e.target.value === '0') setModalPercent(''); e.target.select(); }}
              placeholder="0"
              autoFocus
            />
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--ink-soft)' }}>
              รวมผลงานใหม่: {fmtPct(Math.min(100, editingAct.previous_percent + (parseFloat(modalPercent) || 0)))}
            </p>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              รูปถ่ายหน้างาน (สูงสุด {MAX_PHOTOS} รูป)
            </label>
            <div className="progress-table__photo-cell" style={{ marginBottom: 16 }}>
              {modalPhotos.length < MAX_PHOTOS && (
                <label className="progress-table__photo-btn">
                  📷
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
                </label>
              )}
              {modalPhotos.map((p) => (
                <span key={p.tempId} className="progress-table__photo-chip">
                  {p.uploading ? (
                    <span className="progress-table__photo-uploading">⏳ กำลังอัปโหลด...</span>
                  ) : (
                    <img src={p.url} alt={p.name} className="progress-table__photo-thumb" />
                  )}
                  <button type="button" onClick={() => removePhoto(p.tempId)} disabled={p.uploading}>✕</button>
                </span>
              ))}
              <span className="progress-table__photo-count">{modalPhotos.length}/{MAX_PHOTOS}</span>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              รายละเอียดงาน (จะไปโชว์ในเล่มรายงานอัตโนมัติ — ไม่ต้องพิมพ์ซ้ำที่ Menu จัดทำรายงานอีก)
            </label>
            <textarea
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
              value={modalRemark}
              onChange={(e) => setModalRemark(e.target.value)}
              placeholder="เช่น ดำเนินการเทคอนกรีตชั้น 2 เสร็จ 60%..."
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              <div>
                {savedIncrementSafe(editingAct) > 0 && (
                  <button
                    type="button"
                    className="btn-secondary btn-secondary--sm"
                    onClick={() => deleteLatest(editingAct)}
                    disabled={modalSaving}
                  >
                    ลบข้อมูลล่าสุด
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary btn-secondary--sm" onClick={closeEditModal} disabled={modalSaving}>
                  ปิด
                </button>
                <button
                  type="button"
                  className="btn-primary btn-primary--sm"
                  onClick={saveModal}
                  disabled={modalSaving || modalPhotos.some((p) => p.uploading)}
                >
                  {modalSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
