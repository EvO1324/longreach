/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTour } from './TourContext';
import { createPortal } from 'react-dom';
import { colors as BRAND } from '../brand';

const PAD   = 12;
const isMob = () => window.innerWidth <= 768;

export default function TourOverlay() {
  const { active, step, stepIdx, total, next, prev, finish } = useTour();
  const navigate = useNavigate();
  const location = useLocation();

  const overlayRef  = useRef(null);
  const holeRef     = useRef(null);
  const ringRef     = useRef(null);
  const ringGlowRef = useRef(null);
  const tooltipRef  = useRef(null);
  const rafRef      = useRef(null);
  const findRef     = useRef(null);
  const prevStepId  = useRef(null);

  // Current interpolated rect (kept in a plain object, not state)
  const cur = useRef({ top: 0, left: 0, width: 0, height: 0 });
  const tgt = useRef(null);

  // Update SVG hole + ring directly
  const applySVG = useCallback((r) => {
    const sTop    = Math.max(0, r.top    - PAD);
    const sLeft   = Math.max(0, r.left   - PAD);
    const sWidth  = Math.min(r.width  + PAD * 2, window.innerWidth  - sLeft);
    const sHeight = Math.min(r.height + PAD * 2, window.innerHeight - sTop);

    if (holeRef.current) {
      holeRef.current.setAttribute('x', sLeft);
      holeRef.current.setAttribute('y', sTop);
      holeRef.current.setAttribute('width', sWidth);
      holeRef.current.setAttribute('height', sHeight);
    }
    if (ringRef.current) {
      ringRef.current.setAttribute('x', sLeft);
      ringRef.current.setAttribute('y', sTop);
      ringRef.current.setAttribute('width', sWidth);
      ringRef.current.setAttribute('height', sHeight);
    }
    if (ringGlowRef.current) {
      ringGlowRef.current.setAttribute('x', sLeft - 3);
      ringGlowRef.current.setAttribute('y', sTop - 3);
      ringGlowRef.current.setAttribute('width', sWidth + 6);
      ringGlowRef.current.setAttribute('height', sHeight + 6);
    }

    positionTooltip(sTop, sLeft, sWidth, sHeight);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // RAF loop — lerp cur → tgt
  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const loop = () => {
      if (!tgt.current) return;
      const t = tgt.current;
      const c = cur.current;
      const ease = 0.15;
      c.top    += (t.top    - c.top)    * ease;
      c.left   += (t.left   - c.left)   * ease;
      c.width  += (t.width  - c.width)  * ease;
      c.height += (t.height - c.height) * ease;
      applySVG(c);
      const done =
        Math.abs(c.top - t.top) < 0.4 && Math.abs(c.left - t.left) < 0.4 &&
        Math.abs(c.width - t.width) < 0.4 && Math.abs(c.height - t.height) < 0.4;
      if (!done) rafRef.current = requestAnimationFrame(loop);
      else applySVG(t);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [applySVG]);

  // Position tooltip via direct style mutation
  const positionTooltip = (sTop, sLeft, sWidth, sHeight) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    const mobile = isMob();
    const TW = mobile ? window.innerWidth - 32 : 340;
    const TH = tip.offsetHeight || 200;

    tip.style.width = TW + 'px';

    let top, left;
    if (mobile) {
      top  = window.innerHeight - TH - 24;
      left = (window.innerWidth - TW) / 2;
    } else {
      const pos = step?.position || 'bottom';
      if (pos === 'bottom') {
        top  = sTop + sHeight + 16;
        left = sLeft + sWidth / 2 - TW / 2;
      } else if (pos === 'right') {
        top  = sTop + sHeight / 2 - TH / 2;
        left = sLeft + sWidth + 16;
      } else if (pos === 'left') {
        top  = sTop + sHeight / 2 - TH / 2;
        left = sLeft - TW - 16;
      } else {
        top  = sTop - TH - 16;
        left = sLeft + sWidth / 2 - TW / 2;
      }
      left = Math.max(16, Math.min(left, window.innerWidth  - TW - 16));
      top  = Math.max(16, Math.min(top,  window.innerHeight - TH - 16));
    }
    tip.style.top  = top  + 'px';
    tip.style.left = left + 'px';
  };

  // Find element, scroll to it, then start animating
  const findAndAnimate = useCallback((id, jumpTo = false) => {
    clearTimeout(findRef.current);
    let attempts = 0;
    const find = () => {
      const el = document.querySelector(`[data-tour="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          const r = el.getBoundingClientRect();
          const newRect = { top: r.top, left: r.left, width: r.width, height: r.height };
          if (jumpTo) { cur.current = { ...newRect }; applySVG(newRect); }
          tgt.current = newRect;
          startLoop();
          // Show overlay + slide in tooltip
          if (overlayRef.current) overlayRef.current.style.opacity = '1';
          const tip = tooltipRef.current;
          if (tip) {
            tip.style.transition = 'none';
            tip.style.opacity    = '0';
            tip.style.transform  = 'translateY(10px) scale(0.97)';
            requestAnimationFrame(() => {
              tip.style.transition = 'opacity 0.28s ease, transform 0.32s cubic-bezier(0.34,1.4,0.64,1)';
              tip.style.opacity    = '1';
              tip.style.transform  = 'translateY(0) scale(1)';
            });
          }
        }, 400);
      } else if (attempts++ < 30) {
        findRef.current = setTimeout(find, 100);
      }
    };
    find();
  }, [applySVG, startLoop]); // eslint-disable-line react-hooks/exhaustive-deps

  // On step change
  useEffect(() => {
    if (!active || !step) return;

    // Hide tooltip during transition
    if (tooltipRef.current) {
      tooltipRef.current.style.transition = 'opacity 0.15s ease';
      tooltipRef.current.style.opacity    = '0';
    }

    // Close sidebar when leaving sidebar step
    if (prevStepId.current === 'sidebar-nav' && step.id !== 'sidebar-nav') {
      window.dispatchEvent(new Event('tour:close-sidebar'));
    }
    prevStepId.current = step.id;

    const go = async () => {
      const needsNav = location.pathname !== step.route;
      if (needsNav) {
        navigate(step.route);
        await new Promise(r => setTimeout(r, 450));
      }
      if (step.id === 'sidebar-nav' && isMob()) {
        window.dispatchEvent(new Event('tour:open-sidebar'));
        await new Promise(r => setTimeout(r, 350));
      }
      findAndAnimate(step.id, needsNav);
    };

    go();
    return () => { clearTimeout(findRef.current); cancelAnimationFrame(rafRef.current); };
  }, [active, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock scroll
  useEffect(() => {
    if (!active) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      window.dispatchEvent(new Event('tour:close-sidebar'));
      cancelAnimationFrame(rafRef.current);
      clearTimeout(findRef.current);
    };
  }, [active]);

  // Resize: snap tgt to new rect
  useEffect(() => {
    if (!active || !step) return;
    const onResize = () => {
      const el = document.querySelector(`[data-tour="${step.id}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        tgt.current = { top: r.top, left: r.left, width: r.width, height: r.height };
        startLoop();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, step, startLoop]);

  if (!active) return null;

  // Render — static shell, all animation via refs
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'none' }}>
      <style>{`
        @keyframes tour-pulse { 0%,100%{opacity:.45} 50%{opacity:.95} }
        @keyframes tour-fade  { from{opacity:0} to{opacity:1} }
      `}</style>

      {/* Overlay */}
      <div ref={overlayRef} style={{ position: 'absolute', inset: 0, opacity: 0, transition: 'opacity 0.3s ease', pointerEvents: 'auto' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
          <defs>
            <mask id="tour-hole">
              <rect width="100%" height="100%" fill="white" />
              <rect ref={holeRef} x="0" y="0" width="0" height="0" rx="10" fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(6,14,10,0.78)" mask="url(#tour-hole)" />
          <rect ref={ringGlowRef} x="0" y="0" width="0" height="0" rx="13" fill="none" stroke={`rgba(${BRAND.primaryRgb}, 0.18)`} strokeWidth="8" />
          <rect ref={ringRef} x="0" y="0" width="0" height="0" rx="10" fill="none" stroke={BRAND.primary} strokeWidth="1.5"
            style={{ animation: 'tour-pulse 2.5s ease-in-out infinite' }} />
        </svg>
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, left: 0, width: 340,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
          pointerEvents: 'auto', overflow: 'hidden',
          opacity: 0,
        }}
      >
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--brand-primary), #4ade80)' }} />
        <div style={{ padding: '0.75rem 1rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} style={{
                height: 4, borderRadius: 2,
                width: i === stepIdx ? 20 : 6,
                background: i === stepIdx ? 'var(--brand-primary)' : i < stepIdx ? '#4ade80' : 'var(--border-color)',
                transition: 'width 0.35s cubic-bezier(0.34,1.4,0.64,1), background 0.2s',
              }} />
            ))}
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
              {stepIdx + 1} / {total}
            </span>
          </div>
          <button onClick={finish} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px', fontFamily: 'inherit' }}>×</button>
        </div>
        <div style={{ padding: '0.2rem 1rem 1rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.4rem', letterSpacing: '-0.2px' }}>{step.title}</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>{step.body}</div>
        </div>
        <div style={{ padding: '0.65rem 1rem 0.875rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={finish} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', padding: 0, fontFamily: 'inherit', opacity: 0.7 }}>
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {stepIdx > 0 && (
              <button onClick={prev} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Back
              </button>
            )}
            <button
              onClick={next}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={e => e.currentTarget.style.transform = ''}
              style={{
                padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none',
                background: stepIdx === total - 1 ? 'var(--brand-accent)' : 'var(--brand-primary)',
                color: stepIdx === total - 1 ? '#1a1200' : 'white',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: stepIdx === total - 1 ? '0 2px 14px rgba(var(--brand-accent-rgb),0.4)' : '0 2px 14px rgba(var(--brand-primary-rgb),0.35)',
                transition: 'transform 0.1s',
              }}
            >
              {stepIdx === total - 1 ? 'Done ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
