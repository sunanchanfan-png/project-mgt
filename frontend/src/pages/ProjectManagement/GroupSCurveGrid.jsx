// src/pages/ProjectManagement/GroupSCurveGrid.jsx
// Tab 5 "Group S-Curve" — โชว์ S-Curve ของทุกกลุ่มงาน (Level1) พร้อมกันในกริด 2 คอลัมน์ แบบย่อ (การ์ดเล็ก
// ตัวอักษรเล็กลง) ให้ PM กวาดตาดูได้ทีเดียวว่ากลุ่มไหน delay/gain โดยไม่ต้องสลับเลือกทีละกลุ่ม — คลิกที่
// การ์ดไหนแล้วขยายเต็มจอ (popup) ดูรายละเอียดเต็มขนาดเหมือน Tab "Main S-Curve" พร้อมปุ่ม Print เฉพาะกลุ่มนั้น
import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import SCurveChart from './SCurveChart';
import { SCURVE_PRINT_CSS, openPrintWindow, fmtDMY } from './printUtils';

export default function GroupSCurveGrid({ projectId, level1List, contractStart }) {
  // curves: Map<level1Id, { points, today, error }> — ดึงของทุกกลุ่มงานพร้อมกันตั้งแต่เปิด Tab นี้
  const [curves, setCurves] = useState({});
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // level1.id ที่กำลังเปิดดูแบบเต็มจอ (popup) อยู่
  const modalRef = useRef(null);

  function fetchAll() {
    if (!projectId || level1List.length === 0) return;
    setLoading(true);
    Promise.all(
      level1List.map((g) =>
        client.get('/progress/scurve', { params: { project_id: projectId, level1_id: g.id } })
          .then((res) => ({ id: g.id, points: res.data.points, today: res.data.today, error: null }))
          .catch(() => ({ id: g.id, points: null, today: null, error: 'ดึงข้อมูลไม่สำเร็จ' }))
      )
    ).then((results) => {
      const map = {};
      results.forEach((r) => { map[r.id] = r; });
      setCurves(map);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, [projectId, level1List]);

  // กด Esc ปิด popup ได้ด้วย (นอกจากคลิกปุ่ม ✕ หรือคลิกพื้นหลังมืด)
  useEffect(() => {
    if (expandedId === null) return undefined;
    function onKeyDown(e) { if (e.key === 'Escape') setExpandedId(null); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedId]);

  const expandedGroup = level1List.find((g) => g.id === expandedId);
  const expandedCurve = expandedId !== null ? curves[expandedId] : null;

  function closeModal() { setExpandedId(null); }

  function handlePrintExpanded() {
    if (!expandedGroup || !expandedCurve) return;
    const root = modalRef.current;
    const svgEl = root ? root.querySelector('.scurve-chart__svg') : null;
    if (!svgEl) return;
    const legendEl = root.querySelector('.scurve-chart__legend');
    const printTitle = `S-Curve กลุ่มงาน: ${expandedGroup.code} - ${expandedGroup.name}`;
    const body = `
      <h2>${printTitle}</h2>
      <p class="p-sub">ช่วงวันที่ : ${fmtDMY(contractStart)} - ${fmtDMY(expandedCurve.today?.date)}</p>
      ${svgEl.outerHTML}
      ${legendEl ? legendEl.outerHTML : ''}
    `;
    openPrintWindow(printTitle, body, SCURVE_PRINT_CSS);
  }

  // Print รวมทุกกลุ่มงานในครั้งเดียว (แต่ละกลุ่มขึ้นหน้าใหม่ตอนพิมพ์จริง) — สะดวกเวลาต้องการเอกสารสรุป
  // ทุกกลุ่มงานติดกันไปเลยโดยไม่ต้องขยายทีละกลุ่มแล้ว Print ทีละใบ
  function handlePrintAll() {
    const sections = level1List.map((g) => {
      const c = curves[g.id];
      if (!c || !c.points) return '';
      const cardEl = document.querySelector(`[data-group-card="${g.id}"] .scurve-chart__svg`);
      const legendEl = document.querySelector(`[data-group-card="${g.id}"] .scurve-chart__legend`);
      if (!cardEl) return '';
      return `
        <div class="scurve-print-group">
          <h2>${g.code} - ${g.name}</h2>
          <p class="p-sub">ช่วงวันที่ : ${fmtDMY(contractStart)} - ${fmtDMY(c.today?.date)}</p>
          ${cardEl.outerHTML}
          ${legendEl ? legendEl.outerHTML : ''}
        </div>
      `;
    }).join('');
    openPrintWindow('S-Curve รายกลุ่มงานทั้งหมด', sections, SCURVE_PRINT_CSS);
  }

  return (
    <div className="progress-table-wrap">
      <div className="pdata-toolbar" style={{ marginTop: 0 }}>
        <p className="progress-table__week-label" style={{ margin: 0 }}>
          S-Curve รายกลุ่มงาน — ทุกกลุ่ม ({level1List.length} กลุ่ม)
        </p>
        <div className="pdata-toolbar__actions">
          <button className="btn-secondary btn-secondary--sm" onClick={fetchAll} disabled={loading}>
            {loading ? 'กำลังรีเฟรช...' : '⟳ Refresh'}
          </button>
          <button className="btn-primary btn-primary--sm" onClick={handlePrintAll} disabled={loading || level1List.length === 0}>
            🖨 Print ทั้งหมด
          </button>
        </div>
      </div>

      {loading && Object.keys(curves).length === 0 && <p>กำลังโหลดข้อมูล...</p>}
      {!loading && level1List.length === 0 && <p className="pdata-status pdata-status--warn">โครงการนี้ยังไม่มีกลุ่มงาน (Level1)</p>}

      <div className="scurve-grid">
        {level1List.map((g) => {
          const c = curves[g.id];
          return (
            <div key={g.id} data-group-card={g.id}>
              {!c && <p>กำลังโหลด {g.code}...</p>}
              {c?.error && <p className="pdata-status pdata-status--warn">{g.code}: {c.error}</p>}
              {c?.points && (
                <SCurveChart
                  points={c.points}
                  today={c.today}
                  title={`${g.code} - ${g.name}`}
                  compact
                  showLegend={false}
                  onClick={() => setExpandedId(g.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {expandedGroup && expandedCurve?.points && (
        <div className="scurve-modal-backdrop" onClick={closeModal}>
          <div className="scurve-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
            <div className="scurve-modal__toolbar">
              <button className="btn-primary btn-primary--sm" onClick={handlePrintExpanded}>🖨 Print</button>
              <button className="scurve-modal__close" onClick={closeModal} aria-label="ปิด">✕</button>
            </div>
            <SCurveChart
              points={expandedCurve.points}
              today={expandedCurve.today}
              title={`${expandedGroup.code} - ${expandedGroup.name}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
