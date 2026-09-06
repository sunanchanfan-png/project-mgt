// src/pages/Foreman/ForemanSCurveTab.jsx
// S-Curve ภาพรวมทั้งโครงการ สำหรับหน้าจอ foreman บนมือถือ — ใช้ endpoint และ component กราฟตัวเดียวกับ
// หน้าคอมพิวเตอร์ (SCurveTab.jsx) ทุกอย่าง ต่างกันแค่ตัด "ปุ่ม Print" ออก (ไม่มีประโยชน์บนมือถือ) และห่อ
// กราฟด้วย container ที่ scroll แนวนอนได้ (กราฟเป็น SVG ขนาดคงที่ 900x376 บีบลงจอแคบแล้วจะอ่านยาก จึงให้
// scroll ดูแทนเหมือนตารางอื่นๆ ในระบบที่ทำ mobile scroll fix ไปแล้วก่อนหน้านี้)
import { useEffect, useState } from 'react';
import client from '../../api/client';
import SCurveChart from '../ProjectManagement/SCurveChart';
import './ForemanSCurveTab.css';

export default function ForemanSCurveTab({ projectId }) {
  const [points, setPoints] = useState(null);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    client.get('/progress/scurve', { params: { project_id: projectId } })
      .then((res) => { setPoints(res.data.points); setToday(res.data.today); setError(''); })
      .catch(() => setError('ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="foreman-scurve">
      {loading && !points && <p className="foreman-scurve__status">กำลังโหลดข้อมูล...</p>}
      {error && <p className="foreman-scurve__status foreman-scurve__status--warn">{error}</p>}
      {points && (
        <div className="foreman-scurve__scroll">
          <SCurveChart points={points} today={today} title="S-Curve ภาพรวมทั้งโครงการ" />
        </div>
      )}
    </div>
  );
}
