# คู่มือ Deploy โปรเจกต์ขึ้นเว็บ — GitHub + Railway + Vercel

คู่มือนี้สรุปจากประสบการณ์จริงตอน deploy โปรเจกต์ SIKARIN (backend Node.js/Express + frontend React/Vite)
ครอบคลุมทั้งขั้นตอนปกติและปัญหาที่เจอจริงระหว่างทาง พร้อมวิธีแก้ ใช้เป็น checklist ได้เลยสำหรับโปรเจกต์ถัดไป

**โครงสร้างที่คู่มือนี้อ้างอิง:** repo เดียว (monorepo) มี 2 โฟลเดอร์ย่อย `backend/` และ `frontend/`

---

## ภาพรวม: ใครทำหน้าที่อะไร

| บริการ | หน้าที่ | Deploy อะไร |
|---|---|---|
| **GitHub** | เก็บโค้ด (source of truth) | — |
| **Railway** | รัน backend (API server) | โฟลเดอร์ `backend/` |
| **Vercel** | รัน frontend (เว็บที่ผู้ใช้เห็น) | โฟลเดอร์ `frontend/` |

---

## ส่วนที่ 1: เตรียมโค้ดให้พร้อม Deploy

### 1.1 Backend ต้องมีไฟล์เหล่านี้

**`backend/package.json`** — ต้องมี script `start`:
```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

**โค้ดต้องอ่าน PORT จาก environment variable เสมอ** (Railway จะกำหนด PORT ให้เองอัตโนมัติ ไม่ตายตัว):
```javascript
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

**CORS ต้องรองรับการจำกัดโดเมนได้** (ตั้งค่าได้ทีหลังผ่าน environment variable):
```javascript
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
```
> `|| true` หมายถึง ถ้ายังไม่ตั้ง `CORS_ORIGIN` จะอนุญาตทุกโดเมนไปก่อน (ใช้ทดสอบได้ทันที) แล้วค่อยกลับมาตั้งให้แน่นทีหลังได้

**`backend/railway.json`** (บอก Railway วิธี build/start ชัดเจน):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**`backend/.env.example`** (แสดงว่าต้องมีตัวแปรอะไรบ้าง โดยไม่ใส่ค่าจริง):
```
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=change-this-to-a-long-random-string
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PORT=4000
CORS_ORIGIN=https://your-app.vercel.app
```

> ⚠️ **ไฟล์นี้เป็นแค่ตัวอย่าง ห้ามเอาไปวางเป็นค่าจริงใน Railway เด็ดขาด** (เจอปัญหานี้มาแล้วจริง — ดูหัวข้อ "ปัญหาที่พบบ่อย" ด้านล่าง)

### 1.2 Frontend ต้องมีไฟล์เหล่านี้

**เช็คก่อนว่าใช้ React Router แบบ `BrowserRouter` หรือเปล่า:**
```bash
grep -rn "BrowserRouter" src/
```
ถ้าเจอ **ต้องมี** `frontend/vercel.json` (ไม่งั้นเข้าหน้าย่อยตรงๆ เช่น `/reports` จะขึ้น 404):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
> ⚠️ **ชื่อไฟล์ต้องเป็น `.json` เป๊ะ** ไม่ใช่ `.js` — พลาดจุดนี้มาแล้วจริง เพราะ Windows บางเครื่องซ่อนนามสกุลไฟล์ (เช่น `vercel.js` ไปสร้างแทน `vercel.json` โดยไม่รู้ตัว) เช็คด้วยการเปิด Properties ของไฟล์ ถ้าไม่แน่ใจ

**API client ต้องอ่าน URL จาก environment variable:**
```javascript
// src/api/client.js
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
```

**`frontend/.env.example`:**
```
VITE_API_URL=https://your-backend.up.railway.app/api
```

### 1.3 `.gitignore` — ป้องกันความลับหลุด

ที่ root ของ repo ต้องมี `.gitignore` ครอบคลุมทั้ง backend และ frontend:
```
node_modules/
.env
.env.local
.env.*.local
dist/
build/
*.log
.DS_Store
```

