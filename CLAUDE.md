# CLAUDE.md

คำแนะนำสำหรับ Claude (หรือ AI agent อื่น) เวลาทำงานกับโปรเจกต์นี้ — อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง

> **บริบทละเอียดเพิ่มเติม:** ดู `PROJECT_SUMMARY.md`, `PROJECT_SUMMARY_PART2.md`, และ
> `PROJECT_SUMMARY_PART3.md` ที่ root (ไฟล์หลังต่อจากไฟล์แรกเรียงตามลำดับเวลา) — สรุปทุกฟีเจอร์ที่ทำไป
> แล้ว บั๊กที่เจอ+วิธีแก้ และเหตุผลการตัดสินใจเชิงเทคนิคต่างๆ ไว้ละเอียด ถ้าจะแก้ฟีเจอร์เดิมควรอ่านไฟล์
> เหล่านี้ก่อนเสมอ — **PART3 สำคัญที่สุดตอนนี้** เพราะมีเรื่อง deploy จริง (GitHub/Railway/Vercel), PWA,
> และแอปมือถือสำหรับ foreman ที่เพิ่งทำเสร็จ ยังไม่มีในไฟล์ PART1/PART2 เดิม

---

## โปรเจกต์นี้คืออะไร

**SIKARIN** — ระบบบริหารจัดการโครงการก่อสร้าง (Construction Project Management System) ภาษา UI เป็นภาษาไทยทั้งหมด ครอบคลุม: เปิดโครงการ, สร้างข้อมูลโครงสร้างงาน (WBS 3 ระดับ) พร้อม Gantt Chart และ Task Dependency, ระบบติดตามความคืบหน้า (บันทึกงานประจำสัปดาห์ + ตารางงานรวม + S-Curve), ระบบจัดทำรายงานประจำสัปดาห์ (9 Tab พร้อม export Word), แอปมือถือแยกสำหรับ foreman (PWA), และระบบกำหนดสิทธิ์ผู้ใช้งานตาม Menu/Tab

**Deploy อยู่จริงแล้ว:** Backend บน Railway, Frontend บน Vercel, GitHub เป็น source control — ดูขั้นตอน deploy ละเอียดใน `DEPLOY_GUIDE.md` ที่ root

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Backend | Node.js + Express, PostgreSQL (Supabase), JWT auth (`jsonwebtoken`, `bcrypt`), Cloudinary (อัปโหลดรูปถ่ายจริงแล้ว — ไม่ใช่ placeholder อีกต่อไป), `docx` (สร้างไฟล์ Word) |
| Frontend | React (Vite), React Router, Axios, `vite-plugin-pwa` (PWA สำหรับแอป foreman) |
| Database schema | `project_mgt` (schema เดียว ไม่ใช่ `public`) |
| กราฟ/ชาร์ต | วาดเอง (SVG มือเขียน) — **ไม่มี** `recharts`/`chart.js` ติดตั้งอยู่ในโปรเจกต์ อย่าเพิ่มโดยไม่จำเป็น (เพิ่ม dependency ใหม่ต้องให้ผู้ใช้ `npm install` เองบนเครื่องจริงด้วย) |
| Deploy | Railway (backend), Vercel (frontend), GitHub (source control) |

---

## โครงสร้างโฟลเดอร์ (ที่ root ของ repo)

