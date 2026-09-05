-- migration_007_wbs_level2.sql
-- รันใน Supabase SQL Editor

SET search_path TO project_mgt;

CREATE TABLE IF NOT EXISTS wbs_level2 (
    id          SERIAL PRIMARY KEY,
    level1_id   INTEGER NOT NULL REFERENCES wbs_level1(id) ON DELETE CASCADE,
    code        VARCHAR(20) NOT NULL,      -- auto-run เช่น JN-1, JN-2 (นับแยกต่อกลุ่มงาน)
    name        VARCHAR(255) NOT NULL,     -- ชื่อรายการงาน
    amount      NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- มูลค่า (ส่วนหนึ่งของมูลค่าเหลือกลุ่มงาน)
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (level1_id, code)
);

CREATE INDEX IF NOT EXISTS idx_wbs_level2_level1 ON wbs_level2(level1_id);
