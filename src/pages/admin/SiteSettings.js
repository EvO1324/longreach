/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';
import { devTools, settings as settingsApi, changelog as changelogApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';
import {
  RefreshCw, Zap, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertCircle, Loader, Calendar, BookOpen, Plus, Trash2, Edit3, X,
  Megaphone, Wrench, Info, AlertTriangle, } from 'lucide-react';

import brand from '../../brand';
// Shared UI primitives

function ToolCard({ icon: Icon, title, description, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(var(--brand-primary-rgb),0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} color="var(--avg-green)" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{description}</div>
        </div>
      </div>
      <div style={{ padding: '1.25rem 1.5rem' }}>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const configs = {
    idle:    { color: 'var(--text-secondary)', bg: 'var(--bg-hover)',           label: 'Idle' },
    running: { color: 'var(--avg-green)',       bg: 'rgba(var(--brand-primary-rgb),0.08)',     label: 'Running…' },
    success: { color: '#2e7d32',                bg: 'rgba(46,125,50,0.1)',      label: 'Done' },
    error:   { color: '#c62828',                bg: 'rgba(198,40,40,0.1)',      label: 'Error' },
  };
  const c = configs[status] || configs.idle;
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '6px', background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {status === 'running' && <Loader size={10} style={{ marginRight: 4, display: 'inline', animation: 'spin 1s linear infinite' }} />}
      {c.label}
    </span>
  );
}

function LogOutput({ lines }) {
  const [expanded, setExpanded] = useState(false);
  if (!lines || lines.length === 0) return null;

  const preview = lines.slice(0, 5);
  const shown   = expanded ? lines : preview;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ background: '#0d1117', borderRadius: '8px', padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.6, maxHeight: expanded ? 400 : 160, overflowY: 'auto' }}>
        {shown.map((line, i) => {
          const isOk   = line.startsWith('OK');
          const isErr  = line.startsWith('ERR');
          const isSkip = line.startsWith('SKIP');
          return (
            <div key={i} style={{ color: isOk ? '#4caf50' : isErr ? '#ef5350' : isSkip ? '#78909c' : '#cdd9e5', display: 'flex', gap: '0.5rem' }}>
              {isOk   && <CheckCircle  size={11} style={{ marginTop: 3, flexShrink: 0 }} />}
              {isErr  && <XCircle      size={11} style={{ marginTop: 3, flexShrink: 0 }} />}
              {isSkip && <AlertCircle  size={11} style={{ marginTop: 3, flexShrink: 0 }} />}
              {!isOk && !isErr && !isSkip && <span style={{ width: 11 }} />}
              <span>{line.replace(/^(OK|ERR|SKIP)\s+/, '')}</span>
            </div>
          );
        })}
        {!expanded && lines.length > 5 && (
          <div style={{ color: '#78909c', marginTop: '0.25rem' }}>… {lines.length - 5} more lines</div>
        )}
      </div>
      {lines.length > 5 && (
        <button onClick={() => setExpanded(e => !e)} style={{ marginTop: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--avg-green)', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color)' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

// Tools

function SyncRankRoles() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);

  const run = async () => {
    if (status === 'running') return;
    setStatus('running');
    setResult(null);
    try {
      const data = await devTools.syncRankRoles();
      setResult(data);
      setStatus('success');
      showToast(`Synced ${data.synced} pilots${data.warningRolesCleared ? `, cleared ${data.warningRolesCleared} stale inactivity role${data.warningRolesCleared === 1 ? '' : 's'}` : ''}`, 'success');
    } catch (err) {
      setResult({ error: err.message, log: [] });
      setStatus('error');
      showToast('Sync failed — check log', 'error');
    }
  };

  return (
    <ToolCard icon={RefreshCw} title="Sync Discord Rank Roles" description="Re-assigns every pilot's rank role on Discord based on their current hours. No rank-up messages are sent.">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: result ? '1rem' : 0 }}>
        <button onClick={run} disabled={status === 'running'} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', opacity: status === 'running' ? 0.6 : 1 }}>
          {status === 'running' ? 'Syncing…' : 'Run Sync'}
        </button>
        <StatusBadge status={status} />
        {result && !result.error && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            {result.total} pilots processed
          </span>
        )}
      </div>
      {result && !result.error && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ marginBottom: '0.25rem' }}>
            <StatRow label="Synced"  value={result.synced}  color="#4caf50" />
            <StatRow label="Skipped" value={result.skipped} color="#78909c" />
            <StatRow label="Errors"  value={result.errors}  color={result.errors > 0 ? '#ef5350' : 'var(--text-primary)'} />
            <StatRow label="Roles Cleared" value={result.warningRolesCleared || 0} color="#ffa726" />
          </div>
          <LogOutput lines={result.log} />
        </div>
      )}
      {result?.error && (
        <div style={{ marginTop: '0.75rem', color: '#ef5350', fontSize: '0.82rem', fontFamily: 'monospace' }}>{result.error}</div>
      )}
    </ToolCard>
  );
}