```
backend/
  src/
    server.js              # entry point, mount routes ทั้งหมดที่นี่, CORS ใช้ CORS_ORIGIN env var
    db.js                   # pg connection pool + custom type parser (DATE columns)
    middleware/auth.js       # verifyToken, requireRole(...roles), requirePermission(menu, tab), hasPermission(user, menu, tab)
    lib/
      menuRegistry.js         # รายการ Menu/Tab ทั้งหมดในระบบ (แหล่งความจริงเดียว) — ไม่มี Tab "คุณภาพงาน" แล้ว (ตัดออกทั้งระบบ)
      progress.js              # สัปดาห์แบบ contract-anchored (ไม่ใช่ปฏิทินอาทิตย์-เสาร์ล้วนอีกต่อไป — ดูหัวข้อ 5)
      cloudinary.js            # uploadBuffer() — อัปโหลดรูปจริงขึ้น Cloudinary
    routes/
      auth.js                  # /register, /login
      permissions.js            # เฉพาะ system_mgr/admin: อนุมัติ+กำหนดสิทธิ์ user
      photos.js                 # POST /upload — multer + Cloudinary (ใช้ร่วมกันทุก Tab ที่แนบรูปได้)
      reports.js                 # Menu 5 ทั้งหมด (ดูหัวข้อ Menu 5 ด้านล่าง) — ไฟล์ใหญ่ที่สุดในโปรเจกต์
  sql/
    migration_XXX_*.sql      # เรียงเลขตามลำดับ รันมือใน Supabase SQL Editor (ไม่มี migration runner อัตโนมัติ) — ล่าสุดถึง migration_016
    delete_all_progress_photos.sql  # สคริปต์ one-off ลบรูป progress_photos ทั้งหมด (มี SELECT preview ก่อน DELETE)
  railway.json               # Railway build/start config
  .env.example                # ตัวอย่างตัวแปรที่ต้องตั้งใน Railway (ห้ามเอาค่าตัวอย่างไปใช้จริง!)
  .env                       # DATABASE_URL, JWT_SECRET, PORT, CLOUDINARY_*, CORS_ORIGIN — ห้าม commit

frontend/
  src/
    api/client.js             # axios instance เดียว — 401 = force logout, 403 ไม่ force logout แล้ว
                               # (403 = สิทธิ์ไม่พอ ไม่ใช่ token เสีย ปล่อยให้แต่ละหน้าจอ handle เอง)
    hooks/useIsMobile.js       # เช็คขนาดจอ (breakpoint 768px) — ใช้สลับ layout มือถือ/PC
    context/
      AuthContext.jsx           # user + permissions, canAccessMenu(), canAccessTab()
      ProtectedRoute.jsx         # roles=[...] จำกัด role, isForemanRoute=true สำหรับ /foreman เท่านั้น
                                  # — role='foreman' จะถูกเด้งไป /foreman เสมอถ้าพยายามเข้า route อื่น
    components/               # Layout (sidebar default ปิดบนมือถือ, ปิดอัตโนมัติหลังเลือกเมนู), Sidebar
    pages/
      Login/                    # เข้าสู่ระบบ (มีปุ่มตา 👁️/🙈 โชว์/ซ่อนรหัสผ่าน) + สมัครสมาชิก
                                  # — redirect ตาม role: foreman → /foreman, อื่นๆ → /dashboard
      OpenProject/             # เมนู 1: เปิดโครงการ (มี status on/off — off จะถูกกรองออกจาก dropdown ทุกเมนู)
      ProjectData/              # เมนู 2: สร้างข้อมูลโครงการ
      ProjectManagement/         # เมนู 3: การจัดการโครงการ (5 tabs) — Tab "งานสัปดาห์นี้/หน้า" สลับเป็น
                                  # หน้าจอมือถือ (MobileForemanTab) อัตโนมัติถ้า role='foreman' บนจอแคบ
                                  # (role อื่นเห็นตาราง PC เสมอไม่ว่าจอกว้างแค่ไหน)
      Reports/                   # เมนู 5: จัดทำรายงาน (9 Tab) — ดูหัวข้อ Menu 5 ด้านล่าง
      Mobile/
        MobileForemanTab.jsx      # หน้าจอกรอกงาน JE แบบมือถือ (ทีละกิจกรรม เต็มจอ) ใช้ร่วมกันทั้ง
                                   # ProjectManagement.jsx (PC) และ ForemanApp.jsx (มือถือ)
      Foreman/
        ForemanApp.jsx             # หน้าแยกสำหรับ role=foreman — ไม่มี Sidebar เลย มี 4 Tab: งานสัปดาห์
                                    # นี้/หน้า, ความปลอดภัย, S-Curve
        ForemanSafetyTab.jsx       # +Safety เพิ่มรายการความปลอดภัย (บันทึกลง report_items เดียวกับ
                                    # Menu5 Tab2 — ข้อมูลชุดเดียวกัน โผล่ทันทีที่ Menu5)
        ForemanSCurveTab.jsx       # ดู S-Curve ภาพรวมทั้งโครงการ (อ่านอย่างเดียว)
      PermissionApproval/        # หน้า "อนุมัติและกำหนดสิทธิ์" — เฉพาะ system_mgr/admin
    App.jsx                    # routing ทั้งหมด รวม /foreman
    main.jsx                   # entry point — ลงทะเบียน Service Worker (PWA) ที่นี่
  vite.config.js              # vite-plugin-pwa config (manifest, workbox skipWaiting+clientsClaim)
  vercel.json                 # SPA rewrite rule (จำเป็นเพราะใช้ BrowserRouter — ไม่มีไฟล์นี้ = 404 ตอน
                               # เข้าหน้าย่อยตรงๆ หรือ refresh)
  .env.example                # VITE_API_URL ตัวอย่าง
```

