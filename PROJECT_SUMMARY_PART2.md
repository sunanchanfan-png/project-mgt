# SIKARIN — สรุปบริบทโปรเจกต์ ภาค 2 (ต่อจาก PROJECT_SUMMARY_UPDATED.md)

> ไฟล์นี้ต่อจาก `PROJECT_SUMMARY_UPDATED.md` (หรือชื่อไฟล์สรุปภาคแรกที่ผู้ใช้เก็บไว้) — ครอบคลุมตั้งแต่
> เริ่มสร้าง **Menu 3: การจัดการโครงการ** จนถึงปัจจุบัน งานหลักคือระบบติดตามความคืบหน้า (progress
> tracking) ทั้งหมด รวมบั๊กจำนวนมากที่เจอระหว่างทางและวิธีแก้ — ควรอ่านหัวข้อ "บั๊กที่เจอ" ให้ครบก่อนแก้
> ฟีเจอร์นี้ เพราะหลายจุดดูเผินๆ เหมือนถูกต้องแต่มีบั๊กแฝงที่ไม่ชัดเจนจนกว่าจะเทสต์กับข้อมูลจริงข้ามหลายวัน

---

## 1. ภาพรวม Menu 3: การจัดการโครงการ

5 Tab ทั้งหมด ใช้ endpoint กลุ่ม `/api/progress/*`:

| Tab | Component | หน้าที่ |
|---|---|---|
| 1. งานสัปดาห์นี้ | `WeeklyProgressTab.jsx` (`week="this"`) | กรอก progress ของกิจกรรมงานที่ตกในสัปดาห์นี้ |
| 2. งานสัปดาห์หน้า | `WeeklyProgressTab.jsx` (`week="next"`) | เหมือน Tab1 แต่ดูสัปดาห์หน้า (component เดียวกัน) |
| 3. ตารางงานรวม | `OverallProgressTab.jsx` | ภาพรวมทั้งโปรเจกต์ ไม่กรองตามสัปดาห์ + filter กลุ่มงาน + print |
| 4. Main S-Curve | `SCurveTab.jsx` + `SCurveChart.jsx` | กราฟ Plan vs Actual ทั้งโปรเจกต์ |
| 5. Group S-Curve | `SCurveTab.jsx` + `SCurveChart.jsx` | เหมือน Tab4 แต่เลือกดูรายกลุ่มงานได้ |

**Container:** `ProjectManagement.jsx` — เลือกโครงการ + โชว์มูลค่า + tab switcher

---

## 2. Database Schema เพิ่มใหม่

`migration_010_progress_entries.sql`:

```sql
progress_entries (id, wbs_level3_id, entry_date, actual_percent, note, created_by, created_at)
progress_photos  (id, progress_entry_id, photo_url, created_at)
```

**กติกาสำคัญ (เปลี่ยนมาแล้วรอบหนึ่ง):** เดิมออกแบบเป็น **append-only** (INSERT ใหม่ทุกครั้งที่กรอก เก็บ
ประวัติทั้งหมด) — **เปลี่ยนเป็น UPSERT ตาม (wbs_level3_id, entry_date)** แล้ว เพราะ append-only ทำให้
มีหลายแถวชนวันเดียวกันได้ถ้าแก้ไขซ้ำในวันเดียวกัน แล้ว endpoint ต่างๆ ที่ query "ค่าล่าสุด" อาจหยิบคนละ
แถวกันได้ (ขึ้นกับรายละเอียดการเรียงลำดับ) ทำให้ Tab ต่างๆ โชว์ค่าไม่ตรงกัน — **ตอนนี้: 1 กิจกรรมงาน
+ 1 วัน = 1 แถวเท่านั้นเสมอ** บันทึกซ้ำวันเดียวกัน = UPDATE ทับ (ดู `POST /entries` ใน `progress.js`)

รูปถ่าย: ยังเป็นแค่ placeholder string (ชื่อไฟล์) ตามที่ตกลงไว้แต่แรก — **ยังไม่ได้ต่อระบบอัปโหลดไฟล์จริง**
(Cloudinary หรืออื่นๆ) จำกัดไว้สูงสุด 4 รูปต่อการบันทึก 1 ครั้ง (เช็คทั้ง frontend และ backend)

---

## 3. Backend

