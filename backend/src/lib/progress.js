// src/lib/progress.js
// ฟังก์ชันช่วยคำนวณสำหรับ Menu 3 "การจัดการโครงการ" และ Menu 5 "จัดทำรายงาน" — ใช้ร่วมกันระหว่าง
// routes/progress.js (งานสัปดาห์นี้/หน้า, ตารางงานรวม, S-Curve) และ routes/reports.js (ตาราง Plan&Progress
// ในรายงานประจำสัปดาห์ ซึ่งต้องคำนวณโครงสร้าง WBS + plan/actual แบบเดียวกันทุกประการ แค่ asOfDate ต่างกัน)

const { query } = require('../db');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toUTCDate(dateInput) {
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function fmtISO(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * คืนช่วงวันอาทิตย์-เสาร์ของสัปดาห์ที่ต้องการ (นับสัปดาห์เริ่มวันอาทิตย์ ไม่ใช่วันจันทร์)
 * offsetWeeks = 0 -> สัปดาห์นี้, 1 -> สัปดาห์หน้า, -1 -> สัปดาห์ที่แล้ว ฯลฯ
 * baseDate ไม่ระบุ = อิงจากวันนี้ (เวลาเซิร์ฟเวอร์)
 */
function getWeekRange(offsetWeeks = 0, baseDate = new Date()) {
  const d = toUTCDate(baseDate);
  const day = d.getUTCDay(); // 0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์
  const sunday = new Date(d.getTime() + (-day + offsetWeeks * 7) * MS_PER_DAY);
  const saturday = new Date(sunday.getTime() + 6 * MS_PER_DAY);
  return { start: fmtISO(sunday), end: fmtISO(saturday) };
}

/**
 * ===== ระบบนับสัปดาห์แบบอิงวันเริ่มสัญญา (contract-anchored week) =====
 * ใช้แทน getWeekRange() แบบเดิม (ซึ่งอิงปฏิทินทั่วไป ไม่สนวันเริ่มสัญญา) ในทุกจุดที่ต้องรู้ว่า "วันนี้อยู่
 * สัปดาห์ที่เท่าไหร่ของโครงการ" — กติกา (ตามที่ตกลงกันไว้):
 *   - สัปดาห์ที่ 1 = วันเริ่มสัญญา ถึง วันอาทิตย์แรกที่เจอ (สั้นกว่า 7 วันได้ ถ้าสัญญาเริ่มกลางสัปดาห์)
 *   - สัปดาห์ที่ 2 เป็นต้นไป = จันทร์ถึงอาทิตย์เต็มสัปดาห์ (7 วันเป๊ะ) ต่อเนื่องกันไปเรื่อยๆ
 * ทุกสัปดาห์ (รวมสัปดาห์ที่ 1) จบลงที่ "วันอาทิตย์" เสมอ — บังเอิญเป็นจุดเดียวกับที่ S-Curve เดิมใช้เป็น
 * grid point อยู่แล้ว (ทุกวันอาทิตย์นับจากวันเริ่มสัญญา) เลยไม่ต้องแก้ไขการคำนวณกราฟ S-Curve เลย
 */

/**
 * หาวันอาทิตย์แรกที่เจอ นับจากวันที่กำหนด (รวมวันนั้นเองด้วยถ้าตรงเป็นวันอาทิตย์พอดี)
 */
function getFirstSundayOnOrAfter(dateStr) {
  const d = toUTCDate(dateStr);
  const day = d.getUTCDay();
  const daysToAdd = day === 0 ? 0 : 7 - day;
  return fmtISO(new Date(d.getTime() + daysToAdd * MS_PER_DAY));
}

/**
 * คำนวณช่วงวันที่ (start, end) ของ "สัปดาห์ที่ N" ของโครงการหนึ่งๆ (นับจาก 1)
 */
function getProjectWeekBoundaries(contractStart, weekNumber) {
  const week1End = getFirstSundayOnOrAfter(contractStart);
  if (weekNumber <= 1) {
    return { start: fmtISO(toUTCDate(contractStart)), end: week1End };
  }
  const week2Start = fmtISO(new Date(toUTCDate(week1End).getTime() + MS_PER_DAY)); // วันจันทร์ถัดจากอาทิตย์แรก
  const start = fmtISO(new Date(toUTCDate(week2Start).getTime() + (weekNumber - 2) * 7 * MS_PER_DAY));
  const end = fmtISO(new Date(toUTCDate(start).getTime() + 6 * MS_PER_DAY));
  return { start, end };
}

/**
 * หาว่าวันที่ที่กำหนด (เช่น "วันนี้") ตกอยู่ใน "สัปดาห์ที่เท่าไหร่" ของโครงการ (นับจาก 1)
 * ถ้าวันที่นั้นมาก่อนวันเริ่มสัญญา ให้ถือว่าเป็นสัปดาห์ที่ 1 ไปก่อน (กันกรณีข้อมูลผิดเพี้ยน/ยังไม่เริ่มจริง)
 */
function getProjectWeekNumber(contractStart, dateStr) {
  const week1End = getFirstSundayOnOrAfter(contractStart);
  if (toUTCDate(dateStr).getTime() <= toUTCDate(week1End).getTime()) return 1;
  const week2Start = toUTCDate(week1End).getTime() + MS_PER_DAY;
  const daysSinceWeek2Start = Math.floor((toUTCDate(dateStr).getTime() - week2Start) / MS_PER_DAY);
  return 2 + Math.floor(daysSinceWeek2Start / 7);
}

/**
 * ช่วยรวบยอด: คืนทั้งเลขที่สัปดาห์ + ช่วงวันที่ ของสัปดาห์ที่ dateStr (ปกติคือ "วันนี้") ตกอยู่
 */
function getProjectWeekInfo(contractStart, dateStr) {
  const weekNumber = getProjectWeekNumber(contractStart, dateStr);
  const { start, end } = getProjectWeekBoundaries(contractStart, weekNumber);
  return { weekNumber, start, end };
}

/**
 * % แผนสะสมของกิจกรรมงานหนึ่ง (0-100) ณ วันที่กำหนด — คิดเป็นเส้นตรงตามวันเริ่ม-จบของตัวมันเอง
 * (ก่อนวันเริ่ม = 0%, หลังวันจบ = 100%, ระหว่างนั้นแปรผันตรงตามสัดส่วนวันที่ผ่านไป)
 */
function computePlanPercent(startDate, endDate, asOfDate) {
  if (!startDate || !endDate) return 0;
  const start = toUTCDate(startDate).getTime();
  const end = toUTCDate(endDate).getTime();
  const asOf = toUTCDate(asOfDate).getTime();
  if (asOf < start) return 0;
  if (asOf > end) return 100;
  const totalDays = Math.round((end - start) / MS_PER_DAY) + 1;
  const elapsedDays = Math.round((asOf - start) / MS_PER_DAY) + 1;
  if (totalDays <= 0) return 100;
  return Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
}

/**
 * เช็คว่าช่วงวันที่ [aStart, aEnd] กับ [bStart, bEnd] มีวันที่ทับซ้อนกันบ้างไหม (ใช้กรองกิจกรรมงาน
 * ที่ "ตกอยู่ในสัปดาห์นี้/หน้า" — คือช่วงกิจกรรมงานกับช่วงสัปดาห์นั้นมีวันที่ทับกันอย่างน้อย 1 วัน)
 */
function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd) return false;
  const as = toUTCDate(aStart).getTime();
  const ae = toUTCDate(aEnd).getTime();
  const bs = toUTCDate(bStart).getTime();
  const be = toUTCDate(bEnd).getTime();
  return as <= be && ae >= bs;
}