**สำคัญ:** ทุกหน้า (`pages/<ชื่อเมนู>/`) มี CSS ไฟล์เป็นของตัวเอง **และคัดลอกคลาสพื้นฐานร่วม** (เช่น `.pdata-toolbar`, `.pdata-tabs`, `.btn-primary`, `.link-btn`, `.mono`) ซ้ำกันในแต่ละไฟล์ **ไม่ได้แชร์ CSS กลางไฟล์เดียว** — นี่คือธรรมเนียมที่ตั้งใจไว้ (แต่ละหน้า self-contained) ถ้าจะเพิ่มหน้าใหม่ ให้คัดลอกสไตล์พื้นฐานที่ต้องใช้มาไว้ในไฟล์ CSS ของหน้านั้นเอง อย่าคาดหวังว่าจะ "ได้ฟรี" จากการที่หน้าอื่น import ไว้ก่อนแล้ว

---

## Naming Conventions

### Backend
- Route files: `camelCase.js` ตรงกับ resource เอกพจน์/พหูพจน์ตาม endpoint จริง (เช่น `wbsLevel1.js` → `/api/wbs-level1`)
- ฟังก์ชัน SQL helper: `getXxx`, `computeXxx` (pure, ไม่แตะ `req`/`res`)
- Route handler: `router.get/post/put/delete('/path', [middleware], async (req, res) => {...})`
- Error response เสมอ: `{ error: 'ข้อความภาษาไทย' }` — ไม่ใช้ error code ภาษาอังกฤษเปล่าๆ

### Database
- ตาราง: `snake_case` พหูพจน์ (`wbs_level1`, `progress_entries`, `user_permissions`, `reports`, `report_items`, `report_item_photos`)
- คอลัมน์: `snake_case`
- WBS 3 ระดับใช้ prefix โค้ดต่างกัน: `JG-` (Level1 กลุ่มงานหลัก), `JN-` (Level2 รายการงาน), `JE-` (Level3 กิจกรรมงาน)
- Permission: `user_permissions(user_id, menu_key, tab_key)` — `tab_key = ''` (ค่าว่าง ไม่ใช่ NULL) หมายถึง "ทั้งเมนู" สำหรับเมนูที่ไม่มี tab ย่อย

### Frontend
- Component ไฟล์: `PascalCase.jsx` ชื่อตรงกับ default export
- CSS class: `kebab-case` แบบ BEM คร่าวๆ — `.block__element`, `.block__element--modifier` (เช่น `.progress-table__row--l1`, `.report-preview__list--numbered`)
- Route path: `kebab-case` ตรงกับชื่อโฟลเดอร์ page (เช่น `/project-management`) — ยกเว้น `/foreman` (ตรงเป๊ะ ไม่มี kebab)

---

## คำสั่ง Build / Dev / Test

**Backend** (`cd backend`)
```bash
npm install
npm start          # node src/server.js — รันตรงๆ ไม่มี nodemon/hot-reload ในตัว
```
ไม่มี test script จริง (`npm test` แค่ echo error) — ยังไม่มี testing framework ติดตั้งในโปรเจกต์

