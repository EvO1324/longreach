/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { updates as updatesApi } from '../../api/client';
import { showToast } from '../../components/Toast';
import ConfirmModal from '../../components/ConfirmModal';

const box = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1.1rem 1.25rem', marginBottom: '1rem' };
const muted = { color: 'var(--text-secondary)', fontSize: '0.88rem' };

function RunStatus({ run }) {
  if (!run) return null;
  const running = run.status !== 'completed';
  const ok = run.conclusion === 'success';
  const text = running ? 'Updating now. This takes a few minutes; you can leave this page.'
    : ok ? 'The last update finished. The site may take a minute or two more to rebuild.'
    : `The last update didn't finish (${run.conclusion}). Nothing was deployed.`;
  return (
    <div style={{ ...box, borderColor: running ? 'var(--border-color)' : ok ? 'rgba(46,125,79,.4)' : 'rgba(198,40,40,.4)' }}>
      <span style={{ fontSize: '0.9rem' }}>{text}</span>{' '}
      <a href={run.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: 'var(--brand-primary)' }}>Details on GitHub</a>
    </div>
  );
}

export default function UpdatesManager() {
  const [data, setData] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => updatesApi.status().then(setData).catch(err => setData({ error: err.message, available: [] })), []);
  useEffect(() => { load(); }, [load]);

  // follow an update while it runs
  const running = data?.run && data.run.status !== 'completed';
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => updatesApi.run().then(r => setData(d => ({ ...d, run: r.run }))).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [running]);

  const start = async version => {
    setStarting(true);
    try {
      await updatesApi.apply(version);
      showToast(`Updating to ${version}`, 'success');
      setTimeout(load, 4000);
    } catch (err) {
      showToast(err.message || 'Couldn\'t start the update', 'error');
    } finally {
      setStarting(false); setConfirm(null);
    }
  };

  if (!data) return <p style={muted}>Checking for updates…</p>;
  const latest = data.available?.[0];

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.3rem' }}>Updates</h2>
      <p style={{ ...muted, margin: '0 0 1.25rem' }}>
        This crew centre is on <strong style={{ color: 'var(--text-primary)' }}>v{String(data.current).replace(/^v/, '')}</strong>.
        {latest ? ` ${data.available.length === 1 ? 'A newer version is' : `${data.available.length} newer versions are`} available.` : data.error ? '' : ' It\'s up to date.'}
      </p>

      {data.error && <div style={{ ...box, ...muted }}>Couldn't check for updates: {data.error}</div>}
      <RunStatus run={data.run} />

      {latest && (
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <strong>{latest.name}</strong>
            {data.canApply
              ? <button className="btn btn-primary" disabled={starting || running} onClick={() => setConfirm(latest.version)}>Update to {latest.version}</button>
              : <a href={latest.url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-primary)', fontSize: '0.88rem' }}>View on GitHub</a>}
          </div>
          {data.available.map(r => (
            <div key={r.version} style={{ borderTop: '1px solid var(--border-color)', padding: '0.75rem 0 0.25rem' }}>
              <div style={{ ...muted, marginBottom: '0.35rem' }}>{r.version}{r.date ? ` · ${new Date(r.date).toLocaleDateString()}` : ''}</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6 }}>{r.notes || 'No notes.'}</div>
            </div>
          ))}
          {!data.canApply && (
            <p style={{ ...muted, margin: '0.75rem 0 0' }}>
              To update from here, add a GitHub token and your crew centre's repository in <code>npm run setup</code> (Services › GitHub). DEPLOYING.md has the details.
            </p>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={`Update to ${confirm}?`}
          message="Your crew centre's code is updated and redeployed. Pilots can keep using it while that happens; it takes a few minutes."
          confirmLabel="Update"
          onConfirm={() => start(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
