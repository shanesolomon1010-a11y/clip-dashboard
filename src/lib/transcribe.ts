export async function transcribeAudio(file: File): Promise<string> {
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: process.env.NEXT_PUBLIC_ASSEMBLYAI_API_KEY! },
    body: file
  });
  const { upload_url } = await uploadRes.json();

  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: process.env.NEXT_PUBLIC_ASSEMBLYAI_API_KEY!,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ audio_url: upload_url })
  });
  const { id } = await transcriptRes.json();

  while (true) {
    await new Promise(r => setTimeout(r, 2500));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: process.env.NEXT_PUBLIC_ASSEMBLYAI_API_KEY! }
    });
    const data = await pollRes.json();
    if (data.status === 'completed') return data.text;
    if (data.status === 'error') throw new Error('Transcription failed');
  }
}
