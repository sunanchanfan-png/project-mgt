// src/pages/ProjectData/QuickAddActivityModal.jsx
import { useState } from 'react';
import client from '../../api/client';
import './WbsLevel1Modal.css';

function toUTCDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
function countDaysInclusive(startStr, endStr) {
  const start = toUTCDateLocal(startStr);
  const end = toUTCDateLocal(endStr);
  if (!start || !end) return '';
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : '';
}
function addDaysToDate(startStr, days) {
  const start = toUTCDateLocal(startStr);
  if (!start || !days) return '';
  const result = new Date(start.getTime() + (parseInt(days, 10) - 1) * (1000 * 60 * 60 * 24));
  return result.toISOString().slice(0, 10);
}

/**
 * Popup ย่อ ใช้ตอนกด "+" เพิ่มกิจกรรมงาน (JE) ตรงจากหน้า Gantt
 * เน้นแค่ชื่องาน + ช่วงวันที่ ยังไม่ถามเรื่องมูลค่า/%Share (ปล่อย 0 ไว้ก่อน
 * ไปกรอกทีหลังที่ Tab "กิจกรรมงาน" ได้) เพื่อให้วางแผนตารางเวลาได้เร็ว
 */
export default function QuickAddActivityModal({ level2Id, level2Name, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleStartChange(v) {
    setStartDate(v);
    if (v && durationDays) setEndDate(addDaysToDate(v, durationDays));
    else if (v && endDate) setDurationDays(String(countDaysInclusive(v, endDate)));
  }
  function handleEndChange(v) {
    setEndDate(v);
    if (startDate && v) setDurationDays(String(countDaysInclusive(startDate, v)));
  }
  function handleDurationChange(v) {
    if (!/^\d*$/.test(v)) return;
    setDurationDays(v);
    if (startDate && v) setEndDate(addDaysToDate(startDate, v));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อกิจกรรมงาน');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.post('/wbs-level3', {
        level2_id: level2Id,
        name,
        amount: 0, // ยังไม่สนมูลค่าตอนนี้ ไปกรอกทีหลังที่ Tab กิจกรรมงาน
        duration_days: durationDays || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="modal-box__header">
          <h2>เพิ่มกิจกรรมงาน</h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <form onSubmit={handleSave}>
          {error && <div className="modal-box__error">{error}</div>}

          <p className="field__hint" style={{ marginTop: -4 }}>
            ในรายการงาน: <strong>{level2Name}</strong>
          </p>

          <label className="field">
            <span className="field__label">ชื่อกิจกรรมงาน *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>

          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">วันที่เริ่ม</span>
              <input type="date" value={startDate} onChange={(e) => handleStartChange(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">วันที่เสร็จ</span>
              <input type="date" value={endDate} onChange={(e) => handleEndChange(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">จำนวนวัน</span>
            <input
              type="text"
              inputMode="numeric"
              value={durationDays}
              onChange={(e) => handleDurationChange(e.target.value)}
            />
          </label>
          <p className="field__hint">
            ยังไม่ต้องใส่มูลค่า/%Share ตอนนี้ (จะตั้งค่าเริ่มต้นเป็น 0%) — ไปกรอกทีหลังได้ที่ Tab "กิจกรรมงาน"
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
