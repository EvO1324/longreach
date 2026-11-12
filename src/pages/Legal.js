/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, ArrowLeft } from 'lucide-react';
import brand from '../brand';

const logo = brand.logos.light;
const N = brand.name;                 // the VA
const A = brand.abbreviation;
const AGE = Number(brand.legal?.minimumAge) || 13;
const OPERATOR = brand.legal?.operator || brand.name;
const CONTACT = brand.legal?.contact
  ? `${A} staff (${brand.legal.contact})`
  : `${A} staff via a Discord ticket`;

const GREEN = 'var(--brand-primary)';

export const LAST_UPDATED = '4 July 2026';

// Content

export const LEGAL_DOCS = [
  {
    id: 'terms',
    label: 'Terms of Service',
    Icon: FileText,
    content: {
      title: 'Terms of Service',
      intro: `These Terms of Service ("Terms") govern your access to and use of the ${N} ${brand.crewCentreName} (the "Platform"), the crew centre for ${N}\u2019s pilots on Infinite Flight. The Platform is operated by ${OPERATOR} ("${A}", "we", "us", "our") for its members. By creating an account or otherwise using the Platform, you agree to be bound by these Terms.`,
      sections: [
        {
          heading: 'Eligibility',
          body: `You must be at least ${AGE} years old to create an account. If you are under 18, you confirm that you have your parent or guardian's permission to use the Platform. We may ask you to confirm your age and may refuse or terminate a registration where we reasonably believe these requirements haven't been met.`,
          highlight: true,
        },
        {
          heading: 'What the Platform is (and isn\u2019t)',
          body: `The Platform is a hobbyist, non-commercial tool for organising and tracking flights within the ${N} community on Infinite Flight. It is not affiliated with, endorsed by, or connected to Infinite Flight Pty Ltd, Discord Inc, any real-world airline, or any aviation regulator. Flight data on the Platform reflects self-reported simulator activity only and has no bearing on real-world aviation records or licensing.`,
        },
        {
          heading: 'Your account',
          body: null,
          list: [
            { label: 'One account per person', desc: 'Duplicate accounts may be removed without notice.' },
            { label: 'Accurate information',   desc: 'Keep your profile, IFC username, and IF User ID accurate and up to date.' },
            { label: 'Account security',       desc: 'You\u2019re responsible for keeping your login credentials confidential and for activity on your account.' },
            { label: 'Report compromise',      desc: 'Contact staff immediately if you believe your account has been accessed without authorisation.' },
          ],
        },
        {
          heading: 'Acceptable use',
          body: `You agree to use the Platform in line with ${A}\u2019s Code of Conduct and Server Rules (see the Documentation section of the crew centre). Without limiting those rules, you must not: falsify or fabricate PIREPs or flight data; exploit bugs or vulnerabilities rather than reporting them; attempt to gain unauthorised access to other accounts or admin functions; scrape, reverse-engineer, or run unauthorised automated tools against the Platform; or use the Platform to harass, discriminate against, or abuse other members.`,
          highlight: true,
        },
        {
          heading: 'Content you submit',
          body: `You retain ownership of the information and content you submit to the Platform (such as profile details and flight reports). By submitting it, you grant ${A} a licence to store, display, and use it for the purpose of operating the Platform \u2014 for example, on leaderboards, statistics pages, and public pilot profiles. You can request deletion of your account and associated content at any time, subject to reasonable record-keeping needs described in our Privacy Policy.`,
        },
        {
          heading: 'Intellectual property',
          body: `The ${N} name and associated logos belong to ${OPERATOR}. The crew centre software is open source and used under its own licence. Using the Platform doesn\u2019t give you any ownership or licence over this intellectual property beyond what\u2019s needed to use the Platform as intended.`,
        },
        {
          heading: 'Third-party services',
          body: `The Platform uses PocketBase for its database and backend, and integrates with third-party services including Infinite Flight and Discord. These services are operated by other companies under their own terms, and ${A} isn\u2019t responsible for their availability, content, or performance.`,
        },
        {
          heading: 'No warranty',
          body: `The Platform is provided "as is" and "as available". We don\u2019t guarantee that the Platform will be uninterrupted, error-free, or that flight data, route information, or leaderboard rankings will always be accurate or complete.`,
        },
        {
          heading: 'Limitation of liability',
          body: `To the maximum extent permitted by law, ${A} excludes liability for any indirect, incidental, or consequential loss arising from your use of the Platform. Nothing in these Terms excludes any right you have under law that cannot lawfully be excluded.`,
          highlight: true,
        },
        {
          heading: 'Suspension and termination',
          body: `Staff may suspend or terminate your account for breaching these Terms, the Code of Conduct, or the Server Rules, at their discretion. Serious breaches \u2014 including falsified PIREPs, discrimination, or harassment \u2014 may result in immediate termination without prior notice. You may request deletion of your own account at any time.`,
        },
        {
          heading: 'Changes to the Platform or these Terms',
          body: `We may modify, suspend, or discontinue any part of the Platform, and may update these Terms from time to time. If we make material changes, we\u2019ll update the "last updated" date below. Continuing to use the Platform after changes take effect means you accept the updated Terms.`,
        },
        {
          heading: 'Governing law',
          body: brand.legal?.jurisdiction
            ? `These Terms are governed by the laws of ${brand.legal.jurisdiction}.`
            : `These Terms are governed by the laws that apply where ${OPERATOR} is based.`,
        },
        {
          heading: 'Contact',
          body: `Questions about these Terms can be directed to ${CONTACT}.`,
        },
      ],
    },
  },
  {
    id: 'privacy',
    label: 'Privacy Policy',
    Icon: ShieldCheck,
    content: {
      title: 'Privacy Policy',
      intro: `This Privacy Policy explains how the ${N} ${brand.crewCentreName} (the "Platform"), operated by ${OPERATOR} ("${A}", "we", "us", "our"), handles the personal information of its members. The Platform is a small, community-run project, and we\u2019ve tried to keep the information we collect to what\u2019s reasonably needed to run a virtual airline crew centre.`,
      sections: [
        {
          heading: 'Information we collect',
          body: null,
          list: [
            { label: 'Account details',  desc: 'Name, email address, and a securely hashed password (we never store your password in plain text).' },
            { label: 'Simulator identity', desc: 'Your Infinite Flight Community (IFC) username and IF User ID, used to verify and cross-reference your flights.' },
            { label: 'Discord details', desc: 'Your Discord username and ID, if you link your account, used for rank-role syncing.' },
            { label: 'Activity data', desc: 'Flight reports (PIREPs), routes flown, hours, rank, leave requests, exam and challenge results, and staff application submissions.' },
          ],
        },
        {
          heading: 'What we don\u2019t collect',
          body: `We do not log or store IP addresses, and we don\u2019t use IP-based tracking or analytics anywhere on the Platform. The Platform is free to use, so we don\u2019t collect any payment or financial information.`,
          highlight: true,
        },
        {
          heading: 'How we use your information',
          body: `We use your information to operate your crew centre account, calculate your rank and hours, maintain leaderboards and statistics, sync your Discord roles through the ${A} bot, review staff applications and exam submissions, communicate updates or moderation decisions, and enforce the Code of Conduct and Server Rules.`,
        },
        {
          heading: 'Where your information is stored',
          body: `Your data is stored in a PocketBase database managed by ${A}, and the Platform is hosted with third-party providers. These hosting providers may store or process data on servers located outside your country. We choose providers with reasonable security practices, but we can\u2019t independently audit every downstream system they rely on.`,
        },
        {
          heading: 'Cookies and local storage',
          body: `The Platform stores a login/session token in your browser\u2019s local storage so you can stay signed in between visits. This is functional only \u2014 it isn\u2019t used for advertising, and we don\u2019t use third-party ad or cross-site tracking cookies.`,
        },
        {
          heading: 'Sharing your information',
          body: null,
          list: [
            { label: 'We don\u2019t sell your data', desc: `${A} doesn\u2019t sell or rent your personal information to anyone.` },
            { label: 'Discord',   desc: 'Your Discord ID is shared with Discord\u2019s own systems through their official API when we sync rank roles.' },
            { label: `${A} staff`, desc: 'Staff and admins can access relevant account and activity data for moderation and operational purposes.' },
            { label: 'Legal requirements', desc: 'We may disclose information if required to do so by law or a valid legal request.' },
          ],
        },
        {
          heading: 'Public information',
          body: `Some information \u2014 like your callsign, rank, flight statistics, and public profile \u2014 is visible to other members, and in some cases the public, as part of how the Platform works.`,
        },
        {
          heading: 'Children\u2019s privacy',
          body: `The minimum age to register for the Platform is ${AGE}. If you\u2019re under 18, you should have your parent or guardian\u2019s permission to use the Platform. We do not knowingly collect personal information from anyone under ${AGE}, and if we become aware that we have, we\u2019ll delete the account and associated data.`,
          highlight: true,
        },
        {
          heading: 'Data security',
          body: `We use reasonable technical and organisational measures to protect your information \u2014 including password hashing and restricting staff access to what\u2019s needed for their role \u2014 but no method of storage or transmission over the internet is completely secure.`,
        },
        {
          heading: 'Data retention',
          body: `We keep your information while your account is active, and for a reasonable period afterwards for record-keeping, dispute resolution, and rank/flight history, unless you request deletion and there\u2019s no legal or operational reason to retain it.`,
        },
        {
          heading: 'Your rights',
          body: `You can ask to access, correct, or delete your personal information at any time by contacting ${CONTACT}. We aim to respond to these requests promptly.`,
        },
        {
          heading: 'Changes to this policy',
          body: `We may update this Privacy Policy from time to time. If we do, we\u2019ll update the "last updated" date below.`,
        },
        {
          heading: 'Contact us',
          body: `Questions about this Privacy Policy, or requests relating to your personal information, can be directed to ${CONTACT}.`,
        },
      ],
    },
  },
];

