// routes/client.js
// API สำหรับแอปมือถือ "ลูกค้า" (role='client') — ดูความคืบหน้างานอ่านอย่างเดียวเท่านั้น 4 Tab:
// งานสัปดาห์นี้/งานสัปดาห์หน้า/S-Curve/เล่มรายงาน
//
// ทำไมแยกไฟล์นี้ต่างหาก ไม่ใช้ endpoint เดิมของ progress.js/reports.js ร่วมกับ staff:
// endpoint เดิมหลายจุด (เช่น /reports/:id/items) ใช้ permission เดียวกันคุมทั้ง GET (อ่าน) และ
// POST/PUT/DELETE (แก้ไข/ลบ) พร้อมกัน ถ้าให้ client ยืมสิทธิ์ tab เดิมของ reports/project_management
// จะเสี่ยงให้ client แก้ไขข้อมูลได้โดยไม่ตั้งใจ (เพราะ permission แค่ระดับ tab ไม่ได้แยก read/write) —
// ไฟล์นี้จึงมีแต่ GET ล้วนๆ เท่านั้น ไม่มี POST/PUT/DELETE เลยสักตัว ปลอดภัยขาดจากกัน
//
// ใช้ฟังก์ชันคำนวณล้วนๆ (pure function ไม่แตะ req/res) ที่ export ไว้แล้วจาก lib/progress.js ซ้ำ
// (ไม่ copy สูตรคำนวณเอง) เพื่อกันสูตรเพี้ยนกันระหว่างจุด — แต่ query/endpoint shape ยังคง "จงใจ copy"
// มาจาก progress.js/reports.js บางส่วน (ไม่ import router handler ตรงๆ เพราะ handler เดิมผูกกับ
// permission เดิมที่ไม่ต้องการให้ client เข้าถึง) ถ้าแก้ query logic ฝั่ง progress.js/reports.js ในอนาคต
// (เช่น /weekly, /scurve, /overall) ต้องกลับมาเช็คว่าไฟล์นี้ต้องแก้ตามด้วยหรือไม่
//
// เช็คสิทธิ์ 2 ชั้นเสมอทุก endpoint:
// 1) requireClientTab(tabKey) — user ต้องมีแถวใน user_permissions (menu_key='client-app', tab_key=...)
// 2) requireProjectAccess — user ต้องมีแถวใน client_project_access ผูกกับ project_id/report นั้นจริง
//    (system_mgr/admin ข้ามการเช็คนี้ได้ เผื่อ debug/พรีวิวแทนลูกค้า)

const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, hasPermission } = require('../middleware/auth');
const {
  fmtISO, toUTCDate, MS_PER_DAY, getWeekRange, getProjectWeekNumber, getProjectWeekBoundaries,
  computePlanPercent, dateRangesOverlap, getFlatWbsTree, getLatestActualMap, getLatestPhotosMap,
  buildProgressTree, pruneEmptyBranches,
} = require('../lib/progress');
const { getReportProgressData } = require('./reports');

const router = express.Router();
router.use(verifyToken);
// role='client' ปกติ + role='foreman' (ให้ดูเล่มรายงานแบบเดียวกับ client ได้โดยไม่ต้องตั้งสิทธิ์ tab/ผูก
// โครงการเพิ่มเหมือน client — foreman เป็นพนักงานภายในที่เห็นทุกโครงการที่เปิดอยู่แล้วตามปกติ ดู bypass ที่
// requireClientTab/requireProjectAccess ด้านล่างประกอบ) + system_mgr ผ่านเสมอตามดีไซน์เดิมของ requireRole
router.use(requireRole('client', 'foreman'));

const CLIENT_MENU_KEY = 'client-app';

