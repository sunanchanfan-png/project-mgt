// src/pages/Reports/PhotosTab.jsx
// Tab "รูปถ่าย" — ศูนย์รวมรูปทั้งหมดที่จะไปอยู่ในเล่มรายงานฉบับนี้ แบ่งเป็น 2 คอลัมน์ (เดิม 3 คอลัมน์
// มี "คุณภาพงาน" ด้วย แต่ตัด Tab คุณภาพงานออกจากทั้งระบบแล้วตามที่ตกลงกันไว้):
//   1) กิจกรรมงาน (JE) — รูปจาก Menu3 ตอนกรอกความคืบหน้า ต้อง "เลือก" ก่อนถึงจะเข้าเล่มรายงาน (คลิกที่รูป)
//      เพราะ Menu3 มีรูปสะสมได้หลายวัน/สัปดาห์ ต้องมาเลือกว่าจะเอารูปไหนเข้าเล่ม
//   2) ความปลอดภัย — รูปที่แนบไว้ที่ Tab ความปลอดภัยแล้ว มีระบบเลือก/ยกเลิกเหมือน JE (คลิกที่รูป)
import { useEffect, useState } from 'react';
import client from '../../api/client';

const MAX_PHOTOS = 6;

export default function PhotosTab({ reportId }) {
  const [groups, setGroups] = useState(null);
  const [safetyItems, setSafetyItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyPhotoId, setBusyPhotoId] = useState(null); // กันกดรัว/กดซ้ำระหว่างรอ request ค้าง
  // ตัวรูปที่กำลังลาก (photo_id) — ใช้ทำ highlight ตอนลากผ่าน + ใช้ตอน drop เพื่อรู้ว่าลากตัวไหนมาวาง
  const [draggingPhotoId, setDraggingPhotoId] = useState(null);

  function fetchAll() {
    setLoading(true);
    Promise.all([
      client.get(`/reports/${reportId}/photos`),
      client.get(`/reports/${reportId}/items`, { params: { category: 'safety' } }),
    ])
      .then(([photosRes, safetyRes]) => {
        setGroups(photosRes.data.groups);
        setSafetyItems(safetyRes.data.items);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'ดึงรูปถ่ายไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, [reportId]);

  // คอลัมน์ 1 (JE)
  async function toggleSelectJE(group, photo) {
    setBusyPhotoId(photo.photo_id);
    try {
      if (photo.selection_id) {
        await client.delete(`/reports/photos/select/${photo.selection_id}`);
      } else {
        const selectedCount = group.photos.filter((p) => p.selection_id).length;
        if (selectedCount >= MAX_PHOTOS) {
          alert(`เลือกรูปได้ไม่เกิน ${MAX_PHOTOS} รูปต่อกิจกรรมงาน กรุณายกเลิกรูปอื่นก่อน`);
          return;
        }
        await client.post(`/reports/${reportId}/photos/select`, {
          wbs_level3_id: group.wbs_level3_id,
          photo_id: photo.photo_id,
        });
      }
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusyPhotoId(null);
    }
  }

  // ลบรูปทิ้งถาวร (ต่างจาก toggleSelectJE ที่แค่เลือก/ยกเลิกเข้ารายงานฉบับนี้) — รูปนี้เก็บอยู่แหล่งเดียวกับ
  // Menu3 (Tab งานสัปดาห์นี้) ลบที่นี่จะหายไปจาก Menu3 ด้วยทันที ไม่ได้แยกชุดกัน จึงมีแค่ปุ่มลบเดียวพอ
  async function deletePhotoJE(photo) {
    if (!window.confirm('ยืนยันลบรูปนี้ทิ้งถาวร? (จะหายไปจากทุกที่ รวมถึง Tab งานสัปดาห์นี้ที่ Menu 3 ด้วย)')) return;
    setBusyPhotoId(photo.photo_id);
    try {
      await client.delete(`/reports/photos/${photo.photo_id}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบรูปไม่สำเร็จ');
    } finally {
      setBusyPhotoId(null);
    }
  }

  // ===== ลากรูป (drag & drop) สลับลำดับได้อิสระ — ใช้ HTML5 drag & drop มาตรฐาน ทำงานได้เฉพาะเมาส์
  // (คลิกค้างแล้วลาก) บนคอมพิวเตอร์เท่านั้น — มือถือ/แท็บเล็ตยังไม่มีทางสลับลำดับได้ในตอนนี้ (ตัดปุ่มลูกศร
  // ◀▶ ที่เคยเป็นทางเลือกสำรองออกไปแล้วตามที่ตกลงกันไว้) ใช้ได้เฉพาะรูปที่ "เลือกแล้ว" เท่านั้น ลากข้าม
  // กิจกรรมงานอื่นไม่ได้ (ไม่มีความหมาย เพราะลำดับผูกกับกิจกรรมงานเดียวเท่านั้น)
  function handleDragStart(photo) {
    setDraggingPhotoId(photo.photo_id);
  }

  function handleDragEnd() {
    setDraggingPhotoId(null);
  }

  async function handleDropJE(group, targetPhoto) {
    const draggedId = draggingPhotoId;
    setDraggingPhotoId(null);
    if (!draggedId || draggedId === targetPhoto.photo_id) return;

    const selectedPhotos = group.photos.filter((p) => p.selection_id);
    const draggedPhoto = selectedPhotos.find((p) => p.photo_id === draggedId);
    // ลากมาจากรูปที่ "ยังไม่ได้เลือก" หรือวางบนรูปที่ "ยังไม่ได้เลือก" ก็ไม่ต้องทำอะไร (ไม่มีลำดับให้จัด)
    if (!draggedPhoto || !targetPhoto.selection_id) return;

    // จัดลำดับใหม่: เอา draggedPhoto ออกจากตำแหน่งเดิม แล้วแทรกไว้ตรงตำแหน่งของ targetPhoto แทน
    const withoutDragged = selectedPhotos.filter((p) => p.photo_id !== draggedId);
    const targetIndex = withoutDragged.findIndex((p) => p.photo_id === targetPhoto.photo_id);
    withoutDragged.splice(targetIndex, 0, draggedPhoto);
    const newSelectionIds = withoutDragged.map((p) => p.selection_id);

    setBusyPhotoId(draggedId);
    try {
      await client.put(`/reports/${reportId}/photos/reorder`, {
        wbs_level3_id: group.wbs_level3_id,
        selection_ids: newSelectionIds,
      });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'จัดลำดับไม่สำเร็จ');
    } finally {
      setBusyPhotoId(null);
    }
  }

  // คอลัมน์ 2 (ความปลอดภัย) — คลิกรูปเพื่อเลือก/ยกเลิก เข้าเล่มรายงาน
  async function toggleSelectItemPhoto(category, photo) {
    setBusyPhotoId(photo.id);
    try {
      const newSelected = photo.selected !== false ? false : true;
      await client.put(`/reports/items/photos/${photo.id}/select`, { selected: newSelected }, { params: { category } });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusyPhotoId(null);
    }
  }

  // ลบรูปความปลอดภัยทิ้งถาวร — endpoint นี้มีอยู่แล้วในระบบ (ใช้จาก Tab ความปลอดภัยเดิม) แค่เพิ่มปุ่มเรียก
  // ใช้จากตรงนี้ด้วยเพื่อความสะดวก (ลบรูปได้จากศูนย์รวมรูปถ่ายนี้จุดเดียว ไม่ต้องย้อนกลับไป Tab ความปลอดภัย)
  async function deletePhotoItem(category, photo) {
    if (!window.confirm('ยืนยันลบรูปนี้ทิ้งถาวร?')) return;
    setBusyPhotoId(photo.id);
    try {
      await client.delete(`/reports/items/photos/${photo.id}`, { params: { category } });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบรูปไม่สำเร็จ');
    } finally {
      setBusyPhotoId(null);
    }
  }

  // ===== Helper: จัดกลุ่มรูปจาก items (ความปลอดภัย) แยกตาม item_id =====
  function groupPhotosByItem(items) {
    const groups = [];
    (items || []).forEach((item) => {
      const photos = (item.photos || []).map((photo) => ({
        ...photo,
        selected: photo.selected !== undefined ? photo.selected : true,
      }));
      if (photos.length === 0) return;
      groups.push({
        item_id: item.id,
        item_content: item.content,
        photos,
      });
    });
    return groups;
  }

  return (
    <div className="progress-table-wrap">
      <div className="pdata-toolbar" style={{ marginTop: 0 }}>
        <p className="progress-table__week-label" style={{ margin: 0 }}>
          รูปถ่าย — ภาพรวมทั้งหมดที่จะเข้าเล่มรายงานฉบับนี้
        </p>
      </div>

      {loading && !groups && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}

      {!loading && groups && (
        <div className="photos-2col">
          {/* ===== คอลัมน์ 1: กิจกรรมงาน (JE) — คลิกเลือก/ยกเลิก ===== */}
          <div className="photos-3col__col">
            <h4 className="photos-3col__title">กิจกรรมงาน (JE) <span className="photos-3col__hint">คลิกรูปเพื่อเลือก/ยกเลิก</span></h4>
            {groups.length === 0 && (
              <p className="pdata-status">ยังไม่มีรูปถ่ายในช่วงสัปดาห์นี้ — ไปแนบรูปตอนกรอกความคืบหน้าที่ Menu3 ก่อน</p>
            )}
            {groups.map((group) => {
              const selectedCount = group.photos.filter((p) => p.selection_id).length;
              return (
                <div key={group.wbs_level3_id} className="photos-group">
                  <h5 className="photos-group__title">
                    {group.activity_code} - {group.activity_name}
                    <span className="photos-group__count"> ({selectedCount}/{MAX_PHOTOS})</span>
                  </h5>
                  <div className="photos-group__grid photos-group__grid--compact">
                    {group.photos.map((photo) => {
                      const isSelected = Boolean(photo.selection_id);
                      const isBusy = busyPhotoId === photo.photo_id;
                      const isDragging = draggingPhotoId === photo.photo_id;
                      return (
                        <div
                          key={photo.photo_id}
                          className={`photos-thumb-wrap ${isDragging ? 'photos-thumb-wrap--dragging' : ''}`}
                          draggable={isSelected}
                          onDragStart={() => handleDragStart(photo)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => { if (isSelected) e.preventDefault(); }}
                          onDrop={(e) => { e.preventDefault(); handleDropJE(group, photo); }}
                        >
                          <button
                            type="button"
                            className={`photos-thumb-btn ${isSelected ? 'photos-thumb-btn--selected' : ''}`}
                            onClick={() => toggleSelectJE(group, photo)}
                            disabled={isBusy}
                          >
                            <img src={photo.photo_url} alt="" className="photos-thumb-btn__img" />
                            {isSelected && <span className="photos-thumb-btn__badge">✓</span>}
                            {isSelected && <span className="photos-thumb-btn__drag-hint">✋ ลากเพื่อสลับที่</span>}
                          </button>
                          <button
                            type="button"
                            className="photos-thumb-btn__delete"
                            onClick={(e) => { e.stopPropagation(); deletePhotoJE(photo); }}
                            disabled={isBusy}
                            title="ลบรูปนี้ทิ้งถาวร"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ===== คอลัมน์ 2: ความปลอดภัย — มีหัวข้อรายการ (เหมือน JE) ===== */}
          {(() => {
            const itemGroups = groupPhotosByItem(safetyItems);
            return (
              <div className="photos-3col__col">
                <h4 className="photos-3col__title">
                  ความปลอดภัย
                  <span className="photos-3col__hint">คลิกรูปเพื่อเลือก/ยกเลิก</span>
                </h4>
                {itemGroups.length === 0 && (
                  <p className="pdata-status">ยังไม่มีรูป — ไปแนบที่ Tab &quot;ความปลอดภัย&quot; ก่อน</p>
                )}
                {itemGroups.map((itemGroup) => {
                  const selectedCount = itemGroup.photos.filter((p) => p.selected !== false).length;
                  return (
                    <div key={itemGroup.item_id} className="photos-group">
                      <h5 className="photos-group__title">
                        {itemGroup.item_content}
                        <span className="photos-group__count"> ({selectedCount}/{MAX_PHOTOS})</span>
                      </h5>
                      <div className="photos-group__grid photos-group__grid--compact">
                        {itemGroup.photos.map((photo) => {
                          const isSelected = photo.selected !== false;
                          const isBusy = busyPhotoId === photo.id;
                          return (
                            <div key={photo.id} className="photos-thumb-wrap">
                              <button
                                type="button"
                                className={`photos-thumb-btn ${isSelected ? 'photos-thumb-btn--selected' : ''}`}
                                onClick={() => toggleSelectItemPhoto('safety', photo)}
                                disabled={isBusy}
                                title={itemGroup.item_content}
                              >
                                <img src={photo.url} alt={itemGroup.item_content || 'รูป'} className="photos-thumb-btn__img" />
                                {isSelected && <span className="photos-thumb-btn__badge">✓</span>}
                              </button>
                              <button
                                type="button"
                                className="photos-thumb-btn__delete"
                                onClick={(e) => { e.stopPropagation(); deletePhotoItem('safety', photo); }}
                                disabled={isBusy}
                                title="ลบรูปนี้ทิ้งถาวร"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
