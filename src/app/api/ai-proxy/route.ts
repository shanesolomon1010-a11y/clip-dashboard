import { NextResponse } from 'next/server';

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const body = await request.json() as AnthropicRequestBody;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
