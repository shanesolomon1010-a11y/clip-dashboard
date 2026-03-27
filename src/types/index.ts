export type Platform = 'youtube' | 'instagram';

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
  youtube: '#FF4444',
  instagram: '#C855E8',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
};