/**
 * สถานะเทียบแผน-ผลงานจริง — ใช้ในตารางงานรวม (Tab 3)
 *   ยังไม่มีแผนและยังไม่มี progress เลย (ทั้งคู่ = 0)  -> null (หน้าเว็บโชว์ "-")
 *   actual - plan > 5%   -> "เร็วกว่าแผน" (เขียว)
 *   actual - plan < -5%  -> "ช้ากว่าแผน" (แดง)
 *   อยู่ในช่วง ±5%         -> "ตามแผน" (สีปกติ)
 */
function computeStatus(planPercent, actualPercent) {
  if (planPercent === 0 && actualPercent === 0) return null;
  const diff = actualPercent - planPercent;
  if (diff > 5) return 'เร็วกว่าแผน';
  if (diff < -5) return 'ช้ากว่าแผน';
  return 'ตามแผน';
}

/**
 * ดึงโครงสร้าง WBS ทั้ง 3 ระดับของโปรเจกต์ พร้อม weight_percent/share_percent (สูตรเดียวกับ Gantt)
 * คืนเป็น array แบนของ level3 แต่ละตัว พร้อมพ่วง level1/level2 ที่เป็นแม่ไว้ในตัวมันเอง
 * (ใช้ร่วมกันในทุก endpoint ของ routes/progress.js และ routes/reports.js ไม่ต้องเขียนซ้ำ)
 */
