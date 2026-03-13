'use client';

import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles } from './Icons';

export type NavSection = 'dashboard' | 'content' | 'analytics' | 'platforms' | 'insights' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',    icon: <IconDashboard className="w-5 h-5" /> },
  { id: 'content',    label: 'Content',      icon: <IconContent className="w-5 h-5" /> },
  { id: 'analytics',  label: 'Analytics',    icon: <IconAnalytics className="w-5 h-5" /> },
  { id: 'platforms',  label: 'Platforms',    icon: <IconPlatforms className="w-5 h-5" /> },
  { id: 'insights',   label: 'AI Insights',  icon: <IconSparkles className="w-5 h-5" />, badge: 'AI' },
  { id: 'settings',   label: 'Settings',     icon: <IconSettings className="w-5 h-5" /> },
];

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-56 shrink-0 h-screen flex flex-col bg-gray-900 border-r border-gray-800 sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path fillRule="evenodd" d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm3-1a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1H6z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Clip Studio</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Creator Analytics</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className={`shrink-0 ${isActive ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
                {icon}
              </span>
              {label}
              <span className="ml-auto flex items-center gap-1">
                {id === 'insights' && !isActive && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 leading-none">
                    AI
                  </span>
                )}
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Import CTA */}
      <div className="px-3 pb-4">
        <div className="rounded-xl bg-gray-800/80 border border-gray-700/60 p-4">
          <div className="flex items-center gap-2 mb-2">
            <IconUpload className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">Import Data</span>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
            Upload CSV exports from any platform to sync your analytics.
          </p>
          <button
            onClick={() => onNavigate('content')}
            className="w-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 transition-colors"
          >
            Upload CSV
          </button>
        </div>
      </div>
    </aside>
  );
}
