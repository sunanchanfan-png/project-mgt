-- ============================================
-- Migration 017: แอปมือถือสำหรับ "ลูกค้า" (client) ดูความคืบหน้างาน
-- - เพิ่ม role ใหม่ 'client' เข้า CHECK constraint ของ users.role
-- - สร้างตาราง client_project_access: ผูก 1 user (role='client') เข้ากับได้หลายโครงการ (many-to-many)
--   ต่างจาก user_permissions (คุม "เข้า Tab ไหนได้บ้าง") — ตารางนี้คุม "เห็นโครงการไหนได้บ้าง" ซึ่งเป็น
--   แกนที่ไม่เคยมีมาก่อนในระบบสิทธิ์เดิม (เดิม user_permissions ผูกแค่ menu_key/tab_key ไม่ผูก project_id)
-- - สิทธิ์ "เห็น Tab ไหนบ้างในแอปลูกค้า" (งานสัปดาห์นี้/หน้า, S-Curve, เล่มรายงาน) ยังใช้ user_permissions
--   เดิมได้เลย ผ่าน menu_key='client-app' (จะเพิ่ม entry นี้ใน menuRegistry.js ในขั้นตอนถัดไป — ไม่ต้อง
--   แก้ SQL เพิ่มสำหรับส่วนนี้ เพราะ MENU_REGISTRY อยู่ในโค้ด JS ไม่ใช่ตาราง DB)
-- รันใน Supabase SQL Editor ก่อน deploy backend ที่พึ่งพา schema นี้ (ตามธรรมเนียมเดิมของโปรเจกต์)
-- ============================================

SET search_path TO project_mgt;

-- 1) role เพิ่ม 'client' เข้า CHECK constraint (เดิมมี admin/pm/foreman/viewer/system_mgr จาก migration_011)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('admin', 'pm', 'foreman', 'viewer', 'system_mgr', 'client'));

-- 2) ตารางเชื่อม client <-> โครงการ (many-to-many)
--    ON DELETE CASCADE ทั้งคู่: ลบ user แล้วแถวผูกหายไปด้วย (เหมือน user_permissions),
--    ลบโครงการแล้วแถวผูกของ client ที่เคยเห็นโครงการนั้นก็หายไปด้วย (กันไม่ให้ค้าง orphan record)
CREATE TABLE IF NOT EXISTS client_project_access (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_client_project_access_user ON client_project_access(user_id);
CREATE INDEX IF NOT EXISTS idx_client_project_access_project ON client_project_access(project_id);

-- หมายเหตุ: ไม่ได้ backfill สิทธิ์อะไรให้ user เดิมอัตโนมัติ (ต่างจาก migration_011 ที่ backfill สิทธิ์เมนู
-- ให้ user เดิมทุกคน) เพราะ role 'client' เป็นของใหม่ทั้งหมด ยังไม่มี user คนไหนเป็น role นี้อยู่ก่อนแล้ว
-- ระบบ approve/setRoleAndPermissions เดิม (routes/permissions.js) จะเป็นคนสร้าง client คนแรกทีหลังผ่าน
-- หน้า "อนุมัติและกำหนดสิทธิ์" (ต้องแก้โค้ดในขั้นตอนถัดไปให้รองรับ role นี้ด้วย)
