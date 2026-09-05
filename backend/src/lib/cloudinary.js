// lib/cloudinary.js
// ตั้งค่า Cloudinary SDK จาก .env — ต้องมี 3 ตัวแปรนี้ก่อนถึงจะอัปโหลดรูปได้จริง:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// (สมัครฟรีได้ที่ https://cloudinary.com/users/register/free แล้วเอาค่าจากหน้า Dashboard มาใส่ .env)
const cloudinary = require('cloudinary').v2;

const configured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * อัปโหลดไฟล์รูป (buffer ที่ multer parse มาให้จาก memory storage) ขึ้น Cloudinary
 * @param {Buffer} buffer - เนื้อไฟล์รูป
 * @param {string} folder - โฟลเดอร์ปลายทางบน Cloudinary (จัดระเบียบเป็น sikarin/progress-photos)
 * @returns {Promise<{url: string, publicId: string}>}
 */
function uploadBuffer(buffer, folder = 'sikarin/progress-photos') {
  if (!configured) {
    return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Cloudinary — ตรวจสอบ CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET ใน .env'));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer, isConfigured: () => configured };
