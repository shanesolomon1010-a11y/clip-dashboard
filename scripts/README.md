# YouTube Studio Sync

Playwright script that logs into YouTube Studio using your existing Chrome session,
exports per-video analytics as CSV, and upserts daily delta rows into Supabase.

## One-time setup

1. Install dependencies (if not already done):
   ```bash
   npm install playwright-core adm-zip dotenv --save-dev
   npm install @types/adm-zip --save-dev
   ```

2. Apply the Supabase migration (safe to run if constraint already exists):
   ```bash
   # Run in Supabase SQL editor or via supabase CLI:
   # supabase/migrations/20260411_posts_youtube_upsert_constraint.sql
   ```

3. Make the shell wrapper executable:
   ```bash
   chmod +x scripts/youtube-studio-sync.sh
   ```

## Manual run

1. **Close Google Chrome** — the script needs to open Chrome with your profile.
2. From the project root:
   ```bash
   npx tsx scripts/youtube-studio-sync.ts
   ```
   Or via the shell wrapper:
   ```bash
   ./scripts/youtube-studio-sync.sh
   ```
3. Logs are written to `logs/youtube-studio-sync.log`.

### Dry run (no browser launch)

```bash
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Prints all 19 video entries and exits. Use to verify the script compiles and env vars load.

### Unit tests

```bash
npx tsx --test scripts/youtube-studio-sync.test.ts
```

## Enable automatic daily run (6 AM)

```bash
cp scripts/com.clipstudio.youtubesync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.clipstudio.youtubesync.plist
```

Verify it loaded:
```bash
launchctl list | grep clipstudio
```

Disable:
```bash
launchctl unload ~/Library/LaunchAgents/com.clipstudio.youtubesync.plist
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Chrome is already running" | Close Google Chrome before running |
| "0 unchecked metric checkboxes found" | YouTube Studio UI may have changed; check logs and run manually to inspect the page |
| "No export button found" | Same — YouTube Studio UI changed; check selector list in `processVideo` |
| Auth errors / redirected to login | Open YouTube Studio in Chrome manually to refresh session |
| Upsert error | Check Supabase logs; confirm `posts_clip_platform_statdate_idx` constraint exists |
