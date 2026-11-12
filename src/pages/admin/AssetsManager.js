/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect, useRef } from 'react';
import { settings, upload } from '../../api/client';
import { showToast } from '../../components/Toast';
import { Image as ImageIcon, Upload, X, Check } from 'lucide-react';

const SECTIONS = [
  {
    title: 'Crew Centre Branding',
    description: 'Logo, backgrounds and imagery used on the crew centre',
    icon: ImageIcon,
    items: [
      {
        key: 'logo_light',
        label: 'Logo — Light Mode',
        description: 'Shown in the navbar when light mode is active',
        image: true,
        previewBg: '#ffffff',
        aspect: 'logo',
      },
      {
        key: 'logo_dark',
        label: 'Logo — Dark Mode',
        description: 'Shown in the navbar when dark mode is active',
        image: true,
        previewBg: '#1a1a1a',
        aspect: 'logo',
      },
      {
        key: 'auth_background',
        label: 'Auth Background',
        description: 'Full-screen background on the login and signup pages',
        image: true,
        previewBg: '#000000',
        aspect: 'wide',
      },
      {
        key: 'hero_image',
        label: 'Dashboard Hero',
        description: 'Banner image at the top of the pilot dashboard',
        image: true,
        previewBg: '#000000',
        aspect: 'wide',
      },
      {
        key: 'hero_image_credit',
        label: 'Hero Image Credit',
        description: 'Photographer or source credit shown in the corner of the hero',
        placeholder: 'Photo by John Smith',
        image: false,
      },
    ],
  },
];

const ASSET_KEYS = SECTIONS.flatMap(s => s.items);

