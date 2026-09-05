// src/pages/ProjectData/WbsLevel3Modal.jsx
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

function toUTCDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// นับจำนวนวันแบบรวมวันแรกและวันสุดท้าย (มาตรฐานงานก่อสร้าง เช่น 1-5 ต.ค. = 5 วัน)
function countDaysInclusive(startStr, endStr) {
  const start = toUTCDateLocal(startStr);
  const end = toUTCDateLocal(endStr);
  if (!start || !end) return '';
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : '';
}

function addDays(startStr, days) {
  const start = toUTCDateLocal(startStr);
  if (!start || !days) return '';
  const result = new Date(start.getTime() + (parseInt(days, 10) - 1) * (1000 * 60 * 60 * 24));
  return result.toISOString().slice(0, 10);
}

// ใช้ตอนกิจกรรมงานนี้ถูกกำหนด "วันเสร็จ" ตายตัวจากกิจกรรมงานต้นทาง (ลิงก์ FF/SF) —
// แก้จำนวนวันต้องคงวันเสร็จเดิมไว้ แล้วเลื่อนวันเริ่มถอยแทน (ตรงข้ามกับ addDays)
function subtractDaysFromEnd(endStr, days) {
  const end = toUTCDateLocal(endStr);
  if (!end || !days) return '';
  const result = new Date(end.getTime() - (parseInt(days, 10) - 1) * (1000 * 60 * 60 * 24));
  return result.toISOString().slice(0, 10);
}

