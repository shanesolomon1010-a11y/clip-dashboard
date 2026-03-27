export type Platform = 'youtube' | 'instagram';

export interface UnifiedPost {
  id: string;
  clip_code?: string;
  platform: Platform;
  date: string; // ISO date string YYYY-MM-DD (maps to posted_at in DB)
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number; // percentage 0-100
  title: string;
  content_type?: string;
  url?: string;
  thumbnail_url?: string;
  // YouTube daily stat fields
  stat_date?: string;       // daily stat row date (YYYY-MM-DD)
  content_id?: string;      // YouTube video content_id
  duration_seconds?: number;
  daily_engaged_views?: number;
  total_engaged_views?: number;
  watch_time_hours?: number;
  unique_viewers?: number;
  youtube_premium_views?: number;
  // YouTube-specific
  watch_time_minutes?: number;
  avg_view_duration_seconds?: number;
  avg_view_percentage?: number;
  impressions?: number;
  impression_ctr?: number;
  dislikes?: number;
  subscribers_gained?: number;
  subscribers_lost?: number;
  card_clicks?: number;
  card_ctr?: number;
  end_screen_clicks?: number;
  end_screen_ctr?: number;
  // Instagram-specific
  plays?: number;
  reach?: number;
  profile_visits?: number;
  follows?: number;
  accounts_reached?: number;
  accounts_engaged?: number;
  engagement_rate?: number;
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
