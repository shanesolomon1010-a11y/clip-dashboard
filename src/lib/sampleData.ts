import { UnifiedPost } from '@/types';

function d(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export const SAMPLE_POSTS: UnifiedPost[] = [
  // TikTok
  { id: 'tt-1', platform: 'tiktok', date: d(1), views: 142000, likes: 18400, comments: 920, shares: 3200, saves: 0, engagementRate: 15.86, title: 'Morning routine that changed my life' },
  { id: 'tt-2', platform: 'tiktok', date: d(4), views: 98000, likes: 12100, comments: 540, shares: 1800, saves: 0, engagementRate: 14.73, title: 'POV: you finally found your niche' },
  { id: 'tt-3', platform: 'tiktok', date: d(8), views: 201000, likes: 29000, comments: 1400, shares: 5100, saves: 0, engagementRate: 17.66, title: '5 clips every creator needs to make' },
  { id: 'tt-4', platform: 'tiktok', date: d(12), views: 65000, likes: 7200, comments: 310, shares: 900, saves: 0, engagementRate: 12.94, title: 'Behind the scenes editing session' },
  { id: 'tt-5', platform: 'tiktok', date: d(18), views: 312000, likes: 44000, comments: 2100, shares: 8900, saves: 0, engagementRate: 17.62, title: 'The hook that gets 10x more views' },
  { id: 'tt-6', platform: 'tiktok', date: d(24), views: 88000, likes: 10200, comments: 480, shares: 1400, saves: 0, engagementRate: 13.73, title: 'Day in my life as a content creator' },
  { id: 'tt-7', platform: 'tiktok', date: d(30), views: 175000, likes: 22000, comments: 980, shares: 3800, saves: 0, engagementRate: 15.30, title: 'Why your clips are not going viral' },
  { id: 'tt-8', platform: 'tiktok', date: d(45), views: 52000, likes: 5800, comments: 240, shares: 720, saves: 0, engagementRate: 12.99, title: 'Trending audio you need to use now' },
  { id: 'tt-9', platform: 'tiktok', date: d(60), views: 124000, likes: 15600, comments: 710, shares: 2400, saves: 0, engagementRate: 14.93, title: 'I posted every day for 30 days' },
  { id: 'tt-10', platform: 'tiktok', date: d(75), views: 390000, likes: 56000, comments: 2800, shares: 11200, saves: 0, engagementRate: 18.00, title: 'How I got 100k followers in 60 days' },

  // Instagram
  { id: 'ig-1', platform: 'instagram', date: d(2), views: 54000, likes: 4200, comments: 310, shares: 680, saves: 1900, engagementRate: 12.76, title: 'Best tools for short-form content in 2024' },
  { id: 'ig-2', platform: 'instagram', date: d(5), views: 38000, likes: 3100, comments: 195, shares: 420, saves: 1100, engagementRate: 12.67, title: 'Reels that grew my account 40%' },
  { id: 'ig-3', platform: 'instagram', date: d(9), views: 71000, likes: 5900, comments: 420, shares: 940, saves: 2600, engagementRate: 13.89, title: 'Caption hack for 3x more saves' },
  { id: 'ig-4', platform: 'instagram', date: d(15), views: 29000, likes: 2200, comments: 130, shares: 300, saves: 780, engagementRate: 11.76, title: 'Aesthetic transition tutorial' },
  { id: 'ig-5', platform: 'instagram', date: d(21), views: 88000, likes: 7400, comments: 560, shares: 1200, saves: 3300, engagementRate: 14.16, title: 'How I batch record 30 days of content' },
  { id: 'ig-6', platform: 'instagram', date: d(35), views: 44000, likes: 3500, comments: 220, shares: 510, saves: 1400, engagementRate: 12.57, title: 'The algorithm shift nobody is talking about' },
  { id: 'ig-7', platform: 'instagram', date: d(50), views: 62000, likes: 5100, comments: 380, shares: 820, saves: 2200, engagementRate: 13.71, title: 'Viral audio list for this month' },
  { id: 'ig-8', platform: 'instagram', date: d(70), views: 31000, likes: 2400, comments: 150, shares: 340, saves: 900, engagementRate: 12.23, title: 'Editing presets for warm tones' },

  // LinkedIn
  { id: 'li-1', platform: 'linkedin', date: d(2), views: 18400, likes: 1240, comments: 184, shares: 320, saves: 0, engagementRate: 9.48, title: 'How content creators are building B2B audiences' },
  { id: 'li-2', platform: 'linkedin', date: d(6), views: 12100, likes: 810, comments: 112, shares: 198, saves: 0, engagementRate: 9.26, title: '3 LinkedIn hooks that outperform everything' },
  { id: 'li-3', platform: 'linkedin', date: d(11), views: 24700, likes: 1680, comments: 251, shares: 440, saves: 0, engagementRate: 9.60, title: 'Why short-form video is underrated on LinkedIn' },
  { id: 'li-4', platform: 'linkedin', date: d(17), views: 9800, likes: 620, comments: 88, shares: 155, saves: 0, engagementRate: 8.80, title: 'Documenting vs. creating content strategy' },
  { id: 'li-5', platform: 'linkedin', date: d(28), views: 31200, likes: 2100, comments: 318, shares: 560, saves: 0, engagementRate: 9.55, title: 'I analyzed 500 viral clips. Here is what I found' },
  { id: 'li-6', platform: 'linkedin', date: d(40), views: 15600, likes: 1050, comments: 148, shares: 270, saves: 0, engagementRate: 9.41, title: 'The personal brand flywheel explained' },
  { id: 'li-7', platform: 'linkedin', date: d(55), views: 22000, likes: 1490, comments: 222, shares: 395, saves: 0, engagementRate: 9.58, title: 'Short-form video ROI for B2B brands' },

  // Twitter/X
  { id: 'tw-1', platform: 'twitter', date: d(1), views: 82000, likes: 3200, comments: 480, shares: 1100, saves: 620, engagementRate: 6.59, title: 'Thread: everything I know about going viral' },
  { id: 'tw-2', platform: 'twitter', date: d(3), views: 55000, likes: 2100, comments: 310, shares: 720, saves: 390, engagementRate: 6.40, title: 'Hot take: quantity beats quality in year one' },
  { id: 'tw-3', platform: 'twitter', date: d(7), views: 134000, likes: 5400, comments: 820, shares: 1900, saves: 1100, engagementRate: 6.88, title: 'The creator economy is not dying, it is maturing' },
  { id: 'tw-4', platform: 'twitter', date: d(13), views: 41000, likes: 1600, comments: 235, shares: 540, saves: 290, engagementRate: 6.50, title: 'Stop sleeping on repurposing your content' },
  { id: 'tw-5', platform: 'twitter', date: d(20), views: 198000, likes: 8200, comments: 1240, shares: 2900, saves: 1700, engagementRate: 7.09, title: 'I built a $10k/month creator business. Here is how' },
  { id: 'tw-6', platform: 'twitter', date: d(33), views: 67000, likes: 2700, comments: 400, shares: 920, saves: 510, engagementRate: 6.76, title: 'Your first 1000 followers are the hardest' },
  { id: 'tw-7', platform: 'twitter', date: d(48), views: 45000, likes: 1800, comments: 265, shares: 610, saves: 340, engagementRate: 6.70, title: 'Clip strategy that works across every platform' },
  { id: 'tw-8', platform: 'twitter', date: d(65), views: 112000, likes: 4500, comments: 680, shares: 1600, saves: 940, engagementRate: 6.89, title: 'Six-figure creator starter pack' },

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