> ⚠️ **สำคัญที่สุด: ไฟล์ `.env` จริง (มี password/secret ข้างใน) ห้ามหลุดขึ้น GitHub เด็ดขาด** ก่อน commit ทุกครั้งเช็คด้วย:
> ```bash
> git status
> ```
> ถ้าเห็น `.env` อยู่ในรายการที่จะ commit ให้หยุดทันที อย่าเพิ่ง commit

---

## ส่วนที่ 2: เตรียม Local Git Repo

### 2.1 ถ้ายังไม่เคยมี git repo ในเครื่องเลย

```bash
cd C:\ชื่อโฟลเดอร์โปรเจกต์
git init
git add -A
git commit -m "Initial commit"
```

### 2.2 สร้าง Repo เปล่าบน GitHub

1. ไปที่ https://github.com/new
2. ตั้งชื่อ repo → เลือก Private หรือ Public ตามต้องการ
3. **สำคัญมาก: ห้ามติ๊ก "Add a README file" หรืออะไรก็ตาม** — ต้องเป็น repo เปล่าสนิท 100% (ถ้าติ๊กไว้ ตอน push จะชนกันและต้องมาแก้ปัญหา branch ไม่ตรงกันทีหลัง)
4. กด Create repository → จะได้ URL แบบ `https://github.com/username/repo-name`

### 2.3 เชื่อม Local Repo เข้ากับ GitHub

```bash
git remote add origin https://github.com/username/repo-name.git
git branch -M main
git push -u origin main
```

> **หมายเหตุ**: `git branch -M main` สำคัญเพราะ git บางเวอร์ชันสร้าง branch เริ่มต้นชื่อ `master` ไม่ใช่ `main` — ถ้าไม่ตั้งชื่อให้ตรงกับที่ GitHub ใช้ (ปกติคือ `main`) จะ push ผิด branch

### 2.4 Authentication ตอน Push ครั้งแรก

GitHub **ไม่รับ password ตรงๆ อีกแล้ว** ต้องใช้ **Personal Access Token** แทน:

1. ไปที่ https://github.com/settings/tokens
2. Generate new token (classic) → ตั้งชื่ออะไรก็ได้ → Expiration เลือกตามสะดวก
3. ติ๊ก scope **"repo"** (อันเดียวพอ)
4. Generate token → คัดลอกค่าที่ขึ้นต้นด้วย `ghp_` (เห็นครั้งเดียว ปิดหน้าไปแล้วดูไม่ได้อีก)
5. ตอน push ถ้าเบราว์เซอร์/Git ถามหา password ให้ **paste token ตรงนี้แทน password**

> 🔒 **ใช้เสร็จแล้วควร Revoke token ทิ้งทันที** ที่หน้า https://github.com/settings/tokens เพื่อความปลอดภัย โดยเฉพาะถ้าเป็น token ที่ใช้ครั้งเดียว

---

## ส่วนที่ 3: Deploy Backend บน Railway

1. ไปที่ https://railway.app → login ด้วย GitHub
2. **New Project** → **Deploy from GitHub repo** → เลือก repo ที่เพิ่ง push ไป
   - ถ้าไม่เห็น repo ในรายการ → กด **"Configure GitHub App"** → ไปหน้า GitHub เพิ่มสิทธิ์ให้ Railway เข้าถึง repo นี้ (เลือก "Only select repositories" แล้วติ๊ก repo ที่ต้องการ) → Save → กลับมา Refresh ที่ Railway
3. **สำคัญมาก**: เข้า **Settings** ของ service → หา **"Root Directory"** → ใส่ `backend` (เพราะ repo นี้มี 2 โฟลเดอร์ย่อย ต้องบอกให้ชัดว่า deploy โฟลเดอร์ไหน)
4. ไปที่แท็บ **Variables** → เพิ่มตัวแปรทั้งหมดตาม `backend/.env.example` **โดยใส่ค่าจริง** (ไม่ใช่ค่าตัวอย่าง!):
   - `DATABASE_URL` — connection string จริงของฐานข้อมูล (Supabase/Neon ฯลฯ)
   - `JWT_SECRET` — ตั้งเป็นข้อความสุ่มยาวๆ เอง
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — ถ้าใช้ Cloudinary
   - ไม่ต้องใส่ `PORT` เอง Railway จะกำหนดให้อัตโนมัติ