export default function WbsLevel3Modal({ level2Id, item, items, groupCode, groupAmount, onClose, onSaved }) {
  const isEdit = Boolean(item);

  function guessNextCode() {
    const numPart = (groupCode || '').replace(/\D/g, '') || '0';
    let maxRunning = 0;
    (items || []).forEach((i) => {
      const parts = (i.code || '').split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n) && n > maxRunning) maxRunning = n;
    });
    return `JE-${numPart}-${String(maxRunning + 1).padStart(2, '0')}`;
  }

  const [code, setCode] = useState(item?.code || guessNextCode());
  const [name, setName] = useState(item?.name || '');

  const [inputMode, setInputMode] = useState('percent');
  const [amount, setAmount] = useState(item?.amount || '');
  const [percentInput, setPercentInput] = useState(
    item && groupAmount > 0 ? String(((parseFloat(item.amount) || 0) / groupAmount * 100).toFixed(2)) : ''
  );

  const [startDate, setStartDate] = useState(item?.start_date ? String(item.start_date).slice(0, 10) : '');
  const [endDate, setEndDate] = useState(item?.end_date ? String(item.end_date).slice(0, 10) : '');
  const [durationDays, setDurationDays] = useState(item?.duration_days || '');

  const [isLastItem, setIsLastItem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ถ้ากิจกรรมงานนี้มีลิงก์เชื่อมโยงแบบ FF/SF (คุมวันเสร็จ) โดยไม่มี FS/SS ปนอยู่เลย
  // ให้ยึด "วันเสร็จ" เป็นหลักตอนแก้จำนวนวัน แทนที่จะยึดวันเริ่มแบบปกติ (ตรงกับหลักการเดียวกับ Tab Gantt)
  const hasStartAnchorDep = (item?.predecessors || []).some((d) => d.dependency_type === 'FS' || d.dependency_type === 'SS');
  const hasEndAnchorDep = (item?.predecessors || []).some((d) => d.dependency_type === 'FF' || d.dependency_type === 'SF');
  const isEndAnchored = hasEndAnchorDep && !hasStartAnchorDep;

  const otherItemsSharePercent = (items || [])
    .filter((i) => i.id !== item?.id)
    .reduce((sum, i) => sum + (parseFloat(i.share_percent) || 0), 0);
  const remainingPercent = Math.max(0, 100 - otherItemsSharePercent);
  const remainingAmount = groupAmount > 0 ? (remainingPercent / 100) * groupAmount : 0;

  function handleAmountChange(e) {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) setAmount(raw);
  }

  function handlePercentChange(e) {
    const raw = e.target.value;
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setPercentInput(raw);
      const pct = parseFloat(raw) || 0;
      setAmount(String(((pct / 100) * groupAmount).toFixed(2)));
    }
  }

  function switchMode(mode) {
    setInputMode(mode);
    if (mode === 'percent') {
      const pct = groupAmount > 0 ? ((parseFloat(amount) || 0) / groupAmount) * 100 : 0;
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

  // วันที่เริ่ม/จบ กับจำนวนวัน ผูกกันสองทาง: แก้ช่วงวันที่ -> คำนวณจำนวนวันให้
  // แก้จำนวนวัน (ตอนมีวันที่เริ่มแล้ว) -> คำนวณวันที่จบให้แทน
  function handleStartDateChange(v) {
    setStartDate(v);
    if (v && endDate) setDurationDays(String(countDaysInclusive(v, endDate)));
  }

  function handleEndDateChange(v) {
    setEndDate(v);
    if (startDate && v) setDurationDays(String(countDaysInclusive(startDate, v)));
  }

  function handleDurationChange(e) {
    const v = e.target.value;
    if (v === '' || /^\d*$/.test(v)) {
      setDurationDays(v);
      if (isEndAnchored && endDate && v) {
        // กิจกรรมนี้ถูกกำหนดวันเสร็จตายตัวจากกิจกรรมงานต้นทาง (FF/SF) -> คงวันเสร็จเดิมไว้ เลื่อนวันเริ่มถอยแทน
        setStartDate(subtractDaysFromEnd(endDate, v));
      } else if (startDate && v) {
        setEndDate(addDays(startDate, v));
      }
    }
  }

  const livePercent = groupAmount > 0 && amount ? ((parseFloat(amount) || 0) / groupAmount) * 100 : 0;

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อกิจกรรมงาน');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: code || undefined,
        name,
        amount: amount || 0,
        duration_days: durationDays || null,
        start_date: startDate || null,
        end_date: endDate || null,
      };
      if (isEdit) {
        await client.put(`/wbs-level3/${item.id}`, payload);
      } else {
        await client.post('/wbs-level3', { ...payload, level2_id: level2Id });
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
          <h2>{isEdit ? `แก้ไข ${item.code}` : 'เพิ่มกิจกรรมงาน'}</h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <form onSubmit={handleSave}>
          {error && <div className="modal-box__error">{error}</div>}

          <div className="form-row form-row--code-name">
            <label className="field">
              <span className="field__label">รหัส *</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น JE-101-01" required />
            </label>
            <label className="field">
              <span className="field__label">ชื่อกิจกรรมงาน *</span>
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
          )}
          {inputMode === 'percent' && (
            <label className="field">
              <span className="field__label">%Share ของรายการงาน</span>
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
          )}
          <p className="field__hint">
            มูลค่า {Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
            {' '}({livePercent.toFixed(2)}% ของรายการงานนี้)
          </p>

          <label className="field field--checkbox">
            <input type="checkbox" checked={isLastItem} onChange={(e) => handleLastItemToggle(e.target.checked)} />
            <span>เป็นรายการสุดท้าย (เติม % และมูลค่าที่เหลือให้ครบ 100% อัตโนมัติ)</span>
          </label>

          <div className="form-row form-row--3">
            <label className="field">
              <span className="field__label">วันที่เริ่ม</span>
              <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">วันที่เสร็จ</span>
              <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">จำนวนวัน</span>
              <input
                type="text"
                inputMode="numeric"
                value={durationDays}
                onChange={handleDurationChange}
                onFocus={() => { if (parseFloat(durationDays) === 0) setDurationDays(''); }}
                placeholder="0"
              />
            </label>
          </div>
          <p className="field__hint">
            {isEndAnchored
              ? 'กิจกรรมงานนี้เชื่อมโยงแบบ FF/SF (คุมวันเสร็จจากกิจกรรมงานต้นทาง) — แก้จำนวนวันจะคงวันเสร็จไว้ แล้วเลื่อนวันเริ่มแทน'
              : 'กรอกช่วงวันที่แล้วจำนวนวันคำนวณให้อัตโนมัติ หรือกรอกจำนวนวันจะคำนวณวันที่เสร็จให้แทน'}
          </p>

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
