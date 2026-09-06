// lib/menuRegistry.js
// รายการ Menu/Tab ทั้งหมดในระบบ ณ ตอนนี้ — ใช้เป็น "แหล่งความจริงเดียว" (single source of truth) สำหรับ:
// 1) validate ตอน system_mgr กำหนดสิทธิ์ (กันส่ง menu_key/tab_key ที่ไม่มีจริงเข้ามา)
// 2) ส่งให้ frontend ใช้ render checkbox หน้าอนุมัติ/กำหนดสิทธิ์
//
// เมนูที่ยังไม่เปิดใช้งานจริง (การจัดการต้นทุน) ยังไม่ใส่ไว้ที่นี่ — พอสร้างเมนูนั้นเสร็จจริง
// ค่อยเพิ่มเข้ามาทีหลัง (เพิ่ม entry ในนี้ที่เดียว ไม่ต้องแก้หลายจุด)
const MENU_REGISTRY = [
  {
    menu_key: 'open_project',
    menu_label: 'เปิดโครงการ',
    tabs: [], // ไม่มี tab ย่อย — ให้สิทธิ์ทั้งเมนูด้วย tab_key = ''
  },
  {
    menu_key: 'project_data',
    menu_label: 'สร้างข้อมูลโครงการ',
    tabs: [
      { tab_key: 'group', tab_label: 'กลุ่มงานหลัก' },
      { tab_key: 'item', tab_label: 'รายการงาน' },
      { tab_key: 'activity', tab_label: 'กิจกรรมงาน' },
      { tab_key: 'gantt', tab_label: 'Gantt (ภาพรวม)' },
    ],
  },
  {
    menu_key: 'project_management',
    menu_label: 'การจัดการโครงการ',
    tabs: [
      { tab_key: 'this-week', tab_label: 'งานสัปดาห์นี้' },
      { tab_key: 'next-week', tab_label: 'งานสัปดาห์หน้า' },
      { tab_key: 'overall', tab_label: 'ตารางงานรวม' },
      { tab_key: 'scurve-main', tab_label: 'Main S-Curve' },
      { tab_key: 'scurve-group', tab_label: 'Group S-Curve' },
    ],
  },
  {
    menu_key: 'reports',
    menu_label: 'จัดทำรายงาน',
    tabs: [
      { tab_key: 'plan-progress', tab_label: 'Plan&Progress' },
      { tab_key: 'safety', tab_label: 'ความปลอดภัย' },
      { tab_key: 'photos', tab_label: 'รูปถ่าย' },
      { tab_key: 'next-week-plan', tab_label: 'งานสัปดาห์หน้า' },
      { tab_key: 'problems', tab_label: 'ปัญหาอุปสรรค' },
      { tab_key: 'additional-work', tab_label: 'งานเพิ่มลด' },
      { tab_key: 'pending', tab_label: 'เรื่องที่ค้าง' },
      { tab_key: 'compiled', tab_label: 'เล่มรายงาน' },
    ],
  },
];

// เซตของ "menu_key|tab_key" ที่ถูกต้องทั้งหมด (ใช้ validate เร็วๆ ตอนรับค่าจาก request)
const VALID_KEYS = new Set();
MENU_REGISTRY.forEach((m) => {
  if (m.tabs.length === 0) {
    VALID_KEYS.add(`${m.menu_key}|`);
  } else {
    m.tabs.forEach((t) => VALID_KEYS.add(`${m.menu_key}|${t.tab_key}`));
  }
});

function isValidMenuTab(menuKey, tabKey) {
  return VALID_KEYS.has(`${menuKey}|${tabKey || ''}`);
}

module.exports = { MENU_REGISTRY, isValidMenuTab };
