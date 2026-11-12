/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useMemo, useEffect } from 'react';
import { Plane, Search, Award, BookOpen, CheckSquare, Users, Bot, ClipboardList, Lock, Menu, X, Map, ShieldCheck, Star, Briefcase, CalendarClock, TicketCheck, RefreshCw, Plus, Trash2, Satellite } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { docs as docsApi } from '../api/client';

import brand from '../brand';
const GREEN = 'var(--brand-primary)';
const GOLD  = 'var(--brand-accent)';

const ICONS = {
  Plane, Search, Award, BookOpen, CheckSquare, Users, Bot, ClipboardList,
  Map, ShieldCheck, Star, Briefcase, CalendarClock, TicketCheck, RefreshCw, Satellite,
};

// Components

function DocSection({ section }) {
  return (
    <div className="docs-section">
      <div className="docs-section-heading">
        <span className="docs-section-bar" />
        <h3>{section.heading}</h3>
      </div>

      {section.body && (
        <p className={`docs-section-body${section.highlight ? ' highlight' : ''}`}>
          {section.body}
        </p>
      )}

      {section.list && (
        <div className="docs-list">
          {section.list.map((item, i) => (
            <div key={i} className="docs-list-item">
              <span className="docs-list-label">{item.label}</span>
              <span className="docs-list-desc">{item.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableSection({ section, onChange, onDelete }) {
  const update = (field, value) => onChange({ ...section, [field]: value });

  const updateListItem = (i, field, value) => {
    const list = [...(section.list || [])];
    list[i] = { ...list[i], [field]: value };
    update('list', list);
  };
  const addListItem    = () => update('list', [...(section.list || []), { label: '', desc: '' }]);
  const removeListItem = (i) => update('list', section.list.filter((_, idx) => idx !== i));

  return (
    <div style={{ border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <input
          value={section.heading || ''}
          onChange={e => update('heading', e.target.value)}
          placeholder="Section heading"
          style={{ flex: 1, fontWeight: 700, padding: '0.45rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}
        />
        <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!section.highlight} onChange={e => update('highlight', e.target.checked)} />
          Highlight
        </label>
        <button
          onClick={onDelete}
          title="Delete section"
          style={{ border: 'none', background: 'none', color: '#c62828', cursor: 'pointer', display: 'flex', padding: '0.3rem' }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {section.list ? (
        <div>
          {section.list.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                value={item.label || ''}
                onChange={e => updateListItem(i, 'label', e.target.value)}
                placeholder="Label"
                style={{ flex: '0 0 180px', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              />
              <input
                value={item.desc || ''}
                onChange={e => updateListItem(i, 'desc', e.target.value)}
                placeholder="Description"
                style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              />
              <button onClick={() => removeListItem(i)} style={{ border: 'none', background: 'none', color: '#c62828', cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addListItem}
            style={{ fontSize: '0.8rem', color: GREEN, background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem 0', fontWeight: 600 }}
          >
            + Add item
          </button>
        </div>
      ) : (
        <textarea
          value={section.body || ''}
          onChange={e => update('body', e.target.value)}
          rows={4}
          placeholder="Body text"
          style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }}
        />
      )}
    </div>
  );
}

function NavItem({ doc, active, onClick }) {
  const Icon = ICONS[doc.iconName];
  return (
    <button className={`docs-nav-item${active ? ' active' : ''}`} onClick={onClick}>
      {Icon && <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />}
      <span style={{ flex: 1 }}>{doc.label}</span>
      {active && <span className="docs-nav-dot" />}
    </button>
  );
}

function Docs({ user }) {
  const { hasStaffAccess, isAdmin } = usePermissions(user);
  const [search, setSearch]       = useState('');
  const [sidebarOpen, setSidebar] = useState(false);

  const [docsList, setDocsList] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [activeId, setActiveId] = useState(null);

  // Inline admin editing
  const [editing, setEditing]           = useState(false);
  const [draftSections, setDraftSections] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

  useEffect(() => {
    docsApi.list()
      .then(data => setDocsList(data.docs || []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const visibleDocs = useMemo(() => docsList.filter(d => !d.adminOnly || hasStaffAccess), [docsList, hasStaffAccess]);

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return visibleDocs;
    const q = search.toLowerCase();
    return visibleDocs.filter(d =>
      d.label.toLowerCase().includes(q) ||
      (d.title || '').toLowerCase().includes(q) ||
      d.sections.some(s =>
        s.heading.toLowerCase().includes(q) ||
        (s.body && s.body.toLowerCase().includes(q)) ||
        (s.list && s.list.some(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)))
      )
    );
  }, [search, visibleDocs]);

  const activeDoc  = visibleDocs.find(d => d.id === activeId) || visibleDocs[0];
  const publicDocs = filteredDocs.filter(d => !d.adminOnly);
  const adminDocs  = filteredDocs.filter(d => d.adminOnly);
  const ActiveIcon = activeDoc ? ICONS[activeDoc.iconName] : null;

  const selectDoc = (id) => {
    setActiveId(id);
    setSidebar(false);
    setEditing(false);
    setDraftSections(null);
  };

  const startEditing = () => {
    if (!activeDoc) return;
    setDraftSections(activeDoc.sections.map(s => ({ ...s, list: s.list ? s.list.map(i => ({ ...i })) : undefined })));
    setSaveError('');
    setEditing(true);
  };
  const cancelEditing = () => { setEditing(false); setDraftSections(null); setSaveError(''); };

  const updateSection = (index, newSection) => setDraftSections(prev => prev.map((s, i) => i === index ? newSection : s));
  const deleteSection = (index) => setDraftSections(prev => prev.filter((_, i) => i !== index));
  const addSection    = () => setDraftSections(prev => [...prev, { heading: 'New section', body: '' }]);

  const saveEdits = async () => {
    if (!activeDoc) return;
    setSaving(true);
    setSaveError('');
    try {
      const { doc } = await docsApi.update(activeDoc.id, { sections: draftSections });
      setDocsList(prev => prev.map(d => d.id === doc.id ? doc : d));
      setEditing(false);
      setDraftSections(null);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Documentation</h2>
        <p>Guides, rules and staff references for {brand.shortName}.</p>
      </div>

      <button className="docs-mobile-toggle" onClick={() => setSidebar(o => !o)}>
        {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
        {sidebarOpen ? 'Close menu' : `Browse — ${activeDoc?.label || 'Select a topic'}`}
      </button>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading documentation…</div>
      ) : loadError ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#c62828' }}>Failed to load documentation. Try refreshing.</div>
      ) : (
        <div className="docs-layout">
          <aside className={`docs-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
            <div className="docs-sidebar-inner">
              <div className="docs-sidebar-header">
                <p className="docs-sidebar-title">Documentation</p>
              </div>
              <div className="docs-search-wrap">
                <input
                  className="docs-search"
                  type="text"
                  placeholder="Search docs…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <nav className="docs-nav">
                {publicDocs.length === 0 && adminDocs.length === 0 && (
                  <p className="docs-nav-empty">No results</p>
                )}
                {publicDocs.map(doc => (
                  <NavItem key={doc.id} doc={doc} active={activeId === doc.id || (!activeId && activeDoc?.id === doc.id)} onClick={() => selectDoc(doc.id)} />
                ))}
                {adminDocs.length > 0 && (
                  <>
                    <div className="docs-nav-section-label">
                      <Lock size={10} color={GOLD} />
                      Staff
                    </div>
                    {adminDocs.map(doc => (
                      <NavItem key={doc.id} doc={doc} active={activeId === doc.id || (!activeId && activeDoc?.id === doc.id)} onClick={() => selectDoc(doc.id)} />
                    ))}
                  </>
                )}
              </nav>
            </div>
          </aside>

          <main className="docs-main">
            {activeDoc ? (
              <>
                <div className="docs-main-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div className="docs-icon-wrap">
                      {ActiveIcon && <ActiveIcon size={20} color={GREEN} strokeWidth={1.75} />}
                    </div>
                    <div>
                      <h2 className="docs-main-title">{activeDoc.title}</h2>
                      {activeDoc.adminOnly && (
                        <span className="docs-staff-badge">
                          <Lock size={9} />
                          Staff only
                        </span>
                      )}
                    </div>
                  </div>

                  {isAdmin && !editing && (
                    <button
                      onClick={startEditing}
                      style={{ fontSize: '0.82rem', fontWeight: 600, color: GREEN, background: 'var(--avg-green-pale)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.85rem', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editing ? (
                  <div className="docs-body">
                    {saveError && (
                      <div style={{ background: '#fdecea', color: '#a33', border: '1px solid #f6cfc9', borderRadius: '8px', padding: '0.7rem 0.9rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        {saveError}
                      </div>
                    )}
                    {draftSections.map((section, i) => (
                      <EditableSection
                        key={i}
                        section={section}
                        onChange={ns => updateSection(i, ns)}
                        onDelete={() => deleteSection(i)}
                      />
                    ))}
                    <button
                      onClick={addSection}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: GREEN, background: 'none', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', width: '100%', justifyContent: 'center', marginBottom: '1.25rem' }}
                    >
                      <Plus size={15} /> Add section
                    </button>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button
                        onClick={saveEdits}
                        disabled={saving}
                        style={{ padding: '0.6rem 1.4rem', background: GREEN, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={saving}
                        style={{ padding: '0.6rem 1.4rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="docs-body">
                    {activeDoc.sections.map((section, i) => (
                      <DocSection key={i} section={section} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Select a topic from the sidebar.
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

export default Docs;
