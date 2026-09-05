# CLAUDE.md

คำแนะนำสำหรับ Claude (หรือ AI agent อื่น) เวลาทำงานกับโปรเจกต์นี้ — อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง

> **บริบทละเอียดเพิ่มเติม:** ดู `PROJECT_SUMMARY.md` และ `PROJECT_SUMMARY_PART2.md` ที่ root
> (ไฟล์หลังต่อจากไฟล์แรก เรียงตามลำดับเวลา) — สรุปทุกฟีเจอร์ที่ทำไปแล้ว บั๊กที่เจอ+วิธีแก้ และเหตุผล
> การตัดสินใจเชิงเทคนิคต่างๆ ไว้ละเอียด ถ้าจะแก้ฟีเจอร์เดิมควรอ่านไฟล์เหล่านี้ก่อนเสมอ

---

## โปรเจกต์นี้คืออะไร

**SIKARIN** — ระบบบริหารจัดการโครงการก่อสร้าง (Construction Project Management System) ภาษา UI เป็นภาษาไทยทั้งหมด ครอบคลุม: เปิดโครงการ, สร้างข้อมูลโครงสร้างงาน (WBS 3 ระดับ) พร้อม Gantt Chart และ Task Dependency, ระบบติดตามความคืบหน้า (บันทึกงานประจำสัปดาห์ + ตารางงานรวม + S-Curve), และระบบกำหนดสิทธิ์ผู้ใช้งานตาม Menu/Tab

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Backend | Node.js + Express, PostgreSQL (Supabase), JWT auth (`jsonwebtoken`, `bcrypt`) |
| Frontend | React (Vite), React Router, Axios |
| Database schema | `project_mgt` (schema เดียว ไม่ใช่ `public`) |
| กราฟ/ชาร์ต | วาดเอง (SVG มือเขียน) — **ไม่มี** `recharts`/`chart.js` ติดตั้งอยู่ในโปรเจกต์ อย่าเพิ่มโดยไม่จำเป็น (เพิ่ม dependency ใหม่ต้องให้ผู้ใช้ `npm install` เองบนเครื่องจริงด้วย) |

---

## โครงสร้างโฟลเดอร์ (ที่ root ของ repo)