// Components

function LegalSection({ section }) {
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

function LegalNavItem({ doc, active, onClick }) {
  const { Icon } = doc;
  return (
    <button className={`docs-nav-item${active ? ' active' : ''}`} onClick={onClick}>
      <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
      <span style={{ flex: 1 }}>{doc.label}</span>
      {active && <span className="docs-nav-dot" />}
    </button>
  );
}

// Page

function Legal({ user }) {
  const [activeId, setActiveId] = useState(LEGAL_DOCS[0].id);
  const activeDoc = LEGAL_DOCS.find(d => d.id === activeId);
  const ActiveIcon = activeDoc.Icon;

  const backTo = user ? '/dashboard' : '/';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: user ? 0 : '2rem 1.25rem' }}>
      {!user && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src={logo} alt={brand.name} style={{ maxHeight: 60, objectFit: 'contain' }} />
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2>Legal</h2>
          <p>Terms of Service and Privacy Policy for the {brand.name} {brand.crewCentreName}.</p>
        </div>
        <Link to={backTo} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}>
          <ArrowLeft size={14} />
          {user ? 'Back to dashboard' : 'Back'}
        </Link>
      </div>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-inner">
            <div className="docs-sidebar-header">
              <p className="docs-sidebar-title">Documents</p>
            </div>
            <nav className="docs-nav">
              {LEGAL_DOCS.map(doc => (
                <LegalNavItem key={doc.id} doc={doc} active={activeId === doc.id} onClick={() => setActiveId(doc.id)} />
              ))}
            </nav>
          </div>
        </aside>

        <main className="docs-main">
          <div className="docs-main-header">
            <div className="docs-icon-wrap">
              <ActiveIcon size={20} color={GREEN} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="docs-main-title">{activeDoc.content.title}</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Last updated: {LAST_UPDATED}</span>
            </div>
          </div>

          <div className="docs-body">
            <p className="docs-section-body" style={{ marginBottom: '1.5rem' }}>
              {activeDoc.content.intro}
            </p>
            {activeDoc.content.sections.map((section, i) => (
              <LegalSection key={i} section={section} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Legal;
