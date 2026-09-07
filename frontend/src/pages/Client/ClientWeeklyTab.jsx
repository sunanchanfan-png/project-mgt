// src/pages/Client/ClientWeeklyTab.jsx
// Tab "งานสัปดาห์นี้/งานสัปดาห์หน้า" ฝั่งลูกค้า — เหมือน MobileForemanTab.jsx (ฝั่ง foreman) แต่ตัดส่วน
// กรอก/บันทึก/แนบรูปออกทั้งหมด เหลือแค่การ์ดแสดงผล %แผน/%ที่ทำแล้วอย่างเดียว แตะการ์ดเพื่อดูรูปที่แนบไว้
// (ถ้ามี) ได้ ไม่มีการแก้ไขใดๆ — ใช้ endpoint GET /api/client/weekly (อ่านอย่างเดียว คนละตัวกับฝั่ง staff)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import '../Mobile/MobileForemanTab.css';

function fmtPct(v) {
  return `${Number(v).toFixed(0)}%`;
}

// แบนต้นไม้ groups (JG > JN > JE) จาก /weekly ให้เหลือแค่ array ของ JE (Level3) เดียว เหมือนฝั่ง foreman
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

export default function ClientWeeklyTab({ projectId, week }) {
  const [activities, setActivities] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openActivity, setOpenActivity] = useState(null); // activity ที่กำลังดูรูปอยู่ (null = อยู่หน้ารายการ)

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    client.get('/client/weekly', { params: { project_id: projectId, week } })
      .then((res) => { setActivities(flattenActivities(res.data.groups)); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [projectId, week]);

  if (openActivity) {
    return (
      <div className="mforeman-entry">
        <button type="button" className="mforeman-entry__back" onClick={() => setOpenActivity(null)}>‹ กลับ</button>
        <h2 className="mforeman-entry__title">{openActivity.code} {openActivity.name}</h2>
        <p className="mforeman-entry__breadcrumb">{openActivity.group_name} • {openActivity.item_name}</p>
        <p className="mforeman-entry__plan">แผนงาน {fmtPct(openActivity.plan_percent)}</p>
        <p className="mforeman-entry__label">% ที่ทำได้แล้ว: {fmtPct(openActivity.actual_percent)}</p>

        {openActivity.photos && openActivity.photos.length > 0 ? (
          <div className="mforeman-entry__photo-grid">
            {openActivity.photos.map((p) => (
              <div key={p.id} className="mforeman-entry__photo-chip">
                <img src={p.url} alt="" className="mforeman-entry__photo-thumb" />
              </div>
            ))}
          </div>
        ) : (
          <p className="mforeman__status">ไม่มีรูปถ่ายหน้างานแนบไว้</p>
        )}
      </div>
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
        >
          <div className="mforeman__card-text">
            <p className="mforeman__card-title">{act.code} {act.name}</p>
            <p className="mforeman__card-sub">
              แผน {fmtPct(act.plan_percent)} • ทำแล้ว {fmtPct(act.actual_percent)}
            </p>
          </div>
          <span className="mforeman__card-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}
