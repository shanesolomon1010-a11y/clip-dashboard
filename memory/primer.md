# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `1b8d44e` (chore: disable YouTube Studio scraper LaunchAgent). Branch `main` is 10 commits ahead of `origin/main`, all unpushed. The data-layer fix wave from 2026-05-01 (Dashboard / Founder Report convergence, 1000-row cap fix, YouTube Merger CSV deletion) remains the load-bearing change — Dashboard 7d / 30d match Founder Report. As of 2026-05-05 the local YouTube Studio scraper LaunchAgent (`com.clipstudio.youtubesync`) is disabled; Shorts ingestion is paused and no new daily-delta Shorts rows will land in `posts` until reinstated. **The matching `sudo pmset repeat cancel` step is still pending — Shane to run manually.**

## Just completed (2026-05-05, LaunchAgent disable wave)
- **Disabled the local YouTube Studio scraper LaunchAgent** (option 1 from horizon). Shorts ingestion is paused at the source.
  - `launchctl unload /Users/shane/Library/LaunchAgents/com.clipstudio.youtubesync.plist` — agent removed from launchd.
  - `rm /Users/shane/Library/LaunchAgents/com.clipstudio.youtubesync.plist` — plist file deleted from `~/Library/LaunchAgents/`.
  - Scripts preserved byte-identical at `scripts/youtube-studio-sync.ts` and `scripts/youtube-studio-sync.sh`.
  - Logs preserved at `logs/launchd-stdout.log`, `logs/launchd-stderr.log`, `logs/youtube-studio-sync.log` (all under the gitignored `logs/`).
  - Recorded plist contents (Label `com.clipstudio.youtubesync`, ProgramArguments `/bin/bash /Users/shane/clip-dashboard/scripts/youtube-studio-sync.sh`, StartCalendarInterval Hour=6 Minute=0, StandardOut/ErrorPath under `logs/launchd-{stdout,stderr}.log`, RunAtLoad=false, EnvironmentVariables HOME=`/Users/shane` PATH=`/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`) so re-enable can rebuild it verbatim.
- **Pipeline used**: `/plan` (planner agent) → `/coder` (coder agent in isolated worktree) → `/review` (reviewer + security-reviewer in parallel) → polish edits → cherry-pick to main. Worktree had to be cherry-picked rather than FF-merged because its base (`773c7f8`) had drifted behind main's HEAD; recorded in `tasks/lessons.md` 2026-05-05.
- **Worktree cleaned up**: `.claude/worktrees/agent-afe5ed1f6d35a4fc4` removed; branch `worktree-agent-afe5ed1f6d35a4fc4` deleted.

## Just completed (2026-05-05, planning-only earlier in session)
- `/plan` was invoked for "add a one-line title comment to the top of CLAUDE.md". Planner recommended inserting `<!-- Clip Studio Dashboard — project constitution and agent instructions -->` as new line 1 above the existing `# CLAUDE.md` H1. **Plan was produced and shown to Shane; not executed.**

## Recent commits (unpushed)
- `1b8d44e` chore: disable YouTube Studio scraper LaunchAgent
- `cdf553e` chore: session primer rewrite (planning-only session)
- `72419ce` chore: add three slash commands to .claude/commands/
- `6e4698f` docs: add .claude/agents/README.md
- `ad08ceb` chore: add .claude/settings.json
- `a3c08e5` chore: add four agents to .claude/agents/ (coder / planner / reviewer / security-reviewer)
- `f20caf1` chore: establish CLAUDE.md as project constitution
- `c6ce368` refactor: remove Views Over Time chart from DashboardView
- `5da96e7` fix: push date window to DB in `getAllPostsByDate` (1000-row cap fix)
- `187c335` data-layer fix wave (Dashboard read-side corrections)

## In progress
- Nothing.

## Blocked / next
- **Pending manual step (sudo)**: run `sudo pmset repeat cancel` to remove the matching 5:55AM repeating wake. The agent that performed the disable could not run sudo (no TTY/askpass). `pmset -g sched` showed the wake was the only repeating event and only the scraper used it, so a flat `cancel` is correct. The LaunchAgent itself is gone, so nothing fires at 06:00 even if the wake remains — but the wake is noise on `pmset -g sched` until cancelled.
- **Diagnostics drift-check will go yellow indefinitely for Shorts ingest freshness** with the LaunchAgent disabled. That is intended — not a bug — until Shane reinstates the scraper.
- **To re-enable the scraper**: restore plist contents (recorded in the 2026-05-05 entry above) to `/Users/shane/Library/LaunchAgents/com.clipstudio.youtubesync.plist`, `launchctl load /Users/shane/Library/LaunchAgents/com.clipstudio.youtubesync.plist`, then `sudo pmset repeat wakeorpoweron MTWRFSU 05:55:00`. Confirm with `launchctl list | grep clipstudio` and `pmset -g sched`. **Note:** `pmset repeat` holds one global schedule per machine — run `pmset -g sched` first and confirm no other repeating event exists, otherwise this command will silently overwrite it. The 05:55 wake is intentionally 5 minutes before the 06:00 launchd fire (so the Mac is awake when the agent triggers), not a typo to "fix."
- **Natural next action (CLAUDE.md title comment)**: execute the pending CLAUDE.md title-comment plan if Shane greenlights it. One-line surgical edit, no build/lint needed.
- **Push question**: 10 unpushed commits on `main`. Shane's rule is "never push unless I say push to git" — these are sitting locally until told otherwise.
- **Engine test gate**: clip-finder API endpoint + UI still gated on the separate engine test.
- **Pre-existing**: `studio_snapshots` migration not yet applied to Supabase.
- **Pre-existing**: `scripts/youtube-studio-sync.test.ts:163` asserts VIDEO_MAP has 19 entries; actual is 30 (harmless but stale).
- **Open data-layer audit items** (`docs/data-layer-audit.md`): #4 Stats Grid Total Impressions, #6 Top Content fallback labeling, #9 studio_snapshots semantics, 6.7 write-side guard in `upsertPosts`, 6.8 rename `getLatestPostsPerClip` → `getLatestSnapshotPerClip` + JSDoc warning.
- **Possible follow-up** from the prior tab-deletion wave: orphan Supabase tables (`weekly_reports`, `schedule_recommendations`, `performance_analyses`, `breakdowns_daily`/equivalents, `insights`) are write/read-dead. Decide whether to drop on the database side.
