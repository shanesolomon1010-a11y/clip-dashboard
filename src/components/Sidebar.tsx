'use client';

import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles } from './Icons';

export type NavSection = 'dashboard' | 'content' | 'analytics' | 'platforms' | 'insights' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',    icon: <IconDashboard className="w-[18px] h-[18px]" /> },
  { id: 'content',    label: 'Content',      icon: <IconContent   className="w-[18px] h-[18px]" /> },
  { id: 'analytics',  label: 'Analytics',    icon: <IconAnalytics className="w-[18px] h-[18px]" /> },
  { id: 'platforms',  label: 'Platforms',    icon: <IconPlatforms className="w-[18px] h-[18px]" /> },
  { id: 'insights',   label: 'AI Insights',  icon: <IconSparkles  className="w-[18px] h-[18px]" />, badge: 'AI' },
  { id: 'settings',   label: 'Settings',     icon: <IconSettings  className="w-[18px] h-[18px]" /> },
];

const NAV_GROUPS = [
  { label: 'Main', items: ['dashboard', 'content', 'analytics', 'platforms'] },
  { label: 'Tools', items: ['insights', 'settings'] },
];

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-[220px] shrink-0 h-screen flex flex-col sticky top-0 bg-[#080d16] border-r border-white/[0.06]">

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-900/40">
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path fillRule="evenodd" d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm3-1a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1H6z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none tracking-tight">Clip Studio</p>
            <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Creator Analytics</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => {
          const groupItems = NAV_ITEMS.filter((item) => items.includes(item.id));
          return (
            <div key={label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
              <div className="space-y-0.5">
                {groupItems.map(({ id, label: itemLabel, icon, badge }) => {
                  const isActive = active === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onNavigate(id)}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                        isActive
                          ? 'bg-indigo-500/10 text-white'
                          : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      {/* Active left accent bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-indigo-400 rounded-full" />
                      )}
                      <span className={`shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-gray-600 group-hover:text-gray-400'}`}>
                        {icon}
                      </span>
                      <span className="flex-1 text-left">{itemLabel}</span>
                      {badge && !isActive && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/20 leading-none">
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
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/15 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <IconUpload className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span className="text-xs font-semibold text-white">Import Data</span>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
            Upload CSV exports from any platform to sync your analytics.
          </p>
          <button
            onClick={() => onNavigate('content')}
            className="w-full text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg py-2 transition-colors shadow-lg shadow-indigo-900/30"
          >
            Upload CSV
          </button>
        </div>
      </div>
    </aside>
  );
}
