// src/pages/ProjectData/WbsLevel1Modal.jsx
import { useState } from 'react';
import client from '../../api/client';
import './WbsLevel1Modal.css';

function formatNumberDisplay(raw) {
  if (!raw && raw !== 0) return '';
  const str = String(raw);
  const [intPart, decPart] = str.split('.');
  const intFormatted = intPart ? Number(intPart.replace(/^0+(?=\d)/, '')).toLocaleString('en-US') : '';
  return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
}

export default function WbsLevel1Modal({ projectId, item, items, onClose, onSaved }) {
  const isEdit = Boolean(item);

  // เดารหัสถัดไปมาใส่ให้ตอน "เพิ่มใหม่" (ยังแก้ไขได้) โดยหาเลข running สูงสุดที่มีอยู่ +1
  function guessNextCode() {
    let maxRunning = 0;
    (items || []).forEach((i) => {
      const n = parseInt((i.code || '').replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > maxRunning) maxRunning = n;
    });
    return `JG-${maxRunning + 1}`;
  }

  const [code, setCode] = useState(item?.code || guessNextCode());
  const [name, setName] = useState(item?.name || '');
  const [amount, setAmount] = useState(item?.amount || '');
  const [deductPercent, setDeductPercent] = useState(item?.deduct_percent ?? '');
  const [isFinalGroup, setIsFinalGroup] = useState(item?.is_final_group || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ยอดรวมที่ถูกหักไว้จากกลุ่มงานอื่น (ไม่รวมตัวเอง) - ใช้เป็นค่าแนะนำ
  // ตอนติ๊ก "กลุ่มงานสุดท้าย" เพื่อดึงมูลค่าที่หักไปกลับมารวมให้ครบ 100%
  const suggestedAmount = (items || [])
    .filter((i) => i.id !== item?.id && !i.is_final_group)
    .reduce((sum, i) => {
      const amt = parseFloat(i.amount) || 0;
      const pct = parseFloat(i.deduct_percent) || 0;
      return sum + (amt * pct) / 100;
    }, 0);

  function handleFinalGroupToggle(checked) {
    setIsFinalGroup(checked);
    if (checked) {
      setDeductPercent('0');
      setAmount(String(suggestedAmount.toFixed(2))); // เติมทับเสมอ ไม่ต้องเช็คว่าว่างก่อน
    }
  }

  function handleAmountChange(e) {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) setAmount(raw);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อกลุ่มงาน');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: code || undefined,
        name,
        amount: amount || 0,
        deduct_percent: isFinalGroup ? 0 : (deductPercent || 0),
        is_final_group: isFinalGroup,
      };
      if (isEdit) {
        await client.put(`/wbs-level1/${item.id}`, payload);
      } else {
        await client.post('/wbs-level1', { ...payload, project_id: projectId });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-box__header">
          <h2>{isEdit ? `แก้ไข ${item.code}` : 'เพิ่มกลุ่มงานหลัก'}</h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <form onSubmit={handleSave}>
          {error && <div className="modal-box__error">{error}</div>}

          <div className="form-row form-row--code-name">
            <label className="field">
              <span className="field__label">รหัส *</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น JG-1" required />
            </label>
            <label className="field">
              <span className="field__label">ชื่อกลุ่มงาน *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
          </div>

          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">มูลค่า (บาท)</span>
              <input
                type="text"
                inputMode="decimal"
                value={formatNumberDisplay(amount)}
                onChange={handleAmountChange}
                onFocus={() => { if (parseFloat(amount) === 0) setAmount(''); }}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span className="field__label">% หัก</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={isFinalGroup ? 0 : deductPercent}
                onChange={(e) => setDeductPercent(e.target.value)}
                onFocus={() => { if (parseFloat(deductPercent) === 0) setDeductPercent(''); }}
                disabled={isFinalGroup}
                placeholder="0"
              />
            </label>
          </div>
          <p className="field__hint">% หัก คือส่วนที่ owner ยังไม่นับ progress จนกว่าจะส่งงานสุดท้าย (เช่น Asbuilt dwg)</p>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={isFinalGroup}
              onChange={(e) => handleFinalGroupToggle(e.target.checked)}
            />
            <span>เป็นกลุ่มงานสุดท้าย (เก็บมูลค่าที่ถูกหักจากกลุ่มอื่นกลับมา)</span>
          </label>
          {isFinalGroup && (
            <p className="field__hint">
              ยอดที่ถูกหักไว้จากกลุ่มงานอื่นรวม: {suggestedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
              (ใส่ไว้ในช่องมูลค่าให้อัตโนมัติแล้ว แก้ไขได้ถ้าต้องการ)
            </p>
          )}

          <div className="modal-box__footer">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>ปิด</button>
          </div>
        </form>
      </div>
    </div>
  );
}