function AssetCard({ asset, currentValue, savedValue, isDirty, isUploading, isSaving,
                      onFileChosen, onClear, onTextChange, onTextSave }) {
  const fileInput = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isActive = !!savedValue;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileChosen(asset.key, file);
  };

  return (
    <div className="card" style={{
      marginBottom: 0, padding: 0, overflow: 'hidden',
      border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column',
    }}>
      {asset.image ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            position: 'relative',
            height: asset.aspect === 'wide' ? 150 : 100,
            background: asset.previewBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            outline: dragOver ? '2px dashed var(--avg-green)' : 'none',
            outlineOffset: -2,
          }}
        >
          <input
            type="file"
            accept="image/*"
            ref={fileInput}
            style={{ display: 'none' }}
            onChange={(e) => onFileChosen(asset.key, e.target.files[0])}
          />

          {currentValue && !imgError ? (
            <img
              src={currentValue}
              alt={asset.label}
              onError={() => setImgError(true)}
              style={{
                width: '100%', height: '100%',
                objectFit: asset.aspect === 'logo' ? 'contain' : 'cover',
                padding: asset.aspect === 'logo' ? '1.25rem' : 0,
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
              color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem',
            }}>
              <ImageIcon size={22} />
              {currentValue && imgError ? 'Could not load image' : 'No image set'}
            </div>
          )}

          <div className="asset-card-overlay" style={{
            position: 'absolute', inset: 0,
            background: 'rgba(10,14,12,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            opacity: 0, transition: 'opacity 0.15s ease',
          }}>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={isUploading}
              title={currentValue ? 'Replace image' : 'Upload image'}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'var(--avg-green)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '0.5rem 0.9rem', fontSize: '0.8rem', fontWeight: 600,
                cursor: isUploading ? 'default' : 'pointer', opacity: isUploading ? 0.7 : 1,
              }}
            >
              <Upload size={13} /> {isUploading ? 'Uploading…' : currentValue ? 'Replace' : 'Upload'}
            </button>
            {currentValue && (
              <button
                onClick={() => onClear(asset.key)}
                disabled={isUploading || isSaving}
                title="Remove image"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status pill */}
          <span style={{
            position: 'absolute', top: 10, right: 10,
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '3px 8px', borderRadius: 999,
            background: isActive ? 'rgba(var(--brand-primary-rgb),0.9)' : 'rgba(255,255,255,0.15)',
            color: '#fff', backdropFilter: 'blur(4px)',
          }}>
            {isActive && <Check size={10} />} {isActive ? 'Active' : 'Not set'}
          </span>
        </div>
      ) : null}

      <div style={{ padding: '1rem 1.1rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{asset.label}</h4>
          {!asset.image && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '2px 7px', borderRadius: 999, flexShrink: 0,
              background: isActive ? 'var(--avg-green-pale)' : 'var(--bg-hover)',
              color: isActive ? 'var(--avg-green)' : 'var(--text-secondary)',
            }}>
              {isActive && <Check size={9} />} {isActive ? 'Set' : 'Empty'}
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: asset.image ? 0 : '0.85rem' }}>
          {asset.description}
        </p>

        {!asset.image && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={currentValue}
              onChange={(e) => onTextChange(asset.key, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && isDirty) onTextSave(asset.key); }}
              placeholder={asset.placeholder}
              style={{ flex: 1, fontSize: '0.85rem' }}
            />
            <button
              onClick={() => onTextSave(asset.key)}
              disabled={isSaving || !isDirty}
              className="btn btn-primary"
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', flexShrink: 0, opacity: isSaving || !isDirty ? 0.6 : 1 }}
            >
              {isSaving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .card:hover .asset-card-overlay { opacity: 1; }
      `}</style>
    </div>
  );
}

function AssetsManager() {
  const [assets, setAssets] = useState({});
  const [editValues, setEditValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    loadAssets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await settings.list();
      const map = {};
      Object.entries(data.settings || {}).forEach(([k, v]) => { map[k] = { value: v }; });
      setAssets(map);

      const vals = {};
      ASSET_KEYS.forEach(a => { vals[a.key] = map[a.key]?.value || ''; });
      setEditValues(vals);
    } catch (error) {
      console.error('Error loading assets:', error);
      showToast('Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (key, value) => setEditValues(prev => ({ ...prev, [key]: value }));

  const handleTextSave = async (key) => {
    try {
      setSaving(key);
      await settings.save(key, editValues[key]);
      showToast('Asset saved!', 'success');
      await loadAssets();
    } catch (error) {
      console.error('Error saving asset:', error);
      showToast('Failed to save asset', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleFileChosen = (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'error');
      return;
    }
    setUploading(key);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
        const { url } = await upload.brandAsset(key, safeName, base64);
        await settings.save(key, url);
        showToast('Asset uploaded!', 'success');
        await loadAssets();
      } catch (error) {
        console.error('Error uploading asset:', error);
        showToast('Failed to upload asset', 'error');
      } finally {
        setUploading(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = async (key) => {
    try {
      setSaving(key);
      await settings.save(key, '');
      setEditValues(prev => ({ ...prev, [key]: '' }));
      showToast('Asset cleared', 'success');
      await loadAssets();
    } catch (error) {
      showToast('Failed to clear asset', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading assets…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 640 }}>
          Logos and images used across the crew centre.
        </p>
      </div>

      {SECTIONS.map(section => {
        const SectionIcon = section.icon;
        return (
          <div key={section.title} style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, background: 'var(--avg-green-pale)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <SectionIcon size={15} color="var(--avg-green)" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{section.title}</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1.1rem', marginLeft: '2.4rem' }}>
              {section.description}
            </p>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem',
            }}>
              {section.items.map(asset => {
                const currentValue = editValues[asset.key] || '';
                const savedValue = assets[asset.key]?.value || '';
                return (
                  <AssetCard
                    key={asset.key}
                    asset={asset}
                    currentValue={currentValue}
                    savedValue={savedValue}
                    isDirty={currentValue !== savedValue}
                    isUploading={uploading === asset.key}
                    isSaving={saving === asset.key}
                    onFileChosen={handleFileChosen}
                    onClear={handleClear}
                    onTextChange={handleTextChange}
                    onTextSave={handleTextSave}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AssetsManager;
