// src/pages/ProjectManagement/SCurveTab.jsx
// Tab 4 "Main S-Curve" — กราฟ S-Curve ภาพรวมทั้งโครงการ (ไม่มีตัวกรองกลุ่มงาน)
// Tab 5 "Group S-Curve" (ดูทุกกลุ่มงานพร้อมกันแบบกริด 2 คอลัมน์) แยกไปอยู่ที่ GroupSCurveGrid.jsx แล้ว —
// สอง Tab นี้ใช้งานต่างกันมากพอที่แยก component จะดูแลง่ายกว่ารวมไว้ในไฟล์เดียวด้วยการเช็ค prop
import { useEffect, useState } from 'react';
import client from '../../api/client';
import SCurveChart from './SCurveChart';
import { SCURVE_PRINT_CSS, openPrintWindow, fmtDMY } from './printUtils';

export default function SCurveTab({ projectId, projectLabel, contractStart }) {
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

  const title = `${projectLabel || ''} — S-Curve ภาพรวมทั้งโครงการ`;
  const printTitle = 'S-Curve ภาพรวมทั้งโครงการ';

  function handlePrint() {
    const svgEl = document.querySelector('.scurve-chart__svg');
    if (!svgEl) return;
    const legendEl = document.querySelector('.scurve-chart__legend');
    const body = `
      <h2>${printTitle}</h2>
      <p class="p-sub">ช่วงวันที่ : ${fmtDMY(contractStart)} - ${fmtDMY(today?.date)}</p>
      ${svgEl.outerHTML}
      ${legendEl ? legendEl.outerHTML : ''}
    `;
    openPrintWindow(printTitle, body, SCURVE_PRINT_CSS);
  }

  return (
    <div className="progress-table-wrap">
      <div className="pdata-toolbar" style={{ marginTop: 0 }}>
        <div />
        <button className="btn-primary btn-primary--sm" onClick={handlePrint} disabled={!points}>🖨 Print</button>
      </div>

      {loading && !points && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}
      {points && <SCurveChart points={points} today={today} title={title} />}
    </div>
  );
}
