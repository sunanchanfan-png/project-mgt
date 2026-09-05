// routes/reports.js
// API สำหรับ Menu 5 "จัดทำรายงาน" — รายงานความคืบหน้าประจำสัปดาห์ 1 ฉบับ = 1 "สัปดาห์ของโครงการ" ต่อ
// โครงการ (นับสัปดาห์แบบอิงวันเริ่มสัญญา — ดู getProjectWeekNumber/getProjectWeekBoundaries ใน
// lib/progress.js: สัปดาห์ 1 = วันเริ่มสัญญา-อาทิตย์แรก, สัปดาห์ 2 เป็นต้นไป = จันทร์-อาทิตย์เต็มสัปดาห์)
// รายงานถูกสร้างอัตโนมัติเสมอ (ไม่มีปุ่มให้ผู้ใช้กดสร้างเองแล้ว) — ดู GET /current ด้านล่าง
// Tab คุณภาพงาน/ความปลอดภัย/ปัญหาอุปสรรค/งานเพิ่มลด/เรื่องที่ค้าง ใช้ endpoint ร่วมกันชุดเดียว (ต่างกันแค่
// query param category) เพราะมีรูปแบบเหมือนกันทุกอัน (ลำดับ+รายการ+จัดการ)
const express = require('express');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType } = require('docx');
const { query } = require('../db');
const { verifyToken, requirePermission, hasPermission } = require('../middleware/auth');
const {
  fmtISO, toUTCDate, MS_PER_DAY, getFlatWbsTree, getLatestActualMap, buildProgressTree, computePlanPercent,
  getProjectWeekNumber, getProjectWeekBoundaries,
} = require('../lib/progress');

const router = express.Router();
router.use(verifyToken);

const MENU_KEY = 'reports';
const VALID_CATEGORIES = ['quality', 'safety', 'problems', 'additional_work', 'pending'];
// map query param ?category= ที่ frontend ส่งมา (อิงตาม tab_key ใน menuRegistry) ไปเป็นค่า category จริง
// ในฐานข้อมูล (ตั้งชื่อสั้นกว่าตอนออกแบบ schema ไปแล้ว) — กันไม่ให้ต้องเปลี่ยน DB column ทีหลังถ้าอยาก
// เปลี่ยนชื่อ tab
const CATEGORY_TAB_MAP = {
  quality: 'quality',
  safety: 'safety',
  problems: 'problems',
  'additional-work': 'additional_work',
  pending: 'pending',
};

function categoryToTabKey(category) {
  return Object.keys(CATEGORY_TAB_MAP).find((k) => CATEGORY_TAB_MAP[k] === category) || category;
}

/**
 * ตรวจสิทธิ์ตาม Tab จริงที่ endpoint นี้กำลังถูกเรียกใช้งาน (endpoint เดียวรองรับ 5 Tab ผ่าน query
 * param category แยกกัน คล้ายกับ /api/progress/weekly ที่แยกด้วย ?week=)
 */