async function getFlatWbsTree(projectId) {
  const level1Result = await query(
    `SELECT * FROM project_mgt.wbs_level1
     WHERE project_id = $1
     ORDER BY COALESCE(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::INTEGER, 999999), code`,
    [projectId]
  );
  const level1Rows = level1Result.rows;

  const totalRemaining = level1Rows.reduce((sum, r) => {
    const amt = parseFloat(r.amount) || 0;
    const pct = parseFloat(r.deduct_percent) || 0;
    return sum + amt * (1 - pct / 100);
  }, 0);

  const flat = [];

  for (const level1 of level1Rows) {
    const amount = parseFloat(level1.amount) || 0;
    const deductPercent = parseFloat(level1.deduct_percent) || 0;
    const remainingAmount = amount * (1 - deductPercent / 100);
    const level1WeightPercent = totalRemaining > 0 ? (remainingAmount / totalRemaining) * 100 : 0;

    const level2Result = await query(
      `SELECT * FROM project_mgt.wbs_level2
       WHERE level1_id = $1
       ORDER BY COALESCE(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::INTEGER, 999999), code`,
      [level1.id]
    );

    for (const level2 of level2Result.rows) {
      const l2Amount = parseFloat(level2.amount) || 0;
      const l2SharePercent = remainingAmount > 0 ? (l2Amount / remainingAmount) * 100 : 0;
      const l2WeightPercent = (l2SharePercent * level1WeightPercent) / 100;

      const level3Result = await query(
        `SELECT * FROM project_mgt.wbs_level3 WHERE level2_id = $1 ORDER BY id`,
        [level2.id]
      );

      level3Result.rows.forEach((row) => {
        const l3Amount = parseFloat(row.amount) || 0;
        const l3SharePercent = l2Amount > 0 ? (l3Amount / l2Amount) * 100 : 0;
        const l3WeightPercent = (l3SharePercent * l2WeightPercent) / 100;

        flat.push({
          id: row.id,
          code: row.code,
          name: row.name,
          start_date: row.start_date,
          end_date: row.end_date,
          duration_days: row.duration_days,
          weight_percent: l3WeightPercent,
          share_percent: l3SharePercent, // %W ของกิจกรรมงาน (Level3) โชว์เป็น share_percent (ของรายการงานพ่อ)
          // ไม่ใช่ weight_percent (ของทั้งโปรเจกต์) — ให้ตรงกับธรรมเนียมเดิมที่ใช้ใน Gantt (Menu 2 Tab 4)
          level1: { id: level1.id, code: level1.code, name: level1.name, weight_percent: level1WeightPercent },
          level2: { id: level2.id, code: level2.code, name: level2.name, weight_percent: l2WeightPercent },
        });
      });
    }
  }

  return flat;
}

