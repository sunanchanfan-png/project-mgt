// routes/progress.js
// API สำหรับ Menu 3 "การจัดการโครงการ" — บันทึก/ดูความคืบหน้าของกิจกรรมงาน (wbs_level3)
// รวม endpoint สำหรับ 5 Tab: งานสัปดาห์นี้/หน้า, ตารางงานรวม, Main S-Curve, Group S-Curve

const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, requirePermission, hasPermission } = require('../middleware/auth');
const { getWeekRange, getProjectWeekNumber, getProjectWeekBoundaries, computePlanPercent, dateRangesOverlap, computeStatus, fmtISO, toUTCDate, MS_PER_DAY, getFlatWbsTree, getLatestActualMap, getLatestPhotosMap, buildProgressTree, pruneEmptyBranches } = require('../lib/progress');

const router = express.Router();
router.use(verifyToken);

// getFlatWbsTree, getLatestActualMap, buildProgressTree, pruneEmptyBranches ย้ายไปอยู่ที่ lib/progress.js
// แล้ว (ใช้ร่วมกับ routes/reports.js ด้วย) — import มาจาก require ด้านบนแทนการประกาศซ้ำในไฟล์นี้
/**
 * GET /api/progress/weekly?project_id=X&week=this|next
 * รายการกิจกรรมงาน (JE) ที่ตกอยู่ในสัปดาห์นี้/หน้า (ช่วงวันที่กิจกรรมงานทับซ้อนกับสัปดาห์นั้น)
 * พร้อม %W, แผนสะสม (ณ วันสิ้นสุดสัปดาห์), ก่อนหน้า (actual ล่าสุดก่อนสัปดาห์นั้นเริ่ม)
 * ตัดกิ่ง Level1/Level2 ที่ไม่มีกิจกรรมงานอยู่ในสัปดาห์นั้นทิ้ง (โชว์เฉพาะที่เกี่ยวข้อง)
 */
