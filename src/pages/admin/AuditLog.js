/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { auditLogs as auditApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import Loader from '../../components/Loader';
import { inputStyle } from '../../components/FormField';
import {
  Search, ScrollText, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  UserCheck, FileText, ClipboardList, Plane, Map, Trophy, Layers, Bell,
  Newspaper, Building2, Sliders, Star, SlidersHorizontal, Activity,
  Briefcase, History, RadioTower,
} from 'lucide-react';

// Action metadata
const ACTION_META = {
  // PIREPs
  'pirep.approved':             { label: 'PIREP Approved',          color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'pirep.rejected':             { label: 'PIREP Rejected',          color: '#c62828', bg: '#fdecea' },
  'pirep.edited':               { label: 'PIREP Edited',            color: '#1976d2', bg: '#e3f2fd' },
  'pirep.auto_approved':        { label: 'PIREP Auto-Approved',     color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'pirep.bulk_deleted':         { label: 'PIREPs Bulk Deleted',     color: '#c62828', bg: '#fdecea' },
  'pirep.history_imported':     { label: 'History Imported',        color: 'var(--brand-accent)', bg: 'var(--brand-accent-pale)' },
  'pirep.auto_approved_retry':  { label: 'PIREP Retry Approved',    color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'pirep.retry_no_match':       { label: 'PIREP Retry — No Match',  color: '#546e7a', bg: '#eceff1' },
  'pirep.approved_rejected':    { label: 'PIREP Approval Reversed', color: '#c62828', bg: '#fdecea' },
  'pirep.rejected_approved':    { label: 'PIREP Rejection Reversed', color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'atc.filed':                  { label: 'ATC Session Filed',       color: '#1976d2', bg: '#e3f2fd' },
  // Pilots
  'pilot.approved':             { label: 'Pilot Approved',          color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'pilot.rejected':             { label: 'Pilot Rejected',          color: '#c62828', bg: '#fdecea' },
  'pilot.updated':              { label: 'Pilot Updated',           color: '#1976d2', bg: '#e3f2fd' },
  'pilot.role_changed':         { label: 'Role Changed',            color: '#7b1fa2', bg: '#f3e5f5' },
  'pilot.password_reset':       { label: 'Password Reset',          color: '#e65100', bg: '#fff3e0' },
  'pilot.email_viewed':         { label: 'Email Viewed',            color: '#1976d2', bg: '#e3f2fd' },
  'pilot.email_changed':        { label: 'Email Changed',           color: '#e65100', bg: '#fff3e0' },
  'pilot.archived':             { label: 'Pilot Archived',          color: '#c62828', bg: '#fdecea' },
  'pilot.unarchived':           { label: 'Pilot Unarchived',        color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'pilot.deleted':              { label: 'Pilot Deleted',           color: '#c62828', bg: '#fdecea' },
  'pilot.discord_invite_generated': { label: 'Discord Invite Generated', color: '#5865F2', bg: '#eef0fe' },
  // Recruitment
  'exam.assigned':              { label: 'Exam Assigned',           color: '#1976d2', bg: '#e3f2fd' },
  'exam.reset':                 { label: 'Exam Reset',              color: '#e65100', bg: '#fff3e0' },
  'exam.submitted':             { label: 'Exam Submitted',          color: 'var(--brand-accent)', bg: 'var(--brand-accent-pale)' },
  'recruitment.stage_changed':  { label: 'Stage Changed',           color: '#546e7a', bg: '#eceff1' },
  'watchlist.added':            { label: 'Watchlist Entry Added',   color: '#e65100', bg: '#fff3e0' },
  'watchlist.updated':          { label: 'Watchlist Entry Updated', color: '#1976d2', bg: '#e3f2fd' },
  'watchlist.removed':          { label: 'Watchlist Entry Removed', color: '#c62828', bg: '#fdecea' },
  // Fleet
  'fleet.added':                { label: 'Aircraft Added',          color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'fleet.updated':              { label: 'Aircraft Updated',        color: '#1976d2', bg: '#e3f2fd' },
  'fleet.removed':              { label: 'Aircraft Removed',        color: '#c62828', bg: '#fdecea' },
  // Routes
  'route.created':              { label: 'Route Created',           color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'route.updated':              { label: 'Route Updated',           color: '#1976d2', bg: '#e3f2fd' },
  'route.deleted':              { label: 'Route Deleted',           color: '#c62828', bg: '#fdecea' },
  // Ranks
  'rank.created':               { label: 'Rank Created',            color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'rank.updated':               { label: 'Rank Updated',            color: '#1976d2', bg: '#e3f2fd' },
  'rank.deleted':               { label: 'Rank Deleted',            color: '#c62828', bg: '#fdecea' },
  // Roles
  'role.created':               { label: 'Staff Role Created',      color: '#7b1fa2', bg: '#f3e5f5' },
  'role.updated':               { label: 'Staff Role Updated',      color: '#7b1fa2', bg: '#f3e5f5' },
  'role.deleted':               { label: 'Staff Role Deleted',      color: '#c62828', bg: '#fdecea' },
  'role.assigned':              { label: 'Staff Role Assigned',     color: '#7b1fa2', bg: '#f3e5f5' },
  // NOTAMs
  'notam.created':              { label: 'NOTAM Created',           color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'notam.updated':              { label: 'NOTAM Updated',           color: '#1976d2', bg: '#e3f2fd' },
  'notam.deleted':              { label: 'NOTAM Deleted',           color: '#c62828', bg: '#fdecea' },
  // News
  'news.created':                { label: 'News Posted',            color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'news.updated':                { label: 'News Updated',           color: '#1976d2', bg: '#e3f2fd' },
  'news.deleted':                { label: 'News Deleted',           color: '#c62828', bg: '#fdecea' },
  // Airlines
  'airline.created':             { label: 'Airline Added',          color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'airline.updated':             { label: 'Airline Updated',        color: '#1976d2', bg: '#e3f2fd' },
  'airline.deleted':             { label: 'Airline Deleted',        color: '#c62828', bg: '#fdecea' },
  // Multipliers
  'multiplier.created':         { label: 'Multiplier Created',      color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'multiplier.updated':         { label: 'Multiplier Updated',      color: '#1976d2', bg: '#e3f2fd' },
  'multiplier.deleted':         { label: 'Multiplier Deleted',      color: '#c62828', bg: '#fdecea' },
  // ROTW
  'rotw.published':             { label: 'ROTW Published',          color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  // Settings
  'settings.updated':           { label: 'Settings Updated',        color: '#546e7a', bg: '#eceff1' },
  // Activity
  'activity_check.run':         { label: 'Activity Check Run',      color: '#546e7a', bg: '#eceff1' },
  'activity_check.dry_run':     { label: 'Activity Dry Run',        color: 'var(--brand-accent)', bg: 'var(--brand-accent-pale)' },
  // Staff positions & applications
  'staff_position.created':     { label: 'Staff Position Created',  color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'staff_position.updated':     { label: 'Staff Position Updated',  color: '#1976d2', bg: '#e3f2fd' },
  'staff_position.deleted':     { label: 'Staff Position Deleted',  color: '#c62828', bg: '#fdecea' },
  'staff_app.updated':          { label: 'Staff Application Updated', color: '#1976d2', bg: '#e3f2fd' },
  'staff_app.deleted':          { label: 'Staff Application Deleted', color: '#c62828', bg: '#fdecea' },
  'staff_app.auto_expired':     { label: 'Application Auto-Expired',  color: '#c62828', bg: '#fdecea' },
  // Career mode
  'career.enrolled':            { label: 'Career Mode Enrolled',    color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'career.changed':             { label: 'Career Aircraft/Hub Changed', color: '#1976d2', bg: '#e3f2fd' },
  'career.left':                { label: 'Left Career Mode',        color: '#c62828', bg: '#fdecea' },
  'career.admin_reset':         { label: 'Career Reset (Admin)',    color: '#e65100', bg: '#fff3e0' },
  'career.admin_override':      { label: 'Career Overridden (Admin)', color: '#e65100', bg: '#fff3e0' },
  // Challenges
  'challenge.created':          { label: 'Challenge Created',       color: 'var(--brand-primary)', bg: 'var(--brand-primary-pale)' },
  'challenge.updated':          { label: 'Challenge Updated',       color: '#1976d2', bg: '#e3f2fd' },
  'challenge.deleted':          { label: 'Challenge Deleted',       color: '#c62828', bg: '#fdecea' },
  'challenge.reset':            { label: 'Challenge Reset',         color: '#e65100', bg: '#fff3e0' },
};

function getActionMeta(action) {
  return ACTION_META[action] || { label: action, color: '#546e7a', bg: '#eceff1' };
}

// Icon per resource (the bit before the first dot in the action string)
const RESOURCE_ICONS = {
  pirep: FileText, atc: RadioTower,
  pilot: UserCheck,
  exam: ClipboardList, recruitment: ClipboardList,
  fleet: Plane, airline: Building2,
  route: Map,
  rank: Trophy, challenge: Trophy,
  role: Layers,
  notam: Bell,
  news: Newspaper,
  multiplier: Sliders, settings: SlidersHorizontal,
  rotw: Star,
  activity_check: Activity,
  staff_position: ClipboardList, staff_app: ClipboardList,
  career: Briefcase,
};

function getActionIcon(action) {
  const resource = action.split('.')[0];
  return RESOURCE_ICONS[resource] || History;
}

function ActionBadge({ action }) {
  const meta = getActionMeta(action);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.25rem 0.65rem', borderRadius: '999px',
      fontSize: '0.75rem', fontWeight: 700,
      color: meta.color, background: meta.bg,
      whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
}

// "first_name" -> "First name", "staff_role" -> "Staff role"
function formatFieldName(k) {
  const s = k.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatValue(v) {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.length ? `${parsed.length} item${parsed.length === 1 ? '' : 's'}` : '(empty)';
      if (parsed && typeof parsed === 'object') return `{${Object.keys(parsed).length} field${Object.keys(parsed).length === 1 ? '' : 's'}}`;
    } catch { /* not actually JSON, fall through to plain string handling */ }
  }
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

// Is `details.changes` shaped like { field: { from, to } }? (the diffFields() output)
function isDiffShape(changes) {
  if (!changes || typeof changes !== 'object') return false;
  return Object.values(changes).every(v => v && typeof v === 'object' && ('from' in v) && ('to' in v));
}

const pillStyle = {
  fontSize: '0.74rem', padding: '0.25rem 0.6rem', borderRadius: '6px',
  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
  color: 'var(--text-secondary)', lineHeight: 1.4,
};

function DetailsPill({ details }) {
  if (!details || Object.keys(details).length === 0) return null;

  const { changes, ...rest } = details;

  const changeEntries = (changes && isDiffShape(changes))
    ? Object.entries(changes)
    : [];

  const restEntries = Object.entries(rest).filter(([, v]) => v !== '' && v !== null && v !== undefined);

  if (changes && !isDiffShape(changes)) {
    let v = changes;
    if (Array.isArray(v)) v = v.join(', ');
    if (typeof v === 'object') v = JSON.stringify(v);
    restEntries.unshift(['changes', v]);
  }

  if (!changeEntries.length && !restEntries.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.55rem' }}>
      {changeEntries.map(([field, { from, to }]) => (
        <span key={field} style={{ ...pillStyle, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatFieldName(field)}</strong>
          <span style={{ opacity: 0.75 }}>{formatValue(from)}</span>
          <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>→</span>
          <span style={{ color: 'var(--avg-green)', fontWeight: 700 }}>{formatValue(to)}</span>
        </span>
      ))}
      {restEntries.map(([k, v]) => {
        if (Array.isArray(v)) v = v.join(', ');
        if (typeof v === 'object') v = JSON.stringify(v);
        return (
          <span key={k} style={pillStyle}>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatFieldName(k)}:</strong> {String(v)}
          </span>
        );
      })}
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "Today" / "Yesterday" / "12 March 2026" section header for a timestamp
function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOf = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

const PAGE_SIZE = 50;

function AuditLog() {
  const [logs, setLogs]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [clearing, setClearing]   = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Filters
  const [search, setSearch]       = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [availableActions, setAvailableActions] = useState([]);
  const [showSystem, setShowSystem] = useState(false); // hide automated/noise actions by default

  const loadLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: PAGE_SIZE };
      if (search)       params.search = search;
      if (actionFilter) params.action = actionFilter;
      if (!showSystem)  params.hide_system = 'true';
      const data = await auditApi.list(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(pg);
    } catch (err) {
      showToast(err.message || 'Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, showSystem]);

  // Load available action types for filter dropdown
  useEffect(() => {
    auditApi.actions()
      .then(d => setAvailableActions(d.actions || []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadLogs(1); }, [loadLogs]);

  const handleClear = async () => {
    setClearing(true);
    try {
      const data = await auditApi.clear();
      showToast(`Cleared ${data.deleted} log entries`, 'success');
      setConfirmClear(false);
      loadLogs(1);
    } catch (err) {
      showToast(err.message || 'Failed to clear logs', 'error');
    } finally {
      setClearing(false);
    }
  };

  // inputStyle now comes from components/FormField.js.

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  // Group the current page of logs into date sections, preserving server sort order
  const groups = [];
  for (const log of logs) {
    const label = dayLabel(log.created);
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push(log);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: 'var(--avg-green-pale, rgba(var(--brand-primary-rgb),0.12))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ScrollText size={20} color="var(--avg-green)" strokeWidth={2} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>Audit Log</h2>
            <p style={{ margin: '0.15rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              {total.toLocaleString()} action{total !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>
        <button
          onClick={() => setConfirmClear(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1.1rem', background: 'transparent', border: '1.5px solid #c62828',
            borderRadius: '8px', color: '#c62828', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem',
          }}
        >
          <Trash2 size={14} strokeWidth={2.5} />
          Clear All Logs
        </button>
      </div>

      {/* Filter toolbar */}
      <div style={{
        marginBottom: '1.25rem', padding: '0.9rem 1rem', borderRadius: '10px',
        border: '1px solid var(--border-color)', background: 'var(--bg-card)',
        display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', opacity: 0.7 }} />
          <input
            type="text"
            placeholder="Search actor, target, action..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadLogs(1)}
            style={{ ...inputStyle, width: '100%', paddingLeft: '2.1rem', boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{ ...inputStyle, minWidth: 190 }}
        >
          <option value="">All actions</option>
          {availableActions.map(a => (
            <option key={a} value={a}>{getActionMeta(a).label}</option>
          ))}
        </select>
        <button
          onClick={() => loadLogs(1)}
          style={{ padding: '0.6rem 1.2rem', background: 'var(--avg-green)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
        >
          Search
        </button>
        {(search || actionFilter) && (
          <button
            onClick={() => { setSearch(''); setActionFilter(''); }}
            style={{ padding: '0.6rem 0.9rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem' }}
          >
            Clear
          </button>
        )}
        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem',
          color: showSystem ? 'var(--avg-green)' : 'var(--text-secondary)', fontWeight: showSystem ? 700 : 500,
          cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto',
          padding: '0.4rem 0.7rem', borderRadius: '999px',
          background: showSystem ? 'var(--avg-green-pale, rgba(var(--brand-primary-rgb),0.1))' : 'transparent',
          border: `1px solid ${showSystem ? 'var(--avg-green)' : 'var(--border-color)'}`,
          transition: 'all 0.15s',
        }}>
          <input
            type="checkbox"
            checked={showSystem}
            onChange={e => setShowSystem(e.target.checked)}
            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--avg-green)' }}
          />
          System activity
        </label>
      </div>

      {/* Log list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader size={80} />
        </div>
      ) : logs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)',
          border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'var(--bg-card)',
        }}>
          <ScrollText size={32} style={{ opacity: 0.35, marginBottom: '0.75rem' }} />
          <div style={{ fontSize: '0.9rem' }}>No audit log entries found.</div>
        </div>
      ) : (
        <>
          {groups.map(group => (
            <div key={group.label} style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--text-secondary)', opacity: 0.7, padding: '0 0.25rem 0.5rem',
              }}>
                {group.label}
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                {group.items.map((log, idx) => {
                  const meta = getActionMeta(log.action);
                  const Icon = getActionIcon(log.action);
                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: '0.8rem 1.1rem', display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
                        borderBottom: idx < group.items.length - 1 ? '1px solid var(--border-color)' : 'none',
                        borderLeft: `3px solid ${meta.color}`,
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginTop: 1,
                        background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={15} color={meta.color} strokeWidth={2.25} />
                      </div>

                      {/* Body */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                          <ActionBadge action={log.action} />
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{log.actor_name || 'System'}</strong>
                            {log.target_name && (
                              <>
                                <span style={{ opacity: 0.5 }}>·</span>
                                <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{log.target_name}</strong>
                              </>
                            )}
                          </span>
                        </div>
                        <DetailsPill details={log.details} />
                      </div>

                      {/* Timestamp */}
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }} title={new Date(log.created).toLocaleString('en-AU')}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{timeAgo(log.created)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.6, marginTop: 1 }}>
                          {new Date(log.created).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()}
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => loadLogs(page - 1)} disabled={page <= 1}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.5rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    opacity: page <= 1 ? 0.4 : 1, color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600,
                  }}
                ><ChevronLeft size={14} /> Prev</button>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => loadLogs(page + 1)} disabled={page >= totalPages}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.5rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages ? 0.4 : 1, color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600,
                  }}
                >Next <ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirm clear modal */}
      {confirmClear && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={17} color="#c62828" strokeWidth={2.25} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Clear All Logs?</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
              This will permanently delete all <strong>{total.toLocaleString()}</strong> audit log entries. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmClear(false)} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleClear} disabled={clearing} style={{ padding: '0.6rem 1.25rem', background: '#c62828', border: 'none', borderRadius: '8px', cursor: clearing ? 'not-allowed' : 'pointer', color: 'white', fontWeight: 700, opacity: clearing ? 0.6 : 1 }}>
                {clearing ? 'Clearing...' : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLog;
