// src/pages/PermissionApproval/PermissionApproval.jsx
// หน้า "อนุมัติและกำหนดสิทธิ์" — เฉพาะ role system_mgr (และ admin ซึ่งเป็น superuser) เท่านั้นที่เข้าได้
// อนุมัติ user ที่สมัครเข้ามาใหม่ + กำหนด role และสิทธิ์ menu/tab ให้เลยจบในขั้นตอนเดียว และแก้ไขสิทธิ์ของ
// user ที่อนุมัติไปแล้วทีหลังได้ทุกเมื่อจากหน้าเดียวกันนี้
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './PermissionApproval.css';

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'viewer (ดูอย่างเดียว)' },
  { value: 'foreman', label: 'foreman (โฟร์แมน)' },
  { value: 'pm', label: 'pm (ผู้จัดการโครงการ)' },
  { value: 'admin', label: 'admin (ผู้ดูแลระบบ)' },
  { value: 'system_mgr', label: 'system_mgr (กำหนดสิทธิ์ผู้อื่นได้)' },
];

const STATUS_LABEL = {
  pending: { text: 'รออนุมัติ', className: 'perm-status--pending' },
  approved: { text: 'อนุมัติแล้ว', className: 'perm-status--approved' },
  rejected: { text: 'ปฏิเสธแล้ว', className: 'perm-status--rejected' },
};

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PermissionApproval() {
  const { user: currentUser } = useAuth();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [users, setUsers] = useState([]);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState(null); // user object ที่กำลังเปิด panel กำหนดสิทธิ์อยู่
  const [resettingUser, setResettingUser] = useState(null); // user object ที่กำลังเปิด panel รีเซ็ตรหัสผ่านอยู่

  function fetchUsers() {
    setLoading(true);
    client.get('/permissions/users', { params: { status: statusFilter } })
      .then((res) => { setUsers(res.data.users); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'ดึงรายชื่อผู้ใช้ไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchUsers(); }, [statusFilter]);

  useEffect(() => {
    client.get('/permissions/menu-registry').then((res) => setMenus(res.data.menus));
  }, []);

  async function handleReject(userId, isRevoke) {
    const msg = isRevoke
      ? 'ยืนยันยกเลิกสิทธิ์ผู้ใช้นี้? จะเข้าสู่ระบบไม่ได้ทันที (ยังกู้คืนสิทธิ์เดิมได้ทีหลังถ้าอนุมัติใหม่)'
      : 'ยืนยันปฏิเสธคำขอนี้? ผู้ใช้จะไม่สามารถเข้าสู่ระบบได้';
    if (!window.confirm(msg)) return;
    try {
      await client.post(`/permissions/users/${userId}/reject`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'ดำเนินการไม่สำเร็จ');
    }
  }

  async function handleDelete(userId) {
    if (!window.confirm('ยืนยันลบผู้ใช้นี้ออกจากระบบถาวร? การลบนี้กู้คืนไม่ได้ (ต่างจากปฏิเสธ/ยกเลิกสิทธิ์ที่ยังเก็บข้อมูลไว้)')) return;
    try {
      await client.delete(`/permissions/users/${userId}`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ');
    }
  }

  return (
    <Layout title="อนุมัติและกำหนดสิทธิ์">
      <div className="pdata-toolbar">
        <div className="pdata-toolbar__filters-group">
          <button
            className={`perm-filter-btn ${statusFilter === 'pending' ? 'perm-filter-btn--active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            รออนุมัติ
          </button>
          <button
            className={`perm-filter-btn ${statusFilter === 'approved' ? 'perm-filter-btn--active' : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            อนุมัติแล้ว (จัดการสิทธิ์)
          </button>
          <button
            className={`perm-filter-btn ${statusFilter === 'rejected' ? 'perm-filter-btn--active' : ''}`}
            onClick={() => setStatusFilter('rejected')}
          >
            ปฏิเสธแล้ว
          </button>
        </div>
      </div>

      {loading && <p>กำลังโหลดข้อมูล...</p>}
      {error && <p className="pdata-status pdata-status--warn">{error}</p>}
      {!loading && users.length === 0 && <p className="pdata-status">ไม่มีรายการในหมวดนี้</p>}

      {!loading && users.length > 0 && (
        <table className="perm-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>ชื่อผู้ใช้</th>
              <th>Role</th>
              <th>สถานะ</th>
              <th>สมัครเมื่อ</th>
              <th>จำนวนสิทธิ์</th>
              <th>การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.username}</td>
                <td>{u.role || '-'}</td>
                <td><span className={`perm-status ${STATUS_LABEL[u.status]?.className || ''}`}>{STATUS_LABEL[u.status]?.text || u.status}</span></td>
                <td>{fmtDateTime(u.created_at)}</td>
                <td>{u.permissions.length}</td>
                <td>
                  <div className="perm-table__actions">
                    <button className="link-btn" onClick={() => setEditingUser(u)}>
                      {u.status === 'pending' ? 'อนุมัติ' : 'แก้ไขสิทธิ์'}
                    </button>
                    {u.status === 'pending' && (
                      <button className="link-btn link-btn--danger" onClick={() => handleReject(u.id, false)}>ปฏิเสธ</button>
                    )}
                    {u.status === 'approved' && String(u.id) !== String(currentUser?.id) && (
                      <button className="link-btn link-btn--danger" onClick={() => handleReject(u.id, true)}>ยกเลิกสิทธิ์</button>
                    )}
                    {u.status === 'approved' && (
                      <button className="link-btn" onClick={() => setResettingUser(u)}>รีเซ็ตรหัสผ่าน</button>
                    )}
                    {String(u.id) !== String(currentUser?.id) && (
                      <button className="link-btn link-btn--danger" onClick={() => handleDelete(u.id)}>ลบ</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingUser && (
        <PermissionEditPanel
          user={editingUser}
          menus={menus}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); fetchUsers(); }}
        />
      )}

      {resettingUser && (
        <ResetPasswordPanel
          user={resettingUser}
          onClose={() => setResettingUser(null)}
        />
      )}
    </Layout>
  );
}

function PermissionEditPanel({ user, menus, onClose, onSaved }) {
  const isApproveFlow = user.status === 'pending';
  const [role, setRole] = useState(user.role || 'viewer');
  const [selectedKeys, setSelectedKeys] = useState(() => {
    const set = new Set();
    (user.permissions || []).forEach((p) => set.add(`${p.menu_key}|${p.tab_key || ''}`));
    return set;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleKey(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // ติ๊ก/ยกเลิกทั้งเมนูในทีเดียว (ถ้าเมนูไม่มี tab ย่อย = ติ๊กแค่ตัวเมนูเอง)
  function toggleWholeMenu(menu, checked) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const keys = menu.tabs.length === 0 ? [`${menu.menu_key}|`] : menu.tabs.map((t) => `${menu.menu_key}|${t.tab_key}`);
      keys.forEach((k) => { if (checked) next.add(k); else next.delete(k); });
      return next;
    });
  }

  function isWholeMenuChecked(menu) {
    const keys = menu.tabs.length === 0 ? [`${menu.menu_key}|`] : menu.tabs.map((t) => `${menu.menu_key}|${t.tab_key}`);
    return keys.length > 0 && keys.every((k) => selectedKeys.has(k));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const permissions = [...selectedKeys].map((k) => {
      const idx = k.indexOf('|');
      return { menu_key: k.slice(0, idx), tab_key: k.slice(idx + 1) };
    });
    try {
      if (isApproveFlow) {
        await client.post(`/permissions/users/${user.id}/approve`, { role, permissions });
      } else {
        await client.put(`/permissions/users/${user.id}`, { role, permissions });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="perm-modal-backdrop" onClick={onClose}>
      <div className="perm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="perm-modal__title">
          {isApproveFlow ? 'อนุมัติและกำหนดสิทธิ์' : 'แก้ไขสิทธิ์'} — {user.name} ({user.username})
        </h3>

        {error && <p className="pdata-status pdata-status--warn">{error}</p>}

        <label className="perm-modal__field">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>

        <div className="perm-modal__menus">
          <span className="perm-modal__field-label">สิทธิ์เข้าถึง Menu / Tab</span>
          {menus.map((menu) => (
            <div key={menu.menu_key} className="perm-menu-block">
              <label className="perm-menu-block__header">
                <input type="checkbox" checked={isWholeMenuChecked(menu)} onChange={(e) => toggleWholeMenu(menu, e.target.checked)} />
                <strong>{menu.menu_label}</strong>
              </label>
              {menu.tabs.length > 0 && (
                <div className="perm-menu-block__tabs">
                  {menu.tabs.map((t) => {
                    const key = `${menu.menu_key}|${t.tab_key}`;
                    return (
                      <label key={t.tab_key} className="perm-tab-checkbox">
                        <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleKey(key)} />
                        {t.tab_label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="perm-modal__footer">
          <button className="btn-secondary btn-secondary--sm" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button className="btn-primary btn-primary--sm" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : (isApproveFlow ? 'อนุมัติ' : 'บันทึก')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Panel ตั้งรหัสผ่านใหม่ให้ user คนอื่น (กรณีลืมรหัสผ่านเดิม) — system_mgr/admin พิมพ์รหัสผ่านใหม่เอง 2
 * ช่องให้ตรงกัน แล้วแจ้งรหัสผ่านนี้ให้ user ทราบเองนอกระบบ (โทร/LINE ฯลฯ) เพราะระบบนี้ไม่มีการส่งอีเมลจริง
 */
function ResetPasswordPanel({ user, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSave() {
    setError('');
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    if (newPassword.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    setSaving(true);
    try {
      await client.post(`/permissions/users/${user.id}/reset-password`, { newPassword });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="perm-modal-backdrop" onClick={onClose}>
      <div className="perm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 className="perm-modal__title">รีเซ็ตรหัสผ่าน — {user.name} ({user.username})</h3>

        {error && <p className="pdata-status pdata-status--warn">{error}</p>}

        {done ? (
          <>
            <p className="pdata-status pdata-status--ok">
              ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว — กรุณาแจ้งรหัสผ่านนี้ให้ <strong>{user.name}</strong> ทราบเอง (โทร/LINE ฯลฯ)
            </p>
            <div className="perm-modal__footer">
              <button className="btn-primary btn-primary--sm" onClick={onClose}>ปิด</button>
            </div>
          </>
        ) : (
          <>
            <label className="perm-modal__field">
              <span>รหัสผ่านใหม่</span>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                autoFocus
              />
            </label>
            <label className="perm-modal__field">
              <span>ยืนยันรหัสผ่านใหม่</span>
              <input
                type="text"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="พิมพ์ซ้ำให้ตรงกัน"
              />
            </label>
            <div className="perm-modal__footer">
              <button className="btn-secondary btn-secondary--sm" onClick={onClose} disabled={saving}>ยกเลิก</button>
              <button className="btn-primary btn-primary--sm" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
