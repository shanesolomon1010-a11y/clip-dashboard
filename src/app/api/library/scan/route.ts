import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractClipDetailsCode(filename: string): string {
  const basename = (filename.split('/').pop() ?? filename).replace(/\.[^.]+$/, '');
  const parts = basename.split('-');
  return parts.slice(0, 3).join('-');
}

export async function POST(): Promise<NextResponse> {
  const bucketName = 'Clips';

  // List all files recursively in the Clips bucket
  const { data: files, error: listError } = await supabase.storage
    .from('Clips')
    .list('', { limit: 1000, offset: 0 });

  console.log('Scan bucket:', bucketName);
  console.log('Storage list data:', JSON.stringify(files, null, 2));
  console.log('Storage list error:', JSON.stringify(listError, null, 2));

  if (listError) {
    return NextResponse.json({ bucketName, rawData: null, rawError: listError, error: listError.message }, { status: 500 });
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

  let inserted = 0;
  let skipped = 0;

  for (const path of allPaths) {
    const clipDetailsCode = extractClipDetailsCode(path);

    const { data: urlData } = supabase.storage
      .from('Clips')
      .getPublicUrl(path);
    const video_url = urlData.publicUrl;

    const { error: upsertError } = await supabase
      .from('clip_versions')
      .upsert(
        { clip_details_code: clipDetailsCode, video_url, version_number: 1 },
        { onConflict: 'clip_details_code,version_number', ignoreDuplicates: true }
      );

    if (upsertError) {
      skipped++;
    } else {
      inserted++;
    }
  }

  return NextResponse.json({ inserted, skipped, total: allPaths.length, bucketName, rawData: files, rawError: listError });
}
