export type Platform = 'tiktok' | 'instagram' | 'linkedin' | 'twitter' | 'youtube';

export interface UnifiedPost {
  id: string;
  platform: Platform;
  date: string; // ISO date string YYYY-MM-DD
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number; // percentage 0-100
  title: string;
}

export type DateRange = '7d' | '30d' | '90d' | 'all';

export const PLATFORM_COLORS: Record<Platform, string> = {
  tiktok: '#FF0050',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  youtube: '#FF0000',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X/Twitter',
  youtube: 'YouTube',
};
