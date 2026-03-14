'use client';

import { useState } from 'react';
import { IconBell, IconSearch } from './Icons';

interface Props {
  title: string;
  postCount: number;
}

export default function TopBar({ title, postCount }: Props) {
  const [query, setQuery] = useState('');

  return (
    <header className="h-14 shrink-0 bg-[var(--bg-base)] border-b border-white/[0.06] flex items-center gap-5 px-6">
      {/* Page title — Instrument Serif italic */}
      <h1
        className="text-[17px] text-[var(--text-1)] leading-none tracking-tight shrink-0"
        style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
      >
        {title}
      </h1>

      {/* Divider */}
      <span className="h-4 w-px bg-white/[0.07] shrink-0" />

      {/* Search — minimal */}
      <div className="flex-1 max-w-xs relative">
        <IconSearch className="w-3 h-3 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full bg-transparent border border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] transition-colors"
        />
      </div>

      <div className="flex items-center gap-2.5 ml-auto">
        {/* Post count */}
        <span className="hidden sm:inline text-[11px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
          {postCount} posts
        </span>

        {/* Notification bell */}
        <button className="relative w-7 h-7 rounded-lg border border-white/[0.06] hover:border-white/[0.10] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-2)] transition-all">
          <IconBell className="w-3.5 h-3.5" />
          <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[var(--gold)] ring-1 ring-[var(--bg-base)]" />
        </button>

        {/* Avatar — initials on gold */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-[var(--bg-base)] select-none cursor-pointer"
          style={{ background: 'var(--gold)' }}
        >
          CS
        </div>
      </div>
    </header>
  );
}
