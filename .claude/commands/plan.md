---
description: Run the planner agent on a spec or task description and stop. No execution.
---

Run the `planner` agent on the spec or task the user provides.

1. If the user names a file (e.g., `SPEC.md`), read it. If they describe the task inline, use that directly.
2. Spawn the `planner` agent with the spec. It will read relevant repo context (CLAUDE.md, the relevant source files) and produce a numbered implementation plan.
3. Show the plan to the user. Stop. Do not execute.
