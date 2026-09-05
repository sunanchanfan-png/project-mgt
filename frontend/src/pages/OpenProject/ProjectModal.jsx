// src/pages/OpenProject/ProjectModal.jsx
import { useState } from 'react';
import client from '../../api/client';
import './ProjectModal.css';

const EMPTY_FORM = {
  name: '', client_name: '', description: '',
  contract_number: '', contract_start: '', contract_end: '', budget_total: '', duration_days: '',
  contact_person: '', contact_phone: '',
  supervisor_name: '', supervisor_phone: '', status: 'on',
};

// แปลงวันที่จาก backend (ISO string) เป็นรูปแบบ yyyy-mm-dd ที่ input[type=date] ต้องการ
function toDateInputValue(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
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

function addDaysToDate(startStr, days) {
  const start = toUTCDateLocal(startStr);
  if (!start || !days) return '';
  const result = new Date(start.getTime() + (parseInt(days, 10) - 1) * (1000 * 60 * 60 * 24));
  return result.toISOString().slice(0, 10);
}

// จัดรูปแบบตัวเลขให้มี comma คั่นหลักพัน เช่น "3290000" -> "3,290,000"
// เก็บค่าจริง (ไม่มี comma) ไว้ใน state เสมอ ใช้ฟังก์ชันนี้แค่ตอนแสดงผลในช่อง input
function formatNumberDisplay(raw) {
  if (!raw && raw !== 0) return '';
  const str = String(raw);
  const [intPart, decPart] = str.split('.');
  const intFormatted = intPart ? Number(intPart.replace(/^0+(?=\d)/, '')).toLocaleString('en-US') : '';
  return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
}

export default function ProjectModal({ project, onClose, onSaved }) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: project.name || '',
          client_name: project.client_name || '',
          description: project.description || '',
          contract_number: project.contract_number || '',
          contract_start: toDateInputValue(project.contract_start),
          contract_end: toDateInputValue(project.contract_end),
          budget_total: project.budget_total || '',
          duration_days: project.duration_days || '',
          contact_person: project.contact_person || '',
          contact_phone: project.contact_phone || '',
          supervisor_name: project.supervisor_name || '',
          supervisor_phone: project.supervisor_phone || '',
          status: project.status || 'on',
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // จัดการเฉพาะช่องมูลค่างาน: รับเฉพาะตัวเลข/จุดทศนิยม เก็บค่าดิบไม่มี comma
  // ไว้ใน state (ใช้ formatNumberDisplay ตอนแสดงผลใน input แทน)
  function handleBudgetChange(e) {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      update('budget_total', raw);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('กรุณากรอกชื่อโครงการ');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = isEdit
        ? await client.put(`/projects/${project.id}`, form)
        : await client.post('/projects', form);
      onSaved(res.data.project); // ปิด popup อัตโนมัติทำที่ parent (handleSaved)
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
          <h2>{isEdit ? 'แก้ไขข้อมูลโครงการ' : 'เพิ่มโครงการใหม่'}</h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <form onSubmit={handleSave}>
          {error && <div className="modal-box__error">{error}</div>}

          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">ชื่อโครงการ *</span>
              <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
            </label>
            <label className="field">
              <span className="field__label">ชื่อผู้ว่าจ้าง</span>
              <input value={form.client_name} onChange={(e) => update('client_name', e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">รายละเอียดงาน</span>
            <textarea
              rows={1}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </label>

          <div className="form-row form-row--3">
            <label className="field">
              <span className="field__label">เลขที่สัญญา</span>
              <input value={form.contract_number} onChange={(e) => update('contract_number', e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">มูลค่างาน (บาท)</span>
              <input
                type="text"
                inputMode="decimal"
                value={formatNumberDisplay(form.budget_total)}
                onChange={handleBudgetChange}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span className="field__label">ระยะเวลา (วัน)</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.duration_days}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!/^\d*$/.test(v)) return;
                  update('duration_days', v);
                  if (form.contract_start && v) {
                    update('contract_end', addDaysToDate(form.contract_start, v));
                  }
                }}
                onFocus={() => { if (parseFloat(form.duration_days) === 0) update('duration_days', ''); }}
                placeholder="0"
              />
            </label>
          </div>

          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">สัญญาเริ่มต้น</span>
              <input
                type="date"
                value={form.contract_start}
                onChange={(e) => {
                  const v = e.target.value;
                  update('contract_start', v);
                  if (v && form.duration_days) {
                    update('contract_end', addDaysToDate(v, form.duration_days));
                  } else if (v && form.contract_end) {
                    update('duration_days', String(countDaysInclusive(v, form.contract_end)));
                  }
                }}
              />
            </label>
            <label className="field">
              <span className="field__label">สัญญาสิ้นสุด</span>
              <input
                type="date"
                value={form.contract_end}
                onChange={(e) => {
                  const v = e.target.value;
                  update('contract_end', v);
                  if (form.contract_start && v) {
                    update('duration_days', String(countDaysInclusive(form.contract_start, v)));
                  }
                }}
              />
            </label>
          </div>

          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">ผู้ติดต่อ</span>
              <input value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">เบอร์โทร</span>
              <input value={form.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} />
            </label>
          </div>

          <div className="form-row form-row--3">
            <label className="field">
              <span className="field__label">ผู้ควบคุมงาน</span>
              <input value={form.supervisor_name} onChange={(e) => update('supervisor_name', e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">เบอร์โทร</span>
              <input value={form.supervisor_phone} onChange={(e) => update('supervisor_phone', e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">สถานะ</span>
              <select value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="on">On</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          </div>

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