/**
 * ดึง actual_percent ล่าสุด (entry_date <= asOfDate) ของกิจกรรมงานหลายตัวพร้อมกันในครั้งเดียว
 * คืนเป็น Map<wbs_level3_id, number> (0 ถ้ายังไม่เคยกรอกเลย)
 *
 * สำคัญ: "ห้าม query มองเข้าไปในอนาคตเกินกว่าวันนี้จริงๆ เด็ดขาด" ไม่ว่า asOfDate ที่ส่งเข้ามาจะเป็น
 * วันไหนก็ตาม (clamp ให้ไม่เกินวันนี้เสมอ) — กันข้อมูลเก่าที่หลงเหลือ entry_date ผิดเพี้ยนจากบั๊กก่อนหน้า
 * (ตอนที่ยังให้ client กำหนด entry_date เอง อาจมีบางแถวมีวันที่ในอนาคตหลงเหลืออยู่ใน DB) โผล่มาปนกับ
 * ผลลัพธ์ที่ควรถูกต้องแล้ว — โดยเฉพาะ Tab งานสัปดาห์หน้าที่ query ไกลถึงปลายสัปดาห์หน้า (ในอนาคตจริง)
 * ถ้าไม่ clamp ตรงนี้ไว้ อาจไปเจอ entry เก่าที่ดันมีวันที่ผิดเพี้ยนอยู่ในช่วงนั้นพอดี ทั้งที่ Tab อื่น
 * (ซึ่ง query ไม่ไกลขนาดนั้น) ไม่เจอปัญหานี้เลย
 */
async function getLatestActualMap(level3Ids, asOfDate) {
  const map = new Map();
  if (level3Ids.length === 0) return map;
  const today = fmtISO(new Date());
  const effectiveAsOf = asOfDate > today ? today : asOfDate;
  const result = await query(
    `SELECT DISTINCT ON (wbs_level3_id) wbs_level3_id, actual_percent
     FROM project_mgt.progress_entries
     WHERE wbs_level3_id = ANY($1::int[]) AND entry_date <= $2
     ORDER BY wbs_level3_id, entry_date DESC, created_at DESC`,
    [level3Ids, effectiveAsOf]
  );
  result.rows.forEach((r) => map.set(r.wbs_level3_id, parseFloat(r.actual_percent) || 0));
  return map;
}

/**
 * ดึงรูปถ่ายของ "รายการล่าสุด" (progress_entries แถวเดียวกับที่ใช้กำหนด actual_percent ล่าสุด) ต่อกิจกรรม
 * งาน — ใช้โชว์ thumbnail ให้ดูได้เลยแม้ไม่ได้กดแก้ไข (Menu3 Tab งานสัปดาห์นี้/หน้า) คืนเป็น
 * Map<wbs_level3_id, {id, url}[]>
 */
async function getLatestPhotosMap(level3Ids, asOfDate) {
  const map = new Map();
  if (level3Ids.length === 0) return map;
  const today = fmtISO(new Date());
  const effectiveAsOf = asOfDate > today ? today : asOfDate;
  const result = await query(
    `SELECT pp.id, pp.photo_url, e.wbs_level3_id
     FROM project_mgt.progress_photos pp
     JOIN (
       SELECT DISTINCT ON (wbs_level3_id) id, wbs_level3_id
       FROM project_mgt.progress_entries
       WHERE wbs_level3_id = ANY($1::int[]) AND entry_date <= $2
       ORDER BY wbs_level3_id, entry_date DESC, created_at DESC
     ) e ON e.id = pp.progress_entry_id
     ORDER BY e.wbs_level3_id, pp.id`,
    [level3Ids, effectiveAsOf]
  );
  result.rows.forEach((r) => {
    if (!map.has(r.wbs_level3_id)) map.set(r.wbs_level3_id, []);
    map.get(r.wbs_level3_id).push({ id: r.id, url: r.photo_url });
  });
  return map;
}