router.get('/weekly', async (req, res) => {
  try {
    const { project_id, week } = req.query;
    if (!project_id) return res.status(400).json({ error: 'กรุณาระบุ project_id' });
    // endpoint เดียวรองรับ 2 Tab (งานสัปดาห์นี้/หน้า) แยกกันด้วย query param — เช็คสิทธิ์ตาม Tab จริงที่
    // กำลังขอ ไม่ใช่เช็คแบบเหมารวม
    const tabKey = week === 'next' ? 'next-week' : 'this-week';
    if (!(await hasPermission(req.user, 'project_management', tabKey))) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    const offsetWeeks = week === 'next' ? 1 : 0;
    // นับสัปดาห์แบบอิงวันเริ่มสัญญา (contract-anchored): สัปดาห์ 1 = วันเริ่มสัญญา-อาทิตย์แรก, สัปดาห์ 2
    // เป็นต้นไป = จันทร์-อาทิตย์เต็มสัปดาห์ — ถ้าโครงการนี้ไม่ได้กรอกวันเริ่มสัญญาไว้ fallback ไปใช้ระบบเดิม
    // (ปฏิทินทั่วไป อาทิตย์-เสาร์) กันพังทั้งระบบเพราะข้อมูลไม่ครบ
    const projectResult = await query('SELECT contract_start FROM project_mgt.projects WHERE id = $1', [project_id]);
    const contractStart = projectResult.rows[0]?.contract_start ? fmtISO(new Date(projectResult.rows[0].contract_start)) : null;

    let start;
    let end;
    let thisWeekRange = null;
    if (contractStart) {
      const today = fmtISO(new Date());
      const currentWeekNum = getProjectWeekNumber(contractStart, today);
      const targetWeekNum = currentWeekNum + offsetWeeks;
      ({ start, end } = getProjectWeekBoundaries(contractStart, targetWeekNum));
      if (week === 'next') thisWeekRange = getProjectWeekBoundaries(contractStart, currentWeekNum);
    } else {
      ({ start, end } = getWeekRange(offsetWeeks));
      if (week === 'next') thisWeekRange = getWeekRange(0);
    }

    const flat = await getFlatWbsTree(project_id);
    const inWeek = flat.filter((a) => dateRangesOverlap(a.start_date, a.end_date, start, end));

    // ถ้าเป็น Tab "งานสัปดาห์หน้า" ต้องรู้ด้วยว่ากิจกรรมงานไหน "ก็โผล่ในสัปดาห์นี้อยู่แล้วด้วย" (ช่วงวันที่
    // ทับซ้อนกับสัปดาห์นี้เช่นกัน) — รายการที่ซ้ำแบบนี้ให้แก้ไขได้แค่จาก Tab สัปดาห์นี้เท่านั้น (ทำเร็วกว่าแผน
    // ก็ใส่ % ที่ Tab สัปดาห์นี้ได้เลย) ส่วนใน Tab สัปดาห์หน้าจะแสดงไว้ให้ดูอย่างเดียว ไม่ให้แก้ไขซ้ำ กันข้อมูล
    // สับสน/ขัดแย้งกันจากการแก้ไขคนละจุดสำหรับกิจกรรมงานเดียวกัน
    let alsoInThisWeekIds = new Set();
    if (week === 'next') {
      alsoInThisWeekIds = new Set(
        inWeek.filter((a) => dateRangesOverlap(a.start_date, a.end_date, thisWeekRange.start, thisWeekRange.end)).map((a) => a.id)
      );
    }

    const level3Ids = inWeek.map((a) => a.id);
    // "ก่อนหน้า" = actual ล่าสุด ณ ก่อนวันเริ่มสัปดาห์ที่กำลังดูอยู่ (1 วันก่อนวันเริ่มสัปดาห์นั้น)
    // สำหรับ Tab งานสัปดาห์หน้า ค่านี้จะเท่ากับ "ผลรวมสะสม ณ สิ้นสุดสัปดาห์นี้" โดยธรรมชาติอยู่แล้ว
    // (เพราะ 1 วันก่อนสัปดาห์หน้าเริ่ม = วันสุดท้ายของสัปดาห์นี้พอดี) ไม่ต้องคำนวณแยกเป็นกรณีพิเศษเลย
    const dayBeforeWeek = fmtISO(new Date(new Date(start).getTime() - 24 * 60 * 60 * 1000));
    const previousMap = await getLatestActualMap(level3Ids, dayBeforeWeek);
    // "รวมผลงาน" = actual ล่าสุด ณ วันสิ้นสุดสัปดาห์ที่กำลังดูอยู่ (รวมรายการที่เพิ่งกรอกในสัปดาห์นี้เองด้วย)
    // เดิมพลาดใช้ previousMap ซ้ำตรงนี้ ทำให้กรอก/บันทึกไปแล้วหน้าเว็บดูเหมือน "ไม่เซฟ" (ค่าไม่ขยับ)
    const currentMap = await getLatestActualMap(level3Ids, end);
    // รูปถ่ายของ "รายการล่าสุด" ต่อกิจกรรม — ให้ดูได้เลยแม้ไม่ได้กดแก้ไข (ใช้ end ของสัปดาห์นี้เป็น
    // asOfDate เดียวกับ currentMap เพื่อให้ดึงรูปของ entry เดียวกับที่ใช้กำหนด actual_percent ปัจจุบัน)
    const photosMap = await getLatestPhotosMap(level3Ids, end);

    const withProgress = inWeek
      .map((a) => {
        const isOverlap = alsoInThisWeekIds.has(a.id);
        const previous = previousMap.get(a.id) || 0;
        const current = currentMap.has(a.id) ? currentMap.get(a.id) : previous;
        return {
          ...a,
          plan_percent: computePlanPercent(a.start_date, a.end_date, end),
          previous_percent: previous,
          actual_percent: current,
          also_in_this_week: isOverlap,
          photos: photosMap.get(a.id) || [],
        };
      })
      // งานที่เสร็จ 100% แล้ว ไม่ต้องโชว์ใน Tab รายสัปดาห์อีก (ไปโชว์รวมทีเดียวใน Tab ตารางงานรวมแทน)
      .filter((a) => a.actual_percent < 100);

    const groups = pruneEmptyBranches(buildProgressTree(withProgress));

    res.json({
      week_start: start,
      week_end: end,
      groups,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลงานประจำสัปดาห์ไม่สำเร็จ' });
  }
});

/**
 * GET /api/progress/overall?project_id=X&level1_id=Y (level1_id ไม่ใส่ = ทั้งโปรเจกต์)
 * ตารางความคืบหน้ารวมทั้งโปรเจกต์ (ทุกกิจกรรมงาน ไม่กรองตามวันที่) พร้อมสถานะ เร็ว/ช้า/เสร็จ
 */
router.get('/overall', requirePermission('project_management', 'overall'), async (req, res) => {
  try {
    const { project_id, level1_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'กรุณาระบุ project_id' });
    const today = fmtISO(new Date());
    const yesterday = fmtISO(new Date(new Date(today).getTime() - MS_PER_DAY));

    let flat = await getFlatWbsTree(project_id);
    if (level1_id) flat = flat.filter((a) => String(a.level1.id) === String(level1_id));

    const level3Ids = flat.map((a) => a.id);
    // "ก่อนหน้า" = ค่าล่าสุด ณ เมื่อวาน, "ปัจจุบัน/รวมผลงาน" = ค่าล่าสุด ณ วันนี้ — ให้แก้ไขแบบเดียวกับ
    // Tab งานสัปดาห์นี้/หน้าได้ (กรอกส่วนที่เพิ่มขึ้น "วันนี้" แทนที่จะกรอกยอดสะสมใหม่ทั้งหมด)
    const previousMap = await getLatestActualMap(level3Ids, yesterday);
    const actualMap = await getLatestActualMap(level3Ids, today);

    const withProgress = flat.map((a) => {
      const previous = previousMap.get(a.id) || 0;
      const actual = actualMap.has(a.id) ? actualMap.get(a.id) : previous;
      return {
        ...a,
        plan_percent: computePlanPercent(a.start_date, a.end_date, today),
        previous_percent: previous,
        actual_percent: actual,
      };
    });

    res.json({ as_of: today, groups: buildProgressTree(withProgress) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลตารางงานรวมไม่สำเร็จ' });
  }
});

/**
 * GET /api/progress/scurve?project_id=X&level1_id=Y (level1_id ไม่ใส่ = ทั้งโปรเจกต์)
 * ข้อมูลกราฟ S-Curve แบบ "รายสัปดาห์" เท่านั้น: { date, plan, actual } — plan/actual เป็น % สะสมของ
 * ขอบเขตที่เลือก (0-100) คำนวณจากผลรวมถ่วงน้ำหนัก weight_percent ของกิจกรรมงานทั้งหมดในขอบเขต แล้ว
 * normalize ด้วยน้ำหนักรวม
 *
 * จุดแรกของแกนวันที่ = วันเริ่มสัญญาของโครงการเสมอ (อาจไม่ตรงกับวันอาทิตย์พอดี) จุดถัดๆ ไปคือวันอาทิตย์
 * ของทุกสัปดาห์ ห่างกันครั้งละ 7 วัน ไปจนถึงวันสิ้นสุดสัญญาของโครงการ (หรือวันจบแผนของกิจกรรมงานล่าสุด/
 * วันนี้ แล้วแต่อันไหนช้ากว่า) — ไม่แทรกจุดวันที่กรอกจริงเข้าไปแล้ว (เดิมเคยทำ) ให้เห็นเป็นเส้นรายสัปดาห์ล้วนๆ
 *
 * นอกจาก points ยังคืนค่า "today" (plan/actual ณ วันนี้จริง แยกต่างหาก ไม่ใช่จุดบนแกนกราฟ) ให้ frontend
 * ใช้วาดกล่องสรุป Plan/Actual/Gain(+)/Delay(-) พร้อมเส้นชี้ไปยังตำแหน่งวันนี้บนกราฟ
 */
router.get('/scurve', async (req, res) => {
  try {
    const { project_id, level1_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'กรุณาระบุ project_id' });
    // endpoint เดียวรองรับ 2 Tab (Main S-Curve ไม่ระบุ level1_id / Group S-Curve ระบุ level1_id) — เช็ค
    // สิทธิ์ตาม Tab จริงที่กำลังขอ
    const tabKey = level1_id ? 'scurve-group' : 'scurve-main';
    if (!(await hasPermission(req.user, 'project_management', tabKey))) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
    }

    let flat = await getFlatWbsTree(project_id);
    if (level1_id) flat = flat.filter((a) => String(a.level1.id) === String(level1_id));

    const withDates = flat.filter((a) => a.start_date && a.end_date);
    if (withDates.length === 0) return res.json({ points: [], today: null });

    const totalWeight = withDates.reduce((s, a) => s + a.weight_percent, 0) || 1;

    let minDate = withDates[0].start_date;
    let maxDate = withDates[0].end_date;
    withDates.forEach((a) => {
      if (a.start_date < minDate) minDate = a.start_date;
      if (a.end_date > maxDate) maxDate = a.end_date;
    });
    // ลากเส้นต่อไปถึงวันนี้ด้วย ถ้าวันนี้เลยวันจบแผนไปแล้ว (จะได้เห็น actual ล่าสุดต่อเนื่อง)
    const today = fmtISO(new Date());
    if (today > maxDate) maxDate = today;

    const level3Ids = withDates.map((a) => a.id);

    // วันเริ่มสัญญา + วันสิ้นสุดสัญญาของโครงการ (ใช้กำหนดจุดแรก/จุดสุดท้ายของแกนกราฟ) — ถ้าไม่มีข้อมูล
    // fallback เป็น minDate/maxDate ที่คำนวณจากกิจกรรมงานแทน
    const projectResult = await query(
      'SELECT contract_start, contract_end FROM project_mgt.projects WHERE id = $1',
      [project_id]
    );
    const contractStartRaw = projectResult.rows[0]?.contract_start;
    const contractStart = contractStartRaw ? fmtISO(new Date(contractStartRaw)) : minDate;
    const contractEndRaw = projectResult.rows[0]?.contract_end;
    const contractEnd = contractEndRaw ? fmtISO(new Date(contractEndRaw)) : null;
    // จุดเริ่มแกนกราฟ = อันไหนมาก่อนระหว่างวันเริ่มสัญญา กับวันเริ่มกิจกรรมงานแรกสุด (กันกรณีมีกิจกรรมงาน
    // ที่กรอกวันเริ่มไว้ก่อนวันเริ่มสัญญาจริง)
    const rawAxisStart = contractStart < minDate ? contractStart : minDate;
    // ถอยจุดเริ่มแกนกราฟกลับไปอีก 1 วันเสมอ เพื่อการันตีว่าเส้น "แผน" จะเริ่มจาก 0% เป๊ะที่จุดแรกทุกครั้ง —
    // ถ้าไม่ถอย แล้วบังเอิญ axisStart ตรงกับวันเริ่มของกิจกรรมงานใดงานหนึ่งพอดี (เช่น โครงการไม่มีวันเริ่ม
    // สัญญาบันทึกไว้ ทำให้ fallback ไปใช้ minDate ตรงๆ) สูตร computePlanPercent จะนับ "วันแรกของงาน" เป็น
    // วันที่ 1 จาก N วัน (ธรรมเนียมนับวันแบบรวมวันเริ่มด้วย) ทำให้ได้ % เศษเล็กๆ ที่ไม่ใช่ 0.0% พอดี (เช่น
    // งาน 7 วัน จะได้ 1/7 = 14.3% ทันทีในวันแรก ไม่ใช่ 0%) — การถอยไป 1 วันทำให้ asOf < start ของทุกกิจกรรม
    // งานเสมอ (การันตีทางคณิตศาสตร์) เข้าเงื่อนไข "ยังไม่เริ่ม → 0%" ของ computePlanPercent ได้ตรงเป๊ะ
    const axisStart = fmtISO(new Date(toUTCDate(rawAxisStart).getTime() - MS_PER_DAY));
    // ลากแกนกราฟให้ยาวไปถึงวันสิ้นสุดสัญญาด้วยเสมอ (เผื่อกิจกรรมงานที่กรอกไว้จบเร็ว/วันนี้ยังไม่ถึงวันสิ้นสุด
    // สัญญา จะได้เห็นเส้นแผนลากไปจนครบ 100% ณ วันสิ้นสุดสัญญาจริง)
    if (contractEnd && contractEnd > maxDate) maxDate = contractEnd;

    // สร้างจุดวันที่แบบรายสัปดาห์: จุดแรก = axisStart เสมอ จุดถัดไปคือวันอาทิตย์ของทุกสัปดาห์ถัดจากนั้น
    const pointDates = [axisStart];
    {
      const startDate = toUTCDate(axisStart);
      const day = startDate.getUTCDay(); // 0 = วันอาทิตย์
      const daysToNextSunday = day === 0 ? 7 : (7 - day);
      let cursor = new Date(startDate.getTime() + daysToNextSunday * MS_PER_DAY);
      const endTime = toUTCDate(maxDate).getTime();
      while (cursor.getTime() <= endTime) {
        pointDates.push(fmtISO(cursor));
        cursor = new Date(cursor.getTime() + 7 * MS_PER_DAY);
      }
      // ให้จุดสุดท้ายครอบคลุมถึง maxDate เป๊ะเสมอ (เผื่อ maxDate ไม่ตรงกับวันอาทิตย์พอดี)
      if (pointDates[pointDates.length - 1] !== maxDate) pointDates.push(maxDate);
    }

    const points = [];
    for (let idx = 0; idx < pointDates.length; idx += 1) {
      const date = pointDates[idx];
      // eslint-disable-next-line no-await-in-loop
      const actualMap = await getLatestActualMap(level3Ids, date);
      let planSum = 0;
      let actualSum = 0;
      withDates.forEach((a) => {
        planSum += a.weight_percent * computePlanPercent(a.start_date, a.end_date, date);
        actualSum += a.weight_percent * (actualMap.get(a.id) || 0);
      });
      // เส้น actual (ผลงานจริง) ต้อง "ตัดยอดสะสม ณ สิ้นสุดวันอาทิตย์" ของแต่ละสัปดาห์เท่านั้น — จุดทุกจุด
      // ในแกนกราฟ (ยกเว้นจุดแรก axisStart ที่เป็นจุดเริ่มต้น 0% เสมอ) เป็นวันอาทิตย์อยู่แล้วโดยธรรมชาติจาก
      // การสร้าง pointDates ข้างบน ยกเว้น "จุดสุดท้าย" ที่อาจถูกบังคับให้เป็น maxDate (วันนี้/วันสิ้นสุดสัญญา)
      // ซึ่งอาจไม่ตรงกับวันอาทิตย์พอดี (อยู่กลางสัปดาห์ที่ยังไม่จบ) — ถ้าเป็นกรณีนั้นให้ "ไม่โชว์ actual" ที่
      // จุดนั้น (โชว์แค่ plan ต่อไปได้ตามปกติ เพื่อให้เห็นเป้าหมายลากไปถึงวันนี้/วันสิ้นสุดสัญญา) เพราะยังไม่ใช่
      // สัปดาห์ที่จบสมบูรณ์ — ผลคือกราฟ actual จะแสดงแค่ถึง "สัปดาห์ที่แล้ว" (สัปดาห์ล่าสุดที่จบสมบูรณ์แล้ว)
      // ส่วนสถานะ "วันนี้จริง" (รวมความคืบหน้าที่ยังไม่ครบสัปดาห์) ยังโชว์แยกในกล่องสรุปข้างล่างตามปกติ
      const isCompletedWeekBoundary = idx === 0 || toUTCDate(date).getUTCDay() === 0;
      points.push({
        date,
        plan: planSum / totalWeight,
        actual: (date > today || !isCompletedWeekBoundary) ? null : actualSum / totalWeight,
      });
    }

    // ค่า ณ "วันนี้จริง" แยกต่างหาก (ไม่ใช่จุดบนแกนกราฟ เพราะแกนกราฟเป็นรายสัปดาห์เท่านั้น) — ให้ frontend
    // วาดกล่องสรุป Plan/Actual/Gain(+)/Delay(-) พร้อมเส้นชี้ไปยังตำแหน่งวันนี้บนกราฟ
    const todayClamped = today > maxDate ? maxDate : today;
    const todayActualMap = await getLatestActualMap(level3Ids, todayClamped);
    let todayPlanSum = 0;
    let todayActualSum = 0;
    withDates.forEach((a) => {
      todayPlanSum += a.weight_percent * computePlanPercent(a.start_date, a.end_date, todayClamped);
      todayActualSum += a.weight_percent * (todayActualMap.get(a.id) || 0);
    });

    res.json({
      points,
      today: {
        date: todayClamped,
        plan: todayPlanSum / totalWeight,
        actual: todayActualSum / totalWeight,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูล S-Curve ไม่สำเร็จ' });
  }
});

/**
 * GET /api/progress-entries?level3_id=X
 * ประวัติการกรอกความคืบหน้าของกิจกรรมงานหนึ่ง (ล่าสุดก่อน) พร้อมรูปถ่ายที่แนบไว้
 */
router.get('/entries', async (req, res) => {
  try {
    const { level3_id } = req.query;
    if (!level3_id) return res.status(400).json({ error: 'กรุณาระบุ level3_id' });

    const entriesResult = await query(
      `SELECT * FROM project_mgt.progress_entries WHERE wbs_level3_id = $1 ORDER BY entry_date DESC, created_at DESC`,
      [level3_id]
    );
    const entryIds = entriesResult.rows.map((r) => r.id);
    let photosByEntry = {};
    if (entryIds.length > 0) {
      const photosResult = await query(
        `SELECT * FROM project_mgt.progress_photos WHERE progress_entry_id = ANY($1::int[])`,
        [entryIds]
      );
      photosByEntry = photosResult.rows.reduce((acc, p) => {
        (acc[p.progress_entry_id] = acc[p.progress_entry_id] || []).push(p);
        return acc;
      }, {});
    }

    const entries = entriesResult.rows.map((e) => ({ ...e, photos: photosByEntry[e.id] || [] }));
    res.json({ entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงประวัติความคืบหน้าไม่สำเร็จ' });
  }
});

/**
 * POST /api/progress-entries
 * body: { wbs_level3_id, actual_percent, note, photo_urls: [] }
 * บันทึกความคืบหน้า — "UPSERT" ตาม (wbs_level3_id, entry_date=วันนี้): ถ้าวันนี้เคยบันทึกไปแล้ว จะ
 * "แก้ไขทับ" แถวเดิม (UPDATE) ไม่ใช่เพิ่มแถวใหม่ซ้อนกัน — เดิมใช้ INSERT ใหม่ทุกครั้ง (เก็บเป็นประวัติ
 * ทุกครั้งที่กรอก) แต่พบว่าทำให้แก้ไขค่าซ้ำในวันเดียวกันแล้วผลลัพธ์ไม่ตรงกันระหว่าง Tab ต่างๆ (endpoint
 * ที่ query "ล่าสุด" คนละจุดอาจหยิบคนละแถวได้ถ้ามีหลายแถวชนวันเดียวกัน) เปลี่ยนเป็น "1 แถวต่อ 1 วันต่อ
 * 1 กิจกรรมงาน" เสมอ ตัดความกำกวมนี้ทิ้งไปเลย ยังคงเก็บประวัติแยกตามวันที่ต่างกันได้ตามปกติ (ใช้ทำ S-Curve)
 *
 * entry_date ใช้ "วันนี้ตามเวลาเซิร์ฟเวอร์เสมอ" (fmtISO(new Date())) ไม่รับค่าจาก client เลย — กันปัญหา
 * นาฬิกาเครื่อง client ไม่ตรงกับเซิร์ฟเวอร์ทำให้ query "ณ วันนี้" หา entry ที่เพิ่งบันทึกไม่เจอ
 * photo_urls ตอนนี้เป็นแค่ placeholder string เฉยๆ (ยังไม่ต่อระบบอัปโหลดไฟล์จริง ตามที่ตกลงกันไว้ก่อน)
 */
router.post('/entries', requireRole('admin', 'pm', 'foreman'), async (req, res) => {
  try {
    // endpoint นี้ใช้ร่วมกันทั้ง 3 Tab ที่กรอกความคืบหน้าได้ (งานสัปดาห์นี้/หน้า, ตารางงานรวม) โดย request
    // ไม่มีข้อมูลบอกว่ามาจาก Tab ไหน — อนุญาตถ้ามีสิทธิ์ "อย่างน้อย 1 ใน 3 Tab นี้" ก็พอ (ปุ่มบันทึกก็โผล่
    // เฉพาะในหน้าที่มีสิทธิ์เข้าอยู่แล้วฝั่ง frontend เป็นทุนเดิม)
    const allowedTabs = await Promise.all([
      hasPermission(req.user, 'project_management', 'this-week'),
      hasPermission(req.user, 'project_management', 'next-week'),
      hasPermission(req.user, 'project_management', 'overall'),
    ]);
    if (!allowedTabs.some(Boolean)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    const { wbs_level3_id, actual_percent, note, photo_urls } = req.body;
    if (!wbs_level3_id || actual_percent === undefined || actual_percent === null) {
      return res.status(400).json({ error: 'กรุณาระบุกิจกรรมงาน และ % ความคืบหน้า' });
    }
    const pct = Math.min(100, Math.max(0, parseFloat(actual_percent) || 0));
    const entryDate = fmtISO(new Date());

    const existingResult = await query(
      `SELECT id FROM project_mgt.progress_entries WHERE wbs_level3_id = $1 AND entry_date = $2 LIMIT 1`,
      [wbs_level3_id, entryDate]
    );

    let entry;
    if (existingResult.rows.length > 0) {
      const existingId = existingResult.rows[0].id;
      const updateResult = await query(
        `UPDATE project_mgt.progress_entries
         SET actual_percent = $1, note = $2, created_by = $3, created_at = NOW()
         WHERE id = $4 RETURNING *`,
        [pct, note || null, req.user?.id || null, existingId]
      );
      entry = updateResult.rows[0];
      // ลบรูปเก่าทิ้งก่อน (ถ้ามีการแนบรูปใหม่มาแทนของวันเดิม ให้ทับไปเลยเหมือน actual_percent)
      await query('DELETE FROM project_mgt.progress_photos WHERE progress_entry_id = $1', [existingId]);
    } else {
      const insertResult = await query(
        `INSERT INTO project_mgt.progress_entries (wbs_level3_id, entry_date, actual_percent, note, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [wbs_level3_id, entryDate, pct, note || null, req.user?.id || null]
      );
      entry = insertResult.rows[0];
    }

    const MAX_PHOTOS = 6; // จำกัดสูงสุด 6 รูปต่อการบันทึกความคืบหน้า 1 ครั้ง — เช็คซ้ำฝั่ง backend
    // ด้วย (ไม่พึ่งแค่ validation ฝั่ง frontend เพราะ client แก้ payload เองได้เสมอ)
    const photos = [];
    if (Array.isArray(photo_urls)) {
      for (const url of photo_urls.slice(0, MAX_PHOTOS)) {
        if (!url) continue;
        // eslint-disable-next-line no-await-in-loop
        const photoResult = await query(
          `INSERT INTO project_mgt.progress_photos (progress_entry_id, photo_url) VALUES ($1, $2) RETURNING *`,
          [entry.id, url]
        );
        photos.push(photoResult.rows[0]);
      }
    }

    res.status(201).json({ entry: { ...entry, photos } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'บันทึกความคืบหน้าไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/progress/entries/latest?wbs_level3_id=X&on_or_before=YYYY-MM-DD
 * ลบ "รายการล่าสุด" ของกิจกรรมงานนี้ (entry_date <= on_or_before ถ้าระบุ ไม่งั้นล่าสุดสุดทุกวัน)
 * ใช้กับปุ่ม "ลบ" ในตารางความคืบหน้ารายสัปดาห์ — ลบเพื่อย้อนค่ากลับไปเป็นรายการก่อนหน้าถัดไป
 */
router.delete('/entries/latest', requireRole('admin', 'pm', 'foreman'), async (req, res) => {
  try {
    const allowedTabs = await Promise.all([
      hasPermission(req.user, 'project_management', 'this-week'),
      hasPermission(req.user, 'project_management', 'next-week'),
      hasPermission(req.user, 'project_management', 'overall'),
    ]);
    if (!allowedTabs.some(Boolean)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    const { wbs_level3_id, on_or_before } = req.query;
    if (!wbs_level3_id) return res.status(400).json({ error: 'กรุณาระบุ wbs_level3_id' });

    const params = [wbs_level3_id];
    let dateClause = '';
    if (on_or_before) {
      params.push(on_or_before);
      dateClause = 'AND entry_date <= $2';
    }
    const latestResult = await query(
      `SELECT id FROM project_mgt.progress_entries
       WHERE wbs_level3_id = $1 ${dateClause}
       ORDER BY entry_date DESC, created_at DESC LIMIT 1`,
      params
    );
    if (latestResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการที่จะลบ' });
    }
    const entryId = latestResult.rows[0].id;
    // ลบรูปที่แนบไว้ก่อนอย่างชัดเจน (ไม่พึ่ง ON DELETE CASCADE ของ schema เพียงอย่างเดียว เผื่อ migration
    // ที่รันจริงไม่มี constraint นี้ครบถ้วน) แล้วค่อยลบตัว entry หลัก
    await query('DELETE FROM project_mgt.progress_photos WHERE progress_entry_id = $1', [entryId]);
    await query('DELETE FROM project_mgt.progress_entries WHERE id = $1', [entryId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบรายการไม่สำเร็จ' });
  }
});

module.exports = router;
