// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();

/**
 * POST /api/auth/register
 * body: { name, username, password }
 * สมัครเข้ามาเอง (ไม่เลือก role เอง) — สร้างด้วยสถานะ "pending" เสมอ role เป็น NULL ไว้ก่อน
 * รอ system_mgr เข้ามาอนุมัติ + กำหนด role และสิทธิ์ menu/tab ให้ที่หน้า "อนุมัติและกำหนดสิทธิ์"
 * ก่อนจะ login เข้าใช้งานจริงได้ (ดู requireRole('system_mgr') ใน routes/permissions.js)
 * หมายเหตุ: username ไม่บังคับรูปแบบอีเมล — เป็นแค่ชื่อผู้ใช้ที่ไม่ซ้ำกัน ระบบนี้ไม่เคยส่งอีเมลจริงเลย
 */
router.post('/register', async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (name, username, password)' });
    }

    const existing = await query('SELECT id FROM project_mgt.users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO project_mgt.users (name, username, password_hash, role, status)
       VALUES ($1, $2, $3, NULL, 'pending')
       RETURNING id, name, username, status, created_at`,
      [name, username, passwordHash]
    );

    res.status(201).json({
      user: result.rows[0],
      message: 'สมัครสมาชิกสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
  }
});

/**
 * POST /api/auth/login
 * body: { username, password }
 * ตอบกลับ: { token, user }
 * ต้องมีสถานะ "approved" เท่านั้นถึงจะ login ผ่าน (pending/rejected ถูกบล็อกตรงนี้)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const result = await query('SELECT * FROM project_mgt.users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติ กรุณาลองใหม่ภายหลัง' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'บัญชีของคุณไม่ได้รับการอนุมัติให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

module.exports = router;
