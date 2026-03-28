'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UnifiedPost } from '@/types';
import { getLatestPostsPerClip, upsertPosts } from '@/lib/db';
import Sidebar, { NavSection } from '@/components/Sidebar';
import DashboardView from '@/components/views/DashboardView';
import ContentView from '@/components/views/ContentView';
import AnalyticsView from '@/components/views/AnalyticsView';
import PlatformsView from '@/components/views/PlatformsView';
import AIInsightsView from '@/components/views/AIInsightsView';
import EditorView from '@/components/views/EditorView';
import SettingsView from '@/components/views/SettingsView';
import ComparisonView from '@/components/views/ComparisonView';
import CaptionView from '@/components/views/CaptionView';
import ScriptAnalyzerView from '@/components/views/ScriptAnalyzerView';
import TranscriberView from '@/components/views/TranscriberView';
import PostingScheduleView from '@/components/views/PostingScheduleView';
import { VideoModalProvider } from '@/context/VideoModalContext';
import { FilterProvider } from '@/context/FilterContext';


const VALID_NAV_SECTIONS = new Set<NavSection>([
  'dashboard', 'content', 'schedule', 'analytics', 'platforms',
  'comparison', 'captions', 'scriptAnalyzer', 'transcriber', 'insights', 'editor', 'settings',
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clip_studio_ai_insights_v1');
      localStorage.removeItem('clip_studio_anthropic_key');
    }
  };

  const handleUpload = async (newPosts: UnifiedPost[]) => {
    // Merge into local state immediately
    setPosts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...newPosts.filter((p) => !existingIds.has(p.id))];
    });

    // Persist to Supabase in the background
    try {
      await upsertPosts(newPosts);
    } catch {
      // Non-fatal — data is still in local state for this session
      console.error('Failed to save posts to Supabase');
    }
  };

  const handlePostUpdate = (postId: string, contentType: string | undefined) => {
    setPosts((prev) =>
      prev.map((p) => p.id === postId ? { ...p, content_type: contentType } : p)
    );
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
            {activeNav === 'content'    && <ContentView posts={posts} onUpload={handleUpload} onPostUpdate={handlePostUpdate} />}
            {activeNav === 'schedule'   && <PostingScheduleView />}
            {activeNav === 'analytics'  && <AnalyticsView posts={posts} />}
            {activeNav === 'platforms'  && <PlatformsView posts={posts} />}
            {activeNav === 'comparison' && <ComparisonView posts={posts} />}
            {activeNav === 'captions'        && <CaptionView />}
            {activeNav === 'scriptAnalyzer' && <ScriptAnalyzerView />}
            {activeNav === 'transcriber'    && <TranscriberView />}
            {activeNav === 'insights'   && <AIInsightsView posts={posts} />}
            {activeNav === 'editor'     && <EditorView />}
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
