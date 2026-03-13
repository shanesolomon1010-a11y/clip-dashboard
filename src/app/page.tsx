'use client';

import { useState } from 'react';
import { UnifiedPost } from '@/types';
import { SAMPLE_POSTS } from '@/lib/sampleData';
import Sidebar, { NavSection } from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import DashboardView from '@/components/views/DashboardView';
import ContentView from '@/components/views/ContentView';
import AnalyticsView from '@/components/views/AnalyticsView';
import PlatformsView from '@/components/views/PlatformsView';
import AIInsightsView from '@/components/views/AIInsightsView';
import SettingsView from '@/components/views/SettingsView';

const NAV_TITLES: Record<NavSection, string> = {
  dashboard:  'Dashboard',
  content:    'Content',
  analytics:  'Analytics',
  platforms:  'Platforms',
  insights:   'AI Insights',
  settings:   'Settings',
};

export default function App() {
  const [posts, setPosts] = useState<UnifiedPost[]>(SAMPLE_POSTS);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');

  const handleUpload = (newPosts: UnifiedPost[]) => {
    setPosts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...newPosts.filter((p) => !existingIds.has(p.id))];
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-white">
      <Sidebar active={activeNav} onNavigate={setActiveNav} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={NAV_TITLES[activeNav]} postCount={posts.length} />

        <main className="flex-1 overflow-y-auto">
          {activeNav === 'dashboard'  && <DashboardView posts={posts} />}
          {activeNav === 'content'    && <ContentView posts={posts} onUpload={handleUpload} />}
          {activeNav === 'analytics'  && <AnalyticsView posts={posts} />}
          {activeNav === 'platforms'  && <PlatformsView posts={posts} />}
          {activeNav === 'insights'   && <AIInsightsView posts={posts} />}
          {activeNav === 'settings'   && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
