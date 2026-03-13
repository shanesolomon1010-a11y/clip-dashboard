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
    <header className="h-14 shrink-0 bg-gray-950 border-b border-gray-800 flex items-center gap-4 px-6">
      {/* Page title */}
      <h1 className="text-base font-semibold text-white w-36 shrink-0">{title}</h1>

      {/* Search */}
      <div className="flex-1 max-w-md relative">
        <IconSearch className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts, platforms…"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Post count pill */}
        <span className="hidden sm:inline text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2.5 py-1 rounded-full">
          {postCount} posts
        </span>

        {/* Notification bell */}
        <button className="relative w-9 h-9 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
          <IconBell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white select-none cursor-pointer">
          CS
        </div>
      </div>
    </header>
  );
}
