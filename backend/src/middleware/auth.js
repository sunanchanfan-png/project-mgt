// middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../db');

/**
 * ตรวจสอบว่า request มี valid JWT token หรือไม่
 * ใช้ header รูปแบบ: Authorization: Bearer <token>
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'ไม่พบ token กรุณา login ก่อน' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
    req.user = decoded; // { id, username, role }
    next();
  });
}

/**
 * ตรวจสอบว่า user มี role ที่อนุญาตหรือไม่
 * ใช้แบบ: requireRole('admin', 'pm')
 * 'system_mgr' ผ่านเสมอทุกที่ (superuser เหมือน 'admin' — ทำได้ทุกอย่างในระบบ ไม่ต้องเขียน 'system_mgr'
 * ซ้ำๆ ในทุก endpoint ที่มีการเช็ค requireRole เพราะเสี่ยงลืมแทรกเข้าไปสักจุดแบบที่เคยเกิดมาแล้ว — endpoint
 * ที่กำหนดสิทธิ์ไว้แค่ 'admin'/'pm'/'foreman' โดยไม่มี 'system_mgr' จะบล็อก system_mgr ไม่ให้ทำรายการ
 * แม้จะตั้งใจให้เป็น superuser ก็ตาม)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ทำรายการนี้' });
    }
    if (req.user.role === 'system_mgr' || allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ทำรายการนี้' });
  };
}

/**
 * ตรวจสอบสิทธิ์ตาม Menu/Tab ที่ system_mgr เป็นคนกำหนดให้แต่ละ user (คนละแกนกับ requireRole — requireRole
 * คุมว่า "role นี้ทำอะไรได้บ้าง", ส่วนอันนี้คุมว่า "user คนนี้ถูกเปิดสิทธิ์ให้เข้า Tab นี้หรือยัง")
 * role 'admin' และ 'system_mgr' ผ่านเสมอ (superuser เห็น/แก้ไขได้ทุกอย่างในระบบ ไม่ต้องมีแถวสิทธิ์)
 * ใช้แบบ: requirePermission('project_management', 'this-week') — เมนูที่ไม่มี tab ย่อยให้เว้น tabKey ไว้
 */
function requirePermission(menuKey, tabKey = '') {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'ไม่พบ token กรุณา login ก่อน' });
      if (req.user.role === 'admin' || req.user.role === 'system_mgr') return next();

      const result = await query(
        'SELECT 1 FROM project_mgt.user_permissions WHERE user_id = $1 AND menu_key = $2 AND tab_key = $3',
        [req.user.id, menuKey, tabKey]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ' });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' });
    }
  };
}

/**
 * ตรวจสอบสิทธิ์ตรงๆ (ไม่ใช่ middleware) — ใช้ในจุดที่ endpoint เดียวรองรับหลาย Tab พร้อมกัน (แยกกันด้วย
 * query param เช่น /weekly?week=this|next, /scurve มี/ไม่มี level1_id) ทำให้ผูก tab_key คงที่ระดับ
 * router ไม่ได้ ต้องเช็คเองข้างในแต่ละ handler แทน
 */
async function hasPermission(user, menuKey, tabKey = '') {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'system_mgr') return true;
  const result = await query(
    'SELECT 1 FROM project_mgt.user_permissions WHERE user_id = $1 AND menu_key = $2 AND tab_key = $3',
    [user.id, menuKey, tabKey]
  );
  return result.rows.length > 0;
}

module.exports = { verifyToken, requireRole, requirePermission, hasPermission };