**Frontend** (`cd frontend`)
```bash
npm install
npm run dev        # vite dev server
npm run build      # vite build → dist/ (จะ generate Service Worker ด้วยผ่าน vite-plugin-pwa)
npm run lint       # eslint .
npm run preview    # preview build output
```

**Database migration:** ไม่มี migration runner — เปิด Supabase SQL Editor แล้วรันไฟล์ใน `backend/sql/migration_XXX_*.sql` ตามลำดับเลขด้วยมือ ทุกครั้งที่มี migration ใหม่ต้องแจ้งผู้ใช้ให้รันก่อน deploy โค้ดที่พึ่งพา schema นั้น

**Deploy (production จริง):**
```bash
cd C:\project-mgt   # หรือ path ที่ผู้ใช้เก็บ repo ไว้จริง
git add -A && git commit -m "..." && git push
```
Railway (backend) และ Vercel (frontend) จะ auto-deploy ทันทีที่ push ขึ้น GitHub ไม่ต้องทำอะไรเพิ่ม — ดู `DEPLOY_GUIDE.md` สำหรับ checklist เต็ม

---

## Pattern สำคัญที่ต้องรู้ก่อนแก้โค้ด (เรียนรู้จากบั๊กที่เจอจริง)

1. **วันที่ทั้งหมดต้อง "เซิร์ฟเวอร์เป็นเจ้าของ" เสมอ** — ห้ามให้ client ส่ง `entry_date`/`today` มาเอง ใช้ `fmtISO(new Date())` ฝั่ง backend เสมอ และ query ใดๆที่เทียบ "ณ วันที่ X" ควร clamp ไม่ให้มองเกินวันนี้จริง (`asOfDate > today ? today : asOfDate`)

2. **จำนวนคอลัมน์ในแต่ละแถวของ `<table>` ต้องตรงกับ `<thead>` เป๊ะทุกแถวเสมอ** — ห้ามใช้ `colSpan` แบบเดาสุ่ม ให้เขียนแยกทุก `<td>` ชัดเจนตามจำนวนคอลัมน์จริง

3. **CSS specificity: `.class` เดี่ยวแพ้ `.class element` เสมอ** — ถ้าจะ override text-align/สไตล์ของ cell เฉพาะ ให้เขียน selector ประกอบกับ element (`td.my-class` ไม่ใช่แค่ `.my-class`)

4. **%W ของ Level3 (JE) ใช้ `share_percent` ไม่ใช่ `weight_percent`** — `weight_percent` คือน้ำหนักเทียบทั้งโปรเจกต์, `share_percent` คือ % เทียบพ่อของตัวเอง

5. **progress_entries เป็น UPSERT ตาม (wbs_level3_id, entry_date) ไม่ใช่ append-only** — 1 กิจกรรมงาน + 1 วัน = 1 แถวเสมอ

6. **สัปดาห์นับแบบ "contract-anchored" (อิงวันเริ่มสัญญา) ไม่ใช่ปฏิทินอาทิตย์-เสาร์ล้วนอีกต่อไป** — สัปดาห์ 1 = วันเริ่มสัญญา ถึง อาทิตย์แรก (อาจไม่ครบ 7 วัน), สัปดาห์ 2 เป็นต้นไป = จันทร์-อาทิตย์เต็มสัปดาห์ — ดู `getProjectWeekNumber`/`getProjectWeekBoundaries` ใน `backend/src/lib/progress.js` (S-Curve ไม่ได้แก้ตาม เพราะ logic เดิมบังเอิญตรงกันอยู่แล้ว)

7. **Role ที่มีในระบบ: `admin`, `pm`, `foreman`, `viewer`, `system_mgr`** — ตรวจสอบให้ `requireRole(...)` ครอบคลุม role ที่ควรทำรายการนั้นได้จริงเสมอ `admin` และ `system_mgr` เป็น superuser ผ่าน `requirePermission`/`hasPermission` เสมอโดยไม่ต้องมีแถวใน `user_permissions`

8. **ก่อนสร้าง/แก้ไฟล์ที่ต้องส่งมอบให้ผู้ใช้ ให้ทดสอบด้วยการ render จริง (mock API + jsdom) ก่อนส่งทุกครั้ง** — ห้ามส่งโค้ดที่ตรวจแค่ syntax แล้วเดาว่าทำงานถูก

