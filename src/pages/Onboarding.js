/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState, useEffect } from 'react';
import { auth as authApi, ranks as ranksApi } from '../api/client';
import {
  Plane, ScrollText, Map, ClipboardList,
  Award, MessageCircle, ChevronRight, ChevronLeft,
} from 'lucide-react';

import brand from '../brand';
const SLIDES = [
  {
    icon: Plane,
    tag: 'Welcome',
    title: `Welcome to ${brand.abbreviation}`,
    subtitle: 'Before you dive in, let\'s get you up to speed.',
    sections: [
      {
        heading: `What is ${brand.abbreviation}?`,
        body: `${brand.name} is a virtual airline on Infinite Flight. ${brand.description && brand.description !== brand.name ? brand.description + ' ' : ''}We track your hours and build a community of pilots who care about realistic operations.`,
      },
      {
        heading: 'What to expect',
        body: 'You\'ll fly routes from our catalogue, file PIREPs to log your flights, and earn hours that progress your rank. This guide covers everything you need to know to get started.',
        highlight: true,
      },
    ],
  },
  {
    icon: ScrollText,
    tag: 'Rules',
    title: 'Rules & Standards',
    subtitle: 'Read these carefully — they apply to everyone.',
    sections: [
      {
        heading: 'General conduct',
        list: [
          { label: 'Be respectful',     desc: 'Treat all members with respect. Harassment, discrimination, or targeted abuse will result in an immediate ban.' },
          { label: 'No spam',           desc: 'Do not spam messages, images, or commands in any channel.' },
          { label: 'English only',      desc: 'Please use English in all public channels so staff can moderate effectively.' },
          { label: 'No self-promotion', desc: 'Do not advertise other VAs, Discord servers, or external services without staff permission.' },
        ],
      },
      {
        heading: 'Flight standards',
        list: [
          { label: 'Expert Server',      desc: 'Strongly encouraged. Training and Casual are accepted but must meet quality standards.' },
          { label: 'Realistic ops',      desc: 'No touch-and-goes, instant spawns, or unrealistic flight paths.' },
          { label: 'Correct aircraft',   desc: 'Staff cross-reference your IF logbook. PIREPs with mismatched aircraft will be rejected.' },
          { label: 'No falsified PIREPs',desc: 'Filing fraudulent PIREPs results in an immediate ban and removal of all hours.' },
        ],
      },
      {
        heading: 'One account only',
        body: 'Each pilot may have one crew centre account. Keep your IFC username and IF User ID up to date in your Profile — incorrect details delay auto-approval.',
        highlight: true,
      },
    ],
  },
  {
    icon: Map,
    tag: 'Routes',
    title: 'Finding a Route',
    subtitle: 'Two ways to find something to fly.',
    sections: [
      {
        heading: 'Routes of the Week',
        body: 'The best place to start. Routes are organised by day — today is highlighted automatically. ROTW routes often carry bonus hour multipliers.',
        highlight: true,
      },
      {
        heading: 'Full route catalogue',
        body: 'Search outside the weekly schedule by flight number, ICAO, duration, or aircraft. Hit File PIREP directly from the results to pre-fill the form.',
      },
      {
        heading: 'What each route shows',
        list: [
          { label: 'Flight number',     desc: `The ${brand.abbreviation} flight number to use when filing.` },
          { label: 'Departure/Arrival', desc: 'ICAO codes — you must use exactly these airports in IF.' },
          { label: 'Aircraft',          desc: 'Approved types for this route. You must fly one of these.' },
          { label: 'Multiplier',        desc: 'ROTW only. A ×1.5 tag boosts your credited hours by that factor.' },
        ],
      },
    ],
  },
  {
    icon: ClipboardList,
    tag: 'PIREPs',
    title: 'Filing a PIREP',
    subtitle: 'How to log your flights and earn hours.',
    sections: [
      {
        heading: 'File from Routes of the Week',
        body: 'Hit File PIREP on any route and the form pre-fills with flight number, airports, aircraft, and any active multiplier. Just add your actual flight time.',
        highlight: true,
      },
      {
        heading: 'Form fields',
        list: [
          { label: 'Flight Number', desc: 'Required. Auto-filled from route selection.' },
          { label: 'Aircraft',      desc: 'Required. Only approved fleet liveries are listed.' },
          { label: 'Flight Time',   desc: 'Required. Actual block time in hours and minutes.' },
          { label: 'Notes',         desc: 'Optional. Not needed for standard flights.' },
        ],
      },
      {
        heading: 'Auto-approval',
        body: 'Link your Infinite Flight account in Profile and the system checks your IF logbook on submission. Matching flight = instant approval. No match = review queue, staff aim to turnaround within 48 hours.',
        highlight: true,
      },
    ],
  },
  {
    icon: Award,
    tag: 'Ranks',
    title: 'Ranks & Progression',
    subtitle: 'How you progress as a pilot.',
    sections: [
      {
        heading: 'How ranks work',
        body: 'Your rank is calculated automatically from total approved flight hours. Every approved PIREP triggers a rank check — if you\'ve crossed a threshold, your rank and Discord role update automatically.',
      },
      {
        heading: 'Rank tiers',
        // filled in from the VA's own ranks (Admin › Ranks) when the slide shows
        ranksList: true,
      },
    ],
  },
  {
    icon: MessageCircle,
    tag: 'Discord',
    title: 'Discord & Community',
    subtitle: `Staying connected with ${brand.abbreviation}.`,
    sections: [
      {
        heading: 'Link your Discord',
        body: 'Run /verify in the server with your IFC username to activate rank roles and keep everything in sync.',
        highlight: true,
      },
      {
        heading: 'Useful bot commands',
        list: [
          { label: '/verify',      desc: 'Link your Discord account and activate rank roles.' },
          { label: '/stats',       desc: 'View your own stats or check another pilot.' },
          { label: '/leaderboard', desc: 'Top pilots by total flight hours.' },
          { label: '/rotw',        desc: "This week's featured routes by day." },
        ],
      },
      {
        heading: 'Stay active',
        body: 'Pilots with no PIREP in 30 days get an automated warning via Discord. File a PIREP any time to stay active.',
      },
    ],
  },
];

