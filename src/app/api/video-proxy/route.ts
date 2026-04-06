import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return new NextResponse('Missing url param', { status: 400 });
  }

  const upstream = await fetch(url);
  const contentType = upstream.headers.get('Content-Type') ?? 'video/mp4';

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
