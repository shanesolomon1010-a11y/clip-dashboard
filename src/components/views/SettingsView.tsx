'use client';

import { Platform, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

function Toggle({ defaultChecked = true }: { defaultChecked?: boolean }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" defaultChecked={defaultChecked} />
      <div className="w-10 h-5 bg-gray-700 peer-checked:bg-indigo-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="divide-y divide-gray-800/60">{children}</div>
    </div>
  );
}

function Row({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0 ml-4">{right}</div>
    </div>
  );
}

export default function SettingsView() {
  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">Settings</h2>
        <p className="text-sm text-gray-500">Manage your Clip Studio preferences.</p>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <div className="px-5 py-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-lg font-bold text-white">
            CS
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Clip Studio User</p>
            <p className="text-xs text-gray-500 mt-0.5">creator@clipstudio.io</p>
          </div>
          <button className="ml-auto text-xs font-semibold text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors">
            Edit Profile
          </button>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <Row
          label="Dark mode"
          sub="Always on — the only correct choice"
          right={<Toggle defaultChecked={true} />}
        />
        <Row
          label="Compact view"
          sub="Reduce padding in tables and lists"
          right={<Toggle defaultChecked={false} />}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Row label="Weekly digest" sub="Summary of your top posts every Monday" right={<Toggle />} />
        <Row label="Import success alerts" sub="Notify when CSV import completes" right={<Toggle />} />
        <Row label="Platform trend alerts" sub="Alert when a platform spikes or drops" right={<Toggle defaultChecked={false} />} />
      </Section>

      {/* Connected platforms */}
      <Section title="Connected Platforms">
        {ALL_PLATFORMS.map((pl) => (
          <Row
            key={pl}
            label={PLATFORM_LABELS[pl]}
            sub="CSV import only — no OAuth required"
            right={
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: `${PLATFORM_COLORS[pl]}22`, color: PLATFORM_COLORS[pl] }}
              >
                Active
              </span>
            }
          />
        ))}
      </Section>

      {/* Data */}
      <Section title="Data & Privacy">
        <Row label="Data retention" sub="How long post data is stored" right={
          <select className="bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
            <option>Forever</option>
            <option>1 year</option>
            <option>90 days</option>
          </select>
        } />
        <Row label="Clear all data" sub="Remove all imported posts from memory" right={
          <button className="text-xs font-semibold text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            Clear data
          </button>
        } />
      </Section>
    </div>
  );
}
