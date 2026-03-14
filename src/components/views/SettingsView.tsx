'use client';

import { useState } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

interface Props {
  onClearData?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05]">
        <h3 className="text-[13px] font-semibold text-[var(--text-1)]">{title}</h3>
      </div>
      <div className="divide-y divide-white/[0.05]">{children}</div>
    </div>
  );
}

function Row({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
      <div>
        <p className="text-[13px] text-[var(--text-1)] font-medium">{label}</p>
        {sub && <p className="text-[11px] text-[var(--text-3)] mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0 ml-4">{right}</div>
    </div>
  );
}

export default function SettingsView({ onClearData }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRequestClear = () => setConfirmOpen(true);
  const handleCancel = () => setConfirmOpen(false);
  const handleConfirm = () => {
    setConfirmOpen(false);
    onClearData?.();
  };

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-bold text-[var(--text-1)] mb-1 tracking-tight">Settings</h2>
        <p className="text-sm text-[var(--text-2)]">Manage your Clip Studio preferences.</p>
      </div>

      {/* Connected platforms */}
      <Section title="Connected Platforms">
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <p className="text-[11px] text-[var(--text-3)]">Live API connections coming soon. All platforms currently support CSV import.</p>
        </div>
        {ALL_PLATFORMS.map((pl) => (
          <Row
            key={pl}
            label={PLATFORM_LABELS[pl]}
            sub="CSV import only — no OAuth required"
            right={
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: `${PLATFORM_COLORS[pl]}15`, color: PLATFORM_COLORS[pl] }}
              >
                CSV Import Ready
              </span>
            }
          />
        ))}
      </Section>

      {/* Data & Privacy */}
      <Section title="Data & Privacy">
        <Row
          label="Clear all data"
          sub="Remove all imported posts from memory"
          right={
            <button
              onClick={handleRequestClear}
              className="text-xs font-semibold text-red-400 border border-red-500/20 bg-red-500/[0.08] px-3 py-1.5 rounded-xl hover:bg-red-500/[0.15] transition-all"
            >
              Clear data
            </button>
          }
        />
      </Section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            onClick={handleCancel}
            className="absolute inset-0 bg-black/60"
          />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <p className="text-sm font-semibold text-[var(--text-1)]">Clear all data?</p>
              <p className="text-xs text-[var(--text-3)] mt-1">
                This will remove all imported posts and delete saved AI insights from this browser. This can&apos;t be undone.
              </p>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-2 text-xs font-semibold text-[var(--text-1)] bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-400 rounded-xl transition-colors"
              >
                Yes, clear everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
