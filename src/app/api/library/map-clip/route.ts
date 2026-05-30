import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CODE_RE = /^MBM\d+-CLIP-\d+$/;

function asTrimmedOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret || request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { p_code?: unknown; p_yt_video_id?: unknown; p_ig_content_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const p_code = asTrimmedOrNull(body.p_code) ?? '';
  const p_yt_video_id = asTrimmedOrNull(body.p_yt_video_id);
  const p_ig_content_id = asTrimmedOrNull(body.p_ig_content_id);

  if (!CODE_RE.test(p_code)) {
    return NextResponse.json(
      { error: 'p_code must match MBM###-CLIP-### (e.g. MBM015-CLIP-014)' },
      { status: 400 },
    );
  }
  if (p_yt_video_id === null && p_ig_content_id === null) {
    return NextResponse.json(
      { error: 'At least one of p_yt_video_id / p_ig_content_id is required' },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // map_clip is the canonical atomic mapper: it frees each UNIQUE identity
  // column before claiming it on the MBM row and RAISEs on any half-state, so a
  // partial mapping can never persist (supabase/migrations/20260529_clip_mapping_integrity.sql).
  const { data, error } = await supabase.rpc('map_clip', {
    p_code,
    p_yt_video_id,
    p_ig_content_id,
  });

  if (error) {
    // Surface map_clip's RAISE text (e.g. the half-state guard) verbatim.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // map_clip returns jsonb { code, posts_rekeyed, pending_deleted }.
  return NextResponse.json(data);
}
