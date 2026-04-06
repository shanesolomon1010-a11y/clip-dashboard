import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key so storage listing works server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function extractClipDetailsCode(filename: string): string {
  // Strip path prefix (e.g. "MBM015-CLIP-004/v1_1234.mp4" → "MBM015-CLIP-004")
  const basename = filename.split('/').pop() ?? filename;
  // Strip extension and version prefix (e.g. "v1_1234.mp4" → keep raw, fall back to stem)
  const stem = basename.replace(/\.[^.]+$/, '');
  // If filename itself looks like a clip code (e.g. "MBM015-CLIP-004.mp4"), use the stem
  // Otherwise if it's a versioned filename like "v1_timestamp", use parent folder
  if (/^[A-Z]+-\d+/.test(stem)) return stem;
  // Fall back: use parent folder as clip_details_code
  const parts = filename.split('/');
  if (parts.length >= 2) return parts[parts.length - 2];
  return stem;
}

export async function POST(): Promise<NextResponse> {
  // List all files recursively in the Clips bucket
  const { data: files, error: listError } = await supabaseAdmin.storage
    .from('Clips')
    .list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  // Flatten: top-level may be folders, so list each subfolder too
  const allPaths: string[] = [];

  for (const item of files ?? []) {
    if (item.id === null) {
      // It's a folder — list its contents
      const { data: sub } = await supabaseAdmin.storage
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

    const { data: urlData } = supabaseAdmin.storage
      .from('Clips')
      .getPublicUrl(path);
    const video_url = urlData.publicUrl;

    const { error: upsertError } = await supabaseAdmin
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

  return NextResponse.json({ inserted, skipped, total: allPaths.length });
}
