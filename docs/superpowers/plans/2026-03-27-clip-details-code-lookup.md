# clip_details_code Lookup Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `clip_details_code` to the posts pipeline so that `fetchClipStats` can find rows regardless of whether the clip was uploaded using the CSV clip ID (e.g. `MBM014`) or the clip_details code (e.g. `MBM015-CLIP-014`).

**Architecture:** The DB column `posts.clip_details_code` already exists (migration run). We thread the new field through the TypeScript type, the DB read/write functions, and the CSV upload UI. No new abstractions needed — all changes are surgical additions to existing files.

**Tech Stack:** Next.js 14, TypeScript, Supabase JS client, Tailwind CSS

---

## Chunk 1: Types + DB Layer

### Task 1: Add clip_details_code to UnifiedPost

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add field to interface**

In `src/types/index.ts`, add after the `clip_code` field (line 5):

```typescript
  clip_details_code?: string;
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```
Expected: no TypeScript errors

---

### Task 2: Thread clip_details_code through db.ts

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add clip_details_code to mapPostRow**

In `mapPostRow` (around line 110), add after the `clip_code` line:

```typescript
    clip_details_code: row.clip_details_code as string | undefined,
```

- [ ] **Step 2: Add clip_details_code to upsertPosts row mapping**

In `upsertPosts` (around line 253), add after `clip_code: p.clip_code ?? null,`:

```typescript
    clip_details_code: p.clip_details_code ?? null,
```

- [ ] **Step 3: Update fetchClipStats to query both columns**

Replace the `.eq('clip_code', clipCode)` line in `fetchClipStats` (line 459) with:

```typescript
    .or(`clip_details_code.eq."${clipCode}",clip_code.eq."${clipCode}"`)
```

Note: Values are quoted so PostgREST handles hyphens and other special characters in codes like `MBM015-CLIP-014` correctly.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```
Expected: no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/db.ts
git commit -m "feat: add clip_details_code to posts type and db layer"
```

---

## Chunk 2: CSV Upload UI

### Task 3: Add optional Clip Details Code input to UploadZone preview step

**Files:**
- Modify: `src/components/UploadZone.tsx`

- [ ] **Step 1: Add clipDetailsCode state**

Add new state near the other useState declarations (around line 31):

```typescript
  const [clipDetailsCode, setClipDetailsCode] = useState('');
```

- [ ] **Step 2: Update handleConfirm to stamp clip_details_code and fix dependency array**

Replace the entire `handleConfirm` callback (lines 61-80 in current file) with:

```typescript
const handleConfirm = useCallback(() => {
  if (!pendingFile || !platform) return;
  setProcessing(true);
  parseCSV(
    pendingFile,
    platform,
    (posts) => {
      const stamped = clipDetailsCode.trim()
        ? posts.map((p) => ({ ...p, clip_details_code: clipDetailsCode.trim() }))
        : posts;
      onUpload(stamped);
      setStatus({ type: 'success', msg: `Imported ${posts.length} posts` });
      setProcessing(false);
      setPendingFile(null);
      setPreview(null);
      setClipDetailsCode('');
      setStep('file');
    },
    (msg) => {
      setStatus({ type: 'error', msg });
      setProcessing(false);
    }
  );
}, [pendingFile, platform, onUpload, clipDetailsCode]);
```

Note: `clipDetailsCode` is added to the dependency array to avoid a stale closure bug where the field always submits as empty string.

- [ ] **Step 3: Add input field in preview step UI**

In the preview step JSX (`step === 'preview'`), add between the table div and the button row:

```tsx
<div className="mb-3">
  <label className="block text-[11px] text-[var(--text-2)] mb-1.5">
    Clip Details Code <span className="text-[var(--text-3)]">(optional)</span>
  </label>
  <input
    type="text"
    value={clipDetailsCode}
    onChange={(e) => setClipDetailsCode(e.target.value)}
    placeholder="e.g. MBM015-CLIP-014"
    className="w-full bg-[rgba(247,231,206,0.03)] border border-[rgba(247,231,206,0.08)] rounded-xl px-3 py-2 text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[rgba(247,231,206,0.20)]"
  />
  <p className="text-[10px] text-[var(--text-3)] mt-1">If set, stored as clip_details_code on every imported row</p>
</div>
```

- [ ] **Step 4: Reset clipDetailsCode when user cancels or changes platform**

Update the Cancel button's onClick (in the preview step button row):
```tsx
onClick={() => { setClipDetailsCode(''); setPreview(null); setPendingFile(null); setStep('file'); }}
```

Update the "Change platform" button's onClick (line ~104, in the top bar):
```tsx
onClick={() => { setStep('platform'); setPlatform(null); setStatus(null); setPreview(null); setPendingFile(null); setClipDetailsCode(''); }}
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```
Expected: no TypeScript errors, no warnings

- [ ] **Step 6: Commit**

```bash
git add src/components/UploadZone.tsx
git commit -m "feat: add optional Clip Details Code field to CSV import preview"
```

---

## Chunk 3: Final verification + push

- [ ] **Step 1: Run full build one more time**

```bash
npm run build
```
Expected: clean build

- [ ] **Step 2: Push to git**

```bash
git push
```
