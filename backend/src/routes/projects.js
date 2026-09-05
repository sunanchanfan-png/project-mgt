// routes/projects.js
const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken);

/**
 * สร้างรหัสโครงการอัตโนมัติ รูปแบบ SK-{ปี พ.ศ. 2 หลักท้าย}{running 2 หลัก}
 * เช่น SK-6901, SK-6902 ... ขึ้นปีใหม่ (พ.ศ. เปลี่ยน) เลข 2 ตัวแรกจะเปลี่ยนตาม
 * และ running number จะเริ่มนับใหม่จาก 01 โดยอัตโนมัติ (เพราะ pattern ค้นหา
 * เฉพาะรหัสที่ขึ้นต้นด้วยปีปัจจุบันเท่านั้น)
 */
async function generateProjectCode() {
  const beYear = new Date().getFullYear() + 543; // ปี พ.ศ.
  const yy = String(beYear).slice(-2);
  const prefix = `SK-${yy}`;

  const result = await query(
    `SELECT project_code FROM project_mgt.projects
     WHERE project_code LIKE $1
     ORDER BY project_code DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextRunning = 1;
  if (result.rows.length > 0) {
    const lastCode = result.rows[0].project_code; // เช่น SK-6907
    const lastRunning = parseInt(lastCode.slice(-2), 10);
    nextRunning = lastRunning + 1;
  }

  return `${prefix}${String(nextRunning).padStart(2, '0')}`;
}

/**
 * GET /api/projects
 * ดูรายการโปรเจกต์ทั้งหมด รองรับ filter ปีผ่าน query param ?year=69
 */
router.get('/', async (req, res) => {
  try {
    const { year } = req.query;
    let sql = `SELECT id, project_code, name, client_name, description,
                      contract_number, contract_start, contract_end, duration_days,
                      contact_person, contact_phone, supervisor_name, supervisor_phone,
                      location, budget_total, status, created_at, updated_at
               FROM project_mgt.projects`;
    const params = [];

    if (year) {
      sql += ` WHERE project_code LIKE $1`;
      params.push(`SK-${year}%`);
    }

    sql += ` ORDER BY project_code DESC`;

    const result = await query(sql, params);
    res.json({ projects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลโปรเจกต์ไม่สำเร็จ' });
  }
});

/**
 * GET /api/projects/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM project_mgt.projects WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบโปรเจกต์นี้' });
    }
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลโปรเจกต์ไม่สำเร็จ' });
  }
});

/**
 * POST /api/projects
 * สร้างโปรเจกต์ใหม่ (เฉพาะ admin, pm) — รหัสโครงการ (project_code) สร้าง
 * ให้อัตโนมัติ ไม่ต้องส่งมาจาก client
 */
router.post('/', requirePermission('open_project'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const {
      name, client_name, description, contract_number,
      contract_start, contract_end, duration_days, contact_person, contact_phone,
      supervisor_name, supervisor_phone, budget_total,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อโครงการ' });
    }

    const projectCode = await generateProjectCode();

    const result = await query(
      `INSERT INTO project_mgt.projects
        (project_code, name, client_name, description, contract_number,
         contract_start, contract_end, duration_days, contact_person, contact_phone,
         supervisor_name, supervisor_phone, budget_total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'on')
       RETURNING *`,
      [projectCode, name, client_name || null, description || null,
        contract_number || null, contract_start || null, contract_end || null,
        duration_days || null,
        contact_person || null, contact_phone || null,
        supervisor_name || null, supervisor_phone || null, budget_total || 0]
    );

    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'สร้างโปรเจกต์ไม่สำเร็จ' });
  }
});

/**
 * PUT /api/projects/:id
 * แก้ไขโปรเจกต์ (เฉพาะ admin, pm) — project_code แก้ไม่ได้ (คงที่ตลอดอายุโปรเจกต์)
 */
router.put('/:id', requirePermission('open_project'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const {
      name, client_name, description, contract_number,
      contract_start, contract_end, duration_days, contact_person, contact_phone,
      supervisor_name, supervisor_phone, status, budget_total,
    } = req.body;

    const result = await query(
      `UPDATE project_mgt.projects
       SET name = COALESCE($1, name),
           client_name = COALESCE($2, client_name),
           description = COALESCE($3, description),
           contract_number = COALESCE($4, contract_number),
           contract_start = COALESCE($5, contract_start),
           contract_end = COALESCE($6, contract_end),
           duration_days = COALESCE($7, duration_days),
           contact_person = COALESCE($8, contact_person),
           contact_phone = COALESCE($9, contact_phone),
           supervisor_name = COALESCE($10, supervisor_name),
           supervisor_phone = COALESCE($11, supervisor_phone),
           status = COALESCE($12, status),
           budget_total = COALESCE($13, budget_total),
           updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [name, client_name, description, contract_number, contract_start,
        contract_end, duration_days, contact_person, contact_phone, supervisor_name,
        supervisor_phone, status, budget_total, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบโปรเจกต์นี้' });
    }

    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แก้ไขโปรเจกต์ไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/projects/:id
 * ลบโครงการ (เฉพาะ admin, pm)
 * - ถ้าโครงการนี้ยังไม่มีข้อมูลผูกกับเมนูอื่น (WBS, cost, progress ฯลฯ
 *   ในอนาคต) จะลบถาวรออกจากฐานข้อมูลเลย
 * - ถ้ามีข้อมูลผูกอยู่แล้ว (Postgres จะบล็อกด้วย foreign key constraint)
 *   จะเปลี่ยนสถานะเป็น 'closed' แทนการลบถาวร เพื่อไม่ให้ข้อมูลที่เชื่อมโยง
 *   อยู่เสียหาย
 * หมายเหตุ: กลไกนี้ทำงานอัตโนมัติผ่าน foreign key ของ Postgres - เมื่อสร้าง
 * ตารางเมนูอื่นที่อ้างอิง projects.id ในอนาคต (โดยไม่ใส่ ON DELETE CASCADE)
 * ระบบจะตรวจจับและ fallback เป็น closed ให้เองโดยไม่ต้องแก้โค้ดตรงนี้อีก
 */
router.delete('/:id', requirePermission('open_project'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM project_mgt.projects WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบโปรเจกต์นี้' });
    }
    res.json({ mode: 'deleted', message: 'ลบโครงการถาวรสำเร็จ' });
  } catch (err) {
    if (err.code === '23503') {
      // foreign_key_violation: มีข้อมูลผูกกับเมนูอื่นอยู่ เปลี่ยนเป็นปิดแทน
      try {
        const closed = await query(
          `UPDATE project_mgt.projects
           SET status = 'closed', updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [req.params.id]
        );
        if (closed.rows.length === 0) {
          return res.status(404).json({ error: 'ไม่พบโปรเจกต์นี้' });
        }
        return res.json({
          mode: 'closed',
          message: 'โครงการนี้มีข้อมูลเชื่อมโยงกับเมนูอื่นแล้ว จึงเปลี่ยนสถานะเป็น Closed แทนการลบถาวร',
          project: closed.rows[0],
        });
      } catch (err2) {
        console.error(err2);
        return res.status(500).json({ error: 'ดำเนินการไม่สำเร็จ' });
      }
    }
    console.error(err);
    res.status(500).json({ error: 'ดำเนินการไม่สำเร็จ' });
  }
});

module.exports = router;