/**
 * เช็คว่า user มีสิทธิ์เข้า Tab นี้ในแอปลูกค้าหรือไม่ (admin/system_mgr ผ่านเสมอจาก hasPermission เดิม)
 * foreman ผ่านเสมอด้วย (ไม่ต้องมีแถว user_permissions menu_key='client-app' เลยสักแถว) — ต่างจาก client
 * ที่ต้องให้ system_mgr ติ๊กเลือก Tab ให้ทีละคนผ่านหน้าอนุมัติสิทธิ์
 */
function requireClientTab(tabKey) {
  return async (req, res, next) => {
    if (req.user.role === 'foreman') return next();
    if (!(await hasPermission(req.user, CLIENT_MENU_KEY, tabKey))) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    next();
  };
}

/**
 * เช็คว่า client คนนี้ถูกผูกให้เห็นโครงการนี้ได้จริงหรือไม่ (ตาราง client_project_access) — คนละแกนกับ
 * requireClientTab (อันนั้นคุม "เข้า Tab ไหนได้บ้าง", อันนี้คุม "เห็นโครงการไหนได้บ้าง")
 * รองรับ project_id จาก query string ตรงๆ หรือ resolve จาก report id (req.params.id) กรณี endpoint
 * ที่ผูกกับ reportId แทน project_id ตรงๆ (เหมือน /reports/:id/... ของ Menu 5)
 * system_mgr/admin/foreman ข้ามการเช็คนี้เสมอ (foreman เห็นได้ทุกโครงการที่เปิดอยู่อยู่แล้วตามปกติ ไม่ต้อง
 * มีแถวผูกโครงการแบบ client — ระบบ client_project_access นี้มีไว้คุม "ลูกค้าภายนอก" คนละกลุ่มเป้าหมาย)
 * ยังคงเช็ค approval_status ต่อสำหรับ foreman เหมือน client ทุกประการ (เห็นเฉพาะรายงานที่อนุมัติแล้ว)
 */
async function requireProjectAccess(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'system_mgr') return next();
  try {
    let projectId = req.query.project_id;
    if (!projectId && req.params.id) {
      const reportResult = await query(
        'SELECT project_id, approval_status FROM project_mgt.reports WHERE id = $1',
        [req.params.id]
      );
      if (reportResult.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
      // รายงานที่ยังไม่อนุมัติ (draft) ห้ามเข้าดูเด็ดขาด แม้จะพิมพ์ report id ตรงๆ เอง (เผื่อเดา id ถูก) —
      // ใช้กับทั้ง client และ foreman เหมือนกัน (ตามที่ตกลงกันไว้ "เล่มรายงานเหมือน client ทุกประการ")
      if (reportResult.rows[0].approval_status !== 'approved') {
        return res.status(403).json({ error: 'รายงานฉบับนี้ยังไม่ได้เผยแพร่ กรุณาติดต่อผู้ดูแลโครงการ' });
      }
      projectId = reportResult.rows[0].project_id;
    }
    if (!projectId) return res.status(400).json({ error: 'กรุณาระบุ project_id' });

    if (req.user.role === 'foreman') return next();

    const accessResult = await query(
      'SELECT 1 FROM project_mgt.client_project_access WHERE user_id = $1 AND project_id = $2',
      [req.user.id, projectId]
    );
    if (accessResult.rows.length === 0) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูโครงการนี้ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ตรวจสอบสิทธิ์เข้าถึงโครงการไม่สำเร็จ' });
  }
}

/**
 * GET /api/client/my-projects
 * โครงการที่ client คนนี้ถูกผูกให้เห็นได้ (สำหรับ dropdown เลือกโครงการในแอป) — system_mgr/admin ที่มา
 * debug จะเห็นทุกโครงการที่ status='active' แทน (ไม่มีแถว client_project_access ของตัวเองให้ join)
 */
