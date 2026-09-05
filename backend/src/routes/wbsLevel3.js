// routes/wbsLevel3.js
const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const { cascadeFromPredecessor } = require('../lib/scheduling');

const router = express.Router();

router.use(verifyToken);

/**
 * สร้างรหัสอัตโนมัติ รูปแบบ JE-{เลขจาก Level2}-{running 2 หลัก}
 * เช่น รายการงาน JN-101 -> กิจกรรมแรกเป็น JE-101-01, กิจกรรมที่ 2 เป็น JE-101-02
 */
async function generateActivityCode(level2Id) {
  const level2Result = await query(
    'SELECT code FROM project_mgt.wbs_level2 WHERE id = $1',
    [level2Id]
  );
  const level2Code = level2Result.rows[0]?.code || '';
  const numPart = level2Code.replace(/\D/g, '') || '0';

  const siblingsResult = await query(
    'SELECT code FROM project_mgt.wbs_level3 WHERE level2_id = $1',
    [level2Id]
  );
  let maxRunning = 0;
  siblingsResult.rows.forEach((r) => {
    const parts = r.code.split('-');
    const running = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(running) && running > maxRunning) maxRunning = running;
  });

  const nextRunning = String(maxRunning + 1).padStart(2, '0');
  return `JE-${numPart}-${nextRunning}`;
}

/**
 * คำนวณข้อมูล Level 1 (กลุ่มงานหลัก) เทียบทั้งโครงการ — logic เดียวกับหน้ากลุ่มงานหลัก
 */
