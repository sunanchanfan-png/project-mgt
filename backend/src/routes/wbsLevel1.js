// routes/wbsLevel1.js
const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken);

/**
 * สร้างรหัสอัตโนมัติ รูปแบบ JG-{running} เฉพาะภายในโครงการนั้น (เริ่มนับใหม่ทุกโครงการ)
 */
async function generateGroupCode(projectId) {
  const result = await query(
    `SELECT code FROM project_mgt.wbs_level1
     WHERE project_id = $1
     ORDER BY id DESC LIMIT 1`,
    [projectId]
  );
  let nextRunning = 1;
  if (result.rows.length > 0) {
    const lastCode = result.rows[0].code; // เช่น JG-7
    const lastRunning = parseInt(lastCode.split('-')[1], 10);
    if (!isNaN(lastRunning)) nextRunning = lastRunning + 1;
  }
  return `JG-${nextRunning}`;
}

/**
 * GET /api/wbs-level1?project_id=X
 * ดูรายการกลุ่มงานหลักของโครงการ พร้อมคำนวณมูลค่าเหลือ/%Weight สด
 * และแถวสรุปยอดรวม
 */
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'กรุณาระบุ project_id' });
    }

    const projectResult = await query(
      'SELECT id, name, budget_total FROM project_mgt.projects WHERE id = $1',
      [project_id]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบโครงการนี้' });
    }
    const project = projectResult.rows[0];
    const projectBudget = parseFloat(project.budget_total) || 0;

    const itemsResult = await query(
      `SELECT * FROM project_mgt.wbs_level1
       WHERE project_id = $1
       ORDER BY COALESCE(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::INTEGER, 999999), code`,
      [project_id]
    );

    // คำนวณมูลค่าเหลือของทุกแถวก่อน เพื่อหาผลรวมไว้เป็นตัวหารของ %Weight
    const itemsWithRemaining = itemsResult.rows.map((row) => {
      const amount = parseFloat(row.amount) || 0;
      const deductPercent = parseFloat(row.deduct_percent) || 0;
      const remainingAmount = amount * (1 - deductPercent / 100);
      return { ...row, remaining_amount: remainingAmount };
    });

    const totalRemaining = itemsWithRemaining.reduce((sum, r) => sum + r.remaining_amount, 0);

    // %Weight = มูลค่าเหลือของแถวนี้ ÷ ผลรวมมูลค่าเหลือของทุกกลุ่มงาน × 100
    // (ไม่ใช้มูลค่าโครงการเป็นตัวหารแล้ว เพื่อให้ผลรวม %Weight ทั้งหมด = 100% เสมอ
    // ไม่ว่าจะกรอกมูลค่ารวมตรงกับมูลค่าโครงการหรือไม่ก็ตาม)
    const items = itemsWithRemaining.map((row) => ({
      ...row,
      weight_percent: totalRemaining > 0 ? (row.remaining_amount / totalRemaining) * 100 : 0,
    }));

    const totals = items.reduce(
      (acc, item) => ({
        // ไม่รวม amount ของ "กลุ่มงานสุดท้าย" เข้ายอดรวมมูลค่า เพราะเป็นเงินก้อนเดียวกับ
        // ที่ถูกหักไว้จากกลุ่มอื่นแล้ว (นับในยอดรวมมูลค่าอีกครั้งจะกลายเป็นนับซ้ำ)
        amount: acc.amount + (item.is_final_group ? 0 : (parseFloat(item.amount) || 0)),
        remaining_amount: acc.remaining_amount + item.remaining_amount,
        weight_percent: acc.weight_percent + item.weight_percent,
      }),
      { amount: 0, remaining_amount: 0, weight_percent: 0 }
    );

    res.json({
      project: { id: project.id, name: project.name, budget_total: projectBudget },
      items,
      totals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลกลุ่มงานหลักไม่สำเร็จ' });
  }
});

