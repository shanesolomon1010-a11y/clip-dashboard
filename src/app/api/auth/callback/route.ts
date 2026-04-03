import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('youtube_auth')
    .select('id')
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('youtube_auth')
      .update({
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        token_expiry: tokenExpiry,
        updated_at: now,
      })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: 'Failed to store tokens' }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('youtube_auth')
      .insert({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokenExpiry,
        updated_at: now,
      });
    if (error) return NextResponse.json({ error: 'Failed to store tokens' }, { status: 500 });
  }

  return NextResponse.redirect('https://clip-dashboard-two.vercel.app/?connected=true');
}
