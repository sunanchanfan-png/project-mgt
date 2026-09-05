// src/pages/Login/Register.jsx
// หน้าสมัครสมาชิกเอง — ไม่มีให้เลือก role (system_mgr เป็นคนกำหนด role + สิทธิ์ menu/tab ให้ทีหลังตอน
// อนุมัติ) สมัครเสร็จแล้วต้องรออนุมัติก่อนถึง login เข้าใช้งานได้จริง
import { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import './Login.css';

export default function Register() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    setLoading(true);
    try {
      await client.post('/auth/register', { name, username, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'สมัครสมาชิกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="login-flat">
        <div className="login-card">
          <h1 className="login-card__title">สมัครสมาชิกสำเร็จ</h1>
          <p className="login-card__subtitle">
            บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติและกำหนดสิทธิ์การใช้งาน จะสามารถเข้าสู่ระบบได้หลังได้รับการอนุมัติแล้ว
          </p>
          <Link to="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-flat">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-card__title">สมัครสมาชิก</h1>
        <p className="login-card__subtitle">สมัครเข้าใช้งานระบบ SIKARIN - PROJECT MGT</p>

        {error && <div className="login-card__error" role="alert">{error}</div>}

        <label className="field">
          <span className="field__label">ชื่อ-นามสกุล</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ นามสกุล" required autoFocus />
        </label>

        <label className="field">
          <span className="field__label">ชื่อผู้ใช้</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ชื่อผู้ใช้สำหรับเข้าสู่ระบบ" required />
        </label>

        <label className="field">
          <span className="field__label">รหัสผ่าน</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" required />
        </label>

        <label className="field">
          <span className="field__label">ยืนยันรหัสผ่าน</span>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
        </label>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', marginTop: 16, marginBottom: 0 }}>
          มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
        </p>
      </form>
    </div>
  );
}
