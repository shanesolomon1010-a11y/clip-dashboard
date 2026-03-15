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
  content_type?: string;
  url?: string;
}

export type DateRange = '1d' | '7d' | '30d' | '90d' | 'all';

export type GoalMetric = 'views' | 'likes' | 'engagement_rate' | 'followers';

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  views: 'Views',
  likes: 'Likes',
  engagement_rate: 'Eng. Rate',
  followers: 'Followers',
};

export const CONTENT_TYPES = [
  'Hook Video',
  'Tutorial',
  'UGC Style',
  'Talking Head',
  'B-Roll',
  'Podcast Clip',
  'Text Post',
  'Other',
] as const;

export type ContentType = typeof CONTENT_TYPES[number];

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