5. รอ build (ดูใน แท็บ Deployments) จนขึ้น **"ACTIVE"** / **"Deployment successful"**
6. **ทดสอบว่า backend ทำงานจริง**: เข้า Settings → Networking → กด **"Generate Domain"** จะได้ URL แบบ `xxxxx.up.railway.app` → เปิด `https://xxxxx.up.railway.app/api/health` (หรือ endpoint สุขภาพอื่นที่มี) ควรเห็น JSON ตอบกลับ

---

## ส่วนที่ 4: Deploy Frontend บน Vercel

1. ไปที่ https://vercel.com → login ด้วย GitHub
2. **Add New → Project** → Import repo เดียวกัน
3. **ก่อนกด Deploy**: ตั้งค่า **Root Directory** เป็น `frontend`
4. Framework Preset ควรขึ้น **Vite** อัตโนมัติ (เช็คให้ตรง ถ้าไม่ใช่เลือกเอง)
5. เปิด **Environment Variables** → เพิ่ม `VITE_API_URL` = URL ของ backend จาก Railway **ต่อท้ายด้วย `/api`**
   ```
   https://xxxxx.up.railway.app/api
   ```
6. กด **Deploy** → รอ build เสร็จ (1-2 นาที) → จะได้ URL แบบ `xxxxx.vercel.app`

---

## ส่วนที่ 5: เชื่อม 2 ฝั่งเข้าด้วยกัน (สำคัญ ห้ามลืม)

หลัง deploy ทั้งคู่เสร็จแล้ว **ต้องกลับไปที่ Railway อีกครั้ง**:

1. ไปที่ Railway → service backend → Variables
2. เพิ่ม/แก้ `CORS_ORIGIN` = URL จริงของ Vercel ที่เพิ่งได้มา (คัดลอกมาทั้งเส้น มี `https://` ด้วย ไม่มี `/` ปิดท้าย)
   ```
   CORS_ORIGIN=https://xxxxx.vercel.app
   ```
3. Save → รอ Railway restart อัตโนมัติ

> ถ้าข้ามขั้นตอนนี้ไป จะเจอ error **CORS policy blocked** ตอนใช้งานจริง (frontend เรียก backend ไม่ได้เลย)

---

## ส่วนที่ 6: อัปเดตโค้ดหลัง Deploy ครั้งแรกแล้ว (ใช้ประจำ)

หลังจาก setup เสร็จรอบแรก **ทุกครั้งที่แก้โค้ดต่อไป** แค่รันชุดคำสั่งนี้จากโฟลเดอร์ root ของ repo:

```bash
git add -A && git commit -m "อธิบายว่าแก้อะไร" && git push
```

- Railway และ Vercel จะ **detect การ push และ deploy ให้อัตโนมัติทันที** ไม่ต้องกดอะไรเพิ่ม
- รอสัก 1-2 นาทีแล้วเข้าเว็บดูผลได้เลย

> ถ้าใช้ PowerShell (ไม่ใช่ Command Prompt) และ `&&` ใช้ไม่ได้ ให้ใช้ `;` แทน:
> ```powershell
> git add -A ; git commit -m "อธิบายว่าแก้อะไร" ; git push
> ```

---

## ปัญหาที่พบบ่อย และวิธีแก้ (เจอจริงมาแล้วทุกข้อ)

### ❌ Login/API เรียกไม่ได้ ขึ้น "CORS policy blocked" ใน Console
**สาเหตุ**: `CORS_ORIGIN` ใน Railway ยังเป็นค่าตัวอย่าง (`https://your-app.vercel.app`) หรือพิมพ์ผิดจาก URL จริง
**วิธีเช็ค**: กด F12 → แท็บ Console → อ่านข้อความ error จะบอกตรงๆ ว่า origin ไหนถูก block
**วิธีแก้**: แก้ `CORS_ORIGIN` ใน Railway Variables ให้ตรงกับ URL ของ Vercel เป๊ะ (คัดลอกจาก address bar จริง อย่าพิมพ์เอง)

### ❌ Login ไม่ผ่าน ขึ้น Error 500
**สาเหตุที่พบบ่อยที่สุด**: `DATABASE_URL` ใน Railway Variables ยังเป็นข้อความตัวอย่างจาก `.env.example` (เช่น `postgresql://user:password@host:5432/dbname`) ไม่ใช่ค่าจริง
**วิธีเช็ค**: Railway → service → Deployments → View Logs → หาบรรทัด error สีแดง ถ้าเห็น `ENOTFOUND` พร้อม hostname แปลกๆ (เช่น `host`) แปลว่าใช่เคสนี้แน่นอน
**วิธีแก้**: แก้ `DATABASE_URL` ให้เป็น connection string จริงจากฐานข้อมูล

