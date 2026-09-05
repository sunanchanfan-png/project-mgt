// routes/wbsLevel2.js
const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken);

/**
 * สร้างรหัสอัตโนมัติ รูปแบบ JN-{เลขกลุ่มงาน}{running 2 หลัก}
 * เช่น กลุ่มงาน JG-1 -> รายการงานแรกเป็น JN-101, รายการที่ 2 เป็น JN-102
 * เลขกลุ่มงานดึงจากตัวเลขในรหัสกลุ่มงานพ่อสดๆ ทุกครั้ง (เผื่อมีการแก้รหัสกลุ่มทีหลัง)
 */
async function generateItemCode(level1Id) {
  const level1Result = await query(
    'SELECT code FROM project_mgt.wbs_level1 WHERE id = $1',
    [level1Id]
  );
  const groupCode = level1Result.rows[0]?.code || '';
  const groupNumberMatch = groupCode.match(/\d+/);
  const groupNumber = groupNumberMatch ? groupNumberMatch[0] : '0';

  const siblingsResult = await query(
    'SELECT code FROM project_mgt.wbs_level2 WHERE level1_id = $1',
    [level1Id]
  );
  let maxRunning = 0;
  siblingsResult.rows.forEach((r) => {
    const digitsOnly = r.code.replace(/\D/g, '');
    const runningPart = digitsOnly.slice(-2); // running คือ 2 หลักท้ายสุดเสมอ
    const n = parseInt(runningPart, 10);
    if (!isNaN(n) && n > maxRunning) maxRunning = n;
  });

  const nextRunning = String(maxRunning + 1).padStart(2, '0');
  return `JN-${groupNumber}${nextRunning}`;
}

/**
 * คำนวณ weight_percent ของกลุ่มงาน (Level 1) หนึ่งตัว โดยเทียบกับผลรวม
 * มูลค่าเหลือของทุกกลุ่มงานในโครงการเดียวกัน (สูตรเดียวกับหน้า "กลุ่มงานหลัก")
 * คืนค่า { level1, remainingAmount, weightPercent }
 */
async function getLevel1WeightInfo(level1Id) {
  const level1Result = await query(
    'SELECT * FROM project_mgt.wbs_level1 WHERE id = $1',
    [level1Id]
  );
  if (level1Result.rows.length === 0) return null;
  const level1 = level1Result.rows[0];

  const siblingsResult = await query(
    'SELECT amount, deduct_percent FROM project_mgt.wbs_level1 WHERE project_id = $1',
    [level1.project_id]
  );
  const totalRemaining = siblingsResult.rows.reduce((sum, r) => {
    const amt = parseFloat(r.amount) || 0;
    const pct = parseFloat(r.deduct_percent) || 0;
    return sum + amt * (1 - pct / 100);
  }, 0);

  const amount = parseFloat(level1.amount) || 0;
  const deductPercent = parseFloat(level1.deduct_percent) || 0;
  const remainingAmount = amount * (1 - deductPercent / 100);
  const weightPercent = totalRemaining > 0 ? (remainingAmount / totalRemaining) * 100 : 0;

  return { level1, remainingAmount, weightPercent };
}

/**
 * GET /api/wbs-level2/by-project?project_id=X
 * ดูรายการงานของ "ทุกกลุ่มงาน" ในโครงการ แยกเป็นแต่ละกลุ่มเรียงตามรหัส
 * พร้อมเช็คภาพรวมว่าทุกกลุ่มแตกรายการงานครบ 100% หรือยัง
 */
router.get('/by-project', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'กรุณาระบุ project_id' });
    }

    const level1Result = await query(
      `SELECT * FROM project_mgt.wbs_level1
       WHERE project_id = $1
       ORDER BY COALESCE(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::INTEGER, 999999), code`,
      [project_id]
    );
    const level1Rows = level1Result.rows;

    const totalRemaining = level1Rows.reduce((sum, r) => {
      const amt = parseFloat(r.amount) || 0;
      const pct = parseFloat(r.deduct_percent) || 0;
      return sum + amt * (1 - pct / 100);
    }, 0);

    const groups = [];
    let overallLevel2Amount = 0;
    let overallComplete = level1Rows.length > 0;

    for (const level1 of level1Rows) {
      const amount = parseFloat(level1.amount) || 0;
      const deductPercent = parseFloat(level1.deduct_percent) || 0;
      const remainingAmount = amount * (1 - deductPercent / 100);
      const weightPercent = totalRemaining > 0 ? (remainingAmount / totalRemaining) * 100 : 0;

      const itemsResult = await query(
        `SELECT * FROM project_mgt.wbs_level2
         WHERE level1_id = $1
         ORDER BY COALESCE(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::INTEGER, 999999), code`,
        [level1.id]
      );
      const items = itemsResult.rows.map((row) => {
        const amt = parseFloat(row.amount) || 0;
        const sharePercent = remainingAmount > 0 ? (amt / remainingAmount) * 100 : 0;
        const itemWeightPercent = (sharePercent * weightPercent) / 100;
        return { ...row, share_percent: sharePercent, weight_percent: itemWeightPercent };
      });

      const groupTotals = items.reduce(
        (acc, item) => ({
          amount: acc.amount + (parseFloat(item.amount) || 0),
          share_percent: acc.share_percent + item.share_percent,
        }),
        { amount: 0, share_percent: 0 }
      );

      const isComplete = items.length > 0 && Math.abs(groupTotals.share_percent - 100) < 0.01;
      if (!isComplete) overallComplete = false;
      overallLevel2Amount += groupTotals.amount;

      groups.push({
        level1: {
          id: level1.id,
          code: level1.code,
          name: level1.name,
          remaining_amount: remainingAmount,
          weight_percent: weightPercent,
        },
        items,
        totals: groupTotals,
        is_complete: isComplete,
      });
    }

    res.json({
      groups,
      overall: {
        total_level1_remaining: totalRemaining,
        total_level2_amount: overallLevel2Amount,
        is_fully_complete: overallComplete,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลรวมไม่สำเร็จ' });
  }
});

