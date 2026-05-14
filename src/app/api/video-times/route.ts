import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/youtube';
import { getShortsRegistry } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface YouTubeVideoItem {
  id: string;
  snippet: {
    publishedAt: string;
  };
}

interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
  error?: { message: string };
}

function toUsCentral(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export async function GET() {
  const registry = await getShortsRegistry();
  const codeByContentId = new Map(
    registry
      .filter((r) => r.clip_code !== 'PENDING')
      .map((r) => [r.content_id, r.clip_details_code]),
  );
  const videoIds = Array.from(codeByContentId.keys());

  const accessToken = await getAccessToken();

  const items: YouTubeVideoItem[] = [];
  const BATCH = 50;
  for (let i = 0; i < videoIds.length; i += BATCH) {
    const batch = videoIds.slice(i, i + BATCH);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', batch.join(','));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as YouTubeVideosResponse;

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? `YouTube API error ${res.status}` },
        { status: res.status }
      );
    }

    items.push(...(data.items ?? []));
  }

  const results = items.map((item) => ({
    clip_details_code: codeByContentId.get(item.id),
    video_id: item.id,
    published_at: item.snippet.publishedAt,
    published_ct: toUsCentral(item.snippet.publishedAt),
  }));

  results.sort((a, b) => a.published_at.localeCompare(b.published_at));

  return NextResponse.json(results);
}
