// routes/photos.js
// endpoint อัปโหลดรูปทั่วไป (ไม่ผูกกับ record ไหนโดยเฉพาะ ณ จุดอัปโหลด) — ใช้จาก Tab งานสัปดาห์นี้ตอนแนบ
// รูปความคืบหน้า: อัปโหลดขึ้น Cloudinary ก่อนได้ url จริงมา แล้วค่อยส่ง url นั้นแนบไปกับ POST /progress/entries
// (endpoint เดิมที่รับ photo_urls เป็น array ของ url string อยู่แล้ว ไม่ต้องแก้ตรงนั้น)
const express = require('express');
const multer = require('multer');
const { verifyToken, requireRole } = require('../middleware/auth');
const { uploadBuffer, isConfigured } = require('../lib/cloudinary');

const router = express.Router();
router.use(verifyToken);

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB ต่อไฟล์ — กันไฟล์ใหญ่เกินไปโดยไม่ตั้งใจ (รูปมือถือทั่วไปไม่เกินนี้)
const upload = multer({
  storage: multer.memoryStorage(), // ไม่เขียนลง disk ของ server เลย ส่งต่อ Cloudinary ตรงๆ จากหน่วยความจำ
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('รองรับเฉพาะไฟล์รูปภาพเท่านั้น'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/photos/upload
 * multipart/form-data, field name = "photo" (ไฟล์เดียวต่อ request — ฝั่ง frontend เรียกวนทีละไฟล์ถ้า
 * เลือกมาหลายไฟล์พร้อมกัน เพื่อให้แสดง progress/error แยกทีละไฟล์ได้ชัดเจน)
 * ตอบกลับ: { url, public_id }
 */
router.post('/upload', requireRole('admin', 'pm', 'foreman'), (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'ระบบอัปโหลดรูปยังไม่พร้อมใช้งาน (ยังไม่ได้ตั้งค่า Cloudinary บนเซิร์ฟเวอร์)' });
  }
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกินไป (จำกัดไม่เกิน 8MB ต่อรูป)' : (err.message || 'อัปโหลดไม่สำเร็จ');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'ไม่พบไฟล์รูปที่ส่งมา' });
    }
    try {
      const result = await uploadBuffer(req.file.buffer);
      res.json({ url: result.url, public_id: result.publicId });
    } catch (uploadErr) {
      console.error(uploadErr);
      res.status(500).json({ error: 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่' });
    }
  });
});

module.exports = router;
