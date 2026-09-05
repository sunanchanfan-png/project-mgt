-- migration_003_drop_unused_tables.sql
-- ลบเฉพาะตารางที่ยังไม่มีเมนูใช้งานจริง (ยังไม่มีข้อมูล ไม่กระทบอะไร)
-- เก็บไว้: users, projects (ใช้งานจริงแล้วโดยเมนู login และ เปิดโครงการ)
--
-- รันใน Neon SQL Editor

SET search_path TO project_mgt;

-- ต้องลบ view ที่อ้างอิง wbs_items ก่อน ไม่งั้นจะลบ wbs_items ไม่ได้
DROP VIEW IF EXISTS v_scurve_planned;

-- ลบตารางลูกก่อนตารางแม่ (ตาม foreign key)
DROP TABLE IF EXISTS site_photos;
DROP TABLE IF EXISTS cost_entries;
DROP TABLE IF EXISTS progress_entries;
DROP TABLE IF EXISTS wbs_items;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS audit_logs;

-- เช็คผลลัพธ์: ควรเหลือแค่ users, projects
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'project_mgt'
ORDER BY table_name;
