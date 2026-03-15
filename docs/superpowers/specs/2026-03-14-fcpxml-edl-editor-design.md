# FCPXML/EDL Video Editor — Design Spec

**Date:** 2026-03-14
**Status:** Approved
**File:** `src/components/views/EditorView.tsx` (complete replacement)

---

## Overview

Rebuild the AI Video Editor tab from a single-video FFmpeg-command-generation workflow into a multi-clip FCPXML/EDL export pipeline. The component accepts multiple video clips, runs silence detection via FFmpeg.wasm, generates social-style captions via Claude, and produces valid FCPXML (Final Cut Pro) and EDL (DaVinci Resolve) export files.

---

## Architecture

Single React component (`EditorView.tsx`) with all logic inline, matching the existing codebase pattern. No new files or abstractions unless a utility function exceeds ~100 lines. Reuses the existing FFmpeg init pattern, Anthropic fetch pattern, and Supabase save pattern from the current component.

---

## State Model

```ts
type Clip = {
  id: string
  file: File
  filename: string
  duration: number                                        // seconds, from FFmpeg probe
  thumbnailUrl: string                                    // blob URL, frame 1 extract
  order: number                                           // drag-drop sort index
  keepSegments: Array<{ start: number; end: number }>     // non-silent ranges to keep
  captions: Array<{ startTime: number; endTime: number; text: string }>
  analyzed: boolean
}

// Component-level state
clips: Clip[]
instructions: {
  reference: string
  cutting: string
  transitions: string
  captions: string
}
status: 'idle' | 'analyzing' | 'generating' | 'done' | 'error'
logLines: string[]      // real-time FFmpeg stderr lines
fcpxmlBlob: Blob | null
edlBlob: Blob | null
```

---

## Pipeline

### Stage 1 — Upload & Probe

- Accept `.mp4`, `.mov`, `.m4v` via drag-drop or file picker (multi-file)
- For each file, create a `Clip` entry and run two FFmpeg operations:
  1. Duration probe: `ffmpeg -i input.mp4 -f null -` → parse duration from stderr
  2. Thumbnail: `ffmpeg -i input.mp4 -frames:v 1 -q:v 2 thumb.jpg` → read as blob URL
- Clips render immediately as cards in the left panel; reorderable via HTML5 drag API

### Stage 2 — Silence Detection

- Per clip: `ffmpeg -i input.mp4 -af silencedetect=noise=-30dB:d=0.5 -f null -`
- Parse stderr for `silence_start` / `silence_end` pairs
- Invert silence ranges to produce `keepSegments` (the non-silent parts)
- Edge case: no silence detected → `keepSegments = [{ start: 0, end: duration }]`
- Log all detected silence ranges to the right panel in real time

### Stage 3 — Caption Generation

- One Claude API call per clip, run in parallel via `Promise.all`
- Uses existing Anthropic fetch pattern: `https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`
- API key from `process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY`
- Model: `claude-sonnet-4-20250514`
- Prompt includes all 4 instruction boxes as context + clip filename + duration + keepSegments
- System prompt requests ONLY a JSON array of `{ startTime, endTime, text }` objects
- Caption style: punchy, social-media, max 6 words each
- On JSON parse failure: log warning, set `captions = []`, continue (don't block export)

### Stage 4 — FCPXML Generation

- Template string builder (no XML library)
- Format: FCPXML 1.10, Final Cut Pro compatible
- Frame size: 1080×1920 (vertical/9:16), 30fps
- Timecode math in frame units: 1 frame = `1/30` second
- Structure:
  - Single `<sequence>` containing all clips in sort order
  - Each `keepSegment` becomes an `<asset-clip>` with computed `offset` and `duration`
  - Captions become `<title>` elements at the correct timeline timecodes
- Media references use original uploaded filenames (not temp paths)

### Stage 5 — EDL Generation

- CMX 3600 format, plain text, `.edl` extension
- One event per `keepSegment` per clip
- Source timecode: computed from segment `start`/`end`
- Record timecode: computed from cumulative timeline position across all prior clips/segments
- Standard CMX header block

### Stage 6 — Supabase Save

- After both files are generated, insert to `editor_feedback`:
  ```ts
  {
    prompt: JSON.stringify(instructions),
    fcpxml_generated: true,
    feedback: null,
    feedback_type: 'export'
  }
  ```
- Uses existing `supabase` client from `src/lib/supabase.ts`

---

## UI Layout

Three-panel layout with a bottom action bar. Matches the existing dark premium aesthetic (CSS variables, DM Sans, gold accent).

### Left Panel — Clip List

- Upload zone at top: drag-drop area or "Browse" button, accepts `.mp4 .mov .m4v`
- Each clip renders as a card: 64×64 thumbnail, filename (truncated), duration badge
- Cards are drag-drop reorderable via HTML5 drag API (no library)
- "Clear all" link at bottom of list

### Center Panel — Instructions

- 4 `<textarea>` boxes stacked vertically, labeled: Reference, Cutting, Transitions, Captions
- Styled with existing input field classes (`bg-white/[0.03] border border-white/[0.06]`)
- All 4 boxes passed to Claude as context for caption generation

### Right Panel — Analysis Log

- Scrollable monospace log (JetBrains Mono)
- Real-time FFmpeg stderr output per clip
- Silence detection results highlighted in gold
- Errors highlighted in red
- Per-clip status labels (probing, detecting silence, generating captions...)

### Bottom Bar

- "Analyze & Generate" button (gold, full-width) — disabled until ≥1 clip uploaded
- During analysis: spinner + current clip name being processed
- After generation: "Download FCPXML" and "Download EDL" buttons appear

---

## Error Handling

- FFmpeg load failure: show error in log, disable analyze button
- Silence detection failure on a clip: log warning, treat as full-clip keep segment
- Claude API failure on a clip: log warning, continue with empty captions
- JSON parse failure from Claude: log warning, continue with empty captions
- FCPXML/EDL generation: synchronous template string — no expected failure path
- Supabase save failure: log silently (non-blocking)

---

## What Is Not Changing

- FFmpeg.wasm initialization pattern (identical to existing)
- Anthropic API fetch pattern (identical to existing)
- Supabase client import (`src/lib/supabase.ts`)
- CSS design tokens and component styling conventions
- Sidebar nav entry (still `id: 'editor'`)