9. **ส่งไฟล์กลับให้ผู้ใช้แยกเป็น `backend.zip` และ `frontend.zip` เสมอ** โดย path ในซิปต้องเริ่มจาก `backend/...` หรือ `frontend/...`

10. **ระบบกำหนดสิทธิ์ (`user_permissions`) คุมคนละแกนกับ `requireRole`** — endpoint ที่ใช้ร่วมข้าม Menu (เช่น `/api/projects` GET) จงใจไม่กัน permission เพราะ Menu อื่นต้องพึ่งข้อมูลนี้เป็น shared reference — **ข้อยกเว้นสำคัญ**: `GET /reports/current` เดิมเคยผูกสิทธิ์กับ Tab `plan-progress` ตายตัว ทำให้ foreman ที่มีแค่สิทธิ์ Tab `safety` โดนบล็อก 403 ทั้งที่ควรผ่าน — แก้เป็นเช็คแบบ "มี Tab ไหนก็ได้ใน Menu 5" แทนแล้ว (ดูฟังก์ชันนี้ก่อนถ้าจะเพิ่ม endpoint แบบเดียวกันที่ต้องให้หลาย Tab เรียกร่วมกันได้)

11. **JWT/สิทธิ์ที่ browser จำไว้ไม่ sync กับ DB อัตโนมัติ** — ต้อง logout/login ใหม่หลังแก้ role/สิทธิ์ใน DB โดยตรง

12. **Bootstrap `system_mgr` คนแรกต้องทำผ่าน SQL โดยตรง** (ดูรายละเอียดใน PART1/PART2)

13. **เจอบั๊กที่แก้โค้ด/migration แล้วไม่มีผลจริง ให้สงสัยว่ามีโฟลเดอร์โปรเจกต์ซ้ำในเครื่องผู้ใช้ก่อน** — วิธีวินิจฉัยเร็วที่สุด: ให้ผู้ใช้ `pwd` ดู path จริงที่รันอยู่ + ลองแก้ข้อความ error เป็นข้อความทดสอบเฉพาะ (unique marker)

14. **403 ≠ token เสีย เสมอไป** — `api/client.js` เดิมเคย force-logout ทั้ง 401 และ 403 ทำให้ foreman ที่ login สำเร็จแต่ไปเรียก API ที่ยังไม่มีสิทธิ์ (403) โดนเด้งออกจากระบบทั้งที่ login ถูกต้อง แก้ให้ force-logout เฉพาะ 401 เท่านั้น (401 = token หมดอายุ/ไม่ถูกต้องจริงๆ, 403 = login ถูกต้องแต่สิทธิ์ไม่พอ ปล่อยให้แต่ละหน้าจอ handle เอง)

15. **รูปถ่ายที่ผูกกับ "รายการ 1 ครั้ง" (progress_entries, report_items) ต้อง preload รูปเดิมเสมอก่อนแก้ไข** — หน้าจอไหนก็ตามที่แก้ไข % หรือข้อความของรายการที่มีรูปแนบอยู่แล้ว **ต้องโหลดรูปเดิมมาใส่ state ก่อนเสมอ** ไม่ใช่เริ่มจาก state ว่างเปล่า เพราะ backend ลบรูปเก่าทิ้งก่อนเสมอแล้วค่อยใส่รูปใหม่ตามที่ส่งมา (design ตั้งใจไว้แบบนี้เพื่อรองรับ "ลบรูปทั้งหมด" ได้จริง) ถ้า frontend ไม่ preload รูปเดิม การบันทึกแค่แก้ % เฉยๆ จะทำให้รูปที่เคยมีอยู่หายไปทั้งหมดโดยไม่ตั้งใจ (เจอบั๊กนี้จริงใน `MobileForemanTab.jsx` มาก่อน — ดู PART3 หัวข้อบั๊ก)

