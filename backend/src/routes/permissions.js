// routes/permissions.js
// ระบบกำหนดสิทธิ์ตาม Menu/Tab — เฉพาะ role 'system_mgr' (และ 'admin' ซึ่งเป็น superuser อยู่แล้ว) เท่านั้น
// ที่อนุมัติ user ใหม่และกำหนดสิทธิ์ menu/tab ให้แต่ละคนได้ (หน้า "อนุมัติและกำหนดสิทธิ์")
const express = require('express');
const bcrypt = require('bcrypt');
const { query, getClient } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { MENU_REGISTRY, isValidMenuTab } = require('../lib/menuRegistry');

const router = express.Router();
router.use(verifyToken);

/**
 * GET /api/permissions/menu-registry
 * รายการ Menu/Tab ทั้งหมดในระบบ — ให้ frontend ใช้ render checkbox หน้ากำหนดสิทธิ์
 */
router.get('/menu-registry', requireRole('system_mgr', 'admin'), (req, res) => {
  res.json({ menus: MENU_REGISTRY });
});

/**
 * GET /api/permissions/users?status=pending|approved|rejected|all (default: all)
 * รายชื่อ user พร้อมสิทธิ์ปัจจุบันของแต่ละคน — ใช้ทั้งหน้า "รออนุมัติ" และหน้า "จัดการสิทธิ์" (คนที่อนุมัติ
 * ไปแล้วก็แก้ไขสิทธิ์เพิ่ม/ลดทีหลังได้จากหน้าเดียวกันนี้)
 */
