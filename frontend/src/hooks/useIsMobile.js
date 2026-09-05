// src/hooks/useIsMobile.js
// hook เล็กๆ เช็คว่าหน้าจอตอนนี้ถือว่าเป็น "มือถือ" หรือไม่ (จาก viewport width) ใช้สลับ layout ระหว่าง
// หน้าคอมพิวเตอร์ปกติ กับหน้าจอมือถือแบบใหม่ (ทำทีละกิจกรรมงาน) — ใช้แค่ความกว้างจอเป็นเกณฑ์ (ไม่เช็ค user
// agent) เพราะง่ายกว่าและครอบคลุมกรณีเปิดจาก PWA/มือถือจริงได้ตรงไปตรงมาที่สุด
import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768; // ต่ำกว่านี้ถือว่าเป็นมือถือ/แท็บเล็ตแนวตั้ง

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
