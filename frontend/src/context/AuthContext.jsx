// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  // สิทธิ์ menu/tab ของ user ที่ login อยู่ — { all: true } สำหรับ admin/system_mgr (เข้าถึงได้ทุกอย่าง)
  // หรือ { all: false, permissions: [{menu_key, tab_key}] } สำหรับ role อื่นๆ — โหลดครั้งเดียวตอน login/
  // ตอนเปิดแอปครั้งแรก (ถ้ามี user ค้างอยู่ใน localStorage) แล้ว cache ไว้ใน state ไม่ query ซ้ำทุกครั้ง
  const [permissions, setPermissions] = useState(() => {
    const saved = localStorage.getItem('permissions');
    return saved ? JSON.parse(saved) : null;
  });

  async function loadPermissions() {
    try {
      const res = await client.get('/permissions/me');
      localStorage.setItem('permissions', JSON.stringify(res.data));
      setPermissions(res.data);
    } catch {
      // ถ้าดึงไม่สำเร็จ (เช่น เน็ตหลุดจังหวะนั้น) ต้องล้าง localStorage ทิ้งด้วย ไม่ใช่แค่ reset state เป็น
      // null เฉยๆ — ไม่งั้นค่าสิทธิ์เก่า (อาจผิด/ล้าสมัยแล้ว เช่น role เพิ่งถูกเปลี่ยนแต่ยังไม่ได้ login ใหม่)
      // จะยังค้างอยู่ใน localStorage ต่อไป พอ refresh หน้าเว็บรอบถัดไป useEffect ด้านล่างจะเห็นว่ามี
      // permissions อยู่แล้ว (ทั้งที่ผิด) เลยไม่ยอม retry ดึงใหม่ให้ ทำให้ค้างสิทธิ์ผิดถาวรจนกว่าจะ logout
      localStorage.removeItem('permissions');
      setPermissions(null);
    }
  }

  // เผื่อกรณี user login ค้างอยู่จากก่อนที่ฟีเจอร์กำหนดสิทธิ์นี้จะ deploy (มี user ใน localStorage แต่ไม่มี
  // permissions มาก่อน) — ให้ดึงมาให้ตอนเปิดแอปครั้งแรกด้วย ไม่งั้น Sidebar จะโชว์เมนูไม่ได้เลยสักอันจนกว่า
  // จะ logout/login ใหม่
  useEffect(() => {
    if (user && !permissions) {
      loadPermissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(username, password) {
    const res = await client.post('/auth/login', { username, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    await loadPermissions();
    return userData;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    setUser(null);
    setPermissions(null);
  }

  // เมนูไหนที่ user คนนี้เข้าได้ (ไม่สน tab ย่อย) — ใช้กรอง Sidebar
  function canAccessMenu(menuKey) {
    if (!permissions) return false; // ยังไม่รู้สิทธิ์ (ยังโหลดไม่เสร็จ) ให้ถือว่ายังเข้าไม่ได้ไปก่อน
    if (permissions.all) return true;
    return permissions.permissions.some((p) => p.menu_key === menuKey);
  }

  // Tab เฉพาะเจาะจงใน menu นั้นเข้าได้ไหม — ใช้กรอง Tab bar ในแต่ละหน้า (เมนูที่ไม่มี tab ย่อยส่ง tabKey='')
  function canAccessTab(menuKey, tabKey = '') {
    if (!permissions) return false;
    if (permissions.all) return true;
    return permissions.permissions.some((p) => p.menu_key === menuKey && p.tab_key === tabKey);
  }

  return (
    <AuthContext.Provider value={{ user, permissions, login, logout, loadPermissions, canAccessMenu, canAccessTab }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องใช้ภายใน AuthProvider เท่านั้น');
  return ctx;
}