function SlideSection({ section }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--avg-green)', flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {section.heading}
        </h3>
      </div>

      {section.body && (
        <p style={{
          margin: 0, fontSize: '0.875rem', lineHeight: 1.65,
          color: section.highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
          ...(section.highlight ? {
            background: 'rgba(var(--brand-primary-rgb),0.06)',
            border: '1px solid rgba(var(--brand-primary-rgb),0.14)',
            borderLeft: '3px solid var(--avg-green)',
            borderRadius: '0 8px 8px 0',
            padding: '0.65rem 0.9rem',
          } : { paddingLeft: '0.5rem' }),
        }}>
          {section.body}
        </p>
      )}

      {section.list && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {section.list.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: '0.75rem', alignItems: 'baseline',
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '7px', fontSize: '0.85rem',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0, minWidth: '120px', fontSize: '0.82rem' }}>
                {item.label}
              </span>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Onboarding({ user, onComplete }) {
  const [step, setStep]             = useState(0);
  const [completing, setCompleting] = useState(false);
  const [rankList, setRankList]     = useState([]);

  useEffect(() => {
    ranksApi.list().then(r => {
      const items = (Array.isArray(r) ? r : r?.items || [])
        .slice().sort((a, b) => (a.hours_required || 0) - (b.hours_required || 0))
        .map(rk => ({ label: rk.name, desc: `${Number(rk.hours_required || 0).toLocaleString()} hrs` }));
      setRankList(items);
    }).catch(() => {});
  }, []);

  const slide  = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const Icon   = slide.icon;

  async function handleComplete() {
    setCompleting(true);
    try { await authApi.completeOnboarding(); } catch {}
    onComplete();
  }

  function next() { if (isLast) handleComplete(); else setStep(s => s + 1); }
  function prev() { setStep(s => s - 1); }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem 1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '600px' }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '0.875rem', padding: '0 0.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--avg-green)' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Getting Started
            </span>
          </div>

          {/* Step pills */}
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            {SLIDES.map((s, i) => (
              <button
                key={i}
                onClick={() => i < step && setStep(i)}
                title={s.tag}
                style={{
                  height: 5, width: i === step ? 24 : 5,
                  borderRadius: 3, border: 'none', padding: 0,
                  cursor: i < step ? 'pointer' : 'default',
                  background: i === step ? 'var(--avg-green)' : i < step ? 'var(--avg-green-light)' : 'var(--border-color)',
                  transition: 'width 0.2s ease, background 0.2s ease',
                }}
              />
            ))}
          </div>

          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {step + 1} / {SLIDES.length}
          </span>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          boxShadow: '0 8px 32px var(--shadow-hover)',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '1.25rem 1.5rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '10px', flexShrink: 0,
              background: 'var(--avg-green-pale)',
              border: '1px solid rgba(var(--brand-primary-rgb),0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={20} color="var(--avg-green)" strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'inline-block',
                background: 'rgba(var(--brand-primary-rgb),0.08)', border: '1px solid rgba(var(--brand-primary-rgb),0.16)',
                color: 'var(--avg-green)', fontSize: '0.65rem', fontWeight: 800,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '0.15rem 0.55rem', borderRadius: '20px', marginBottom: '0.35rem',
              }}>
                {slide.tag}
              </div>
              <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {slide.title}
              </h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.845rem', lineHeight: 1.45 }}>
                {slide.subtitle}
              </p>
            </div>
          </div>

          {/* Body */}
          <div style={{
            padding: '1.1rem 1.5rem',
            maxHeight: '45vh',
            overflowY: 'auto',
          }}>
            {slide.sections.map((section, i) => (
              <SlideSection key={i} section={section.ranksList ? { ...section, list: rankList.length ? rankList : null, body: rankList.length ? null : 'Your staff will set up the ranks; you can see them on your dashboard.' } : section} />
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: '0.875rem 1.25rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.75rem',
            background: 'var(--bg-secondary)',
          }}>
            <button
              onClick={prev}
              disabled={step === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.55rem 1rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: step === 0 ? 'var(--border-color)' : 'var(--text-secondary)',
                fontWeight: 600, fontSize: '0.845rem',
                cursor: step === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <ChevronLeft size={15} />
              Back
            </button>

            {isLast && (
              <p style={{ margin: 0, flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                By continuing you agree to the {brand.abbreviation} rules
              </p>
            )}

            <button
              onClick={next}
              disabled={completing}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.55rem 1.25rem',
                background: isLast ? 'var(--avg-gold)' : 'var(--avg-green)',
                border: 'none', borderRadius: '8px',
                color: isLast ? '#1a1200' : '#fff',
                fontWeight: 700, fontSize: '0.845rem',
                cursor: completing ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: completing ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {completing ? 'Loading…' : isLast ? 'Enter the Crew Centre' : 'Next'}
              {!completing && <ChevronRight size={15} />}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
