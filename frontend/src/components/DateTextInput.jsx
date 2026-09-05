// src/components/DateTextInput.jsx
// ช่องพิมพ์วันที่แบบข้อความธรรมดา วว/ดด/ปปปป แทน input type=date ของเบราว์เซอร์
// เพราะ input type=date แต่ละเบราว์เซอร์ตีความการพิมพ์ทีละส่วน (วัน/เดือน/ปี) ไม่แน่นอน
// ทำให้กรอกบางวันที่ไม่ได้ ("เด้งกลับ") - ใช้ตัวนี้แทนที่ทุกจุดในแอปเพื่อความสม่ำเสมอ
import { useEffect, useState } from 'react';

function toUTCDate(str) {
  if (!str) return null;
  const datePart = String(str).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoToThaiText(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function thaiTextToISO(text) {
  const match = String(text).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, mo, y] = match;
  const dd = d.padStart(2, '0');
  const mm = mo.padStart(2, '0');
  const check = toUTCDate(`${y}-${mm}-${dd}`);
  if (!check || check.getUTCFullYear() != y || check.getUTCMonth() + 1 != mo || check.getUTCDate() != d) {
    return null;
  }
  return `${y}-${mm}-${dd}`;
}

/**
 * ช่องกรอกวันที่แบบ วว/ดด/ปปปป
 * @param {string} valueISO - ค่าปัจจุบันแบบ ISO (YYYY-MM-DD)
 * @param {(iso: string) => void} onCommit - เรียกเมื่อกรอกวันที่ถูกต้องแล้ว (ตอน blur/Enter)
 * @param {string} className - class เพิ่มเติม (ต่อจาก class มาตรฐานของ input ในฟอร์มนั้นๆ)
 */
export default function DateTextInput({ valueISO, onCommit, className = '', placeholder = 'วว/ดด/ปปปป', ...rest }) {
  const [text, setText] = useState(isoToThaiText(valueISO));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(isoToThaiText(valueISO));
    setInvalid(false);
  }, [valueISO]);

  function handleBlur() {
    if (text.trim() === '') {
      setInvalid(false);
      return;
    }
    const iso = thaiTextToISO(text);
    if (iso) {
      setInvalid(false);
      onCommit(iso);
    } else {
      setInvalid(true);
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={`${className} ${invalid ? 'date-text-input--invalid' : ''}`.trim()}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder={placeholder}
      title={invalid ? 'รูปแบบวันที่ไม่ถูกต้อง ใช้ วว/ดด/ปปปป เช่น 01/09/2026' : ''}
      {...rest}
    />
  );
}
