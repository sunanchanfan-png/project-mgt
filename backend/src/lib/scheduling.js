// src/lib/scheduling.js
// เครื่องคำนวณตารางเวลาแบบง่าย สำหรับ "เชื่อมโยงวันที่" ระหว่างกิจกรรมงาน (wbs_level3)
// เลียนแบบ Task Dependency ของ MS Project — รองรับ 4 ความสัมพันธ์ + Lag/Lead (+/- วัน):
//   FS (Finish-to-Start, ค่าเริ่มต้น) : successor เริ่ม = predecessor เสร็จ + 1 + lag
//   SS (Start-to-Start)               : successor เริ่ม = predecessor เริ่ม + lag
//   FF (Finish-to-Finish)             : successor เสร็จ = predecessor เสร็จ + lag
//   SF (Start-to-Finish)              : successor เสร็จ = predecessor เริ่ม - 1 + lag
//                                        (สมมาตรกับ FS ที่บวก 1 จากวันเสร็จ — SF ก็ต้องลบ 1 จากวันเริ่ม
//                                         เพื่อให้ successor เสร็จ "ก่อนวันที่ predecessor เริ่ม" พอดี ไม่ทับซ้อนกัน)
// ถ้ากิจกรรมงานหนึ่งมีหลาย predecessor พร้อมกัน จะยึดวันที่ "ช้าที่สุด" (max) ของทุกเงื่อนไข
// ที่ผูกกับจุดยึดเดียวกัน (กลุ่มคุมวันเริ่ม กับกลุ่มคุมวันเสร็จ แยกกัน) แล้วคำนวณอีกด้านจากจำนวนวันเดิม
//
// เมื่อวันที่ของกิจกรรมงานหนึ่งเปลี่ยน (ไม่ว่าจะจากการแก้ตรงๆ หรือจากการคำนวณ cascade)
// จะไล่คำนวณต่อไปยังกิจกรรมงานที่เชื่อมโยงเป็น successor ของมันเป็นทอดๆ โดยกัน loop ไม่รู้จบ
// ด้วย `visited` set (กันกรณีมีวงจรหลุดรอดเข้ามาในข้อมูลได้ แม้ปกติจะเช็คกันไว้ตอนสร้างลิงก์แล้ว)

const { query } = require('../db');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffDays(startStr, endStr) {
  const [y1, m1, d1] = String(startStr).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(endStr).slice(0, 10).split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * เช็คว่าถ้าเพิ่ม edge ใหม่ (predecessorId -> successorId) แล้วจะทำให้เกิดวงจร (circular dependency) หรือไม่
 * ทำโดยไล่จาก successorId เดินตามลูกโซ่ "ใครเป็น successor ของใครต่อ" ไปข้างหน้า
 * ถ้าเดินไปเจอ predecessorId แปลว่า predecessorId เป็นลูกหลานของ successorId อยู่แล้ว -> จะเกิดวงจรถ้าเพิ่ม edge นี้
 */
async function wouldCreateCycle(predecessorId, successorId) {
  const allDeps = await query('SELECT predecessor_id, successor_id FROM project_mgt.wbs_dependencies');
  const forward = {};
  allDeps.rows.forEach((r) => {
    if (!forward[r.predecessor_id]) forward[r.predecessor_id] = [];
    forward[r.predecessor_id].push(r.successor_id);
  });

  const visited = new Set();
  const queue = [successorId];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (String(cur) === String(predecessorId)) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    (forward[cur] || []).forEach((next) => queue.push(next));
  }
  return false;
}

/**
 * ไล่คำนวณต่อไปยังกิจกรรมงานที่เชื่อมโยง "predecessorId" นี้เป็นต้นทางของตัวเอง (ลูกโซ่ทอดต่อไป)
 */
async function cascadeFromPredecessor(predecessorId, visited) {
  const successorsResult = await query(
    'SELECT successor_id FROM project_mgt.wbs_dependencies WHERE predecessor_id = $1',
    [predecessorId]
  );
  for (const row of successorsResult.rows) {
    // eslint-disable-next-line no-await-in-loop
    await recalcActivity(row.successor_id, visited);
  }
}

