interface AnalyticsRow {
  date: string;
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface AnalyticsResponse {
  columnHeaders?: { name: string; columnType: string; dataType: string }[];
  rows?: (string | number)[][];
  error?: { message: string };
}

export async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json() as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(`Failed to get YouTube access token: ${data.error ?? res.status}`);
  }
  return data.access_token;
}

export async function fetchAnalyticsForVideo(
  videoId: string,
  startDate: string,
  endDate: string,
  accessToken: string
): Promise<AnalyticsRow[]> {
  const metrics = [
    'views',
    'likes',
    'dislikes',
    'comments',
    'shares',
    'estimatedMinutesWatched',
    'averageViewDuration',
    'averageViewPercentage',
    'subscribersGained',
    'subscribersLost',
  ].join(',');

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', metrics);
  url.searchParams.set('dimensions', 'day');
  url.searchParams.set('filters', `video==${videoId}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json() as AnalyticsResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error for ${videoId}: ${data.error?.message ?? res.status}`);
  }

  const headers = (data.columnHeaders ?? []).map((h) => h.name);
  const idx = (name: string) => headers.indexOf(name);

  return (data.rows ?? []).map((row) => ({
    date:                    row[idx('day')] as string,
    views:                   Number(row[idx('views')]),
    likes:                   Number(row[idx('likes')]),
    dislikes:                Number(row[idx('dislikes')]),
    comments:                Number(row[idx('comments')]),
    shares:                  Number(row[idx('shares')]),
    estimatedMinutesWatched: Number(row[idx('estimatedMinutesWatched')]),
    averageViewDuration:     Number(row[idx('averageViewDuration')]),
    averageViewPercentage:   Number(row[idx('averageViewPercentage')]),
    subscribersGained:       Number(row[idx('subscribersGained')]),
    subscribersLost:         Number(row[idx('subscribersLost')]),
  }));
}

export interface VideoMetadata {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

interface VideoMetadataResponse {
  items?: {
    id: string;
    snippet: {
      title: string;
      publishedAt: string;
      thumbnails: {
        maxres?: { url: string };
        high?: { url: string };
      };
    };
    contentDetails: {
      duration: string;
    };
  }[];
  error?: { message: string };
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

export async function fetchVideoMetadata(
  videoIds: string[],
  accessToken: string
): Promise<Map<string, VideoMetadata>> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('part', 'snippet,contentDetails');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json() as VideoMetadataResponse;
  if (!res.ok) {
    throw new Error(`YouTube Data API error: ${data.error?.message ?? res.status}`);
  }

  const returned = new Set((data.items ?? []).map((item) => item.id));
  const missing = videoIds.filter((id) => !returned.has(id));
  if (missing.length > 0) {
    console.warn(`[youtube-metadata] missing ${missing.length} video(s):`, missing.join(', '));
  }

  const map = new Map<string, VideoMetadata>();
  for (const item of data.items ?? []) {
    const { thumbnails } = item.snippet;
    map.set(item.id, {
      videoId: item.id,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/shorts/${item.id}`,
      thumbnailUrl: thumbnails.maxres?.url ?? thumbnails.high?.url ?? null,
      durationSeconds: parseDurationSeconds(item.contentDetails.duration),
    });
  }

  return map;
}
