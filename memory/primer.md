# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD = `2df3dba` on `main`. `origin/main` = `2df3dba` — **all 7 work commits of this session are already pushed.** Only the `/close` commit (this rewrite + `cloudmemory.md`) is local/unpushed; push with `git push origin main` if desired (it's docs/memory only, no deploy impact).

This session (2026-06-02 → 2026-06-16) was an analysis + diagnostics-hardening + ops session. Built the AI triage layer on top of the diagnostics-alert cron end-to-end, killed two latent diagnostics false-positives found in a full sweep, migrated off the retired Claude model ID before its 2026-06-15 API cutoff, and did two read-only data pulls (insights population + a one-time IG Graph CSV). Live data + crons confirmed fully healthy on 2026-06-08.

## Shipped this session (7 commits, all pushed; on top of 53c4610)
- `a07fbc0` **feat(diagnostics): AI triage step on RED diagnostics alerts** — on RED only, append a plain-English root-cause triage beneath the existing raw Slack check-list. New `src/lib/diagnostics-triage.ts` (`runDiagnosticsTriage`) + `src/lib/diagnostics-playbook.ts` (`TRIAGE_SYSTEM_PROMPT` + `DIAGNOSTICS_PLAYBOOK`, editable). Reuses `ANTHROPIC_API_KEY` + the `/api/ai-proxy` raw-fetch shape; no new secret. Advisory-only, bounded context (RED groups + cron_health/data_freshness/cron_completion/schema_integrity + 10 cron_runs/cron). Fails safe to the raw post (`triage` → null).
- `08543db` **feat(diagnostics): timeout triage fetch + triage-preview endpoint** — 15s `AbortController` (`TRIAGE_FETCH_TIMEOUT_MS`) so a hung Anthropic fetch can't burn `maxDuration=60` and suppress the alert; `clearTimeout` in `finally`. New `GET /api/diagnostics/triage-preview` (same access model as `/api/diagnostics` — no auth gate, Vercel protection is the gate; `?paths=` override, default canonical dropped-tick set). Read-only: no Slack, no cron_runs writes.
- `2b09f10` **fix(diagnostics): emit Slack mrkdwn bold, not markdown** — Slack bold is single-`*`; prompt now instructs single-`*`/no `#`, and the triage text is normalized before return (`**`→`*`, strip leading `#`).
- `cb1c26f` **feat(diagnostics): triage self-check in daily heartbeat** — `triageSelfCheck()` (one minimal `max_tokens:16` "READY" call, same key/model/15s timeout) appends `AI triage: ok/down` to the 00:00 UTC heartbeat only. Indicator only, defensive (throw → down).
- `3a43d0c` **fix(diagnostics): kill false-positive shorts freshness RED** — root cause was NOT a 1000-row truncation (the latest-stat query was already DB-side `.order().limit(1).maybeSingle()`); it was the `.not('stat_date','is',null)` client footgun spuriously returning `[]`. Dropped the filter on all three `data_freshness` streams; `nullsFirst:false` keeps latest-real-date semantics. Playbook entry 7 (freshness RED + healthy cron/completion/write_correlation = stale read, not write failure) + system-prompt rule (never assert write failure when write_correlation is green).
- `577f086` **fix(diagnostics): exact orphan count + don't flag negative likes/comments** — orphan check replaced fetch-all-then-JS-compare (silently truncated posts at 1000 rows) with DB-side exact `NOT IN` count off the small clip_details set. Negative-metric anomaly no longer flags `likes`/`comments` (legitimately negative as daily deltas — 37 historical long_form like-rows are benign); keeps `views`/`watch_time`/`avg_duration`/`shares` strict.
- `2df3dba` **chore: migrate off retired claude-sonnet-4-20250514** — Anthropic retired that ID on 2026-06-15. Replaced at all 5 sites (`claude-sonnet-4-6`): social-copy generate (call + `model_used`), import/clips (call), SocialCopyView (`model_used`), diagnostics-triage (`TRIAGE_MODEL`). No `claude-opus-4-20250514` anywhere. Message format compatible across 4.x.

