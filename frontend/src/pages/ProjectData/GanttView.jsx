// src/pages/ProjectData/GanttView.jsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import QuickAddActivityModal from './QuickAddActivityModal';
import DependencyModal from './DependencyModal';
import PrintPreviewModal from './PrintPreviewModal';
import { computeLiveState, wouldCreateCycleLocal } from './schedulingSim';
import './GanttView.css';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// ระดับซูม: month (บีบสุด เห็นภาพรวมทั้งโครงการในจอเดียว) -> week (ค่าเริ่มต้น) -> day (ขยายสุด เห็นละเอียดรายวัน)
const ZOOM_LEVELS = ['month', 'week', 'day'];
const PX_PER_DAY = { month: 3.5, week: 10, day: 36 };

// CSS แบบสมบูรณ์ในตัวเอง (ไม่พึ่ง CSS variable ของแอปหลักเลย ใช้ค่าสีตรงๆ) สำหรับหน้าต่างพิมพ์แยกต่างหาก
// (ดู handlePrint ในคอมโพเนนต์ด้านล่าง) — เอกสารในหน้าต่างใหม่นี้เป็น <html><body> เปล่าๆ ไม่มี ancestor
// อื่นเลย จึงใส่ @page { size } ตรงๆ ได้อย่างปลอดภัย ไม่ชนกับ layout ของแอปหลักเหมือนตอนพิมพ์ในหน้าเดิม
const PRINT_WINDOW_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', system-ui, sans-serif; margin: 16px; color: #12202E; }
  .p-close-btn {
    position: fixed; top: 12px; right: 12px; z-index: 10;
    padding: 6px 12px; font-size: 12px; font-weight: 600;
    background: #fff; border: 1px solid #C7CDD1; border-radius: 8px; cursor: pointer;
  }
  .p-close-btn:hover { border-color: #E8702A; color: #E8702A; }
  .p-title h2 { font-size: 16px; margin: 0 0 2px 0; }
  .p-title p { font-size: 11px; color: #4B5D6B; margin: 0 0 12px 0; }
  table.gantt-print-table {
    display: table !important;
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    table-layout: fixed;
  }
  .gantt-print-table th, .gantt-print-table td {
    border: 1px solid #C7CDD1;
    padding: 3px 6px;
    text-align: center;
    font-weight: normal;
  }
  .gantt-print-table thead { display: table-header-group; }
  .gantt-print-table thead th { background: #EDEFF0; font-weight: 700; }
  .gantt-print-table tbody tr { page-break-inside: avoid; }
  .gantt-print-table .gantt-print-table__label-col { text-align: left; width: 240px; white-space: nowrap; }
  /* ต้องกำหนดความกว้างชัดเจนทุกคอลัมน์ (ไม่ใช่แค่ชื่อ) ไม่งั้นเบราว์เซอร์จะ auto-size ตามเนื้อหาจริง
     ซึ่งแคบกว่าที่ประมาณไว้ใน JS (FROZEN_WIDTH) มาก ทำให้เหลือพื้นที่ว่างด้านขวาโดยไม่ได้ใช้ประโยชน์ */
  .gantt-print-table th:nth-child(2), .gantt-print-table td:nth-child(2) { width: 45px; }
  .gantt-print-table th:nth-child(3), .gantt-print-table td:nth-child(3) { width: 35px; }
  .gantt-print-table th:nth-child(4), .gantt-print-table td:nth-child(4) { width: 65px; }
  .gantt-print-table th:nth-child(5), .gantt-print-table td:nth-child(5) { width: 65px; }
  .gantt-print-table__row--l1 td { font-weight: 700; background: #EDEFF0; }
  .gantt-print-table__row--l1 .gantt-print-table__weight { font-weight: 800; }
  .gantt-print-table__row--l2 td { font-weight: 600; }
  .gantt-print-table__row--l3 td { color: #4B5D6B; }
  .gantt-print-table__row--l3 .gantt-print-table__label-col { padding-left: 20px; }
  .gantt-print-table__row--l2 .gantt-print-table__label-col { padding-left: 10px; }
  .gantt-print-table__timeline-header { display: flex; }
  .gantt-print-table__timeline-header-cell {
    flex-shrink: 0; text-align: center; font-weight: 700;
    border-right: 1px solid #C7CDD1; white-space: nowrap; overflow: hidden;
  }
  .gantt-print-table__timeline-cell { display: flex; align-items: center; min-height: 14px; }
  .gantt-print-table__timeline-spacer { flex-shrink: 0; }
  .gantt-print-bar { flex-shrink: 0; height: 10px; border-radius: 3px; }
  .gantt-print-bar--l1 { background: #B9C2C8; }
  .gantt-print-bar--l2 { background: #2E6F6A; }
  .gantt-print-bar--l3 { background: #E8702A; }
  @media print {
    body { margin: 0; }
    .p-close-btn { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

function toDate(str) {
  // อ่านวันที่แบบตัด time/timezone ทิ้งเสมอ สร้างเป็น UTC midnight ตรงๆ
  // กันปัญหาวันที่คลาดเคลื่อนเวลาข้ามเขตเวลา (สาเหตุที่ bar chart ยาวไม่เท่ากัน
  // ทั้งที่ตัวเลขวันที่ที่แสดงผลเหมือนกัน)
  if (!str) return null;
  const datePart = String(str).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
function daysBetween(a, b) {
  return Math.round((b - a) / MS_PER_DAY);
}
function fmtISO(d) {
  return d.toISOString().slice(0, 10);
}
function fmtShort(str) {
  const d = toDate(str);
  if (!d) return '-';
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

// แถบกิจกรรมงาน (JE) ที่ลากกำหนดวันที่ได้ - แสดงวันที่ต้น/ปลายสดๆ ระหว่างลาก
// editable=false (โหมดดูอย่างเดียว) จะไม่รับการลากใดๆ เลย กันมือไปโดนแล้วข้อมูลเปลี่ยน
function ActivityTrack({ act, timelineStart, totalDays, barStyleFn, onDateChange, saving, editable }) {
  const [dragState, setDragState] = useState(null);

  function pixelToDay(clientX, trackEl) {
    const rect = trackEl.getBoundingClientRect();
    const relX = clientX - rect.left;
    const dayWidth = rect.width / totalDays;
    let day = Math.floor(relX / dayWidth);
    if (day < 0) day = 0;
    if (day > totalDays - 1) day = totalDays - 1;
    return day;
  }

  function handleMouseDown(e) {
    if (!editable || saving) return;
    const day = pixelToDay(e.clientX, e.currentTarget);
    setDragState({ startDay: day, currentDay: day });
  }
  function handleMouseMove(e) {
    if (!dragState) return;
    const day = pixelToDay(e.clientX, e.currentTarget);
    setDragState((s) => ({ ...s, currentDay: day }));
  }
  function handleMouseUp(e) {
    if (!dragState) return;
    const day = pixelToDay(e.clientX, e.currentTarget);
    const finalStart = Math.min(dragState.startDay, day);
    const finalEnd = Math.max(dragState.startDay, day);
    setDragState(null);
    const startDate = new Date(timelineStart.getTime() + finalStart * MS_PER_DAY);
    const endDate = new Date(timelineStart.getTime() + finalEnd * MS_PER_DAY);
    onDateChange(act.id, fmtISO(startDate), fmtISO(endDate));
  }

  const existingBarStyle = !dragState ? barStyleFn(act.start_date, act.end_date) : null;

  let dragBarStyle = null;
  let dragLabel = '';
  if (dragState) {
    const dMin = Math.min(dragState.startDay, dragState.currentDay);
    const dMax = Math.max(dragState.startDay, dragState.currentDay);
    const dayCount = dMax - dMin + 1;
    const sDate = new Date(timelineStart.getTime() + dMin * MS_PER_DAY);
    const eDate = new Date(timelineStart.getTime() + dMax * MS_PER_DAY);
    dragLabel = `${fmtShort(fmtISO(sDate))} - ${fmtShort(fmtISO(eDate))} (${dayCount} วัน)`;
    dragBarStyle = barStyleFn(fmtISO(sDate), fmtISO(eDate));
  }

  return (
    <div
      className={`gantt__track ${editable ? 'gantt__track--editable' : 'gantt__track--readonly'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => dragState && setDragState(null)}
    >
      {existingBarStyle && <div className="gantt__bar gantt__bar--l3" style={existingBarStyle} />}
      {dragState && (
        <div className="gantt__bar gantt__bar--dragging" style={dragBarStyle}>{dragLabel}</div>
      )}
    </div>
  );
}

// ช่อง วัน/เริ่ม/เสร็จ ของกิจกรรมงาน (JE) - ไม่มีปุ่ม +/- แล้ว กรอกจำนวนวันตรงๆ
// พฤติกรรม "อะไรคงที่ อะไรขยับ" ขึ้นกับว่ากิจกรรมนี้ถูกกำหนดวันที่จากกิจกรรมงานต้นทางแบบไหน (isEndAnchored):
//   - ไม่มีลิงก์ หรือมีลิงก์แบบ FS/SS (คุมวันเริ่ม) -> ยึด "วันเริ่ม" เป็นหลัก: แก้วันเริ่ม/จำนวนวัน -> วันเสร็จขยับตาม (ปกติ)
//   - มีลิงก์แบบ FF/SF (คุมวันเสร็จ) -> ยึด "วันเสร็จ" เป็นหลักแทน: แก้จำนวนวัน/วันเริ่ม -> วันเสร็จ "คงที่" แล้ว
//     คำนวณย้อนกลับเป็นวันเริ่ม/จำนวนวันใหม่แทน (ตรงตามหลัก SF/FF: fixed finish วันเริ่มคือสิ่งที่ต้องขยับ)
// (แก้วันเสร็จตรงๆ เองเสมอจะถือเป็นการ override ค่าที่คำนวณมาจากลิงก์ คำนวณจำนวนวันใหม่จากวันเริ่มเดิมตามปกติ)
// editable=false (โหมดดูอย่างเดียว) จะปิดช่องกรอกทั้งหมด กันมือไปโดนแล้วข้อมูลเปลี่ยน
function ActivityDateCells({ act, onDateChange, editable, isEndAnchored }) {
  const [duration, setDuration] = useState(act.duration_days || '');
  const [start, setStart] = useState(act.start_date ? String(act.start_date).slice(0, 10) : '');
  const [end, setEnd] = useState(act.end_date ? String(act.end_date).slice(0, 10) : '');

  useEffect(() => {
    setDuration(act.duration_days || '');
    setStart(act.start_date ? String(act.start_date).slice(0, 10) : '');
    setEnd(act.end_date ? String(act.end_date).slice(0, 10) : '');
  }, [act.duration_days, act.start_date, act.end_date]);

  function commitStart(v) {
    setStart(v);
    if (!v) return;
    if (isEndAnchored && end) {
      // กิจกรรมนี้ถูกกำหนด "วันเสร็จ" ตายตัวจากกิจกรรมงานต้นทาง (FF/SF)
      // แก้วันเริ่มตรงๆ ให้ตีความเป็นการเปลี่ยน "จำนวนวัน" แทน (คงวันเสร็จเดิมไว้) ไม่ใช่ไปเลื่อนวันเสร็จ
      const newDuration = Math.max(1, daysBetween(toDate(v), toDate(end)) + 1);
      setDuration(String(newDuration));
      onDateChange(act.id, v, end);
      return;
    }
    const days = parseInt(duration, 10);
    if (days > 0) {
      // มีจำนวนวันอยู่แล้ว -> คำนวณวันเสร็จใหม่จากวันเริ่ม + จำนวนวัน (auto)
      const s = toDate(v);
      const newEnd = new Date(s.getTime() + (days - 1) * MS_PER_DAY);
      const newEndStr = fmtISO(newEnd);
      setEnd(newEndStr);
      onDateChange(act.id, v, newEndStr);
    } else if (end) {
      onDateChange(act.id, v, end);
    }
  }
  function commitEnd(v) {
    setEnd(v);
    // แก้วันเสร็จตรงๆ ถือเป็นการ override ค่าที่คำนวณมาจากลิงก์เสมอ (ไม่ว่าจะ end-anchored หรือไม่)
    // คงวันเริ่มเดิมไว้ แล้วคำนวณจำนวนวันใหม่ให้ตรงกับช่วงที่พิมพ์
    if (start && v) onDateChange(act.id, start, v);
  }
  function commitDuration(daysStr) {
    const days = parseInt(daysStr, 10);
    setDuration(daysStr);
    if (isEndAnchored && end && days > 0) {
      // คงวันเสร็จเดิมไว้ (ตามกิจกรรมงานต้นทาง SF/FF) แล้วเลื่อนวันเริ่มถอยไปตามจำนวนวันใหม่แทน
      const e = toDate(end);
      const newStart = new Date(e.getTime() - (days - 1) * MS_PER_DAY);
      const newStartStr = fmtISO(newStart);
      setStart(newStartStr);
      onDateChange(act.id, newStartStr, end);
      return;
    }
    if (start && days > 0) {
      const s = toDate(start);
      const newEnd = new Date(s.getTime() + (days - 1) * MS_PER_DAY);
      const newEndStr = fmtISO(newEnd);
      setEnd(newEndStr);
      onDateChange(act.id, start, newEndStr);
    }
  }

  return (
    <>
      <div className="gantt__cell gantt__cell--days">
        <input
          type="text"
          inputMode="numeric"
          className="gantt__cell-input"
          value={duration}
          disabled={!editable}
          onChange={(e) => { if (/^\d*$/.test(e.target.value)) setDuration(e.target.value); }}
          onBlur={() => commitDuration(duration)}
        />
      </div>
      <div className="gantt__cell gantt__cell--date">
        <input type="date" className="gantt__cell-input" value={start} disabled={!editable} onChange={(e) => commitStart(e.target.value)} />
      </div>
      <div className="gantt__cell gantt__cell--date">
        <input type="date" className="gantt__cell-input" value={end} disabled={!editable} onChange={(e) => commitEnd(e.target.value)} />
      </div>
    </>
  );
}

export default function GanttView({ projectId, onDirtyChange }) {
  const [data, setData] = useState(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quickAddTarget, setQuickAddTarget] = useState(null); // { level2Id, level2Name }
  const [depModalTarget, setDepModalTarget] = useState(null); // { id, code, name } — กิจกรรมงาน (JE) ที่กำลังจัดการลิงก์เชื่อมโยงอยู่
  const [printModalOpen, setPrintModalOpen] = useState(false);
  // ค่า px/วัน ชั่วคราวตอนพิมพ์ (บีบความกว้างแกนเวลาให้พอดีหน้ากระดาษ โดยไม่ลดขนาดตัวอักษร) — null = ใช้ค่าซูมปกติ
  const [printPxPerDayOverride, setPrintPxPerDayOverride] = useState(null);
  // ตอนพิมพ์ ตัดความยาวแกนเวลาให้สั้นแค่ "ถึงแท่งสุดท้าย + 7 วัน" แทนความยาวเต็มตามวันสิ้นสุดสัญญา
  // (ที่อาจยาวกว่ามาก) กันไม่ให้พื้นที่กระดาษที่บีบมาแล้วเสียไปกับช่วงว่างเปล่าท้ายตาราง
  const [printTotalDaysOverride, setPrintTotalDaysOverride] = useState(null);
  // ตอนพิมพ์ ถ้าผู้ใช้กำหนดช่วงวันที่เอง (ใน popup ตั้งค่าพิมพ์) จะ override จุดเริ่มแกนเวลาด้วยค่านี้
  const [printTimelineStartOverride, setPrintTimelineStartOverride] = useState(null);
  // โหมดแก้ไข: ค่าเริ่มต้นเป็นโหมดดูอย่างเดียวเสมอ (ป้องกันมือไปโดนแล้วข้อมูลเปลี่ยนโดยไม่ตั้งใจ)
  // ทุกการแก้ไข (ลาก/พิมพ์วันที่, เพิ่ม/ลบลิงก์เชื่อมโยง) จะถูกพักไว้เป็น "ops" ตามลำดับที่ทำ
  // แล้วคำนวณ preview "live" ในเครื่องทันทีผ่าน schedulingSim.js — ยังไม่ยิงขึ้นเซิร์ฟเวอร์จริง
  // จนกว่าจะกด "บันทึก" ถึงจะไล่ยิง ops ทั้งหมดขึ้นเซิร์ฟเวอร์ตามลำดับเดิมเป๊ะ (ให้ผลตรงกับที่ preview ไว้)
  // ถ้ากด "ยกเลิก" หรือออกจาก Tab/โครงการโดยไม่บันทึก ops ทั้งหมดจะถูกทิ้ง กลับเป็นค่าเดิมจากเซิร์ฟเวอร์
  const [editMode, setEditMode] = useState(false);
  const [pendingOps, setPendingOps] = useState([]);
  const [savingAll, setSavingAll] = useState(false);
  // เส้นเชื่อมโยง (dependency lines) บน Gantt — เปิด/ปิดได้ ค่าเริ่มต้นเปิดไว้
  const [showDependencyLines, setShowDependencyLines] = useState(true);
  const [connectorLines, setConnectorLines] = useState([]);
  const [connectorsHeight, setConnectorsHeight] = useState(0);
  const gridRef = useRef(null);
  const rowRefs = useRef({}); // { [activityId]: DOM element ของแถว JE นั้น } ใช้วัดตำแหน่ง Y จริงเพื่อวาดเส้น
  const [zoomIndex, setZoomIndex] = useState(1); // 0=month, 1=week (ค่าเริ่มต้น), 2=day

  // คำนวณ preview "live" ของวันที่ + กราฟลิงก์เชื่อมโยง จาก data จริง + pendingOps ที่พักไว้
  // ต้องอยู่ก่อน early return ใดๆ เสมอ (กฎของ React Hooks) — ถ้ายังไม่มี data ให้คืน map ว่างไปก่อน
  const liveState = useMemo(() => {
    if (!data) return { datesMap: new Map(), linksBySuccessor: new Map() };
    const flat = data.groups.flatMap((g) => g.items.flatMap((it) => it.activities));
    return computeLiveState(flat, pendingOps);
  }, [data, pendingOps]);

  function getEffectiveActivity(act) {
    const live = liveState.datesMap.get(act.id);
    return live ? { ...act, ...live } : act;
  }

  // วัดตำแหน่งจริงของแต่ละแถว JE (ผ่าน rowRefs) แล้วคำนวณเส้นเชื่อมโยง (predecessor -> successor)
  // เป็น pixel coordinates ไว้วาดเป็น SVG overlay ทับ .gantt__grid — ต้องรันหลัง DOM วาดเสร็จ (layout effect)
  // คำนวณตำแหน่งแนวนอน (X) ซ้ำเองในนี้แบบ self-contained (ไม่พึ่งตัวแปร timelineStart/barStyle ด้านล่าง
  // ที่ถูกประกาศหลัง early-return ของ component) เพื่อให้ hook นี้เรียกได้อย่างปลอดภัยทุก render แน่นอน
  useLayoutEffect(() => {
    if (!data || data.groups.length === 0 || !showDependencyLines) {
      setConnectorLines((prev) => (prev.length ? [] : prev));
      return;
    }
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const zoomLevelLocal = ZOOM_LEVELS[zoomIndex];
    // ต้องใช้ pxPerDay ตัวเดียวกับที่ใช้วาดแท่งจริง (รวม override ตอนพิมพ์แบบบีบความกว้างด้วย)
    // ไม่งั้นเส้นเชื่อมโยงจะคำนวณตำแหน่งจากสเกลคนละอันกับแท่งที่แสดงจริง ทำให้เส้นเพี้ยนตำแหน่งตอนพิมพ์
    const pxPerDayLocal = printPxPerDayOverride ?? PX_PER_DAY[zoomLevelLocal];
    const contractStartLocal = project?.contract_start ? toDate(project.contract_start) : null;
    const hasAnyDateLocal = Boolean(data.timeline.min_date && data.timeline.max_date);
    const timelineStartLocal = contractStartLocal || (hasAnyDateLocal ? toDate(data.timeline.min_date) : new Date());

    function barPxLocal(startStr, endStr) {
      if (!startStr || !endStr) return null;
      const start = toDate(startStr);
      const end = toDate(endStr);
      const offsetDays = daysBetween(timelineStartLocal, start);
      const spanDays = daysBetween(start, end) + 1;
      return { leftPx: offsetDays * pxPerDayLocal, widthPx: Math.max(3, spanDays * pxPerDayLocal) };
    }

    const flat = data.groups.flatMap((g) => g.items.flatMap((it) => it.activities));
    const byId = new Map(flat.map((a) => [a.id, a]));
    const live = computeLiveState(flat, pendingOps);
    const gridRect = gridEl.getBoundingClientRect();
    const FROZEN_WIDTH = 530; // ผลรวมความกว้างคอลัมน์ 1-5 ที่แช่แข็งไว้ (240+60+50+90+90) จุดเริ่มโซน timeline
    setConnectorsHeight((prev) => (prev === gridRect.height ? prev : gridRect.height));

    const lines = [];
    flat.forEach((act) => {
      const effDates = live.datesMap.get(act.id);
      const deps = live.linksBySuccessor.get(act.id) || [];
      deps.forEach((dep) => {
        const predAct = byId.get(dep.predecessor_id);
        if (!predAct) return;
        const predDates = live.datesMap.get(dep.predecessor_id);
        const predBar = barPxLocal(predDates?.start_date, predDates?.end_date);
        const succBar = barPxLocal(effDates?.start_date, effDates?.end_date);
        if (!predBar || !succBar) return; // ฝั่งใดฝั่งหนึ่งยังไม่มีวันที่ ยังวาดเส้นไม่ได้

        const predRowEl = rowRefs.current[dep.predecessor_id];
        const succRowEl = rowRefs.current[act.id];
        if (!predRowEl || !succRowEl) return;

        const predRowRect = predRowEl.getBoundingClientRect();
        const succRowRect = succRowEl.getBoundingClientRect();

        // จุดปลายเส้นต้องอิงตามความสัมพันธ์จริง ไม่ใช่ "ต้นทางจบ -> ปลายทางเริ่ม" (แบบ FS) เสมอไป:
        //   FS: ต้นทางจบ (finish) -> ปลายทางเริ่ม (start)
        //   SS: ต้นทางเริ่ม (start) -> ปลายทางเริ่ม (start)
        //   FF: ต้นทางจบ (finish) -> ปลายทางจบ (finish)
        //   SF: ต้นทางเริ่ม (start) -> ปลายทางจบ (finish)
        const predAnchor = (dep.dependency_type === 'FS' || dep.dependency_type === 'FF') ? 'finish' : 'start';
        const succAnchor = (dep.dependency_type === 'FS' || dep.dependency_type === 'SS') ? 'start' : 'finish';

        const x1 = FROZEN_WIDTH + (predAnchor === 'finish' ? predBar.leftPx + predBar.widthPx : predBar.leftPx);
        const x2 = FROZEN_WIDTH + (succAnchor === 'finish' ? succBar.leftPx + succBar.widthPx : succBar.leftPx);

        lines.push({
          key: `${dep.predecessor_id}-${act.id}-${dep._linkId ?? dep._tempId}`,
          x1,
          y1: predRowRect.top - gridRect.top + predRowRect.height / 2,
          x2,
          y2: succRowRect.top - gridRect.top + succRowRect.height / 2,
          predAnchor,
          succAnchor,
          isPending: dep._linkId == null,
        });
      });
    });

    setConnectorLines((prev) => {
      const same = prev.length === lines.length && prev.every((p, i) => {
        const l = lines[i];
        return p.key === l.key && p.x1 === l.x1 && p.y1 === l.y1 && p.x2 === l.x2 && p.y2 === l.y2
          && p.predAnchor === l.predAnchor && p.succAnchor === l.succAnchor && p.isPending === l.isPending;
      });
      return same ? prev : lines;
    });
  }, [data, project, pendingOps, zoomIndex, showDependencyLines, printPxPerDayOverride]);

  // เส้นทางเดินของเส้นเชื่อมโยงแบบ "หักมุม" (elbow) เหมือน MS Project
  // ทิศทางที่ "ยื่นออก" จากต้นทาง/เข้าสู่ปลายทาง ต้องดูตามฝั่ง anchor จริง ไม่ใช่ยื่นขวาเสมอ:
  //   anchor เป็น "finish" (ขอบขวาของแท่ง) -> ยื่นออกไปทางขวา / เข้าหาจากทางขวา
  //   anchor เป็น "start" (ขอบซ้ายของแท่ง) -> ยื่นออกไปทางซ้าย / เข้าหาจากทางซ้าย
  // เพื่อไม่ให้เส้นวิ่งทะลุเข้าไปในตัวแท่งของมันเอง แล้ววกผ่านช่องกลาง (midY) ไปยังอีกฝั่ง
  function buildConnectorPath(x1, y1, x2, y2, predAnchor, succAnchor) {
    const hook = 12;
    const hook1 = predAnchor === 'finish' ? x1 + hook : x1 - hook;
    const hook2 = succAnchor === 'start' ? x2 - hook : x2 + hook;
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} H ${hook1} V ${midY} H ${hook2} V ${y2} H ${x2}`;
  }
  const mainScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);

  function syncScrollFromMain(e) {
    if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = e.target.scrollLeft;
  }
  function syncScrollFromBottom(e) {
    if (mainScrollRef.current) mainScrollRef.current.scrollLeft = e.target.scrollLeft;
  }
  const zoomLevel = ZOOM_LEVELS[zoomIndex];
  // ตอนพิมพ์ (ถ้าตั้งค่าไว้) จะ override ความหนาแน่นคอลัมน์วันที่ให้พอดีความกว้างกระดาษพอดี
  // โดยไม่ลดขนาดตัวอักษรเลย (คนละกลไกกับการซูมปกติ แค่ปรับ px/วัน ของแกนเวลาเท่านั้น)
  const pxPerDay = printPxPerDayOverride ?? PX_PER_DAY[zoomLevel];

  async function fetchGantt() {
    if (!projectId) return;
    setLoading(true);
    try {
      const [ganttRes, projectRes] = await Promise.all([
        client.get('/wbs-level3/gantt', { params: { project_id: projectId } }),
        client.get(`/projects/${projectId}`),
      ]);
      setData(ganttRes.data);
      setProject(projectRes.data.project);
      setError('');
    } catch (err) {
      setError('ดึงข้อมูล Gantt ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGantt();
    // เปลี่ยนโครงการ -> ล้างการแก้ไขที่พักไว้ของโครงการเก่าทิ้ง กัน id ปนกัน
    setEditMode(false);
    setPendingOps([]);
  }, [projectId]);

  // จอมือถือแนวตั้งแคบมาก คอลัมน์ 1-5 ที่แช่แข็งไว้ (รวม 530px) กว้างเกินหน้าจอทั้งใบไปแล้ว
  // ทำให้ไม่เหลือที่ว่างให้เห็นแท่ง Gantt เลยแม้จะเลื่อนก็ตาม (เพราะคอลัมน์แช่แข็งไม่เลื่อนหนีไปไหน)
  // แก้โดย "ปลด" ข้อจำกัด overflow:hidden/height:100vh ของ app-shell ทั้งระบบชั่วคราว เฉพาะตอนอยู่ Tab นี้
  // ให้กลับไปเป็นหน้าเว็บปกติที่เลื่อนได้ทั้งจอ (เหมือนเปิดเว็บ PC บนมือถือ) แทนที่จะถูกบีบใน viewport คงที่
  // ผลกับหน้าอื่นๆ ไม่มี เพราะ class นี้ถูกลบออกทันทีตอนออกจาก Tab/หน้านี้ และ CSS ที่ผูกไว้ก็ทำงานเฉพาะจอแคบ (@media) เท่านั้น
  useEffect(() => {
    const shellEl = document.querySelector('.app-shell');
    const html = document.documentElement;
    const { body } = document;
    shellEl?.classList.add('app-shell--gantt-mobile-scroll');
    html.classList.add('gantt-mobile-scroll');
    body.classList.add('gantt-mobile-scroll');
    return () => {
      shellEl?.classList.remove('app-shell--gantt-mobile-scroll');
      html.classList.remove('gantt-mobile-scroll');
      body.classList.remove('gantt-mobile-scroll');
    };
  }, []);

  // แจ้งฝั่งบน (ProjectData) ว่ามีการแก้ไขที่ยังไม่บันทึกอยู่หรือไม่ ใช้เตือนก่อนสลับ Tab/โครงการ
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(pendingOps.length > 0);
  }, [pendingOps, onDirtyChange]);

  // กันปิด/รีเฟรชแท็บเบราว์เซอร์ทิ้งข้อมูลที่ยังไม่บันทึก
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (pendingOps.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingOps]);

  // ระหว่างโหมดแก้ไข การลาก/พิมพ์วันที่ หรือเพิ่ม/ลบลิงก์เชื่อมโยง จะแค่พักไว้เป็น op ในเครื่องก่อน
  // (ไม่ยิงขึ้นเซิร์ฟเวอร์ทันที) — กันกรณีมือไปโดนแล้วข้อมูลถูกบันทึกทันทีโดยไม่ตั้งใจ
  function handleDateChange(activityId, startDate, endDate) {
    const durationDays = daysBetween(new Date(startDate), new Date(endDate)) + 1;
    setPendingOps((prev) => [
      // ตัด dateEdit op เดิมของกิจกรรมงานนี้ทิ้งก่อน (ถ้ามี) แล้วค่อยเติมอันใหม่ต่อท้าย
      // ให้ลำดับเวลาเทียบกับ op อื่น (เช่นลิงก์เชื่อมโยง) ตรงกับความเป็นจริงที่ผู้ใช้เพิ่งแก้ "ตอนนี้"
      ...prev.filter((op) => !(op.type === 'dateEdit' && op.activityId === activityId)),
      { type: 'dateEdit', activityId, start_date: startDate, end_date: endDate, duration_days: durationDays },
    ]);
  }

  function handleAddDependency(successorId, predecessorId, dependencyType, lagDays) {
    if (wouldCreateCycleLocal(predecessorId, successorId, liveState.linksBySuccessor)) {
      alert('ไม่สามารถเชื่อมโยงได้ เพราะจะทำให้เกิดการอ้างอิงวนกลับไปมา (circular dependency)');
      return;
    }
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPendingOps((prev) => [
      ...prev,
      { type: 'linkAdd', tempId, successor_id: successorId, predecessor_id: predecessorId, dependency_type: dependencyType, lag_days: lagDays },
    ]);
  }

  function handleRemoveDependency(successorId, linkRef) {
    if (linkRef.isPending) {
      // ยังไม่ได้บันทึกขึ้นเซิร์ฟเวอร์ — แค่ถอน op การเพิ่มออกจากคิว (ยกเลิกก่อนบันทึก)
      setPendingOps((prev) => prev.filter((op) => !(op.type === 'linkAdd' && op.tempId === linkRef.tempId)));
    } else {
      setPendingOps((prev) => [...prev, { type: 'linkDelete', linkId: linkRef.linkId, successor_id: successorId }]);
    }
  }

  // แก้ไขความสัมพันธ์ (FS/SS/FF/SF) หรือ Lag/Lead ของลิงก์ที่มีอยู่แล้ว — ไม่ต้องลบแล้วเพิ่มใหม่
  function handleEditDependency(successorId, linkRef, newType, newLag) {
    if (linkRef.isPending) {
      // ลิงก์นี้ยังไม่ได้บันทึก (แค่พักเป็น linkAdd อยู่) -> แก้ไข op เดิมตรงๆ ในคิว ไม่ต้องสร้าง op ใหม่
      setPendingOps((prev) => prev.map((op) => (
        op.type === 'linkAdd' && op.tempId === linkRef.tempId
          ? { ...op, dependency_type: newType, lag_days: newLag }
          : op
      )));
      return;
    }
    // ลิงก์นี้บันทึกอยู่ใน DB แล้ว -> พักเป็น op แก้ไข (ตัด linkEdit เดิมของลิงก์นี้ทิ้งก่อนถ้ามี แล้วเติมอันใหม่ต่อท้าย)
    setPendingOps((prev) => [
      ...prev.filter((op) => !(op.type === 'linkEdit' && op.linkId === linkRef.linkId)),
      { type: 'linkEdit', linkId: linkRef.linkId, successor_id: successorId, dependency_type: newType, lag_days: newLag },
    ]);
  }

  async function saveAllChanges() {
    if (pendingOps.length === 0) { setEditMode(false); return; }
    setSavingAll(true);
    try {
      // ไล่ยิงตามลำดับที่ผู้ใช้ทำจริง (ห้าม Promise.all เพราะลำดับมีผลต่อผลการคำนวณ cascade)
      for (const op of pendingOps) {
        if (op.type === 'dateEdit') {
          // eslint-disable-next-line no-await-in-loop
          await client.put(`/wbs-level3/${op.activityId}`, {
            start_date: op.start_date, end_date: op.end_date, duration_days: op.duration_days,
          });
        } else if (op.type === 'linkAdd') {
          // eslint-disable-next-line no-await-in-loop
          await client.post('/wbs-dependencies', {
            successor_id: op.successor_id,
            predecessor_id: op.predecessor_id,
            dependency_type: op.dependency_type,
            lag_days: op.lag_days,
          });
        } else if (op.type === 'linkEdit') {
          // eslint-disable-next-line no-await-in-loop
          await client.put(`/wbs-dependencies/${op.linkId}`, {
            dependency_type: op.dependency_type,
            lag_days: op.lag_days,
          });
        } else if (op.type === 'linkDelete') {
          // eslint-disable-next-line no-await-in-loop
          await client.delete(`/wbs-dependencies/${op.linkId}`);
        }
      }
      setPendingOps([]);
      setEditMode(false);
      await fetchGantt();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSavingAll(false);
    }
  }

  function cancelEdit() {
    if (pendingOps.length > 0) {
      if (!window.confirm('ยกเลิกการแก้ไขที่ยังไม่ได้บันทึกทั้งหมด?')) return;
    }
    setPendingOps([]);
    setEditMode(false);
  }

  // เปิด "หน้าต่างพิมพ์แยกต่างหาก" (blank window ใหม่) แล้วเขียน HTML ของตารางพิมพ์ลงไปเองทั้งหมด
  // พร้อม CSS ของตัวเองแบบสมบูรณ์ (ไม่พึ่ง CSS ของแอปหลักเลยแม้แต่นิดเดียว) — ตัดปัญหาเรื่อง sidebar/
  // app-shell/layout ของแอปหลักที่อาจมี height/overflow บางจุดไปรบกวนการคำนวณแบ่งหน้าพิมพ์ของเบราว์เซอร์
  // ออกไปทั้งหมด เพราะเอกสารในหน้าต่างใหม่นี้ไม่มี ancestor อะไรอื่นเลยนอกจาก <html><body> เปล่าๆ
  //
  // หมายเหตุ: ไม่วาดเส้นเชื่อมโยงในตารางพิมพ์แล้ว (ตามที่ตกลงกัน) เพราะเบราว์เซอร์ตัดสินใจแบ่งหน้าพิมพ์จริง
  // "หลังจาก" โค้ดฝั่งนี้รันไปแล้ว ไม่มีทางรู้ล่วงหน้าได้แน่นอนว่าแท่งไหนจะตกหน้าไหน (ต่างจากบนจอที่เป็น
  // ผืนต่อเนื่องไม่มีการแบ่งหน้าเลย วัดตำแหน่งจริงได้ตรงเป๊ะ) — ดูเส้นเชื่อมโยงได้จากหน้าจอ interactive แทน
  //
  // customStart/customEnd (จาก popup ตั้งค่าพิมพ์): ถ้าผู้ใช้กำหนดช่วงวันที่เอง จะใช้ช่วงนั้นตรงๆ
  // (รวมวันเริ่ม-สิ้นสุดที่ระบุพอดี ไม่ต้องบวก +7 เพิ่มเพราะผู้ใช้เลือกวันสิ้นสุดเองแล้ว) ถ้าไม่ระบุ (null)
  // จะจัดช่วงให้อัตโนมัติ: วันเริ่มโครงการ (เดิม) ถึงแท่งงานสุดท้ายจริง + 7 วัน
  function handlePrint(paperSize, orientation, customStart, customEnd) {
    const MM_TO_PX = 96 / 25.4;
    const DIMS_MM = { A4: [210, 297], A3: [297, 420] };
    const marginMm = 10;
    const [wMm, hMm] = DIMS_MM[paperSize] || DIMS_MM.A4;
    const pageWidthMm = orientation === 'landscape' ? Math.max(wMm, hMm) : Math.min(wMm, hMm);
    const printableWidthPx = (pageWidthMm - marginMm * 2) * MM_TO_PX;

    const rangeStart = customStart ? toDate(customStart) : timelineStart;
    const rangeEnd = customEnd ? toDate(customEnd) : null;
    // ตัดความยาวแกนเวลาให้สั้นแค่ "ถึงแท่งสุดท้าย + 7 วัน" (หรือช่วงที่ผู้ใช้กำหนดเอง) แทนความยาวเต็ม
    // ถึงวันสิ้นสุดสัญญา (ถ้ายาวกว่า) กันไม่ให้พื้นที่กระดาษที่บีบมาแล้วเสียไปกับช่วงว่างเปล่าหลังแท่งสุดท้าย
    const printTimelineDays = rangeEnd
      ? Math.max(1, daysBetween(rangeStart, rangeEnd) + 1)
      : Math.max(14, daysBetween(rangeStart, activityEnd) + 7);
    setPrintTimelineStartOverride(rangeStart);
    setPrintTotalDaysOverride(printTimelineDays);

    const FROZEN_WIDTH = 450; // = 240(ชื่อ)+45(%W)+35(วัน)+65(เริ่ม)+65(เสร็จ) ต้องตรงกับ CSS ของตารางพิมพ์เป๊ะ
    const availableTimelineWidthPx = Math.max(60, printableWidthPx - FROZEN_WIDTH);
    const computedPxPerDay = availableTimelineWidthPx / printTimelineDays;
    setPrintPxPerDayOverride(computedPxPerDay);
    setPrintModalOpen(false);

    // หน่วงให้ popup ปิด + React re-render ตารางด้วย px/วัน และความยาวแกนเวลาใหม่เสร็จก่อน
    // ค่อยดึง HTML ของตารางที่ render เสร็จแล้วไปใส่ในหน้าต่างใหม่
    setTimeout(() => {
      const tableEl = document.querySelector('.gantt-print-table');
      if (!tableEl) return;

      const printWindow = window.open('', '_blank', 'width=1100,height=800');
      if (!printWindow) {
        alert('เบราว์เซอร์บล็อกการเปิดหน้าต่างพิมพ์ กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้แล้วลองใหม่');
        setPrintPxPerDayOverride(null);
        setPrintTotalDaysOverride(null);
        setPrintTimelineStartOverride(null);
        return;
      }

      const titleText = `${project?.project_code || ''} — ${project?.name || ''}`;
      const printedOn = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
      // ดึงวันที่สัญญา + จำนวนวัน จากข้อมูลโปรเจกต์ตรงๆ (ที่กรอกไว้ตั้งแต่ Menu 1 เปิดโครงการ)
      // ถ้าโปรเจกต์ไม่มีวันที่สัญญา fallback กลับไปโชว์วันที่พิมพ์แทน
      function formatDMY(d) {
        if (!d) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
      }
      const contractInfoText = (contractStart && contractEnd)
        ? `วันที่สัญญา ${formatDMY(contractStart)} - ${formatDMY(contractEnd)} จำนวน ${project?.duration_days ?? (daysBetween(contractStart, contractEnd) + 1)} วัน`
        : `Gantt (ภาพรวม) · พิมพ์เมื่อ ${printedOn}`;
      // เอกสารในหน้าต่างนี้เป็น <html><body> เปล่าๆ ล้วนๆ ไม่มี ancestor อื่นมายุ่งเลย
      // ใส่ @page { size } ตรงๆ ได้อย่างปลอดภัยจริง (ต่างจากตอนพิมพ์ในหน้าเดิมที่มี layout ซับซ้อนกว่า)
      const pageRule = `@page { size: ${paperSize} ${orientation}; margin: ${marginMm}mm; }`;

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>${titleText}</title>
<style>${pageRule}\n${PRINT_WINDOW_CSS}</style>
</head>
<body>
  <button class="p-close-btn" onclick="window.close()">✕ ปิดหน้าต่างนี้</button>
  <div class="p-title">
    <h2>${titleText}</h2>
    <p>${contractInfoText}</p>
  </div>
  <div class="p-table-wrap">
    ${tableEl.outerHTML}
  </div>
</body>
</html>`);
      printWindow.document.close();

      // คืนค่าซูมปกติของหน้าเดิมทันที (หน้าต่างใหม่มี HTML ของตัวเองแล้ว ไม่ต้องพึ่ง React ของหน้าเดิมอีก)
      setPrintPxPerDayOverride(null);
      setPrintTotalDaysOverride(null);
      setPrintTimelineStartOverride(null);

      printWindow.focus();
      let printed = false;
      function triggerPrintOnce() {
        if (printed) return;
        printed = true;
        printWindow.print();
      }
      printWindow.onload = triggerPrintOnce;
      // เผื่อเบราว์เซอร์บางตัวไม่ยิง onload ให้ (เช่นเขียน document ผ่าน write() ตรงๆ) สั่งซ้ำอีกทีหลังหน่วงสั้นๆ
      setTimeout(triggerPrintOnce, 300);

      // ปิดหน้าต่างพิมพ์แยกนี้ทิ้งเองอัตโนมัติทันทีที่ผู้ใช้ปิดหน้าต่างพิมพ์ของเบราว์เซอร์
      // (ไม่ว่าจะกดพิมพ์จริงหรือกด Cancel/Esc) — กันไม่ให้ค้างซ้อนทับหน้าแอปหลักอยู่
      printWindow.addEventListener('afterprint', () => {
        printWindow.close();
      });
    }, 150);
  }

  if (loading && !data) return <p>กำลังโหลดข้อมูล...</p>;
  if (error) return <p className="dash__error">{error}</p>;
  if (!data || data.groups.length === 0) {
    return <div className="pdata-placeholder">ยังไม่มีข้อมูลกลุ่มงาน — ไปสร้างที่ Tab อื่นก่อน</div>;
  }

  const contractStart = project?.contract_start ? toDate(project.contract_start) : null;
  const contractEnd = project?.contract_end ? toDate(project.contract_end) : null;
  const hasAnyDate = Boolean(data.timeline.min_date && data.timeline.max_date);

  const timelineStart = printTimelineStartOverride || contractStart || (hasAnyDate ? toDate(data.timeline.min_date) : new Date());
  const activityEnd = hasAnyDate ? toDate(data.timeline.max_date) : new Date(Date.now() + 90 * MS_PER_DAY);
  const timelineEndRaw = contractEnd && contractEnd > activityEnd ? contractEnd : activityEnd;
  const totalDays = printTotalDaysOverride ?? Math.max(14, daysBetween(timelineStart, timelineEndRaw) + 8);
  const totalWidthPx = totalDays * pxPerDay;

  // สร้างคอลัมน์หัวตารางตามระดับซูม — ตอนพิมพ์แบบบีบความกว้าง (printPxPerDayOverride) บังคับกลุ่มหัวตาราง
  // เป็นระดับ "เดือน" เสมอ (หยาบสุด อ่านง่ายสุด) ไม่ว่าจอจะซูมระดับไหนอยู่ กัน label วัน/สัปดาห์ทับกันจนอ่านไม่ออก
  const effectiveZoomLevel = printPxPerDayOverride ? 'month' : zoomLevel;
  const headerCols = [];
  if (effectiveZoomLevel === 'day') {
    for (let offset = 0; offset < totalDays; offset += 1) {
      const d = new Date(timelineStart.getTime() + offset * MS_PER_DAY);
      headerCols.push({ label: `${d.getUTCDate()}`, widthPx: pxPerDay });
    }
  } else if (effectiveZoomLevel === 'week') {
    for (let offset = 0; offset < totalDays; offset += 7) {
      const d = new Date(timelineStart.getTime() + offset * MS_PER_DAY);
      headerCols.push({ label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, widthPx: Math.min(7, totalDays - offset) * pxPerDay });
    }
  } else {
    // month: แบ่งตามเดือนปฏิทินจริง ไม่ใช่ทุก 30 วัน
    let cursor = new Date(timelineStart.getTime());
    let remainingDays = totalDays;
    while (remainingDays > 0) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      const daysInThisMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate() - cursor.getUTCDate() + 1;
      const span = Math.min(daysInThisMonth, remainingDays);
      headerCols.push({ label: `${THAI_MONTHS_SHORT[month]} ${year + 543}`, widthPx: span * pxPerDay });
      cursor = new Date(cursor.getTime() + span * MS_PER_DAY);
      remainingDays -= span;
    }
  }

  function barStyle(startStr, endStr) {
    if (!startStr || !endStr) return null;
    const start = toDate(startStr);
    const end = toDate(endStr);
    const offsetDays = daysBetween(timelineStart, start);
    const spanDays = daysBetween(start, end) + 1;
    return {
      left: `${offsetDays * pxPerDay}px`,
      width: `${Math.max(3, spanDays * pxPerDay)}px`,
    };
  }

  // เส้นวันสิ้นสุดสัญญา ต้องชิดขอบ "ขวา" ของช่องวันนั้น (เหมือนขอบขวาสุดของแท่งงานที่จบวันเดียวกัน)
  // ไม่ใช่ขอบซ้าย — เดิมขาด +1 วันไป ทำให้เส้นเพี้ยนไปทางซ้าย 1 ช่องเสมอ
  const contractEndOffsetPx = contractEnd ? (daysBetween(timelineStart, contractEnd) + 1) * pxPerDay : null;

  // เส้นบางแบ่งเขตตามเดือน สำหรับ "ตารางพิมพ์" โดยเฉพาะ — ให้ลากตาตามลงไปทุกแถวได้ว่าตรงกับเดือนไหน
  // ไม่ใช่โผล่แค่แถวหัวตาราง ทำโดยคำนวณตำแหน่งเส้นแบ่งของแต่ละเดือนจาก headerCols (ซึ่งบังคับเป็นระดับ
  // เดือนอยู่แล้วตอนพิมพ์) แล้วฝัง background-image เดียวกันนี้ไว้ในทุกแถวของตาราง ให้เส้นเรียงตรงกันเป๊ะทุกแถว
  //
  // หมายเหตุ: จงใจ "ไม่ใช้ linear-gradient เดียวที่มีหลาย hard-edge stop ต่อกัน" (แบบที่เคยลองมาก่อน)
  // เพราะเบราว์เซอร์คำนวณตอนพิมพ์จริงผิดพลาด/ไม่ครบทุกเส้น — เปลี่ยนมาใช้ background layer แยกทีละเส้น
  // (คนละ layer กันคนละตำแหน่ง) แทน ซึ่งเป็นสีทึบล้วนๆ ไม่มีการไล่สี เสถียรกับการพิมพ์มากกว่ามาก
  const monthBoundaryOffsets = [];
  {
    let cum = 0;
    headerCols.forEach((c, i) => {
      cum += c.widthPx;
      if (i < headerCols.length - 1) monthBoundaryOffsets.push(Math.round(cum));
    });
  }
  const printMonthGridStyle = monthBoundaryOffsets.length > 0
    ? {
      backgroundImage: monthBoundaryOffsets.map(() => 'linear-gradient(#C7CDD1, #C7CDD1)').join(', '),
      backgroundRepeat: 'no-repeat',
      backgroundSize: monthBoundaryOffsets.map(() => '0.5px 100%').join(', '),
      backgroundPosition: monthBoundaryOffsets.map((x) => `${x}px 0`).join(', '),
    }
    : {};

  // แถบเวลา + แท่งงาน สำหรับ "ตารางพิมพ์" โดยเฉพาะ — จงใจ "ไม่ใช้ position:absolute/relative เลย"
  // (ต่างจากแท่งบนจอที่ใช้ absolute วางทับ) เพราะเบราว์เซอร์บางตัวคำนวณแบ่งหน้าพิมพ์ผิดพลาด/ไม่ยอมขึ้น
  // หน้าใหม่เลย เวลาเจอ position:absolute ซ้ำๆ กันหลายสิบ-ร้อยแถวใน table — ใช้ flex + กล่องเว้นระยะ
  // (spacer) ว่างๆ ผลักแท่งให้ไปอยู่ตำแหน่งที่ถูกต้องแทน ปลอดภัยกับการแบ่งหน้าพิมพ์กว่ามาก
  function renderPrintTimelineCell(startStr, endStr, barColorClass) {
    const style = barStyle(startStr, endStr);
    const leftPx = style ? parseFloat(style.left) : totalWidthPx;
    const widthPx = style ? parseFloat(style.width) : 0;
    return (
      <div
        className="gantt-print-table__timeline-cell"
        style={{ width: `${totalWidthPx}px`, ...printMonthGridStyle }}
      >
        <div className="gantt-print-table__timeline-spacer" style={{ width: `${leftPx}px` }} />
        {style && <div className={`gantt-print-bar ${barColorClass}`} style={{ width: `${widthPx}px` }} />}
      </div>
    );
  }


  // รายชื่อกิจกรรมงาน (JE) ทั้งหมดในโปรเจกต์นี้แบบแบน ใช้เป็นตัวเลือก "ต้นทาง" ใน popup เชื่อมโยงวันที่
  const allActivitiesFlat = data.groups.flatMap((g) => g.items.flatMap((it) => it.activities));
  const activityById = new Map(allActivitiesFlat.map((a) => [a.id, a]));

  // ลิงก์เชื่อมโยง "live" (รวม pendingOps แล้ว) ของกิจกรรมงานที่กำลังเปิด popup อยู่ — แปลงให้พร้อมแสดงผล
  const activeDepLinks = depModalTarget
    ? (liveState.linksBySuccessor.get(depModalTarget.id) || []).map((d) => {
        const pred = activityById.get(d.predecessor_id);
        return {
          key: d._linkId != null ? `existing-${d._linkId}` : `pending-${d._tempId}`,
          linkId: d._linkId,
          tempId: d._tempId,
          isPending: d._linkId == null,
          predecessor_id: d.predecessor_id,
          predecessor_code: pred?.code || '?',
          predecessor_name: pred?.name || '',
          dependency_type: d.dependency_type,
          lag_days: d.lag_days,
        };
      })
    : [];

  return (
    <div className="gantt">
      {/* หัวกระดาษตอนพิมพ์เท่านั้น (ซ่อนไว้บนหน้าจอปกติ) — โชว์ชื่อ/รหัสโครงการให้รู้ว่าพิมพ์มาจากโครงการไหน */}
      <div className="gantt__print-title">
        <h2>{project?.project_code} — {project?.name}</h2>
        <p>Gantt (ภาพรวม) · พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {data.completeness && !data.completeness.all_complete && (
        <p className="pdata-status pdata-status--warn" style={{ marginBottom: 10 }}>
          ⚠ มี {data.completeness.incomplete_level2} จาก {data.completeness.total_level2} รายการงาน ที่กิจกรรมงาน (JE) ยังแตกไม่ครบ 100%
          {' '}— %Weight ของรายการเหล่านั้นยังไม่สมบูรณ์
        </p>
      )}

      <div className="gantt__toolbar">
        {contractStart && contractEnd && (
          <p className="gantt__contract-note">
            ระยะเวลาสัญญา: <strong>{project.duration_days ?? daysBetween(contractStart, contractEnd) + 1} วัน</strong>
          </p>
        )}

        <div className="gantt__toolbar-right">
          <div className="gantt__zoom">
            <button
              type="button"
              className="gantt__zoom-btn"
              onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
              disabled={zoomIndex === 0}
            >
              − ลด
            </button>
            <span className="gantt__zoom-label">{{ month: 'รายเดือน', week: 'รายสัปดาห์', day: 'รายวัน' }[zoomLevel]}</span>
            <button
              type="button"
              className="gantt__zoom-btn"
              onClick={() => setZoomIndex((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            >
              + ขยาย
            </button>
            <button
              type="button"
              className={`gantt__zoom-btn ${showDependencyLines ? 'gantt__zoom-btn--active' : ''}`}
              onClick={() => setShowDependencyLines((v) => !v)}
              title={showDependencyLines ? 'ซ่อนเส้นเชื่อมโยง' : 'แสดงเส้นเชื่อมโยง'}
            >
              🔗 เส้นเชื่อมโยง {showDependencyLines ? 'เปิด' : 'ปิด'}
            </button>
          </div>

          <div className="gantt__edit-controls">
            {!editMode ? (
              <button type="button" className="gantt__edit-btn gantt__edit-btn--edit" onClick={() => setEditMode(true)}>
                ✎ แก้ไขข้อมูล
              </button>
            ) : (
              <>
                <span className="gantt__edit-status">
                  โหมดแก้ไข
                  {pendingOps.length > 0 && ` · แก้ไขแล้ว ${pendingOps.length} รายการ (ยังไม่บันทึก)`}
                </span>
                <button type="button" className="gantt__edit-btn gantt__edit-btn--cancel" onClick={cancelEdit} disabled={savingAll}>
                  ยกเลิก
                </button>
                <button type="button" className="gantt__edit-btn gantt__edit-btn--save" onClick={saveAllChanges} disabled={savingAll}>
                  {savingAll ? 'กำลังบันทึก...' : '✓ บันทึก'}
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="gantt__edit-btn gantt__print-btn"
            onClick={() => setPrintModalOpen(true)}
            title="พิมพ์ตาราง Gantt"
          >
            🖨 พิมพ์
          </button>
        </div>
      </div>

      {!hasAnyDate && (
        <p className="pdata-status pdata-status--warn" style={{ marginBottom: 10 }}>
          ยังไม่มีกิจกรรมงานไหนกำหนดวันที่เลย — ลองลากบนแถบสีส้มด้านล่างเพื่อกำหนดวันแรกได้เลย
        </p>
      )}

      <div className="gantt__scroll" ref={mainScrollRef} onScroll={syncScrollFromMain}>
        <div className="gantt__grid" ref={gridRef} style={{ minWidth: `${570 + totalWidthPx}px` }}>
          <div className="gantt__header">
            <div className="gantt__header-label">โครงสร้างงาน</div>
            <div className="gantt__header-cell gantt__header-cell--weight">%W</div>
            <div className="gantt__header-cell gantt__header-cell--days">วัน</div>
            <div className="gantt__header-cell gantt__header-cell--date">เริ่ม</div>
            <div className="gantt__header-cell gantt__header-cell--date">เสร็จ</div>
            <div className="gantt__header-weeks" style={{ width: `${totalWidthPx}px` }}>
              {headerCols.map((c, i) => (
                <div key={i} className="gantt__week" style={{ width: `${c.widthPx}px` }}>{c.label}</div>
              ))}
              {contractEndOffsetPx !== null && contractEndOffsetPx >= 0 && contractEndOffsetPx <= totalWidthPx && (
                <div className="gantt__contract-line" style={{ left: `${contractEndOffsetPx}px` }} title="วันสิ้นสุดสัญญา" />
              )}
            </div>
          </div>

          {data.groups.map((g) => (
            <div key={g.id}>
              <div className="gantt__row gantt__row--l1">
                <div className="gantt__label"><span className="mono">{g.code}</span> {g.name}</div>
                <div className="gantt__cell gantt__cell--weight gantt__cell--weight-emphasis">{g.weight_percent.toFixed(2)}%</div>
                <div className="gantt__cell gantt__cell--days">{g.start_date && g.end_date ? daysBetween(toDate(g.start_date), toDate(g.end_date)) + 1 : '-'}</div>
                <div className="gantt__cell gantt__cell--date">{fmtShort(g.start_date)}</div>
                <div className="gantt__cell gantt__cell--date">{fmtShort(g.end_date)}</div>
                <div className="gantt__track" style={{ width: `${totalWidthPx}px` }}>
                  {barStyle(g.start_date, g.end_date) && <div className="gantt__bar gantt__bar--l1" style={barStyle(g.start_date, g.end_date)} />}
                </div>
              </div>

              {g.items.map((it) => (
                <div key={it.id}>
                  <div className="gantt__row gantt__row--l2">
                    <div
                      className={`gantt__label ${editMode ? 'gantt__label--clickable' : 'gantt__label--locked'} ${it.is_complete === false ? 'gantt__label--incomplete' : ''}`}
                      onClick={() => {
                        if (!editMode) return; // ต้องเปิดโหมดแก้ไขก่อนถึงจะเพิ่มกิจกรรมงานได้
                        setQuickAddTarget({ level2Id: it.id, level2Name: `${it.code} ${it.name}` });
                      }}
                      title={editMode ? 'คลิกเพื่อเพิ่มกิจกรรมงานในรายการนี้' : 'กด "✎ แก้ไขข้อมูล" ด้านบนก่อนถึงจะเพิ่มกิจกรรมงานได้'}
                    >
                      <span className="mono">{it.code}</span> {it.name}
                      <span className="gantt__add-hint">+ เพิ่ม</span>
                    </div>
                    <div className="gantt__cell gantt__cell--weight">{it.weight_percent.toFixed(2)}%</div>
                    <div className="gantt__cell gantt__cell--days">{it.start_date && it.end_date ? daysBetween(toDate(it.start_date), toDate(it.end_date)) + 1 : '-'}</div>
                    <div className="gantt__cell gantt__cell--date">{fmtShort(it.start_date)}</div>
                    <div className="gantt__cell gantt__cell--date">{fmtShort(it.end_date)}</div>
                    <div className="gantt__track" style={{ width: `${totalWidthPx}px` }}>
                      {barStyle(it.start_date, it.end_date) && (
                        <div
                          className={`gantt__bar gantt__bar--l2 ${it.is_complete === false ? 'gantt__bar--incomplete' : ''}`}
                          style={barStyle(it.start_date, it.end_date)}
                        />
                      )}
                    </div>
                  </div>

                  {it.activities.map((act) => {
                    const effAct = getEffectiveActivity(act);
                    const liveLinks = liveState.linksBySuccessor.get(act.id) || [];
                    // ลำดับความสำคัญเดียวกับ schedulingSim.js/scheduling.js: ถ้ามีลิงก์ FS/SS (คุมวันเริ่ม)
                    // อยู่ด้วย ให้ยึดวันเริ่มเป็นหลักเหมือนเดิม (ตรงกับที่ระบบคำนวณจริง) — จะยึดวันเสร็จเป็นหลัก
                    // (isEndAnchored) ก็ต่อเมื่อมีเฉพาะลิงก์ FF/SF เท่านั้น ไม่มี FS/SS ปนอยู่เลย
                    const hasStartAnchorDep = liveLinks.some((d) => d.dependency_type === 'FS' || d.dependency_type === 'SS');
                    const hasEndAnchorDep = liveLinks.some((d) => d.dependency_type === 'FF' || d.dependency_type === 'SF');
                    const isEndAnchored = hasEndAnchorDep && !hasStartAnchorDep;
                    // ถือว่า "แก้ไขค้างไว้" ถ้าวันที่ live ต่างจากค่าจริงบนเซิร์ฟเวอร์ (ครอบคลุมทั้งแก้เอง
                    // และกรณีถูก cascade มาจากกิจกรรมงานต้นทางที่ผูกกันไว้)
                    const isDirty = pendingOps.length > 0 && (
                      effAct.start_date !== act.start_date
                      || effAct.end_date !== act.end_date
                      || effAct.duration_days !== act.duration_days
                    );
                    return (
                      <div
                        key={act.id}
                        ref={(el) => {
                          if (el) rowRefs.current[act.id] = el;
                          else delete rowRefs.current[act.id];
                        }}
                        className={`gantt__row gantt__row--l3 ${isDirty ? 'gantt__row--dirty' : ''}`}
                      >
                        <div
                          className={`gantt__label ${editMode ? 'gantt__label--clickable' : 'gantt__label--locked'}`}
                          onClick={() => {
                            if (!editMode) return; // ต้องเปิดโหมดแก้ไขก่อนถึงจะเชื่อมโยงวันที่ได้
                            setDepModalTarget({ id: act.id, code: act.code, name: act.name });
                          }}
                          title={editMode ? 'คลิกเพื่อเชื่อมโยงวันที่กับกิจกรรมงานอื่น' : 'กด "✎ แก้ไขข้อมูล" ด้านบนก่อนถึงจะเชื่อมโยงวันที่ได้'}
                        >
                          <span className="mono">{act.code}</span> {act.name}
                          {act.weight_percent === 0 && <span className="gantt__unweighted-badge">ยังไม่ตั้งมูลค่า</span>}
                          {liveLinks.length > 0 && (
                            <span className="gantt__link-badge" title={`เชื่อมโยงจาก ${liveLinks.length} ต้นทาง${isEndAnchored ? ' (ยึดวันเสร็จเป็นหลัก)' : ''}`}>
                              🔗 {liveLinks.length}
                            </span>
                          )}
                          {isDirty && <span className="gantt__unsaved-badge">ยังไม่บันทึก</span>}
                          <span className="gantt__add-hint">🔗 เชื่อมโยง</span>
                        </div>
                        <div className="gantt__cell gantt__cell--weight">{Math.round(act.share_percent)}%</div>
                        <ActivityDateCells act={effAct} onDateChange={handleDateChange} editable={editMode} isEndAnchored={isEndAnchored} />
                        <div style={{ width: `${totalWidthPx}px` }}>
                          <ActivityTrack
                            act={effAct}
                            timelineStart={timelineStart}
                            totalDays={totalDays}
                            barStyleFn={barStyle}
                            onDateChange={handleDateChange}
                            saving={savingAll}
                            editable={editMode}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          {showDependencyLines && connectorLines.length > 0 && (
            <svg className="gantt__connectors" width={570 + totalWidthPx} height={connectorsHeight}>
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="gantt__connector-arrowhead" />
                </marker>
                <marker id="gantt-arrow-pending" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="gantt__connector-arrowhead gantt__connector-arrowhead--pending" />
                </marker>
              </defs>
              {connectorLines.map((l) => (
                <path
                  key={l.key}
                  d={buildConnectorPath(l.x1, l.y1, l.x2, l.y2, l.predAnchor, l.succAnchor)}
                  className={`gantt__connector-path ${l.isPending ? 'gantt__connector-path--pending' : ''}`}
                  markerEnd={l.isPending ? 'url(#gantt-arrow-pending)' : 'url(#gantt-arrow)'}
                />
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="gantt__bottom-scrollbar" ref={bottomScrollRef} onScroll={syncScrollFromBottom}>
        <div style={{ width: `${570 + totalWidthPx}px`, height: 1 }} />
      </div>

      {/* ตารางสำหรับพิมพ์โดยเฉพาะ (<table> จริง ซ่อนไว้ปกติ โชว์เฉพาะตอนพิมพ์) — ใช้ <thead> จริง
          เพื่อให้หัวตารางซ้ำทุกหน้าพิมพ์ได้เสถียรในทุกเบราว์เซอร์ (ต่างจากตัว Gantt แบบ interactive
          ด้านบนซึ่งใช้ div+flex+sticky ที่เบราว์เซอร์ไม่รองรับการซ้ำหัวตารางแบบนี้) */}
      <table className="gantt-print-table">
        <thead>
          <tr>
            <th className="gantt-print-table__label-col">โครงสร้างงาน</th>
            <th>%W</th>
            <th>วัน</th>
            <th>เริ่ม</th>
            <th>เสร็จ</th>
            <th>
              <div className="gantt-print-table__timeline-header" style={{ width: `${totalWidthPx}px` }}>
                {headerCols.map((c, i) => (
                  <div key={i} className="gantt-print-table__timeline-header-cell" style={{ width: `${c.widthPx}px` }}>
                    {c.label}
                  </div>
                ))}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.groups.flatMap((g) => [
            <tr key={`print-g-${g.id}`} className="gantt-print-table__row gantt-print-table__row--l1">
              <td className="gantt-print-table__label-col"><span className="mono">{g.code}</span> {g.name}</td>
              <td className="gantt-print-table__weight">{g.weight_percent.toFixed(2)}%</td>
              <td>{g.start_date && g.end_date ? daysBetween(toDate(g.start_date), toDate(g.end_date)) + 1 : '-'}</td>
              <td>{fmtShort(g.start_date)}</td>
              <td>{fmtShort(g.end_date)}</td>
              <td>
                {renderPrintTimelineCell(g.start_date, g.end_date, 'gantt-print-bar--l1')}
              </td>
            </tr>,
            ...g.items.flatMap((it) => [
              <tr key={`print-it-${it.id}`} className="gantt-print-table__row gantt-print-table__row--l2">
                <td className="gantt-print-table__label-col"><span className="mono">{it.code}</span> {it.name}</td>
                <td>{it.weight_percent.toFixed(2)}%</td>
                <td>{it.start_date && it.end_date ? daysBetween(toDate(it.start_date), toDate(it.end_date)) + 1 : '-'}</td>
                <td>{fmtShort(it.start_date)}</td>
                <td>{fmtShort(it.end_date)}</td>
                <td>
                  {renderPrintTimelineCell(it.start_date, it.end_date, 'gantt-print-bar--l2')}
                </td>
              </tr>,
              ...it.activities.map((act) => {
                const eff = getEffectiveActivity(act);
                return (
                  <tr key={`print-act-${act.id}`} data-row-id={`act-${act.id}`} className="gantt-print-table__row gantt-print-table__row--l3">
                    <td className="gantt-print-table__label-col">
                      <span className="mono">{act.code}</span> {act.name}
                    </td>
                    <td>{Math.round(act.share_percent)}%</td>
                    <td>{eff.duration_days ?? '-'}</td>
                    <td>{fmtShort(eff.start_date)}</td>
                    <td>{fmtShort(eff.end_date)}</td>
                    <td>
                      {renderPrintTimelineCell(eff.start_date, eff.end_date, 'gantt-print-bar--l3')}
                    </td>
                  </tr>
                );
              }),
            ]),
          ])}
        </tbody>
      </table>

      <p className="gantt__note">
        {editMode
          ? 'ลากบนแถบสีส้ม หรือกรอกช่อง วัน/เริ่ม/เสร็จ ด้านซ้ายก็ได้ — เปลี่ยนวันเริ่มแล้ววันเสร็จจะขยับตามจำนวนวันให้อัตโนมัติ · แก้เสร็จอย่าลืมกด "บันทึก" ด้านบน'
          : 'ตอนนี้เป็นโหมดดูอย่างเดียว — กด "✎ แก้ไขข้อมูล" ด้านบนก่อนถึงจะลากหรือแก้วันที่ได้'}
      </p>
      <p className="gantt__note gantt__note--mobile-hint">
        📱 จอมือถือแคบ: ปาดนิ้วเลื่อนตารางไปทางขวาเพื่อดูแท่ง Gantt ได้เลย หรือบีบนิ้วซูมออก (pinch to zoom)
        เพื่อดูภาพรวมทั้งหมดแบบเดียวกับจอคอมได้เช่นกัน
      </p>

      {quickAddTarget && (
        <QuickAddActivityModal
          level2Id={quickAddTarget.level2Id}
          level2Name={quickAddTarget.level2Name}
          onClose={() => setQuickAddTarget(null)}
          onSaved={() => { setQuickAddTarget(null); fetchGantt(); }}
        />
      )}

      {depModalTarget && (
        <DependencyModal
          activity={depModalTarget}
          allActivities={allActivitiesFlat}
          links={activeDepLinks}
          onAdd={(predecessorId, dependencyType, lagDays) => handleAddDependency(depModalTarget.id, predecessorId, dependencyType, lagDays)}
          onEdit={(linkRef, newType, newLag) => handleEditDependency(depModalTarget.id, linkRef, newType, newLag)}
          onRemove={(linkRef) => handleRemoveDependency(depModalTarget.id, linkRef)}
          onClose={() => setDepModalTarget(null)}
        />
      )}

      {printModalOpen && (
        <PrintPreviewModal
          onClose={() => setPrintModalOpen(false)}
          onPrint={handlePrint}
          defaultStart={contractStart ? fmtISO(new Date(contractStart.getTime() - 7 * MS_PER_DAY)) : ''}
          defaultEnd={contractEnd ? fmtISO(new Date(contractEnd.getTime() + 7 * MS_PER_DAY)) : ''}
        />
      )}
    </div>
  );
}
