import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(): Promise<NextResponse> {
  const { data } = await supabase
    .from('youtube_auth')
    .select('refresh_token')
    .maybeSingle();

  return NextResponse.json({ connected: !!(data?.refresh_token) });
}
