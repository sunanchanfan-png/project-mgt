// src/pages/ProjectManagement/printUtils.js
// ใช้ร่วมกันระหว่าง Tab งานสัปดาห์นี้/หน้า และ Tab ตารางงานรวม เวลาสร้างตารางสำหรับพิมพ์
// ตัดบางคอลัมน์ออก (เช่น "การจัดการ" ที่มีแต่ปุ่มแก้ไข/ลบซึ่งไม่มีประโยชน์บนกระดาษ, "รูปถ่าย")
// แล้วเอาความกว้าง (%) ของคอลัมน์ที่ตัดออกไปเพิ่มให้คอลัมน์แรก (โครงสร้างงาน) แทน
// ให้ตารางที่พิมพ์ยังเต็มกรอบพอดี ไม่เหลือช่องว่างเป็นแถบขาวด้านขวา

/**
 * @param {string} tableSelector - CSS selector ของ <table> ต้นฉบับบนหน้าจอ
 * @param {number[]} excludeColIndexes - index ของคอลัมน์ (0-based) ที่จะตัดออกตอนพิมพ์
 * @returns {string|null} outerHTML ของตารางที่ตัดคอลัมน์แล้ว หรือ null ถ้าหาตารางต้นฉบับไม่เจอ
 */
export function buildPrintTableHTML(tableSelector, excludeColIndexes) {
  const original = document.querySelector(tableSelector);
  if (!original) return null;
  const clone = original.cloneNode(true);

  const cols = [...clone.querySelectorAll('colgroup col')];
  let removedWidth = 0;
  excludeColIndexes.forEach((idx) => {
    const w = parseFloat(cols[idx]?.style.width) || 0;
    removedWidth += w;
  });

  // เพิ่มความกว้างที่ตัดออกไปให้คอลัมน์แรก (โครงสร้างงาน)
  if (cols[0] && removedWidth > 0) {
    const firstWidth = parseFloat(cols[0].style.width) || 0;
    cols[0].style.width = `${(firstWidth + removedWidth).toFixed(2)}%`;
  }

  // ลบ <col> และ <th>/<td> ที่ตำแหน่งเดียวกันในทุกแถว — ไล่ลบจากมากไปน้อยกันตำแหน่ง index เลื่อน
  const sortedDesc = [...excludeColIndexes].sort((a, b) => b - a);
  sortedDesc.forEach((idx) => { if (cols[idx]) cols[idx].remove(); });

  const rows = [...clone.querySelectorAll('tr')];
  rows.forEach((row) => {
    const cells = [...row.children];
    sortedDesc.forEach((idx) => { if (cells[idx]) cells[idx].remove(); });
  });

  return clone.outerHTML;
}

// ===== ใช้ร่วมกันสำหรับพิมพ์กราฟ S-Curve (Tab "Main S-Curve" และ Tab "Group S-Curve") =====

// CSS ของหน้าพิมพ์ S-Curve แบบสมบูรณ์ในตัวเอง (หน้าต่างพิมพ์เปิดแยกต่างหาก ไม่โหลด CSS ของแอปหลัก จึงต้อง
// ระบุค่าสีจริงตรงๆ แทนตัวแปร CSS var(--xxx) ที่ใช้ในตัวแอป — คัดลอกค่าจาก ProjectManagement.css ให้ตรงกัน
export const SCURVE_PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', system-ui, sans-serif; margin: 16px; color: #12202E; }
  h2 { font-size: 16px; margin: 0 0 4px 0; }
  p.p-sub { font-size: 12px; color: #4B5D6B; margin: 0 0 16px 0; }
  svg { width: 100%; height: auto; display: block; }
  .scurve-chart__grid { stroke: #C7CDD1; stroke-width: 1; }
  .scurve-chart__grid-border { fill: none; stroke: #C7CDD1; stroke-width: 1; }
  .scurve-chart__axis-label { font-size: 10px; fill: #4B5D6B; }
  .scurve-chart__line-plan { fill: none; stroke: #F5820D; stroke-width: 2.5; }
  .scurve-chart__line-actual { fill: none; stroke: #1E8E4F; stroke-width: 2.5; }
  .scurve-chart__today-line { stroke: #4B5D6B; stroke-width: 1; stroke-dasharray: 3 3; }
  .scurve-chart__dot { stroke: #FFFFFF; stroke-width: 1.5; }
  .scurve-chart__dot--plan { fill: #F5820D; }
  .scurve-chart__dot--actual { fill: #1E8E4F; }
  .scurve-chart__callout-leader { stroke: #4B5D6B; stroke-width: 1; stroke-dasharray: 2 2; }
  .scurve-chart__callout-box { fill: #FFFFFF; stroke: #C7CDD1; stroke-width: 1; }
  .scurve-chart__callout-text { font-size: 10.5px; fill: #12202E; }
  .scurve-chart__callout-text--gain { fill: #1E8E4F; font-weight: 700; }
  .scurve-chart__callout-text--delay { fill: #C4433A; font-weight: 700; }
  .scurve-chart__legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; color: #4B5D6B; }
  .scurve-chart__legend-item { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .scurve-chart__swatch { display: inline-block; width: 18px; height: 3px; border-radius: 2px; }
  .scurve-chart__swatch--plan { background: #F5820D; }
  .scurve-chart__swatch--actual { background: #1E8E4F; }
  .scurve-print-group { page-break-inside: avoid; margin-bottom: 28px; }
`;

/**
 * เปิดหน้าต่างใหม่แล้วสั่งพิมพ์ — ใช้ร่วมกันทุกจุดที่ต้องพิมพ์ในเมนูนี้ (ตาราง/กราฟ)
 * @param {string} title - ใช้เป็น <title> ของหน้าต่างพิมพ์
 * @param {string} bodyHtml - เนื้อหาภายใน <body> (สร้างมาแล้วจากภายนอก)
 * @param {string} css - เนื้อหาภายใน <style>
 */
export function openPrintWindow(title, bodyHtml, css) {
  const printWindow = window.open('', '_blank', 'width=1000,height=750');
  if (!printWindow) {
    alert('เบราว์เซอร์บล็อกการเปิดหน้าต่างพิมพ์ กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้แล้วลองใหม่');
    return null;
  }
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="th">
<head><meta charset="utf-8" /><title>${title}</title><style>${css}</style></head>
<body>${bodyHtml}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  let printed = false;
  function triggerOnce() { if (printed) return; printed = true; printWindow.print(); }
  printWindow.onload = triggerOnce;
  setTimeout(triggerOnce, 300);
  printWindow.addEventListener('afterprint', () => printWindow.close());
  return printWindow;
}

// แปลง YYYY-MM-DD เป็น dd/mm/yyyy (ปี ค.ศ. ตรงๆ) — ใช้ร่วมกันทุก Tab
export function fmtDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