### `src/lib/progress.js` — pure functions, ไม่แตะ HTTP
- `getWeekRange(offsetWeeks, baseDate)` — **สัปดาห์แบบอาทิตย์-เสาร์** (ไม่ใช่จันทร์-อาทิตย์ — เคยผิดมา
  ก่อน เพราะ 30 ส.ค. 2569 คือวันอาทิตย์ ไม่ใช่จันทร์ ตามที่ผู้ใช้ต้องการ)
- `computePlanPercent(start, end, asOfDate)` — % แผนสะสมแบบเส้นตรงตามวันเริ่ม-จบของกิจกรรมงานเอง
- `dateRangesOverlap(...)` — เช็คช่วงวันที่ทับซ้อนกัน (ใช้กรองว่ากิจกรรมงานไหนอยู่ใน "สัปดาห์นี้/หน้า")
- `computeStatus(planPercent, actualPercent)` — เกณฑ์ ±5%: `null` (ยังไม่มีแผน+ยังไม่มี progress เลย,
  หน้าเว็บโชว์ "-"), `>5%` = "เร็วกว่าแผน" (เขียว), `<-5%` = "ช้ากว่าแผน" (แดง), อื่นๆ = "ตามแผน" (ปกติ)

### `src/routes/progress.js`
```
GET    /api/progress/weekly?project_id=X&week=this|next
GET    /api/progress/overall?project_id=X&level1_id=Y (optional)
GET    /api/progress/scurve?project_id=X&level1_id=Y (optional)
GET    /api/progress/entries?level3_id=X          (ประวัติ)
POST   /api/progress/entries                       (บันทึก/แก้ไข — UPSERT)
DELETE /api/progress/entries/latest?wbs_level3_id=X (ลบรายการล่าสุด)
```

**`getFlatWbsTree(projectId)`** — ดึง Level1→2→3 ทั้งหมดพร้อมคำนวณ `weight_percent`/`share_percent`
(สูตรเดียวกับ Gantt ทุกประการ) คืนเป็น array แบน ใช้ร่วมกันทุก endpoint ในไฟล์นี้

**`getLatestActualMap(level3Ids, asOfDate)`** — ดึง actual_percent ล่าสุดของหลายกิจกรรมงานพร้อมกัน
**สำคัญมาก: clamp `asOfDate` ไม่ให้เกิน "วันนี้จริง" เสมอ** ไม่ว่าใครจะเรียกด้วยวันที่ในอนาคตแค่ไหนก็ตาม
(ป้องกันข้อมูลขยะเก่าที่มี entry_date ผิดเพี้ยนจากบั๊กในอดีต โผล่มาปนกับผลลัพธ์ — ดูหัวข้อบั๊กข้อ 3)

**`buildProgressTree(flatWithProgress)`** — รวม flat array เป็น tree 3 ระดับ, roll-up plan/previous/
actual ของ L1/L2 ด้วย **weighted average ถ่วงน้ำหนักด้วย weight_percent** (ไม่ใช่ average ธรรมดา)

**`pruneEmptyBranches(groups)`** — ตัดกิ่ง L1/L2 ที่ไม่เหลือกิจกรรมงานเลย (เช่นหลังกรองงานเสร็จ 100%
ออกจาก Tab รายสัปดาห์แล้วไม่เหลืออะไร)

**Role:** `POST /entries` และ `DELETE /entries/latest` เปิดให้ `admin`, `pm`, `foreman` (**ต้องมี
foreman ด้วย** เคยลืมมาก่อนทำให้ foreman ใช้งานไม่ได้แบบเงียบๆ)

---

## 4. Frontend

### ไฟล์ทั้งหมดใน `src/pages/ProjectManagement/`
```
ProjectManagement.jsx     # container: เลือกโครงการ, มูลค่า, tab switcher
ProjectManagement.css     # CSS ทั้งหมดของ Menu 3 (self-contained ตาม convention เดิม)
WeeklyProgressTab.jsx     # Tab 1+2 (ใช้ component เดียวกัน, ต่าง prop week/editable)
OverallProgressTab.jsx    # Tab 3
SCurveTab.jsx             # Tab 4+5 (ใช้ component เดียวกัน, ต่าง prop showGroupFilter)
SCurveChart.jsx           # กราฟ SVG มือเขียนเอง (ไม่มี recharts ในโปรเจกต์)
printUtils.js             # ฟังก์ชันกลาง: ตัดคอลัมน์ออกจากตารางก่อนพิมพ์ + เอาความกว้างไปเพิ่ม col แรก
```