16. **ก่อนแก้ CSS/JSX ของ Tab9 (เล่มรายงาน) หรือไฟล์ Word export ต้องแก้คู่กันเสมอ** — `CompiledReportTab.jsx` (preview บนจอ) กับ `routes/reports.js` (สร้างไฟล์ Word จริง) ต้อง sync กันตลอดเวลา (เลขหัวข้อ, การเว้นระยะ, เงื่อนไขการแสดงผล) มิเช่นนั้น preview กับไฟล์ที่ดาวน์โหลดจริงจะไม่ตรงกัน — เคยพลาดไม่ sync มาแล้วหลายรอบในเซสชันนี้

---

## Menu 5: จัดทำรายงาน (สำคัญ — ฟีเจอร์ใหญ่ที่สุดที่เพิ่งทำเสร็จ)

9 Tab, container คือ `Reports.jsx` — auto-provision รายงานของสัปดาห์ปัจจุบันเสมอ (ไม่มีปุ่มสร้างเองแล้ว
เรียก `GET /reports/current` ตอนเปลี่ยนโครงการทุกครั้ง)

| Tab | ใช้งานอย่างไร |
|---|---|
| 1. Plan&Progress | ตาราง WBS อ่านอย่างเดียว กรองเฉพาะกิจกรรมที่ %แผน>0 หรือ %actual>0 |
| 2. ความปลอดภัย | เพิ่ม/แก้/ลบรายการ + แนบรูปได้สูงสุด 6 รูป/รายการ (เดิมเคยมี Tab "คุณภาพงาน" ด้วย **ตัดออกทั้งระบบแล้ว**) |
| 3. รูปถ่าย | ภาพรวมรูปทั้งหมด 2 คอลัมน์ (JE + ความปลอดภัย — ไม่มีคุณภาพงานแล้ว) คลิกเลือก/ยกเลิกเข้าเล่ม |
| 4. งานสัปดาห์หน้า | จัดกลุ่มตาม WBS Level1 |
| 5-7. ปัญหาอุปสรรค/งานเพิ่มลด/เรื่องที่ค้าง | พิมพ์รายการเอง (ไม่มีรูป) |
| 9. เล่มรายงาน | preview เต็มรูปแบบ 6-7 หน้า (ขึ้นกับมี/ไม่มีรูป JE) + ปุ่ม Print + ดาวน์โหลด Word |

**MAX_PHOTOS = 6 ทุกจุดในระบบ** (เปลี่ยนจาก 4 → 6 แล้วทั้ง `WeeklyProgressTab.jsx`, `ReportItemsTab.jsx`,
`PhotosTab.jsx`, `MobileForemanTab.jsx`, `ForemanSafetyTab.jsx`, และ backend `progress.js`/`reports.js`)

**Tab9 โครงสร้างหน้า (7 หน้าตายตัวถ้ามีรูป JE, 6 หน้าถ้าไม่มี):**
1. หน้าปก
2. แผนงานและความคืบหน้างาน (Overall + S-Curve + ตารางกิจกรรมสัปดาห์นี้)
3. ตารางสรุปผลงานทั้งโครงการ (ไม่กรอง ครบทุกกิจกรรม — เหมือน Menu3 Tab3)
4. รูปถ่าย JE (**เงื่อนไขใหม่: ถ้า JE ไม่มีรูปที่เลือกไว้เลย ข้ามหน้านี้ไปทั้งหน้า** ไม่ใช่โชว์หน้าเปล่า —
   หน้าถัดไปขยับมาแทนทันที)
5. ความปลอดภัย (เลขลำดับ `1.) xxx` ถอย 22px)
6. แผนงานสัปดาห์หน้า (**กรณีพิเศษ 2 ระดับ**: Level1=ชื่องานที่เลือกไว้ก่อน ใช้เลขลำดับ 22px, Level2=รายการ
   ย่อยที่พิมพ์เอง ใช้ bullet ธรรมดา 44px — ต่างจาก Tab อื่นเพราะ Tab นี้บังคับเลือกชื่องานก่อนเสมอ)
7. ปัญหาอุปสรรค+งานเพิ่มลด+เรื่องที่ค้าง (เลขลำดับ `1.) xxx` ถอย 22px ทั้ง 3 หัวข้อ)

