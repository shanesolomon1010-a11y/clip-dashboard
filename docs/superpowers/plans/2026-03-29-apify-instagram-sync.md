# Apify Instagram Sync — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated Instagram Reel sync via Apify to Clip Studio, replacing the need for manual CSV import.

**Architecture:** New `src/lib/apify.ts` file handles all Apify API calls and data mapping; `SettingsView.tsx` gains a new "Connections" tab with an Apify card. Credentials live in localStorage. No new tables, no env vars, no modifications to existing flows.

**Tech Stack:** Next.js 14, TypeScript, Supabase (via existing `upsertPosts`), Apify REST API, localStorage

---

## Chunk 1: src/lib/apify.ts

### Task 1: Create apify.ts sync function

**Files:**
- Create: `src/lib/apify.ts`

- [ ] **Step 1: Create `src/lib/apify.ts` with `syncInstagramReels()`**

```typescript
import { upsertPosts } from './db';
import type { UnifiedPost } from '@/types';

interface ApifyRunResponse {
  data: { id: string; status: string };
}

interface ApifyDatasetItem {
  url?: string;
  shortCode?: string;
  timestamp?: string;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  caption?: string;
}

export async function syncInstagramReels(): Promise<void> {
  const token = localStorage.getItem('apify_token');
  const username = localStorage.getItem('apify_instagram_username');

  if (!token || !username) {
    throw new Error('Apify token and Instagram username are required.');
  }

  // 1. Start actor run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: `https://www.instagram.com/${username}/` }],
        resultsLimit: 50,
      }),
    }
  );

  if (!startRes.ok) {
    throw new Error(`Failed to start Apify run: ${startRes.statusText}`);
  }

  const { data: run } = (await startRes.json()) as ApifyRunResponse;
  const runId = run.id;

  // 2. Poll until complete (max 40 polls × 3s = 2 min)
  let status = run.status;
  let polls = 0;
  while (status === 'RUNNING' || status === 'READY') {
    if (polls >= 40) {
      throw new Error('Apify run timed out after 2 minutes.');
    }
    await new Promise((res) => setTimeout(res, 3000));
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    const statusData = (await statusRes.json()) as ApifyRunResponse;
    status = statusData.data.status;
    polls++;
  }

  if (status === 'FAILED' || status === 'ABORTED') {
    throw new Error(`Apify run ${status.toLowerCase()}.`);
  }

  // 3. Fetch dataset items
  const dataRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
  );

  if (!dataRes.ok) {
    throw new Error(`Failed to fetch dataset: ${dataRes.statusText}`);
  }

  const items = (await dataRes.json()) as ApifyDatasetItem[];
  const statDate = new Date().toISOString().split('T')[0];

  // 4. Map to UnifiedPost shape
  const posts: UnifiedPost[] = items.map((item) => ({
    id: '',
    platform: 'instagram',
    clip_code: '',
    url: item.url,
    content_id: item.shortCode,
    date: item.timestamp ?? statDate,
    stat_date: statDate,
    views: item.videoViewCount ?? item.videoPlayCount ?? 0,
    plays: item.videoPlayCount ?? 0,
    likes: item.likesCount ?? 0,
    comments: item.commentsCount ?? 0,
    shares: item.sharesCount ?? 0,
    saves: 0,
    engagementRate: 0,
    content_type: 'reel',
    title: item.caption?.slice(0, 100) ?? item.shortCode ?? '',
  }));

  // 5. Upsert to Supabase
  await upsertPosts(posts);

  // 6. Record last sync time
  localStorage.setItem('apify_last_sync', new Date().toISOString());
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build
```

Expected: No TypeScript errors in `src/lib/apify.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/apify.ts
git commit -m "feat: add Apify Instagram Reel sync function"
```

---

## Chunk 2: SettingsView.tsx — Connections tab

### Task 2: Add Connections tab with Apify card

**Files:**
- Modify: `src/components/views/SettingsView.tsx`

**Context:** Current `activeTab` type is `'clips' | 'data-editor' | 'youtube-merger'`. No Connections tab exists. The tab pill nav is defined at line ~203. Existing UI patterns: `Section` component wraps a card, inputs use `px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl`, buttons use `bg-[var(--gold)] text-[var(--bg-base)]`. Status text uses `text-green-400` / `text-red-400`.

- [ ] **Step 1: Widen activeTab type**

In the `useState` declaration (line ~64), change:
```typescript
// Before
const [activeTab, setActiveTab] = useState<'clips' | 'data-editor' | 'youtube-merger'>('clips');

