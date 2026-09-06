// src/api/client.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const client = axios.create({
  baseURL: API_URL,
});

// แนบ JWT token ทุก request อัตโนมัติ ถ้ามีเก็บไว้ใน localStorage
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ถ้า token หมดอายุ/ไม่ถูกต้อง (401) ให้เด้งกลับหน้า login อัตโนมัติ — ไม่รวม 403 (สิทธิ์ไม่พอ) อีกต่อไป
// เพราะ 403 หมายถึง "login ถูกต้องแล้ว แต่ไม่มีสิทธิ์เข้าถึงส่วนนี้" (เช่น foreman ที่ยังไม่ได้ตั้งสิทธิ์
// Tab บางอัน) ไม่ใช่ token เสีย — เดิมรวม 403 ไว้ด้วยทำให้ foreman ที่ล็อกอินถูกต้องแต่มี API บางตัวที่ยัง
// ไม่ได้รับสิทธิ์ (เช่น /reports/current ตอนยังไม่ได้ตั้ง user_permissions) โดนเด้งออกจากระบบทันทีที่หน้า
// เว็บลองเรียก API นั้นแบบเงียบๆ ทั้งที่ล็อกอินสำเร็จจริง — ปล่อยให้ error 403 เป็นหน้าที่ของแต่ละหน้าจอ
// จัดการเอง (โชว์ข้อความแจ้งเตือนแทน ไม่บังคับออกจากระบบ)
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
