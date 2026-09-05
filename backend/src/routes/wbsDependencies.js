// routes/wbsDependencies.js
// "เชื่อมโยงวันที่" ระหว่างกิจกรรมงาน (Level 3) — เหมือน Task Dependency ใน MS Project
// รองรับ FS (default) / SS / FF / SF พร้อม Lag/Lead (+/- วัน)
// การสร้าง/แก้ไขลิงก์ จะสั่งคำนวณวันที่ของกิจกรรมงานปลายทางใหม่ทันที แล้วไล่ cascade ต่อเป็นทอดๆ
// ผ่าน src/lib/scheduling.js (ใช้ร่วมกับ route wbs-level3 ตอนแก้วันที่ตรงๆ ด้วย)

const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const { recalcActivity, wouldCreateCycle } = require('../lib/scheduling');

const router = express.Router();
router.use(verifyToken);

const VALID_TYPES = ['FS', 'SS', 'FF', 'SF'];

/**
 * GET /api/wbs-dependencies?level3_id=X
 * ดูลิงก์ predecessor ทั้งหมดของกิจกรรมงานนี้ (X คือ successor)
 */
router.get('/', async (req, res) => {
  try {
    const { level3_id } = req.query;
    if (!level3_id) {
      return res.status(400).json({ error: 'กรุณาระบุ level3_id' });
    }

    const result = await query(
      `SELECT d.id, d.predecessor_id, d.dependency_type, d.lag_days,
              p.code AS predecessor_code, p.name AS predecessor_name
       FROM project_mgt.wbs_dependencies d
       JOIN project_mgt.wbs_level3 p ON p.id = d.predecessor_id
       WHERE d.successor_id = $1
       ORDER BY d.id`,
      [level3_id]
    );
    res.json({ links: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลลิงก์เชื่อมโยงไม่สำเร็จ' });
  }
});

/**
 * POST /api/wbs-dependencies
 * body: { successor_id, predecessor_id, dependency_type ('FS' ถ้าไม่ระบุ), lag_days (0 ถ้าไม่ระบุ) }
 */
router.post('/', requirePermission('project_data', 'gantt'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { successor_id, predecessor_id, dependency_type, lag_days } = req.body;
    if (!successor_id || !predecessor_id) {
      return res.status(400).json({ error: 'กรุณาระบุกิจกรรมงานต้นทางและปลายทาง' });
    }
    if (String(successor_id) === String(predecessor_id)) {
      return res.status(400).json({ error: 'ไม่สามารถเชื่อมโยงกิจกรรมงานกับตัวเองได้' });
    }
    const type = VALID_TYPES.includes(dependency_type) ? dependency_type : 'FS';
    const lag = parseInt(lag_days, 10) || 0;

    const dup = await query(
      'SELECT id FROM project_mgt.wbs_dependencies WHERE successor_id = $1 AND predecessor_id = $2',
      [successor_id, predecessor_id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'เชื่อมโยงคู่นี้ไว้อยู่แล้ว' });
    }

    if (await wouldCreateCycle(predecessor_id, successor_id)) {
      return res.status(409).json({
        error: 'ไม่สามารถเชื่อมโยงได้ เพราะจะทำให้เกิดการอ้างอิงวนกลับไปมา (circular dependency)',
      });
    }

    const result = await query(
      `INSERT INTO project_mgt.wbs_dependencies (successor_id, predecessor_id, dependency_type, lag_days)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [successor_id, predecessor_id, type, lag]
    );

    await recalcActivity(successor_id, new Set());

    res.status(201).json({ link: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เพิ่มลิงก์เชื่อมโยงไม่สำเร็จ' });
  }
});

/**
 * PUT /api/wbs-dependencies/:id
 * body: { dependency_type?, lag_days? }
 */
router.put('/:id', requirePermission('project_data', 'gantt'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { dependency_type, lag_days } = req.body;
    const type = VALID_TYPES.includes(dependency_type) ? dependency_type : null;
    const lag = lag_days !== undefined && lag_days !== null && lag_days !== ''
      ? (parseInt(lag_days, 10) || 0)
      : null;

    const result = await query(
      `UPDATE project_mgt.wbs_dependencies
       SET dependency_type = COALESCE($1, dependency_type),
           lag_days = COALESCE($2, lag_days)
       WHERE id = $3
       RETURNING *`,
      [type, lag, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบลิงก์เชื่อมโยงนี้' });
    }

    await recalcActivity(result.rows[0].successor_id, new Set());

    res.json({ link: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แก้ไขลิงก์เชื่อมโยงไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/wbs-dependencies/:id
 * ลบลิงก์เฉยๆ ไม่ปรับวันที่คืน (เหมือนพฤติกรรมของ MS Project ตอน unlink)
 */
router.delete('/:id', requirePermission('project_data', 'gantt'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM project_mgt.wbs_dependencies WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบลิงก์เชื่อมโยงนี้' });
    }
    res.json({ message: 'ลบลิงก์สำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบลิงก์เชื่อมโยงไม่สำเร็จ' });
  }
});

module.exports = router;