// Challenge Notification Tests

// Leaderboard Config

function LeaderboardConfig() {
  const [hour,   setHour]   = useState('5');
  const [minute, setMinute] = useState('0');
  const [day,    setDay]    = useState('1');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('idle');

  const DAYS = [
    { value: '0', label: 'Sunday' },
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
  ];

  React.useEffect(() => {
    settingsApi.list().then(d => {
      const timeVal = d.settings?.leaderboard_post_time;
      const dayVal  = d.settings?.leaderboard_post_day;
      if (timeVal) { const [h, m] = timeVal.split(':'); setHour(h); setMinute(m || '0'); }
      if (dayVal) setDay(dayVal);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setStatus('running');
    try {
      const h = String(parseInt(hour,  10) || 0).padStart(2, '0');
      const m = String(parseInt(minute, 10) || 0).padStart(2, '0');
      await Promise.all([
        settingsApi.save('leaderboard_post_time', `${h}:${m}`),
        settingsApi.save('leaderboard_post_day',  day),
      ]);
      const dayLabel = DAYS.find(d => d.value === day)?.label || 'Monday';
      setStatus('success');
      showToast(`Leaderboard will post ${dayLabel}s at ${h}:${m} ${brand.timezone} time`, 'success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      showToast(err.message || 'Failed to save', 'error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const inputStyle = {
    width: '70px', padding: '0.55rem 0.75rem',
    border: '1px solid var(--border-color)', borderRadius: '6px',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: '0.95rem', fontFamily: 'monospace', textAlign: 'center', boxSizing: 'border-box',
  };

  return (
    <ToolCard icon={Calendar} title="Weekly Leaderboard" description={`Configure what time the leaderboard posts to Discord each Monday (${brand.timezone} time).`}>
      {!loaded ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Day</label>
              <select value={day} onChange={e => setDay(e.target.value)} style={{ padding: '0.55rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit' }}>
                {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time (Sydney)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="number" min="0" max="23" value={hour}   onChange={e => setHour(e.target.value)}   style={inputStyle} />
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>:</span>
                <input type="number" min="0" max="59" value={minute} onChange={e => setMinute(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>AEDT/AEST</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={save} disabled={status === 'running'} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', opacity: status === 'running' ? 0.6 : 1 }}>
              {status === 'running' ? 'Saving…' : 'Save'}
            </button>
            <StatusBadge status={status} />
          </div>
        </>
      )}
    </ToolCard>
  );
}

// Auto-Approve Config

function AutoApproveConfig() {
  const [enabled, setEnabled] = useState(true);
  const [window,  setWindow]  = useState('36');
  const [loaded,  setLoaded]  = useState(false);
  const [status,  setStatus]  = useState('idle');

  React.useEffect(() => {
    settingsApi.list().then(d => {
      const s = d.settings || {};
      setEnabled(s.auto_approve_enabled !== 'false');
      setWindow(s.auto_approve_window_hours || '36');
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    const hours = parseInt(window, 10);
    if (isNaN(hours) || hours < 1 || hours > 168) return showToast('Window must be between 1 and 168 hours', 'error');
    setStatus('running');
    try {
      await Promise.all([
        settingsApi.save('auto_approve_enabled',     String(enabled)),
        settingsApi.save('auto_approve_window_hours', String(hours)),
      ]);
      setStatus('success');
      showToast('Auto-approve settings saved', 'success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      showToast(err.message || 'Failed to save', 'error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const inputStyle = {
    width: '70px', padding: '0.55rem 0.75rem',
    border: '1px solid var(--border-color)', borderRadius: '6px',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: '0.95rem', fontFamily: 'monospace', textAlign: 'center', boxSizing: 'border-box',
  };

  return (
    <ToolCard icon={Zap} title="PIREP Auto-Approve" description="Configure how the Infinite Flight logbook match works when a pilot submits a PIREP.">
      {!loaded ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Auto-approve enabled</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>When on, PIREPs that match an IF logbook entry are approved instantly.</div>
              </div>
              <button onClick={() => setEnabled(e => !e)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: enabled ? 'var(--avg-green)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }} aria-label="Toggle auto-approve">
                <span style={{ position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
            <div style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>IF Logbook Match Window</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input type="number" min="1" max="168" value={window} onChange={e => setWindow(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>hours either side of the PIREP date</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                If the matching IF flight was logged within this window, the PIREP is auto-approved. Default: 36 hours.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={save} disabled={status === 'running'} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', opacity: status === 'running' ? 0.6 : 1 }}>
              {status === 'running' ? 'Saving…' : 'Save'}
            </button>
            <StatusBadge status={status} />
          </div>
        </>
      )}
    </ToolCard>
  );
}

// Feature Flags

// Site Banner

const BANNER_TYPES = [
  { key: 'info',        label: 'Info',        icon: Info,          color: 'var(--avg-green)' },
  { key: 'warning',     label: 'Warning',     icon: AlertTriangle, color: 'var(--avg-gold-dark)' },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench,        color: '#c62828' },
];

const emptyBanner = { enabled: false, type: 'maintenance', message: '', details: '' };

function SiteBannerConfig() {
  const [banner,  setBanner]  = useState(emptyBanner);
  const [loaded,  setLoaded]  = useState(false);
  const [status,  setStatus]  = useState('idle');

  React.useEffect(() => {
    settingsApi.list().then(d => {
      const raw = (d.settings || {}).site_banner;
      if (raw) {
        try { setBanner({ ...emptyBanner, ...JSON.parse(raw) }); } catch { /* keep default */ }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const update = (patch) => setBanner(b => ({ ...b, ...patch }));

  const save = async () => {
    if (banner.enabled && !banner.message.trim()) {
      return showToast('Add a message before turning the banner on', 'error');
    }
    setStatus('running');
    try {
      await settingsApi.save('site_banner', JSON.stringify(banner));
      setStatus('success');
      showToast(banner.enabled ? 'Site banner is now live' : 'Site banner saved', 'success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      showToast(err.message || 'Failed to save banner', 'error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const fieldStyle = {
    width: '100%', padding: '0.6rem 0.75rem',
    border: '1px solid var(--border-color)', borderRadius: '8px',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <ToolCard icon={Megaphone} title="Site Banner" description="Show a banner across the whole crew centre — e.g. for scheduled maintenance or an important update.">
      {!loaded ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.1rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Banner enabled</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>When on, this shows to every pilot on every page (and on the login screen).</div>
            </div>
            <button onClick={() => update({ enabled: !banner.enabled })} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: banner.enabled ? 'var(--avg-green)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }} aria-label="Toggle site banner">
              <span style={{ position: 'absolute', top: 3, left: banner.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

          <div style={{ opacity: banner.enabled ? 1 : 0.55, pointerEvents: banner.enabled ? 'auto' : 'none', transition: 'opacity 0.2s', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {BANNER_TYPES.map(t => {
                  const Icon = t.icon;
                  const active = banner.type === t.key;
                  return (
                    <button key={t.key} onClick={() => update({ type: t.key })} style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem',
                      border: `1.5px solid ${active ? t.color : 'var(--border-color)'}`, borderRadius: '8px',
                      background: active ? `${t.color}18` : 'var(--bg-secondary)', color: active ? t.color : 'var(--text-secondary)',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <Icon size={13} /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Message</label>
              <input
                value={banner.message}
                onChange={e => update({ message: e.target.value })}
                placeholder="e.g. Scheduled maintenance tonight, 8–10pm AEST"
                maxLength={140}
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Details <span style={{ textTransform: 'none', fontWeight: 400 }}>— optional, shown when a pilot clicks "Learn more"</span>
              </label>
              <textarea
                value={banner.details}
                onChange={e => update({ details: e.target.value })}
                placeholder="Any extra detail — what's affected, expected duration, what to do in the meantime, etc."
                rows={3}
                style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
            <button onClick={save} disabled={status === 'running'} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', opacity: status === 'running' ? 0.6 : 1 }}>
              {status === 'running' ? 'Saving…' : 'Save'}
            </button>
            <StatusBadge status={status} />
          </div>
        </>
      )}
    </ToolCard>
  );
}

function VaStatsCard() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const run = async () => {
    if (status === 'running') return;
    setConfirm(true);
  };

  const doRun = async () => {
    setStatus('running');
    setResult(null);
    try {
      const data = await devTools.recalcVaStats();
      setResult({ ok: true, msg: `Done — ${data.total_flights_processed?.toLocaleString()} flights processed, ${data.pilots_updated} pilots updated.` });
      setStatus('success');
      showToast('VA stats recalculated', 'success');
    } catch (err) {
      setResult({ ok: false, msg: err.message || 'Recalculation failed' });
      setStatus('error');
      showToast('Recalculation failed', 'error');
    }
  };

  return (
    <ToolCard icon={RefreshCw} title="Recalculate VA Stats" description="Rebuilds all pre-aggregated totals (hours, flights, distance, auto-approvals) and corrects every pilot's stats and rank from their flight records.">
      {result && (
        <div style={{ padding: '0.6rem 0.875rem', marginBottom: '1rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600, background: result.ok ? 'rgba(var(--brand-primary-rgb),0.07)' : 'rgba(198,40,40,0.07)', color: result.ok ? 'var(--avg-green)' : '#c62828', border: `1px solid ${result.ok ? 'rgba(var(--brand-primary-rgb),0.2)' : 'rgba(198,40,40,0.2)'}` }}>
          {result.msg}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={run} disabled={status === 'running'} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', opacity: status === 'running' ? 0.6 : 1 }}>
          {status === 'running' ? 'Recalculating…' : 'Run Recalculation'}
        </button>
        <StatusBadge status={status} />
      </div>
      {confirm && (
        <ConfirmModal
          title="Recalculate VA stats?"
          message="This will recalculate all VA stats and correct every pilot's hours and rank from their flight records."
          confirmLabel="Run Recalculation"
          onConfirm={doRun}
          onClose={() => setConfirm(false)}
        />
      )}
    </ToolCard>
  );
}

// Main

// Changelog Manager
const TAG_OPTIONS = [
  { value: 'new',      label: 'New',      color: '#2e7d32', bg: 'rgba(46,125,50,0.1)' },
  { value: 'improved', label: 'Improved', color: '#1565c0', bg: 'rgba(21,101,192,0.1)' },
  { value: 'fixed',    label: 'Fixed',    color: '#e65100', bg: 'rgba(230,81,0,0.1)'  },
  { value: 'removed',  label: 'Removed',  color: '#c62828', bg: 'rgba(198,40,40,0.1)' },
];

function TagBadge({ tag }) {
  const t = TAG_OPTIONS.find(o => o.value === tag) || TAG_OPTIONS[0];
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.15rem 0.45rem', borderRadius: '4px', background: t.bg, color: t.color, flexShrink: 0 }}>
      {t.label}
    </span>
  );
}

function ChangelogManager() {
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [expanded, setExpanded]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const emptyForm = { version: '', title: '', date: new Date().toISOString().split('T')[0], entries: [{ tag: 'new', text: '' }] };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const data = await changelogApi.list();
      const parsed = (data.changelog || []).map(r => ({
        ...r,
        entries: typeof r.entries === 'string' ? JSON.parse(r.entries || '[]') : r.entries || [],
      }));
      setEntries(parsed);
    } catch { showToast('Failed to load changelog', 'error'); }
    finally { setLoading(false); }
  };

  useState(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setEditing('new'); };
  const openEdit = (r) => { setForm({ version: r.version, title: r.title, date: r.date?.split('T')[0] || '', entries: r.entries }); setEditing(r); };
  const close = () => { setEditing(null); setForm(emptyForm); };

  const addItem   = () => setForm(f => ({ ...f, entries: [...f.entries, { tag: 'new', text: '' }] }));
  const removeItem = (i) => setForm(f => ({ ...f, entries: f.entries.filter((_, idx) => idx !== i) }));
  const updateItem = (i, field, val) => setForm(f => ({ ...f, entries: f.entries.map((e, idx) => idx === i ? { ...e, [field]: val } : e) }));

  const save = async () => {
    if (!form.version || !form.title || !form.date || !form.entries.some(e => e.text.trim())) {
      showToast('Fill in version, title, date and at least one entry', 'error'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, entries: form.entries.filter(e => e.text.trim()) };
      if (editing === 'new') await changelogApi.create(payload);
      else await changelogApi.update(editing.id, payload);
      showToast(editing === 'new' ? 'Release published' : 'Release updated', 'success');
      close(); load();
    } catch { showToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const remove = (id) => setConfirmDelete(id);

  const inputStyle = { width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.3rem' };

  return (
    <ToolCard icon={BookOpen} title="Changelog" description="Manage public release notes shown to pilots.">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
      ) : editing ? (
        /* Editor */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Version</label>
              <input style={inputStyle} placeholder="e.g. 2.4.1" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Title</label>
              <input style={inputStyle} placeholder="e.g. Winter Update" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" style={inputStyle} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <label style={labelStyle}>Entries</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {form.entries.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={entry.tag}
                  onChange={e => updateItem(i, 'tag', e.target.value)}
                  style={{ ...inputStyle, width: 110, flexShrink: 0 }}
                >
                  {TAG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                  placeholder="What changed…"
                  value={entry.text}
                  onChange={e => updateItem(i, 'text', e.target.value)}
                />
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.875rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              <Plus size={13} /> Add Entry
            </button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.875rem', marginLeft: 'auto' }}>
              {saving ? 'Saving…' : editing === 'new' ? 'Publish Release' : 'Save Changes'}
            </button>
            <button onClick={close} style={{ padding: '0.45rem 0.875rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* List */
        <div>
          <button onClick={openNew} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem', marginBottom: entries.length ? '1rem' : 0 }}>
            <Plus size={14} /> New Release
          </button>

          {entries.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>No releases yet.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {entries.map(r => (
              <div key={r.id} style={{ border: '1px solid var(--border-color)', borderRadius: '9px', overflow: 'hidden' }}>
                <div
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', cursor: 'pointer', background: 'var(--bg-secondary)' }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: 'var(--avg-green)', flexShrink: 0 }}>v{r.version}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', flex: 1 }}>{r.title}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{r.date?.split('T')[0] || ''}</span>
                  <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem' }}><Edit3 size={13} /></button>
                  <button onClick={e => { e.stopPropagation(); remove(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', padding: '0.2rem' }}><Trash2 size={13} /></button>
                  {expanded === r.id ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                </div>
                {expanded === r.id && (
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {r.entries.map((e, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem' }}>
                        <TagBadge tag={e.tag} />
                        <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{e.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Delete this release?"
          message="This will permanently remove the changelog entry."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try { await changelogApi.remove(confirmDelete); showToast('Deleted', 'success'); load(); }
            catch { showToast('Failed to delete', 'error'); }
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </ToolCard>
  );
}

function SiteSettings() {
  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Site settings</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(480px, 100%), 1fr))', gap: '1.25rem' }}>
        <SiteBannerConfig />
        <LeaderboardConfig />
        <AutoApproveConfig />
        <SyncRankRoles />
        <VaStatsCard />
        <ChangelogManager />
      </div>
    </div>
  );
}

export default SiteSettings;
