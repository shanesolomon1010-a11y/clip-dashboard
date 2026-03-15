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
  duration: number                                        // seconds, from native video element
  thumbnailUrl: string                                    // blob URL, frame 1 extract via FFmpeg
  order: number                                           // drag-drop sort index
  keepSegments: Array<{ start: number; end: number }>     // non-silent ranges to keep
  captions: Array<{ startTime: number; endTime: number; text: string }>
  analyzed: boolean                                       // true after silence detection completes
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
- For each file, create a `Clip` entry with `analyzed: false`
- Duration: use native HTML video element (`vid.duration` from `onloadedmetadata`) — same pattern as the existing component, avoids FFmpeg round-trip
- Thumbnail: use FFmpeg.wasm — write file to virtual FS, run `ffmpeg -i input_<id>.mp4 -frames:v 1 -q:v 2 thumb_<id>.jpg`, read output as blob URL, then delete both files from virtual FS
- FFmpeg operations are serial (one clip at a time) to avoid virtual FS collisions — each clip uses its own unique filename: `input_<clip.id>.mp4` / `thumb_<clip.id>.jpg`
- Clips render immediately as cards in the left panel; reorderable via HTML5 drag API

### Stage 2 — Silence Detection

- Run serially, one clip at a time (shared FFmpeg.wasm instance, no concurrent virtual FS access)
- Per clip: write `input_<clip.id>.mp4` to virtual FS, run:
  `ffmpeg -i input_<clip.id>.mp4 -af silencedetect=noise=-30dB:d=0.5 -f null -`
- Parse accumulated log output for `silence_start` / `silence_end` pairs using regex:
  `/silence_start: ([\d.]+)/` and `/silence_end: ([\d.]+)/`
- Invert silence ranges to produce `keepSegments` (the non-silent parts)
- Edge case: no silence detected → `keepSegments = [{ start: 0, end: clip.duration }]`
- Set `clip.analyzed = true` after completion
- Log all detected silence ranges to the right panel in real time
- Re-running the pipeline resets all clips' `analyzed` to `false` and `keepSegments` to `[]` first

### Stage 3 — Caption Generation

- One Claude API call per clip, run in parallel via `Promise.all` (no FFmpeg involvement — no FS collision risk)
- Uses existing Anthropic fetch pattern: `https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`
- API key from `process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY`
- Model: `claude-sonnet-4-20250514`, max_tokens: 2048
- Prompt structure:
  ```
  System: You are a caption writer. Return ONLY a JSON array of {startTime, endTime, text} objects. No markdown, no explanation.

  User: Generate captions for a video called "[filename]" ([duration]s long).
  Active segments (silence removed): [keepSegments as JSON]

  Instructions context:
  Reference: [instructions.reference]
  Cutting: [instructions.cutting]
  Transitions: [instructions.transitions]
  Captions: [instructions.captions]

  Make captions punchy, social-media style, max 6 words each.
  ```
