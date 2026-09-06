// src/pages/Reports/CompiledReportTab.jsx
// Tab "เล่มรายงาน" — พรีวิวหน้าตารายงานจริงบนจอ (เหมือนกระดาษ) ให้ตรวจสอบข้อมูล/การจัดวางก่อนโหลดไฟล์ Word
// จริง — ดึงข้อมูลจากทุก endpoint ของ Tab อื่นๆ มาประกอบแสดงในหน้าเดียว โครงสร้าง/ลำดับหัวข้อตรงกับไฟล์
// Word ที่ backend สร้างเป๊ะ (routes/reports.js GET /:id/export) เพื่อให้พรีวิวนี้ "ตรงกับของจริง" จริงๆ
import React, { useEffect, useState, useRef } from 'react';
import client from '../../api/client';
import SCurveChart from '../ProjectManagement/SCurveChart';

const CATEGORY_TAB_MAP = {
  safety: 'safety',
  problems: 'problems',
  'additional-work': 'additional_work',
  pending: 'pending',
};

const CATEGORY_SECTION_LABELS = {
  safety: '2. ความปลอดภัยและสิ่งแวดล้อม',
  problems: '4. ปัญหาและอุปสรรค',
  additional_work: '5. งานเพิ่ม/งานลด',
  pending: '6. รายการที่รอการตัดสินใจจากผู้ว่าจ้าง',
};

const MAX_PHOTOS_PER_PRINT_PAGE = 6; // จำกัดรูปสูงสุด 6 รูปต่อแผ่นตอนพิมพ์ (ทั้งหน้ารูปถ่าย JE และหน้า
// คุณภาพงาน/ความปลอดภัย) — หัวข้อที่มีรูปน้อยเลื่อนมาต่อกันในแผ่นเดียวกันได้ ถ้ารวมแล้วเกิน 6 ให้ทั้งหัวข้อ
// (ไม่ตัดรูปครึ่งๆ กลางๆ) เลื่อนไปขึ้นแผ่นใหม่แทน

/**
 * จัด entries (แต่ละอันมี photoCount ของตัวเอง) ให้เข้ากลุ่มเป็น "แผ่นพิมพ์" โดยรวมรูปในแผ่นเดียวกันไม่เกิน
 * maxPerPage — entry ที่มี photoCount=0 (เช่น หัวข้อ, ข้อความว่างเปล่า) ใส่ต่อแผ่นปัจจุบันได้เสมอไม่กระทบ
 * cap ส่วน entry ที่มีรูปเกิน maxPerPage เองอยู่แล้ว (ไม่ควรเกิดขึ้นจริงเพราะแนบ/เลือกได้สูงสุด 4 รูปต่อ
 * รายการอยู่แล้ว แต่กันไว้เผื่ออนาคต) จะได้แผ่นเดี่ยวของตัวเอง ไม่แบ่งรูปข้ามแผ่น
 * @returns {Array<Array<object>>} array ของ "แผ่น" แต่ละแผ่นเป็น array ของ entries ที่จะ render ในแผ่นนั้น
 */
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