// After
const [activeTab, setActiveTab] = useState<'clips' | 'data-editor' | 'youtube-merger' | 'connections'>('clips');
```

- [ ] **Step 2: Add Connections state variables**

After the existing state declarations (around line ~77), add:
```typescript
// Connections / Apify state
const [apifyToken, setApifyToken]       = useState(() => localStorage.getItem('apify_token') ?? '');
const [apifyUsername, setApifyUsername] = useState(() => localStorage.getItem('apify_instagram_username') ?? '');
const [apifySaveLabel, setApifySaveLabel] = useState<'Save' | 'Saved'>('Save');
const [apifySyncing, setApifySyncing]   = useState(false);
const [apifyStatus, setApifyStatus]     = useState<{ type: 'success' | 'error'; message: string } | null>(null);
const [apifyLastSync, setApifyLastSync] = useState(() => localStorage.getItem('apify_last_sync'));
```

- [ ] **Step 3: Add import for syncInstagramReels**

Add to the import block at the top of the file:
```typescript
import { syncInstagramReels } from '@/lib/apify';
```

- [ ] **Step 4: Add handleApifySave and handleApifySync handlers**

After the `handleConfirm` function (around line ~90), add:
```typescript
function handleApifySave() {
  localStorage.setItem('apify_token', apifyToken);
  localStorage.setItem('apify_instagram_username', apifyUsername);
  setApifySaveLabel('Saved');
  setTimeout(() => setApifySaveLabel('Save'), 2000);
}

async function handleApifySync() {
  setApifySyncing(true);
  setApifyStatus(null);
  try {
    await syncInstagramReels();
    const ts = localStorage.getItem('apify_last_sync');
    setApifyLastSync(ts);
    setApifyStatus({ type: 'success', message: 'Sync complete.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    setApifyStatus({ type: 'error', message: msg });
  } finally {
    setApifySyncing(false);
  }
}
```

- [ ] **Step 5: Add "Connections" to the tab nav**

In the tab array (around line ~203), append the Connections entry:
```typescript
{ key: 'connections', label: 'Connections' },
```

The full array becomes:
```typescript
[
  { key: 'clips', label: 'Clip Library' },
  { key: 'data-editor', label: 'Data Editor' },
  { key: 'youtube-merger', label: 'YouTube Merger' },
  { key: 'connections', label: 'Connections' },
]
```

- [ ] **Step 6: Render Connections tab content**

After the `{activeTab === 'youtube-merger' && <YouTubeMergerTab />}` line (line ~224), add:
```tsx
{activeTab === 'connections' && (
  <div className="max-w-2xl space-y-5">
    <Section title="Apify — Instagram Sync">
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1">
          <label className="text-[11px] text-[var(--text-3)]">Apify API Token</label>
          <input
            type="password"
            placeholder="apify_api_…"
            value={apifyToken}
            onChange={e => setApifyToken(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-[var(--text-3)]">Instagram Username (without @)</label>
          <input
            type="text"
            placeholder="foundername"
            value={apifyUsername}
            onChange={e => setApifyUsername(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApifySave}
            className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity"
          >
            {apifySaveLabel}
          </button>
          <button
            type="button"
            onClick={handleApifySync}
            disabled={apifySyncing}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {apifySyncing ? 'Syncing…' : 'Sync Instagram Now'}
          </button>
        </div>
        {apifyStatus && (
          <p className={`text-xs ${apifyStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {apifyStatus.message}
          </p>
        )}
        <p className="text-[11px] text-[var(--text-3)]">
          {apifyLastSync
            ? `Last synced: ${new Date(apifyLastSync).toLocaleString()}`
            : 'Never synced'}
        </p>
      </div>
    </Section>
  </div>
)}
```

- [ ] **Step 7: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build
```

Expected: Clean build, no TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/components/views/SettingsView.tsx
git commit -m "feat: add Connections tab with Apify Instagram sync card"
```

---

## Chunk 3: Final push

- [ ] **Step 1: Push to git**

```bash
git push
```
