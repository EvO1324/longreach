/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pilots, ifLive } from '../api/client';
import { User, Settings } from 'lucide-react';
import { showToast } from '../components/Toast';
import RankCard, { useRanks } from '../components/RankBadge';
import { PilotBadges } from '../components/PilotBadge';

// PIREP Import Component
function Profile({ user, onUserUpdate }) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { ranks } = useRanks();
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', ifc_username: '',
  });
  const [pwForm, setPwForm]   = useState({ current: '', new: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError]     = useState('');

  const [ifLinkStatus, setIfLinkStatus] = useState(null); // null = loading
  const [ifLinking, setIfLinking] = useState(false);
  const [ifUnlinking, setIfUnlinking] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'settings' || user.must_change_password ? 'settings' : 'overview';
  const setTab = id => setSearchParams(prev => {
    if (id === 'settings') prev.set('tab', 'settings'); else prev.delete('tab');
    return prev;
  });

  useEffect(() => {
    if (searchParams.get('if_live_connected')) {
      showToast('Infinite Flight account linked', 'success');
      setSearchParams(prev => { prev.delete('if_live_connected'); return prev; }, { replace: true });
    }
    const err = searchParams.get('if_live_error');
    if (err) {
      showToast(`Infinite Flight linking failed: ${err}`, 'error');
      setSearchParams(prev => { prev.delete('if_live_error'); return prev; }, { replace: true });
    }
    ifLive.linkStatus().then(setIfLinkStatus).catch(() => setIfLinkStatus({ connected: false, if_username: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIfLink = async () => {
    setIfLinking(true);
    try {
      const { authUrl } = await ifLive.link('/profile');
      window.location.href = authUrl;
    } catch (err) {
      showToast(err.message || 'Could not start Infinite Flight linking.', 'error');
      setIfLinking(false);
    }
  };

  const handleIfUnlink = async () => {
    setIfUnlinking(true);
    try {
      await ifLive.disconnect();
      setIfLinkStatus({ connected: false, if_username: null });
      showToast('Infinite Flight account unlinked', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unlink', 'error');
    } finally {
      setIfUnlinking(false);
    }
  };

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        ifc_username: user.ifc_username || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ifc_username.trim()) {
      showToast('IFC Username is required', 'error');
      return;
    }
    try {
      setLoading(true);
      await pilots.updateMe({
        first_name: formData.first_name,
        last_name: formData.last_name,
        ifc_username: formData.ifc_username,
      });
      showToast('Profile updated successfully!', 'success');
      setEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      ifc_username: user.ifc_username || '',
    });
    setEditing(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.new !== pwForm.confirm) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.new.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    try {
      setPwLoading(true);
      await pilots.changePassword({ current_password: pwForm.current, new_password: pwForm.new });
      showToast('Password changed successfully!', 'success');
      setPwForm({ current: '', new: '', confirm: '' });
      if (onUserUpdate) onUserUpdate({ ...user, must_change_password: false });
    } catch (err) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem',
    border: '1px solid var(--border-color)',
    borderRadius: '6px', fontSize: '1rem',
    backgroundColor: 'var(--bg-card)',
  };

  return (
    <div>
      <div className="page-header">
        <h2>My Profile</h2>
        <p>Manage your account information</p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '2px solid var(--border-color)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {[{ id: 'overview', label: 'Overview', Icon: User }, { id: 'settings', label: 'Settings', Icon: Settings }].map(({ id, label, Icon }) => {
          const isActive = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1rem 1.25rem',
              background: 'none', border: 'none',
              borderBottom: isActive ? '3px solid var(--avg-green)' : '3px solid transparent',
              color: isActive ? 'var(--avg-green)' : 'var(--text-secondary)',
              fontWeight: isActive ? 600 : 500, cursor: 'pointer', fontSize: '0.95rem', whiteSpace: 'nowrap',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', marginBottom: '-2px', opacity: isActive ? 1 : 0.7,
            }}>
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <>
          <RankCard user={user} ranks={ranks} />
          <PilotBadges userId={user?.id} title="Your badges" />
        </>
      )}

      {tab === 'settings' && (
        <>
      {/* Force password change banner */}
      {user.must_change_password && (
        <div style={{
          marginBottom: '2rem', padding: '1rem 1.5rem',
          background: 'rgba(230,81,0,0.07)', border: '2px solid #ff8f00',
          borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e65100" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <div style={{ fontWeight: 700, color: '#e65100', marginBottom: '0.2rem' }}>Password reset required</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>An admin has reset your password. Please change it below before continuing.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Account Details</h3>
            {user.has_imported_history && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '3px 8px', borderRadius: '5px',
                background: 'rgba(198,40,40,0.1)', color: '#c62828',
                border: '1px solid rgba(198,40,40,0.25)',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Legacy Pilot
              </span>
            )}
          </div>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn btn-primary">Edit Profile</button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>First Name</label>
                <input type="text" value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Last Name</label>
                <input type="text" value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Email</label>
                <input type="email" value={formData.email} disabled
                  style={{ ...inputStyle, backgroundColor: 'var(--bg-hover)', opacity: 0.6, cursor: 'not-allowed' }} />
                <small style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Email cannot be changed here - please contact staff via discord.</small>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>IFC Username</label>
                <input type="text" value={formData.ifc_username}
                  onChange={(e) => setFormData({ ...formData, ifc_username: e.target.value })}
                  required placeholder="Your IFC username" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              {[
                { label: 'First Name', value: user.first_name },
                { label: 'Email', value: user.email },
                { label: 'Callsign', value: user.callsign, red: true, note: 'Cannot be changed- please contact staff via discord.' },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{item.label}</label>
                  <div style={{ fontSize: item.red ? '1.2rem' : '1.1rem', fontWeight: item.red ? 600 : 500, color: item.red ? 'var(--avg-green)' : 'inherit' }}>
                    {item.value}
                  </div>
                  {item.note && <small style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{item.note}</small>}
                </div>
              ))}
            </div>
            <div>
              {[
                { label: 'Last Name', value: user.last_name },
                { label: 'IFC Username', value: user.ifc_username || '-' },
                { label: 'Role', value: user.role, capitalize: true },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{item.label}</label>
                  <div style={{ fontSize: '1.1rem', fontWeight: 500, textTransform: item.capitalize ? 'capitalize' : 'none' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>Change Password</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Choose a strong password of at least 8 characters.
        </p>
        <form onSubmit={handlePasswordChange} style={{ maxWidth: 420 }}>
          {[
            { key: 'current', label: 'Current Password',  placeholder: 'Enter current password' },
            { key: 'new',     label: 'New Password',      placeholder: 'At least 8 characters' },
            { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>{label}</label>
              <input
                type="password"
                value={pwForm[key]}
                onChange={e => setPwForm({ ...pwForm, [key]: e.target.value })}
                placeholder={placeholder}
                required
                style={{
                  width: '100%', padding: '0.75rem',
                  border: '1px solid var(--border-color)', borderRadius: '6px',
                  fontSize: '1rem', backgroundColor: 'var(--bg-card)',
                }}
              />
            </div>
          ))}
          {pwError && (
            <div style={{ marginBottom: '1rem', padding: '0.6rem 0.875rem', background: 'rgba(198,40,40,0.06)', border: '1px solid #ffcdd2', borderRadius: '6px', fontSize: '0.875rem', color: '#c62828' }}>
              {pwError}
            </div>
          )}
          <button type="submit" disabled={pwLoading} className="btn btn-primary">
            {pwLoading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Infinite Flight Account */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>Infinite Flight Account</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Link your Infinite Flight account to sign in with "Continue with Infinite Flight" instead of a password, and to unlock IF Live features if you're on the beta.
        </p>

        {ifLinkStatus === null && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Checking connection status…</p>
        )}

        {ifLinkStatus?.connected && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <div>
                <div style={{ fontWeight: 600 }}>Connected{ifLinkStatus.if_username ? ` as @${ifLinkStatus.if_username}` : ''}</div>
                {user.if_verified && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Your account was verified via Infinite Flight at signup.</div>
                )}
              </div>
            </div>
            <button type="button" onClick={handleIfUnlink} disabled={ifUnlinking} className="btn" style={{ border: '1px solid var(--border-color)', background: 'none' }}>
              {ifUnlinking ? 'Unlinking...' : 'Unlink'}
            </button>
          </div>
        )}

        {ifLinkStatus && !ifLinkStatus.connected && (
          <button type="button" onClick={handleIfLink} disabled={ifLinking} className="btn btn-primary">
            {ifLinking ? 'Redirecting to Infinite Flight…' : 'Link Infinite Flight Account'}
          </button>
        )}
      </div>

        </>
      )}
    </div>
  );
}

export default Profile;
