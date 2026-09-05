-- ============================================
-- Migration 011: ระบบกำหนดสิทธิ์ตาม Menu/Tab
-- - เพิ่ม role 'system_mgr' (เป็นคนอนุมัติ user ใหม่ + กำหนดสิทธิ์ menu/tab ให้แต่ละคน)
-- - เพิ่มสถานะอนุมัติให้ users (pending/approved/rejected) — สมัครเข้ามาใหม่ต้องรออนุมัติก่อนถึง login ได้
-- - role อนุญาตให้เป็น NULL ได้ชั่วคราว (ตอนสมัครใหม่ยังไม่รู้ role จนกว่า system_mgr จะอนุมัติ+กำหนดให้)
-- - ตาราง user_permissions: เก็บสิทธิ์ต่อ (user, menu, tab) แบบเปิด/ปิด (มีแถว = มีสิทธิ์เข้าถึงได้เต็มที่)
--   เมนูที่ไม่มี tab (เช่น "เปิดโครงการ") ให้ tab_key = '' (ค่าว่าง ไม่ใช่ NULL กัน UNIQUE constraint
--   ทำงานเพี้ยนข้าม Postgres version เก่าที่ยังไม่รองรับ NULLS NOT DISTINCT)
-- รันใน Supabase SQL Editor ตามลำดับก่อน deploy โค้ดที่พึ่งพา schema นี้
-- ============================================

SET search_path TO project_mgt;

-- 1) role เพิ่ม 'system_mgr' + อนุญาต NULL ชั่วคราว (รอ system_mgr กำหนดตอนอนุมัติ)
ALTER TABLE users ALTER COLUMN role DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('admin', 'pm', 'foreman', 'viewer', 'system_mgr'));

-- 2) สถานะอนุมัติ — user เดิมที่มีอยู่แล้วก่อนหน้านี้ทั้งหมดถือว่า approved อัตโนมัติ (DEFAULT ครอบคลุมไว้)
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 3) ตารางสิทธิ์ต่อ user รายคน (menu_key, tab_key) — มีแถว = เข้าได้, ไม่มีแถว = เข้าไม่ได้
CREATE TABLE IF NOT EXISTS user_permissions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_key    VARCHAR(50) NOT NULL,
    tab_key     VARCHAR(50) NOT NULL DEFAULT '', -- '' = ทั้งเมนู (เมนูที่ไม่มี tab ย่อย)
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, menu_key, tab_key)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- 4) ให้ user เดิมทั้งหมดที่มีอยู่ก่อน migration นี้ (status='approved' โดย default ด้านบน) ได้สิทธิ์เข้าถึง
--    ทุกเมนู/ทุก tab ที่มีอยู่ในระบบตอนนี้ไปเลย (กันไม่ให้ใครที่เคยใช้งานได้อยู่แล้วจู่ๆ เข้าไม่ได้หลัง deploy
--    ฟีเจอร์นี้) — เมนู/tab ที่เพิ่มใหม่ในอนาคตต้องให้ system_mgr มากำหนดสิทธิ์เพิ่มเองทีหลัง
INSERT INTO user_permissions (user_id, menu_key, tab_key)
SELECT u.id, m.menu_key, m.tab_key
FROM users u
CROSS JOIN (VALUES
  ('open_project', ''),
  ('project_data', 'group'),
  ('project_data', 'item'),
  ('project_data', 'activity'),
  ('project_data', 'gantt'),
  ('project_management', 'this-week'),
  ('project_management', 'next-week'),
  ('project_management', 'overall'),
  ('project_management', 'scurve-main'),
  ('project_management', 'scurve-group')
) AS m(menu_key, tab_key)
WHERE u.status = 'approved'
ON CONFLICT (user_id, menu_key, tab_key) DO NOTHING;