```
backend/
  src/
    server.js              # entry point, mount routes ทั้งหมดที่นี่
    db.js                   # pg connection pool + custom type parser (DATE columns)
    middleware/auth.js       # verifyToken, requireRole(...roles), requirePermission(menu, tab), hasPermission(user, menu, tab)
    lib/                     # ฟังก์ชันคำนวณ/ช่วยเหลือ ที่ไม่ผูกกับ HTTP (pure functions, เทสได้ง่าย)
      menuRegistry.js         # รายการ Menu/Tab ทั้งหมดในระบบ (แหล่งความจริงเดียว ใช้ validate + ส่งให้ frontend)
    routes/                  # 1 ไฟล์ต่อ 1 resource, mount ที่ server.js
      auth.js                  # /register (สมัครเอง, status=pending เสมอ), /login (บล็อกถ้าไม่ approved)
      permissions.js            # เฉพาะ system_mgr/admin: อนุมัติ+กำหนดสิทธิ์ user, /me (สิทธิ์ตัวเอง)
  sql/
    migration_XXX_*.sql      # เรียงเลขตามลำดับ รันมือใน Supabase SQL Editor (ไม่มี migration runner อัตโนมัติ)
  .env                       # DATABASE_URL, JWT_SECRET, PORT — ห้าม commit (มี .gitignore ป้องกันแล้ว)

frontend/
  src/
    api/client.js             # axios instance เดียว ใช้ทุกที่ (แนบ JWT header + 401 redirect อัตโนมัติ)
    context/
      AuthContext.jsx           # user + permissions (จาก /api/permissions/me), canAccessMenu(), canAccessTab()
      ProtectedRoute.jsx         # รองรับ prop `roles` จำกัดหน้าเฉพาะ role (เช่น /permissions ให้แค่ system_mgr/admin)
    components/               # Layout, Sidebar (ใช้ร่วมกันทุกหน้า — Sidebar กรองเมนูตาม canAccessMenu())
    pages/
      Login/
        Login.jsx                # เข้าสู่ระบบ + ลิงก์ไปสมัครสมาชิก
        Register.jsx              # สมัครเอง (ไม่เลือก role) — สมัครเสร็จต้องรอ system_mgr อนุมัติก่อน
      OpenProject/             # เมนู 1: เปิดโครงการ (menu_key: open_project, ไม่มี tab ย่อย)
      ProjectData/              # เมนู 2: สร้างข้อมูลโครงการ (menu_key: project_data, tab: group/item/activity/gantt)
      ProjectManagement/         # เมนู 3: การจัดการโครงการ (menu_key: project_management, 5 tabs — ดู tab_key ใน menuRegistry.js)
      PermissionApproval/        # หน้า "อนุมัติและกำหนดสิทธิ์" — เฉพาะ system_mgr/admin เท่านั้นที่เข้าได้
    App.jsx                    # routing ทั้งหมด
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
- ตาราง: `snake_case` พหูพจน์ (`wbs_level1`, `progress_entries`, `user_permissions`)
- คอลัมน์: `snake_case`
- WBS 3 ระดับใช้ prefix โค้ดต่างกัน: `JG-` (Level1 กลุ่มงานหลัก), `JN-` (Level2 รายการงาน), `JE-` (Level3 กิจกรรมงาน)
- Permission: `user_permissions(user_id, menu_key, tab_key)` — `tab_key = ''` (ค่าว่าง ไม่ใช่ NULL) หมายถึง "ทั้งเมนู" สำหรับเมนูที่ไม่มี tab ย่อย

### Frontend
- Component ไฟล์: `PascalCase.jsx` ชื่อตรงกับ default export
- CSS class: `kebab-case` แบบ BEM คร่าวๆ — `.block__element`, `.block__element--modifier` (เช่น `.progress-table__row--l1`, `.progress-table__link-btn--danger`)
- Route path: `kebab-case` ตรงกับชื่อโฟลเดอร์ page (เช่น `/project-management`)

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
npm run build      # vite build → dist/
npm run lint       # eslint .
npm run preview    # preview build output
```

**Database migration:** ไม่มี migration runner — เปิด Supabase SQL Editor แล้วรันไฟล์ใน `backend/sql/migration_XXX_*.sql` ตามลำดับเลขด้วยมือ ทุกครั้งที่มี migration ใหม่ต้องแจ้งผู้ใช้ให้รันก่อน deploy โค้ดที่พึ่งพา schema นั้น

---

## Pattern สำคัญที่ต้องรู้ก่อนแก้โค้ด (เรียนรู้จากบั๊กที่เจอจริง)

1. **วันที่ทั้งหมดต้อง "เซิร์ฟเวอร์เป็นเจ้าของ" เสมอ** — ห้ามให้ client ส่ง `entry_date`/`today` มาเอง (นาฬิกาเครื่อง client อาจไม่ตรงกับเซิร์ฟเวอร์ ทำให้ query "ณ วันนี้" พังแบบเงียบๆ) ใช้ `fmtISO(new Date())` ฝั่ง backend เสมอ และ query ใดๆที่เทียบ "ณ วันที่ X" ควร clamp ไม่ให้มองเกินวันนี้จริง (`asOfDate > today ? today : asOfDate`)

2. **จำนวนคอลัมน์ในแต่ละแถวของ `<table>` ต้องตรงกับ `<thead>` เป๊ะทุกแถวเสมอ** — ห้ามใช้ `colSpan` แบบเดาสุ่ม เคยเป็นบั๊กมาแล้ว (แถวเกินตาราง, ค่าเลื่อนไปอยู่คอลัมน์ผิด) ให้เขียนแยกทุก `<td>` ชัดเจนตามจำนวนคอลัมน์จริง