- Parse response text as JSON → `clip.captions`
- On JSON parse failure: log warning, set `captions = []`, continue (don't block export)

### Stage 4 — FCPXML Generation

- Template string builder (no XML library)
- Format: FCPXML 1.10, Final Cut Pro compatible
- Frame size: 1080×1920 (vertical/9:16), 30fps (non-drop-frame)

**Timecode math:**
- Use integer frame counts throughout: `frames = Math.round(seconds * 30)`
- FCPXML rational time string: `"${frames}/30s"` (30-timebase)
- Example: 2.5 seconds → 75 frames → `"75/30s"`

**Document structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1080x1920at30" frameDuration="1/30s"
            width="1080" height="1920" colorSpace="1-1-1 (Rec. 709)"/>
    <!-- one <asset> per clip -->
    <asset id="r2" name="clip_filename" src="file:///clip_filename.mp4"
           start="0s" duration="${totalFrames}/30s"
           hasVideo="1" hasAudio="1" format="r1"/>
  </resources>
  <library>
    <event name="Exported">
      <project name="Export">
        <sequence format="r1" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <!-- one <asset-clip> per keepSegment -->
            <asset-clip ref="r2" offset="${timelineOffset}/30s"
                        name="clip_filename" start="${segStart}/30s"
                        duration="${segDuration}/30s" format="r1">
              <!-- one <title> per caption within this segment's time range -->
              <title ref="r_title" offset="${captionOffset}/30s"
                     duration="${captionDuration}/30s" name="${caption.text}">
                <text><text-style>...</text-style></text>
              </title>
            </asset-clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
```

- Each clip gets a unique `<asset>` in `<resources>` with `id="r${index+2}"` and `src="file:///${clip.filename}"`
- `<asset>` `duration` = full clip duration in frames
- Each `keepSegment` maps to one `<asset-clip>` in the `<spine>`:
  - `offset` = cumulative timeline position (running total of all prior segment durations, in frames)
  - `start` = segment start within the source clip, in frames
  - `duration` = segment end − segment start, in frames
- Captions within a segment become `<title>` children of that `<asset-clip>`:
  - Only include captions whose `startTime` falls within the segment range
  - `offset` = caption startTime relative to segment start, in frames
  - `duration` = caption endTime − startTime, in frames

### Stage 5 — EDL Generation

- CMX 3600 format, plain text, `.edl` extension
- Non-drop-frame timecode throughout (`FCM: NON-DROP FRAME`)
- One event per `keepSegment` per clip

**Timecode conversion** (seconds → `HH:MM:SS:FF`):
```ts
function toTimecode(seconds: number): string {
  const totalFrames = Math.round(seconds * 30)
  const ff = totalFrames % 30
  const totalSecs = Math.floor(totalFrames / 30)
  const ss = totalSecs % 60
  const mm = Math.floor(totalSecs / 60) % 60
  const hh = Math.floor(totalSecs / 3600)
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}:${String(ff).padStart(2,'0')}`
}
```

**Reel name:** `clip.filename` stripped of extension and truncated to 8 characters, uppercased, spaces replaced with `_`. Collisions (two clips sharing the same 8-char prefix) are resolved by appending a 1-digit index: `CLIPNAM1`, `CLIPNAM2`.

**Event format:**
```
TITLE: Export
FCM: NON-DROP FRAME

001  CLIPNAME V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00
```

- Field 1: event number (3 digits, zero-padded, incrementing across all segments)
- Field 2: reel name (8 chars max)
- Field 3: channel — always `V` (video)
- Field 4: edit type — always `C` (cut)
- Field 5: source in timecode (segment `start` within source clip)
- Field 6: source out timecode (segment `end` within source clip)
- Field 7: record in timecode (cumulative timeline start)
- Field 8: record out timecode (cumulative timeline end)

### Stage 6 — Supabase Save

- After both files are generated, call `saveEditorFeedback` from `src/lib/db.ts` with the existing function signature:
  ```ts
  saveEditorFeedback({
    prompt: JSON.stringify(instructions),
    ffmpeg_commands_generated: 'fcpxml_export',   // string field, records export type
    feedback: '',
    feedback_type: 'good'                          // uses existing 'good' | 'mistake' union
  })
  ```
- Non-blocking: failure is caught silently and logged to the console

---

## UI Layout

Three-panel layout with a bottom action bar. Matches the existing dark premium aesthetic.

**Responsive breakpoints:** panels stack vertically below `xl`; side-by-side at `xl` with left panel `w-64` fixed, center `flex-1`, right `w-80` fixed.

### Left Panel — Clip List

- Upload zone at top: drag-drop area or "Browse" button, accepts `.mp4 .mov .m4v`
- Each clip renders as a card: 64×64 thumbnail, filename (truncated), duration badge
- Cards are drag-drop reorderable via HTML5 drag API (no library)
- "Clear all" link at bottom; removing a clip or clearing all calls `URL.revokeObjectURL(clip.thumbnailUrl)` for each affected clip
- `analyzed` state shown as a subtle checkmark badge on the clip card

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
- Supabase save failure: caught, logged to console, non-blocking

---

## What Is Not Changing

- FFmpeg.wasm initialization pattern (identical to existing)
- Anthropic API fetch pattern (identical to existing)
- Supabase client import (`src/lib/supabase.ts`)
- `saveEditorFeedback` function signature in `src/lib/db.ts`
- CSS design tokens and component styling conventions
- Sidebar nav entry (still `id: 'editor'`)
