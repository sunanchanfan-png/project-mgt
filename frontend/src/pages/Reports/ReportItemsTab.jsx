// src/pages/Reports/ReportItemsTab.jsx
// ใช้ร่วมกัน 5 Tab ที่มีรูปแบบเหมือนกันทุกอัน: คุณภาพงาน, ความปลอดภัย, ปัญหาอุปสรรค, งานเพิ่มลด, เรื่องที่ค้าง
// ลำดับ + รายการ (พิมพ์มือ) + จัดการ (แก้ไข/ลบ) ตามแบบในภาพตัวอย่าง — 2 Tab แรก (คุณภาพงาน/ความปลอดภัย)
// เปิด allowPhotos ให้แนบรูปถ่ายต่อรายการได้ด้วย (ไม่เกิน 4 รูป/รายการ) ถ้าไม่แนบก็ไม่มีข้อมูล ไม่โชว์อะไร
// ในเล่มรายงาน (ดู CompiledReportTab.jsx + backend routes/reports.js GET /export)
//
// รูปแบบการจัดการรูป: แบบเดียวกับ Menu 3 Tap 1 (งานสัปดาห์นี้)
// - อ่านอย่างเดียว: แสดงปุ่ม "🖼 N รูป" คลิก popup
// - แก้ไข: แสดง thumbnail + ปุ่ม ✕ ลบ (draft) + ปุ่ม 📷 เพิ่ม (ยังไม่ save จนกว่ากด "บันทึก")
// - บันทึก: อัปโหลด/ลบรูปพร้อมกับข้อความ
// - ยกเลิก: draft รูปหายไป
import { useEffect, useState } from 'react';
import client from '../../api/client';

const MAX_PHOTOS = 6;

