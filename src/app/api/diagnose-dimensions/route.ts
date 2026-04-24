import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/youtube';

const VIDEO_ID = '6dMQ7EyATRU';
const METRICS = 'views,estimatedMinutesWatched,averageViewDuration';
const FAILING_DIMS = ['country', 'ageGroup', 'gender', 'playbackLocationType'];

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret || request.headers.get('x-dashboard-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: `Token failed: ${(err as Error).message}` }, { status: 500 });
  }

  async function tryQuery(dimensions: string) {
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    url.searchParams.set('ids', 'channel==MINE');
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
    url.searchParams.set('dimensions', dimensions);
    url.searchParams.set('metrics', METRICS);
    url.searchParams.set('filters', `video==${VIDEO_ID}`);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { status: res.status, body: await res.json() };
  }

  const results: Record<string, { withDay: unknown; dimOnly: unknown }> = {};

  for (const dim of FAILING_DIMS) {
    const [withDay, dimOnly] = await Promise.all([
      tryQuery(`day,${dim}`),
      tryQuery(dim),
    ]);
    results[dim] = { withDay, dimOnly };
  }

  return NextResponse.json({ window: `${startDate} → ${endDate}`, videoId: VIDEO_ID, results });
}
