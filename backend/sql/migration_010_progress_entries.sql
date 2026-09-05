-- migration_010_progress_entries.sql
-- รันใน Supabase SQL Editor
-- เพิ่มตารางบันทึกความคืบหน้ารายวัน/รายสัปดาห์ของกิจกรรมงาน (wbs_level3) + รูปถ่ายแนบ
-- เก็บเป็น "ประวัติทุกครั้งที่กรอก" (ไม่ overwrite ค่าเดิม) เพื่อย้อนดู "ก่อนหน้า" ได้จริงจากประวัติ
-- และใช้คำนวณ S-Curve จากข้อมูลจริงได้ตรงไปตรงมา

SET search_path TO project_mgt;

CREATE TABLE IF NOT EXISTS progress_entries (
    id              SERIAL PRIMARY KEY,
    wbs_level3_id   INTEGER NOT NULL REFERENCES wbs_level3(id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL,                 -- วันที่บันทึก (ปกติ = วันจันทร์/วันที่กรอกของสัปดาห์นั้น)
    actual_percent  NUMERIC NOT NULL CHECK (actual_percent >= 0 AND actual_percent <= 100),
    note            TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS progress_photos (
    id                  SERIAL PRIMARY KEY,
    progress_entry_id   INTEGER NOT NULL REFERENCES progress_entries(id) ON DELETE CASCADE,
    photo_url           TEXT NOT NULL,              -- ตอนนี้ยังไม่ต่อระบบอัปโหลดจริง (mock ไว้ก่อน)
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progress_entries_level3 ON progress_entries(wbs_level3_id);
CREATE INDEX IF NOT EXISTS idx_progress_entries_date ON progress_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_progress_photos_entry ON progress_photos(progress_entry_id);