## Read-only data work (not committed — by design)
- **Insights population**: emitted 6 `INSERT … public.insights` statements (client=mbm) from live analysis; Shane ran them in the SQL Editor. Source tag `chat:data-breakdown-2026-06-02`. Headlines: long-form is a single-hit catalog (1 of 16 videos = 94% of long-form views + 92% of subs); IG Reels beat YT Shorts ~5× in a matched window (34/36 head-to-head); short-form engagement is reach-only (near-zero comments). Deliberately skipped posting-time (posted_at is batch-stamped midnight) and hook/banner (headline_banner only populated on old MBM015/018 — data-entry artifact).
- **One-time IG fresh pull**: `scripts/ig-fresh-pull.mjs` (untracked) — reads creds from `instagram_auth` via service-role (same as IG cron), Graph v22.0, pulled 74 reels → `/tmp/mediabuyer_ig_fresh_2026-06-03.csv`. Did NOT read/write posts. `reposts` metric rejected for all reels (blank); 7 oldest reels (Sept 2025) have no insights (pre-eligibility). Script is re-runnable; delete if not wanted.

## Live data state (verified 2026-06-08, read-only)
- **posts**: long_form 3,852 rows (latest_stat 06-05), short 1,534 (06-05), reel 1,610 (06-08). All `updated_at` = 06-08 — writes landing. Hard-negative metrics (views/watch/avg-dur/shares) = **0**.
- **Integrity**: orphans 0, dupes 0/0/0, `ig_mapping_desync()` = 0.
- **clip_details**: 106 total — 75 MAPPED, 18 PENDING_IG, 13 PENDING_YT (31 PENDING, up from 25 on 06-04; manual-mapping backlog grows ~1-2/day, expected).
- **Collection vs mapping are independent** — PENDING items ARE collected daily (PENDING-IG: 11 items w/ posts, 137 rows, latest 06-08; PENDING-YT: 12 items, 55 rows). `map_clip` re-keys retroactively, no backfill/gap. ~8 PENDING placeholders have no posts row yet (new/zero-view uploads — normal). Backlog = attribution debt only, NOT data loss.
- **Crons** (last 3d): all 4 success, zero failed/partial. shorts 14:00, longform 14:30, IG 17:00, diagnostics 18:00 (UTC).
- **IG token** expires **2026-07-14** (~28 days out as of 06-16). Refresh is the next calendar to-do.

## Next natural actions (in order)
1. **Push the `/close` commit** (`git push origin main`) — docs/memory only, optional, no deploy effect.
2. **Refresh the IG token before 2026-07-14** — now ~4 weeks out, the only time-bound item. `refreshAccessToken()` exists in `src/lib/instagram.ts`.
3. **Work the PENDING mapping backlog** (31 items) when convenient — Settings → Mapping UI + `map_clip`; the `/tmp/clipmatch` image-match pipeline is re-runnable from `~/Downloads`+`~/Movies`. Attribution only; no urgency.
4. **Optional**: validate the triage layer live via `GET /api/diagnostics/triage-preview` (forces the canonical dropped-tick RED set, returns model output) — no real failure needed.

## Diagnostics AI triage — how it fits together (new this session)
- **Trigger**: only on RED paths (heartbeat / all-green / yellow-only runs unchanged). `runDiagnosticsTriage(diagnostics, redPaths)` → text or null; route appends under `:robot_face: *AI triage (advisory)*`, falls back to raw post on null.
- **Self-check**: `triageSelfCheck()` on the 00:00 UTC heartbeat → `AI triage: ok/down` line. One tiny call/day.
- **Preview**: `GET /api/diagnostics/triage-preview` for on-demand validation.
- **Guardrails**: advisory-only (reads diagnostics + cron_runs, writes one Slack message); 15s fetch timeout; editable playbook in `diagnostics-playbook.ts`; model `claude-sonnet-4-6`.
- **KNOWN_RED_PATHS still empty** — any RED is real and alerts.

## Known non-issues (don't escalate)
- YT `stat_date` trailing today by 2-3 days — intrinsic YouTube Analytics lag.
- PENDING backlog growth — expected; collection continues regardless of mapping.
- `/api/diagnostics` + `/api/diagnostics/triage-preview` have no route auth — Vercel deployment protection is the gate (by design, mirrors each other).
- `clip_details.thumbnail_base64` unusable via anon/PostgREST — use `thumbnail_url`.
- Some sidebar views hidden for demo — uncomment ids in `NAV_GROUPS[].items`.
- Em-dashes in a few UI microcopy strings (MappingTab toasts, SettingsView sublabel) — minor, left as-is per Shane; the `'—'` no-value placeholders are intentional.
- `memory/cloudmemory.md` shows dirty post-commit — expected from the hook.

## Blocked / open
- Supabase MCP write tools blocked for DML/DDL — SQL Editor workflow only; read-only SELECT fine without asking.
- Manual curl is not a valid cron-context test (Vercel deployment protection on the alias domain) — use the dashboard "Run Cron Job" button or wait for the scheduled tick.
- Never push for Shane (global deny rule) — surface the command, he runs it.