async function getLevel1WeightInfo(level1Id) {
  const level1Result = await query('SELECT * FROM project_mgt.wbs_level1 WHERE id = $1', [level1Id]);
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
 * คำนวณข้อมูล Level 2 (รายการงาน) เทียบทั้งโครงการ ต่อยอดจาก Level 1
 * คืนค่า { level2, weightPercentProjectWide } — weightPercentProjectWide คือน้ำหนักของ
 * รายการงานนี้เทียบทั้งโครงการ ใช้เป็นตัวคูณสำหรับคำนวณ %Weight ของกิจกรรมงาน (Level 3) ต่อไป
 */
async function getLevel2WeightInfo(level2Id) {
  const level2Result = await query('SELECT * FROM project_mgt.wbs_level2 WHERE id = $1', [level2Id]);
  if (level2Result.rows.length === 0) return null;
  const level2 = level2Result.rows[0];

  const groupInfo = await getLevel1WeightInfo(level2.level1_id);
  if (!groupInfo) return null;

  const amount = parseFloat(level2.amount) || 0;
  const sharePercent = groupInfo.remainingAmount > 0 ? (amount / groupInfo.remainingAmount) * 100 : 0;
  const weightPercentProjectWide = (sharePercent * groupInfo.weightPercent) / 100;

  return { level2, weightPercentProjectWide };
}

/**
 * GET /api/wbs-level3/gantt?project_id=X
 * ดึงโครงสร้าง WBS ทั้ง 3 ระดับ (กลุ่มงานหลัก -> รายการงาน -> กิจกรรมงาน)
 * พร้อมวันที่เริ่ม/จบของแต่ละระดับ (ระดับบน roll-up จากลูกอัตโนมัติ)
 * สำหรับใช้วาด Gantt chart แบบ read-only เท่านั้น ไม่ใช้แก้ไขข้อมูล
 */
router.get('/gantt', async (req, res) => {
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

    // โหลดลิงก์เชื่อมโยงวันที่ทั้งหมดของโปรเจกต์นี้ไว้ล่วงหน้าครั้งเดียว แล้ว map ตาม successor_id
    // เพื่อแนบให้แต่ละกิจกรรมงาน (JE) รู้ว่าตัวเองผูกกับกิจกรรมงานต้นทางใดอยู่บ้าง
    const depResult = await query(
      `SELECT d.id, d.successor_id, d.predecessor_id, d.dependency_type, d.lag_days,
              p.code AS predecessor_code, p.name AS predecessor_name
       FROM project_mgt.wbs_dependencies d
       JOIN project_mgt.wbs_level3 p ON p.id = d.predecessor_id
       JOIN project_mgt.wbs_level3 s ON s.id = d.successor_id
       JOIN project_mgt.wbs_level2 l2 ON l2.id = s.level2_id
       JOIN project_mgt.wbs_level1 l1 ON l1.id = l2.level1_id
       WHERE l1.project_id = $1`,
      [project_id]
    );
    const depsBySuccessor = {};
    depResult.rows.forEach((d) => {
      if (!depsBySuccessor[d.successor_id]) depsBySuccessor[d.successor_id] = [];
      depsBySuccessor[d.successor_id].push({
        id: d.id,
        predecessor_id: d.predecessor_id,
        predecessor_code: d.predecessor_code,
        predecessor_name: d.predecessor_name,
        dependency_type: d.dependency_type,
        lag_days: d.lag_days,
      });
    });

    const totalRemaining = level1Rows.reduce((sum, r) => {
      const amt = parseFloat(r.amount) || 0;
      const pct = parseFloat(r.deduct_percent) || 0;
      return sum + amt * (1 - pct / 100);
    }, 0);

    const groups = [];
    let overallMinDate = null;
    let overallIncompleteCount = 0;
    let totalLevel2Count = 0;
    let overallMaxDate = null;

    function trackDate(d) {
      if (!d) return;
      const t = new Date(d).getTime();
      if (overallMinDate === null || t < overallMinDate) overallMinDate = t;
      if (overallMaxDate === null || t > overallMaxDate) overallMaxDate = t;
    }

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

      const level2List = [];
      let level1MinDate = null;
      let level1MaxDate = null;

      for (const level2 of level2Result.rows) {
        totalLevel2Count += 1;
        const l2Amount = parseFloat(level2.amount) || 0;
        const l2SharePercent = remainingAmount > 0 ? (l2Amount / remainingAmount) * 100 : 0;
        const l2WeightPercent = (l2SharePercent * level1WeightPercent) / 100;

        const level3Result = await query(
          `SELECT * FROM project_mgt.wbs_level3 WHERE level2_id = $1 ORDER BY id`,
          [level2.id]
        );

        let level2MinDate = null;
        let level2MaxDate = null;

        const activities = level3Result.rows.map((row) => {
          const l3Amount = parseFloat(row.amount) || 0;
          const l3SharePercent = l2Amount > 0 ? (l3Amount / l2Amount) * 100 : 0;
          const l3WeightPercent = (l3SharePercent * l2WeightPercent) / 100;

          if (row.start_date) {
            const t = new Date(row.start_date).getTime();
            if (level2MinDate === null || t < level2MinDate) level2MinDate = t;
          }
          if (row.end_date) {
            const t = new Date(row.end_date).getTime();
            if (level2MaxDate === null || t > level2MaxDate) level2MaxDate = t;
          }
          trackDate(row.start_date);
          trackDate(row.end_date);

          return {
            id: row.id,
            code: row.code,
            name: row.name,
            weight_percent: l3WeightPercent,
            share_percent: l3SharePercent,
            start_date: row.start_date,
            end_date: row.end_date,
            duration_days: row.duration_days,
            predecessors: depsBySuccessor[row.id] || [],
          };
        });

        // เช็คความครบถ้วนของรายการงานนี้ (ผลรวม %Share ของกิจกรรมงานลูกต้อง = 100%)
        const level2ShareTotal = activities.reduce((sum, a) => sum + a.share_percent, 0);
        const level2IsComplete = activities.length > 0 && Math.abs(level2ShareTotal - 100) < 0.5;
        if (!level2IsComplete) overallIncompleteCount += 1;

        if (level2MinDate !== null) level1MinDate = level1MinDate === null ? level2MinDate : Math.min(level1MinDate, level2MinDate);
        if (level2MaxDate !== null) level1MaxDate = level1MaxDate === null ? level2MaxDate : Math.max(level1MaxDate, level2MaxDate);

        level2List.push({
          id: level2.id,
          code: level2.code,
          name: level2.name,
          amount: l2Amount,
          weight_percent: l2WeightPercent,
          is_complete: level2IsComplete,
          start_date: level2MinDate ? new Date(level2MinDate).toISOString().slice(0, 10) : null,
          end_date: level2MaxDate ? new Date(level2MaxDate).toISOString().slice(0, 10) : null,
          activities,
        });
      }

      groups.push({
        id: level1.id,
        code: level1.code,
        name: level1.name,
        weight_percent: level1WeightPercent,
        start_date: level1MinDate ? new Date(level1MinDate).toISOString().slice(0, 10) : null,
        end_date: level1MaxDate ? new Date(level1MaxDate).toISOString().slice(0, 10) : null,
        items: level2List,
      });
    }

    res.json({
      groups,
      timeline: {
        min_date: overallMinDate ? new Date(overallMinDate).toISOString().slice(0, 10) : null,
        max_date: overallMaxDate ? new Date(overallMaxDate).toISOString().slice(0, 10) : null,
      },
      completeness: {
        total_level2: totalLevel2Count,
        incomplete_level2: overallIncompleteCount,
        all_complete: totalLevel2Count > 0 && overallIncompleteCount === 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูล Gantt ไม่สำเร็จ' });
  }
});

/**
 * GET /api/wbs-level3?level2_id=X
 * ดูรายการกิจกรรมงานของรายการงานนั้น พร้อม %Share/%Weight/% ต่อวัน และแถวสรุป
 */
router.get('/', async (req, res) => {
  try {
    const { level2_id } = req.query;
    if (!level2_id) {
      return res.status(400).json({ error: 'กรุณาระบุ level2_id' });
    }

    const info = await getLevel2WeightInfo(level2_id);
    if (!info) {
      return res.status(404).json({ error: 'ไม่พบรายการงานนี้' });
    }
    const { level2, weightPercentProjectWide } = info;
    const level2Amount = parseFloat(level2.amount) || 0;

    const itemsResult = await query(
      `SELECT * FROM project_mgt.wbs_level3
       WHERE level2_id = $1
       ORDER BY id`,
      [level2_id]
    );

    // โหลดลิงก์เชื่อมโยงวันที่ของกิจกรรมงานเหล่านี้ไว้ล่วงหน้า (ใช้บอกฝั่งหน้าบ้านว่ากิจกรรมงานไหน
    // ควร "ยึดวันเสร็จเป็นหลัก" (มีลิงก์ FF/SF) ตอนแก้ไขวันที่/จำนวนวันในหน้า Tab กิจกรรมงาน)
    const level3Ids = itemsResult.rows.map((r) => r.id);
    let depsBySuccessor = {};
    if (level3Ids.length > 0) {
      const depResult = await query(
        `SELECT d.id, d.successor_id, d.predecessor_id, d.dependency_type, d.lag_days,
                p.code AS predecessor_code, p.name AS predecessor_name
         FROM project_mgt.wbs_dependencies d
         JOIN project_mgt.wbs_level3 p ON p.id = d.predecessor_id
         WHERE d.successor_id = ANY($1::int[])`,
        [level3Ids]
      );
      depResult.rows.forEach((d) => {
        if (!depsBySuccessor[d.successor_id]) depsBySuccessor[d.successor_id] = [];
        depsBySuccessor[d.successor_id].push({
          id: d.id,
          predecessor_id: d.predecessor_id,
          predecessor_code: d.predecessor_code,
          predecessor_name: d.predecessor_name,
          dependency_type: d.dependency_type,
          lag_days: d.lag_days,
        });
      });
    }

    const items = itemsResult.rows.map((row) => {
      const amount = parseFloat(row.amount) || 0;
      const sharePercent = level2Amount > 0 ? (amount / level2Amount) * 100 : 0;
      const itemWeightPercent = (sharePercent * weightPercentProjectWide) / 100;
      const durationDays = row.duration_days || 0;
      const percentPerDay = durationDays > 0 ? itemWeightPercent / durationDays : 0;
      return {
        ...row,
        share_percent: sharePercent,
        weight_percent: itemWeightPercent,
        percent_per_day: percentPerDay,
        predecessors: depsBySuccessor[row.id] || [],
      };
    });

    const totals = items.reduce(
      (acc, item) => ({
        amount: acc.amount + (parseFloat(item.amount) || 0),
        share_percent: acc.share_percent + item.share_percent,
        weight_percent: acc.weight_percent + item.weight_percent,
      }),
      { amount: 0, share_percent: 0, weight_percent: 0 }
    );

    const isComplete = items.length > 0 && Math.abs(totals.share_percent - 100) < 0.01;

    res.json({
      item2: {
        id: level2.id,
        code: level2.code,
        name: level2.name,
        amount: level2Amount,
        weight_percent: weightPercentProjectWide,
      },
      items,
      totals,
      is_complete: isComplete,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงข้อมูลกิจกรรมงานไม่สำเร็จ' });
  }
});

/**
 * POST /api/wbs-level3
 * body: { level2_id, code (optional), name, amount, duration_days, start_date, end_date }
 */
router.post('/', requirePermission('project_data', 'activity'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { level2_id, code, name, amount, duration_days, start_date, end_date } = req.body;
    if (!level2_id || !name) {
      return res.status(400).json({ error: 'กรุณาระบุรายการงานและชื่อกิจกรรมงาน' });
    }

    const finalCode = code && code.trim() ? code.trim() : await generateActivityCode(level2_id);

    const dup = await query(
      'SELECT id FROM project_mgt.wbs_level3 WHERE level2_id = $1 AND code = $2',
      [level2_id, finalCode]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `รหัส "${finalCode}" ถูกใช้ไปแล้วในรายการงานนี้` });
    }

    const result = await query(
      `INSERT INTO project_mgt.wbs_level3 (level2_id, code, name, amount, duration_days, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [level2_id, finalCode, name, amount || 0, duration_days || null, start_date || null, end_date || null]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เพิ่มกิจกรรมงานไม่สำเร็จ' });
  }
});

/**
 * PUT /api/wbs-level3/:id
 */
router.put('/:id', requirePermission('project_data', 'activity'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const { code, name, amount, duration_days, start_date, end_date } = req.body;

    if (code && code.trim()) {
      const dup = await query(
        `SELECT id FROM project_mgt.wbs_level3
         WHERE level2_id = (SELECT level2_id FROM project_mgt.wbs_level3 WHERE id = $1)
           AND code = $2 AND id != $1`,
        [req.params.id, code.trim()]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: `รหัส "${code.trim()}" ถูกใช้ไปแล้วในรายการงานนี้` });
      }
    }

    const result = await query(
      `UPDATE project_mgt.wbs_level3
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           amount = COALESCE($3, amount),
           duration_days = COALESCE($4, duration_days),
           start_date = COALESCE($5, start_date),
           end_date = COALESCE($6, end_date),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        code && code.trim() ? code.trim() : null,
        name ?? null,
        amount ?? null,
        duration_days ?? null,
        start_date ?? null,
        end_date ?? null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    }

    // ถ้ามีการแก้วันที่ตรงๆ (พิมพ์เอง/ลากบน Gantt) ให้ไล่คำนวณต่อไปยังกิจกรรมงานอื่นที่เชื่อมโยง
    // เอาวันที่ของกิจกรรมงานนี้เป็นต้นทาง (predecessor) อยู่ด้วย — เป็นทอดๆ ถ้ามีลูกโซ่ต่อกันอีก
    if (start_date || end_date) {
      await cascadeFromPredecessor(result.rows[0].id, new Set());
    }

    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'แก้ไขไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/wbs-level3/:id
 */
router.delete('/:id', requirePermission('project_data', 'activity'), requireRole('admin', 'pm'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM project_mgt.wbs_level3 WHERE id = $1 RETURNING id',
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
