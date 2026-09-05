// src/pages/ProjectData/DependencyModal.jsx
import { useState } from 'react';
import './WbsLevel1Modal.css';
import './DependencyModal.css';

const TYPE_OPTIONS = [
  { value: 'FS', label: 'FS — เสร็จ แล้วค่อยเริ่ม (ค่าเริ่มต้น)' },
  { value: 'SS', label: 'SS — เริ่มพร้อมกัน' },
  { value: 'FF', label: 'FF — เสร็จพร้อมกัน' },
  { value: 'SF', label: 'SF — เริ่ม แล้วอีกฝั่งค่อยเสร็จ' },
];

/**
 * Popup "เชื่อมโยงวันที่" ของกิจกรรมงาน (JE) — คล้าย Task Dependency ใน MS Project
 * ทำงานแบบ "live preview" ล้วนๆ — การเพิ่ม/ลบลิงก์ที่นี่แค่พักไว้เป็น op ที่ชั้นบน (GanttView)
 * ยังไม่ยิงขึ้นเซิร์ฟเวอร์จริง จนกว่าจะกด "✓ บันทึก" ที่แถบเครื่องมือด้านบนของ Gantt
 * ถ้ากด "ยกเลิก" หรือออกจาก Tab โดยไม่บันทึก การเชื่อมโยงที่ทำในนี้จะหายไปกลับเป็นค่าเดิมทั้งหมด
 */
export default function DependencyModal({ activity, allActivities, links, onAdd, onEdit, onRemove, onClose }) {
  const [predecessorId, setPredecessorId] = useState('');
  const [depType, setDepType] = useState('FS');
  const [lagDays, setLagDays] = useState('0');
  const [editingKey, setEditingKey] = useState(null); // key ของแถวที่กำลังแก้ไข inline อยู่ (null = ไม่มี)
  const [editType, setEditType] = useState('FS');
  const [editLag, setEditLag] = useState('0');

  // ตัดตัวเองและตัวที่เชื่อมโยงไว้แล้ว (รวมที่ยังไม่บันทึกด้วย) ออกจาก dropdown เลือกต้นทาง
  const options = allActivities.filter(
    (a) => a.id !== activity.id && !links.some((l) => l.predecessor_id === a.id)
  );

  function handleAddClick() {
    if (!predecessorId) return;
    onAdd(Number(predecessorId), depType, parseInt(lagDays, 10) || 0);
    // ปิด popup อัตโนมัติทันทีหลังกดเพิ่มลิงก์ (การเชื่อมโยงถูกพักเป็น live preview ไว้แล้ว
    // ยังไม่ได้บันทึกจริงจนกว่าจะกด "✓ บันทึก" ที่แถบด้านบนของ Gantt)
    onClose();
  }

  function startEdit(l) {
    setEditingKey(l.key);
    setEditType(l.dependency_type);
    setEditLag(String(l.lag_days));
  }

  function confirmEdit(l) {
    onEdit(l, editType, parseInt(editLag, 10) || 0);
    setEditingKey(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box dep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-box__header">
          <h2>เชื่อมโยงวันที่: <span className="mono">{activity.code}</span></h2>
          <button className="modal-box__close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <p className="field__hint dep-modal__intro">
          {activity.name} — กำหนดให้วันที่ของกิจกรรมงานนี้อ้างอิงจากกิจกรรมงานอื่น เมื่อต้นทางขยับ
          วันที่ของกิจกรรมงานนี้จะคำนวณตามให้แบบ live ทันที — แต่ยัง<strong>ไม่บันทึกจริง</strong>จนกว่าจะกด
          "✓ บันทึก" ที่แถบด้านบนของ Gantt (กด "ยกเลิก" หรือออกจาก Tab โดยไม่บันทึก จะกลับเป็นค่าเดิมทั้งหมด)
        </p>

        {links.length > 0 ? (
          <table className="dep-modal__table">
            <thead>
              <tr>
                <th>ต้นทาง (Predecessor)</th>
                <th>ความสัมพันธ์</th>
                <th>Lag</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const isEditing = editingKey === l.key;
                return (
                  <tr key={l.key} className={l.isPending ? 'dep-modal__row--pending' : ''}>
                    <td>
                      <span className="mono">{l.predecessor_code}</span> {l.predecessor_name}
                      {l.isPending && <span className="dep-modal__pending-tag">รอบันทึก</span>}
                    </td>
                    {isEditing ? (
                      <>
                        <td>
                          <select
                            className="dep-modal__inline-select"
                            value={editType}
                            onChange={(e) => setEditType(e.target.value)}
                          >
                            {TYPE_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>{t.value}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="dep-modal__inline-input"
                            value={editLag}
                            onChange={(e) => setEditLag(e.target.value)}
                          />
                        </td>
                        <td className="dep-modal__row-actions">
                          <button
                            type="button"
                            className="dep-modal__confirm"
                            onClick={() => confirmEdit(l)}
                            aria-label="ยืนยันการแก้ไข"
                            title="ยืนยัน"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="dep-modal__del"
                            onClick={() => setEditingKey(null)}
                            aria-label="ยกเลิกการแก้ไข"
                            title="ยกเลิก"
                          >
                            ✕
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><span className="dep-modal__type-badge">{l.dependency_type}</span></td>
                        <td>{l.lag_days > 0 ? `+${l.lag_days}` : l.lag_days} วัน</td>
                        <td className="dep-modal__row-actions">
                          <button
                            type="button"
                            className="dep-modal__edit"
                            onClick={() => startEdit(l)}
                            aria-label="แก้ไขลิงก์นี้"
                            title="แก้ไขความสัมพันธ์/Lag"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="dep-modal__del"
                            onClick={() => onRemove(l)}
                            aria-label="ลบลิงก์นี้"
                            title="ลบ"
                          >
                            ✕
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="dep-modal__empty">ยังไม่มีการเชื่อมโยง — เพิ่มได้ด้านล่าง</p>
        )}

        <div className="dep-modal__add">
          <label className="field">
            <span className="field__label">เชื่อมโยงจากกิจกรรมงานต้นทาง</span>
            <select value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
              <option value="">-- เลือกกิจกรรมงาน --</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
              ))}
            </select>
          </label>

          <div className="form-row form-row--2">
            <label className="field">
              <span className="field__label">ความสัมพันธ์</span>
              <select value={depType} onChange={(e) => setDepType(e.target.value)}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Lag/Lead (+/- วัน)</span>
              <input
                type="number"
                value={lagDays}
                onChange={(e) => setLagDays(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <button
            type="button"
            className="btn-primary btn-primary--sm"
            onClick={handleAddClick}
            disabled={!predecessorId}
          >
            + เพิ่มลิงก์ (live preview)
          </button>
        </div>

        <div className="modal-box__footer">
          <button type="button" className="btn-secondary" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
