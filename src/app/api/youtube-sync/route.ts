import { NextResponse } from 'next/server';
import { runYouTubeSync } from '@/lib/youtube-sync';

export async function POST(): Promise<NextResponse> {
  try {
    const rowsProcessed = await runYouTubeSync();
    return NextResponse.json({ rowsProcessed });
  } catch (err) {
    console.error('youtube-sync error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
