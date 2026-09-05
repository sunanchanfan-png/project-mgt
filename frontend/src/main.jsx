// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

// เช็ค Service Worker เวอร์ชันใหม่ทุกครั้งที่โหลดหน้าเว็บ — ถ้าเจอเวอร์ชันใหม่ (deploy ใหม่ไปแล้ว) ให้
// reload หน้าเว็บให้อัตโนมัติทันที กันปัญหา "หน้าเว็บเละ" ที่เจอมาก่อน (CSS/JS ใหม่มากับ HTML เก่าที่ค้าง
// อยู่ในแท็บที่เปิดค้างไว้นานๆ จับคู่กันไม่ตรงเวอร์ชัน) — onNeedRefresh ทำงานอัตโนมัติได้เพราะตั้ง
// skipWaiting+clientsClaim ไว้ที่ vite.config.js แล้ว ไม่ต้องรอผู้ใช้กดยืนยันเอง
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