3. **CSS specificity: `.class` เดี่ยวแพ้ `.class element` เสมอ** — ถ้าจะ override text-align/สไตล์ของ cell เฉพาะ ให้เขียน selector ประกอบกับ element (`td.my-class` ไม่ใช่แค่ `.my-class`) ไม่งั้นกฎทั่วไป (เช่น `table td { text-align: center }`) จะชนะเสมอไม่ว่าจะเขียนกฎเฉพาะไว้ตรงไหนของไฟล์

4. **%W ของ Level3 (JE) ใช้ `share_percent` ไม่ใช่ `weight_percent`** — `weight_percent` คือน้ำหนักเทียบทั้งโปรเจกต์ (ตัวเล็กมาก), `share_percent` คือ % เทียบพ่อของตัวเอง (ที่ควรโชว์ในคอลัมน์ %W ของ Level3 ตาม convention เดิม) ส่วน Level1/Level2 ใช้ `weight_percent` ตามปกติ

5. **progress_entries เป็น UPSERT ตาม (wbs_level3_id, entry_date) ไม่ใช่ append-only** — 1 กิจกรรมงาน + 1 วัน = 1 แถวเสมอ บันทึกซ้ำวันเดียวกัน = UPDATE ทับ ไม่ใช่ INSERT ใหม่ (เคยเป็น append-only มาก่อน แล้วเปลี่ยนเพราะทำให้ query "ล่าสุด" ได้ผลไม่ตรงกันข้าม endpoint)

6. **สัปดาห์นับแบบอาทิตย์-เสาร์ (ไม่ใช่จันทร์-อาทิตย์)** — `getWeekRange()` ใน `backend/src/lib/progress.js`

7. **Role ที่มีในระบบ: `admin`, `pm`, `foreman`, `viewer`, `system_mgr`** — ตรวจสอบให้ `requireRole(...)` ครอบคลุม role ที่ควรทำรายการนั้นได้จริงเสมอ (เคยพลาดลืม `foreman` ในฟีเจอร์ progress ทำให้ foreman บันทึก/ลบไม่ได้แบบเงียบๆ ไม่มี error ที่มองเห็นง่าย) `admin` และ `system_mgr` เป็น superuser ผ่าน `requirePermission`/`hasPermission` เสมอโดยไม่ต้องมีแถวใน `user_permissions`

8. **ก่อนสร้าง/แก้ไฟล์ที่ต้องส่งมอบให้ผู้ใช้ ให้ทดสอบด้วยการ render จริง (mock API + jsdom) ก่อนส่งทุกครั้ง** — ห้ามส่งโค้ดที่ตรวจแค่ syntax แล้วเดาว่าทำงานถูก โปรเจกต์นี้เจอบั๊ก runtime ที่ syntax check ผ่านมาแล้วหลายรอบ

9. **ส่งไฟล์กลับให้ผู้ใช้แยกเป็น `backend.zip` และ `frontend.zip` เสมอ** โดย path ในซิปต้องเริ่มจาก `backend/...` หรือ `frontend/...` ตรงกับ root จริงของผู้ใช้ (ไม่ใช่ path เต็มของ sandbox ที่อาจมีโฟลเดอร์ซ้อนเกิน)

10. **ระบบกำหนดสิทธิ์ (`user_permissions`) คุมคนละแกนกับ `requireRole`** — `requireRole` คุมว่า "role นี้ทำอะไรได้บ้าง" (ความสามารถ), ส่วน `requirePermission(menu, tab)`/`hasPermission()` คุมว่า "user คนนี้ถูกเปิดสิทธิ์ให้เข้า Tab นี้หรือยัง" (การเข้าถึง) — endpoint ที่แก้ไข/บันทึกข้อมูลของแต่ละ Tab ต้องมีทั้งสองอย่าง แต่ **endpoint ที่ใช้ร่วมข้าม Menu** (เช่น รายชื่อโครงการ `/api/projects` GET, รายชื่อกลุ่มงาน `/api/wbs-level1` GET) **จงใจไม่กัน permission** เพราะ Menu อื่นต้องพึ่งข้อมูลนี้เป็น shared reference — กันไว้แค่ POST/PUT/DELETE ที่เป็นการใช้งานจริงของเมนูนั้นเท่านั้น เวลาจะเพิ่ม Tab ใหม่ในอนาคต ต้องเพิ่มเข้า `menuRegistry.js` ก่อนเสมอ (เป็น validate source เดียว)

