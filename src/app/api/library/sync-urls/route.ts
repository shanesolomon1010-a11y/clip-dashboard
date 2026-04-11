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

  // List all files in the Clips bucket (including subfolders)
  const { data: files, error: listError } = await supabase.storage
    .from('Clips')
    .list('', { limit: 1000, offset: 0 });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const allPaths: string[] = [];

  for (const item of files ?? []) {
    if (item.id === null) {
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  let updated = 0;
  let skipped = 0;

  for (const path of allPaths) {
    const filename = path.split('/').pop() ?? path;
    const clipDetailsCode = extractClipDetailsCode(filename);
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/Clips/${path}`;

    // Only update rows where video_url is currently null
    const { data, error } = await supabase
      .from('clip_details')
      .update({ video_url: publicUrl })
      .eq('clip_details_code', clipDetailsCode)
      .is('video_url', null)
      .select('clip_details_code');

    if (error) {
      console.error(`sync-urls update error for ${clipDetailsCode}:`, JSON.stringify(error));
    } else if (data && data.length > 0) {
      updated++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ updated, skipped, total: allPaths.length });
}
