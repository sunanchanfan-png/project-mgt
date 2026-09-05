// src/pages/ProjectManagement/SCurveChart.jsx
// กราฟ S-Curve แบบ SVG มือเขียนเอง (ไม่พึ่ง library ภายนอกอย่าง recharts ที่ยังไม่ได้ติดตั้งในโปรเจกต์นี้
// — สอดคล้องกับแนวทางเดิมของแอปที่วาด Gantt bar เองด้วย SVG/CSS ธรรมดาอยู่แล้ว)
// รับ points = [{ date: 'YYYY-MM-DD', plan: number, actual: number|null }] แบบรายสัปดาห์เท่านั้น
// (จุดแรก = วันเริ่มสัญญา จุดถัดไปคือวันอาทิตย์ของทุกสัปดาห์ จุดสุดท้าย = วันสิ้นสุดสัญญา — คำนวณมาจาก
// backend แล้วทั้งหมด)
// รับ today = { date, plan, actual } ค่า ณ วันนี้จริง (ไม่ใช่จุดบนแกนกราฟ) ใช้วาดกล่องสรุปพร้อมเส้นชี้

const WIDTH = 900;
const HEIGHT = 376; // ลดจากเดิม 400 (ตัดช่องว่างบน-ล่างที่เหลือเฟือออกไป 24 หน่วย ตามที่ขอ ไม่ได้ลดพื้นที่
// กราฟ/กริดจริง — plotHeight เท่าเดิมทุกประการ เพราะ PAD_TOP/PAD_BOTTOM ก็ลดลงเท่ากันพอดี)
const PAD_LEFT = 46;
const PAD_RIGHT = 20;
const PAD_TOP = 60; // ลดจากเดิม 74 — เหลือระยะห่างจากขอบล่างกล่องสรุป (y=48) ถึงเส้นกริดบนสุด ~12px พอดี
const PAD_BOTTOM = 30; // ลดจากเดิม 40 — label วันที่ยังไม่ชิดขอบล่างเกินไป (เหลือระยะ ~12px ใต้ตัวอักษร)
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const BOX_HEIGHT = 42;
const BOX_Y = 6;
const BOX_MIN_WIDTH = 110; // กันกล่องแคบเกินไปจนดูบีบ ถ้า text สั้นมาก
const BOX_H_PADDING = 14; // padding รวมซ้าย+ขวาภายในกล่อง (ต่อ 1 ด้าน = 7px)
const CALLOUT_FONT_SIZE = 11; // ต้องตรงกับ font-size ของ .scurve-chart__callout-text ใน CSS

function fmtShortDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ประมาณความกว้างของข้อความใน SVG แบบคร่าวๆ (ไม่มี DOM ให้วัดจริงตอน SSR/ก่อน mount) โดยใช้ค่าเฉลี่ย
// ความกว้างต่อตัวอักษรของฟอนต์ sans-serif ทั่วไป — พอเพียงสำหรับทำกล่องให้ "พอดี" กับข้อความตัวเลข/อังกฤษ
// ล้วนแบบนี้ (ไม่ต้องเป๊ะ pixel-perfect)
function estimateTextWidth(str, fontSize) {
  return str.length * fontSize * 0.58;
}