**กฎเลขลำดับ (สรุปให้ชัด กันสับสนซ้ำ):**
- Tab ที่ "พิมพ์รายการเองตรงๆ ไม่ต้องเลือกอะไรก่อน" (ความปลอดภัย, ปัญหาอุปสรรค, งานเพิ่มลด, เรื่องที่ค้าง)
  → เลขลำดับ `1.) xxx` ถอย 22px ใช้ class `.report-preview__list--numbered`
- Tab ที่ "ต้องเลือกชื่องาน (WBS) ก่อนถึงจะเพิ่มได้" (งานสัปดาห์หน้า) → 2 ระดับ: ชื่องานที่เลือก = เลขลำดับ
  22px, รายการย่อยที่พิมพ์เอง = bullet 44px ใช้ class `.report-preview__list--check`

---

## PWA + แอปมือถือสำหรับ Foreman (ฟีเจอร์ใหม่ทั้งหมดในเซสชันนี้)

**PWA:** `vite-plugin-pwa` — manifest + Service Worker พร้อม `skipWaiting`+`clientsClaim` (บังคับอัปเดต
ทันทีไม่รอผู้ใช้ปิดแท็บเก่า) + `registerSW({ onNeedRefresh: () => window.location.reload() })` ใน
`main.jsx` — **ถ้าเจอ "หน้าเว็บเละ/CSS หาย" ที่ deploy ใหม่แล้วให้สงสัยปัญหานี้ก่อน** วิธีแก้ manual:
DevTools → Application → Service Workers → Unregister + Clear Site Data

**Foreman App (`/foreman`):** แยก route เต็มรูปแบบไม่มี Sidebar — role='foreman' ถูกบังคับเข้าหน้านี้เสมอ
(ผ่าน `ProtectedRoute.jsx`) ไม่ว่าจะพิมพ์ URL อื่นตรงๆ ก็ตาม มี 4 Tab: งานสัปดาห์นี้/หน้า (ใช้
`MobileForemanTab.jsx` เดียวกับที่สลับมาจาก Menu3 บนจอมือถือ), ความปลอดภัย (`ForemanSafetyTab.jsx` —
บันทึกข้อมูลชุดเดียวกับ Menu5 Tab2), S-Curve (`ForemanSCurveTab.jsx` อ่านอย่างเดียว)

**หน้าที่ต้องตั้งสิทธิ์เอง (ไม่ใช่โค้ด):** foreman ทุกคนต้องมีแถว `user_permissions(menu_key='reports',
tab_key='safety')` ไม่งั้น Tab ความปลอดภัยจะขึ้น error 403 (แต่ไม่ force logout แล้วตามที่แก้ในข้อ 14)

---

## สถานะปัจจุบัน (เมนูที่ทำแล้ว)

| เมนู | สถานะ |
|---|---|
| 1. เปิดโครงการ | ✅ เสร็จ (มี status on/off กรองออกจาก dropdown เมนูอื่น) |
| 2. สร้างข้อมูลโครงการ (WBS + Gantt + Dependency + Print) | ✅ เสร็จ |
| 3. การจัดการโครงการ (Progress tracking, 5 tabs) | ✅ เสร็จ + รองรับหน้าจอมือถือสำหรับ foreman |
| 4. การจัดการต้นทุน | ⏳ ยังไม่เริ่ม |
| 5. จัดทำรายงาน (9 Tab + export Word) | ✅ เสร็จสมบูรณ์ |
| ระบบกำหนดสิทธิ์ | ✅ เสร็จ |
| PWA + Deploy จริง (Railway/Vercel) | ✅ เสร็จ ใช้งานจริงแล้ว |
| แอปมือถือ foreman (`/foreman`) | ✅ เสร็จ 3 ฟีเจอร์ (งานสัปดาห์, ความปลอดภัย, S-Curve) |
| **แอปมือถือลูกค้าดูความคืบหน้า** | ⏳ **ยังไม่เริ่ม — งานถัดไป ดู PART3** |

รายละเอียดเชิงลึกทั้งหมดอยู่ใน `PROJECT_SUMMARY.md`, `PROJECT_SUMMARY_PART2.md`, และ
`PROJECT_SUMMARY_PART3.md`