### Interaction Model ของตาราง (Tab 1/2/3 ใช้ pattern เดียวกัน)
- ทุกแถว **default = read-only**, กด **"แก้ไข"** (ลิงก์ข้อความขีดเส้นใต้ สี `--accent`, ไม่ใช่ปุ่มกล่อง)
  ถึงจะเปิด input ให้กรอก "ปัจจุบัน" (= % ที่เพิ่มขึ้น "วันนี้" ไม่ใช่ค่าสะสม)
- กด **"บันทึก"** → POST ค่าใหม่ = `ก่อนหน้า + ที่กรอก`, exit edit mode, refetch
- กด **"ลบ"** (โผล่เฉพาะแถวที่มีการบันทึกไว้แล้ว) → ลบรายการล่าสุดทิ้ง มี confirm ก่อนเสมอ
- **"ปัจจุบัน" คำนวณจากข้อมูลจริงเสมอ** (`actual_percent - previous_percent`) ไม่ใช่ local state ที่หาย
  ไปตอน refresh — เพื่อให้ค้างแสดงค่าที่บันทึกไว้ถูกต้องเสมอแม้จะปิด/เปิดหน้าใหม่
- Input ตัวเลข: คลิกเข้าช่องที่มีค่า "0" จะเคลียร์ว่างทันที (ไม่ต้องลบ 0 เอง) + ไม่มีลูกศร spinner (CSS
  `-webkit-appearance: none`)

### Tab 2 กฎพิเศษ: `also_in_this_week`
กิจกรรมงานที่ **คร่อม 2 สัปดาห์** (ทับซ้อนทั้งสัปดาห์นี้และสัปดาห์หน้า) จะ **แก้ไขได้แค่จาก Tab 1
เท่านั้น** — ใน Tab 2 แถวนี้โชว์ "ดูที่ Tab สัปดาห์นี้" แทนปุ่มแก้ไข (กันแก้ไขซ้อนกันคนละจุดสำหรับ
กิจกรรมงานเดียวกัน) Backend คำนวณ `also_in_this_week` แล้วส่งมาให้ ไม่ต้องคำนวณเองฝั่ง frontend

**สำคัญ:** สำหรับแถวเหล่านี้ **ห้ามคำนวณ plan/previous/actual ด้วยขอบเขตสัปดาห์หน้า** ต้องปล่อยให้
ใช้สูตรเดียวกันทุกแถว (คำนวณจากขอบเขตของสัปดาห์ที่กำลังดูอยู่ตามปกติ) — "1 วันก่อนสัปดาห์หน้าเริ่ม"
มันคือ "วันสุดท้ายของสัปดาห์นี้" อยู่แล้วโดยธรรมชาติ ไม่ต้องแยกเป็นกรณีพิเศษเลย (เคยลองแยกเป็นกรณี
พิเศษแล้วพัง ต้อง revert — ดูบั๊กข้อ 4)

### %W column
- Level1/Level2: `weight_percent.toFixed(2)%`
- **Level3: `Math.round(share_percent)%`** (ไม่ใช่ weight_percent! เคยผิดมาก่อน)

### ความกว้างคอลัมน์ (ตาราง Tab 1/2/3)
ใช้ `<colgroup>` + `table-layout: fixed` กำหนดความกว้างเป็น % ตายตัวตามที่ผู้ใช้ระบุมาเป็นภาพ (สัดส่วน
px/1220px) — Tab1/2 มี 9 คอลัมน์ (รวม รูปถ่าย+การจัดการ), Tab3 มี 9 คอลัมน์เหมือนกันแต่ "รูปถ่าย" ถูก
แทนด้วย "สถานะ"

### Mobile
ตารางห่อ `.progress-table-scroll { overflow-x: auto; }` + `.progress-table { min-width: 760px; }`
+ `white-space: nowrap` ทุกช่อง — ให้ scroll แนวนอนแทนบีบคอลัมน์จนอ่านไม่ออก