async function requireCategoryPermission(req, res, next) {
  const category = req.query.category || req.body.category;
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category ต้องเป็นหนึ่งใน: ${VALID_CATEGORIES.join(', ')}` });
  }
  const tabKey = categoryToTabKey(category);
  if (!(await hasPermission(req.user, MENU_KEY, tabKey))) {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
  }
  next();
}

/**
 * GET /api/reports?project_id=X
 * รายชื่อรายงานทั้งหมดของโครงการ เรียงจากล่าสุดไปเก่าสุด — ใช้เลือกดูรายงานสัปดาห์ก่อนๆ ได้
 */
/**
 * สร้าง/ดึงรายงานของ "สัปดาห์ที่ N" ของโครงการ (ตาม contract-anchored week) ถ้ายังไม่มีรายงานของสัปดาห์
 * นั้นอยู่ในระบบ จะสร้างให้อัตโนมัติเลย — ใช้ร่วมกันทั้ง endpoint auto-provision (/current) และตอนรายงาน
 * เก่าๆ ที่เคยข้ามไปยังไม่เคยสร้าง (เผื่ออนาคตอยากเพิ่ม backfill)
 */
async function ensureReportForWeek(projectId, weekStart, weekEnd, weekNumber, userId) {
  const existing = await query(
    'SELECT id, report_no, week_start, week_end, created_at FROM project_mgt.reports WHERE project_id = $1 AND week_start = $2',
    [projectId, weekStart]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const result = await query(
    `INSERT INTO project_mgt.reports (project_id, report_no, week_start, week_end, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, week_start) DO NOTHING
     RETURNING id, report_no, week_start, week_end, created_at`,
    [projectId, weekNumber, weekStart, weekEnd, userId || null]
  );
  if (result.rows.length > 0) return result.rows[0];

  // เผื่อกรณี race condition (สองคนเปิดพร้อมกันพอดีจนชน UNIQUE constraint) — ไปดึงแถวที่มีอยู่จริงมาคืนแทน
  const retry = await query(
    'SELECT id, report_no, week_start, week_end, created_at FROM project_mgt.reports WHERE project_id = $1 AND week_start = $2',
    [projectId, weekStart]
  );
  return retry.rows[0];
}

/**
 * GET /api/reports/current?project_id=X
 * หา/สร้างรายงานของ "สัปดาห์ปัจจุบัน" ของโครงการนี้อัตโนมัติ (ไม่ต้องกดปุ่มสร้างเองแล้ว) — คำนวณเลข
 * สัปดาห์จากวันเริ่มสัญญาของโครงการ (contract_start) เทียบกับวันนี้จริง (นาฬิกาเซิร์ฟเวอร์)
 */
router.get('/current', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'กรุณาระบุ project_id' });

    const projectResult = await query('SELECT contract_start FROM project_mgt.projects WHERE id = $1', [project_id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'ไม่พบโครงการนี้' });
    if (!projectResult.rows[0].contract_start) {
      return res.status(400).json({ error: 'โครงการนี้ยังไม่ได้กรอกวันเริ่มสัญญา (contract_start) กรุณากรอกที่เมนู "เปิดโครงการ" ก่อน ระบบต้องใช้คำนวณสัปดาห์' });
    }
    const contractStart = fmtISO(new Date(projectResult.rows[0].contract_start));
    const today = fmtISO(new Date());
    const weekNumber = getProjectWeekNumber(contractStart, today);
    const { start, end } = getProjectWeekBoundaries(contractStart, weekNumber);

    const report = await ensureReportForWeek(project_id, start, end, weekNumber, req.user.id);
    res.json({ report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เตรียมรายงานสัปดาห์ปัจจุบันไม่สำเร็จ' });
  }
});

router.get('/', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'กรุณาระบุ project_id' });
    const result = await query(
      `SELECT id, report_no, week_start, week_end, created_at
       FROM project_mgt.reports WHERE project_id = $1 ORDER BY week_start DESC`,
      [project_id]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายชื่อรายงานไม่สำเร็จ' });
  }
});

/**
 * POST /api/reports
 * body: { project_id, week_start }
 * สร้างรายงานฉบับใหม่สำหรับสัปดาห์นั้นด้วยมือ (ปกติไม่ต้องใช้แล้ว เพราะ GET /current สร้างให้อัตโนมัติ
 * ตลอด — เก็บ endpoint นี้ไว้เผื่อ backfill/แก้ไขกรณีพิเศษ) ไม่บังคับว่า week_start ต้องเป็นวันอาทิตย์อีก
 * ต่อไปแล้ว เพราะสัปดาห์ที่ 1 ของโครงการอาจเริ่มวันไหนก็ได้ตามวันเริ่มสัญญาจริง (ดู lib/progress.js)
 */
router.post('/', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const { project_id, week_start } = req.body;
    if (!project_id || !week_start) {
      return res.status(400).json({ error: 'กรุณาระบุ project_id และ week_start' });
    }
    const startDate = toUTCDate(week_start);
    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'week_start ไม่ถูกต้อง' });
    }
    const weekEnd = fmtISO(new Date(startDate.getTime() + 6 * MS_PER_DAY));

    const existing = await query(
      'SELECT id FROM project_mgt.reports WHERE project_id = $1 AND week_start = $2',
      [project_id, week_start]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'มีรายงานของสัปดาห์นี้อยู่แล้ว' });
    }

    const maxNoResult = await query(
      'SELECT COALESCE(MAX(report_no), 0) AS max_no FROM project_mgt.reports WHERE project_id = $1',
      [project_id]
    );
    const reportNo = maxNoResult.rows[0].max_no + 1;

    const result = await query(
      `INSERT INTO project_mgt.reports (project_id, report_no, week_start, week_end, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, report_no, week_start, week_end, created_at`,
      [project_id, reportNo, week_start, weekEnd, req.user.id]
    );
    res.status(201).json({ report: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'สร้างรายงานไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/reports/:id
 * ลบรายงานทั้งฉบับ (ลบ items/remarks/รูปที่เลือกไว้ตามไปด้วยอัตโนมัติ — ON DELETE CASCADE)
 */
router.delete('/:id', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const result = await query('DELETE FROM project_mgt.reports WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
    res.json({ message: 'ลบรายงานเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบรายงานไม่สำเร็จ' });
  }
});

/**
 * คำนวณข้อมูล Plan&Progress (โครงสร้าง WBS + %W/%Plan/%Actual/remark + overall) ของรายงานฉบับหนึ่งๆ
 * แยกเป็นฟังก์ชันกลางเพราะ GET /:id/progress (Tab1 กรองเฉพาะกิจกรรมที่มีความเคลื่อนไหว), GET
 * /:id/progress-full (Tab "ตารางสรุปผลงานทั้งโครงการ" ไม่กรอง โชว์ครบทุกกิจกรรม), และ GET /:id/export
 * (ประกอบเป็น Word ทั้งสองแบบ) ต้องใช้ข้อมูลชุดเดียวกันเป๊ะ ไม่อยากให้สูตรเพี้ยนกันระหว่างจุด
 * @param {boolean} filterZeroActivities - true (ค่าเริ่มต้น) = กรองเฉพาะ %แผน>0 หรือ %actual>0 (Tab1)
 *   false = โชว์ครบทุกกิจกรรมงานไม่กรอง (ตารางสรุปผลงานทั้งโครงการ)
 * @returns {Promise<{report: object, overall: object, groups: object[]} | null>} null ถ้าไม่พบรายงาน
 */
async function getReportProgressData(reportId, filterZeroActivities = true) {
  const reportResult = await query('SELECT * FROM project_mgt.reports WHERE id = $1', [reportId]);
  if (reportResult.rows.length === 0) return null;
  const report = reportResult.rows[0];

  const flat = await getFlatWbsTree(report.project_id);
  const level3Ids = flat.map((a) => a.id);
  const actualMap = await getLatestActualMap(level3Ids, report.week_end);
  const previousMap = await getLatestActualMap(
    level3Ids,
    fmtISO(new Date(toUTCDate(report.week_start).getTime() - MS_PER_DAY))
  );

  const withProgress = flat.map((a) => ({
    ...a,
    plan_percent: computePlanPercent(a.start_date, a.end_date, report.week_end),
    previous_percent: previousMap.get(a.id) || 0,
    actual_percent: actualMap.get(a.id) || 0,
  }));

  // Tab1 "Plan&Progress" โชว์เฉพาะกิจกรรมงานที่ "เริ่มมีความเคลื่อนไหวแล้ว" เท่านั้น ตามที่ตกลงกันไว้:
  // เอาเฉพาะที่ %แผน > 0% (ถึงกำหนดเริ่มงานแล้วตามแผน) หรือ %actual > 0% (ทำไปแล้วแม้จะเร็วกว่าแผนก็ตาม)
  // ตัดกิจกรรมงานที่ทั้งแผนและ actual ยังเป็น 0% ทั้งคู่ทิ้งไป (ยังไม่ถึงคิว ไม่มีอะไรน่าสนใจจะโชว์)
  // กรองจาก flat list ก่อนสร้างเป็นต้นไม้เลย ทำให้ Level1/Level2 ที่ไม่เหลือกิจกรรมงานใดๆ หลังกรองก็จะไม่
  // ถูกสร้างขึ้นมาในต้นไม้ตั้งแต่แรกไปโดยอัตโนมัติ (buildProgressTree สร้างเฉพาะกิ่งที่มีลูกอยู่ในอินพุตเท่านั้น)
  // — ถ้า filterZeroActivities=false (ตารางสรุปผลงานทั้งโครงการ) ใช้ withProgress เต็มๆ ไม่กรองอะไรเลย
  const withProgressFiltered = filterZeroActivities
    ? withProgress.filter((a) => a.plan_percent > 0 || a.actual_percent > 0)
    : withProgress;
  const groups = buildProgressTree(withProgressFiltered);

  const remarksResult = await query(
    'SELECT wbs_level, wbs_id, remark FROM project_mgt.report_progress_remarks WHERE report_id = $1',
    [reportId]
  );
  const remarkMap = new Map(remarksResult.rows.map((r) => [`${r.wbs_level}:${r.wbs_id}`, r.remark]));

  groups.forEach((g) => {
    g.remark = remarkMap.get(`level1:${g.id}`) || '';
    g.items.forEach((it) => {
      it.remark = remarkMap.get(`level2:${it.id}`) || '';
      it.activities.forEach((act) => {
        act.remark = remarkMap.get(`level3:${act.id}`) || '';
      });
    });
  });

  const totalWeight = flat.reduce((s, a) => s + a.weight_percent, 0) || 1;
  const overallPlan = withProgress.reduce((s, a) => s + a.weight_percent * a.plan_percent, 0) / totalWeight;
  const overallActual = withProgress.reduce((s, a) => s + a.weight_percent * a.actual_percent, 0) / totalWeight;

  return {
    report: { id: report.id, project_id: report.project_id, report_no: report.report_no, week_start: report.week_start, week_end: report.week_end, created_by: report.created_by },
    overall: { plan: overallPlan, actual: overallActual, gain_delay: overallActual - overallPlan },
    groups,
  };
}

/**
 * GET /api/reports/:id/progress
 * ตาราง Plan&Progress (Tab1) — โครงสร้าง WBS 3 ระดับ + %W/%Plan/%Actual/%คงเหลือ คำนวณสดจาก
 * progress_entries ณ วันที่ week_end ของรายงานฉบับนี้เสมอ (ไม่ใช่ "วันนี้") ให้ตัวเลขย้อนดูรายงานเก่าแล้ว
 * ตรงกับสถานการณ์จริงตอนนั้น ไม่เปลี่ยนไปตามข้อมูลที่กรอกเพิ่มทีหลัง — พ่วง remark ที่เคยพิมพ์ไว้ต่อแถวด้วย
 */
router.get('/:id/progress', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const data = await getReportProgressData(req.params.id);
    if (!data) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูล Plan&Progress ไม่สำเร็จ' });
  }
});

/**
 * GET /api/reports/:id/progress-full
 * เหมือน GET /:id/progress เป๊ะ แต่ "ไม่กรอง" กิจกรรมงานที่ %แผน/%actual เป็น 0% ทั้งคู่ทิ้ง — โชว์ครบทุก
 * กิจกรรมงานของทั้งโครงการ (ใช้กับ Tab/หน้าเล่มรายงาน "ตารางสรุปผลงานทั้งโครงการ" ซึ่งต้องการภาพรวมทั้งหมด
 * ไม่ใช่แค่งานที่กำลังขยับ) คำนวณ ณ วันที่ week_end ของรายงานฉบับนี้เหมือนเดิม (ไม่ใช่ "วันนี้")
 */
router.get('/:id/progress-full', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const data = await getReportProgressData(req.params.id, false);
    if (!data) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลตารางสรุปผลงานทั้งโครงการไม่สำเร็จ' });
  }
});

/**
 * PUT /api/reports/:id/remarks
 * body: { wbs_level: 'level1'|'level2'|'level3', wbs_id, remark }
 * บันทึกคำอธิบายต่อแถว WBS แถวหนึ่ง (upsert) — พิมพ์ค่าว่างเปล่า = ลบคำอธิบายนั้นทิ้ง
 */
router.put('/:id/remarks', requirePermission('reports', 'plan-progress'), async (req, res) => {
  try {
    const { wbs_level, wbs_id, remark } = req.body;
    if (!['level1', 'level2', 'level3'].includes(wbs_level) || !wbs_id) {
      return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง (wbs_level/wbs_id)' });
    }
    await query(
      `INSERT INTO project_mgt.report_progress_remarks (report_id, wbs_level, wbs_id, remark)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (report_id, wbs_level, wbs_id) DO UPDATE SET remark = EXCLUDED.remark`,
      [req.params.id, wbs_level, wbs_id, remark || '']
    );
    res.json({ message: 'บันทึกคำอธิบายเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'บันทึกคำอธิบายไม่สำเร็จ' });
  }
});

const MAX_PHOTOS_PER_ITEM = 4; // จำนวนรูปที่ "เลือก" ได้สูงสุดต่อรายการ (แนบเป็น pool ได้ไม่จำกัด แต่เลือกเข้าเล่มได้ไม่เกินนี้ — เหมือน Tab กิจกรรมงาน/JE ทุกประการ ตามที่ยืนยันครั้งสุดท้ายแล้ว)

/**
 * GET /api/reports/:id/items?category=quality|safety|problems|additional-work|pending
 * รายการแบบ ลำดับ+รายการ ของ Tab นั้นๆ (ใช้ query param category = ชื่อ tab_key ใน menuRegistry) — พ่วง
 * รูปถ่ายที่แนบไว้มาด้วย (มีใช้จริงแค่ Tab คุณภาพงาน/ความปลอดภัย แต่ query ร่วมกันหมดไม่เสียหายอะไร ถ้าไม่มี
 * รูปก็แค่ได้ array ว่างเปล่า) — พ่วง selected บอกด้วยว่ารูปไหน "เลือกเข้าเล่ม" ไว้แล้วบ้าง
 */
router.get('/:id/items', requireCategoryPermission, async (req, res) => {
  try {
    const dbCategory = CATEGORY_TAB_MAP[req.query.category];
    const result = await query(
      `SELECT id, sort_order, content, created_at FROM project_mgt.report_items
       WHERE report_id = $1 AND category = $2 ORDER BY sort_order, id`,
      [req.params.id, dbCategory]
    );
    const items = result.rows;
    if (items.length > 0) {
      const photosResult = await query(
        `SELECT id, report_item_id, photo_url, selected FROM project_mgt.report_item_photos
         WHERE report_item_id = ANY($1::int[]) ORDER BY report_item_id, sort_order, id`,
        [items.map((i) => i.id)]
      );
      const photosByItem = new Map();
      photosResult.rows.forEach((p) => {
        // ใช้ String() ครอบ key เสมอ กัน type ไม่ตรงกันระหว่าง number/string (เจอปัญหานี้มาก่อนแล้วหลาย
        // จุดในโปรเจกต์ — Map ใช้ strict equality เทียบ key ถ้า driver คืนค่าคนละ type กันจะหาไม่เจอเงียบๆ)
        const key = String(p.report_item_id);
        if (!photosByItem.has(key)) photosByItem.set(key, []);
        photosByItem.get(key).push({ id: p.id, url: p.photo_url, selected: p.selected });
      });
      items.forEach((i) => { i.photos = photosByItem.get(String(i.id)) || []; });
    }
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายการไม่สำเร็จ' });
  }
});

/**
 * POST /api/reports/:id/items
 * body: { category, content }
 */
router.post('/:id/items', requireCategoryPermission, async (req, res) => {
  try {
    const dbCategory = CATEGORY_TAB_MAP[req.body.category];
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'กรุณากรอกรายการ' });

    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM project_mgt.report_items WHERE report_id = $1 AND category = $2',
      [req.params.id, dbCategory]
    );
    const sortOrder = maxOrderResult.rows[0].max_order + 1;

    const result = await query(
      `INSERT INTO project_mgt.report_items (report_id, category, sort_order, content)
       VALUES ($1, $2, $3, $4) RETURNING id, sort_order, content, created_at`,
      [req.params.id, dbCategory, sortOrder, content.trim()]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เพิ่มรายการไม่สำเร็จ' });
  }
});

/**
 * PUT /api/reports/items/:itemId
 * body: { category, content } — ส่ง category มาด้วยเพื่อเช็คสิทธิ์ตาม Tab ให้ถูก (แก้ไข/ลบ ก็เป็นการ
 * ใช้งาน Tab นั้นเหมือนกัน ต้องเช็คสิทธิ์เดียวกับตอนเพิ่ม)
 */
router.put('/items/:itemId', requireCategoryPermission, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'กรุณากรอกรายการ' });
    const result = await query(
      'UPDATE project_mgt.report_items SET content = $1 WHERE id = $2 RETURNING id, sort_order, content, created_at',
      [content.trim(), req.params.itemId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แก้ไขรายการไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/reports/items/:itemId?category=xxx
 */
router.delete('/items/:itemId', requireCategoryPermission, async (req, res) => {
  try {
    const result = await query('DELETE FROM project_mgt.report_items WHERE id = $1 RETURNING id', [req.params.itemId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.json({ message: 'ลบรายการเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบรายการไม่สำเร็จ' });
  }
});

/**
 * POST /api/reports/items/:itemId/photos?category=xxx
 * body: { url, public_id } — รูปต้องอัปโหลดขึ้น Cloudinary ผ่าน POST /api/photos/upload มาก่อนแล้ว
 * endpoint นี้แค่ "ผูก" รูปที่มี url จริงแล้วเข้ากับรายการนี้ — แนบเข้า pool ได้ไม่จำกัดจำนวน (ไม่บังคับ
 * 4 รูปตรงนี้ เหมือน Tab กิจกรรมงาน (JE) ที่ถ่ายเก็บไว้เยอะแค่ไหนก็ได้ ไปจำกัดตอน "เลือก" แทน) เริ่มต้น
 * เป็น "ยังไม่เลือก" เสมอ ต้องกดเลือกเอง
 */
router.post('/items/:itemId/photos', requireCategoryPermission, async (req, res) => {
  try {
    const { url, public_id: publicId } = req.body;
    if (!url) return res.status(400).json({ error: 'ไม่พบ url ของรูป' });

    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM project_mgt.report_item_photos WHERE report_item_id = $1',
      [req.params.itemId]
    );
    const sortOrder = maxOrderResult.rows[0].max_order + 1;

    const result = await query(
      `INSERT INTO project_mgt.report_item_photos (report_item_id, photo_url, cloudinary_public_id, sort_order, selected)
       VALUES ($1, $2, $3, $4, false) RETURNING id, photo_url, selected`,
      [req.params.itemId, url, publicId || null, sortOrder]
    );
    res.status(201).json({ photo: { id: result.rows[0].id, url: result.rows[0].photo_url, selected: result.rows[0].selected } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แนบรูปไม่สำเร็จ' });
  }
});

/**
 * PUT /api/reports/items/photos/:photoId/select?category=xxx
 * body: { selected: true|false }
 * เลือก/ยกเลิกเลือกรูปให้เข้าเล่มรายงาน (ไม่เกิน 4 รูปที่ selected=true ต่อรายการ) — เหมือน Tab กิจกรรมงาน
 * (JE) ทุกประการ ต่างกันแค่ผูกกับ report_items แทน wbs_level3
 */
router.put('/items/photos/:photoId/select', requireCategoryPermission, async (req, res) => {
  try {
    const { selected } = req.body;
    const photoResult = await query('SELECT report_item_id FROM project_mgt.report_item_photos WHERE id = $1', [req.params.photoId]);
    if (photoResult.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรูปนี้' });
    const itemId = photoResult.rows[0].report_item_id;

    if (selected) {
      const countResult = await query(
        'SELECT COUNT(*)::int AS cnt FROM project_mgt.report_item_photos WHERE report_item_id = $1 AND selected = true',
        [itemId]
      );
      if (countResult.rows[0].cnt >= MAX_PHOTOS_PER_ITEM) {
        return res.status(400).json({ error: `เลือกรูปได้ไม่เกิน ${MAX_PHOTOS_PER_ITEM} รูปต่อรายการ กรุณายกเลิกรูปอื่นก่อน` });
      }
    }

    const result = await query(
      'UPDATE project_mgt.report_item_photos SET selected = $1 WHERE id = $2 RETURNING id, selected',
      [Boolean(selected), req.params.photoId]
    );
    res.json({ photo: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดำเนินการไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/reports/items/photos/:photoId?category=xxx
 * เอารูปที่แนบไว้ออกจากรายการถาวร (ไม่ได้ลบไฟล์จริงออกจาก Cloudinary แค่เลิกผูกกับรายการนี้) — ต่างจาก
 * PUT .../select ที่แค่ถอดออกจากเล่มรายงานชั่วคราว (รูปยังอยู่ใน pool ให้เลือกใหม่ทีหลังได้)
 */
router.delete('/items/photos/:photoId', requireCategoryPermission, async (req, res) => {
  try {
    const result = await query('DELETE FROM project_mgt.report_item_photos WHERE id = $1 RETURNING id', [req.params.photoId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรูปนี้' });
    res.json({ message: 'ลบรูปเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบรูปไม่สำเร็จ' });
  }
});

/**
 * GET /api/reports/:id/next-week
 * รายการ Tab "งานสัปดาห์หน้า" จัดกลุ่มตาม WBS Level1 จริง
 */
router.get('/:id/next-week', requirePermission('reports', 'next-week-plan'), async (req, res) => {
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
 * POST /api/reports/:id/next-week
 * body: { wbs_level1_id, content, target_percent }
 */
router.post('/:id/next-week', requirePermission('reports', 'next-week-plan'), async (req, res) => {
  try {
    const { wbs_level1_id, content, target_percent } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'กรุณากรอกรายการ' });

    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM project_mgt.report_next_week_items WHERE report_id = $1',
      [req.params.id]
    );
    const sortOrder = maxOrderResult.rows[0].max_order + 1;

    const result = await query(
      `INSERT INTO project_mgt.report_next_week_items (report_id, wbs_level1_id, sort_order, content, target_percent)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, wbs_level1_id, sort_order, content, target_percent`,
      [req.params.id, wbs_level1_id || null, sortOrder, content.trim(), target_percent || null]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เพิ่มรายการไม่สำเร็จ' });
  }
});

/**
 * PUT /api/reports/next-week/:itemId
 */
router.put('/next-week/:itemId', requirePermission('reports', 'next-week-plan'), async (req, res) => {
  try {
    const { wbs_level1_id, content, target_percent } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'กรุณากรอกรายการ' });
    const result = await query(
      `UPDATE project_mgt.report_next_week_items
       SET wbs_level1_id = $1, content = $2, target_percent = $3
       WHERE id = $4 RETURNING id, wbs_level1_id, sort_order, content, target_percent`,
      [wbs_level1_id || null, content.trim(), target_percent || null, req.params.itemId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แก้ไขรายการไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/reports/next-week/:itemId
 */
router.delete('/next-week/:itemId', requirePermission('reports', 'next-week-plan'), async (req, res) => {
  try {
    const result = await query('DELETE FROM project_mgt.report_next_week_items WHERE id = $1 RETURNING id', [req.params.itemId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.json({ message: 'ลบรายการเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบรายการไม่สำเร็จ' });
  }
});

/**
 * GET /api/reports/:id/photos
 * รูปถ่ายที่มีอยู่แล้ว (อัปโหลดจากการกรอกความคืบหน้าใน Menu3 Tab งานสัปดาห์นี้) ในช่วงสัปดาห์ของรายงาน
 * ฉบับนี้ (entry_date อยู่ระหว่าง week_start-week_end) จัดกลุ่มตามกิจกรรมงาน (wbs_level3) พร้อมบอกด้วยว่า
 * รูปไหนถูกเลือกไว้ในรายงานฉบับนี้แล้วบ้าง (selection_id ถ้าเลือกไว้แล้ว, null ถ้ายัง)
 */
router.get('/:id/photos', requirePermission('reports', 'photos'), async (req, res) => {
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
       ORDER BY wl3.id, pe.entry_date DESC, pp.id DESC`,
      [req.params.id, report.project_id, report.week_start, report.week_end]
    );

    // จัดกลุ่มตามกิจกรรมงาน
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

const MAX_PHOTOS_PER_ACTIVITY = 4; // ตามที่ตกลง: เลือกได้ไม่เกิน 4 รูปต่อกิจกรรมงาน ต่อรายงาน 1 ฉบับ

/**
 * POST /api/reports/:id/photos/select
 * body: { wbs_level3_id, photo_id }
 * เลือกรูปเข้ารายงานฉบับนี้ (เช็คไม่ให้เกิน 4 รูปต่อกิจกรรมงานทั้งฝั่ง backend ด้วย ไม่พึ่ง frontend อย่างเดียว)
 */
router.post('/:id/photos/select', requirePermission('reports', 'photos'), async (req, res) => {
  try {
    const { wbs_level3_id, photo_id } = req.body;
    if (!wbs_level3_id || !photo_id) {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบ (wbs_level3_id, photo_id)' });
    }

    const countResult = await query(
      'SELECT COUNT(*)::int AS cnt FROM project_mgt.report_photo_selections WHERE report_id = $1 AND wbs_level3_id = $2',
      [req.params.id, wbs_level3_id]
    );
    if (countResult.rows[0].cnt >= MAX_PHOTOS_PER_ACTIVITY) {
      return res.status(400).json({ error: `เลือกรูปได้ไม่เกิน ${MAX_PHOTOS_PER_ACTIVITY} รูปต่อกิจกรรมงาน` });
    }

    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM project_mgt.report_photo_selections WHERE report_id = $1 AND wbs_level3_id = $2',
      [req.params.id, wbs_level3_id]
    );
    const sortOrder = maxOrderResult.rows[0].max_order + 1;

    const result = await query(
      `INSERT INTO project_mgt.report_photo_selections (report_id, wbs_level3_id, progress_photo_id, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (report_id, progress_photo_id) DO NOTHING
       RETURNING id`,
      [req.params.id, wbs_level3_id, photo_id, sortOrder]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'รูปนี้ถูกเลือกไว้แล้ว' });
    }
    res.status(201).json({ selection_id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เลือกรูปไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/reports/photos/select/:selectionId
 * ยกเลิกการเลือกรูปนั้นออกจากรายงาน (ไม่ได้ลบรูปจริงออกจากระบบ/Cloudinary แค่เอาออกจากรายงานฉบับนี้)
 */
router.delete('/photos/select/:selectionId', requirePermission('reports', 'photos'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM project_mgt.report_photo_selections WHERE id = $1 RETURNING id',
      [req.params.selectionId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายการที่เลือกไว้นี้' });
    res.json({ message: 'ยกเลิกการเลือกรูปเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ยกเลิกไม่สำเร็จ' });
  }
});

/**
 * ดาวน์โหลดรูปจาก Cloudinary URL มาเป็น buffer จริง — จำเป็นสำหรับฝังรูปลงในไฟล์ Word (ImageRun ต้องการ
 * เนื้อไฟล์จริง ฝัง URL เฉยๆ ไม่ได้) พร้อมตรวจชนิดไฟล์จาก Content-Type จริง (docx lib เวอร์ชันนี้บังคับ
 * ต้องระบุ type ให้ ImageRun ชัดเจน ไม่งั้นได้ไฟล์แนบที่นามสกุลเพี้ยนเป็น .undefined เปิดใน Word ไม่ได้)
 */
async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`โหลดรูปไม่สำเร็จ (${response.status}): ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || '';
  let type = 'jpg';
  if (contentType.includes('png')) type = 'png';
  else if (contentType.includes('gif')) type = 'gif';
  else if (contentType.includes('bmp')) type = 'bmp';
  return { buffer: Buffer.from(arrayBuffer), type };
}

function fmtDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fmtPctText(v) {
  return `${Number(v).toFixed(1)}%`;
}

const CATEGORY_SECTION_LABELS = {
  quality: '2. งานตรวจสอบคุณภาพ',
  safety: '3. ความปลอดภัยและสิ่งแวดล้อม',
  problems: '5. ปัญหาและอุปสรรค',
  additional_work: '6. งานเพิ่ม/งานลด',
  pending: '7. รายการที่รอการตัดสินใจจากผู้ว่าจ้าง',
};

// ลำดับหัวข้อในเล่มรายงาน ตามที่ตกลงกันไว้ (อ้างอิงจากไฟล์ตัวอย่าง)
const TOC_ITEMS = [
  '1. แผนงานและความคืบหน้างาน',
  '2. งานตรวจสอบคุณภาพ',
  '3. ความปลอดภัยและสิ่งแวดล้อม',
  '4. แผนงานสัปดาห์หน้า',
  '5. ปัญหาและอุปสรรค',
  '6. งานเพิ่ม/งานลด',
  '7. รายการที่รอการตัดสินใจจากผู้ว่าจ้าง',
];

/** สร้างแถวตาราง WBS 1 แถว (ใช้ร่วมกันทั้ง 3 ระดับ ต่างกันแค่ font-weight/indent) */
function wbsTableRow(label, weightText, planText, actualText, remark, opts = {}) {
  const bold = Boolean(opts.bold);
  const shade = opts.shade;
  const cellOpts = shade ? { shading: { type: ShadingType.CLEAR, fill: shade } } : {};
  const textCell = (text, alignment = AlignmentType.CENTER) => new TableCell({
    ...cellOpts,
    children: [new Paragraph({ alignment, children: [new TextRun({ text: String(text), bold })] })],
  });
  return new TableRow({
    children: [
      new TableCell({ ...cellOpts, children: [new Paragraph({ children: [new TextRun({ text: `${opts.indent || ''}${label}`, bold })] })] }),
      textCell(weightText),
      textCell(planText),
      textCell(actualText),
      textCell(remark || '', AlignmentType.LEFT),
    ],
  });
}

/**
 * GET /api/reports/:id/export
 * รวมทุก Tab ของรายงานฉบับนี้ ประกอบเป็นไฟล์ Word (.docx) เดียว ดาวน์โหลดกลับไปตรงๆ (ไม่ใช่ JSON)
 * โครงสร้างอ้างอิงตามไฟล์ตัวอย่างที่ผู้ใช้ให้มา: ปก → สารบัญ → 7 หัวข้อ (Plan&Progress รวมรูปถ่ายอยู่ในนี้
 * ด้วย) — หมายเหตุ: ใช้ตาราง WBS ล้วนๆ แทนกราฟ Gantt+S-Curve แบบผสมของต้นฉบับ (ตกลงกันไว้แล้วว่าจะไม่ทำ
 * กราฟซับซ้อนแบบนั้น ใช้ตัวเลขจากตารางแทน)
 */
router.get('/:id/export', requirePermission('reports', 'compiled'), async (req, res) => {
  try {
    const reportId = req.params.id;
    const progressData = await getReportProgressData(reportId);
    if (!progressData) return res.status(404).json({ error: 'ไม่พบรายงานนี้' });
    const { report, overall, groups } = progressData;

    const projectResult = await query('SELECT project_code, name FROM project_mgt.projects WHERE id = $1', [report.project_id]);
    const project = projectResult.rows[0] || { project_code: '', name: '' };

    let creatorName = '-';
    if (report.created_by) {
      const creatorResult = await query('SELECT name FROM project_mgt.users WHERE id = $1', [report.created_by]);
      if (creatorResult.rows.length > 0) creatorName = creatorResult.rows[0].name;
    }

    // ---- รายการ 5 หมวด (คุณภาพ/ความปลอดภัย/ปัญหา/งานเพิ่มลด/เรื่องค้าง) — คุณภาพงาน/ความปลอดภัยมีรูปถ่าย
    // แนบได้ด้วย (Tab อื่นไม่มี) ดาวน์โหลดเนื้อไฟล์จริงมาฝังใน Word เลยถ้ามีรูปแนบไว้
    const itemsByCategory = {};
    for (const cat of VALID_CATEGORIES) {
      // eslint-disable-next-line no-await-in-loop
      const r = await query(
        'SELECT id, content FROM project_mgt.report_items WHERE report_id = $1 AND category = $2 ORDER BY sort_order, id',
        [reportId, cat]
      );
      itemsByCategory[cat] = r.rows.map((row) => ({ id: row.id, content: row.content }));
    }
    for (const cat of ['quality', 'safety']) {
      for (const item of itemsByCategory[cat]) {
        // eslint-disable-next-line no-await-in-loop
        const photosResult = await query(
          'SELECT photo_url FROM project_mgt.report_item_photos WHERE report_item_id = $1 ORDER BY sort_order, id',
          [item.id]
        );
        item.photoBuffers = [];
        for (const row of photosResult.rows) {
          try {
            // eslint-disable-next-line no-await-in-loop
            item.photoBuffers.push(await fetchImageBuffer(row.photo_url));
          } catch (e) {
            console.error('โหลดรูปของรายการไม่สำเร็จ ข้ามไปแทนที่จะทำให้สร้างรายงานทั้งฉบับพัง:', e.message);
          }
        }
      }
    }

    // ---- งานสัปดาห์หน้า จัดกลุ่มตาม Level1 ----
    const nextWeekResult = await query(
      `SELECT n.wbs_level1_id, l1.code AS level1_code, l1.name AS level1_name, n.content, n.target_percent
       FROM project_mgt.report_next_week_items n
       LEFT JOIN project_mgt.wbs_level1 l1 ON l1.id = n.wbs_level1_id
       WHERE n.report_id = $1 ORDER BY l1.code NULLS LAST, n.sort_order, n.id`,
      [reportId]
    );
    const nextWeekGroups = [];
    const nwIndex = new Map();
    nextWeekResult.rows.forEach((row) => {
      const key = row.wbs_level1_id || 'none';
      if (!nwIndex.has(key)) {
        nwIndex.set(key, nextWeekGroups.length);
        nextWeekGroups.push({ label: row.wbs_level1_id ? `${row.level1_code} - ${row.level1_name}` : 'ทั่วไป', items: [] });
      }
      nextWeekGroups[nwIndex.get(key)].items.push({ content: row.content, target_percent: row.target_percent });
    });

    // ---- รูปที่เลือกไว้ จัดกลุ่มตามกิจกรรมงาน แล้วดาวน์โหลดเนื้อไฟล์จริงมาฝังใน Word ----
    const photosResult = await query(
      `SELECT sel.wbs_level3_id, wl3.code AS activity_code, wl3.name AS activity_name, pp.photo_url, sel.sort_order
       FROM project_mgt.report_photo_selections sel
       JOIN project_mgt.progress_photos pp ON pp.id = sel.progress_photo_id
       JOIN project_mgt.wbs_level3 wl3 ON wl3.id = sel.wbs_level3_id
       WHERE sel.report_id = $1
       ORDER BY wl3.id, sel.sort_order`,
      [reportId]
    );
    const photoGroups = [];
    const photoIndex = new Map();
    photosResult.rows.forEach((row) => {
      if (!photoIndex.has(row.wbs_level3_id)) {
        photoIndex.set(row.wbs_level3_id, photoGroups.length);
        photoGroups.push({ label: `${row.activity_code} - ${row.activity_name}`, urls: [] });
      }
      photoGroups[photoIndex.get(row.wbs_level3_id)].urls.push(row.photo_url);
    });
    for (const g of photoGroups) {
      g.buffers = [];
      for (const url of g.urls) {
        try {
          // eslint-disable-next-line no-await-in-loop
          g.buffers.push(await fetchImageBuffer(url));
        } catch (e) {
          console.error('โหลดรูปไม่สำเร็จ ข้ามรูปนี้ไปแทนที่จะทำให้สร้างรายงานทั้งฉบับพัง:', e.message);
        }
      }
    }
    // ==================== ประกอบเอกสาร Word ====================
    const children = [];

    // --- ปก ---
    children.push(
      new Paragraph({ spacing: { before: 2000 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${project.project_code} - ${project.name}`, bold: true, size: 40, color: '2E5C9A' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: `WEEKLY REPORT #${report.report_no}`, bold: true, size: 28, color: '2E5C9A' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: `AS AT : ${fmtDMY(report.week_end)}`, size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 3000 }, children: [new TextRun({ text: creatorName, size: 22, color: '2E5C9A' })] }),
    );

    // --- สารบัญ (static list ไม่ใช่ TOC field code ของ Word จริง) ---
    children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, children: [new TextRun('WORK PROGRESS REPORT')] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${project.name.toUpperCase()}`, bold: true })] }));
    children.push(new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'หัวข้อ', bold: true })] }));
    TOC_ITEMS.forEach((item) => children.push(new Paragraph({ text: item, bullet: { level: 0 } })));

    // --- หัวข้อ 1: แผนงานและความคืบหน้างาน ---
    children.push(new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2, children: [new TextRun('1. แผนงานและความคืบหน้างาน')] }));
    children.push(new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({ text: 'Overall Work progress   ', bold: true }),
        new TextRun({ text: `Plan ${fmtPctText(overall.plan)}   `, bold: true }),
        new TextRun({ text: `Actual ${fmtPctText(overall.actual)}   `, bold: true }),
        new TextRun({ text: `Gain/Delay ${overall.gain_delay >= 0 ? '+' : ''}${overall.gain_delay.toFixed(1)}%`, bold: true, color: overall.gain_delay >= 0 ? '1E8E4F' : 'C0392B' }),
      ],
    }));

    const wbsRows = [
      new TableRow({
        children: ['โครงสร้างงาน', '%Weight', '%Plan', '%Actual', 'รายการ'].map((h) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: 'D9D9D9' },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true })] })],
        })),
      }),
    ];
    groups.forEach((g) => {
      wbsRows.push(wbsTableRow(`${g.code} ${g.name}`, fmtPctText(g.weight_percent), fmtPctText(g.plan_percent), fmtPctText(g.actual_percent), g.remark, { bold: true, shade: 'F2F2F2' }));
      g.items.forEach((it) => {
        wbsRows.push(wbsTableRow(`${it.code} ${it.name}`, fmtPctText(it.weight_percent), fmtPctText(it.plan_percent), fmtPctText(it.actual_percent), it.remark, { indent: '   ' }));
        it.activities.forEach((act) => {
          wbsRows.push(wbsTableRow(`${act.code} ${act.name}`, `${Math.round(act.share_percent)}%`, fmtPctText(act.plan_percent), fmtPctText(act.actual_percent), act.remark, { indent: '      ' }));
        });
      });
    });
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: wbsRows }));

    // --- รูปถ่ายความคืบหน้า (แทรกต่อจากตาราง อยู่ในหัวข้อ 1 เดียวกัน) ---
    photoGroups.forEach((g) => {
      if (g.buffers.length === 0) return;
      children.push(new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: `รูปถ่าย : ${g.label}`, bold: true, underline: {} })] }));
      const imgCells = g.buffers.map((img) => new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: img.buffer, type: img.type, transformation: { width: 260, height: 195 } })] })],
      }));
      const photoRows = [];
      for (let i = 0; i < imgCells.length; i += 2) {
        const pair = [imgCells[i]];
        if (imgCells[i + 1]) pair.push(imgCells[i + 1]); else pair.push(new TableCell({ children: [new Paragraph('')] }));
        photoRows.push(new TableRow({ children: pair }));
      }
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
        rows: photoRows,
      }));
    });

    // --- หัวข้อ 2,3: คุณภาพงาน/ความปลอดภัย (มีรูปถ่ายแนบได้ ถ้าไม่แนบก็แค่ไม่มีรูปโชว์ ไม่ใช่ error) ---
    ['quality', 'safety'].forEach((cat) => {
      children.push(new Paragraph({ pageBreakBefore: cat === 'quality', heading: HeadingLevel.HEADING_2, children: [new TextRun(CATEGORY_SECTION_LABELS[cat])] }));
      const list = itemsByCategory[cat];
      if (list.length === 0) {
        children.push(new Paragraph({ text: '-' }));
      } else {
        list.forEach((item) => {
          children.push(new Paragraph({ text: item.content, bullet: { level: 0 } }));
          if (item.photoBuffers && item.photoBuffers.length > 0) {
            const imgCells = item.photoBuffers.map((img) => new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: img.buffer, type: img.type, transformation: { width: 180, height: 135 } })] })],
            }));
            const photoRows = [];
            for (let i = 0; i < imgCells.length; i += 2) {
              const pair = [imgCells[i]];
              if (imgCells[i + 1]) pair.push(imgCells[i + 1]); else pair.push(new TableCell({ children: [new Paragraph('')] }));
              photoRows.push(new TableRow({ children: pair }));
            }
            children.push(new Table({
              width: { size: 60, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
              },
              rows: photoRows,
            }));
          }
        });
      }
    });

    // --- หัวข้อ 4: แผนงานสัปดาห์หน้า ---
    children.push(new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2, children: [new TextRun('4. แผนงานสัปดาห์หน้า / Next week plan')] }));
    if (nextWeekGroups.length === 0) children.push(new Paragraph({ text: '-' }));
    nextWeekGroups.forEach((g, gi) => {
      children.push(new Paragraph({ spacing: { before: 150 }, children: [new TextRun({ text: `${gi + 1}.) ${g.label}`, bold: true })] }));
      g.items.forEach((item) => {
        const text = item.target_percent !== null && item.target_percent !== undefined ? `${item.content} ${item.target_percent}%` : item.content;
        children.push(new Paragraph({ text: `✓ ${text}`, indent: { left: 400 } }));
      });
    });

    // --- หัวข้อ 5,6,7 ---
    ['problems', 'additional_work', 'pending'].forEach((cat) => {
      children.push(new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_2, children: [new TextRun(CATEGORY_SECTION_LABELS[cat])] }));
      const list = itemsByCategory[cat];
      if (list.length === 0) children.push(new Paragraph({ text: '-' }));
      else list.forEach((item) => children.push(new Paragraph({ text: item.content, bullet: { level: 0 } })));
    });

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    const filename = `WeeklyReport_${project.project_code}_${report.report_no}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'สร้างไฟล์รายงานไม่สำเร็จ' });
  }
});

module.exports = router;
