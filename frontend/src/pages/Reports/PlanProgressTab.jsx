// src/pages/Reports/PlanProgressTab.jsx
// Tab 1 "Plan&Progress" — ดึงโครงสร้าง WBS + %Weight/%Plan/%Actual มาจากข้อมูลจริงอัตโนมัติ (คำนวณ ณ
// วันที่ week_end ของรายงานฉบับนี้เสมอ ไม่ใช่ "วันนี้" — ดู backend routes/reports.js) ตัวเลขในนี้แก้ไข
// ไม่ได้ (อ่านอย่างเดียว ต้องไปกรอกความคืบหน้าจริงที่ Menu3) แก้ไขได้แค่ช่อง "รายละเอียดงาน" (คำอธิบายเพิ่มเติม
// ต่อแถว) ตามแบบในภาพตัวอย่าง
import { useEffect, useState } from 'react';
import client from '../../api/client';

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  return `${Number(v).toFixed(1)}%`;
}

function fmtSigned(v) {
  const n = Number(v);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export default function PlanProgressTab({ reportId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remarks, setRemarks] = useState({}); // key: `${level}:${id}` -> ค่าที่กำลังพิมพ์อยู่ในกล่อง
  const [savingKey, setSavingKey] = useState(null);

  function fetchData() {
    setLoading(true);
    client.get(`/reports/${reportId}/progress`)
      .then((res) => {
        setData(res.data);
        const init = {};
        res.data.groups.forEach((g) => {
          init[`level1:${g.id}`] = g.remark || '';
          g.items.forEach((it) => {
            init[`level2:${it.id}`] = it.remark || '';
            it.activities.forEach((act) => {
              init[`level3:${act.id}`] = act.remark || '';
            });
          });
        });
        setRemarks(init);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [reportId]);

  function handleRemarkChange(level, id, value) {
    setRemarks((prev) => ({ ...prev, [`${level}:${id}`]: value }));
  }

  // บันทึกตอนออกจากช่อง (blur) แทนทุกครั้งที่พิมพ์ — กันยิง request รัวเกินไปตอนพิมพ์เร็วๆ
  async function handleRemarkBlur(level, id, originalValue) {
    const key = `${level}:${id}`;
    const currentValue = remarks[key] || '';
    if (currentValue === (originalValue || '')) return; // ไม่มีอะไรเปลี่ยน ไม่ต้องยิง request เปล่าๆ
    setSavingKey(key);
    try {
      await client.put(`/reports/${reportId}/remarks`, { wbs_level: level, wbs_id: id, remark: currentValue });
    } catch (err) {
      alert(err.response?.data?.error || 'บันทึกคำอธิบายไม่สำเร็จ');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="progress-table-wrap">
      {loading && !data && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}

      {data && (
        <>
          <div className="plan-progress-overall">
            <span className="plan-progress-overall__label">Overall progress :</span>
            <span className="plan-progress-overall__item">
              <span className="plan-progress-overall__item-label">Plan</span>
              <span className="plan-progress-overall__item-value">{fmtPct(data.overall.plan)}</span>
            </span>
            <span className="plan-progress-overall__item">
              <span className="plan-progress-overall__item-label">Actual</span>
              <span className="plan-progress-overall__item-value">{fmtPct(data.overall.actual)}</span>
            </span>
            <span className="plan-progress-overall__item">
              <span className="plan-progress-overall__item-label">Gain/Delay</span>
              <span className={`plan-progress-overall__item-value ${data.overall.gain_delay >= 0 ? 'plan-progress--gain' : 'plan-progress--delay'}`}>
                {fmtSigned(data.overall.gain_delay)}
              </span>
            </span>
          </div>

          <div className="progress-table-scroll">
            <table className="progress-table plan-progress-table">
              <colgroup>
                <col style={{ width: '26%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '44%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="progress-table__label-col">โครงสร้างงาน</th>
                  <th>%Weight</th>
                  <th>%Plan</th>
                  <th>%Actual</th>
                  <th>รายละเอียดงาน</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.length === 0 && (
                  <tr><td colSpan={5}>ไม่มีข้อมูล</td></tr>
                )}
                {data.groups.flatMap((g) => [
                  <tr key={`g-${g.id}`} className="progress-table__row progress-table__row--l1">
                    <td className="progress-table__label-col">{g.code} {g.name}</td>
                    <td>{fmtPct(g.weight_percent)}</td>
                    <td>{fmtPct(g.plan_percent)}</td>
                    <td>{fmtPct(g.actual_percent)}</td>
                    <td>
                      <input
                        type="text"
                        className="plan-progress-remark-input plan-progress-remark-input--disabled"
                        value=""
                        placeholder="—"
                        disabled
                        title="กรอกคำอธิบายได้เฉพาะกิจกรรมงาน (JE) เท่านั้น"
                      />
                    </td>
                  </tr>,
                  ...g.items.flatMap((it) => [
                    <tr key={`it-${it.id}`} className="progress-table__row progress-table__row--l2">
                      <td className="progress-table__label-col">{it.code} {it.name}</td>
                      <td>{fmtPct(it.weight_percent)}</td>
                      <td>{fmtPct(it.plan_percent)}</td>
                      <td>{fmtPct(it.actual_percent)}</td>
                      <td>
                        <input
                          type="text"
                          className="plan-progress-remark-input plan-progress-remark-input--disabled"
                          value=""
                          placeholder="—"
                          disabled
                          title="กรอกคำอธิบายได้เฉพาะกิจกรรมงาน (JE) เท่านั้น"
                        />
                      </td>
                    </tr>,
                    ...it.activities.map((act) => (
                      <tr key={`act-${act.id}`} className="progress-table__row progress-table__row--l3">
                        <td className="progress-table__label-col">{act.code} {act.name}</td>
                        <td>{Math.round(act.share_percent)}%</td>
                        <td>{fmtPct(act.plan_percent)}</td>
                        <td>{fmtPct(act.actual_percent)}</td>
                        <td>
                          <input
                            type="text"
                            className="plan-progress-remark-input"
                            value={remarks[`level3:${act.id}`] ?? ''}
                            onChange={(e) => handleRemarkChange('level3', act.id, e.target.value)}
                            onBlur={() => handleRemarkBlur('level3', act.id, act.remark)}
                            placeholder="กรอกคำอธิบาย..."
                            disabled={savingKey === `level3:${act.id}`}
                          />
                        </td>
                      </tr>
                    )),
                  ]),
                ])}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}