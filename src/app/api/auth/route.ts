import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
