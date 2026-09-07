// src/pages/Client/ClientSCurveTab.jsx
// S-Curve ภาพรวมทั้งโครงการ สำหรับแอปลูกค้า — เหมือน ForemanSCurveTab.jsx ทุกประการ (อ่านอย่างเดียวอยู่
// แล้วทั้งคู่) ต่างกันแค่เรียก endpoint /api/client/scurve แทน /api/progress/scurve
import { useEffect, useState } from 'react';
import client from '../../api/client';
import SCurveChart from '../ProjectManagement/SCurveChart';
import '../Foreman/ForemanSCurveTab.css';

export default function ClientSCurveTab({ projectId }) {
  const [points, setPoints] = useState(null);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    client.get('/client/scurve', { params: { project_id: projectId } })
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
