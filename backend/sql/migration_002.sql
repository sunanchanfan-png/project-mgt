-- migration_002_project_details.sql
-- รันไฟล์นี้ใน Neon SQL Editor (ต่อจาก schema.sql เดิม)
-- เพิ่มฟิลด์รายละเอียดโครงการตามฟอร์ม popup + รหัสโครงการอัตโนมัติ

SET search_path TO project_mgt;

-- เพิ่มคอลัมน์ใหม่
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_code VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end DATE,
  ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS supervisor_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS supervisor_phone VARCHAR(50);

-- popup ใหม่ไม่ได้เก็บ start_date/end_date แยกจาก contract_start/contract_end
-- แล้ว จึงผ่อนคลายให้ไม่บังคับกรอก (เดิมเป็น NOT NULL)
ALTER TABLE projects ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN end_date DROP NOT NULL;

-- เปลี่ยนค่า status ให้เหลือแค่ on/closed ตามที่ popup กำหนด (เดิมมี 4 ค่า)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
UPDATE projects SET status = 'on' WHERE status NOT IN ('on', 'closed');
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'on';
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('on', 'closed'));

-- index สำหรับค้นหา/กรองตามรหัสโครงการ (ใช้กรองปีจาก prefix)
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code);