/**
 * คำนวณวันที่ของกิจกรรมงาน (activityId) ใหม่ จากลิงก์ predecessor ทั้งหมดที่มันอ้างอิงอยู่
 * ถ้าวันที่เปลี่ยนจริง จะบันทึกลง DB แล้วไล่ cascade ต่อไปยัง successor ของมันเองอีกทอดหนึ่ง
 */
async function recalcActivity(activityId, visited = new Set()) {
  if (visited.has(activityId)) return; // กัน loop เผื่อมีวงจรหลุดรอดมาได้
  visited.add(activityId);

  const depsResult = await query(
    `SELECT d.dependency_type, d.lag_days, p.start_date AS p_start, p.end_date AS p_end
     FROM project_mgt.wbs_dependencies d
     JOIN project_mgt.wbs_level3 p ON p.id = d.predecessor_id
     WHERE d.successor_id = $1`,
    [activityId]
  );
  if (depsResult.rows.length === 0) return; // ไม่มี predecessor ผูกอยู่ ไม่ต้องคำนวณอะไร

  let candidateStart = null; // จากความสัมพันธ์ FS/SS -> คุมวันเริ่ม
  let candidateEnd = null;   // จากความสัมพันธ์ FF/SF -> คุมวันเสร็จ

  depsResult.rows.forEach((dep) => {
    if (!dep.p_start || !dep.p_end) return; // predecessor ยังไม่มีวันที่ ข้ามเงื่อนไขนี้ไปก่อน
    let candidate;
    if (dep.dependency_type === 'FS') candidate = addDays(dep.p_end, 1 + dep.lag_days);
    else if (dep.dependency_type === 'SS') candidate = addDays(dep.p_start, dep.lag_days);
    else if (dep.dependency_type === 'FF') candidate = addDays(dep.p_end, dep.lag_days);
    else if (dep.dependency_type === 'SF') candidate = addDays(dep.p_start, -1 + dep.lag_days);
    else return;

    if (dep.dependency_type === 'FS' || dep.dependency_type === 'SS') {
      if (candidateStart === null || candidate > candidateStart) candidateStart = candidate;
    } else if (candidateEnd === null || candidate > candidateEnd) {
      candidateEnd = candidate;
    }
  });

  if (candidateStart === null && candidateEnd === null) return; // predecessor ทุกตัวยังไม่มีวันที่เลย

  const actResult = await query(
    'SELECT start_date, end_date, duration_days FROM project_mgt.wbs_level3 WHERE id = $1',
    [activityId]
  );
  if (actResult.rows.length === 0) return;
  const act = actResult.rows[0];
  const duration = act.duration_days || null;

  let newStart = act.start_date;
  let newEnd = act.end_date;
  let newDuration = duration;

  if (candidateStart !== null) {
    newStart = candidateStart;
    if (duration) {
      newEnd = addDays(newStart, duration - 1);
    } else if (act.end_date) {
      newDuration = Math.max(1, diffDays(newStart, act.end_date) + 1);
      newEnd = addDays(newStart, newDuration - 1);
    }
  } else if (candidateEnd !== null) {
    newEnd = candidateEnd;
    if (duration) {
      newStart = addDays(newEnd, -(duration - 1));
    } else if (act.start_date) {
      newDuration = Math.max(1, diffDays(act.start_date, newEnd) + 1);
      newStart = addDays(newEnd, -(newDuration - 1));
    }
  }

  const changed = newStart !== act.start_date || newEnd !== act.end_date || newDuration !== act.duration_days;
  if (!changed) return;

  await query(
    `UPDATE project_mgt.wbs_level3
     SET start_date = $1, end_date = $2, duration_days = $3, updated_at = NOW()
     WHERE id = $4`,
    [newStart, newEnd, newDuration, activityId]
  );

  await cascadeFromPredecessor(activityId, visited);
}

module.exports = { addDays, diffDays, wouldCreateCycle, recalcActivity, cascadeFromPredecessor };
