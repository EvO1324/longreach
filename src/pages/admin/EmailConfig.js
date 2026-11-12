/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useRef } from 'react';
import { auth as authApi, settings as settingsApi } from '../../api/client';
import { showToast } from '../../components/Toast';

import brand, { callsign } from '../../brand';
// Constants

const TEMPLATE_LABELS = {
  application_received: 'Application Received',
  application_approved: 'Application Approved',
  application_rejected: 'Application Rejected',
  pirep_approved:       'PIREP Approved',
  pirep_rejected:       'PIREP Rejected',
};

const DEFAULT_TEMPLATES = {
  application_received: {
    subject: `Application Received — ${brand.name}`,
    body: `Hi {{first_name}},\n\nThank you for applying to ${brand.name}!\n\nYour application has been received and is under review. We'll be in touch soon.\n\nBest regards,\nAustralia Virtual Group`,
  },
  application_approved: {
    subject: `Welcome to ${brand.name}!`,
    body: `Hi {{first_name}},\n\nCongratulations — your application has been approved!\n\nYou can now log in to the crew centre and start flying.\n\nCallsign: {{callsign}}\n\nBest regards,\nAustralia Virtual Group`,
  },
  application_rejected: {
    subject: `Application Update — ${brand.name}`,
    body: `Hi {{first_name}},\n\nThank you for your interest in ${brand.name}.\n\nUnfortunately we're unable to approve your application at this time. You're welcome to reapply in the future.\n\nBest regards,\nAustralia Virtual Group`,
  },
  pirep_approved: {
    subject: 'PIREP Approved — {{flight_number}}',
    body: `Hi {{first_name}},\n\nYour PIREP for {{flight_number}} ({{departure_icao}} → {{arrival_icao}}) has been approved and added to your logbook.\n\nBest regards,\nAustralia Virtual Group`,
  },
  pirep_rejected: {
    subject: 'PIREP Update — {{flight_number}}',
    body: `Hi {{first_name}},\n\nYour PIREP for {{flight_number}} has been rejected.\n\n{{reject_reason}}\n\nIf you have questions, please contact a staff member.\n\nBest regards,\nAustralia Virtual Group`,
  },
};

const DEFAULT_DESIGN = {
  logo_url:        '',
  header_color:    brand.colors.primaryDark,
  accent_color:    'var(--brand-primary)',
  button_color:    'var(--brand-primary)',
  footer_text:     `${brand.name} · ${brand.crewCentreName}`,
  footer_color:    '#888888',
  bg_color:        '#f4f4f5',
  card_color:      '#ffffff',
};

const SAMPLE_VARS = {
  first_name: 'Sam', last_name: 'Pilot', callsign: callsign.format(callsign.min),
  email: 'alex@example.com', flight_number: 'QF101',
  departure_icao: 'YSSY', arrival_icao: 'YMML',
  flight_time: '1.25', aircraft: 'Boeing 737-800',
  reject_reason: 'Insufficient flight time logged.',
};

// Email HTML builder

