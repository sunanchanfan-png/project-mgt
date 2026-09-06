// src/pages/Foreman/ForemanSafetyTab.jsx
// Tab "ความปลอดภัย" สำหรับ foreman บนมือถือ — เพิ่มหัวข้อความปลอดภัย (ข้อความ + แนบรูปได้ไม่เกิน 6 รูป)
// บันทึกลงตาราง report_items (category='safety') ตัวเดียวกับที่ Menu5 Tab2 (ความปลอดภัย) บนหน้าคอมพิวเตอร์
// ใช้อยู่แล้ว — ไม่มี endpoint backend ใหม่เลย ใช้ของเดิมทั้งหมด (GET/POST /reports/:id/items,
// POST/DELETE /reports/items/:itemId/photos) รายการที่เพิ่มจากมือถือจะไปโผล่ที่ Menu5 Tab2 ทันที เพราะ
// เป็นข้อมูลชุดเดียวกัน
//
// วิธีทำงาน (เหมือน MobileForemanTab.jsx เป๊ะ แค่เปลี่ยนจากกรอก % เป็นพิมพ์ข้อความ):
// - หน้าจอ 1 (รายการ): รายการความปลอดภัยที่เคยเพิ่มไว้แล้วในสัปดาห์นี้ + ปุ่ม "+ Safety" เพิ่มหัวข้อใหม่
// - หน้าจอ 2 (กรอก): เห็นรายการเดียวเต็มจอ พิมพ์ข้อความ + แนบรูปหน้างาน (≤6 รูป) + ปุ่มบันทึก
import { useEffect, useState } from 'react';
import client from '../../api/client';
import './ForemanSafetyTab.css';

const MAX_PHOTOS = 6;