export default function ReportItemsTab({ reportId, category, tabLabel, allowPhotos = false }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  // draftPhotos: { [itemId]: [ { tempId, id, url, existing, isNew, deleted, file, uploading } ] }
  const [draftPhotos, setDraftPhotos] = useState({});
  // เปิด popup ดูรูปทั้งหมดที่แนบไว้แล้ว (ไม่ได้อยู่ในโหมดแก้ไข)
  const [viewingPhotosItem, setViewingPhotosItem] = useState(null);

  function fetchItems() {
    setLoading(true);
    return client.get(`/reports/${reportId}/items`, { params: { category } })
      .then((res) => { setItems(res.data.items); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'ดึงรายการไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchItems(); }, [reportId, category]);

  async function handleAdd() {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await client.post(`/reports/${reportId}/items`, { category, content: newContent.trim() });
      setNewContent('');
      await fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'เพิ่มรายการไม่สำเร็จ');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditValue(item.content);
    // โหลดรูปที่มีอยู่แล้วเข้า draft (existing)
    const existingPhotos = (item.photos || []).map((p) => ({
      tempId: `existing-${p.id}`,
      id: p.id,
      url: p.url,
      existing: true,
      isNew: false,
      deleted: false,
      file: null,
      uploading: false,
    }));
    setDraftPhotos((prev) => ({ ...prev, [item.id]: existingPhotos }));
  }

  async function handleSaveEdit(itemId) {
    if (!editValue.trim()) return;
    try {
      // 1. อัปเดตข้อความ
      await client.put(`/reports/items/${itemId}`, { category, content: editValue.trim() });

      // 2. จัดการรูป (draft)
      const drafts = draftPhotos[itemId] || [];
      // 2.1 ลบรูปที่ถูกลบ (existing + deleted)
      const toDelete = drafts.filter((p) => p.existing && p.deleted);
      for (const p of toDelete) {
        // eslint-disable-next-line no-await-in-loop
        await client.delete(`/reports/items/photos/${p.id}`, { params: { category } });
      }
      // 2.2 อัปโหลดรูปใหม่ (isNew และไม่ถูกลบ)
      const toUpload = drafts.filter((p) => p.isNew && !p.deleted);
      for (const p of toUpload) {
        const formData = new FormData();
        formData.append('photo', p.file);
        // eslint-disable-next-line no-await-in-loop
        const uploadRes = await client.post('/photos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        // eslint-disable-next-line no-await-in-loop
        await client.post(
          `/reports/items/${itemId}/photos`,
          { url: uploadRes.data.url, public_id: uploadRes.data.public_id },
          { params: { category } }
        );
      }

      // 3. เคลียร์ draft และ exit edit mode
      setEditingId(null);
      setDraftPhotos((prev) => ({ ...prev, [itemId]: [] }));
      await fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue('');
    // ลบ draft ของ item ที่กำลังแก้ไข
    if (editingId) {
      setDraftPhotos((prev) => ({ ...prev, [editingId]: [] }));
    }
  }

  async function handleDelete(itemId) {
    if (!window.confirm('ยืนยันลบรายการนี้?')) return;
    try {
      await client.delete(`/reports/items/${itemId}`, { params: { category } });
      await fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  // เพิ่มรูปใหม่ลง draft (ยังไม่อัปโหลด)
  function addPhotos(itemId, fileList) {
    const files = Array.from(fileList);
    const current = draftPhotos[itemId] || [];
    // นับจำนวนรูปที่ยังไม่ถูกลบ (existing + isNew)
    const activeCount = current.filter((p) => !p.deleted).length;
    const room = MAX_PHOTOS - activeCount;
    if (room <= 0) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อรายการ`);
      return;
    }
    const toAdd = files.slice(0, room);
    if (files.length > room) {
      alert(`เพิ่มได้อีก ${room} รูปเท่านั้น`);
    }
    const newPhotos = toAdd.map((f, idx) => ({
      tempId: `new-${Date.now()}-${idx}`,
      file: f,
      url: URL.createObjectURL(f),
      isNew: true,
      existing: false,
      deleted: false,
      uploading: false,
    }));
    setDraftPhotos((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), ...newPhotos],
    }));
  }

  // ลบรูปออกจาก draft (mark deleted)
  function removePhoto(itemId, photo) {
    setDraftPhotos((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((p) =>
        p.tempId === photo.tempId ? { ...p, deleted: true } : p
      ),
    }));
  }

  // เปิด popup ดูรูป
  function openViewPhotos(item) {
    setViewingPhotosItem({ content: item.content, photos: item.photos || [] });
  }

  return (
    <div className="progress-table-wrap">
      <div className="pdata-toolbar" style={{ marginTop: 0 }}>
        <p className="progress-table__week-label" style={{ margin: 0 }}>{tabLabel}</p>
        <div className="pdata-toolbar__actions">
          <input
            type="text"
            className="reports-item-input"
            placeholder="พิมพ์รายการใหม่..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button className="btn-primary btn-primary--sm" onClick={handleAdd} disabled={adding || !newContent.trim()}>
            + เพิ่ม
          </button>
        </div>
      </div>

      {loading && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}
      {!loading && items && items.length === 0 && <p className="pdata-status">ยังไม่มีรายการ</p>}

      {!loading && items && items.length > 0 && (
        <div className="reports-table-scroll">
        <table className="reports-items-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>ลำดับ</th>
              <th>รายการ</th>
              {allowPhotos && <th style={{ width: 160 }}>รูปถ่าย</th>}
              <th style={{ width: 140 }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const isEditing = editingId === item.id;
              const draft = draftPhotos[item.id] || [];
              // รูปที่แสดงในโหมดแก้ไข (ไม่ถูกลบ)
              const activeDraftPhotos = draft.filter((p) => !p.deleted);
              const totalExisting = (item.photos || []).length;
              const draftExistingCount = draft.filter((p) => p.existing && !p.deleted).length;
              const draftNewCount = draft.filter((p) => p.isNew && !p.deleted).length;
              const totalDraftCount = draftExistingCount + draftNewCount;

              return (
                <tr key={item.id}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        className="reports-item-input reports-item-input--full"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(item.id); }}
                        autoFocus
                      />
                    ) : item.content}
                  </td>
                  {allowPhotos && (
                    <td>
                      <div className="progress-table__photo-cell">
                        {isEditing ? (
                          <>
                            {/* ปุ่มเพิ่มรูป */}
                            {activeDraftPhotos.length < MAX_PHOTOS && (
                              <label className="progress-table__photo-btn">
                                📷
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  hidden
                                  onChange={(e) => addPhotos(item.id, e.target.files)}
                                />
                              </label>
                            )}
                            {/* แสดง thumbnail ของ draft ที่ไม่ถูกลบ */}
                            {activeDraftPhotos.map((p) => (
                              <span key={p.tempId} className="progress-table__photo-chip">
                                {p.uploading ? (
                                  <span className="progress-table__photo-uploading">⏳ กำลังอัปโหลด...</span>
                                ) : (
                                  <img src={p.url} alt="รูป" className="progress-table__photo-thumb" />
                                )}
                                <button
                                  type="button"
                                  onClick={() => removePhoto(item.id, p)}
                                  disabled={p.uploading}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                            <span className="progress-table__photo-count">{totalDraftCount}/{MAX_PHOTOS}</span>
                          </>
                        ) : (
                          <>
                            {totalExisting > 0 ? (
                              <button
                                type="button"
                                className="progress-table__photo-view-btn"
                                onClick={() => openViewPhotos(item)}
                              >
                                🖼 {totalExisting} รูป
                              </button>
                            ) : (
                              <span className="progress-table__photo-empty">-</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                  <td>
                    <div className="perm-table__actions">
                      {isEditing ? (
                        <>
                          <button className="link-btn" onClick={() => handleSaveEdit(item.id)}>บันทึก</button>
                          <button className="link-btn link-btn--danger" onClick={cancelEdit}>ยกเลิก</button>
                        </>
                      ) : (
                        <>
                          <button className="link-btn" onClick={() => startEdit(item)}>แก้ไข</button>
                          <button className="link-btn link-btn--danger" onClick={() => handleDelete(item.id)}>ลบ</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* ===== Popup แสดงรูปถ่าย ===== */}
      {viewingPhotosItem && (
        <div className="reports-photo-modal-backdrop" onClick={() => setViewingPhotosItem(null)}>
          <div className="reports-photo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reports-photo-modal__toolbar">
              <button className="reports-photo-modal__close" onClick={() => setViewingPhotosItem(null)} aria-label="ปิด">✕</button>
            </div>
            <h3 className="reports-photo-modal__title">รูปถ่าย — {viewingPhotosItem.content}</h3>
            <div className="view-photos-grid">
              {viewingPhotosItem.photos.map((p) => (
                <img key={p.id} src={p.url} alt="" className="view-photos-grid__img" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}