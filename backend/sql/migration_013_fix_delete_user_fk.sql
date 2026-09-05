-- ============================================
-- Migration 013: แก้ FK progress_entries.created_by ให้ลบ user ถาวรได้
-- ปัญหาที่เจอ: progress_entries.created_by REFERENCES users(id) ไม่ได้ระบุ ON DELETE ไว้ (default ของ
-- Postgres คือ NO ACTION) ทำให้ลบ user ที่เคยกรอกความคืบหน้าไว้ (มี created_by ชี้มาที่ตัวเอง) ไม่ได้เลย
-- ไม่ว่าจะลบผ่านหน้าเว็บหรือรัน SQL DELETE ตรงๆ ก็ตาม เพราะเป็นข้อจำกัดระดับฐานข้อมูล
--
-- วิธีแก้: เปลี่ยนเป็น ON DELETE SET NULL — ลบ user ได้ตามปกติ ข้อมูลความคืบหน้าที่เคยกรอกไว้ (ประวัติ
-- สำคัญทางธุรกิจ) ยังอยู่ครบเหมือนเดิมทุกแถว แค่ created_by ของแถวนั้นๆ กลายเป็น NULL (ไม่รู้ว่าใครกรอกไว้
-- อีกต่อไป แต่ตัวเลข % ความคืบหน้ายังถูกต้องครบถ้วน ไม่กระทบการคำนวณ S-Curve/ตารางงานใดๆ เลย)
-- รันใน Supabase SQL Editor ตามลำดับก่อน deploy โค้ดที่พึ่งพา schema นี้
-- ============================================

SET search_path TO project_mgt;

ALTER TABLE progress_entries DROP CONSTRAINT IF EXISTS progress_entries_created_by_fkey;
ALTER TABLE progress_entries
  ADD CONSTRAINT progress_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
