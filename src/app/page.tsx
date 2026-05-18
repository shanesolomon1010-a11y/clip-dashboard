'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UnifiedPost } from '@/types';
import { getLatestPostsPerClip } from '@/lib/db';
import Sidebar, { NavSection } from '@/components/Sidebar';
import DashboardView from '@/components/views/DashboardView';
import PlatformsView from '@/components/views/PlatformsView';
import SettingsView from '@/components/views/SettingsView';
import ComparisonView from '@/components/views/ComparisonView';
import PostingScheduleView from '@/components/views/PostingScheduleView';
import SocialCopyView from '@/components/views/SocialCopyView';
import FounderReportView from '@/components/views/FounderReportView';
import { VideoModalProvider } from '@/context/VideoModalContext';
import { FilterProvider } from '@/context/FilterContext';


const VALID_NAV_SECTIONS = new Set<NavSection>([
  'dashboard', 'schedule', 'platforms',
  'comparison', 'settings', 'social-copy', 'founder-report',
]);

function AppInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<UnifiedPost[]>([]);
  const initialNav = (() => {
    const tab = searchParams.get('tab') as NavSection | null;
    return tab && VALID_NAV_SECTIONS.has(tab) ? tab : 'dashboard';
  })();
  const [activeNav, setActiveNav] = useState<NavSection>(initialNav);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', activeNav);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [activeNav]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getLatestPostsPerClip()
      .then((fetched) => {
        setPosts(fetched);
      })
      .catch(() => {
        setPosts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleClearData = () => {
    setPosts([]);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-2)]">Loading your data…</p>
        </div>
      </div>
    );
  }

  return (
    <FilterProvider>
    <VideoModalProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-white">
        <Sidebar active={activeNav} onNavigate={setActiveNav} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            {activeNav === 'dashboard'  && <DashboardView posts={posts} />}
            {activeNav === 'schedule'   && <PostingScheduleView />}
            {activeNav === 'platforms'  && <PlatformsView posts={posts} />}
            {activeNav === 'comparison' && <ComparisonView posts={posts} />}
            {activeNav === 'founder-report' && <FounderReportView />}
            {activeNav === 'social-copy' && <SocialCopyView />}
            {activeNav === 'settings'   && <SettingsView onClearData={handleClearData} />}
          </main>
        </div>
      </div>
    </VideoModalProvider>
    </FilterProvider>
  );
}

export default function App() {
  return (
    <Suspense>
      <AppInner />
    </Suspense>
  );
}