router.get('/my-projects', async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'system_mgr') {
      const result = await query(
        `SELECT id, project_code, name, client_name, status, schedule_pdf_url, schedule_pdf_pages
         FROM project_mgt.projects WHERE status = 'on' ORDER BY name`
      );
      return res.json({ projects: result.rows });
    }
    const result = await query(
      `SELECT p.id, p.project_code, p.name, p.client_name, p.status, p.schedule_pdf_url, p.schedule_pdf_pages
       FROM project_mgt.projects p
       JOIN project_mgt.client_project_access cpa ON cpa.project_id = p.id
       WHERE cpa.user_id = $1
       ORDER BY p.name`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายการโครงการไม่สำเร็จ' });
  }
});

/**
 * GET /api/client/weekly?project_id=X&week=this|next
 * เหมือน GET /api/progress/weekly เป๊ะ (copy มาจาก routes/progress.js) แต่อ่านอย่างเดียว ไม่มีปุ่มแก้ไข
 * ฝั่ง frontend ใช้ทำ Tab "งานสัปดาห์นี้/งานสัปดาห์หน้า" ของแอปลูกค้า
 */
router.get(
  '/weekly',
  requireProjectAccess,
  (req, res, next) => requireClientTab(req.query.week === 'next' ? 'next-week' : 'this-week')(req, res, next),
  async (req, res) => {
    try {
      const { project_id, week, as_of: asOfParam } = req.query;
      const offsetWeeks = week === 'next' ? 1 : 0;

      const projectResult = await query('SELECT contract_start FROM project_mgt.projects WHERE id = $1', [project_id]);
      const contractStart = projectResult.rows[0]?.contract_start ? fmtISO(new Date(projectResult.rows[0].contract_start)) : null;

      let start;
      let end;
      let thisWeekRange = null;
      if (contractStart) {
        // as_of: ใช้ตอนเรียกจาก ClientReportTab.jsx (Tab "เล่มรายงาน") ส่ง week_end ของรายงานฉบับนั้นมา
        // แทน "วันนี้จริง" เพื่อ freeze ให้ตรงกับสัปดาห์ของรายงานฉบับนั้นเป๊ะ — ไม่ส่งมา (ตอนเรียกจาก Tab
        // "งานสัปดาห์นี้/หน้า" ปกติ) ยังคงเป็นค่าปัจจุบันจริงเหมือนเดิมทุกประการ
        const today = asOfParam ? fmtISO(new Date(asOfParam)) : fmtISO(new Date());
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

      // เพิ่มกิจกรรมงานที่ "เลยแผนมาแล้วแต่ยังไม่จบ 100%" เข้ามาด้วย (เฉพาะ week==='this') — เหตุผลเดียวกับ
      // routes/progress.js ทุกประการ (ดูคอมเมนต์เต็มที่นั่น)
      let overdueExtra = [];
      if (week !== 'next') {
        const inWeekIds = new Set(inWeek.map((a) => a.id));
        const candidates = flat.filter((a) => a.end_date && a.end_date < start && !inWeekIds.has(a.id));
        if (candidates.length > 0) {
          const candidateActualMap = await getLatestActualMap(candidates.map((a) => a.id), end);
          overdueExtra = candidates.filter((a) => (candidateActualMap.get(a.id) || 0) < 100);
        }
      }

      // เพิ่มกิจกรรมงานที่ "มีความคืบหน้าเพิ่มขึ้นจริงในสัปดาห์นี้" เข้ามาด้วย (สำหรับฟีเจอร์กรอกข้อมูล
      // ย้อนหลัง) — เหตุผลเดียวกับ routes/progress.js ทุกประการ (ดูคอมเมนต์เต็มที่นั่น) สำคัญ: เช็คจาก "%
      // เพิ่มขึ้นจริง" (current > previous) ไม่ใช่แค่ "มี entry ประทับวันที่อยู่ในช่วงนี้" เฉยๆ — กันกิจกรรม
      // งานที่เสร็จ 100% ไปก่อนสัปดาห์นี้เริ่มแล้ว แต่บังเอิญมี entry (เช่น กด save ซ้ำ) ประทับวันที่อยู่ใน
      // สัปดาห์นี้พอดี โผล่ปนเข้ามาทั้งที่ไม่มีความคืบหน้าอะไรเกิดขึ้นจริงในสัปดาห์นี้เลย
      let actualEntryExtra = [];
      if (week !== 'next') {
        const excludeIds = new Set([...inWeek, ...overdueExtra].map((a) => a.id));
        const entryResult = await query(
          `SELECT DISTINCT pe.wbs_level3_id
           FROM project_mgt.progress_entries pe
           JOIN project_mgt.wbs_level3 l3 ON l3.id = pe.wbs_level3_id
           JOIN project_mgt.wbs_level2 l2 ON l2.id = l3.level2_id
           JOIN project_mgt.wbs_level1 l1 ON l1.id = l2.level1_id
           WHERE l1.project_id = $1 AND pe.entry_date BETWEEN $2 AND $3`,
          [project_id, start, end]
        );
        const entryIds = new Set(entryResult.rows.map((r) => r.wbs_level3_id));
        const candidates = flat.filter((a) => entryIds.has(a.id) && !excludeIds.has(a.id));
        if (candidates.length > 0) {
          const candidateIds = candidates.map((a) => a.id);
          const dayBeforeWeekForCandidates = fmtISO(new Date(new Date(start).getTime() - 24 * 60 * 60 * 1000));
          const candidatePreviousMap = await getLatestActualMap(candidateIds, dayBeforeWeekForCandidates);
          const candidateCurrentMap = await getLatestActualMap(candidateIds, end);
          actualEntryExtra = candidates.filter((a) => {
            const prev = candidatePreviousMap.get(a.id) || 0;
            const curr = candidateCurrentMap.has(a.id) ? candidateCurrentMap.get(a.id) : prev;
            return curr > prev;
          });
        }
      }

      const allActivities = [...inWeek, ...overdueExtra, ...actualEntryExtra];

      let alsoInThisWeekIds = new Set();
      if (week === 'next') {
        alsoInThisWeekIds = new Set(
          inWeek.filter((a) => dateRangesOverlap(a.start_date, a.end_date, thisWeekRange.start, thisWeekRange.end)).map((a) => a.id)
        );
      }

      const level3Ids = allActivities.map((a) => a.id);
      const dayBeforeWeek = fmtISO(new Date(new Date(start).getTime() - 24 * 60 * 60 * 1000));
      const previousMap = await getLatestActualMap(level3Ids, dayBeforeWeek);
      const currentMap = await getLatestActualMap(level3Ids, end);
      const photosMap = await getLatestPhotosMap(level3Ids, end);

      const withProgress = allActivities
        .map((a) => {
          const isOverlap = alsoInThisWeekIds.has(a.id);
          const previous = previousMap.get(a.id) || 0;
          const current = currentMap.has(a.id) ? currentMap.get(a.id) : previous;
          const plan = computePlanPercent(a.start_date, a.end_date, end);
          return {
            ...a,
            plan_percent: plan,
            previous_percent: previous,
            actual_percent: current,
            also_in_this_week: isOverlap,
            photos: photosMap.get(a.id) || [],
            is_delayed: plan >= 100 && current < 100,
          };
        })
        // งานที่เสร็จ 100% แล้ว ไม่ต้องโชว์ใน Tab รายสัปดาห์อีก — ยกเว้นตอนเรียกจาก Tab เล่มรายงาน
        // (ส่ง include_completed=true มา) ซึ่งอยากเห็นงานที่เพิ่งเสร็จในสัปดาห์นั้นโชว์อยู่ในรายงานด้วย
        .filter((a) => req.query.include_completed === 'true' || a.actual_percent < 100);

      const groups = pruneEmptyBranches(buildProgressTree(withProgress));

      res.json({ week_start: start, week_end: end, groups });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'ดึงข้อมูลงานประจำสัปดาห์ไม่สำเร็จ' });
    }
  }
);

