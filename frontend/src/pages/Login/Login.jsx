// src/pages/Login/Login.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userData = await login(username, password);
      // role "foreman" ให้เข้าหน้ากรอกงานภาคสนามโดยตรง (ไม่เห็นเมนูอื่นในระบบเลย) ส่วน role อื่นเข้า
      // หน้า dashboard เต็มรูปแบบตามปกติ
      navigate(userData.role === 'foreman' ? '/foreman' : '/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-flat">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-card__title">SIKARIN - PROJECT MGT</h1>
        <p className="login-card__subtitle">เข้าสู่ระบบเพื่อจัดการข้อมูลโครงการ</p>

        {error && <div className="login-card__error" role="alert">{error}</div>}

        <label className="field">
          <span className="field__label">ชื่อผู้ใช้</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ชื่อผู้ใช้"
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">รหัสผ่าน</span>
          <div className="field__password-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="field__password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              tabIndex={-1}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </label>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', marginTop: 16, marginBottom: 0 }}>
          ยังไม่มีบัญชี? <Link to="/register">สมัครสมาชิก</Link>
        </p>
      </form>
    </div>
  );
}
