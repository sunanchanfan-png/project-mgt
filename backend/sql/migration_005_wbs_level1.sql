-- migration_005_wbs_level1.sql
-- รันใน Supabase SQL Editor

SET search_path TO project_mgt;

CREATE TABLE IF NOT EXISTS wbs_level1 (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code            VARCHAR(20) NOT NULL,      -- auto-run เช่น JG-1, JG-2
    name            VARCHAR(255) NOT NULL,     -- ชื่อกลุ่มงานหลัก
    amount          NUMERIC(15, 2) NOT NULL DEFAULT 0,   -- มูลค่า (กรอกมือ)
    deduct_percent  NUMERIC(5, 2) NOT NULL DEFAULT 0,    -- % หัก (เช่น Asbuilt dwg)
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- มูลค่าเหลือ และ %Weight คำนวณสดตอน query (ไม่เก็บเป็นคอลัมน์)
-- เพราะ %Weight ต้องอ้างอิง budget_total ของโครงการที่อาจเปลี่ยนแปลงได้ทีหลัง

CREATE INDEX IF NOT EXISTS idx_wbs_level1_project ON wbs_level1(project_id);
