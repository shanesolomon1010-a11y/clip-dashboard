export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return new Response('Missing url', { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new Response('Invalid url', { status: 400 })
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
    return new Response('URL not allowed', { status: 400 })
  }

  const rangeHeader = request.headers.get('range')

  const fetchHeaders: HeadersInit = {}
  if (rangeHeader) fetchHeaders['range'] = rangeHeader

  const upstream = await fetch(url, { headers: fetchHeaders })

  const responseHeaders = new Headers()
  responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'video/mp4')
  responseHeaders.set('Accept-Ranges', 'bytes')
  responseHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin')
  responseHeaders.set('Access-Control-Allow-Origin', '*')

  const contentRange = upstream.headers.get('content-range')
  const contentLength = upstream.headers.get('content-length')
  if (contentRange) responseHeaders.set('Content-Range', contentRange)
  if (contentLength) responseHeaders.set('Content-Length', contentLength)

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
