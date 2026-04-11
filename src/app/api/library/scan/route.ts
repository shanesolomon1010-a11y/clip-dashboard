import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function extractClipDetailsCode(filename: string): string {
  const basename = (filename.split('/').pop() ?? filename).replace(/\.[^.]+$/, '');
  const parts = basename.split('-');
  return parts.slice(0, 3).join('-');
}

export async function POST(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret || request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // List all files recursively in the Clips bucket
  const { data: files, error: listError } = await supabase.storage
    .from('Clips')
    .list('', { limit: 1000, offset: 0 });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  // Flatten: top-level may be folders, so list each subfolder too
  const allPaths: string[] = [];

  for (const item of files ?? []) {
    if (item.id === null) {
      // It's a folder — list its contents
      const { data: sub } = await supabase.storage
        .from('Clips')
        .list(item.name, { limit: 1000, offset: 0 });
      for (const subItem of sub ?? []) {
        if (subItem.id !== null) {
          allPaths.push(`${item.name}/${subItem.name}`);
        }
      }
    } else {
      allPaths.push(item.name);
    }
  }

  const rows = allPaths.map((path) => {
    const { data: urlData } = supabase.storage.from('Clips').getPublicUrl(path);
    return { clip_details_code: extractClipDetailsCode(path), video_url: urlData.publicUrl, version_number: 1 };
  });

  const { error: upsertError } = await supabase
    .from('clip_versions')
    .upsert(rows, { onConflict: 'clip_details_code,version_number', ignoreDuplicates: true });

  const inserted = upsertError ? 0 : rows.length;
  const skipped = upsertError ? rows.length : 0;

  return NextResponse.json({ inserted, skipped, total: allPaths.length });
}
