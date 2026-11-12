/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { news as newsApi, upload } from '../../api/client';
import { showToast } from '../../components/Toast';

const inputStyle = { width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { display: 'block', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' };

// Post modal (create / edit)

function PostModal({ post, onSave, onClose }) {
  const [title,     setTitle]     = useState(post?.title     || '');
  const [body,      setBody]      = useState(post?.body      || '');
  const [imageUrl,  setImageUrl]  = useState(post?.image_url || '');
  const [active,    setActive]    = useState(post?.active !== false);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        const ext    = file.name.split('.').pop();
        const fname  = `news_${Date.now()}.${ext}`;
        try {
          const d = await upload.fleetImage(fname, base64, 'news');
          setImageUrl(d.url);
          showToast('Image uploaded', 'success');
        } catch { showToast('Upload failed', 'error'); }
        finally { setUploading(false); }
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); }
  };

  const handleSave = async () => {
    if (!title.trim()) return showToast('Title required', 'error');
    if (!body.trim())  return showToast('Body required', 'error');
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body: body.trim(), image_url: imageUrl.trim(), active });
      onClose();
    } catch { showToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '2rem', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 700 }}>{post ? 'Edit post' : 'New post'}</h3>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. System update this weekend" style={inputStyle} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Post content…" rows={6}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Image (optional)</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Paste URL or upload below" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--avg-green)', fontWeight: 600 }}>
              {uploading ? 'Uploading…' : 'Upload image'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} disabled={uploading} />
            </label>
            {imageUrl && (
              <img src={imageUrl} alt="" style={{ height: 40, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--border-color)' }} onError={e => e.target.style.display = 'none'} />
            )}
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <input type="checkbox" id="news-active" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="news-active" style={{ fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer' }}>Active (visible to pilots)</label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.65rem 1.25rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || uploading} style={{ padding: '0.65rem 1.4rem', background: 'var(--avg-green)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', opacity: saving || uploading ? 0.7 : 1 }}>
            {saving ? 'Saving…' : post ? 'Save changes' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main

export default function NewsManager() {
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | 'new' | post object

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await newsApi.listAll();
      setPosts(d.news || []);
    } catch { showToast('Failed to load news', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    if (modal === 'new') {
      await newsApi.create(data);
      showToast('Post created', 'success');
    } else {
      await newsApi.update(modal.id, data);
      showToast('Post updated', 'success');
    }
    load();
  };

  const handleToggle = async (post) => {
    try {
      await newsApi.update(post.id, { active: !post.active });
      showToast(post.active ? 'Post hidden' : 'Post activated', 'success');
      load();
    } catch { showToast('Failed to update', 'error'); }
  };

  const handleDelete = async (post) => {
    if (!window.confirm(`Delete "${post.title}"?`)) return;
    try {
      await newsApi.remove(post.id);
      showToast('Deleted', 'success');
      load();
    } catch { showToast('Failed to delete', 'error'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>News</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Posts appear as a modal on the dashboard for pilots</p>
        </div>
        <button onClick={() => setModal('new')} style={{ padding: '0.6rem 1.25rem', background: 'var(--avg-green)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', fontFamily: 'inherit' }}>
          + New post
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '2rem 0' }}>Loading…</div>
      ) : posts.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', padding: '2rem 0' }}>No posts yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {posts.map(post => (
            <div key={post.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1.1rem 1.25rem', boxShadow: '0 1px 3px var(--shadow)', opacity: post.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                {post.image_url && (
                  <img src={post.image_url} alt="" style={{ width: 72, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid var(--border-color)' }} onError={e => e.target.style.display = 'none'} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{post.title}</span>
                    {!post.active && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>HIDDEN</span>}
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.body}</p>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {post.posted_by} · {new Date(post.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <button onClick={() => handleToggle(post)} style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                    {post.active ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={() => setModal(post)} style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(post)} style={{ padding: '0.4rem 0.75rem', border: '1px solid rgba(198,40,40,0.3)', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#c62828', fontFamily: 'inherit' }}>
                    Delete
  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <PostModal
          post={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
