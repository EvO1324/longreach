/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

const { getAdminClient } = require('../config/pocketbase');
const brand = require('../config/brand');

let _config   = null;
let _configAt = 0;
const TTL     = 5 * 60 * 1000;

async function getEmailConfig() {
  if (_config && Date.now() - _configAt < TTL) return _config;
  try {
    const pb  = await getAdminClient();
    const rec = await pb.collection('settings').getFirstListItem('key = "email_config"', { requestKey: null });
    _config   = typeof rec.value === 'string' ? JSON.parse(rec.value) : rec.value;
    _configAt = Date.now();
    console.log('[email] config loaded — from_email:', _config?.from_email, '| key set:', !!_config?.resend_api_key);
    return _config;
  } catch (err) {
    console.error('[email] failed to load config:', err.message);
    return null;
  }
}

function invalidateEmailConfig() { _config = null; }

async function sendEmail({ to, subject, html, text }) {
  const config = await getEmailConfig();
  if (!config?.resend_api_key) throw new Error('Resend API key not configured');
  if (!config?.from_email)     throw new Error('From email not configured');

  console.log(`[email] sending to ${to} via ${config.from_email}`);

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${config.resend_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    `${config.from_name || brand.name} <${config.from_email}>`,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || subject,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[email] Resend error ${res.status}:`, JSON.stringify(body));
    throw new Error(body?.message || `Resend error ${res.status}`);
  }
  console.log(`[email] sent OK — id: ${body.id}`);
  return body;
}

module.exports = { sendEmail, getEmailConfig, invalidateEmailConfig };

async function sendTemplateEmail(templateKey, vars, to) {
  const config = await getEmailConfig();
  if (!config?.resend_api_key) return; // no-op if not configured

  const pb = await getAdminClient();

  // Load templates
  let templates = {};
  try {
    const rec = await pb.collection('settings').getFirstListItem('key = "email_templates"', { requestKey: null });
    templates = typeof rec.value === 'string' ? JSON.parse(rec.value) : rec.value;
  } catch {}

  // Load design
  let design = {
    logo_url: '', header_color: brand.colors.primaryDark, accent_color: brand.colors.primary,
    button_color: brand.colors.primary, footer_text: `${brand.name} · ${brand.crewCentreName}`,
    footer_color: '#888888', bg_color: '#f4f4f5', card_color: '#ffffff',
  };
  try {
    const rec = await pb.collection('settings').getFirstListItem('key = "email_design"', { requestKey: null });
    design = { ...design, ...(typeof rec.value === 'string' ? JSON.parse(rec.value) : rec.value) };
  } catch {}

  const tpl = templates[templateKey];
  if (!tpl?.subject || !tpl?.body) {
    console.warn(`[email] no template found for key: ${templateKey}`);
    return;
  }

  // Fill variables
  const fill = str => str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  const subject  = fill(tpl.subject);
  const bodyText = fill(tpl.body);

  // Convert plain text body to HTML paragraphs
  const bodyHtml = bodyText.split('\n\n')
    .map(p => `<p style="margin:0 0 1rem;line-height:1.6;color:#444;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${design.bg_color};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${design.bg_color};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:${design.header_color};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          ${design.logo_url
            ? `<img src="${design.logo_url}" alt="Logo" style="max-height:56px;max-width:220px;object-fit:contain;display:block;margin:0 auto;"/>`
            : `<div style="color:white;font-size:1.2rem;font-weight:700;">${design.footer_text.split('·')[0].trim()}</div>`
          }
        </td></tr>
        <tr><td style="background:${design.card_color};padding:36px 40px;">
          <h2 style="margin:0 0 1.25rem;color:#1a1a1a;font-size:1.15rem;font-weight:700;">${subject}</h2>
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:${design.card_color};border-radius:0 0 12px 12px;border-top:1px solid #eee;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:0.75rem;color:${design.footer_color};">${design.footer_text}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendEmail({ to, subject, html, text: bodyText });
}

module.exports = { sendEmail, sendTemplateEmail, getEmailConfig, invalidateEmailConfig };
