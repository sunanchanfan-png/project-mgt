-- migration_008_wbs_level3.sql
-- รันใน Supabase SQL Editor

SET search_path TO project_mgt;

CREATE TABLE IF NOT EXISTS wbs_level3 (
    id             SERIAL PRIMARY KEY,
    level2_id      INTEGER NOT NULL REFERENCES wbs_level2(id) ON DELETE CASCADE,
    code           VARCHAR(20) NOT NULL,   -- auto-run เช่น JE-101-01 (101=จาก Level2, 01=running)
    name           VARCHAR(255) NOT NULL,  -- ชื่อกิจกรรมงาน
    amount         NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- มูลค่า (ส่วนหนึ่งของมูลค่ารายการงาน)
    duration_days  INTEGER,                -- จำนวนวัน
    start_date     DATE,                   -- วันที่เริ่ม
    end_date       DATE,                   -- วันที่เสร็จ
    sort_order     INTEGER DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (level2_id, code)
);

CREATE INDEX IF NOT EXISTS idx_wbs_level3_level2 ON wbs_level3(level2_id);
