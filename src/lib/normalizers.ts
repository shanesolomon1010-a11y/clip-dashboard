import Papa from 'papaparse';
import { Platform, UnifiedPost } from '@/types';

type RawRow = Record<string, string>;

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function calcEngagement(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  saves: number
): number {
  if (views === 0) return 0;
  const interactions = likes + comments + shares + saves;
  return parseFloat(((interactions / views) * 100).toFixed(2));
}

// ── Instagram ────────────────────────────────────────────────────────────────
// Required columns: Impressions, Likes, Comments, Saves
function normalizeInstagram(rows: RawRow[]): Omit<UnifiedPost, 'id'>[] {
  return rows.map((row, i) => {
    const views = parseNum(row['Impressions']);
    const likes = parseNum(row['Likes']);
    const comments = parseNum(row['Comments']);
    const shares = parseNum(row['Shares']) || parseNum(row['Sends']);
    const saves = parseNum(row['Saves']);
    const title = row['Caption'] || row['Title'] || `Instagram Post ${i + 1}`;
    const date = row['Date'] || row['Post date'] || new Date().toISOString().slice(0, 10);
    return {
      platform: 'instagram' as Platform,
      date: date.slice(0, 10),
      views, likes, comments, shares, saves,
      engagementRate: calcEngagement(views, likes, comments, shares, saves),
      title,
    };
  });
}

// ── YouTube Shorts ────────────────────────────────────────────────────────────
// Required columns: Views, Likes, Comments
function normalizeYouTube(rows: RawRow[]): Omit<UnifiedPost, 'id'>[] {
  return rows.map((row, i) => {
    const views = parseNum(row['Views']);
    const likes = parseNum(row['Likes']);
    const comments = parseNum(row['Comments']);
    const shares = parseNum(row['Shares']);
    const saves = 0;
    const title = row['Video title'] || row['Title'] || `YouTube Short ${i + 1}`;
    const date = row['Date'] || row['Published date'] || new Date().toISOString().slice(0, 10);
    return {
      platform: 'youtube' as Platform,
      date: date.slice(0, 10),
      views, likes, comments, shares, saves,
      engagementRate: calcEngagement(views, likes, comments, shares, saves),
      title,
    };
  });
}

// ── Platform Detection ────────────────────────────────────────────────────────
export function detectPlatform(headers: string[]): Platform | null {
  const h = new Set(headers.map(s => s.trim()));
  if (h.has('Impressions') && h.has('Saves')) return 'instagram';
  if (h.has('Views') && h.has('Likes') && h.has('Comments')) return 'youtube';
  return null;
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
export function parseCSV(
  file: File,
  onComplete: (posts: UnifiedPost[]) => void,
  onError: (msg: string) => void
): void {
  Papa.parse<RawRow>(file, {
    header: true,
    skipEmptyLines: true,
    complete(results) {
      const headers = results.meta.fields ?? [];
      const platform = detectPlatform(headers);
      if (!platform) {
        onError(
          `Could not detect platform from columns: ${headers.slice(0, 6).join(', ')}`
        );
        return;
      }

      const rows = results.data;
      let normalized: Omit<UnifiedPost, 'id'>[];
      switch (platform) {
        case 'instagram':  normalized = normalizeInstagram(rows); break;
        case 'youtube':    normalized = normalizeYouTube(rows); break;
      }

      const posts: UnifiedPost[] = normalized.map((p, i) => ({
        ...p,
        id: `${platform}-${slugify(p.title)}-${i}-${Date.now()}`,
      }));

      onComplete(posts);
    },
    error(err) {
      onError(err.message);
    },
  });
}