### Print (Tab 1/2/3 ทั้งหมด)
ใช้เทคนิคเดียวกับ Gantt (isolated `window.open()` + `<table><thead>` จริง) ผ่านฟังก์ชันกลาง
`buildPrintTableHTML(selector, excludeColIndexes)` ใน `printUtils.js`:
- Tab 1/2: ตัดคอลัมน์ "รูปถ่าย" + "การจัดการ" ออก (index 7,8)
- Tab 3: ตัดคอลัมน์ "การจัดการ" ออก (index 8)
- ความกว้างที่ตัดออกจะถูกบวกเพิ่มให้คอลัมน์แรก (โครงสร้างงาน) อัตโนมัติ
- Title/info bar format มาตรฐาน (ใช้ font-size เดียวกันทุก Tab: h2=16px, p.p-sub=12px):
  - Tab1/2: "รายงานความคืบหน้างานสัปดาห์นี้/หน้า" + "ช่วงวันที่ DD/MM/YYYY - DD/MM/YYYY"
  - Tab3: "รายงานความคืบหน้ารวมทั้งโครงการ" + "ช่วงวันที่ (วันเริ่มสัญญา) - (วันนี้)"

---

## 5. บั๊กสำคัญที่เจอ + วิธีแก้ (เรียงตามลำดับเวลา — อ่านให้ครบก่อนแก้โค้ดส่วนนี้)

### 1. Column count mismatch → แถวเกินตาราง + ค่าเลื่อนคอลัมน์ผิด
แถว Level1/Level2 ใช้ `colSpan` ผสมกับจำนวนช่องปกติ คำนวณผิดจนมีคอลัมน์เกิน 1 ช่อง ทำให้ค่าทั้งหมด
เลื่อนไปอยู่ผิดตำแหน่ง (เช่น "รูปถ่าย" โชว์ % ที่จริงเป็นของ "คงเหลือ") **แก้:** เขียนทุก `<td>` แยกชัดเจน
จำนวนตรงกับ header เป๊ะ ไม่ใช้ colSpan เดา

### 2. CSS specificity: left-align ไม่ทำงาน
`.progress-table__label-col { text-align: left }` (1 คลาส) แพ้ `.progress-table td { text-align:
center }` (1 คลาส + 1 element) เสมอไม่ว่าจะเขียนกฎไหนก่อนหลังในไฟล์ **แก้:** ใช้
`.progress-table td.progress-table__label-col` (2 คลาส + 1 element) ให้ specificity สูงกว่าแน่นอน

### 3. Client-computed date → ข้อมูลหาย/ไม่ sync ข้าม endpoint
เดิมให้ client (browser) คำนวณ `entry_date` เองจาก `new Date()` ถ้านาฬิกาเครื่อง client ไม่ตรงกับ
เซิร์ฟเวอร์ (หรือ timezone ต่างกัน ใกล้เที่ยงคืน UTC) entry_date ที่บันทึกอาจ "ล้ำหน้า" วันที่ที่เซิร์ฟเวอร์
ใช้ query "ณ วันนี้" ทำให้หา entry ไม่เจอ (โชว์ 0% ทั้งที่มีข้อมูลจริง) **แก้ 2 ชั้น:**
  - ให้ backend คำนวณ `entry_date` เองเสมอ (`fmtISO(new Date())`) ไม่รับจาก client
  - `getLatestActualMap` clamp `asOfDate` ไม่ให้เกินวันนี้จริงเสมอ (กันข้อมูลขยะเก่าที่มี entry_date
    ผิดเพี้ยนจากบั๊กนี้ตอนยังไม่ได้แก้ ยังหลงเหลืออยู่ใน DB โผล่มาปนกับผลลัพธ์ — ดู Tab งานสัปดาห์หน้าที่
    query ไกลถึงอนาคตกว่า Tab อื่น มีโอกาสเจอขยะนี้มากที่สุด)

### 4. Overlap week-boundary "fix" ที่ผิด แล้วต้อง revert
เคยลองให้แถว `also_in_this_week` คำนวณด้วยขอบเขต "สัปดาห์นี้" แยกเป็นกรณีพิเศษ (คิดว่าจะแก้ปัญหาตัวเลข
ไม่ตรงกัน) **แต่จริงๆ มันคือการแก้ผิดจุด** — ระบบเดิม (ไม่ต้องมีกรณีพิเศษ) ถูกต้องอยู่แล้ว เพราะ "1 วันก่อน
สัปดาห์หน้าเริ่ม" มันคือ "วันสุดท้ายของสัปดาห์นี้" โดยธรรมชาติอยู่แล้ว ต้อง revert กลับไปใช้สูตรเดียวกัน
ทุกแถวแบบเดิม **บทเรียน:** ก่อนเพิ่มกรณีพิเศษ (special case) ให้ตรวจสอบให้แน่ใจก่อนว่าสูตรทั่วไปมันผิด
จริง อย่ารีบแก้ตามอาการที่เห็นโดยไม่ไล่คำนวณมือให้ครบก่อน

