'use client';

import { createContext, useContext, useState } from 'react';
import { UnifiedPost } from '@/types';
import VideoPreviewModal from '@/components/VideoPreviewModal';

interface VideoModalContextValue {
  open: (post: UnifiedPost, clipCode: string) => void;
}

const VideoModalContext = createContext<VideoModalContextValue | null>(null);

export function useVideoModal(): VideoModalContextValue {
  const ctx = useContext(VideoModalContext);
  if (!ctx) throw new Error('useVideoModal must be used within VideoModalProvider');
  return ctx;
}

interface ProviderProps {
  children: React.ReactNode;
}

export function VideoModalProvider({ children }: ProviderProps) {
  const [selectedPost, setSelectedPost] = useState<UnifiedPost | null>(null);
  const [selectedClipCode, setSelectedClipCode] = useState<string>('');

  function openModal(post: UnifiedPost, clipCode: string) {
    setSelectedPost(post);
    setSelectedClipCode(clipCode);
  }

  return (
    <VideoModalContext.Provider value={{ open: openModal }}>
      {children}
      {selectedPost && (
        <VideoPreviewModal
          post={selectedPost}
          onClose={() => { setSelectedPost(null); setSelectedClipCode(''); }}
          clipCode={selectedClipCode}
        />
      )}
    </VideoModalContext.Provider>
  );
}
