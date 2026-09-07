// src/pages/Client/ClientReportTab.jsx
// Tab "เล่มรายงาน" สำหรับแอปลูกค้า — พรีวิวหน้าตารายงานจริงบนจอ เหมือน CompiledReportTab.jsx (ฝั่ง staff
// ทุกประการ) ต่างกันแค่ 2 อย่าง: (1) endpoint ทั้งหมดชี้ไป /api/client/* แทน (อ่านอย่างเดียว คนละตัวกับ
// ฝั่ง staff — ดูเหตุผลที่ routes/client.js), (2) มี dropdown เลือกดูรายงานย้อนหลังในตัวเอง (ฝั่ง staff
// เลือกจาก Reports.jsx ซึ่งลูกค้าไม่มีหน้านั้น) — โครงสร้าง/ลำดับหัวข้อของหน้าพรีวิวยังตรงกับของจริงเป๊ะ
// เหมือนเดิม ถ้าแก้รูปแบบเล่มรายงานฝั่ง staff (CompiledReportTab.jsx / routes/reports.js GET /:id/export)
// ในอนาคต ต้องกลับมาแก้ไฟล์นี้ให้ตรงกันด้วย (จงใจ copy มา ไม่ได้ import ใช้ร่วมกัน เพราะ endpoint คนละชุด)
import React, { useEffect, useState, useRef } from 'react';
import client from '../../api/client';
import SCurveChart from '../ProjectManagement/SCurveChart';
import '../Reports/Reports.css';
import './ClientReportTab.css';

const CATEGORY_KEYS = ['safety', 'problems', 'additional_work', 'pending'];

const CATEGORY_SECTION_LABELS = {
  safety: '2. ความปลอดภัยและสิ่งแวดล้อม',
  problems: '4. ปัญหาและอุปสรรค',
  additional_work: '5. งานเพิ่ม/งานลด',
  pending: '6. รายการที่รอการตัดสินใจจากผู้ว่าจ้าง',
};

const MAX_PHOTOS_PER_PRINT_PAGE = 6;

function packEntriesIntoPrintPages(entries, maxPerPage) {
  const pages = [];
  let currentPage = [];
  let currentCount = 0;
  entries.forEach((entry) => {
    const cnt = entry.photoCount || 0;
    if (cnt > maxPerPage) {
      if (currentPage.length > 0) { pages.push(currentPage); currentPage = []; currentCount = 0; }
      pages.push([entry]);
      return;
    }
    if (cnt > 0 && currentCount + cnt > maxPerPage) {
      pages.push(currentPage);
      currentPage = [entry];
      currentCount = cnt;
    } else {
      currentPage.push(entry);
      currentCount += cnt;
    }
  });
  if (currentPage.length > 0) pages.push(currentPage);
  return pages.length > 0 ? pages : [[]];
}

function fmtPct(v) {
  return `${Number(v).toFixed(1)}%`;
}

