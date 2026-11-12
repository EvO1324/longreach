/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useEffect, useState } from 'react';
import { Info, AlertTriangle, Wrench, X, ChevronDown, ChevronUp } from 'lucide-react';
import { loadSettings } from '../services/settingsService';

const TYPE_CONFIG = {
  info:        { Icon: Info,          color: 'var(--avg-green)',     bg: 'rgba(var(--brand-primary-rgb),0.08)' },
  warning:     { Icon: AlertTriangle, color: 'var(--avg-gold-dark)', bg: 'rgba(var(--brand-accent-rgb),0.12)' },
  maintenance: { Icon: Wrench,        color: '#c62828',              bg: 'rgba(198,40,40,0.08)' },
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function SiteBanner() {
  const [banner, setBanner]     = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then(s => {
      if (cancelled || !s.site_banner) return;
      try {
        const parsed = JSON.parse(s.site_banner);
        if (parsed && parsed.enabled && parsed.message) {
          const key = `avg_banner_dismissed_${hashStr(parsed.message + (parsed.details || ''))}`;
          if (sessionStorage.getItem(key) === '1') setDismissed(true);
          setBanner(parsed);
        }
      } catch { /* ignore malformed setting */ }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!banner || dismissed) return null;

  const cfg = TYPE_CONFIG[banner.type] || TYPE_CONFIG.info;
  const { Icon } = cfg;
  const dismissKey = `avg_banner_dismissed_${hashStr(banner.message + (banner.details || ''))}`;

  return (
    <div style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.color}`, marginBottom: '1.25rem', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.75rem 1rem' }}>
        <Icon size={16} color={cfg.color} style={{ flexShrink: 0, marginTop: 2 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: cfg.color }}>{banner.message}</span>
            {banner.details && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', padding: 0, fontFamily: 'inherit' }}
              >
                {expanded ? 'Show less' : 'Learn more'}
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
          {expanded && banner.details && (
            <div style={{ fontSize: '0.8rem', color: cfg.color, opacity: 0.9, marginTop: '0.5rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {banner.details}
            </div>
          )}
        </div>

        <button
          onClick={() => { sessionStorage.setItem(dismissKey, '1'); setDismissed(true); }}
          aria-label="Dismiss banner"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, opacity: 0.6, padding: 2, flexShrink: 0, display: 'flex' }}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

export default SiteBanner;
