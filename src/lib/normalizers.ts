import Papa from 'papaparse';
import { Platform, UnifiedPost } from '@/types';
import { parseHMStoSeconds } from './utils';

type RawRow = Record<string, string>;

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseOptNum(val: string | undefined): number | undefined {
  if (!val || val.trim() === '') return undefined;
  const n = parseFloat(val.replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function calcEngagement(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  saves: number
): number {
  if (views === 0) return 0;
  const interactions = likes + comments + shares + saves;
  return parseFloat(((interactions / views) * 100).toFixed(2));
}

// ── Instagram ────────────────────────────────────────────────────────────────
function normalizeInstagram(rows: RawRow[]): Omit<UnifiedPost, 'id'>[] {
  return rows.map((row, i) => {
    const plays = parseNum(row['plays']);
    const views = plays || parseNum(row['reach']);
    const likes = parseNum(row['likes']);
    const comments = parseNum(row['comments']);
    const shares = parseNum(row['shares']);
    const saves = parseNum(row['saves']);
    const engagementRateRaw = parseOptNum(row['engagement_rate']);
    return {
      clip_code: row['clip_code'] || undefined,
      platform: 'instagram' as Platform,
      date: (row['posted_at'] || new Date().toISOString()).slice(0, 10),
      title: row['title'] || `Instagram Post ${i + 1}`,
      content_type: row['content_type'] || undefined,
      url: row['url'] || undefined,
      views,
      likes,
      comments,
      shares,
      saves,
      engagementRate: engagementRateRaw ?? calcEngagement(views, likes, comments, shares, saves),
      // Instagram-specific
      plays: parseOptNum(row['plays']),
      reach: parseOptNum(row['reach']),
      impressions: parseOptNum(row['impressions']),
      profile_visits: parseOptNum(row['profile_visits']),
      follows: parseOptNum(row['follows']),
      accounts_reached: parseOptNum(row['accounts_reached']),
      accounts_engaged: parseOptNum(row['accounts_engaged']),
      engagement_rate: engagementRateRaw,
    };
  });
}

// ── YouTube ───────────────────────────────────────────────────────────────────
function parsePublishDate(val: string | undefined): string {
  if (!val || val.trim() === '') return new Date().toISOString().slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function normalizeYouTube(rows: RawRow[]): Omit<UnifiedPost, 'id'>[] {
  return rows.map((row, i) => {
    const contentId = row['content_id'] || row['video_id'] || undefined;
    const views = parseNum(row['views'] || row['Views'] || row['total_views']);
    const likes = parseNum(row['likes'] || row['Likes']);
    const comments = parseNum(row['comments'] || row['Comments added']);
    const shares = parseNum(row['shares'] || row['Shares']);
    const watchTimeHoursRaw = row['watch_time_hours'] || row['Watch time (hours)'];
    const watchTimeHours = parseOptNum(watchTimeHoursRaw);
    const avgViewDurSecondsRaw = row['avg_view_duration_seconds'];
    const avgViewDurHMSRaw = row['Average view duration'] || row['average_view_duration'];
    return {
      clip_code: row['clip_code'] || row['clip_id'] || undefined,
      stat_date: (row['stat_date'] || row['date'] || new Date().toISOString()).slice(0, 10),
      content_id: contentId,
      platform: (row['platform'] ? row['platform'].toLowerCase() : 'youtube') as Platform,
      date: parsePublishDate(row['video_publish_time']),
      title: row['video_title'] || `YouTube Short ${i + 1}`,
      url: contentId ? `https://www.youtube.com/shorts/${contentId}` : undefined,
      views,
      likes,
      comments,
      shares,
      saves: 0,
      engagementRate: calcEngagement(views, likes, comments, shares, 0),
      // YouTube daily stat fields
      duration_seconds: parseOptNum(row['duration_seconds']) !== undefined ? Math.round(parseNum(row['duration_seconds'])) : undefined,
      daily_engaged_views: parseOptNum(row['daily_engaged_views'] || row['Engaged views']),
      total_engaged_views: parseOptNum(row['total_engaged_views']),
      watch_time_hours: watchTimeHours,
      watch_time_minutes: watchTimeHours !== undefined ? watchTimeHours * 60 : parseOptNum(row['watch_time_minutes']),
      avg_view_duration_seconds: avgViewDurSecondsRaw
        ? parseOptNum(avgViewDurSecondsRaw)
        : (avgViewDurHMSRaw ? parseHMStoSeconds(avgViewDurHMSRaw) : undefined),
      avg_view_percentage: parseOptNum(row['avg_view_percentage'] || row['Average percentage viewed (%)'] || row['average_percentage_viewed']),
      impressions: parseOptNum(row['impressions'] || row['Impressions']),
      impression_ctr: parseOptNum(row['impression_ctr'] || row['impressions_ctr'] || row['Impressions click-through rate (%)']),
      unique_viewers: parseOptNum(row['unique_viewers']),
      subscribers_gained: parseOptNum(row['subscribers_gained'] || row['Subscribers gained']),
      subscribers_lost: parseOptNum(row['subscribers_lost'] || row['Subscribers lost']),
      youtube_premium_views: parseOptNum(row['youtube_premium_views'] || row['YouTube Premium views']),
      dislikes: parseOptNum(row['dislikes']),
      stayed_to_watch_pct: parseOptNum(row['stayed_to_watch_pct']),
      new_viewers: parseOptNum(row['new_viewers']),
      returning_viewers: parseOptNum(row['returning_viewers']),
      casual_viewers: parseOptNum(row['casual_viewers']),
      regular_viewers: parseOptNum(row['regular_viewers']),
      hypes: parseOptNum(row['hypes']),
      hype_points: parseOptNum(row['hype_points']),
      post_subscribers: parseOptNum(row['post_subscribers']),
    };
  });
}

// ── CSV Preview ───────────────────────────────────────────────────────────────
export function parseCSVPreview(
  file: File,
  onComplete: (headers: string[], rows: RawRow[]) => void,
  onError: (msg: string) => void
): void {
  Papa.parse<RawRow>(file, {
    header: true,
    skipEmptyLines: true,
    preview: 3,
    complete(results) {
      const headers = results.meta.fields ?? [];
      if (headers.length === 0) {
        onError('Could not parse CSV headers.');
        return;
      }
      onComplete(headers, results.data);
    },
    error(err) {
      onError(err.message);
    },
  });
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
export function parseCSV(
  file: File,
  platform: Platform,
  onComplete: (posts: UnifiedPost[]) => void,
  onError: (msg: string) => void
): void {
  Papa.parse<RawRow>(file, {
    header: true,
    skipEmptyLines: true,
    complete(results) {
      const rows = results.data;
      let normalized: Omit<UnifiedPost, 'id'>[];
      switch (platform) {
        case 'instagram': normalized = normalizeInstagram(rows); break;
        case 'youtube':   normalized = normalizeYouTube(rows); break;
      }

      const posts: UnifiedPost[] = normalized.map((p, i) => ({
        ...p,
        id: `${platform}-${slugify(p.title)}-${i}-${Date.now()}`,
      }));

      onComplete(posts);
    },
    error(err) {
      onError(err.message);
    },
  });
}
