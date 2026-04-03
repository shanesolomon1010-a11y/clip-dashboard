import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { upsertPosts } from '@/lib/db';
import type { UnifiedPost } from '@/types';

interface YouTubeAuthRow {
  id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
}

interface AnalyticsResponse {
  rows?: (string | number)[][];
}

async function getValidAccessToken(): Promise<string> {
  const { data: auth, error } = await supabase
    .from('youtube_auth')
    .select('id, access_token, refresh_token, token_expiry')
    .maybeSingle();

  if (error || !auth) throw new Error('No YouTube auth found. Connect via Settings.');

  const isExpired = new Date((auth as YouTubeAuthRow).token_expiry) <= new Date(Date.now() + 60_000);
  if (!isExpired) return (auth as YouTubeAuthRow).access_token;

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: (auth as YouTubeAuthRow).refresh_token,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!refreshRes.ok) throw new Error('Token refresh failed');

  const refreshed = await refreshRes.json() as { access_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from('youtube_auth')
    .update({
      access_token: refreshed.access_token,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', (auth as YouTubeAuthRow).id);

  return refreshed.access_token;
}

export async function POST(): Promise<NextResponse> {
  try {
    const accessToken = await getValidAccessToken();

    const { data: videoRows, error: videoError } = await supabase
      .from('posts')
      .select('content_id, clip_code')
      .eq('platform', 'youtube')
      .not('content_id', 'is', null);

    if (videoError) throw videoError;

    const videoMap = new Map<string, string>();
    for (const row of (videoRows ?? [])) {
      const contentId = row.content_id as string;
      const clipCode = row.clip_code as string;
      if (contentId && clipCode && !videoMap.has(contentId)) {
        videoMap.set(contentId, clipCode);
      }
    }

    if (videoMap.size === 0) {
      return NextResponse.json({ success: true, rowsUpserted: 0 });
    }

    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const metrics = [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'impressions',
      'impressionClickThroughRate',
      'likes',
      'dislikes',
      'shares',
      'comments',
      'subscribersGained',
      'subscribersLost',
    ].join(',');

    const allPosts: UnifiedPost[] = [];

    for (const [contentId, clipCode] of Array.from(videoMap.entries())) {
      const params = new URLSearchParams({
        ids: 'channel==MINE',
        startDate,
        endDate: today,
        metrics,
        dimensions: 'day,video',
        filters: `video==${contentId}`,
      });

      const res = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) continue;

      const data = await res.json() as AnalyticsResponse;
      if (!data.rows) continue;

      for (const row of data.rows) {
        const statDate = row[0] as string;
        // row[1] is the video dimension — skip, we already have contentId
        const views                 = Number(row[2]);
        const estimatedMinutes      = Number(row[3]);
        const avgViewDuration       = Number(row[4]);
        const avgViewPercentage     = Number(row[5]);
        const impressions           = Number(row[6]);
        const impressionCtr         = Number(row[7]);
        const likes                 = Number(row[8]);
        const dislikes              = Number(row[9]);
        const shares                = Number(row[10]);
        const comments              = Number(row[11]);
        const subscribersGained     = Number(row[12]);
        const subscribersLost       = Number(row[13]);

        allPosts.push({
          id: `${contentId}_${statDate}`,
          clip_code: clipCode,
          content_id: contentId,
          platform: 'youtube',
          date: statDate,
          stat_date: statDate,
          content_type: 'short',
          title: '',
          views,
          likes,
          dislikes,
          comments,
          shares,
          saves: 0,
          engagementRate: 0,
          watch_time_hours: estimatedMinutes / 60,
          watch_time_minutes: estimatedMinutes,
          avg_view_duration_seconds: avgViewDuration,
          avg_view_percentage: avgViewPercentage,
          impressions,
          impression_ctr: impressionCtr,
          subscribers_gained: subscribersGained,
          subscribers_lost: subscribersLost,
        });
      }
    }

    if (allPosts.length > 0) {
      await upsertPosts(allPosts);
    }

    return NextResponse.json({ success: true, rowsUpserted: allPosts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
