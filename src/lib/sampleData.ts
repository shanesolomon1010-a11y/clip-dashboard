import { UnifiedPost } from '@/types';

function d(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export const SAMPLE_POSTS: UnifiedPost[] = [
  // Instagram
  { id: 'ig-1', platform: 'instagram', date: d(2), views: 54000, likes: 4200, comments: 310, shares: 680, saves: 1900, engagementRate: 12.76, title: 'Best tools for short-form content in 2024' },
  { id: 'ig-2', platform: 'instagram', date: d(5), views: 38000, likes: 3100, comments: 195, shares: 420, saves: 1100, engagementRate: 12.67, title: 'Reels that grew my account 40%' },
  { id: 'ig-3', platform: 'instagram', date: d(9), views: 71000, likes: 5900, comments: 420, shares: 940, saves: 2600, engagementRate: 13.89, title: 'Caption hack for 3x more saves' },
  { id: 'ig-4', platform: 'instagram', date: d(15), views: 29000, likes: 2200, comments: 130, shares: 300, saves: 780, engagementRate: 11.76, title: 'Aesthetic transition tutorial' },
  { id: 'ig-5', platform: 'instagram', date: d(21), views: 88000, likes: 7400, comments: 560, shares: 1200, saves: 3300, engagementRate: 14.16, title: 'How I batch record 30 days of content' },
  { id: 'ig-6', platform: 'instagram', date: d(35), views: 44000, likes: 3500, comments: 220, shares: 510, saves: 1400, engagementRate: 12.57, title: 'The algorithm shift nobody is talking about' },
  { id: 'ig-7', platform: 'instagram', date: d(50), views: 62000, likes: 5100, comments: 380, shares: 820, saves: 2200, engagementRate: 13.71, title: 'Viral audio list for this month' },
  { id: 'ig-8', platform: 'instagram', date: d(70), views: 31000, likes: 2400, comments: 150, shares: 340, saves: 900, engagementRate: 12.23, title: 'Editing presets for warm tones' },

  // YouTube
  { id: 'yt-1', platform: 'youtube', date: d(3), views: 28000, likes: 1400, comments: 320, shares: 0, saves: 0, engagementRate: 6.14, title: 'I tried every short-form platform for 90 days' },
  { id: 'yt-2', platform: 'youtube', date: d(7), views: 19500, likes: 980, comments: 215, shares: 0, saves: 0, engagementRate: 6.13, title: 'How to edit Shorts in under 10 minutes' },
  { id: 'yt-3', platform: 'youtube', date: d(14), views: 44000, likes: 2200, comments: 510, shares: 0, saves: 0, engagementRate: 6.16, title: 'Shorts that drive long-form watch time' },
  { id: 'yt-4', platform: 'youtube', date: d(22), views: 11000, likes: 540, comments: 118, shares: 0, saves: 0, engagementRate: 5.98, title: 'Why Shorts changed my channel growth' },
  { id: 'yt-5', platform: 'youtube', date: d(38), views: 67000, likes: 3400, comments: 780, shares: 0, saves: 0, engagementRate: 6.24, title: 'Viral Short breakdown: what worked and why' },
  { id: 'yt-6', platform: 'youtube', date: d(52), views: 32000, likes: 1600, comments: 370, shares: 0, saves: 0, engagementRate: 6.16, title: 'My Shorts vs long-form revenue split' },
  { id: 'yt-7', platform: 'youtube', date: d(68), views: 88000, likes: 4500, comments: 1020, shares: 0, saves: 0, engagementRate: 6.27, title: '10 Shorts ideas that always perform' },
  { id: 'yt-8', platform: 'youtube', date: d(82), views: 21000, likes: 1050, comments: 240, shares: 0, saves: 0, engagementRate: 6.14, title: 'YouTube algorithm secrets for Shorts creators' },
];