export default function CompiledReportTab({ reportId, reportLabel, project, report, printBarHidden = false }) {
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

  // ดึงข้อมูล S-Curve จาก Menu 3 Tab 4
  useEffect(() => {
    if (!project?.id) return;
    setScurveLoading(true);
    client.get('/progress/scurve', { params: { project_id: project.id } })
      .then((res) => {
        setScurveData(res.data);
      })
      .catch((err) => {
        console.error('ดึง S-Curve ไม่สำเร็จ:', err);
      })
      .finally(() => setScurveLoading(false));
  }, [project?.id]);

  // ดึงข้อมูลงานสัปดาห์นี้ (Tab 1) สำหรับตาราง "กิจกรรมงานที่ทำในรอบสัปดาห์นี้"
  useEffect(() => {
    if (!project?.id) return;
    setWeeklyLoading(true);
    client.get('/progress/weekly', { params: { project_id: project.id, week: 'this' } })
      .then((res) => {
        setWeeklyData(res.data);
      })
      .catch((err) => {
        console.error('ดึงงานสัปดาห์นี้ไม่สำเร็จ:', err);
      })
      .finally(() => setWeeklyLoading(false));
  }, [project?.id]);

  // ดึงข้อมูลตารางงานรวม (Tab 3) สำหรับ "ตารางสรุปปริมาณงานและผลงานรวมทั้งโครงการ"
  useEffect(() => {
    if (!project?.id) return;
    setOverallLoading(true);
    client.get('/progress/overall', { params: { project_id: project.id } })
      .then((res) => {
        setOverallData(res.data);
      })
      .catch((err) => {
        console.error('ดึงตารางงานรวมไม่สำเร็จ:', err);
      })
      .finally(() => setOverallLoading(false));
  }, [project?.id]);

  useEffect(() => {
    setLoading(true);
    const categoryKeys = Object.keys(CATEGORY_TAB_MAP);
    Promise.all([
      client.get(`/reports/${reportId}/progress`),
      ...categoryKeys.map((tabKey) =>
        client.get(`/reports/${reportId}/items`, { params: { category: CATEGORY_TAB_MAP[tabKey] } })
      ),
      client.get(`/reports/${reportId}/next-week`),
      client.get(`/reports/${reportId}/photos`),
    ])
      .then(([progressRes, ...rest]) => {
        setProgress(progressRes.data);
        // ผูกผลลัพธ์แต่ละ category ตามลำดับ categoryKeys จริง (ไม่ hardcode ตำแหน่งตัวแปรอีกต่อไป) กัน
        // พังตอนมีการเพิ่ม/ลด category ในอนาคต (เช่นตอนตัด "quality" ออกไปรอบนี้) — ตำแหน่งใน rest
        // จะเลื่อนตาม categoryKeys เสมอ ส่วน nextWeekRes/photosRes อยู่ท้ายสุดเสมอหลัง category ทั้งหมด
        const categoryResults = rest.slice(0, categoryKeys.length);
        const nextWeekRes = rest[categoryKeys.length];
        const photosRes = rest[categoryKeys.length + 1];
        const itemsByCat = {};
        categoryKeys.forEach((tabKey, idx) => {
          itemsByCat[CATEGORY_TAB_MAP[tabKey]] = categoryResults[idx].data.items;
        });
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

  // ฟังก์ชันพิมพ์
  function handlePrint() {
    if (printRef.current) {
      // ใช้ window.print() เพื่อพิมพ์เฉพาะเนื้อหาใน printRef
      window.print();
    }
  }

  // ฟังก์ชัน render ตารางงานสัปดาห์นี้ (เฉพาะ JE)
  function renderWeeklyActivities() {
    if (weeklyLoading) return <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>กำลังโหลดข้อมูล...</p>;
    if (!weeklyData || !weeklyData.groups || weeklyData.groups.length === 0) {
      return <p className="report-preview__empty">ไม่มีกิจกรรมงานในสัปดาห์นี้</p>;
    }

    // สร้าง Map ของ activity id -> remark จาก progress (report_progress_remarks)
    const remarkMap = new Map();
    if (progress) {
      progress.groups.forEach((g) => {
        g.items.forEach((it) => {
          it.activities.forEach((act) => {
            remarkMap.set(act.id, act.remark || '');
          });
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
                <td style={{ textAlign: 'left', paddingLeft: '12px' }}>
                  {idx + 1}.) {act.code} {act.name}
                </td>
                <td style={{ textAlign: 'center' }}>{fmtPct(act.actual_percent)}</td>
                <td style={{ textAlign: 'left' }}>{act.remark || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ฟังก์ชัน render ตารางสรุปปริมาณงานและผลงานรวมทั้งโครงการ
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
                  <td>
                    <span className={g.status === 'ตามแผน' ? '' : g.status === 'เร็วกว่าแผน' ? 'plan-progress--gain' : 'plan-progress--delay'}>
                      {g.status || '-'}
                    </span>
                  </td>
                </tr>
                {g.items.map((it) => (
                  <React.Fragment key={`l2-${it.id}`}>
                    <tr className="progress-table__row progress-table__row--l2">
                      <td className="progress-table__label-col">{it.code} {it.name}</td>
                      <td>{fmtPct(it.weight_percent)}</td>
                      <td>{fmtPct(it.plan_percent)}</td>
                      <td>{fmtPct(it.actual_percent)}</td>
                      <td>
                        <span className={it.status === 'ตามแผน' ? '' : it.status === 'เร็วกว่าแผน' ? 'plan-progress--gain' : 'plan-progress--delay'}>
                          {it.status || '-'}
                        </span>
                      </td>
                    </tr>
                    {it.activities.map((act) => (
                      <tr key={`l3-${act.id}`} className="progress-table__row progress-table__row--l3">
                        <td className="progress-table__label-col">{act.code} {act.name}</td>
                        <td>{Math.round(act.share_percent)}%</td>
                        <td>{fmtPct(act.plan_percent)}</td>
                        <td>{fmtPct(act.actual_percent)}</td>
                        <td>
                          <span className={act.status === 'ตามแผน' ? '' : act.status === 'เร็วกว่าแผน' ? 'plan-progress--gain' : 'plan-progress--delay'}>
                            {act.status || '-'}
                          </span>
                        </td>
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
      {/* ===== ปุ่ม Print — ซ่อนได้ตอนอยู่บนมือถือผ่าน printBarHidden (ควบคุมจาก Reports.jsx จุดเดียวกับ
          filter+tabs ด้านบน — ให้ผู้ใช้เปิดดูเนื้อหาเล่มรายงานเต็มจอได้ทันทีโดยไม่ต้องเลื่อนผ่านส่วนนี้) ===== */}
      {!printBarHidden && (
        <div className="pdata-toolbar" style={{ marginTop: 0, marginBottom: 12 }}>
          <div style={{ flex: 1 }} />
          <button className="btn-primary btn-primary--sm" onClick={handlePrint} disabled={loading}>
            🖨️ พิมพ์
          </button>
        </div>
      )}

      {loading && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}

      {ready && (
        <div className="report-preview">
          {/* ===== หน้าที่ 1: หน้าปก (จัดข้อความ+เส้นไว้กลางหน้าแนวตั้ง) ===== */}
          <div className="report-print-page report-print-page--cover">
            <div className="report-preview__cover">
              <div className="report-preview__cover-title">{project?.project_code} - {project?.name}</div>
              <div className="report-preview__cover-sub">WEEKLY REPORT #{report?.report_no}</div>
              <div className="report-preview__cover-date">AS AT : {fmtDMY(report?.week_end)}</div>
            </div>
          </div>

          {/* ===== หน้าที่ 2: แผนงานและความคืบหน้างาน (Overall box + S-Curve + งานสัปดาห์นี้) ===== */}
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
                <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 10px', color: 'var(--ink)' }}>
                  S-Curve รวมทั้งโครงการ
                </p>
                <SCurveChart points={scurveData.points} today={scurveData.today} />
              </div>
            )}

            <h4 className="report-preview__h4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 12px' }}>
              กิจกรรมงานที่ทำในรอบสัปดาห์นี้
            </h4>
            {renderWeeklyActivities()}
          </div>

          {/* ===== หน้าที่ 3: ตารางสรุปผลงานทั้งโครงการ (ไม่กรอง ครบทุกกิจกรรมงาน) ===== */}
          <div className="report-print-page">
            <h4 className="report-preview__h4" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>
              ตารางสรุปปริมาณงานและผลงานรวมทั้งโครงการ
            </h4>
            {renderOverallTable()}
          </div>

          {/* ===== หน้าที่ 4: รูปถ่ายความคืบหน้า (JE) — แบ่งแผ่นย่อยอัตโนมัติ ไม่เกิน 6 รูปต่อแผ่น
               เงื่อนไข: JE มีรูปแนบ (เลือกไว้แล้ว) เท่านั้นถึงจะแสดงหน้านี้ — งานช่วงออกแบบ/เอกสารมักไม่มี
               รูปถ่ายหน้างานเลย จึง "เลื่อนหน้านี้ออกไปทั้งหน้า" แทนที่จะโชว์หน้าเปล่าๆ ว่า "ไม่มีรูปถ่าย"
               (ต่างจากเดิมที่ยังคงสร้างหน้าเปล่าไว้เสมอ 7 หน้าตายตัว) ผลคือถ้า JE ไม่มีรูปเลย หน้า "ความ
               ปลอดภัย" (เดิมหน้าที่ 5) จะขยับขึ้นมาเป็นหน้าถัดจากตารางสรุปทันที ไม่มีหน้าว่างคั่นกลาง —
               ถ้า JE มีรูปแม้แต่กลุ่มเดียว logic เดิม (จำกัด 6 รูปต่อแผ่น) ยังทำงานตามปกติทุกอย่าง ===== */}
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

          {/* ===== หน้าที่ 5: ความปลอดภัย — แบ่งแผ่นย่อยอัตโนมัติ ไม่เกิน 6 รูปต่อแผ่น (เดิมมี "คุณภาพงาน"
               รวมอยู่ในหน้านี้ด้วย แต่ตัด Tab คุณภาพงานออกจากทั้งระบบแล้ว เหลือแค่ความปลอดภัยอย่างเดียว) ===== */}
          {packEntriesIntoPrintPages(
            (() => {
              const cat = 'safety';
              const header = {
                key: `${cat}-header`,
                photoCount: 0,
                render: () => <h3 key={`${cat}-header`} className="report-preview__h">{CATEGORY_SECTION_LABELS[cat]}</h3>,
              };
              if (itemsByCategory[cat].length === 0) {
                return [header, {
                  key: `${cat}-empty`,
                  photoCount: 0,
                  render: () => <p key={`${cat}-empty`} className="report-preview__empty">-</p>,
                }];
              }
              return [
                header,
                ...itemsByCategory[cat].map((it, idx) => ({
                  key: `${cat}-${it.id}`,
                  photoCount: (it.photos || []).length,
                  render: () => (
                    <div key={`${cat}-${it.id}`}>
                      <p className="report-preview__list" style={{ marginBottom: 4 }}>{idx + 1}.) {it.content}</p>
                      {it.photos && it.photos.length > 0 && (
                        <div className="report-preview__photo-grid">
                          {it.photos.map((p) => (
                            <img key={p.id} src={p.url} alt="" className="report-preview__photo-img" />
                          ))}
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

          {/* ===== หน้าที่ 6: แผนงานสัปดาห์หน้า — เป็นกรณีพิเศษ (ต่างจากข้อ 2,4,5,6 ที่ปรับเป็น sub level1
               ตรงๆ) เพราะข้อนี้บังคับเลือกชื่องาน (WBS Level1) ก่อนเสมอถึงจะเพิ่มรายการได้ จึงมี 2 ระดับจริง:
               Level1 = ชื่อกลุ่มงานที่เลือก (1.) JG-1 - ออกแบบ, ถอย 22px) แล้วข้างใต้เป็น Level2 = รายการ
               ย่อยที่พิมพ์เอง (bullet ธรรมดา ถอย 44px ตาม logic เดิม ไม่ใช่เลขลำดับ) ===== */}
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

          {/* ===== หน้าที่ 7: ปัญหาอุปสรรค + งานเพิ่มลด + เรื่องที่ค้าง — ใส่เลขลำดับ "1.) xxx" ต่อจากที่แก้
               ข้อ 3 (แผนงานสัปดาห์หน้า) ไปแล้ว ตามที่ตกลงกันไว้ (รวมข้อ 6 ด้วย) ===== */}
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