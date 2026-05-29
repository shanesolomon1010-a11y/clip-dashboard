import { NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertInchesToTwip,
} from 'docx';
import { getSocialCopyById } from '@/lib/social-copy-db';

export async function GET(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  if (!idParam) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const id = parseInt(idParam, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'id must be a number' }, { status: 400 });
  }

  const gen = await getSocialCopyById(id);
  if (!gen) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  const dateStr = new Date(gen.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const fileDateStr = new Date(gen.created_at).toISOString().slice(0, 10);

  function sectionParagraphs(label: string, content: string): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: label,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 120 },
      }),
    ];

    // Preserve line breaks for Instagram caption and multi-line content
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: lines[i],
              font: 'Arial',
              size: 24, // 12pt in half-points
            }),
          ],
          spacing: { after: lines[i] === '' ? 0 : 80 },
          alignment: AlignmentType.LEFT,
        }),
      );
    }

    return paragraphs;
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 24 },
        },
        heading2: {
          run: { font: 'Arial', size: 24, bold: true },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
            },
          },
        },
        children: [
          // Document title
          new Paragraph({
            children: [
              new TextRun({
                text: `Social Copy - ${gen.clip_code}`,
                bold: true,
                font: 'Arial',
                size: 36, // 18pt
              }),
            ],
            spacing: { after: 160 },
          }),

          // Subtitle: date + episode context
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${dateStr}`,
                font: 'Arial',
                size: 20, // 10pt
                color: '666666',
              }),
              ...(gen.episode_context
                ? [
                    new TextRun({ text: '  ·  ', font: 'Arial', size: 20, color: '666666' }),
                    new TextRun({ text: gen.episode_context, font: 'Arial', size: 20, color: '666666' }),
                  ]
                : []),
            ],
            spacing: { after: 480 },
          }),

          // 5 copy sections
          ...sectionParagraphs('Headline Banner', gen.headline_banner ?? ''),
          ...sectionParagraphs('Question Banner', gen.question_banner ?? ''),
          ...sectionParagraphs('YouTube Title',   gen.youtube_title ?? ''),
          ...sectionParagraphs('YouTube Description', gen.youtube_description ?? ''),
          ...sectionParagraphs('Instagram Caption', gen.instagram_caption ?? ''),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const bytes = new Uint8Array(buffer);

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="SocialCopy-${gen.clip_code}-${fileDateStr}.docx"`,
    },
  });
}
