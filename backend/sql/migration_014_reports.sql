-- ============================================
-- Migration 014: Menu 5 "จัดทำรายงาน" — ระบบรายงานความคืบหน้าประจำสัปดาห์
-- แนวคิด: 1 รายงาน = 1 สัปดาห์ (Sun-Sat ตาม convention เดิมของระบบ) ต่อ 1 โครงการ — Tab ต่างๆ (คุณภาพงาน,
-- ความปลอดภัย, ปัญหาอุปสรรค, งานเพิ่มลด, เรื่องที่ค้าง) มีรูปแบบเหมือนกันทุกอัน (ลำดับ+รายการ+จัดการ) เลย
-- ใช้ตารางเดียวร่วมกันคือ report_items แยกด้วยคอลัมน์ category แทนที่จะแยกตารางซ้ำ 5 ตาราง
-- รันใน Supabase SQL Editor ตามลำดับก่อน deploy โค้ดที่พึ่งพา schema นี้
-- ============================================

SET search_path TO project_mgt;

-- 1) รายงานหลัก — 1 แถวต่อ 1 สัปดาห์ต่อ 1 โครงการ, report_no วิ่งต่อเนื่องแยกตามโครงการ
CREATE TABLE IF NOT EXISTS reports (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_no       INTEGER NOT NULL,               -- "รายงานครั้งที่" วิ่งต่อเนื่องต่อโครงการ (1,2,3,...)
    week_start      DATE NOT NULL,                  -- วันอาทิตย์ที่เริ่มสัปดาห์นั้น
    week_end        DATE NOT NULL,                  -- วันเสาร์ที่จบสัปดาห์นั้น
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (project_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id);

-- 2) รายการแบบ ลำดับ+รายการ+จัดการ ใช้ร่วมกัน 5 Tab (คุณภาพงาน/ความปลอดภัย/ปัญหาอุปสรรค/งานเพิ่มลด/เรื่องที่ค้าง)
CREATE TABLE IF NOT EXISTS report_items (
    id              SERIAL PRIMARY KEY,
    report_id       INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    category        VARCHAR(30) NOT NULL CHECK (category IN ('quality', 'safety', 'problems', 'additional_work', 'pending')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_items_report_cat ON report_items(report_id, category);

-- 3) Tab "งานสัปดาห์หน้า" — จัดกลุ่มตาม WBS Level1 จริง (nullable เผื่ออยากพิมพ์กลุ่มเองอิสระในอนาคต)
CREATE TABLE IF NOT EXISTS report_next_week_items (
    id              SERIAL PRIMARY KEY,
    report_id       INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    wbs_level1_id   INTEGER REFERENCES wbs_level1(id) ON DELETE SET NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    content         TEXT NOT NULL,
    target_percent  NUMERIC,                        -- % เป้าหมายที่จะทำให้เสร็จสัปดาห์หน้า (ใส่หรือไม่ใส่ก็ได้)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_next_week_report ON report_next_week_items(report_id);

-- 4) Tab "Plan&Progress" — คำอธิบายเพิ่มเติมต่อแถว WBS (ระดับไหนก็ได้) ต่อรายงานฉบับนั้นๆ ไม่ snapshot ตัวเลข
-- %W/Plan/Actual ไว้ (คำนวณสดจาก progress_entries ณ วันที่ week_end ของรายงานเสมอ ให้ตรงกับของจริงในอดีต)
CREATE TABLE IF NOT EXISTS report_progress_remarks (
    id              SERIAL PRIMARY KEY,
    report_id       INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    wbs_level       VARCHAR(10) NOT NULL CHECK (wbs_level IN ('level1', 'level2', 'level3')),
    wbs_id          INTEGER NOT NULL,                -- ชี้ไปที่ wbs_level1/2/3.id ตาม wbs_level (ไม่ทำ FK ตรงๆ
                                                      -- เพราะอ้างได้ 3 ตารางต่างกัน — validate ที่ชั้น backend แทน)
    remark          TEXT NOT NULL DEFAULT '',
    UNIQUE (report_id, wbs_level, wbs_id)
);

-- 5) เพิ่มคอลัมน์ให้ progress_photos รองรับอัปโหลดจริงผ่าน Cloudinary (เดิม mock ไว้แค่ photo_url)
ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(255);
ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 6) เลือกรูป (ไม่เกิน 4 รูป/กิจกรรมงาน) มาใส่ในรายงานฉบับหนึ่งๆ — แยกจากการอัปโหลดจริง (อัปโหลดไว้เยอะแค่ไหน
-- ก็ได้ แต่ตอนทำรายงานเลือกโชว์แค่บางรูป)
CREATE TABLE IF NOT EXISTS report_photo_selections (
    id                  SERIAL PRIMARY KEY,
    report_id           INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    wbs_level3_id       INTEGER NOT NULL REFERENCES wbs_level3(id) ON DELETE CASCADE,
    progress_photo_id   INTEGER NOT NULL REFERENCES progress_photos(id) ON DELETE CASCADE,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    UNIQUE (report_id, progress_photo_id)
);

CREATE INDEX IF NOT EXISTS idx_report_photo_sel_report ON report_photo_selections(report_id, wbs_level3_id);