### 5. UPSERT เดิมเป็น append-only → แก้ไขซ้ำวันเดียวกันไม่ทับ
ก่อนแก้เป็น UPSERT (ดูหัวข้อ 2) การแก้ไขค่าซ้ำในวันเดียวกัน (เช่น 60%→50%) จะสร้างแถวใหม่ซ้อนกัน
ไม่ overwrite ทำให้ query "ล่าสุด" คนละจุดหยิบคนละแถวได้ Tab1/Tab3 โชว์ไม่ตรงกัน

### 6. Role permission ไม่ครบ
`requireRole('admin', 'pm')` ไม่มี `foreman` ทั้งที่ควรเป็น role หลักที่กรอก progress หน้างาน ทำให้
บันทึก/ลบไม่ได้แบบเงียบๆ (403 แต่บางทีดูจากอาการเหมือน "กดแล้วไม่มีอะไรเกิดขึ้น")

**บทเรียนรวม:** บั๊กพวกนี้ส่วนใหญ่ **ทดสอบแบบ isolated (mock DB คงที่) ผ่านหมด** แต่พังตอนใช้งานจริง
ข้ามวัน/ข้าม role/ข้าม endpoint พร้อมกัน — เวลาเทสต์ควรจำลองสถานการณ์ "เวลาผ่านไปจริง" (เปลี่ยน mock
Date ข้ามวัน) และ "role ต่างๆ" ด้วย ไม่ใช่แค่ happy-path เดียว

---

## 6. Known Limitations (ยังไม่ทำ/ตั้งใจเว้นไว้)

- **รูปถ่าย:** ยังเป็นแค่ placeholder (ชื่อไฟล์) ไม่มีระบบอัปโหลดจริง — รอผู้ใช้ตัดสินใจว่าจะต่อ Cloudinary
  หรือเก็บไฟล์ฝั่งเซิร์ฟเวอร์เอง
- **S-Curve จุดข้อมูล:** สุ่มทุก 7 วัน + วันที่เคยกรอกจริง — โปรเจกต์ยาวมากอาจมีจุดเยอะ ยังไม่ได้ปรับความ
  ละเอียดให้ scale ตามความยาวโปรเจกต์
- **การแก้ไขผ่าน Tab 3:** สะท้อนกลับ Tab 1/2 อัตโนมัติ (ข้อมูลชุดเดียวกัน ไม่มี sync แยก) — แต่ "ก่อนหน้า"/
  "ปัจจุบัน" ของ Tab 3 คำนวณจาก "เมื่อวาน"/"วันนี้" (รายวัน) ต่างจาก Tab 1/2 ที่คำนวณจากขอบเขตสัปดาห์
  — ถ้าผู้ใช้สับสนเรื่องนี้อีก ให้ทวนความเข้าใจตรงนี้ก่อนแก้โค้ด

---

## 7. .gitignore (ตรวจ/แก้ไปแล้วในรอบนี้)

พบว่า **backend ไม่มี `.gitignore` เลย** ทั้งที่มีไฟล์ `.env` จริง (มี `DATABASE_URL`, `JWT_SECRET`) วางอยู่
ในโฟลเดอร์ — เสี่ยงหลุดเข้า git ได้ถ้าไม่ระวัง สร้าง `.gitignore` ให้ backend แล้ว (ครอบคลุม `.env`,
`node_modules/`, `logs`, `dist/`, `build/`) และเสริม frontend's `.gitignore` เดิมให้ครอบคลุม `build/`
ด้วย (เดิมมีแค่ `dist`/`dist-ssr`) พร้อมเพิ่ม root-level `.gitignore` เป็นตัวกันสำรองอีกชั้น

**ถ้ายังไม่เคย commit ไฟล์ `.env` เข้า git มาก่อน ก็ไม่มีอะไรต้องทำเพิ่ม** แต่ถ้า **เคย commit ไปแล้ว**
`.gitignore` จะไม่ช่วยลบมันออกจาก git history — ต้องใช้ `git rm --cached backend/.env` แล้ว commit
อีกครั้ง (และควรพิจารณาเปลี่ยน `JWT_SECRET`/database password ใหม่ ถ้า repo เป็น public หรือมีคนนอก
เข้าถึงได้)