router.get('/users', requireRole('system_mgr', 'admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status && status !== 'all') {
      params.push(status);
      where = 'WHERE u.status = $1';
    }
    const usersResult = await query(
      `SELECT u.id, u.name, u.username, u.role, u.status, u.created_at
       FROM project_mgt.users u
       ${where}
       ORDER BY u.created_at DESC`,
      params
    );
    const users = usersResult.rows;
    if (users.length === 0) return res.json({ users: [] });

    const permsResult = await query(
      `SELECT user_id, menu_key, tab_key FROM project_mgt.user_permissions WHERE user_id = ANY($1::int[])`,
      [users.map((u) => u.id)]
    );
    const permsByUser = new Map();
    permsResult.rows.forEach((p) => {
      if (!permsByUser.has(p.user_id)) permsByUser.set(p.user_id, []);
      permsByUser.get(p.user_id).push({ menu_key: p.menu_key, tab_key: p.tab_key });
    });

    res.json({
      users: users.map((u) => ({ ...u, permissions: permsByUser.get(u.id) || [] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงรายชื่อผู้ใช้ไม่สำเร็จ' });
  }
});

/**
 * ตั้งค่า role + แทนที่สิทธิ์ทั้งหมดของ user คนหนึ่งด้วยรายการใหม่ (ใช้ร่วมกันทั้ง approve และแก้ไขสิทธิ์
 * ทีหลัง) — ทำเป็น transaction เดียว กันข้อมูลค้างครึ่งๆ กลางๆ ถ้า error กลางทาง
 */
async function setRoleAndPermissions(userId, role, permissions, status) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE project_mgt.users SET role = $1, status = $2 WHERE id = $3`,
      [role, status, userId]
    );
    await client.query('DELETE FROM project_mgt.user_permissions WHERE user_id = $1', [userId]);
    for (const p of permissions) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO project_mgt.user_permissions (user_id, menu_key, tab_key) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, menu_key, tab_key) DO NOTHING`,
        [userId, p.menu_key, p.tab_key || '']
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * กันไม่ให้ระบบไม่มีใครกำหนดสิทธิ์ต่อได้เลย (ล็อกตัวเองออกทั้งระบบ) — เช็คก่อนลบ/ยกเลิกสิทธิ์ user ที่เป็น
 * system_mgr หรือ admin ว่าถ้าทำไปแล้ว จะยังเหลือ system_mgr/admin ที่ status='approved' อีกอย่างน้อย 1 คน
 * ไหม (ไม่นับตัว targetUserId เอง) ถ้าจะเหลือ 0 คน ให้บล็อกการทำรายการนั้น
 */
async function wouldLeaveNoSystemMgr(targetUserId) {
  const target = await query('SELECT role FROM project_mgt.users WHERE id = $1', [targetUserId]);
  if (target.rows.length === 0) return false;
  if (!['system_mgr', 'admin'].includes(target.rows[0].role)) return false; // ไม่ใช่ superuser ไม่ต้องเช็ค

  const remaining = await query(
    `SELECT COUNT(*)::int AS cnt FROM project_mgt.users
     WHERE role IN ('system_mgr', 'admin') AND status = 'approved' AND id != $1`,
    [targetUserId]
  );
  return remaining.rows[0].cnt === 0;
}

/**
 * POST /api/permissions/users/:id/approve
 * body: { role: 'pm'|'foreman'|'viewer'|'admin'|'system_mgr', permissions: [{menu_key, tab_key}] }
 * อนุมัติ user ที่สมัครเข้ามา + กำหนด role และสิทธิ์ menu/tab ให้เลยจบในขั้นตอนเดียว
 */
router.post('/users/:id/approve', requireRole('system_mgr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, permissions } = req.body;

    const validRoles = ['admin', 'pm', 'foreman', 'viewer', 'system_mgr'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role ต้องเป็นหนึ่งใน: ${validRoles.join(', ')}` });
    }
    const permsArr = Array.isArray(permissions) ? permissions : [];
    const invalid = permsArr.find((p) => !isValidMenuTab(p.menu_key, p.tab_key));
    if (invalid) {
      return res.status(400).json({ error: `menu/tab ไม่ถูกต้อง: ${invalid.menu_key}/${invalid.tab_key || '(ไม่มี tab)'}` });
    }

    const userCheck = await query('SELECT id FROM project_mgt.users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });

    await setRoleAndPermissions(id, role, permsArr, 'approved');
    res.json({ message: 'อนุมัติและกำหนดสิทธิ์เรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'อนุมัติไม่สำเร็จ' });
  }
});

/**
 * POST /api/permissions/users/:id/reject
 * ปฏิเสธคำขอสมัคร (user ที่ status='pending') หรือยกเลิกสิทธิ์ user ที่เคยอนุมัติไปแล้ว (status='approved')
 * ก็ได้เหมือนกัน — ทั้งสองแบบทำสิ่งเดียวกันคือเปลี่ยน status เป็น 'rejected' ทำให้ login เข้าใช้งานไม่ได้อีก
 * ตลอดไปจนกว่าจะมีคนมาอนุมัติใหม่ทีหลัง (ไม่ได้ลบข้อมูลหรือสิทธิ์ที่เคยตั้งไว้ทิ้ง เผื่ออนุมัติกลับคืนทีหลัง
 * จะได้ไม่ต้องตั้งสิทธิ์ใหม่ทั้งหมด)
 */
router.post('/users/:id/reject', requireRole('system_mgr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ error: 'ไม่สามารถยกเลิกสิทธิ์บัญชีของตัวเองได้ กันไม่ให้ล็อกตัวเองออกจากระบบ' });
    }
    if (await wouldLeaveNoSystemMgr(id)) {
      return res.status(400).json({ error: 'ไม่สามารถยกเลิกสิทธิ์ได้ เพราะจะไม่เหลือ system_mgr/admin ที่ใช้งานได้เลยสักคนในระบบ' });
    }
    const result = await query(
      `UPDATE project_mgt.users SET status = 'rejected' WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
    res.json({ message: 'ยกเลิกสิทธิ์/ปฏิเสธคำขอเรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดำเนินการไม่สำเร็จ' });
  }
});

/**
 * DELETE /api/permissions/users/:id
 * ลบ user ออกจากระบบถาวร (ไม่ใช่แค่เปลี่ยนสถานะแบบ reject) — user_permissions ของ user นี้จะถูกลบตามไปด้วย
 * อัตโนมัติ (ON DELETE CASCADE ใน migration_011) ใช้ระวังเป็นพิเศษ เพราะกู้คืนไม่ได้ ต่างจาก reject ที่ยัง
 * เก็บ record ไว้เผื่ออนุมัติกลับคืนทีหลัง
 */
router.delete('/users/:id', requireRole('system_mgr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้ กันไม่ให้ล็อกตัวเองออกจากระบบ' });
    }
    if (await wouldLeaveNoSystemMgr(id)) {
      return res.status(400).json({ error: 'ไม่สามารถลบได้ เพราะจะไม่เหลือ system_mgr/admin ที่ใช้งานได้เลยสักคนในระบบ' });
    }
    const result = await query('DELETE FROM project_mgt.users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
    res.json({ message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    // Postgres foreign_key_violation — user คนนี้ยังมีข้อมูลอื่นในระบบอ้างอิงถึงอยู่ (เช่น เคยกรอก
    // ความคืบหน้าไว้) และตารางนั้นยังไม่ได้ตั้ง ON DELETE SET NULL/CASCADE ไว้ ให้ error message ที่เข้าใจ
    // ง่ายกว่า "ลบไม่สำเร็จ" เฉยๆ (ดู migration_013 สำหรับ progress_entries ที่แก้ปัญหานี้ไปแล้ว)
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'ลบไม่สำเร็จ เพราะผู้ใช้นี้มีข้อมูลอื่นในระบบอ้างอิงอยู่ (เช่น เคยกรอกความคืบหน้าไว้) กรุณาติดต่อผู้ดูแลระบบเพื่อแก้ไข database constraint หรือใช้ "ยกเลิกสิทธิ์" แทนการลบถาวร',
      });
    }
    res.status(500).json({ error: 'ลบไม่สำเร็จ' });
  }
});