/**
 * GET /api/client/scurve?project_id=X
 * เหมือน GET /api/progress/scurve เป๊ะ (copy มาจาก routes/progress.js) แต่เฉพาะภาพรวมทั้งโครงการเท่านั้น
 * (ไม่รองรับ level1_id แยกกลุ่มงานเหมือนฝั่ง staff — ลูกค้าดูแค่ S-Curve รวมพอ)
 */
router.get('/scurve', requireClientTab('scurve'), requireProjectAccess, async (req, res) => {
  try {
    const { project_id, as_of: asOfParam } = req.query;
    const flat = await getFlatWbsTree(project_id);
    const withDates = flat.filter((a) => a.start_date && a.end_date);
    if (withDates.length === 0) return res.json({ points: [], today: null });

    const totalWeight = withDates.reduce((s, a) => s + a.weight_percent, 0) || 1;

    let minDate = withDates[0].start_date;
    let maxDate = withDates[0].end_date;
    withDates.forEach((a) => {
      if (a.start_date < minDate) minDate = a.start_date;
      if (a.end_date > maxDate) maxDate = a.end_date;
    });
    // as_of: ใช้ตอนเรียกจาก ClientReportTab.jsx (Tab "เล่มรายงาน") ส่ง week_end ของรายงานฉบับนั้นมาแทน
    // "วันนี้จริง" เพื่อ freeze กราฟทั้งเส้นไว้ ณ วันนั้น — ไม่ส่งมา (Tab S-Curve ปกติ) ยังคงเป็นปัจจุบันจริง
    const today = asOfParam ? fmtISO(new Date(asOfParam)) : fmtISO(new Date());
    if (today > maxDate) maxDate = today;

    const level3Ids = withDates.map((a) => a.id);

    const projectResult = await query(
      'SELECT contract_start, contract_end FROM project_mgt.projects WHERE id = $1',
      [project_id]
    );
    const contractStartRaw = projectResult.rows[0]?.contract_start;
    const contractStart = contractStartRaw ? fmtISO(new Date(contractStartRaw)) : minDate;
    const contractEndRaw = projectResult.rows[0]?.contract_end;
    const contractEnd = contractEndRaw ? fmtISO(new Date(contractEndRaw)) : null;
    const rawAxisStart = contractStart < minDate ? contractStart : minDate;
    const axisStart = fmtISO(new Date(toUTCDate(rawAxisStart).getTime() - MS_PER_DAY));
    if (contractEnd && contractEnd > maxDate) maxDate = contractEnd;

    const pointDates = [axisStart];
    {
      const startDate = toUTCDate(axisStart);
      const day = startDate.getUTCDay();
      const daysToNextSunday = day === 0 ? 7 : (7 - day);
      let cursor = new Date(startDate.getTime() + daysToNextSunday * MS_PER_DAY);
      const endTime = toUTCDate(maxDate).getTime();
      while (cursor.getTime() <= endTime) {
        pointDates.push(fmtISO(cursor));
        cursor = new Date(cursor.getTime() + 7 * MS_PER_DAY);
      }
      if (pointDates[pointDates.length - 1] !== maxDate) pointDates.push(maxDate);
    }

    // ยิง query ของทุกจุดบนกราฟพร้อมกันทีเดียว (Promise.all) แทนการวน await ทีละจุด (เดิมทำแบบ sequential
    // ผ่าน for-loop — โครงการที่มีหลายสิบสัปดาห์ ก็คือรอ DB round-trip หลายสิบรอบเรียงต่อกัน ช้ามาก) แต่ละ
    // จุดคำนวณจาก asOfDate คนละวันกัน เป็นอิสระต่อกันโดยสมบูรณ์ ยิงพร้อมกันได้ปลอดภัย ไม่กระทบผลลัพธ์เลย
    const actualMapsByDate = await Promise.all(pointDates.map((date) => getLatestActualMap(level3Ids, date)));

    const points = pointDates.map((date, idx) => {
      const actualMap = actualMapsByDate[idx];
      let planSum = 0;
      let actualSum = 0;
      withDates.forEach((a) => {
        planSum += a.weight_percent * computePlanPercent(a.start_date, a.end_date, date);
        actualSum += a.weight_percent * (actualMap.get(a.id) || 0);
      });
      const isCompletedWeekBoundary = idx === 0 || toUTCDate(date).getUTCDay() === 0;
      return {
        date,
        plan: planSum / totalWeight,
        actual: (date > today || !isCompletedWeekBoundary) ? null : actualSum / totalWeight,
      };
    });

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
      today: { date: todayClamped, plan: todayPlanSum / totalWeight, actual: todayActualSum / totalWeight },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูล S-Curve ไม่สำเร็จ' });
  }
});