/**
 * GET /api/wbs-level2?level1_id=X
 * ดูรายการงานย่อยของกลุ่มงานนั้น พร้อม %Share/%Weight และแถวสรุป
 * รวมถึงสถานะว่าแตกครบ 100% แล้วหรือยัง (is_complete)
 */
router.get('/', async (req, res) => {
  try {
    const { level1_id } = req.query;
    if (!level1_id) {
      return res.status(400).json({ error: 'กรุณาระบุ level1_id' });
    }

    const groupInfo = await getLevel1WeightInfo(level1_id);
    if (!groupInfo) {
      return res.status(404).json({ error: 'ไม่พบกลุ่มงานนี้' });
    }
    const { level1, remainingAmount, weightPercent } = groupInfo;

    const itemsResult = await query(
      `SELECT * FROM project_mgt.wbs_level2
       WHERE level1_id = $1
       ORDER BY COALESCE(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::INTEGER, 999999), code`,
      [level1_id]
    );

    const items = itemsResult.rows.map((row) => {
      const amount = parseFloat(row.amount) || 0;
      const sharePercent = remainingAmount > 0 ? (amount / remainingAmount) * 100 : 0;
      const itemWeightPercent = (sharePercent * weightPercent) / 100;
      return { ...row, share_percent: sharePercent, weight_percent: itemWeightPercent };
    });

    const totals = items.reduce(
      (acc, item) => ({
        amount: acc.amount + (parseFloat(item.amount) || 0),
        share_percent: acc.share_percent + item.share_percent,
        weight_percent: acc.weight_percent + item.weight_percent,
      }),
      { amount: 0, share_percent: 0, weight_percent: 0 }
    );

    // ถือว่า "ครบ" ถ้า %Share รวมอยู่ในช่วง 99.99-100.01 (กันปัญหา floating point เล็กน้อย)
    const isComplete = items.length > 0 && Math.abs(totals.share_percent - 100) < 0.01;

    res.json({
      group: {
        id: level1.id,
        code: level1.code,
        name: level1.name,
        remaining_amount: remainingAmount,
        weight_percent: weightPercent,
      },
      items,
      totals,
      is_complete: isComplete,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลรายการงานไม่สำเร็จ' });
  }
});

/**
 * POST /api/wbs-level2
 * body: { level1_id, code (optional), name, amount }
 */
router.post('/', requirePermission('project_data', 'item'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { level1_id, code, name, amount } = req.body;
    if (!level1_id || !name) {
      return res.status(400).json({ error: 'กรุณาระบุกลุ่มงานและชื่อรายการงาน' });
    }

    const finalCode = code && code.trim() ? code.trim() : await generateItemCode(level1_id);

    const dup = await query(
      'SELECT id FROM project_mgt.wbs_level2 WHERE level1_id = $1 AND code = $2',
      [level1_id, finalCode]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `รหัส "${finalCode}" ถูกใช้ไปแล้วในกลุ่มงานนี้` });
    }

    const result = await query(
      `INSERT INTO project_mgt.wbs_level2 (level1_id, code, name, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [level1_id, finalCode, name, amount || 0]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เพิ่มรายการงานไม่สำเร็จ' });
  }
});

/**
 * PUT /api/wbs-level2/:id
 */
router.put('/:id', requirePermission('project_data', 'item'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { code, name, amount } = req.body;

    if (code && code.trim()) {
      const dup = await query(
        `SELECT id FROM project_mgt.wbs_level2
         WHERE level1_id = (SELECT level1_id FROM project_mgt.wbs_level2 WHERE id = $1)
           AND code = $2 AND id != $1`,
        [req.params.id, code.trim()]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: `รหัส "${code.trim()}" ถูกใช้ไปแล้วในกลุ่มงานนี้` });
      }
    }

    const result = await query(
      `UPDATE project_mgt.wbs_level2
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           amount = COALESCE($3, amount),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [code && code.trim() ? code.trim() : null, name ?? null, amount ?? null, req.params.id]
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
 * DELETE /api/wbs-level2/:id
 */
router.delete('/:id', requirePermission('project_data', 'item'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM project_mgt.wbs_level2 WHERE id = $1 RETURNING id',
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
