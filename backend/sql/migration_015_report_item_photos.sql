-- ============================================
-- Migration 015: แนบรูปถ่ายให้รายการใน report_items ได้ (เฉพาะ Tab คุณภาพงาน/ความปลอดภัย ใช้)
-- ไม่เกิน 4 รูปต่อรายการ (บังคับที่ชั้น backend เหมือน report_photo_selections เดิม)
-- รันใน Supabase SQL Editor ตามลำดับก่อน deploy โค้ดที่พึ่งพา schema นี้
-- ============================================

SET search_path TO project_mgt;

CREATE TABLE IF NOT EXISTS report_item_photos (
    id                    SERIAL PRIMARY KEY,
    report_item_id        INTEGER NOT NULL REFERENCES report_items(id) ON DELETE CASCADE,
    photo_url             TEXT NOT NULL,
    cloudinary_public_id  VARCHAR(255),
    sort_order            INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_item_photos_item ON report_item_photos(report_item_id);
