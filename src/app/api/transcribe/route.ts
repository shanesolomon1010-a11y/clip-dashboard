import { NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AssemblyAI API key not configured' }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Upload the file to AssemblyAI
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: apiKey },
    body: file,
  });
  if (!uploadRes.ok) {
    return NextResponse.json({ error: 'Upload to AssemblyAI failed' }, { status: 500 });
  }
  const { upload_url } = await uploadRes.json() as { upload_url: string };

  // Submit transcription job
  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url }),
  });
  if (!transcriptRes.ok) {
    return NextResponse.json({ error: 'Failed to start transcription' }, { status: 500 });
  }
  const { id } = await transcriptRes.json() as { id: string };

  // Poll until complete
  while (true) {
    await new Promise<void>((r) => setTimeout(r, 2500));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: apiKey },
    });
    const data = await pollRes.json() as { status: string; text?: string; error?: string };
    if (data.status === 'completed') {
      return NextResponse.json({ text: data.text ?? '' });
    }
    if (data.status === 'error') {
      return NextResponse.json({ error: data.error ?? 'Transcription failed' }, { status: 500 });
    }
  }
}
