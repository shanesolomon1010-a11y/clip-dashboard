'use client';

import { createContext, useContext, useState } from 'react';
import { UnifiedPost } from '@/types';
import VideoPreviewModal from '@/components/VideoPreviewModal';

interface VideoModalContextValue {
  open: (post: UnifiedPost) => void;
}

const VideoModalContext = createContext<VideoModalContextValue | null>(null);

export function useVideoModal(): VideoModalContextValue {
  const ctx = useContext(VideoModalContext);
  if (!ctx) throw new Error('useVideoModal must be used within VideoModalProvider');
  return ctx;
}

interface ProviderProps {
  children: React.ReactNode;
  onUrlSaved: (platform: string, title: string, date: string, url: string) => void;
}

export function VideoModalProvider({ children, onUrlSaved }: ProviderProps) {
  const [selectedPost, setSelectedPost] = useState<UnifiedPost | null>(null);

  async function handleUrlSaved(platform: string, title: string, date: string, url: string) {
    await onUrlSaved(platform, title, date, url);
    setSelectedPost((prev) => (prev ? { ...prev, url } : null));
  }

  return (
    <VideoModalContext.Provider value={{ open: setSelectedPost }}>
      {children}
      {selectedPost && (
        <VideoPreviewModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUrlSaved={handleUrlSaved}
        />
      )}
    </VideoModalContext.Provider>
  );
}
