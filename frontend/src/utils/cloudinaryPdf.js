// src/utils/cloudinaryPdf.js
// แปลง URL ไฟล์แผนงาน PDF ที่อัปโหลดไว้บน Cloudinary (resource_type='image') ให้เป็น URL รูปภาพของหน้าที่
// ต้องการ — ใช้ฟีเจอร์ built-in ของ Cloudinary (URL transformation "pg_N" + "f_jpg") ไม่ต้องประมวลผลอะไรเอง
// ฝั่งเรา (ไม่ต้องติดตั้ง library แปลง PDF เป็นรูปเพิ่ม ซึ่งมักต้องพึ่ง native binary อย่าง poppler/
// ghostscript ที่ไม่รับประกันว่าจะมีอยู่บน Railway)
//
// ตัวอย่าง: baseUrl = "https://res.cloudinary.com/xxx/image/upload/v123/sikarin/schedule-pdf/abc.pdf"
// buildPdfPageImageUrl(baseUrl, 2) = "https://res.cloudinary.com/xxx/image/upload/pg_2,f_jpg,q_auto/v123/sikarin/schedule-pdf/abc.pdf"
// (ใช้ f_jpg เป็น transformation flag แทนการเปลี่ยนนามสกุลไฟล์เอง — กันพลาดกรณีชื่อไฟล์มีจุดอยู่ในตัวเอง)
export function buildPdfPageImageUrl(baseUrl, page) {
  if (!baseUrl) return null;
  return baseUrl.replace('/upload/', `/upload/pg_${page},f_jpg,q_auto/`);
}
