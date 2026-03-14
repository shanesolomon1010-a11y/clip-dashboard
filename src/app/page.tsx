'use client';

import { useEffect, useState } from 'react';
import { UnifiedPost } from '@/types';
import { SAMPLE_POSTS } from '@/lib/sampleData';
import { fetchAllPosts, upsertPosts } from '@/lib/db';
import Sidebar, { NavSection } from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import DashboardView from '@/components/views/DashboardView';
import ContentView from '@/components/views/ContentView';
import AnalyticsView from '@/components/views/AnalyticsView';
import PlatformsView from '@/components/views/PlatformsView';
import AIInsightsView from '@/components/views/AIInsightsView';
import EditorView from '@/components/views/EditorView';
import SettingsView from '@/components/views/SettingsView';
import ComparisonView from '@/components/views/ComparisonView';

const NAV_TITLES: Record<NavSection, string> = {
  dashboard:   'Dashboard',
  content:     'Content',
  analytics:   'Analytics',
  platforms:   'Platforms',
  comparison:  'Comparison',
  captions:    'Caption Generator',
  insights:    'AI Insights',
  editor:      'Editor',
  settings:    'Settings',
};

export default function App() {
  const [posts, setPosts] = useState<UnifiedPost[]>([]);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllPosts()
      .then((fetched) => {
        setPosts(fetched.length > 0 ? fetched : SAMPLE_POSTS);
      })
      .catch(() => {
        // Supabase unavailable or not configured — fall back to sample data
        setPosts(SAMPLE_POSTS);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleClearData = () => {
    setPosts(SAMPLE_POSTS);
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
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-white">
      <Sidebar active={activeNav} onNavigate={setActiveNav} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={NAV_TITLES[activeNav]} postCount={posts.length} />

        <main className="flex-1 overflow-y-auto">
          {activeNav === 'dashboard'  && <DashboardView posts={posts} />}
          {activeNav === 'content'    && <ContentView posts={posts} onUpload={handleUpload} onPostUpdate={handlePostUpdate} />}
          {activeNav === 'analytics'  && <AnalyticsView posts={posts} />}
          {activeNav === 'platforms'  && <PlatformsView posts={posts} />}
          {activeNav === 'comparison' && <ComparisonView posts={posts} />}
          {activeNav === 'insights'   && <AIInsightsView posts={posts} />}
          {activeNav === 'editor'     && <EditorView />}
          {activeNav === 'settings'   && <SettingsView onClearData={handleClearData} />}
        </main>
      </div>
    </div>
  );
}
