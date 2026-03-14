'use client';

import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles, IconScissors } from './Icons';

export type NavSection = 'dashboard' | 'content' | 'analytics' | 'platforms' | 'insights' | 'editor' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',    icon: <IconDashboard className="w-[18px] h-[18px]" /> },
  { id: 'content',    label: 'Content',      icon: <IconContent   className="w-[18px] h-[18px]" /> },
  { id: 'analytics',  label: 'Analytics',    icon: <IconAnalytics className="w-[18px] h-[18px]" /> },
  { id: 'platforms',  label: 'Platforms',    icon: <IconPlatforms className="w-[18px] h-[18px]" /> },
  { id: 'insights',   label: 'AI Insights',  icon: <IconSparkles  className="w-[18px] h-[18px]" />, badge: 'AI' },
  { id: 'editor',     label: 'Editor',       icon: <IconScissors  className="w-[18px] h-[18px]" />, badge: 'AI' },
  { id: 'settings',   label: 'Settings',     icon: <IconSettings  className="w-[18px] h-[18px]" /> },
];

const NAV_GROUPS = [
  { label: 'Main', items: ['dashboard', 'content', 'analytics', 'platforms'] },
  { label: 'Tools', items: ['insights', 'editor', 'settings'] },
];

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-[200px] shrink-0 h-screen flex flex-col sticky top-0 bg-[var(--bg-elevated)] border-r border-white/[0.05]">

      {/* Logo */}
      <div className="px-4 pt-6 pb-5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[var(--text-1)] leading-none tracking-tight">Clip Studio</p>
            <p className="text-[10px] text-[var(--text-3)] mt-0.5">Creator Analytics</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => {
          const groupItems = NAV_ITEMS.filter((item) => items.includes(item.id));
          return (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-3)] px-3 mb-1">{label}</p>
              <div className="space-y-0.5">
                {groupItems.map(({ id, label: itemLabel, icon, badge }) => {
                  const isActive = active === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onNavigate(id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group ${
                        isActive
                          ? 'bg-sky-500/10 text-sky-400'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className={`shrink-0 transition-colors ${isActive ? 'text-sky-400' : 'text-[var(--text-3)] group-hover:text-[var(--text-2)]'}`}>
                        {icon}
                      </span>
                      <span className="flex-1 text-left">{itemLabel}</span>
                      {badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 leading-none">
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

      {/* Import CTA */}
      <div className="px-3 pb-5">
        <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <IconUpload className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <span className="text-[12px] font-semibold text-[var(--text-1)]">Import Data</span>
          </div>
          <p className="text-[11px] text-[var(--text-2)] leading-relaxed mb-3">
            Upload CSV exports from any platform to sync your analytics.
          </p>
          <button
            onClick={() => onNavigate('content')}
            className="w-full text-[12px] font-semibold bg-sky-500 hover:bg-sky-400 text-white rounded-xl py-2 transition-colors"
          >
            Upload CSV
          </button>
        </div>
      </div>
    </aside>
  );
}
