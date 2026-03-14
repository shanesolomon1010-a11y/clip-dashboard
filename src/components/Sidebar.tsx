'use client';

import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles, IconScissors, IconComparison } from './Icons';

export type NavSection = 'dashboard' | 'content' | 'analytics' | 'platforms' | 'comparison' | 'captions' | 'insights' | 'editor' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: <IconDashboard  className="w-4 h-4" /> },
  { id: 'content',     label: 'Content',     icon: <IconContent    className="w-4 h-4" /> },
  { id: 'analytics',   label: 'Analytics',   icon: <IconAnalytics  className="w-4 h-4" /> },
  { id: 'platforms',   label: 'Platforms',   icon: <IconPlatforms  className="w-4 h-4" /> },
  { id: 'comparison',  label: 'Comparison',  icon: <IconComparison className="w-4 h-4" /> },
  { id: 'captions',    label: 'Captions',    icon: <IconSparkles   className="w-4 h-4" />, badge: 'AI' },
  { id: 'insights',    label: 'AI Insights', icon: <IconSparkles   className="w-4 h-4" />, badge: 'AI' },
  { id: 'editor',      label: 'Editor',      icon: <IconScissors   className="w-4 h-4" />, badge: 'AI' },
  { id: 'settings',    label: 'Settings',    icon: <IconSettings   className="w-4 h-4" /> },
];

const NAV_GROUPS = [
  { label: 'Analytics', items: ['dashboard', 'content', 'analytics', 'platforms', 'comparison'] },
  { label: 'Tools',     items: ['captions', 'insights', 'editor', 'settings'] },
];

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-[192px] shrink-0 h-screen flex flex-col sticky top-0 bg-[var(--bg-elevated)] border-r border-white/[0.06]">

      {/* Wordmark — the editorial logo treatment */}
      <div className="px-5 pt-7 pb-6 border-b border-white/[0.06]">
        <p
          className="text-[20px] font-bold text-[var(--text-1)] leading-none tracking-tight"
        >
          Clip Studio
        </p>
        <p className="text-[9px] tracking-[0.22em] text-[var(--text-3)] uppercase mt-1.5 font-medium">
          Creator Analytics
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => {
          const groupItems = NAV_ITEMS.filter((item) => items.includes(item.id));
          return (
            <div key={label}>
              <p className="text-[9px] font-semibold tracking-[0.22em] text-[var(--text-3)] uppercase px-2 mb-1.5">
                {label}
              </p>
              <div className="space-y-px">
                {groupItems.map(({ id, label: itemLabel, icon, badge }) => {
                  const isActive = active === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onNavigate(id)}
                      className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 group ${
                        isActive
                          ? 'text-[var(--gold)] bg-[var(--gold-dim)]'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04]'
                      }`}
                    >
                      {/* Gold rule for active */}
                      {isActive && (
                        <span className="absolute left-0 top-[6px] bottom-[6px] w-[2px] bg-[var(--gold)] rounded-full opacity-90" />
                      )}
                      <span className={`shrink-0 transition-colors ${
                        isActive ? 'text-[var(--gold)]' : 'text-[var(--text-3)] group-hover:text-[var(--text-2)]'
                      }`}>
                        {icon}
                      </span>
                      <span className="flex-1 text-left">{itemLabel}</span>
                      {badge && !isActive && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)] leading-none">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Import CTA — minimal, no filled button */}
      <div className="px-3 pb-5">
        <div className="border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <IconUpload className="w-3.5 h-3.5 text-[var(--text-3)]" />
            <span className="text-[11px] font-semibold text-[var(--text-2)] tracking-wide">Import Data</span>
          </div>
          <p className="text-[10px] text-[var(--text-3)] leading-relaxed mb-3">
            Upload CSV exports from any platform.
          </p>
          <button
            onClick={() => onNavigate('content')}
            className="w-full text-[11px] font-semibold text-[var(--gold)] border border-[var(--gold-border)] bg-[var(--gold-dim)] hover:bg-[rgba(212,146,42,0.12)] rounded-lg py-2 transition-colors"
          >
            Upload CSV
          </button>
        </div>
      </div>
    </aside>
  );
}
