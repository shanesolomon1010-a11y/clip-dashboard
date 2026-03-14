'use client';

interface Props {
  title: string;
  postCount: number;
}

export default function TopBar({ title, postCount }: Props) {
  return (
    <header className="h-14 shrink-0 bg-[var(--bg-base)] border-b border-white/[0.06] flex items-center px-6">
      {/* Page title */}
      <h1
        className="text-[17px] font-semibold text-[var(--text-1)] leading-none tracking-tight shrink-0"
      >
        {title}
      </h1>

      <div className="ml-auto">
        <span className="text-[11px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
          {postCount} posts
        </span>
      </div>
    </header>
  );
}
