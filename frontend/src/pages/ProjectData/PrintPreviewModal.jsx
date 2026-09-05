// src/pages/ProjectData/PrintPreviewModal.jsx
import { useEffect, useState } from 'react';
import './WbsLevel1Modal.css';
import './PrintPreviewModal.css';

/**
 * Popup ตั้งค่าก่อนพิมพ์ตาราง Gantt — เลือกขนาดกระดาษ (A4/A3), แนวกระดาษ (ตั้ง/นอน)
 * และช่วงวันที่ที่จะพิมพ์ (ค่าเริ่มต้น = วันเริ่มสัญญา -7 วัน ถึง วันสิ้นสุดสัญญา +7 วัน — แก้ไขเองได้เสมอ
 * ถ้าโปรเจกต์ไม่มีวันที่สัญญา จะเว้นว่างไว้ ให้ระบบจัดช่วงให้อัตโนมัติแทน: วันเริ่มโครงการ ถึงแท่งงานสุดท้าย + 7 วัน)
 * ค่าที่เลือกใช้คำนวณ "บีบความกว้าง" แกนเวลาให้พอดีกระดาษโดยประมาณเท่านั้น (ไม่ได้บังคับขนาดกระดาษจริง
 * ผ่าน CSS @page ตรงๆ แล้ว เพราะเจอบั๊กที่ Chrome ล็อกเป็นขนาด custom แล้วคำนวณแบ่งหน้าผิดพลาด)
 * ขนาด/แนวกระดาษจริงที่จะพิมพ์ ให้เลือกในหน้าต่างพิมพ์ของเบราว์เซอร์เองอีกที (Paper size / Layout)
 * กด "ดูตัวอย่าง & พิมพ์" จะเปิดหน้าต่างพิมพ์ของเบราว์เซอร์ให้อัตโนมัติ
 * (ใช้ตัวอย่างก่อนพิมพ์ในตัวของเบราว์เซอร์เอง — กด Esc หรือ "ยกเลิก" ในหน้าต่างนั้นเพื่อปิดโดยไม่พิมพ์ได้เลย)
 * ปุ่ม "ยกเลิก"/ปุ่ม ✕/กด Esc ที่ popup นี้เอง จะปิด popup นี้โดยไม่พิมพ์
 */
export default function PrintPreviewModal({ onClose, onPrint, defaultStart, defaultEnd }) {
  const [paperSize, setPaperSize] = useState('A4');
  const [orientation, setOrientation] = useState('landscape'); // Gantt กว้าง เลยตั้งแนวนอนเป็นค่าเริ่มต้น
  // ช่วงวันที่ — ตั้งต้นจากวันสัญญา ±7 วันที่ส่งมาจาก GanttView (ถ้าโปรเจกต์มีวันที่สัญญา) แก้ไขเองต่อได้เสมอ
  const [customStart, setCustomStart] = useState(defaultStart || '');
  const [customEnd, setCustomEnd] = useState(defaultEnd || '');

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box print-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-box__header">
          <h2>🖨 พิมพ์ตาราง Gantt</h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <div className="print-modal__section">
          <span className="field__label">ขนาดกระดาษ</span>
          <div className="print-modal__options">
            <button
              type="button"
              className={`print-modal__opt ${paperSize === 'A4' ? 'print-modal__opt--active' : ''}`}
              onClick={() => setPaperSize('A4')}
            >
              A4
            </button>
            <button
              type="button"
              className={`print-modal__opt ${paperSize === 'A3' ? 'print-modal__opt--active' : ''}`}
              onClick={() => setPaperSize('A3')}
            >
              A3
            </button>
          </div>
        </div>

        <div className="print-modal__section">
          <span className="field__label">แนวกระดาษ</span>
          <div className="print-modal__options">
            <button
              type="button"
              className={`print-modal__opt ${orientation === 'portrait' ? 'print-modal__opt--active' : ''}`}
              onClick={() => setOrientation('portrait')}
            >
              ↕ แนวตั้ง
            </button>
            <button
              type="button"
              className={`print-modal__opt ${orientation === 'landscape' ? 'print-modal__opt--active' : ''}`}
              onClick={() => setOrientation('landscape')}
            >
              ↔ แนวนอน
            </button>
          </div>
        </div>

        <div className="print-modal__section">
          <span className="field__label">ช่วงวันที่ที่จะพิมพ์ (ตั้งต้นจากวันสัญญา ±7 วัน แก้ไขเองได้)</span>
          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">วันเริ่ม</span>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">วันสิ้นสุด</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </label>
          </div>
        </div>

        <p className="field__hint">
          ค่าที่เลือกไว้ใช้บีบความกว้างแกนเวลาให้พอดีกระดาษโดยประมาณเท่านั้น — พอกดแล้วหน้าต่างพิมพ์ของ
          เบราว์เซอร์จะเปิดขึ้น ให้เลือกขนาด/แนวกระดาษจริงอีกทีที่ "Paper size" / "Layout" ในหน้าต่างนั้น
          (ให้ตรงกับที่เลือกไว้ตรงนี้เพื่อผลลัพธ์ที่พอดีที่สุด) — กด Esc หรือ "ยกเลิก" ในหน้าต่างนั้นปิดได้โดยไม่พิมพ์
        </p>

        <div className="modal-box__footer">
          <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onPrint(paperSize, orientation, customStart || null, customEnd || null)}
          >
            ดูตัวอย่าง &amp; พิมพ์
          </button>
        </div>
      </div>
    </div>
  );
}
