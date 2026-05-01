/**
 * One-off backfill: fill scheduled_posts with clips published Apr 22-30, 2026.
 *
 * For each YouTube Short in VIDEO_MAP whose publishedAt falls in the range,
 * inserts both a `yt` and an `ig` row (the channel cross-posts on the same
 * day at the same time). post_time is the CT half-hour nearest the actual
 * publish time. Skips rows that already exist for the same
 * (clip_code, platform, scheduled_date) tuple, so re-runs are no-ops.
 *
 * Run: `npx tsx scripts/fill-posting-schedule.ts`
 * (uses .env.local for NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and YOUTUBE_API_KEY)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const RANGE_START_UTC = '2026-04-22T00:00:00Z';
const RANGE_END_UTC = '2026-04-30T23:59:59Z';

const PLATFORMS = ['yt', 'ig'] as const;
type Platform = typeof PLATFORMS[number];

// VIDEO_MAP is duplicated here intentionally — the production file in
// src/lib/youtube-sync.ts does not export it and we were instructed not to
// modify production code. This is a one-off backfill.
const VIDEO_MAP: Record<string, string> = {
  '6dMQ7EyATRU': 'MBM015-CLIP-014',
  'UPyNkTKaraU': 'MBM015-CLIP-004',
  'ZgkpBit9UA0': 'MBM015-CLIP-009',
  'E2Fgd_6BJIE': 'MBM015-CLIP-008',
  '2gKSLs2-Nss': 'MBM015-CLIP-012',
  'DUpRLsIQGmA': 'MBM015-CLIP-011',
  'O9emVLO6n2U': 'MBM015-CLIP-013',
  'VpxBnfeKLi8': 'MBM015-CLIP-007',
  'SU-sXevLe64': 'MBM015-CLIP-010',
  'f1MhMrQswjg': 'MBM015-CLIP-016',
  'wWrk066VHqM': 'MBM015-CLIP-017',
  'fNp7epYo6wA': 'MBM015-CLIP-018',
  'BwN_zCjtAVc': 'MBM015-CLIP-019',
  'a6PHBY2cq5Q': 'MBM015-CLIP-020',
  'BjAdnIfIls4': 'MBM015-CLIP-021',
  'XaQfjuTzdDE': 'MBM015-CLIP-022',
  'a3bRUFpilGI': 'MBM016-CLIP-001',
  'JJI4swcaLJQ': 'MBM016-CLIP-003',
  'QYcNH8fKXTs': 'MBM016-CLIP-004',
  'VH42AvIjbk0': 'MBM016-CLIP-005',
  'tPsydEmTaOo': 'MBM016-CLIP-006',
  'OKyFroQrWwM': 'MBM016-CLIP-007',
  '51DR6H8GQBc': 'MBM016-CLIP-009',
  'AqtzZNYdxTE': 'MBM016-CLIP-010',
  'kXt894vwO1c': 'MBM016-CLIP-011',
  'pkPSikierRM': 'MBM016-CLIP-012',
  '-cXhRAIu_AE': 'MBM016-CLIP-013',
  'CGQryafzaAY': 'MBM016-CLIP-014',
  'X6v-cvX2tew': 'MBM017-CLIP-001',
  '5SImwiVgWWA': 'MBM017-CLIP-002',
  'h_7_Px7r3F4': 'MBM018-CLIP-001',
  'WtNnx5gq7Bg': 'MBM018-CLIP-002',
  'qbtCA5s5D3U': 'MBM018-CLIP-004',
  'T2-rVxCfgXo': 'MBM019-CLIP-001',
  '8jW7vDDSWb4': 'MBM019-CLIP-002',
  'iXS-UcuSrpY': 'MBM020-CLIP-001',
  'EuC0d-68ghI': 'MBM020-CLIP-002',
  '1xZgYwL3e7g': 'MBM021-CLIP-002',
};

interface VideoItem {
  id: string;
  snippet: { title: string; publishedAt: string };
  status?: { privacyStatus?: string };
}

interface VideoListResponse {
  items?: VideoItem[];
  error?: { message: string };
}

interface ScheduledRow {
  clip_code: string;
  title: string;
  platform: Platform;
  scheduled_date: string;
  post_time: string;
  status: string;
  content_type: string;
}

async function fetchVideoMetadata(videoIds: string[], apiKey: string): Promise<VideoItem[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('part', 'snippet,contentDetails,status');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  const data = (await res.json()) as VideoListResponse;
  if (!res.ok) throw new Error(`videos.list: ${data.error?.message ?? res.status}`);
  return data.items ?? [];
}

function ctParts(utcIso: string): { date: string; hours: number; minutes: number } {
  const d = new Date(utcIso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hours: Number(get('hour')) % 24,
    minutes: Number(get('minute')),
  };
}

function roundedHalfHourCt(hours: number, minutes: number): string {
  const total = (Math.round((hours * 60 + minutes) / 30) * 30) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const display12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display12}:${String(m).padStart(2, '0')} ${period} CT`;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing');
  if (!apiKey) throw new Error('YOUTUBE_API_KEY missing');

  const supabase = createClient(supabaseUrl, supabaseKey);

  const ids = Object.keys(VIDEO_MAP);
  const allItems: VideoItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const items = await fetchVideoMetadata(ids.slice(i, i + 50), apiKey);
    allItems.push(...items);
  }

  const inRange = allItems
    .filter((it) => it.snippet.publishedAt >= RANGE_START_UTC && it.snippet.publishedAt <= RANGE_END_UTC)
    .sort((a, b) => a.snippet.publishedAt.localeCompare(b.snippet.publishedAt));

  console.log(`Found ${inRange.length} clips in range [${RANGE_START_UTC} .. ${RANGE_END_UTC}]`);

  const candidates: ScheduledRow[] = [];
  for (const it of inRange) {
    const clipCode = VIDEO_MAP[it.id];
    const { date, hours, minutes } = ctParts(it.snippet.publishedAt);
    const postTime = roundedHalfHourCt(hours, minutes);
    for (const platform of PLATFORMS) {
      candidates.push({
        clip_code: clipCode,
        title: it.snippet.title,
        platform,
        scheduled_date: date,
        post_time: postTime,
        status: 'scheduled',
        content_type: 'short',
      });
    }
  }

  const clipCodes = Array.from(new Set(candidates.map((c) => c.clip_code)));
  const dates = Array.from(new Set(candidates.map((c) => c.scheduled_date)));
  const { data: existing, error: existErr } = await supabase
    .from('scheduled_posts')
    .select('clip_code, platform, scheduled_date')
    .in('clip_code', clipCodes)
    .in('scheduled_date', dates);
  if (existErr) throw existErr;

  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.clip_code}|${r.platform}|${r.scheduled_date}`),
  );

  const toInsert = candidates.filter(
    (c) => !existingKeys.has(`${c.clip_code}|${c.platform}|${c.scheduled_date}`),
  );
  const skipped = candidates.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`Nothing to insert. ${skipped} candidate row(s) already exist. Done.`);
    return;
  }

  const { error: insertErr } = await supabase.from('scheduled_posts').insert(toInsert);
  if (insertErr) throw insertErr;

  for (const r of toInsert) {
    console.log(`  + ${r.scheduled_date}  ${r.platform}  ${r.clip_code}  ${r.post_time}`);
  }

  console.log(`\nInserted ${toInsert.length} rows. Skipped ${skipped} existing.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