11. **JWT/สิทธิ์ที่ browser จำไว้ไม่ sync กับ DB อัตโนมัติ** — role/สิทธิ์ที่เปลี่ยนใน DB จะไม่มีผลกับ session ที่ login ค้างอยู่จนกว่าจะ logout/login ใหม่ (JWT เป็น snapshot ตอน login, `permissions` ก็ cache ไว้ใน localStorage เหมือนกัน) เวลาแก้ role ให้ใครใน DB โดยตรง (เช่น bootstrap `system_mgr` คนแรก) ต้องบอกผู้ใช้ให้ logout แล้ว login ใหม่เสมอ

12. **Bootstrap `system_mgr` คนแรกต้องทำผ่าน SQL โดยตรง** — ระบบอนุมัติ user ใหม่ต้องมี `system_mgr` อยู่ก่อนแล้วถึงจะอนุมัติคนอื่นได้ (ปัญหาไก่กับไข่) ให้ user สมัครที่ `/register` ให้เสร็จก่อน (ต้องเห็นหน้า "สมัครสมาชิกสำเร็จ" จริงๆ ไม่ใช่แค่กรอกฟอร์ม) แล้วค่อยรัน SQL ตรงนี้ **ทีหลัง** เท่านั้น (รันก่อนจะเป็น 0 rows affected เงียบๆ ไม่มี error เตือน):
    ```sql
    UPDATE project_mgt.users SET role = 'system_mgr', status = 'approved' WHERE email = '...';
    ```

13. **เจอบั๊กที่แก้โค้ด/migration แล้วไม่มีผลจริง ให้สงสัยว่ามีโฟลเดอร์โปรเจกต์ซ้ำในเครื่องผู้ใช้ก่อน** — เจอเคสจริงที่ผู้ใช้แก้ไฟล์ในโฟลเดอร์หนึ่ง แต่ terminal รัน `npm start` อยู่คนละโฟลเดอร์ (backend เก่าที่ค้างจาก zip ก่อนหน้า) ทำให้ error message เป็นของโค้ดเก่าอยู่ตลอดแม้ restart แล้วก็ตาม วิธีวินิจฉัยเร็วที่สุด: ให้ผู้ใช้ `pwd` ดู path จริงที่รันอยู่ + ลองแก้ข้อความ error เป็นข้อความทดสอบเฉพาะ (unique marker) แล้ว restart ดูว่าขึ้นข้อความใหม่จริงไหม

---

## สถานะปัจจุบัน (เมนูที่ทำแล้ว)

| เมนู | สถานะ |
|---|---|
| 1. เปิดโครงการ | ✅ เสร็จ |
| 2. สร้างข้อมูลโครงการ (WBS + Gantt + Dependency + Print) | ✅ เสร็จ |
| 3. การจัดการโครงการ (Progress tracking, 5 tabs) | ✅ เสร็จ พร้อมแก้บั๊กหลายรอบ (ดู PROJECT_SUMMARY_PART2.md) |
| 4. การจัดการต้นทุน | ⏳ ยังไม่เริ่ม |
| 5. จัดทำรายงาน | ⏳ ยังไม่เริ่ม |
| ระบบกำหนดสิทธิ์ (สมัครสมาชิก + อนุมัติ + Menu/Tab permission) | ✅ เสร็จ (migration_011) |

รายละเอียดเชิงลึกทั้งหมด (formula, การตัดสินใจ, บั๊กที่เจอ) อยู่ใน `PROJECT_SUMMARY.md` และ `PROJECT_SUMMARY_PART2.md`