/**
 * GET /api/client/overall?project_id=X
 * เหมือน GET /api/progress/overall เป๊ะ (copy มาจาก routes/progress.js) — ใช้ในหน้า "เล่มรายงาน" ของ
 * แอปลูกค้า หน้า 3 "ตารางสรุปปริมาณงานและผลงานรวมทั้งโครงการ" (ไม่กรอง โชว์ครบทุกกิจกรรมงาน)
 */
router.get('/overall', requireClientTab('full-report'), requireProjectAccess, async (req, res) => {
  try {
    const { project_id, as_of: asOfParam } = req.query;
    // as_of: ส่ง week_end ของรายงานฉบับที่กำลังดูมาเสมอจาก ClientReportTab.jsx (endpoint นี้ใช้แค่ที่เดียว
    // คือ Tab เล่มรายงาน ไม่มี Tab อื่นเรียกซ้ำ) เพื่อ freeze ตารางไว้ ณ วันนั้น ไม่ขยับตามวันที่ปัจจุบัน
    const today = asOfParam ? fmtISO(new Date(asOfParam)) : fmtISO(new Date());
    const yesterday = fmtISO(new Date(new Date(today).getTime() - MS_PER_DAY));

    const flat = await getFlatWbsTree(project_id);
    const level3Ids = flat.map((a) => a.id);
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
 * GET /api/client/reports?project_id=X
 * รายชื่อรายงานทั้งหมดของโครงการ เรียงล่าสุดก่อน — ใช้ทำ dropdown เลือกดูรายงานย้อนหลังใน Tab เล่มรายงาน
 */
router.get('/reports', requireClientTab('full-report'), requireProjectAccess, async (req, res) => {
  try {
    const { project_id } = req.query;
    const result = await query(
      `SELECT id, report_no, week_start, week_end, created_at, schedule_pdf_url, schedule_pdf_pages
       FROM project_mgt.reports
       WHERE project_id = $1 AND approval_status = 'approved'
       ORDER BY week_start DESC`,
      [project_id]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายชื่อรายงานไม่สำเร็จ' });
  }
});

/**
 * GET /api/client/reports/:id/progress
 * ใช้ getReportProgressData() ตัวเดียวกับที่ routes/reports.js ใช้จริง (import มาใช้ซ้ำ ไม่ copy สูตร)
 * filterZeroActivities=true (ค่า default) เหมือน Tab1 Plan&Progress
 */
router.get('/reports/:id/progress', requireClientTab('full-report'), requireProjectAccess, async (req, res) => {
  try {
    const data = await getReportProgressData(req.params.id);
    if (!data) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูล Plan&Progress ไม่สำเร็จ' });
  }
});

const VALID_CATEGORIES = ['safety', 'problems', 'additional_work', 'pending'];

/**
 * GET /api/client/reports/:id/items?category=safety|problems|additional_work|pending
 * เหมือน GET /api/reports/:id/items แต่อ่านอย่างเดียว (ไม่มี POST/PUT/DELETE คู่กันในไฟล์นี้เลย)
 * หมายเหตุ: query param category ที่นี่ใช้ชื่อ category จริงใน DB ตรงๆ (safety/problems/
 * additional_work/pending) ต่างจาก routes/reports.js ที่รับ tab_key แล้วแปลงเป็น category เอง —
 * เพราะฝั่งนี้ไม่ผูกกับ menuRegistry tab_key ของ reports เดิม
 */
router.get('/reports/:id/items', requireClientTab('full-report'), requireProjectAccess, async (req, res) => {
  try {
    const { category } = req.query;
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category ต้องเป็นหนึ่งใน: ${VALID_CATEGORIES.join(', ')}` });
    }
    const result = await query(
      `SELECT id, sort_order, content, created_at FROM project_mgt.report_items
       WHERE report_id = $1 AND category = $2 ORDER BY sort_order, id`,
      [req.params.id, category]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายการไม่สำเร็จ' });
  }
});

/**
 * GET /api/client/reports/:id/next-week
 * เหมือน GET /api/reports/:id/next-week เป๊ะ (อ่านอย่างเดียว)
 */
router.get('/reports/:id/next-week', requireClientTab('full-report'), requireProjectAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT n.id, n.wbs_level1_id, l1.code AS level1_code, l1.name AS level1_name,
              n.sort_order, n.content, n.target_percent
       FROM project_mgt.report_next_week_items n
       LEFT JOIN project_mgt.wbs_level1 l1 ON l1.id = n.wbs_level1_id
       WHERE n.report_id = $1
       ORDER BY l1.code NULLS LAST, n.sort_order, n.id`,
      [req.params.id]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายการไม่สำเร็จ' });
  }
});

/**
 * GET /api/client/reports/:id/photos
 * เหมือน GET /api/reports/:id/photos เป๊ะ (อ่านอย่างเดียว) — frontend กรองเอาเฉพาะ selection_id != null
 * เองฝั่ง client เหมือนที่ CompiledReportTab.jsx (ฝั่ง staff) ทำอยู่แล้ว
 */
router.get('/reports/:id/photos', requireClientTab('full-report'), requireProjectAccess, async (req, res) => {
  try {
    const reportResult = await query('SELECT * FROM project_mgt.reports WHERE id = $1', [req.params.id]);
    if (reportResult.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
    const report = reportResult.rows[0];

    const photosResult = await query(
      `SELECT pp.id AS photo_id, pp.photo_url, pe.wbs_level3_id, pe.entry_date,
              wl3.code AS activity_code, wl3.name AS activity_name,
              sel.id AS selection_id
       FROM project_mgt.progress_photos pp
       JOIN project_mgt.progress_entries pe ON pe.id = pp.progress_entry_id
       JOIN project_mgt.wbs_level3 wl3 ON wl3.id = pe.wbs_level3_id
       JOIN project_mgt.wbs_level2 wl2 ON wl2.id = wl3.level2_id
       JOIN project_mgt.wbs_level1 wl1 ON wl1.id = wl2.level1_id
       LEFT JOIN project_mgt.report_photo_selections sel
         ON sel.progress_photo_id = pp.id AND sel.report_id = $1
       WHERE wl1.project_id = $2 AND pe.entry_date BETWEEN $3 AND $4
       ORDER BY wl3.id, (sel.id IS NULL), sel.sort_order, pe.entry_date DESC, pp.id DESC`,
      [req.params.id, report.project_id, report.week_start, report.week_end]
    );

    const groupsMap = new Map();
    photosResult.rows.forEach((row) => {
      if (!groupsMap.has(row.wbs_level3_id)) {
        groupsMap.set(row.wbs_level3_id, {
          wbs_level3_id: row.wbs_level3_id,
          activity_code: row.activity_code,
          activity_name: row.activity_name,
          photos: [],
        });
      }
      groupsMap.get(row.wbs_level3_id).photos.push({
        photo_id: row.photo_id,
        photo_url: row.photo_url,
        entry_date: row.entry_date,
        selection_id: row.selection_id,
      });
    });

    res.json({ groups: [...groupsMap.values()] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรูปถ่ายไม่สำเร็จ' });
  }
});

module.exports = router;
