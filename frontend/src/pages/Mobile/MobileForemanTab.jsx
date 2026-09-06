// src/pages/Mobile/MobileForemanTab.jsx
// หน้าจอสำหรับ foreman กรอกความคืบหน้าผ่านมือถือ — ออกแบบให้เห็นทีละกิจกรรมงาน (JE) ไม่ต้องดึงทั้งตาราง
// 3 ระดับ (JG/JN/JE) มาแสดงเหมือนหน้าคอมพิวเตอร์ (WeeklyProgressTab.jsx) ตามที่ตกลงกันไว้
//
// วิธีทำงาน:
// - หน้าจอ 1 (รายการ): แบน JE จากต้นไม้ WBS ที่ backend คืนมาให้เป็น list เดียว โชว์แค่ %แผน/%ที่ทำแล้ว
// - หน้าจอ 2 (กรอก): เลือกงานใดงานหนึ่งแล้วเห็นแค่งานเดียวเต็มจอ มี slider ใหญ่ + ปุ่มแนบรูป + ปุ่มบันทึก
// - ใช้ API เดิมทุกตัว (GET /progress/weekly, POST /progress/entries) ไม่ต้องเพิ่ม endpoint ใหม่ฝั่ง backend
import { useEffect, useState } from 'react';
import client from '../../api/client';
import './MobileForemanTab.css';

const MAX_PHOTOS = 6;

function fmtPct(v) {
  return `${Number(v).toFixed(0)}%`;
}

// แบนต้นไม้ groups (JG > JN > JE) จาก /weekly ให้เหลือแค่ array ของ JE (Level3) เดียว — หน้าจอนี้ไม่สนใจ
// โครงสร้าง JG/JN เลย ผู้ใช้กรอกที่ระดับ JE เท่านั้นอยู่แล้วในระบบเดิมด้วยซ้ำ
function flattenActivities(groups) {
  const list = [];
  groups.forEach((g) => {
    g.items.forEach((it) => {
      it.activities.forEach((act) => {
        list.push({ ...act, group_name: `${g.code} ${g.name}`, item_name: `${it.code} ${it.name}` });
      });
    });
  });
  return list;
}

export default function MobileForemanTab({ projectId, week }) {
  const [activities, setActivities] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openActivity, setOpenActivity] = useState(null); // activity object ที่กำลังเปิดกรอกอยู่ (null = อยู่หน้ารายการ)

  function fetchData() {
    if (!projectId) return;
    setLoading(true);
    client.get('/progress/weekly', { params: { project_id: projectId, week } })
      .then((res) => { setActivities(flattenActivities(res.data.groups)); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [projectId, week]);

  function handleSaved() {
    setOpenActivity(null);
    fetchData();
  }

  if (openActivity) {
    return (
      <MobileActivityEntry
        activity={openActivity}
        onBack={() => setOpenActivity(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="mforeman">
      {loading && !activities && <p className="mforeman__status">กำลังโหลดข้อมูล...</p>}
      {error && <p className="mforeman__status mforeman__status--warn">{error}</p>}
      {!loading && activities && activities.length === 0 && (
        <p className="mforeman__status">ไม่มีกิจกรรมงานในสัปดาห์นี้</p>
      )}
      {activities && activities.map((act) => (
        <button
          key={act.id}
          type="button"
          className="mforeman__card"
          onClick={() => setOpenActivity(act)}
          disabled={act.also_in_this_week}
        >
          <div className="mforeman__card-text">
            <p className="mforeman__card-title">{act.code} {act.name}</p>
            <p className="mforeman__card-sub">
              แผน {fmtPct(act.plan_percent)} • ทำแล้ว {fmtPct(act.actual_percent)}
              {act.also_in_this_week && ' (แก้ไขได้ที่ Tab สัปดาห์นี้)'}
            </p>
          </div>
          <span className="mforeman__card-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

// ===== หน้าจอ 2: กรอกงานเดียวเต็มจอ =====
function MobileActivityEntry({ activity, onBack, onSaved }) {
  const [percent, setPercent] = useState(Math.round(activity.actual_percent));
  // โหลดรูปที่เคยบันทึกไว้แล้วจริงจาก activity.photos มาใส่ก่อนเสมอ (เหมือนที่ WeeklyProgressTab.jsx
  // ฝั่ง PC ทำอยู่แล้ว) — ก่อนหน้านี้เริ่มจาก [] เปล่าๆ เสมอ ทำให้ถ้าผู้ใช้แก้แค่ % แล้วกดบันทึกโดยไม่แนบรูป
  // ใหม่ ระบบจะส่ง photo_urls: [] ไปที่ backend ซึ่ง backend ลบรูปเก่าทิ้งก่อนเสมอ (ดู POST /progress/
  // entries) ผลคือรูปที่เคยแนบไว้ 4 รูปหายหมดโดยไม่ตั้งใจ — แก้โดยพรีโหลดรูปเดิมมาเป็นค่าเริ่มต้นแทน
  const [photos, setPhotos] = useState(() => (activity.photos || []).map((p) => ({ tempId: `existing-${p.id}`, url: p.url, uploading: false })));
  const [saving, setSaving] = useState(false);

  async function handleAddPhoto(fileList) {
    const files = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      alert(`แนบรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อครั้ง`);
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
    if (photos.some((p) => p.uploading)) {
      alert('กรุณารอให้อัปโหลดรูปเสร็จก่อนบันทึก');
      return;
    }
    setSaving(true);
    try {
      await client.post('/progress/entries', {
        wbs_level3_id: activity.id,
        actual_percent: percent,
        photo_urls: photos.map((p) => p.url).filter(Boolean),
      });
      onSaved();
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mforeman-entry">
      <button type="button" className="mforeman-entry__back" onClick={onBack}>‹ กลับ</button>
      <h2 className="mforeman-entry__title">{activity.code} {activity.name}</h2>
      <p className="mforeman-entry__breadcrumb">{activity.group_name} • {activity.item_name}</p>
      <p className="mforeman-entry__plan">แผนงาน {fmtPct(activity.plan_percent)}</p>

      <p className="mforeman-entry__label">% ที่ทำได้</p>
      <input
        type="range"
        min="0"
        max="100"
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
        className="mforeman-entry__slider"
      />
      <p className="mforeman-entry__percent">{percent}%</p>

      <label className="mforeman-entry__photo-btn">
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
        <div className="mforeman-entry__photo-grid">
          {photos.map((p) => (
            <div key={p.tempId} className="mforeman-entry__photo-chip">
              {p.uploading ? (
                <span className="mforeman-entry__photo-uploading">⏳</span>
              ) : (
                <img src={p.url} alt="" className="mforeman-entry__photo-thumb" />
              )}
              <button type="button" className="mforeman-entry__photo-remove" onClick={() => removePhoto(p.tempId)} disabled={p.uploading}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="mforeman-entry__save" onClick={handleSave} disabled={saving}>
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
