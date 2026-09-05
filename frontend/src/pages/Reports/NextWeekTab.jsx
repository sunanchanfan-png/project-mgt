// src/pages/Reports/NextWeekTab.jsx
// Tab "งานสัปดาห์หน้า" — จัดกลุ่มรายการตาม WBS Level1 จริง (ดึงชื่อกลุ่มงานจาก Menu2 มาอัตโนมัติ ผู้ใช้
// พิมพ์แค่รายละเอียด + % เป้าหมาย) ตามแบบในเอกสารตัวอย่าง (Construction Warehouse / Factory / ... แต่ละ
// กลุ่มมี bullet ย่อยหลายรายการ)
import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function NextWeekTab({ reportId, level1List }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [newLevel1Id, setNewLevel1Id] = useState(level1List[0]?.id || '');
  const [newContent, setNewContent] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editLevel1Id, setEditLevel1Id] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTarget, setEditTarget] = useState('');

  function fetchItems() {
    setLoading(true);
    client.get(`/reports/${reportId}/next-week`)
      .then((res) => { setItems(res.data.items); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'ดึงรายการไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchItems(); }, [reportId]);

  // เลือกกลุ่มงานแรกให้อัตโนมัติทันทีที่ level1List โหลดมาถึง (เผื่อตอน mount ครั้งแรก list ยังว่างอยู่)
  useEffect(() => {
    if (!newLevel1Id && level1List.length > 0) setNewLevel1Id(level1List[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level1List]);

  async function handleAdd() {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await client.post(`/reports/${reportId}/next-week`, {
        wbs_level1_id: newLevel1Id || null,
        content: newContent.trim(),
        target_percent: newTarget === '' ? null : parseFloat(newTarget),
      });
      setNewContent('');
      setNewTarget('');
      fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'เพิ่มรายการไม่สำเร็จ');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditLevel1Id(item.wbs_level1_id ? String(item.wbs_level1_id) : '');
    setEditContent(item.content);
    setEditTarget(item.target_percent === null || item.target_percent === undefined ? '' : String(item.target_percent));
  }

  async function handleSaveEdit(itemId) {
    if (!editContent.trim()) return;
    try {
      await client.put(`/reports/next-week/${itemId}`, {
        wbs_level1_id: editLevel1Id || null,
        content: editContent.trim(),
        target_percent: editTarget === '' ? null : parseFloat(editTarget),
      });
      setEditingId(null);
      fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'แก้ไขไม่สำเร็จ');
    }
  }

  async function handleDelete(itemId) {
    if (!window.confirm('ยืนยันลบรายการนี้?')) return;
    try {
      await client.delete(`/reports/next-week/${itemId}`);
      fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  // จัดกลุ่มรายการตาม wbs_level1_id (backend เรียงตาม level1.code มาให้แล้ว รักษาลำดับนั้นไว้เป๊ะ ไม่ sort ซ้ำ)
  // สำคัญ: wbs_level1_id อาจมาเป็น number (จาก field เดิม) หรือ string (จาก <select> value ตอนเพิ่ง add/edit
  // ก่อน refetch) ต้อง String() ให้เหมือนกันเสมอ ไม่งั้น Map จะมองเป็นคนละ key กัน ทำให้แตกกลุ่มผิดๆ
  const groups = [];
  const groupIndexByKey = new Map();
  (items || []).forEach((item) => {
    const key = item.wbs_level1_id ? String(item.wbs_level1_id) : 'none';
    if (!groupIndexByKey.has(key)) {
      groupIndexByKey.set(key, groups.length);
      groups.push({
        key,
        label: item.wbs_level1_id ? `${item.level1_code} - ${item.level1_name}` : 'ทั่วไป (ไม่ระบุกลุ่มงาน)',
        items: [],
      });
    }
    groups[groupIndexByKey.get(key)].items.push(item);
  });

  return (
    <div className="progress-table-wrap">
      <div className="pdata-toolbar" style={{ marginTop: 0 }}>
        <p className="progress-table__week-label" style={{ margin: 0 }}>งานสัปดาห์หน้า</p>
      </div>

      <div className="next-week-add-form">
        <select value={newLevel1Id} onChange={(e) => setNewLevel1Id(e.target.value)} className="next-week-select">
          {level1List.map((g) => (
            <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
          ))}
        </select>
        <input
          type="text"
          className="reports-item-input next-week-content-input"
          placeholder="รายละเอียดงานที่จะทำต่อ..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <input
          type="number"
          className="reports-item-input next-week-target-input"
          placeholder="% เป้าหมาย"
          value={newTarget}
          onChange={(e) => setNewTarget(e.target.value)}
          min="0"
          max="100"
        />
        <button className="btn-primary btn-primary--sm" onClick={handleAdd} disabled={adding || !newContent.trim()}>
          + เพิ่ม
        </button>
      </div>

      {loading && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}
      {!loading && items && items.length === 0 && <p className="pdata-status">ยังไม่มีรายการ</p>}

      {!loading && groups.map((group) => (
        <div key={group.key} className="next-week-group">
          <h4 className="next-week-group__title">{group.label}</h4>
          <ul className="next-week-group__list">
            {group.items.map((item) => (
              <li key={item.id} className="next-week-group__item">
                {editingId === item.id ? (
                  <div className="next-week-edit-row">
                    <select value={editLevel1Id} onChange={(e) => setEditLevel1Id(e.target.value)} className="next-week-select">
                      {level1List.map((g) => (
                        <option key={g.id} value={g.id}>{g.code} - {g.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="reports-item-input next-week-content-input"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      autoFocus
                    />
                    <input
                      type="number"
                      className="reports-item-input next-week-target-input"
                      value={editTarget}
                      onChange={(e) => setEditTarget(e.target.value)}
                      min="0"
                      max="100"
                    />
                    <button className="link-btn" onClick={() => handleSaveEdit(item.id)}>บันทึก</button>
                    <button className="link-btn link-btn--danger" onClick={() => setEditingId(null)}>ยกเลิก</button>
                  </div>
                ) : (
                  <>
                    <span className="next-week-group__bullet">✓</span>
                    <span className="next-week-group__content">
                      {item.content}
                      {item.target_percent !== null && item.target_percent !== undefined && (
                        <strong> {item.target_percent}%</strong>
                      )}
                    </span>
                    <span className="perm-table__actions next-week-group__actions">
                      <button className="link-btn" onClick={() => startEdit(item)}>แก้ไข</button>
                      <button className="link-btn link-btn--danger" onClick={() => handleDelete(item.id)}>ลบ</button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