/**
 * รวมกิจกรรมงาน (แบบแบน พร้อม plan/actual) ให้เป็นโครงสร้างต้นไม้ 3 ระดับสำหรับแสดงผล
 * plan/actual ของ level1/level2 = ค่าเฉลี่ยถ่วงน้ำหนักของลูก (ถ่วงด้วย weight_percent) แล้ว normalize
 * ด้วยน้ำหนักรวมของตัวเอง — ได้ "% ความคืบหน้าของกิ่งนั้นเอง" (กรอบอ้างอิงตัวเอง 0-100)
 */
function buildProgressTree(flatWithProgress) {
  const level1Map = new Map();

  flatWithProgress.forEach((act) => {
    const l1Id = act.level1.id;
    if (!level1Map.has(l1Id)) {
      level1Map.set(l1Id, { ...act.level1, items: new Map() });
    }
    const l1 = level1Map.get(l1Id);
    const l2Id = act.level2.id;
    if (!l1.items.has(l2Id)) {
      l1.items.set(l2Id, { ...act.level2, activities: [] });
    }
    l1.items.get(l2Id).activities.push(act);
  });

  function weightedAvg(children, weightKey, valueKey) {
    const totalWeight = children.reduce((s, c) => s + (c[weightKey] || 0), 0);
    if (totalWeight <= 0) return 0;
    const sum = children.reduce((s, c) => s + (c[weightKey] || 0) * (c[valueKey] || 0), 0);
    return sum / totalWeight;
  }

  const groups = [...level1Map.values()].map((l1) => {
    const items = [...l1.items.values()].map((l2) => {
      const activities = l2.activities.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        start_date: a.start_date,
        end_date: a.end_date,
        weight_percent: a.weight_percent,
        share_percent: a.share_percent,
        plan_percent: a.plan_percent,
        previous_percent: a.previous_percent,
        actual_percent: a.actual_percent,
        also_in_this_week: a.also_in_this_week,
        photos: a.photos,
      }));
      return {
        id: l2.id,
        code: l2.code,
        name: l2.name,
        weight_percent: l2.weight_percent,
        plan_percent: weightedAvg(activities, 'weight_percent', 'plan_percent'),
        previous_percent: weightedAvg(activities, 'weight_percent', 'previous_percent'),
        actual_percent: weightedAvg(activities, 'weight_percent', 'actual_percent'),
        activities,
      };
    });
    return {
      id: l1.id,
      code: l1.code,
      name: l1.name,
      weight_percent: l1.weight_percent,
      plan_percent: weightedAvg(items, 'weight_percent', 'plan_percent'),
      previous_percent: weightedAvg(items, 'weight_percent', 'previous_percent'),
      actual_percent: weightedAvg(items, 'weight_percent', 'actual_percent'),
      items,
    };
  });

  groups.forEach((g) => {
    g.status = computeStatus(g.plan_percent, g.actual_percent);
    g.items.forEach((it) => {
      it.status = computeStatus(it.plan_percent, it.actual_percent);
      it.activities.forEach((act) => {
        act.status = computeStatus(act.plan_percent, act.actual_percent);
      });
    });
  });

  return groups;
}

/**
 * ตัดกิ่ง Level2/Level1 ที่ไม่เหลือกิจกรรมงานอยู่เลยทิ้ง (เช่นหลังกรองงานที่เสร็จ 100% ออกแล้ว
 * รายการงาน/กลุ่มงานบางอันอาจไม่เหลือลูกเลย) ใช้กับ Tab รายสัปดาห์เท่านั้น (Tab ตารางงานรวมโชว์ครบทุกอัน)
 */
function pruneEmptyBranches(groups) {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => it.activities.length > 0) }))
    .filter((g) => g.items.length > 0);
}

module.exports = {
  MS_PER_DAY,
  toUTCDate,
  fmtISO,
  getWeekRange,
  getFirstSundayOnOrAfter,
  getProjectWeekBoundaries,
  getProjectWeekNumber,
  getProjectWeekInfo,
  computePlanPercent,
  dateRangesOverlap,
  computeStatus,
  getFlatWbsTree,
  getLatestActualMap,
  getLatestPhotosMap,
  buildProgressTree,
  pruneEmptyBranches,
};
