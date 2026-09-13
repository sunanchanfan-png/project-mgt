// src/utils/lastProject.js
// จำ "โครงการที่เลือก/เปิดดูล่าสุด" ไว้ใน localStorage ใช้ร่วมกันข้ามเมนู (สร้างข้อมูลโครงการ/การจัดการ
// โครงการ/จัดทำรายงาน) — ทุกเมนูอ่านค่านี้มาเป็นค่าเริ่มต้นตอนเปิดหน้า แทนที่จะเลือกโครงการแรกในลิสต์เสมอ
// และทุกเมนูก็เขียนค่านี้กลับทุกครั้งที่ผู้ใช้เปลี่ยนโครงการเอง (ไม่ใช่แค่ฝั่ง "เปิดโครงการ" ทางเดียว) ทำให้
// ไม่ว่าจะเปลี่ยนโครงการจากเมนูไหนก่อน เมนูอื่นที่เปิดตามมาก็จะ default ตรงกันเสมอ
const KEY = 'sikarin_last_project_id';

export function getLastProjectId() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return ''; // เผื่อ browser บล็อก localStorage (โหมด private บางตัว) — ไม่ทำให้แอปพังทั้งหน้า
  }
}

export function setLastProjectId(id) {
  if (!id) return;
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    // เงียบไว้ได้ — แค่เสียความสะดวกเรื่อง default ข้ามเมนู ไม่ใช่ฟังก์ชันหลักของระบบ
  }
}

// หาโครงการเริ่มต้นที่ควรเลือกจากลิสต์ที่โหลดมา — ใช้ "โครงการที่เลือกล่าสุด" ถ้ายังมีอยู่ในลิสต์นี้จริง
// (เช่น ยังเปิดอยู่ ไม่ได้ถูกลบ/ปิดไปแล้ว) ไม่งั้น fallback ไปโครงการแรกในลิสต์เหมือนพฤติกรรมเดิม
export function pickDefaultProjectId(projects) {
  const remembered = getLastProjectId();
  if (remembered && projects.some((p) => String(p.id) === String(remembered))) return remembered;
  return projects.length > 0 ? projects[0].id : '';
}