/**
 * POST /api/permissions/users/:id/reset-password
 * body: { newPassword }
 * system_mgr/admin ตั้งรหัสผ่านใหม่ให้ user คนอื่นได้เลย (กรณี user ลืมรหัสผ่านเดิม) — ระบบนี้ไม่มีการส่ง
 * อีเมลจริง เลยไม่มี flow "ลืมรหัสผ่าน" แบบส่งลิงก์ทางอีเมล ต้องให้ system_mgr ตั้งให้โดยตรงแล้วแจ้ง user
 * นอกระบบเอง (โทร/LINE ฯลฯ) ไม่จำกัดห้ามรีเซ็ตรหัสผ่านตัวเอง (ไม่มีความเสี่ยงล็อกตัวเองออกเหมือน reject/
 * delete เพราะแค่เปลี่ยนรหัสผ่าน ยังใช้บัญชีเดิม role เดิมได้ตามปกติ)
 */
router.post('/users/:id/reset-password', requireRole('system_mgr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    const userCheck = await query('SELECT id FROM project_mgt.users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE project_mgt.users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);

    res.json({ message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณาแจ้งรหัสผ่านใหม่ให้ผู้ใช้ทราบ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ' });
  }
});

/**
 * PUT /api/permissions/users/:id
 * body: { role, permissions: [{menu_key, tab_key}] }
 * แก้ไข role + สิทธิ์ของ user ที่อนุมัติไปแล้ว (จัดการต่อเนื่องได้ทุกเมื่อ ไม่ใช่แค่ตอนอนุมัติครั้งแรก)
 */
router.put('/users/:id', requireRole('system_mgr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, permissions } = req.body;

    const validRoles = ['admin', 'pm', 'foreman', 'viewer', 'system_mgr'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role ต้องเป็นหนึ่งใน: ${validRoles.join(', ')}` });
    }
    const permsArr = Array.isArray(permissions) ? permissions : [];
    const invalid = permsArr.find((p) => !isValidMenuTab(p.menu_key, p.tab_key));
    if (invalid) {
      return res.status(400).json({ error: `menu/tab ไม่ถูกต้อง: ${invalid.menu_key}/${invalid.tab_key || '(ไม่มี tab)'}` });
    }

    const userCheck = await query('SELECT id, status, role FROM project_mgt.users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
    // แก้ไขสิทธิ์ของ user ที่ status เป็นอะไรอยู่ก็ตาม ไม่เปลี่ยน status เดิม (ยกเว้นเคส approve แยกไว้ต่างหาก)
    const currentStatus = userCheck.rows[0].status;

    // กันกรณีลด role ของ system_mgr/admin คนสุดท้ายลงเป็น role อื่น จนไม่เหลือใครกำหนดสิทธิ์ต่อได้เลย
    const wasSuperuser = ['system_mgr', 'admin'].includes(userCheck.rows[0].role);
    const willStillBeSuperuser = ['system_mgr', 'admin'].includes(role);
    if (wasSuperuser && !willStillBeSuperuser && currentStatus === 'approved' && (await wouldLeaveNoSystemMgr(id))) {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยน role ได้ เพราะจะไม่เหลือ system_mgr/admin ที่ใช้งานได้เลยสักคนในระบบ' });
    }

    await setRoleAndPermissions(id, role, permsArr, currentStatus);
    res.json({ message: 'บันทึกสิทธิ์เรียบร้อยแล้ว' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'บันทึกสิทธิ์ไม่สำเร็จ' });
  }
});

/**
 * GET /api/permissions/me
 * สิทธิ์ของ user ที่ login อยู่ตอนนี้ — ใช้ฝั่ง frontend ตัดสินใจว่าจะโชว์ menu/tab ไหนบ้าง
 * admin/system_mgr ได้ all:true (เห็น/เข้าถึงได้ทุกอย่างเสมอ ไม่ต้องมีแถวสิทธิ์จริงก็ได้)
 */
router.get('/me', async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'system_mgr') {
      return res.json({ all: true, permissions: [] });
    }
    const result = await query(
      'SELECT menu_key, tab_key FROM project_mgt.user_permissions WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ all: false, permissions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ดึงสิทธิ์ไม่สำเร็จ' });
  }
});

module.exports = router;
