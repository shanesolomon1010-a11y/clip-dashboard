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
  impressions: number;
  impressionCtr: number;
  subscribersGained: number;
  subscribersLost: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface AnalyticsResponse {
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
    'impressions',
    'impressionClickThroughRate',
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

  return (data.rows ?? []).map((row) => ({
    date:                    row[0] as string,
    views:                   Number(row[1]),
    likes:                   Number(row[2]),
    dislikes:                Number(row[3]),
    comments:                Number(row[4]),
    shares:                  Number(row[5]),
    estimatedMinutesWatched: Number(row[6]),
    averageViewDuration:     Number(row[7]),
    averageViewPercentage:   Number(row[8]),
    impressions:             Number(row[9]),
    impressionCtr:           Number(row[10]),
    subscribersGained:       Number(row[11]),
    subscribersLost:         Number(row[12]),
  }));
}