### ❌ เข้าหน้าเว็บหลักได้ปกติ แต่พอ refresh หรือเข้าหน้าย่อยตรงๆ (เช่น `/reports`) ขึ้น 404
**สาเหตุ**: frontend ใช้ React Router (`BrowserRouter`) แต่ไม่มีไฟล์ `vercel.json` บอกให้ Vercel รีไดเรกต์กลับ `index.html`
**วิธีแก้**: สร้าง `frontend/vercel.json` ตามเนื้อหาในข้อ 1.2 — **เช็คชื่อไฟล์ให้เป็น `.json` จริงๆ** (ไม่ใช่ `.js` ที่บาง editor/OS อาจสร้างผิดโดยไม่รู้ตัว)

### ❌ `git push` ขึ้น `fatal: not a git repository`
**สาเหตุ**: โฟลเดอร์นี้ยังไม่เคยรัน `git init` เลย
**วิธีแก้**: รัน `git init` ก่อน แล้วค่อย `git remote add origin ...` ตามขั้นตอนในข้อ 2.3

### ❌ `git push` ขึ้น `rejected` หรือ `non-fast-forward`
**สาเหตุ**: ประวัติ commit ในเครื่องกับบน GitHub ไม่ตรงกัน (มักเกิดตอน setup ครั้งแรกที่มีคนอื่น/เครื่องอื่น push ไปก่อนแล้ว)
**วิธีแก้ (เฉพาะตอน setup ครั้งแรกเท่านั้น ถ้ามั่นใจว่าของในเครื่องคือเวอร์ชันล่าสุดที่ถูกต้อง)**:
```bash
git push -u origin main --force
```
> ⚠️ **ห้ามใช้ `--force` ตามปกติ** ใช้เฉพาะตอน setup ครั้งแรกที่แน่ใจจริงๆ ว่าของในเครื่องถูกต้องกว่า เพราะจะทับประวัติเก่าทิ้งถาวร

### ❌ Railway สร้าง Service ผิด repo (เจอ error build จาก repo เก่าที่ไม่เกี่ยวข้อง)
**สาเหตุ**: ตอนกด "+ Add" เลือก repo ผิดตัวจากรายการ (โดยเฉพาะถ้ามีหลาย repo เก่าอยู่ในบัญชี GitHub เดียวกัน)
**วิธีแก้**: ลบ service ที่ผิดทิ้ง (พิมพ์ชื่อ service ยืนยันตอนลบ) แล้วเพิ่มใหม่ เลือก repo ให้ถูกต้อง

---

## Checklist สรุปย่อ (ใช้เช็คก่อน Deploy จริงทุกครั้ง)

- [ ] `backend/package.json` มี `"start": "node src/server.js"` (หรือ entry point จริง)
- [ ] Backend อ่าน `process.env.PORT` ไม่ hardcode พอร์ต
- [ ] Backend อ่าน `process.env.CORS_ORIGIN` สำหรับ CORS
- [ ] มี `backend/railway.json`
- [ ] มี `backend/.env.example` (ไม่ใช่ `.env` จริง)
- [ ] Frontend ใช้ `import.meta.env.VITE_API_URL` ไม่ hardcode URL backend
- [ ] มี `frontend/vercel.json` ถ้าใช้ React Router (เช็คนามสกุลไฟล์ให้ถูก!)
- [ ] มี `.gitignore` ครอบคลุม `node_modules/`, `.env`
- [ ] รัน `git status` เช็คว่าไม่มี `.env` ติดไปด้วยก่อน commit ทุกครั้ง
- [ ] Railway: Root Directory = `backend`, Variables ครบและเป็นค่าจริง
- [ ] Vercel: Root Directory = `frontend`, `VITE_API_URL` ชี้ไป Railway ถูกต้อง
- [ ] หลัง deploy ทั้งคู่แล้ว กลับไปตั้ง `CORS_ORIGIN` ที่ Railway ให้ตรงกับ URL ของ Vercel
