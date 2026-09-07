-- ============================================
-- Migration 019: แนบไฟล์แผนงาน MS-Project (PDF) ต่อโครงการ
-- - 1 โครงการ แนบได้ 1 ไฟล์ (อัปโหลดใหม่ทับของเก่าเสมอ ไม่เก็บประวัติ) — เก็บแค่ URL บน Cloudinary
--   (เหมือน progress_photos ที่เก็บแค่ url ไม่เก็บไฟล์จริงในฐานข้อมูล)
-- - ปุ่มอัปโหลดอยู่ที่ Tab9 "เล่มรายงาน" (Menu 5 รายงาน) ฝั่ง staff (ดู CompiledReportTab.jsx +
--   POST /api/reports/schedule-pdf) แต่ข้อมูลผูกกับ "โครงการ" ไม่ใช่ "รายงานฉบับใดฉบับหนึ่ง" เพราะแผนงาน
--   MS-Project เป็นเอกสารระดับโครงการ ไม่ได้เปลี่ยนทุกสัปดาห์เหมือนรายงานความคืบหน้า
-- - ลูกค้าเห็นปุ่มดาวน์โหลดที่ Tab เล่มรายงานเดิมในแอปมือถือเช่นกัน (ดู GET /api/client/my-projects)
-- ============================================

SET search_path TO project_mgt;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_pdf_url TEXT;
