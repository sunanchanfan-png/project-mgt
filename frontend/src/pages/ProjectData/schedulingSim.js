// src/pages/ProjectData/schedulingSim.js
// จำลองการคำนวณตารางเวลาแบบเดียวกับฝั่ง backend (backend/src/lib/scheduling.js) ไว้ทำ "live preview"
// ในเบราว์เซอร์ก่อนกด "บันทึก" จริง — สูตรคำนวณต้องตรงกับฝั่งเซิร์ฟเวอร์เป๊ะ เพื่อให้สิ่งที่เห็นตอน preview
// ตรงกับผลลัพธ์จริงที่จะได้หลังกดบันทึก 100% (ถ้าแก้สูตรฝั่งใดฝั่งหนึ่ง ต้องแก้อีกฝั่งให้ตรงกันด้วย)
//
// ทำงานบน "สำเนาในหน่วยความจำ" ของวันที่ + กราฟเชื่อมโยง (ไม่ยุ่งกับ DB) เพื่อ preview ผลลัพธ์
// ของรายการที่ยัง "พักไว้" (pending ops) ก่อนกดบันทึกจริง

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffDays(startStr, endStr) {
  const [y1, m1, d1] = String(startStr).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(endStr).slice(0, 10).split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * เช็คว่าถ้าเพิ่ม edge ใหม่ (predecessorId -> successorId) แล้วจะทำให้เกิดวงจรหรือไม่
 * ใช้ linksBySuccessor แบบเดียวกับที่ recalcActivity ใช้ (Map<successorId, [{predecessor_id,...}]>)
 */
export function wouldCreateCycleLocal(predecessorId, successorId, linksBySuccessor) {
  const forward = new Map();
  linksBySuccessor.forEach((deps, succId) => {
    deps.forEach((d) => {
      if (!forward.has(d.predecessor_id)) forward.set(d.predecessor_id, []);
      forward.get(d.predecessor_id).push(succId);
    });
  });

  const visited = new Set();
  const queue = [successorId];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === predecessorId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    (forward.get(cur) || []).forEach((next) => queue.push(next));
  }
  return false;
}

export function cascadeFromPredecessor(predecessorId, datesMap, linksBySuccessor, visited) {
  linksBySuccessor.forEach((deps, succId) => {
    if (deps.some((d) => d.predecessor_id === predecessorId)) {
      // eslint-disable-next-line no-use-before-define
      recalcActivity(succId, datesMap, linksBySuccessor, visited);
    }
  });
}

export function recalcActivity(activityId, datesMap, linksBySuccessor, visited) {
  if (visited.has(activityId)) return;
  visited.add(activityId);

  const deps = linksBySuccessor.get(activityId) || [];
  if (deps.length === 0) return;

  let candidateStart = null;
  let candidateEnd = null;

  deps.forEach((dep) => {
    const p = datesMap.get(dep.predecessor_id);
    if (!p || !p.start_date || !p.end_date) return;
    let candidate;
    if (dep.dependency_type === 'FS') candidate = addDays(p.end_date, 1 + dep.lag_days);
    else if (dep.dependency_type === 'SS') candidate = addDays(p.start_date, dep.lag_days);
    else if (dep.dependency_type === 'FF') candidate = addDays(p.end_date, dep.lag_days);
    else if (dep.dependency_type === 'SF') candidate = addDays(p.start_date, -1 + dep.lag_days);
    else return;

    if (dep.dependency_type === 'FS' || dep.dependency_type === 'SS') {
      if (candidateStart === null || candidate > candidateStart) candidateStart = candidate;
    } else if (candidateEnd === null || candidate > candidateEnd) {
      candidateEnd = candidate;
    }
  });

  if (candidateStart === null && candidateEnd === null) return;

  const act = datesMap.get(activityId);
  if (!act) return;
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

  datesMap.set(activityId, { ...act, start_date: newStart, end_date: newEnd, duration_days: newDuration });
  cascadeFromPredecessor(activityId, datesMap, linksBySuccessor, visited);
}

/**
 * รับ activities ทั้งหมด (แบบแบน, มี id/start_date/end_date/duration_days/predecessors) + pendingOps
 * แล้วคืน { datesMap, linksBySuccessor } ที่จำลองผลลัพธ์ "live" หลังไล่ทำ ops ทั้งหมดตามลำดับ
 * (ยังไม่ยิงขึ้นเซิร์ฟเวอร์จริง — ใช้แสดงผล preview เท่านั้น)
 */
export function computeLiveState(allActivitiesFlat, pendingOps) {
  const datesMap = new Map();
  const linksBySuccessor = new Map();

  allActivitiesFlat.forEach((a) => {
    datesMap.set(a.id, {
      start_date: a.start_date,
      end_date: a.end_date,
      duration_days: a.duration_days,
    });
    linksBySuccessor.set(
      a.id,
      (a.predecessors || []).map((p) => ({
        predecessor_id: p.predecessor_id,
        dependency_type: p.dependency_type,
        lag_days: p.lag_days,
        _linkId: p.id,
      }))
    );
  });

  pendingOps.forEach((op) => {
    if (op.type === 'dateEdit') {
      const prev = datesMap.get(op.activityId) || {};
      datesMap.set(op.activityId, {
        ...prev,
        start_date: op.start_date,
        end_date: op.end_date,
        duration_days: op.duration_days,
      });
      cascadeFromPredecessor(op.activityId, datesMap, linksBySuccessor, new Set());
    } else if (op.type === 'linkAdd') {
      const list = linksBySuccessor.get(op.successor_id) || [];
      list.push({
        predecessor_id: op.predecessor_id,
        dependency_type: op.dependency_type,
        lag_days: op.lag_days,
        _tempId: op.tempId,
      });
      linksBySuccessor.set(op.successor_id, list);
      recalcActivity(op.successor_id, datesMap, linksBySuccessor, new Set());
    } else if (op.type === 'linkEdit') {
      // แก้ไขความสัมพันธ์/lag ของลิงก์ที่มีอยู่แล้ว (จับคู่ด้วย _linkId ถ้าเป็นลิงก์จริง หรือ _tempId ถ้ายังไม่บันทึก)
      const list = linksBySuccessor.get(op.successor_id) || [];
      const idx = list.findIndex((l) => (
        (op.linkId != null && l._linkId === op.linkId)
        || (op.tempId != null && l._tempId === op.tempId)
      ));
      if (idx !== -1) {
        list[idx] = { ...list[idx], dependency_type: op.dependency_type, lag_days: op.lag_days };
        linksBySuccessor.set(op.successor_id, [...list]);
        recalcActivity(op.successor_id, datesMap, linksBySuccessor, new Set());
      }
    } else if (op.type === 'linkDelete') {
      const list = linksBySuccessor.get(op.successor_id) || [];
      linksBySuccessor.set(op.successor_id, list.filter((l) => l._linkId !== op.linkId));
      // ลบลิงก์ไม่ปรับวันที่คืนอัตโนมัติ (เหมือนพฤติกรรม unlink ใน MS Project) ตรงกับฝั่ง backend
    }
  });

  return { datesMap, linksBySuccessor };
}
