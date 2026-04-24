export interface SlotPerformance {
  day_of_week: string;
  hour_bucket: string;
  post_count: number;
  avg_views: number;
  median_views: number;
  avg_watch_time_hours: number;
  total_views: number;
  confidence: 'low' | 'medium' | 'high';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayOfWeekFromDateString(isoDate: string): string {
  // Anchor at noon UTC to eliminate timezone ambiguity for all US timezones
  const d = new Date(isoDate + 'T12:00:00Z');
  return DAYS[d.getUTCDay()];
}

function parsePostTimeToHour(postTime: string): number | null {
  if (!postTime) return null;
  // Strip timezone suffix: "6:00 PM CT" → "6:00 PM"
  const stripped = postTime.trim().replace(/\s+[A-Z]{2,4}\s*$/, '');

  // Try 12-hour format: "6:00 PM", "11:30 AM", "12:30 PM"
  const match12 = stripped.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const meridiem = match12[3].toUpperCase();
    // 12 AM = 0, 12 PM = 12, 1-11 AM = 1-11, 1-11 PM = 13-23
    if (meridiem === 'AM' && hour === 12) hour = 0;
    else if (meridiem === 'PM' && hour !== 12) hour += 12;
    return hour;
  }

  // Try 24-hour format: "14:00", "18:30"
  const match24 = stripped.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    if (hour >= 0 && hour < 24) return hour;
  }

  return null;
}

function toHourBucket(hour: number): string {
  if (hour >= 6  && hour <= 10) return 'Morning';
  if (hour >= 11 && hour <= 13) return 'Midday';
  if (hour >= 14 && hour <= 16) return 'Afternoon';
  if (hour >= 17 && hour <= 20) return 'Evening';
  return 'Night'; // 21-23 and 0-5
}

function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 0
    ? Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2)
    : sorted[Math.floor(n / 2)];
}

export function analyzeScheduleSlots(
  scheduledPosts: Record<string, unknown>[],
  posts: Record<string, unknown>[],
): SlotPerformance[] {
  // Build per-clip lifetime totals from the posts table
  const clipViews     = new Map<string, number>();
  const clipWatchTime = new Map<string, number>();
  for (const row of posts) {
    const code = row.clip_details_code as string;
    if (!code) continue;
    clipViews.set(code,     (clipViews.get(code)     ?? 0) + Number(row.views            ?? 0));
    clipWatchTime.set(code, (clipWatchTime.get(code) ?? 0) + Number(row.watch_time_hours ?? 0));
  }

  // Group each scheduled post into its (day, hour_bucket) slot
  const slotViews     = new Map<string, number[]>();
  const slotWatchTime = new Map<string, number[]>();

  for (const sp of scheduledPosts) {
    const clipCode      = sp.clip_code      as string;
    const scheduledDate = sp.scheduled_date as string;
    const postTime      = sp.post_time      as string;
    if (!clipCode || !scheduledDate || !postTime) continue;

    // Only include posts where we have lifetime performance data
    const views = clipViews.get(clipCode);
    if (views === undefined) continue;

    const watchTime = clipWatchTime.get(clipCode) ?? 0;
    const dayOfWeek  = dayOfWeekFromDateString(scheduledDate);
    const hour       = parsePostTimeToHour(postTime);
    if (hour === null) continue;
    const hourBucket = toHourBucket(hour);

    const key = `${dayOfWeek}|${hourBucket}`;
    if (!slotViews.has(key)) {
      slotViews.set(key, []);
      slotWatchTime.set(key, []);
    }
    slotViews.get(key)!.push(views);
    slotWatchTime.get(key)!.push(watchTime);
  }

  const result: SlotPerformance[] = [];
  for (const [key, viewArr] of Array.from(slotViews.entries())) {
    const [day_of_week, hour_bucket] = key.split('|');
    const watchArr    = slotWatchTime.get(key)!;
    const post_count  = viewArr.length;
    const total_views = viewArr.reduce((s, v) => s + v, 0);
    const avg_views   = Math.round(total_views / post_count);
    const sorted      = [...viewArr].sort((a, b) => a - b);
    const median_views = medianSorted(sorted);
    const avg_watch_time_hours =
      Math.round((watchArr.reduce((s, v) => s + v, 0) / post_count) * 100) / 100;
    const confidence: 'low' | 'medium' | 'high' =
      post_count >= 4 ? 'high' : post_count >= 2 ? 'medium' : 'low';

    result.push({
      day_of_week, hour_bucket, post_count,
      avg_views, median_views, avg_watch_time_hours, total_views, confidence,
    });
  }

  return result.sort((a, b) => b.avg_views - a.avg_views);
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function buildRecommendedSchedule(
  slots: SlotPerformance[],
): { day: string; hour_bucket: string; reason: string }[] {
  const byDay = new Map<string, SlotPerformance[]>();
  for (const slot of slots) {
    if (!byDay.has(slot.day_of_week)) byDay.set(slot.day_of_week, []);
    byDay.get(slot.day_of_week)!.push(slot);
  }

  const daysWithData = byDay.size;
  const result: { day: string; hour_bucket: string; reason: string }[] = [];

  for (const day of DAY_ORDER) {
    const daySlots = byDay.get(day);
    if (!daySlots || daySlots.length === 0) {
      // Only surface "no data" gaps when we have enough coverage to make it meaningful
      if (daysWithData >= 4) {
        result.push({ day, hour_bucket: '—', reason: 'No data — test needed' });
      }
      continue;
    }

    const best = daySlots.reduce((a, b) => a.avg_views >= b.avg_views ? a : b);
    const confLabel =
      best.confidence === 'high'   ? 'strong' :
      best.confidence === 'medium' ? 'moderate' : 'limited';

    result.push({
      day,
      hour_bucket: best.hour_bucket,
      reason: `Avg ${best.avg_views.toLocaleString()} views across ${best.post_count} post${best.post_count !== 1 ? 's' : ''} — ${confLabel} confidence`,
    });
  }

  return result;
}
