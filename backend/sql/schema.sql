-- ============================================
-- Construction Project Management - Initial Schema
-- Postgres (Neon) - แยก schema ไว้เผื่อรวมกับระบบอื่นในอนาคต
-- ============================================

CREATE SCHEMA IF NOT EXISTS project_mgt;
SET search_path TO project_mgt;

-- ============================================
-- 1. PROJECTS
-- ============================================
CREATE TABLE projects (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    location        VARCHAR(255),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    budget_total    NUMERIC(15, 2) DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. USERS (บทบาทผู้ใช้งานในระบบ)
-- ============================================
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'pm', 'foreman', 'viewer')),
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ผูก user เข้ากับ project ที่รับผิดชอบ
CREATE TABLE project_members (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_project VARCHAR(20) NOT NULL CHECK (role_in_project IN ('pm', 'foreman', 'viewer')),
    UNIQUE (project_id, user_id)
);

-- ============================================
-- 3. WBS ITEMS (Work Breakdown Structure)
-- แต่ละงานย่อยมี "weight" สำหรับคำนวณ S-curve
-- ============================================
CREATE TABLE wbs_items (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id       INTEGER REFERENCES wbs_items(id) ON DELETE CASCADE,
    code            VARCHAR(50),              -- เช่น "1.1", "2.3.1"
    name            VARCHAR(255) NOT NULL,
    weight_percent  NUMERIC(6, 3) NOT NULL DEFAULT 0,  -- น้ำหนักงาน (รวมกันทุก item ควร = 100)
    planned_start   DATE NOT NULL,
    planned_end     DATE NOT NULL,
    planned_cost    NUMERIC(15, 2) DEFAULT 0,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wbs_project ON wbs_items(project_id);
CREATE INDEX idx_wbs_parent ON wbs_items(parent_id);

-- ============================================
-- 4. PROGRESS ENTRIES (บันทึกความคืบหน้าหน้างาน)
-- ============================================
CREATE TABLE progress_entries (
    id              SERIAL PRIMARY KEY,
    wbs_item_id     INTEGER NOT NULL REFERENCES wbs_items(id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL,
    actual_percent  NUMERIC(5, 2) NOT NULL CHECK (actual_percent BETWEEN 0 AND 100),
    note            TEXT,
    reported_by     INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_wbs ON progress_entries(wbs_item_id);
CREATE INDEX idx_progress_date ON progress_entries(entry_date);

-- ============================================
-- 5. COST ENTRIES (บันทึกต้นทุนจริง)
-- ============================================
CREATE TABLE cost_entries (
    id              SERIAL PRIMARY KEY,
    wbs_item_id     INTEGER NOT NULL REFERENCES wbs_items(id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL,
    category        VARCHAR(50),              -- เช่น material, labor, equipment
    actual_cost     NUMERIC(15, 2) NOT NULL,
    description     TEXT,
    recorded_by     INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_wbs ON cost_entries(wbs_item_id);
CREATE INDEX idx_cost_date ON cost_entries(entry_date);

-- ============================================
-- 6. SITE PHOTOS (metadata เท่านั้น - ไฟล์จริงอยู่ Cloudinary)
-- ============================================
CREATE TABLE site_photos (
    id                  SERIAL PRIMARY KEY,
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    wbs_item_id         INTEGER REFERENCES wbs_items(id) ON DELETE SET NULL,
    progress_entry_id   INTEGER REFERENCES progress_entries(id) ON DELETE SET NULL,
    cloudinary_public_id VARCHAR(255) NOT NULL,
    cloudinary_url      TEXT NOT NULL,
    thumbnail_url       TEXT,
    taken_at            TIMESTAMPTZ,          -- ดึงจาก EXIF ของรูป
    gps_lat             NUMERIC(10, 7),
    gps_lng             NUMERIC(10, 7),
    uploaded_by         INTEGER REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_photos_project ON site_photos(project_id);
CREATE INDEX idx_photos_wbs ON site_photos(wbs_item_id);

-- ============================================
-- 7. AUDIT LOG (ติดตามการแก้ไข progress/cost ย้อนหลัง)
-- ============================================
CREATE TABLE audit_logs (
    id              SERIAL PRIMARY KEY,
    table_name      VARCHAR(50) NOT NULL,
    record_id       INTEGER NOT NULL,
    action          VARCHAR(20) NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
    old_data        JSONB,
    new_data        JSONB,
    changed_by      INTEGER REFERENCES users(id),
    changed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);

-- ============================================
-- ตัวอย่าง VIEW สำหรับคำนวณ S-Curve (Planned vs Actual cumulative %)
-- ใช้เป็นจุดเริ่มต้น - ปรับ logic ตามการ weight จริงภายหลังได้
-- ============================================
CREATE VIEW v_scurve_planned AS
SELECT
    project_id,
    planned_end AS date_point,
    SUM(weight_percent) OVER (
        PARTITION BY project_id ORDER BY planned_end
    ) AS cumulative_planned_percent
FROM wbs_items;

COMMENT ON VIEW v_scurve_planned IS 'คำนวณเส้น Planned ของ S-curve แบบสะสมตาม weight และวันที่วางแผนเสร็จของแต่ละ WBS item';
