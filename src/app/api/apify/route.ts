interface ApifyRequestBody {
  action: 'start' | 'status' | 'results';
  token: string;
  username?: string;
  instagram_session?: string;
  runId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ApifyRequestBody;
  const { action, token, username, instagram_session, runId } = body;

  if (!token) {
    return Response.json({ error: 'token is required' }, { status: 400 });
  }

  if (action === 'start') {
    if (!username) {
      return Response.json({ error: 'username is required for start' }, { status: 400 });
    }

    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          resultsLimit: 50,
          proxy: { useApifyProxy: true },
          sessionCookies: [
            { name: 'sessionid', value: instagram_session ?? '', domain: '.instagram.com' },
          ],
        }),
      }
    );
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Apify start error:', res.status, errorText);
      return Response.json({ error: errorText }, { status: res.status });
    }
    const data = (await res.json()) as { data: { id: string; status: string } };
    return Response.json({ runId: data.data.id, status: data.data.status });
  }

  if (action === 'status') {
    if (!runId) {
      return Response.json({ error: 'runId is required for status' }, { status: 400 });
    }
    const res = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    if (!res.ok) {
      return Response.json({ error: `Apify error: ${res.statusText}` }, { status: res.status });
    }
    const data = (await res.json()) as { data: { status: string } };
    return Response.json({ status: data.data.status });
  }

  if (action === 'results') {
    if (!runId) {
      return Response.json({ error: 'runId is required for results' }, { status: 400 });
    }
    const res = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
    );
    if (!res.ok) {
      return Response.json({ error: `Apify error: ${res.statusText}` }, { status: res.status });
    }
    const items = await res.json();
    return Response.json({ items });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
