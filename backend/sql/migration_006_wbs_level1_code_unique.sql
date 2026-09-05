-- migration_006_wbs_level1_code_unique.sql
-- รันใน Supabase SQL Editor

SET search_path TO project_mgt;

-- รหัสต้องไม่ซ้ำกันภายในโครงการเดียวกัน (ต่างโครงการซ้ำกันได้ปกติ)
ALTER TABLE wbs_level1
  ADD CONSTRAINT wbs_level1_project_code_unique UNIQUE (project_id, code);

-- ทำเครื่องหมายกลุ่มงานสุดท้าย (เก็บมูลค่าที่ถูกหักไว้จากกลุ่มอื่น)
ALTER TABLE wbs_level1
  ADD COLUMN IF NOT EXISTS is_final_group BOOLEAN NOT NULL DEFAULT false;