function buildEmailHtml(body, design, subject = '') {
  const filled = body.replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE_VARS[k] || `{{${k}}}`);
  const paragraphs = filled.split('\n\n').map(p =>
    `<p style="margin:0 0 1rem;line-height:1.6;color:#333;">${p.replace(/\n/g, '<br/>')}</p>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${design.bg_color};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${design.bg_color};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:${design.header_color};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          ${design.logo_url
            ? `<img src="${design.logo_url}" alt="Logo" style="max-height:56px;max-width:220px;object-fit:contain;display:block;margin:0 auto;"/>`
            : `<div style="color:white;font-size:1.3rem;font-weight:700;letter-spacing:-0.5px;">${design.footer_text.split('·')[0].trim()}</div>`
          }
        </td></tr>
        <!-- Body -->
        <tr><td style="background:${design.card_color};padding:36px 40px;">
          ${subject ? `<h2 style="margin:0 0 1.25rem;color:#1a1a1a;font-size:1.2rem;font-weight:700;">${subject}</h2>` : ''}
          ${paragraphs}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:${design.card_color};border-radius:0 0 12px 12px;border-top:1px solid #eee;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:0.78rem;color:${design.footer_color};">${design.footer_text}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Styles

const field = {
  width: '100%', padding: '0.7rem 0.875rem',
  border: '1px solid var(--border-color)', borderRadius: '7px',
  fontSize: '0.875rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  boxSizing: 'border-box', outline: 'none',
};
const lbl = {
  display: 'block', marginBottom: '0.4rem',
  fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

// Colour picker row

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 38, height: 38, padding: 2, border: '1px solid var(--border-color)', borderRadius: 7, cursor: 'pointer', background: 'none' }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ ...field, width: 100, fontFamily: 'monospace', fontSize: '0.8rem' }} />
      </div>
    </div>
  );
}

// Main component

function EmailConfig() {
  const [loading, setLoading]       = useState(true);
  const [savingCfg, setSavingCfg]   = useState(false);
  const [savingTpl, setSavingTpl]   = useState(false);
  const [savingDsn, setSavingDsn]   = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testTo, setTestTo]         = useState('');
  const [activeTab, setActiveTab]   = useState('config');
  const [activeTpl, setActiveTpl]   = useState('application_received');
  const [previewSubj, setPreviewSubj] = useState(true);
  const iframeRef                   = useRef(null);

  const [config, setConfig]     = useState({ resend_api_key: '', from_email: '', from_name: brand.name, emails_enabled: false });
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [design, setDesign]     = useState(DEFAULT_DESIGN);

  useEffect(() => { load(); }, []);

  // Update iframe preview whenever template or design changes
  useEffect(() => {
    if (activeTab !== 'templates' || !iframeRef.current) return;
    const tpl = templates[activeTpl];
    const html = buildEmailHtml(tpl.body, design, previewSubj ? tpl.subject : '');
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (doc) { doc.open(); doc.write(html); doc.close(); }
  }, [activeTab, activeTpl, templates, design, previewSubj]);

  const load = async () => {
    try {
      setLoading(true);
      const { settings } = await settingsApi.list();
      if (settings?.email_config)    setConfig(JSON.parse(settings.email_config));
      if (settings?.email_templates) setTemplates({ ...DEFAULT_TEMPLATES, ...JSON.parse(settings.email_templates) });
      if (settings?.email_design)    setDesign({ ...DEFAULT_DESIGN, ...JSON.parse(settings.email_design) });
      // Pre-fill logo from existing brand assets
      if (!settings?.email_design && settings?.logo_light) {
        setDesign(d => ({ ...d, logo_url: settings.logo_light }));
      }
    } catch { showToast('Failed to load email settings', 'error'); }
    finally  { setLoading(false); }
  };

  const saveConfig = async () => {
    try { setSavingCfg(true); await settingsApi.save('email_config', JSON.stringify(config)); showToast('Config saved!', 'success'); }
    catch { showToast('Failed to save config', 'error'); } finally { setSavingCfg(false); }
  };

  const saveTemplates = async () => {
    try { setSavingTpl(true); await settingsApi.save('email_templates', JSON.stringify(templates)); showToast('Templates saved!', 'success'); }
    catch { showToast('Failed to save templates', 'error'); } finally { setSavingTpl(false); }
  };

  const saveDesign = async () => {
    try { setSavingDsn(true); await settingsApi.save('email_design', JSON.stringify(design)); showToast('Design saved!', 'success'); }
    catch { showToast('Failed to save design', 'error'); } finally { setSavingDsn(false); }
  };

  const sendTest = async () => {
    if (!testTo) { showToast('Enter a recipient email', 'error'); return; }
    try { setTesting(true); await authApi.testEmail(testTo); showToast(`Test email sent to ${testTo}!`, 'success'); }
    catch (err) { showToast(err.message || 'Failed to send test email', 'error'); }
    finally { setTesting(false); }
  };

  const setD = (key, val) => setDesign(d => ({ ...d, [key]: val }));
  const tpl  = templates[activeTpl];

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading…</div>;

  const tabs = ['config', 'design', 'templates'];

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.35rem' }}>Email Configuration</h3>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Powered by{' '}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--avg-green)', fontWeight: 600 }}>Resend</a>
          {' '}— free up to 3,000 emails/month.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '0.5rem 1.1rem', borderRadius: '8px', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize',
            border: `1.5px solid ${activeTab === t ? 'var(--avg-green)' : 'var(--border-color)'}`,
            background: activeTab === t ? 'var(--avg-green)' : 'none',
            color: activeTab === t ? 'white' : 'var(--text-primary)', transition: 'all 0.15s',
          }}>{t === 'config' ? 'Settings' : t === 'design' ? 'Design' : 'Templates'}</button>
        ))}
      </div>

      {/* Settings tab */}
      {activeTab === 'config' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Resend Settings</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Resend API Key</label>
                <input type="password" value={config.resend_api_key}
                  onChange={e => setConfig({ ...config, resend_api_key: e.target.value })}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={field} />
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--avg-green)' }}>resend.com/api-keys →</a>
                </p>
              </div>
              <div>
                <label style={lbl}>From Email</label>
                <input type="email" value={config.from_email}
                  onChange={e => setConfig({ ...config, from_email: e.target.value })}
                  placeholder="noreply@australiavg.com" style={field} />
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Must be from a verified domain</p>
              </div>
              <div>
                <label style={lbl}>From Name</label>
                <input type="text" value={config.from_name}
                  onChange={e => setConfig({ ...config, from_name: e.target.value })}
                  placeholder={brand.name} style={field} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', marginBottom: '1.5rem', userSelect: 'none' }}>
              <input type="checkbox" checked={config.emails_enabled}
                onChange={e => setConfig({ ...config, emails_enabled: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--avg-green)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Enable automated emails</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>When off, no emails will be sent including password resets</div>
              </div>
            </label>

            {!config.emails_enabled && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(230,81,0,0.06)', border: '1px solid rgba(230,81,0,0.2)', borderRadius: '8px', fontSize: '0.83rem', color: '#e65100', marginBottom: '1.25rem' }}>
                ⚠️ Emails are currently disabled — pilots won't receive password reset links.
              </div>
            )}
            <button onClick={saveConfig} disabled={savingCfg} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
              {savingCfg ? 'Saving…' : 'Save Settings'}
            </button>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Send Test Email</h4>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Verify your configuration is working.</p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Recipient</label>
                <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="your@email.com" style={field} />
              </div>
              <button onClick={sendTest} disabled={testing || !config.resend_api_key} className="btn btn-secondary" style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {testing ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Design tab */}
      {activeTab === 'design' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Controls */}
          <div className="card">
            <h4 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Email Design</h4>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={lbl}>Logo URL</label>
              <input type="text" value={design.logo_url} onChange={e => setD('logo_url', e.target.value)}
                placeholder="https://... (leave blank to use org name)" style={field} />
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Paste a direct image URL. Use your logo_light asset URL from Assets Manager.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <ColorField label="Header Colour"  value={design.header_color}  onChange={v => setD('header_color', v)} />
              <ColorField label="Accent Colour"  value={design.accent_color}  onChange={v => setD('accent_color', v)} />
              <ColorField label="Button Colour"  value={design.button_color}  onChange={v => setD('button_color', v)} />
              <ColorField label="Footer Colour"  value={design.footer_color}  onChange={v => setD('footer_color', v)} />
              <ColorField label="Background"     value={design.bg_color}      onChange={v => setD('bg_color', v)} />
              <ColorField label="Card Background" value={design.card_color}   onChange={v => setD('card_color', v)} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={lbl}>Footer Text</label>
              <input type="text" value={design.footer_text} onChange={e => setD('footer_text', e.target.value)}
                placeholder={`${brand.name} · ${brand.crewCentreName}`} style={field} />
            </div>

            <button onClick={saveDesign} disabled={savingDsn} className="btn btn-primary" style={{ width: '100%', fontSize: '0.875rem' }}>
              {savingDsn ? 'Saving…' : 'Save Design'}
            </button>
          </div>

          {/* Live preview */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Live Preview</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Using sample data</span>
            </div>
            <iframe
              ref={iframeRef}
              style={{ width: '100%', height: 480, border: 'none', display: 'block' }}
              title="Email preview"
              srcDoc={buildEmailHtml(templates[activeTpl].body, design, templates[activeTpl].subject)}
            />
          </div>
        </div>
      )}

      {/* Templates tab */}
      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Template list */}
          <div className="card" style={{ padding: '0.5rem' }}>
            {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTpl(key)} style={{
                width: '100%', textAlign: 'left', padding: '0.65rem 0.875rem', borderRadius: '7px',
                background: activeTpl === key ? 'rgba(var(--brand-primary-rgb),0.08)' : 'none',
                border: `1px solid ${activeTpl === key ? 'var(--avg-green)' : 'transparent'}`,
                color: activeTpl === key ? 'var(--avg-green)' : 'var(--text-primary)',
                fontWeight: activeTpl === key ? 700 : 400, fontSize: '0.85rem',
                cursor: 'pointer', transition: 'all 0.12s', marginBottom: '0.2rem',
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Editor + preview split */}
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '1.25rem' }}>
            {/* Editor */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: 0 }}>{TEMPLATE_LABELS[activeTpl]}</h4>
                <button
                  onClick={() => setTemplates(t => ({ ...t, [activeTpl]: DEFAULT_TEMPLATES[activeTpl] }))}
                  style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Reset to default
                </button>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={lbl}>Subject</label>
                <input type="text" value={tpl.subject}
                  onChange={e => setTemplates(t => ({ ...t, [activeTpl]: { ...tpl, subject: e.target.value } }))}
                  style={field} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={lbl}>Body</label>
                <textarea value={tpl.body}
                  onChange={e => setTemplates(t => ({ ...t, [activeTpl]: { ...tpl, body: e.target.value } }))}
                  rows={10} style={{ ...field, fontFamily: 'monospace', fontSize: '0.83rem', resize: 'vertical', lineHeight: 1.6 }} />
              </div>

              <div style={{ padding: '0.65rem 0.875rem', background: 'var(--bg-hover)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Variables: </strong>
                {['{{first_name}}','{{last_name}}','{{callsign}}','{{email}}','{{flight_number}}','{{departure_icao}}','{{arrival_icao}}','{{flight_time}}','{{aircraft}}','{{reject_reason}}'].map(v => (
                  <code key={v} style={{ background: 'var(--bg-card)', padding: '0.05rem 0.35rem', borderRadius: '4px', marginRight: '0.3rem', fontFamily: 'monospace' }}>{v}</code>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={saveTemplates} disabled={savingTpl} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                  {savingTpl ? 'Saving…' : 'Save Templates'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-secondary)', userSelect: 'none' }}>
                  <input type="checkbox" checked={previewSubj} onChange={e => setPreviewSubj(e.target.checked)}
                    style={{ accentColor: 'var(--avg-green)' }} />
                  Show subject in preview
                </label>
              </div>
            </div>

            {/* Live preview */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Live Preview</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sample data — {Object.keys(SAMPLE_VARS).map(k => `{{${k}}}`).join(', ')}</span>
              </div>
              <iframe ref={iframeRef} style={{ width: '100%', height: 420, border: 'none', display: 'block' }} title="Email preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailConfig;