function fmtDMY(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function ClientReportTab({ projectId, project }) {
  const [reports, setReports] = useState([]);
  const [reportId, setReportId] = useState('');
  const [reportsError, setReportsError] = useState('');

  const [progress, setProgress] = useState(null);
  const [itemsByCategory, setItemsByCategory] = useState(null);
  const [nextWeekGroups, setNextWeekGroups] = useState(null);
  const [photoGroups, setPhotoGroups] = useState(null);
  const [scurveData, setScurveData] = useState(null);
  const [scurveLoading, setScurveLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [overallData, setOverallData] = useState(null);
  const [overallLoading, setOverallLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const printRef = useRef(null);

  // โหลดรายชื่อรายงานทั้งหมดของโครงการ (เรียงล่าสุดก่อน) — ใช้ทำ dropdown เลือกดูย้อนหลัง เลือกฉบับล่าสุด
  // เป็นค่าเริ่มต้นเสมอ
  useEffect(() => {
    if (!projectId) return;
    setReportsError('');
    client.get('/client/reports', { params: { project_id: projectId } })
      .then((res) => {
        setReports(res.data.reports);
        if (res.data.reports.length > 0) setReportId(res.data.reports[0].id);
        else setReportId('');
      })
      .catch((err) => setReportsError(err.response?.data?.error || 'ดึงรายชื่อรายงานไม่สำเร็จ'));
  }, [projectId]);

  const report = reports.find((r) => String(r.id) === String(reportId));

  // ดึงข้อมูล S-Curve จาก Menu 3 Tab 4
  useEffect(() => {
    if (!projectId) return;
    setScurveLoading(true);
    client.get('/client/scurve', { params: { project_id: projectId } })
      .then((res) => setScurveData(res.data))
      .catch((err) => console.error('ดึง S-Curve ไม่สำเร็จ:', err))
      .finally(() => setScurveLoading(false));
  }, [projectId]);

  // ดึงข้อมูลงานสัปดาห์นี้ สำหรับตาราง "กิจกรรมงานที่ทำในรอบสัปดาห์นี้"
  useEffect(() => {
    if (!projectId) return;
    setWeeklyLoading(true);
    client.get('/client/weekly', { params: { project_id: projectId, week: 'this' } })
      .then((res) => setWeeklyData(res.data))
      .catch((err) => console.error('ดึงงานสัปดาห์นี้ไม่สำเร็จ:', err))
      .finally(() => setWeeklyLoading(false));
  }, [projectId]);

  // ดึงข้อมูลตารางงานรวม สำหรับ "ตารางสรุปปริมาณงานและผลงานรวมทั้งโครงการ"
  useEffect(() => {
    if (!projectId) return;
    setOverallLoading(true);
    client.get('/client/overall', { params: { project_id: projectId } })
      .then((res) => setOverallData(res.data))
      .catch((err) => console.error('ดึงตารางงานรวมไม่สำเร็จ:', err))
      .finally(() => setOverallLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    Promise.all([
      client.get(`/client/reports/${reportId}/progress`),
      ...CATEGORY_KEYS.map((cat) => client.get(`/client/reports/${reportId}/items`, { params: { category: cat } })),
      client.get(`/client/reports/${reportId}/next-week`),
      client.get(`/client/reports/${reportId}/photos`),
    ])
      .then(([progressRes, ...rest]) => {
        setProgress(progressRes.data);
        const categoryResults = rest.slice(0, CATEGORY_KEYS.length);
        const nextWeekRes = rest[CATEGORY_KEYS.length];
        const photosRes = rest[CATEGORY_KEYS.length + 1];
        const itemsByCat = {};
        CATEGORY_KEYS.forEach((cat, idx) => { itemsByCat[cat] = categoryResults[idx].data.items; });
        setItemsByCategory(itemsByCat);

        const nwGroups = [];
        const nwIndex = new Map();
        nextWeekRes.data.items.forEach((item) => {
          const key = item.wbs_level1_id || 'none';
          if (!nwIndex.has(key)) {
            nwIndex.set(key, nwGroups.length);
            nwGroups.push({ label: item.wbs_level1_id ? `${item.level1_code} - ${item.level1_name}` : 'ทั่วไป', items: [] });
          }
          nwGroups[nwIndex.get(key)].items.push(item);
        });
        setNextWeekGroups(nwGroups);

        const pGroups = photosRes.data.groups
          .map((g) => ({ ...g, photos: g.photos.filter((p) => p.selection_id) }))
          .filter((g) => g.photos.length > 0);
        setPhotoGroups(pGroups);

        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'ดึงข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [reportId]);

  function handlePrint() {
    if (printRef.current) window.print();
  }

  function renderWeeklyActivities() {
    if (weeklyLoading) return <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>กำลังโหลดข้อมูล...</p>;
    if (!weeklyData || !weeklyData.groups || weeklyData.groups.length === 0) {
      return <p className="report-preview__empty">ไม่มีกิจกรรมงานในสัปดาห์นี้</p>;
    }

    const remarkMap = new Map();
    if (progress) {
      progress.groups.forEach((g) => {
        g.items.forEach((it) => {
          it.activities.forEach((act) => remarkMap.set(act.id, act.remark || ''));
        });
      });
    }

    const allActivities = [];
    weeklyData.groups.forEach((g) => {
      g.items.forEach((it) => {
        it.activities.forEach((act) => {
          allActivities.push({
            id: act.id,
            code: act.code,
            name: act.name,
            actual_percent: act.actual_percent,
            remark: remarkMap.get(act.id) || act.remark || '',
          });
        });
      });
    });

    if (allActivities.length === 0) {
      return <p className="report-preview__empty">ไม่มีกิจกรรมงานในสัปดาห์นี้</p>;
    }

    return (
      <div className="progress-table-scroll">
        <table className="progress-table" style={{ minWidth: '600px', fontSize: '12px' }}>
          <colgroup>
            <col style={{ width: '45%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '40%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>กิจกรรมงานที่ทำในรอบสัปดาห์นี้</th>
              <th style={{ textAlign: 'center' }}>%ผลงานสะสม</th>
              <th style={{ textAlign: 'center' }}>รายละเอียดงาน</th>
            </tr>
          </thead>
          <tbody>
            {allActivities.map((act, idx) => (
              <tr key={act.code}>
                <td style={{ textAlign: 'left', paddingLeft: '12px' }}>{idx + 1}.) {act.code} {act.name}</td>
                <td style={{ textAlign: 'center' }}>{fmtPct(act.actual_percent)}</td>
                <td style={{ textAlign: 'left' }}>{act.remark || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderOverallTable() {
    if (overallLoading) return <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>กำลังโหลดข้อมูล...</p>;
    if (!overallData || !overallData.groups || overallData.groups.length === 0) {
      return <p className="report-preview__empty">ไม่มีข้อมูล</p>;
    }

    const groups = overallData.groups;

    return (
      <div className="progress-table-scroll">
        <table className="progress-table plan-progress-table" style={{ minWidth: '650px' }}>
          <colgroup>
            <col style={{ width: '35%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="progress-table__label-col">โครงสร้างงาน</th>
              <th>%Weight</th>
              <th>%Plan</th>
              <th>%Actual</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={`l1-${g.id}`}>
                <tr className="progress-table__row progress-table__row--l1">
                  <td className="progress-table__label-col">{g.code} {g.name}</td>
                  <td>{fmtPct(g.weight_percent)}</td>
                  <td>{fmtPct(g.plan_percent)}</td>
                  <td>{fmtPct(g.actual_percent)}</td>
                  <td><span className={g.status === 'ตามแผน' ? '' : g.status === 'เร็วกว่าแผน' ? 'plan-progress--gain' : 'plan-progress--delay'}>{g.status || '-'}</span></td>
                </tr>
                {g.items.map((it) => (
                  <React.Fragment key={`l2-${it.id}`}>
                    <tr className="progress-table__row progress-table__row--l2">
                      <td className="progress-table__label-col">{it.code} {it.name}</td>
                      <td>{fmtPct(it.weight_percent)}</td>
                      <td>{fmtPct(it.plan_percent)}</td>
                      <td>{fmtPct(it.actual_percent)}</td>
                      <td><span className={it.status === 'ตามแผน' ? '' : it.status === 'เร็วกว่าแผน' ? 'plan-progress--gain' : 'plan-progress--delay'}>{it.status || '-'}</span></td>
                    </tr>
                    {it.activities.map((act) => (
                      <tr key={`l3-${act.id}`} className="progress-table__row progress-table__row--l3">
                        <td className="progress-table__label-col">{act.code} {act.name}</td>
                        <td>{Math.round(act.share_percent)}%</td>
                        <td>{fmtPct(act.plan_percent)}</td>
                        <td>{fmtPct(act.actual_percent)}</td>
                        <td><span className={act.status === 'ตามแผน' ? '' : act.status === 'เร็วกว่าแผน' ? 'plan-progress--gain' : 'plan-progress--delay'}>{act.status || '-'}</span></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const ready = progress && itemsByCategory && nextWeekGroups && photoGroups;

  return (
    <div className="progress-table-wrap" ref={printRef}>
      <div className="pdata-toolbar client-report-toolbar" style={{ marginTop: 0, marginBottom: 12 }}>
        {reports.length > 0 && (
          <select
            className="client-app__select client-report-toolbar__select"
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
          >
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                รายงานครั้งที่ {r.report_no} ({fmtDMY(r.week_start)} - {fmtDMY(r.week_end)})
              </option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-primary btn-primary--sm" onClick={handlePrint} disabled={loading || !ready}>
          🖨️ พิมพ์
        </button>
      </div>

      {reportsError && <p className="pdata-status pdata-status--warn">{reportsError}</p>}
      {!reportsError && reports.length === 0 && <p className="report-preview__empty">ยังไม่มีรายงานของโครงการนี้</p>}
      {loading && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}

      {ready && (
        <div className="report-preview">
          <div className="report-print-page report-print-page--cover">
            <div className="report-preview__cover">
              <div className="report-preview__cover-title">{project?.project_code} - {project?.name}</div>
              <div className="report-preview__cover-sub">WEEKLY REPORT #{report?.report_no}</div>
              <div className="report-preview__cover-date">AS AT : {fmtDMY(report?.week_end)}</div>
            </div>
          </div>

          <div className="report-print-page">
            <h3 className="report-preview__h">1. แผนงานและความคืบหน้างาน</h3>

            <div className="plan-progress-overall">
              <span className="plan-progress-overall__label">Overall progress :</span>
              <span className="plan-progress-overall__item">
                <span className="plan-progress-overall__item-label">Plan</span>
                <span className="plan-progress-overall__item-value">{fmtPct(progress.overall.plan)}</span>
              </span>
              <span className="plan-progress-overall__item">
                <span className="plan-progress-overall__item-label">Actual</span>
                <span className="plan-progress-overall__item-value">{fmtPct(progress.overall.actual)}</span>
              </span>
              <span className="plan-progress-overall__item">
                <span className="plan-progress-overall__item-label">Gain/Delay</span>
                <span className={`plan-progress-overall__item-value ${progress.overall.gain_delay >= 0 ? 'plan-progress--gain' : 'plan-progress--delay'}`}>
                  {progress.overall.gain_delay >= 0 ? '+' : ''}{progress.overall.gain_delay.toFixed(1)}%
                </span>
              </span>
            </div>

            {scurveLoading && <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>กำลังโหลดกราฟ S-Curve...</p>}
            {scurveData && scurveData.points && scurveData.points.length > 0 && (
              <div style={{ margin: '16px 0 20px', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px', background: 'var(--bg)' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px', color: 'var(--ink)' }}>S-Curve รวมทั้งโครงการ</p>
                <SCurveChart points={scurveData.points} today={scurveData.today} />
              </div>
            )}

            <h4 className="report-preview__h4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 12px' }}>
              กิจกรรมงานที่ทำในรอบสัปดาห์นี้
            </h4>
            {renderWeeklyActivities()}
          </div>

          <div className="report-print-page">
            <h4 className="report-preview__h4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>
              ตารางสรุปปริมาณงานและผลงานรวมทั้งโครงการ
            </h4>
            {renderOverallTable()}
          </div>

          {photoGroups.length > 0 && (
            packEntriesIntoPrintPages(
              photoGroups.map((g) => ({
                key: g.wbs_level3_id,
                photoCount: g.photos.length,
                render: () => (
                  <div key={g.wbs_level3_id} className="report-preview__photo-group">
                    <p className="report-preview__photo-title">รูปถ่าย : {g.activity_code} - {g.activity_name}</p>
                    <div className="report-preview__photo-grid">
                      {g.photos.map((p) => (
                        <img key={p.photo_id} src={p.photo_url} alt="" className="report-preview__photo-img" />
                      ))}
                    </div>
                  </div>
                ),
              })),
              MAX_PHOTOS_PER_PRINT_PAGE
            ).map((page, pageIdx) => (
              <div key={`je-photo-page-${pageIdx}`} className="report-print-page">
                {page.map((entry) => entry.render())}
              </div>
            ))
          )}

          {packEntriesIntoPrintPages(
            (() => {
              const cat = 'safety';
              const header = {
                key: `${cat}-header`,
                photoCount: 0,
                render: () => <h3 key={`${cat}-header`} className="report-preview__h">{CATEGORY_SECTION_LABELS[cat]}</h3>,
              };
              if (itemsByCategory[cat].length === 0) {
                return [header, { key: `${cat}-empty`, photoCount: 0, render: () => <p key={`${cat}-empty`} className="report-preview__empty">-</p> }];
              }
              return [
                header,
                ...itemsByCategory[cat].map((it, idx) => ({
                  key: `${cat}-${it.id}`,
                  photoCount: (it.photos || []).length,
                  render: () => (
                    <div key={`${cat}-${it.id}`}>
                      <p className="report-preview__list report-preview__list--numbered" style={{ marginBottom: 4 }}>{idx + 1}.) {it.content}</p>
                      {it.photos && it.photos.length > 0 && (
                        <div className="report-preview__photo-grid">
                          {it.photos.map((p) => <img key={p.id} src={p.url} alt="" className="report-preview__photo-img" />)}
                        </div>
                      )}
                    </div>
                  ),
                })),
              ];
            })(),
            MAX_PHOTOS_PER_PRINT_PAGE
          ).map((page, pageIdx) => (
            <div key={`qs-page-${pageIdx}`} className="report-print-page">
              {page.map((entry) => entry.render())}
            </div>
          ))}

          <div className="report-print-page">
            <h3 className="report-preview__h">3. แผนงานสัปดาห์หน้า / Next week plan</h3>
            {nextWeekGroups.length === 0 && <p className="report-preview__empty">-</p>}
            {nextWeekGroups.map((g, gi) => (
              <div key={g.label} className="report-preview__nextweek-group">
                <p className="report-preview__nextweek-title">{gi + 1}.) {g.label}</p>
                <ul className="report-preview__list report-preview__list--check">
                  {g.items.map((item) => (
                    <li key={item.id}>
                      {item.content}
                      {item.target_percent !== null && item.target_percent !== undefined && <strong> {item.target_percent}%</strong>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="report-print-page report-print-page--last">
            {['problems', 'additional_work', 'pending'].map((cat) => (
              <div key={cat}>
                <h3 className="report-preview__h">{CATEGORY_SECTION_LABELS[cat]}</h3>
                {itemsByCategory[cat].length === 0
                  ? <p className="report-preview__empty">-</p>
                  : (
                    <ul className="report-preview__list report-preview__list--numbered">
                      {itemsByCategory[cat].map((it, idx) => <li key={it.id}>{idx + 1}.) {it.content}</li>)}
                    </ul>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
