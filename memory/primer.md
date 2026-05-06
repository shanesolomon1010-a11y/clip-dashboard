# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
Branch `main` is 8 commits ahead of `origin/main` (unpushed). Working tree clean apart from `memory/` updates from this session. HEAD is `72419ce` (chore: add three slash commands to .claude/commands/). The data-layer fix wave from 2026-05-01 (Dashboard / Founder Report convergence, 1000-row cap fix, YouTube Merger CSV deletion) remains the load-bearing change — Dashboard 7d / 30d match Founder Report. No new code shipped this session.

## Just completed (2026-05-05, planning-only session)
- `/plan` was invoked for "add a one-line title comment to the top of CLAUDE.md". Planner agent recommended inserting `<!-- Clip Studio Dashboard — project constitution and agent instructions -->` as new line 1 above the existing `# CLAUDE.md` H1, leaving everything else byte-identical. **Plan was produced and shown to Shane; not executed.**
- No code changes, no commits to source. This session's commit covers only `memory/` housekeeping.

## Recent commits (prior sessions, unpushed)
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
- **Natural next action**: execute the pending CLAUDE.md title-comment plan (insert HTML comment as new line 1) if Shane greenlights it. One-line surgical edit, no build/lint needed.
- **Push question**: 8 unpushed commits on `main`. Shane's rule is "never push unless I say push to git" — these are sitting locally until told otherwise.
- **Engine test gate**: clip-finder API endpoint + UI still gated on the separate engine test.
- **Pre-existing**: `studio_snapshots` migration not yet applied to Supabase.
- **Pre-existing**: `scripts/youtube-studio-sync.test.ts:163` asserts VIDEO_MAP has 19 entries; actual is 30 (harmless but stale).
- **Open data-layer audit items** (`docs/data-layer-audit.md`): #4 Stats Grid Total Impressions, #6 Top Content fallback labeling, #9 studio_snapshots semantics, 6.7 write-side guard in `upsertPosts`, 6.8 rename `getLatestPostsPerClip` → `getLatestSnapshotPerClip` + JSDoc warning.
- **Possible follow-up** from the prior tab-deletion wave: orphan Supabase tables (`weekly_reports`, `schedule_recommendations`, `performance_analyses`, `breakdowns_daily`/equivalents, `insights`) are write/read-dead. Decide whether to drop on the database side.
