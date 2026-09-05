-- migration_009_wbs_dependencies.sql
-- รันใน Supabase SQL Editor
-- เพิ่มตาราง "เชื่อมโยงวันที่" ระหว่างกิจกรรมงาน (wbs_level3) แบบเดียวกับ Task Dependency ใน MS Project
-- FS (Finish-to-Start, ค่าเริ่มต้น) / SS (Start-to-Start) / FF (Finish-to-Finish) / SF (Start-to-Finish)
-- lag_days = จำนวนวันบวก/ลบเพิ่มจากความสัมพันธ์หลัก (Lag ถ้าเป็นบวก, Lead ถ้าเป็นลบ)

SET search_path TO project_mgt;

CREATE TABLE IF NOT EXISTS wbs_dependencies (
    id                SERIAL PRIMARY KEY,
    successor_id      INTEGER NOT NULL REFERENCES wbs_level3(id) ON DELETE CASCADE,   -- กิจกรรมงานปลายทาง (ตัวที่ถูกกำหนดวันที่ตาม)
    predecessor_id    INTEGER NOT NULL REFERENCES wbs_level3(id) ON DELETE CASCADE,   -- กิจกรรมงานต้นทาง (ตัวที่อ้างอิงวันที่มาจาก)
    dependency_type   VARCHAR(2) NOT NULL DEFAULT 'FS' CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
    lag_days          INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT wbs_dependencies_no_self CHECK (successor_id != predecessor_id),
    CONSTRAINT wbs_dependencies_unique UNIQUE (successor_id, predecessor_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_dep_successor ON wbs_dependencies(successor_id);
CREATE INDEX IF NOT EXISTS idx_wbs_dep_predecessor ON wbs_dependencies(predecessor_id);
