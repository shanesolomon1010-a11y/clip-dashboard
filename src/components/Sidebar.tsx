'use client';

import { IconDashboard, IconPlatforms, IconSettings, IconComparison, IconCalendar, IconFounderReport } from './Icons';

export type NavSection = 'dashboard' | 'schedule' | 'platforms' | 'comparison' | 'settings' | 'social-copy' | 'founder-report';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',      label: 'Dashboard',        icon: <IconDashboard      className="w-4 h-4" /> },
  { id: 'schedule',       label: 'Posting Schedule', icon: <IconCalendar       className="w-4 h-4" /> },
  { id: 'founder-report', label: 'Founder Report',   icon: <IconFounderReport  className="w-4 h-4" /> },
  { id: 'platforms',      label: 'Platforms',        icon: <IconPlatforms      className="w-4 h-4" /> },
  { id: 'comparison',     label: 'Comparison',       icon: <IconComparison     className="w-4 h-4" /> },
  { id: 'settings',       label: 'Settings',         icon: <IconSettings       className="w-4 h-4" /> },
];

const NAV_GROUPS = [
  { label: 'Analytics', items: [
    'dashboard',
    'founder-report',
    // 'platforms',  // TODO: re-enable after polish pass — see Shane
    // 'comparison', // TODO: re-enable after polish pass — see Shane
  ] },
  { label: 'Workspace', items: ['schedule', 'settings'] },
];

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-[192px] shrink-0 h-screen flex flex-col sticky top-0 bg-[var(--bg-elevated)] border-r border-[rgba(247,231,206,0.06)]">

      {/* Wordmark — the editorial logo treatment */}
      <div className="px-5 pt-7 pb-6 border-b border-[rgba(247,231,206,0.06)]">
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
                      data-testid={`nav-${id}`}
                      onClick={() => onNavigate(id)}
                      className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 group ${
                        isActive
                          ? 'text-[var(--gold)] bg-[var(--gold-dim)]'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[rgba(247,231,206,0.04)]'
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

    </aside>
  );
}
