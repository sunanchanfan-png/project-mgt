-- ============================================
-- Migration 020: เก็บจำนวนหน้าของไฟล์แผนงาน PDF
-- - เดิม (migration_019) แนบ PDF ด้วย resource_type='raw' บน Cloudinary — เปิดตรงๆ บนมือถือ/PWA ไม่ได้
--   เพราะ browser/PWA ส่วนใหญ่ไม่มีตัวอ่าน PDF ในตัว (โดยเฉพาะโหมด standalone ที่ติดตั้งเป็นไอคอนแอป)
-- - เปลี่ยนมาอัปโหลดด้วย resource_type='image' แทน (Cloudinary แปลง PDF แต่ละหน้าเป็นรูปภาพให้อัตโนมัติ
--   ผ่าน URL transformation "pg_N") ต้องรู้ "จำนวนหน้าทั้งหมด" ก่อนถึงจะ loop สร้าง <img> ของทุกหน้าได้
-- - schedule_pdf_url (จาก migration_019) ยังใช้อยู่ แต่ความหมายเปลี่ยนจาก "ลิงก์ไฟล์ดิบ" เป็น "URL ฐาน
--   สำหรับสร้างลิงก์รูปแต่ละหน้า" แทน (ดู frontend/src/utils/cloudinaryPdf.js)
-- ============================================

SET search_path TO project_mgt;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_pdf_pages INTEGER;