/**
 * POST /api/wbs-level1
 * เพิ่มกลุ่มงานหลักใหม่ (เฉพาะ admin, pm) — รหัส auto-run ไม่ต้องส่งมา
 * body: { project_id, name, amount, deduct_percent }
 */
router.post('/', requirePermission('project_data', 'group'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { project_id, code, name, amount, deduct_percent, is_final_group } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ error: 'กรุณาระบุโครงการและชื่อกลุ่มงาน' });
    }

    const isFinal = Boolean(is_final_group);
    // กลุ่มงานสุดท้ายบังคับ % หัก = 0 เสมอ (กันไม่ให้ frontend ส่งค่าอื่นมาหลอก)
    const deductPct = isFinal ? 0 : (parseFloat(deduct_percent) || 0);
    if (deductPct < 0 || deductPct > 100) {
      return res.status(400).json({ error: '% หัก ต้องอยู่ระหว่าง 0-100' });
    }

    // ใช้รหัสที่ส่งมาถ้ามี ไม่งั้น auto-run ต่อจากรหัสล่าสุด
    const finalCode = code && code.trim() ? code.trim() : await generateGroupCode(project_id);

    const dup = await query(
      'SELECT id FROM project_mgt.wbs_level1 WHERE project_id = $1 AND code = $2',
      [project_id, finalCode]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `รหัส "${finalCode}" ถูกใช้ไปแล้วในโครงการนี้` });
    }

    const result = await query(
      `INSERT INTO project_mgt.wbs_level1 (project_id, code, name, amount, deduct_percent, is_final_group)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [project_id, finalCode, name, amount || 0, deductPct, isFinal]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เพิ่มกลุ่มงานหลักไม่สำเร็จ' });
  }
});

/**
 * PUT /api/wbs-level1/:id
 * แก้ไขกลุ่มงานหลัก (เฉพาะ admin, pm) — code แก้ไม่ได้
 */
router.put('/:id', requirePermission('project_data', 'group'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { code, name, amount, deduct_percent, is_final_group } = req.body;

    let deductPct = deduct_percent;
    if (is_final_group === true) {
      deductPct = 0; // กลุ่มงานสุดท้ายบังคับ % หัก = 0 เสมอ
    }
    if (deductPct !== undefined && deductPct !== null) {
      const d = parseFloat(deductPct);
      if (d < 0 || d > 100) {
        return res.status(400).json({ error: '% หัก ต้องอยู่ระหว่าง 0-100' });
      }
    }

    if (code && code.trim()) {
      const dup = await query(
        `SELECT id FROM project_mgt.wbs_level1
         WHERE project_id = (SELECT project_id FROM project_mgt.wbs_level1 WHERE id = $1)
           AND code = $2 AND id != $1`,
        [req.params.id, code.trim()]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: `รหัส "${code.trim()}" ถูกใช้ไปแล้วในโครงการนี้` });
      }
    }

    const result = await query(
      `UPDATE project_mgt.wbs_level1
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           amount = COALESCE($3, amount),
           deduct_percent = COALESCE($4, deduct_percent),
           is_final_group = COALESCE($5, is_final_group),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        code && code.trim() ? code.trim() : null,
        name ?? null,
        amount ?? null,
        deductPct ?? null,
        is_final_group ?? null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    }

    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แก้ไขไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/wbs-level1/:id (เฉพาะ admin, pm)
 * ตอนนี้ลบถาวรได้เลย เพราะยังไม่มีตาราง Level 2/3 อ้างอิงถึง
 * เมื่อสร้าง Level 2 แล้ว ควรเปลี่ยนมาใช้ pattern เดียวกับ projects
 * (ตรวจ foreign key อัตโนมัติ ลบไม่ได้ถ้ามีลูกอยู่)
 */
router.delete('/:id', requirePermission('project_data', 'group'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM project_mgt.wbs_level1 WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    }
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบไม่สำเร็จ' });
  }
});

module.exports = router;
