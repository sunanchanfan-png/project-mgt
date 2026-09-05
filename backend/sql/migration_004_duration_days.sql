-- migration_004_duration_days.sql
-- รันไฟล์นี้ใน Supabase SQL Editor (โปรเจกต์ Pgp)

ALTER TABLE project_mgt.projects
  ADD COLUMN IF NOT EXISTS duration_days INTEGER;
