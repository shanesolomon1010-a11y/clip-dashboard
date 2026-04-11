import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

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
  'tPsydEmTaOo': 'MBM016-CLIP-006',
};

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
  const accessToken = await getAccessToken();

  const videoIds = Object.keys(VIDEO_MAP);
  // YouTube Data API allows up to 50 ids per request
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoIds.join(','));

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

  const results = (data.items ?? []).map((item) => ({
    clip_details_code: VIDEO_MAP[item.id],
    video_id: item.id,
    published_at: item.snippet.publishedAt,
    published_ct: toUsCentral(item.snippet.publishedAt),
  }));

  results.sort((a, b) => a.published_at.localeCompare(b.published_at));

  return NextResponse.json(results);
}
