// src/pages/ProjectData/WbsLevel2Modal.jsx
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

export default function WbsLevel2Modal({ level1Id, item, items, groupCode, groupRemainingAmount, onClose, onSaved }) {
  const isEdit = Boolean(item);

  // เดารหัสถัดไปมาใส่ให้ตอน "เพิ่มใหม่" (ยังแก้ไขได้) รูปแบบ JN-{เลขกลุ่ม}{running 2 หลัก}
  function guessNextCode() {
    const groupNumberMatch = (groupCode || '').match(/\d+/);
    const groupNumber = groupNumberMatch ? groupNumberMatch[0] : '0';
    let maxRunning = 0;
    (items || []).forEach((i) => {
      const digitsOnly = (i.code || '').replace(/\D/g, '');
      const n = parseInt(digitsOnly.slice(-2), 10);
      if (!isNaN(n) && n > maxRunning) maxRunning = n;
    });
    return `JN-${groupNumber}${String(maxRunning + 1).padStart(2, '0')}`;
  }

  const [code, setCode] = useState(item?.code || guessNextCode());
  const [name, setName] = useState(item?.name || '');

  // โหมดกรอก: 'amount' = กรอกมูลค่าแล้วคำนวณ %Share ให้, 'percent' = กรอก %Share แล้วคำนวณมูลค่าให้
  const [inputMode, setInputMode] = useState('percent');
  const [amount, setAmount] = useState(item?.amount || '');
  const [percentInput, setPercentInput] = useState(
    item && groupRemainingAmount > 0 ? String(((parseFloat(item.amount) || 0) / groupRemainingAmount * 100).toFixed(2)) : ''
  );

  const [isLastItem, setIsLastItem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // %Share รวมของรายการอื่นๆ (ไม่รวมตัวเอง) - ใช้คำนวณส่วนที่เหลือให้ "รายการสุดท้าย"
  const otherItemsSharePercent = (items || [])
    .filter((i) => i.id !== item?.id)
    .reduce((sum, i) => sum + (parseFloat(i.share_percent) || 0), 0);
  const remainingPercent = Math.max(0, 100 - otherItemsSharePercent);
  const remainingAmount = groupRemainingAmount > 0 ? (remainingPercent / 100) * groupRemainingAmount : 0;

  function handleAmountChange(e) {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setAmount(raw);
    }
  }

  function handlePercentChange(e) {
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setPercentInput(raw);
      const pct = parseFloat(raw) || 0;
      setAmount(String(((pct / 100) * groupRemainingAmount).toFixed(2)));
    }
  }

  function switchMode(mode) {
    setInputMode(mode);
    if (mode === 'percent') {
      // สลับมาโหมด % ให้เอาค่ามูลค่าปัจจุบันมาคำนวณเป็น % ตั้งต้น
      const pct = groupRemainingAmount > 0 ? ((parseFloat(amount) || 0) / groupRemainingAmount) * 100 : 0;
      setPercentInput(String(pct.toFixed(2)));
    }
  }

  function handleLastItemToggle(checked) {
    setIsLastItem(checked);
    if (checked) {
      setAmount(String(remainingAmount.toFixed(2)));
      setPercentInput(String(remainingPercent.toFixed(2)));
    }
  }

  const livePercent = groupRemainingAmount > 0 && amount
    ? ((parseFloat(amount) || 0) / groupRemainingAmount) * 100
    : 0;

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อรายการงาน');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { code: code || undefined, name, amount: amount || 0 };
      if (isEdit) {
        await client.put(`/wbs-level2/${item.id}`, payload);
      } else {
        await client.post('/wbs-level2', { ...payload, level1_id: level1Id });
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
          <h2>{isEdit ? `แก้ไข ${item.code}` : 'เพิ่มรายการงาน'}</h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <form onSubmit={handleSave}>
          {error && <div className="modal-box__error">{error}</div>}

          <div className="form-row form-row--code-name">
            <label className="field">
              <span className="field__label">รหัส *</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น JN-101" required />
            </label>
            <label className="field">
              <span className="field__label">ชื่องาน *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
          </div>

          {!isLastItem && (
            <div className="mode-toggle">
              <button
                type="button"
                className={`mode-toggle__btn ${inputMode === 'amount' ? 'mode-toggle__btn--active' : ''}`}
                onClick={() => switchMode('amount')}
              >
                กรอกมูลค่า
              </button>
              <button
                type="button"
                className={`mode-toggle__btn ${inputMode === 'percent' ? 'mode-toggle__btn--active' : ''}`}
                onClick={() => switchMode('percent')}
              >
                กรอก %Share
              </button>
            </div>
          )}

          {inputMode === 'amount' && (
            <>
              <label className="field">
                <span className="field__label">มูลค่า (บาท)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatNumberDisplay(amount)}
                  onChange={handleAmountChange}
                  onFocus={() => { if (parseFloat(amount) === 0) setAmount(''); }}
                  placeholder="0.00"
                  disabled={isLastItem}
                />
              </label>
              <p className="field__hint">คิดเป็น %Share: <strong>{livePercent.toFixed(2)}%</strong></p>
            </>
          )}

          {inputMode === 'percent' && (
            <>
              <label className="field">
                <span className="field__label">%Share ของกลุ่มงาน</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={percentInput}
                  onChange={handlePercentChange}
                  onFocus={() => { if (parseFloat(percentInput) === 0) setPercentInput(''); }}
                  placeholder="0.00"
                  disabled={isLastItem}
                />
              </label>
              <p className="field__hint">
                คิดเป็นมูลค่า: <strong>{Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</strong>
              </p>
            </>
          )}

          <p className="field__hint">มูลค่าเหลือของกลุ่มงาน: {groupRemainingAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</p>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={isLastItem}
              onChange={(e) => handleLastItemToggle(e.target.checked)}
            />
            <span>เป็นรายการสุดท้าย (เติม % และมูลค่าที่เหลือให้ครบ 100% อัตโนมัติ)</span>
          </label>
          {isLastItem && (
            <p className="field__hint">
              เติมให้ครบ 100% อัตโนมัติ: %Share = <strong>{remainingPercent.toFixed(2)}%</strong>
              {' '}มูลค่า = <strong>{remainingAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</strong>
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