export default function SCurveChart({ points, today, title, compact = false, showLegend = true, onClick }) {
  if (!points || points.length === 0) {
    return <p className="pdata-status pdata-status--warn">ยังไม่มีข้อมูลเพียงพอสำหรับวาดกราฟ (ต้องมีกิจกรรมงานที่กำหนดวันที่แล้ว)</p>;
  }

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const n = points.length;
  const xFor = (i) => PAD_LEFT + (n === 1 ? 0 : (i / (n - 1)) * plotWidth);
  const yFor = (v) => PAD_TOP + plotHeight - (Math.max(0, Math.min(100, v)) / 100) * plotHeight;

  const planPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.plan)}`).join(' ');

  // เส้น actual: วาดต่อเนื่องเฉพาะช่วงที่มีค่าจริง (ไม่ใช่ null) — พอเจอ null (อนาคต) ให้ตัดเส้นแค่นั้น
  const actualSegments = [];
  let currentSeg = [];
  points.forEach((p, i) => {
    if (p.actual === null || p.actual === undefined) {
      if (currentSeg.length > 0) { actualSegments.push(currentSeg); currentSeg = []; }
    } else {
      currentSeg.push(i);
    }
  });
  if (currentSeg.length > 0) actualSegments.push(currentSeg);
  const actualPaths = actualSegments
    .filter((seg) => seg.length > 1) // จุดเดี่ยวโดดๆ (length=1) วาดเป็นเส้นไม่ได้อยู่แล้ว (มีแต่ M ไม่มี L) ตัดทิ้งกันมาร์กอัปรก
    .map((seg) => seg.map((i, j) => `${j === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(points[i].actual)}`).join(' '));

  // เส้นกริดแนวนอนทุก 20%
  const gridLines = [0, 20, 40, 60, 80, 100];

  // label แกน x: โหมดปกติโชว์ทุกจุด (ทุกวันอาทิตย์) ตามที่ผู้ใช้ต้องการเห็นวันที่ครบทุกสัปดาห์ — แต่โหมด
  // compact (การ์ดย่อในกริดรวมทุกกลุ่มงาน) พื้นที่แคบมาก โชว์ครบทุกจุดจะทับกันอ่านไม่ออก เลยโชว์แค่ต้น/กลาง/
  // ท้าย 3 จุดพอ (เพียงพอสำหรับดูภาพรวม ไม่ได้ใช้ดูรายละเอียดวันที่แบบเป๊ะๆ ในโหมดนี้อยู่แล้ว)
  const xLabels = compact
    ? [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => ({ i, label: fmtShortDate(points[i].date) }))
    : points.map((p, i) => ({ i, label: fmtShortDate(p.date) }));

  // ตำแหน่งของ "วันนี้" บนกราฟ — หาสัปดาห์ (ช่วงจุดที่ i และ i+1) ที่วันนี้ตกอยู่ แล้ว interpolate ตาม
  // สัดส่วนจำนวนวันจริงภายในสัปดาห์นั้น (ไม่ใช่แค่ index) เพื่อให้ตำแหน่งเส้นชี้ตรงกับวันที่จริง
  let todayX = null;
  let todayPlanY = null;
  let todayActualY = null;
  let gainValue = null;
  if (today && today.date) {
    let bracket = points.length - 2 >= 0 ? points.length - 2 : 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      if (today.date >= points[i].date && today.date <= points[i + 1].date) { bracket = i; break; }
    }
    const nextIdx = Math.min(bracket + 1, points.length - 1);
    const d0 = new Date(points[bracket].date);
    const d1 = new Date(points[nextIdx].date);
    const dt = new Date(today.date);
    const segDays = Math.max(1, (d1 - d0) / MS_PER_DAY);
    const elapsedDays = Math.max(0, (dt - d0) / MS_PER_DAY);
    const frac = nextIdx === bracket ? 0 : Math.min(1, elapsedDays / segDays);
    todayX = xFor(bracket) + frac * (xFor(nextIdx) - xFor(bracket));
    todayPlanY = yFor(today.plan);
    todayActualY = yFor(today.actual);
    gainValue = today.actual - today.plan;
  }

  // เส้น actual ต่อเนื่องจาก "จุดข้อมูลจริงล่าสุด" (สัปดาห์ที่จบสมบูรณ์ล่าสุด หรือจุดเริ่ม 0% ถ้ายังไม่ถึง
  // สัปดาห์แรกด้วยซ้ำ) ไปยังตำแหน่ง "วันนี้จริง" (รวมความคืบหน้าที่ยังไม่ครบสัปดาห์เข้าไปด้วย) — ถ้าไม่มี
  // ช่วงนี้ พอวันนี้ยังไม่ถึงวันอาทิตย์แรกเลยจะเห็นแค่จุดข้อมูลจริงจุดเดียว (เส้นวาดไม่ได้ ต้องมีอย่างน้อย 2
  // จุด) ทำให้ดูเหมือนจุดสีเขียวลอยๆ ไม่ต่อกับอะไรเลย ทั้งที่จริงมันคือความคืบหน้าต่อเนื่องจาก 0% มาถึงตอนนี้
  let todayConnectorPath = null;
  if (todayX !== null) {
    let lastActualIdx = -1;
    for (let i = points.length - 1; i >= 0; i -= 1) {
      if (points[i].actual !== null && points[i].actual !== undefined) { lastActualIdx = i; break; }
    }
    if (lastActualIdx !== -1) {
      const lastX = xFor(lastActualIdx);
      const lastY = yFor(points[lastActualIdx].actual);
      if (todayX >= lastX) {
        todayConnectorPath = `M ${lastX} ${lastY} L ${todayX} ${todayActualY}`;
      }
    }
  }

  const isGain = gainValue !== null && gainValue >= 0;
  const line1Text = today ? `Plan ${today.plan.toFixed(1)}% / Actual ${today.actual.toFixed(1)}%` : '';
  const line2Text = today
    ? (isGain ? `Gain (+) ${gainValue.toFixed(1)}%` : `Delay (-) ${Math.abs(gainValue).toFixed(1)}%`)
    : '';

  // ความกว้างกล่อง = พอดีกับข้อความที่ยาวที่สุดในสองแถว (บวก padding) ไม่ตายตัวอีกต่อไป กันกล่องกว้างเกิน
  // ความจำเป็นตอนตัวเลขสั้นๆ (เช่น "Gain (+) 0.9%")
  const boxWidth = Math.max(
    BOX_MIN_WIDTH,
    Math.max(estimateTextWidth(line1Text, CALLOUT_FONT_SIZE), estimateTextWidth(line2Text, CALLOUT_FONT_SIZE)) + BOX_H_PADDING
  );

  let boxX = null;
  let boxY = null;
  if (todayX !== null) {
    boxX = Math.max(PAD_LEFT, Math.min(WIDTH - PAD_RIGHT - boxWidth, todayX - boxWidth / 2));
    boxY = BOX_Y;
  }

  return (
    <div
      className={`scurve-chart${compact ? ' scurve-chart--compact' : ''}${onClick ? ' scurve-chart--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e); } : undefined}
    >
      <div className="scurve-chart__header">
        {title && <h3 className="scurve-chart__title">{title}</h3>}
        {showLegend && (
          <div className="scurve-chart__legend">
            <span className="scurve-chart__legend-item">
              <span className="scurve-chart__swatch scurve-chart__swatch--plan" /> แผน
            </span>
            <span className="scurve-chart__legend-item">
              <span className="scurve-chart__swatch scurve-chart__swatch--actual" /> ผลงานจริง
            </span>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="scurve-chart__svg" preserveAspectRatio="xMidYMid meet">
        {/* เส้นกริดแนวนอน + label % */}
        {gridLines.map((g) => (
          <g key={g}>
            <line x1={PAD_LEFT} y1={yFor(g)} x2={WIDTH - PAD_RIGHT} y2={yFor(g)} className="scurve-chart__grid" />
            <text x={PAD_LEFT - 8} y={yFor(g) + 4} className="scurve-chart__axis-label" textAnchor="end">{g}%</text>
          </g>
        ))}
        {/* เส้นกริดแนวตั้งตามแต่ละจุดวันที่ (รายสัปดาห์) — เส้นบาง สีเทา สไตล์เดียวกับเส้นแนวนอน */}
        {points.map((p, i) => (
          <line
            key={`v-${p.date}`}
            x1={xFor(i)} y1={PAD_TOP} x2={xFor(i)} y2={HEIGHT - PAD_BOTTOM}
            className="scurve-chart__grid"
          />
        ))}
        {/* กรอบตารางรอบพื้นที่กราฟทั้งหมด — เส้นบาง สีเทา สไตล์เดียวกับเส้นกริด */}
        <rect
          x={PAD_LEFT} y={PAD_TOP} width={plotWidth} height={plotHeight}
          className="scurve-chart__grid-border"
        />
        {/* label วันที่ แกน x (รายสัปดาห์) */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={xFor(i)} y={HEIGHT - PAD_BOTTOM + 18} className="scurve-chart__axis-label" textAnchor="middle">
            {label}
          </text>
        ))}
        {/* เส้นแผน (plan) - เส้นเต็มสีส้ม */}
        <path d={planPath} className="scurve-chart__line-plan" />
        {/* เส้นผลงานจริง (actual) - เส้นเต็มสีเขียว */}
        {actualPaths.map((d, i) => <path key={i} d={d} className="scurve-chart__line-actual" />)}
        {/* ต่อเส้น actual จากจุดข้อมูลจริงล่าสุดไปถึงตำแหน่งวันนี้จริง (เผื่อยังไม่ถึงวันอาทิตย์แรก/สัปดาห์
            ล่าสุดยังไม่จบ จะได้ไม่เห็นเป็นแค่จุดลอยๆ ไม่มีเส้นต่อ) */}
        {todayConnectorPath && <path d={todayConnectorPath} className="scurve-chart__line-actual" />}

        {/* เส้นชี้ + กล่องสรุป Plan/Actual/Gain(+)/Delay(-) ณ วันนี้ */}
        {todayX !== null && (
          <g className="scurve-chart__today">
            <line
              x1={todayX} y1={PAD_TOP} x2={todayX} y2={HEIGHT - PAD_BOTTOM}
              className="scurve-chart__today-line"
            />
            <circle cx={todayX} cy={todayPlanY} r={4} className="scurve-chart__dot scurve-chart__dot--plan" />
            <circle cx={todayX} cy={todayActualY} r={4} className="scurve-chart__dot scurve-chart__dot--actual" />

            {/* เส้นชี้จากกล่องสรุปลงไปยังตำแหน่งวันนี้บนกราฟ */}
            <line
              x1={boxX + boxWidth / 2} y1={boxY + BOX_HEIGHT}
              x2={todayX} y2={Math.min(todayPlanY, todayActualY)}
              className="scurve-chart__callout-leader"
            />

            <rect x={boxX} y={boxY} width={boxWidth} height={BOX_HEIGHT} rx={6} className="scurve-chart__callout-box" />
            <text x={boxX + boxWidth / 2} y={boxY + 18} textAnchor="middle" className="scurve-chart__callout-text">
              {line1Text}
            </text>
            <text
              x={boxX + boxWidth / 2} y={boxY + 34} textAnchor="middle"
              className={`scurve-chart__callout-text ${isGain ? 'scurve-chart__callout-text--gain' : 'scurve-chart__callout-text--delay'}`}
            >
              {line2Text}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
