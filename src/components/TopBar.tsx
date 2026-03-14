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
    <header className="h-14 shrink-0 bg-[var(--bg-base)] border-b border-white/[0.05] flex items-center gap-4 px-6">
      {/* Page title */}
      <h1 className="font-semibold text-[13px] text-[var(--text-1)] tracking-tight w-32 shrink-0" style={{ fontFamily: 'var(--font-space)' }}>{title}</h1>

      {/* Divider */}
      <span className="h-5 w-px bg-white/[0.06] shrink-0" />

      {/* Search */}
      <div className="flex-1 max-w-sm relative">
        <IconSearch className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts, platforms…"
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-4 py-1.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-sky-500/50 transition-all"
        />
      </div>

      <div className="flex items-center gap-2.5 ml-auto">
        {/* Post count */}
        <span className="hidden sm:inline text-[11px] text-[var(--text-2)] bg-white/[0.03] border border-white/[0.05] px-2.5 py-1 rounded-lg font-['JetBrains_Mono'] tabular-nums">
          {postCount} posts
        </span>

        {/* Notification bell */}
        <button className="relative w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text-1)] transition-all">
          <IconBell className="w-3.5 h-3.5" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 ring-1 ring-[var(--bg-base)]" />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-[11px] font-semibold text-white select-none cursor-pointer">
          CS
        </div>
      </div>
    </header>
  );
}
