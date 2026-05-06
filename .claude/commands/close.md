---
description: Session shutdown ritual — audit corrections, update CLAUDE.md and memory files, rewrite primer.md, commit, generate a handoff doc.
---

Run the session shutdown ritual.

1. Audit the conversation for any corrections, rule violations, or new patterns surfaced this session. For each, propose a one-line addition to CLAUDE.md (with the why) or to tasks/lessons.md (`[YYYY-MM-DD] | what went wrong | rule for next time`). Surface the proposed additions for approval before writing.
2. Rewrite memory/primer.md to reflect current session state: shipped, current commit hash, branches touched, and the next natural action.
3. Stage all dirty files. memory/cloudmemory.md is expected to be dirty from the post-commit hook — include it.
4. Commit locally with a message summarizing the session's main outputs. Do not push.
5. Generate a comprehensive handoff doc covering session arc, current state, what's next, and any relevant context — paste-ready as the first message of the next chat.