export default function ForemanSafetyTab({ reportId }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openItem, setOpenItem] = useState(null); // null = หน้ารายการ, 'new' = เพิ่มใหม่, object = แก้ไขของเดิม

  function fetchItems() {
    if (!reportId) return;
    setLoading(true);
    client.get(`/reports/${reportId}/items`, { params: { category: 'safety' } })
      .then((res) => { setItems(res.data.items); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchItems(); }, [reportId]);

  function handleSaved() {
    setOpenItem(null);
    fetchItems();
  }

  if (openItem) {
    return (
      <ForemanSafetyEntry
        reportId={reportId}
        item={openItem === 'new' ? null : openItem}
        onBack={() => setOpenItem(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="fsafety">
      <button type="button" className="fsafety__add-btn" onClick={() => setOpenItem('new')}>
        + Safety
      </button>

      {loading && !items && <p className="fsafety__status">กำลังโหลดข้อมูล...</p>}
      {error && <p className="fsafety__status fsafety__status--warn">{error}</p>}
      {!loading && items && items.length === 0 && (
        <p className="fsafety__status">ยังไม่มีรายการความปลอดภัยในสัปดาห์นี้ — กด &quot;+ Safety&quot; เพื่อเพิ่ม</p>
      )}
      {items && items.map((item) => (
        <button key={item.id} type="button" className="fsafety__card" onClick={() => setOpenItem(item)}>
          <div className="fsafety__card-text">
            <p className="fsafety__card-title">{item.content}</p>
            <p className="fsafety__card-sub">🖼 {(item.photos || []).length} รูป</p>
          </div>
          <span className="fsafety__card-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

// ===== หน้าจอ 2: เพิ่ม/แก้ไขรายการความปลอดภัยเต็มจอ =====
function ForemanSafetyEntry({ reportId, item, onBack, onSaved }) {
  const isNew = !item;
  const [content, setContent] = useState(item?.content || '');
  // โหลดรูปเดิมมาก่อนเสมอถ้าเป็นการแก้ไขรายการที่มีอยู่แล้ว (กันบั๊กรูปหายแบบเดียวกับที่เจอใน
  // MobileForemanTab.jsx มาก่อน — ต้องพรีโหลดรูปเดิมเสมอ ไม่ใช่เริ่มจาก [] เปล่าๆ)
  const [photos, setPhotos] = useState(() => (item?.photos || []).map((p) => ({ tempId: `existing-${p.id}`, url: p.url, uploading: false })));
  const [saving, setSaving] = useState(false);

  async function handleAddPhoto(fileList) {
    const files = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อรายการ`);
      return;
    }
    const toUpload = files.slice(0, room);
    const placeholders = toUpload.map((f) => ({ tempId: `${Date.now()}-${Math.random()}`, name: f.name, url: null, uploading: true }));
    setPhotos((prev) => [...prev, ...placeholders]);

    for (let i = 0; i < toUpload.length; i += 1) {
      const file = toUpload[i];
      const tempId = placeholders[i].tempId;
      const formData = new FormData();
      formData.append('photo', file);
      try {
        // eslint-disable-next-line no-await-in-loop
        const uploadRes = await client.post('/photos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setPhotos((prev) => prev.map((p) => (p.tempId === tempId ? { tempId, url: uploadRes.data.url, uploading: false } : p)));
      } catch (err) {
        alert(err.response?.data?.error || `แนบรูป "${file.name}" ไม่สำเร็จ`);
        setPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
      }
    }
  }

  function removePhoto(tempId) {
    setPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  async function handleSave() {
    if (!content.trim()) {
      alert('กรุณากรอกรายการความปลอดภัย');
      return;
    }
    if (photos.some((p) => p.uploading)) {
      alert('กรุณารอให้อัปโหลดรูปเสร็จก่อนบันทึก');
      return;
    }
    setSaving(true);
    try {
      let itemId = item?.id;
      if (isNew) {
        // 1. สร้างรายการใหม่ก่อน (ยังไม่มีรูป)
        const res = await client.post(`/reports/${reportId}/items`, { category: 'safety', content: content.trim() });
        itemId = res.data.item.id;
      } else {
        // 1. อัปเดตข้อความของรายการเดิม
        await client.put(`/reports/items/${itemId}`, { category: 'safety', content: content.trim() });
        // 2. ลบรูปเดิมที่ผู้ใช้กดเอาออกไปแล้ว (รูปที่เคยมีอยู่ก่อน แต่ตอนนี้ไม่อยู่ใน photos แล้ว) — เทียบ
        // จาก tempId ที่ขึ้นต้นด้วย "existing-" เท่านั้น (รูปใหม่ที่เพิ่งอัปโหลดจะไม่ตรงกับ pattern นี้)
        const currentExistingTempIds = new Set(photos.filter((p) => p.tempId.startsWith('existing-')).map((p) => p.tempId));
        const originalPhotoTempIds = (item.photos || []).map((p) => `existing-${p.id}`);
        const removedPhotoTempIds = originalPhotoTempIds.filter((tid) => !currentExistingTempIds.has(tid));
        for (const tid of removedPhotoTempIds) {
          const photoId = tid.replace('existing-', '');
          // eslint-disable-next-line no-await-in-loop
          await client.delete(`/reports/items/photos/${photoId}`, { params: { category: 'safety' } });
        }
      }
      // 3. ผูกรูปใหม่ที่เพิ่งอัปโหลดเสร็จ (ที่ยังไม่เคยผูกกับรายการนี้ — คือรูปที่ไม่ได้ขึ้นต้นด้วย existing-)
      const newPhotos = photos.filter((p) => !p.tempId.startsWith('existing-') && p.url);
      for (const p of newPhotos) {
        // eslint-disable-next-line no-await-in-loop
        await client.post(`/reports/items/${itemId}/photos`, { url: p.url }, { params: { category: 'safety' } });
      }
      onSaved();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fsafety-entry">
      <button type="button" className="fsafety-entry__back" onClick={onBack}>‹ กลับ</button>
      <h2 className="fsafety-entry__title">{isNew ? 'เพิ่มรายการความปลอดภัย' : 'แก้ไขรายการความปลอดภัย'}</h2>

      <p className="fsafety-entry__label">รายละเอียด</p>
      <textarea
        className="fsafety-entry__textarea"
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="พิมพ์รายละเอียดความปลอดภัย..."
      />

      <label className="fsafety-entry__photo-btn">
        📷 แนบรูปหน้างาน ({photos.length}/{MAX_PHOTOS})
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={photos.length >= MAX_PHOTOS}
          onChange={(e) => { if (e.target.files.length > 0) handleAddPhoto(e.target.files); e.target.value = ''; }}
        />
      </label>

      {photos.length > 0 && (
        <div className="fsafety-entry__photo-grid">
          {photos.map((p) => (
            <div key={p.tempId} className="fsafety-entry__photo-chip">
              {p.uploading ? (
                <span className="fsafety-entry__photo-uploading">⏳</span>
              ) : (
                <img src={p.url} alt="" className="fsafety-entry__photo-thumb" />
              )}
              <button type="button" className="fsafety-entry__photo-remove" onClick={() => removePhoto(p.tempId)} disabled={p.uploading}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="fsafety-entry__save" onClick={handleSave} disabled={saving}>
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
