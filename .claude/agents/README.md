# Agents

This directory holds subagent definitions for the clip-dashboard repo. Each Markdown file declares a named subagent (frontmatter sets the tools and model) that Claude Code can invoke via the Agent tool.

## planner

The planner reads a spec or feature description and returns a numbered, ordered implementation plan, with each step pointing to a concrete file or function, dependencies called out explicitly, and verification steps listed at the end (at minimum `npm run build`). Use it as the first stage of a controller pipeline before any code is written, or any time you want a structured plan rather than an ad-hoc fix. It is strictly read-only (Read, Grep, Glob) and will not edit files. If the spec is ambiguous it lists the ambiguities and picks a reasonable default rather than stalling.

## coder

The coder takes a plan as input and produces a working diff as output, implementing each step inside an isolated git worktree. Use it as the implementation stage of a controller pipeline, after the planner, when you want code written without polluting the main checkout. It has Read, Write, Edit, Glob, Grep, and Bash, and runs `npm run build` after each meaningful change so nothing ships broken. It stays inside the plan (surgical edits, no opportunistic rewrites), will not add database calls, external APIs, or new dependencies without permission, and will not run DDL, run DML, or push to git on its own.

## reviewer

The reviewer reads code under review and reports issues grouped by severity (Critical, Style/Maintainability, Suggestion), quoting the offending lines so the reader can find them. Use it when you want a focused code review, or as one specialist in a parallel multi-reviewer pipeline alongside security-reviewer. It is read-only (Read, Grep, Glob) and never proposes patches as diffs, only describes the change in prose. It is tuned to the recurring failure modes in this repo: daily-delta vs cumulative `posts`, the three aggregation functions in `src/lib/db.ts`, the 1000-row Supabase cap, and upsert conflict keys.

## security-reviewer

The security-reviewer scans code for security-specific issues and stays out of general code quality (that is the reviewer's job). It looks for secrets committed to the repo, injection vectors (`eval`, `Function()`, `dangerouslySetInnerHTML`, raw string concatenation into Supabase queries), untrusted input flowing into sensitive operations, information disclosure in logs and responses, Supabase service-role key exposure in browser-callable code, and misuse of Anthropic's `anthropic-dangerous-direct-browser-access` flag. Findings are reported one per section with Severity (High, Medium, Low), Location, what is wrong, and how to fix it in prose. It is read-only (Read, Grep, Glob) and never edits.
