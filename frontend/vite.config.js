import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // registerType: 'autoUpdate' — เช็ค Service Worker เวอร์ชันใหม่ให้อัตโนมัติทุกครั้งที่โหลดหน้าเว็บ
      // แล้วสลับไปใช้ทันทีตอน reload ครั้งถัดไป (ไม่ต้องให้ผู้ใช้กด "อัปเดต" เองแบบ manual)
      registerType: 'autoUpdate',
      // includeAssets: ไฟล์ static เหล่านี้ต้องถูก precache ไว้ด้วย (ไม่ใช่แค่ระบุใน manifest เฉยๆ)
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'SIKARIN - Project Management',
        short_name: 'SIKARIN',
        description: 'ระบบจัดการโครงการก่อสร้าง SIKARIN',
        theme_color: '#E8702A', // สีส้มหลักของระบบ (เดียวกับ --accent ใน index.css) — ใช้เป็นสีแถบสถานะ
        // บนมือถือ (status bar) ตอนเปิดแอปจากหน้าจอโฮม
        background_color: '#ffffff',
        display: 'standalone', // เปิดแบบเต็มจอไม่มี address bar ของเบราว์เซอร์ ให้ความรู้สึกเหมือนแอปจริง
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // globPatterns: บอกให้ precache ไฟล์ static ที่ build ออกมาทั้งหมด (JS/CSS/HTML/รูป) เพื่อให้เปิด
        // แอปได้แม้ไม่มีเน็ต (โหลดจาก cache local แทน) — ส่วนข้อมูลจริง (API call) ยังต้องมีเน็ตเหมือนเดิม
        // ตอนนี้ยัง (เฟส 1 ทำแค่ให้ "เปิดแอปได้") เฟสถัดไปถึงจะทำ offline สำหรับข้อมูลจริงที่กรอกจริง
        globPatterns: ['**/*.{js,css,html,ico,svg,png}'],
        // skipWaiting + clientsClaim: บังคับให้ Service Worker เวอร์ชันใหม่เข้าคุมทุกแท็บที่เปิดอยู่ทันที
        // ไม่ต้องรอให้ผู้ใช้ปิดแท็บเก่าทั้งหมดก่อน (ค่า default ของ workbox จะ "รอ" แบบนั้น ทำให้เจอปัญหา
        // เปิดค้างไว้ตั้งแต่ก่อน deploy ใหม่ แล้วเห็น CSS/JS เวอร์ชันเก่าค้างอยู่ ทั้งที่ deploy ใหม่ไปแล้วจริง
        // — เป็นสาเหตุของ "หน้าเว็บเละ" ที่เจอ เพราะ CSS ใหม่มากับ HTML เก่า จับคู่กันไม่ตรง)
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
