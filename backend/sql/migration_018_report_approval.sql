-- ============================================
-- Migration 018: สถานะ Draft/อนุมัติ ของรายงาน (คุมว่า client เห็นรายงานฉบับไหนได้บ้าง)
-- - ค่าเริ่มต้น 'draft' เสมอ (รายงานสัปดาห์ปัจจุบันที่ระบบสร้างอัตโนมัติทุกฉบับเริ่มจาก draft) ต้องให้
--   staff (สิทธิ์ reports/compiled) กดปุ่ม "อนุมัติ" ที่ Tab เล่มรายงานก่อน ถึงจะเป็น 'approved' และไปโผล่
--   ใน list ของแอปลูกค้า (GET /api/client/reports กรองเฉพาะ approval_status='approved' เท่านั้น)
-- - ไม่ผูกกับว่า week จบหรือยัง — ถ้า staff กดอนุมัติก่อนวันจบ week ก็ให้ขึ้น list ของ client ได้เลยทันที
--   (ตามที่ตกลงกันไว้) วันที่ที่แสดงยังคงเป็นช่วงเต็มของ week นั้น (week_start/week_end เดิมอยู่แล้ว ไม่ต้อง
--   แก้อะไรเพิ่ม เพราะ 2 คอลัมน์นี้เก็บ "ขอบเขตทั้งสัปดาห์" อยู่แล้วตั้งแต่แรก ไม่ได้เก็บแค่ช่วงที่ผ่านมา)
-- ============================================

SET search_path TO project_mgt;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_approval_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_approval_status_check
  CHECK (approval_status IN ('draft', 'approved'));

-- หมายเหตุ: รายงานเก่าที่มีอยู่แล้วในระบบก่อน migration นี้ทั้งหมดจะกลายเป็น 'draft' อัตโนมัติ (ค่า DEFAULT)
-- คือยังไม่โผล่ให้ client เห็นจนกว่า staff จะเข้าไปกดอนุมัติทีละฉบับเอง — ไม่ backfill เป็น approved ให้อัตโนมัติ
-- เพราะรายงานเก่าอาจมีฉบับที่ไม่สมบูรณ์/ไม่ต้องการเผยแพร่ปนอยู่
