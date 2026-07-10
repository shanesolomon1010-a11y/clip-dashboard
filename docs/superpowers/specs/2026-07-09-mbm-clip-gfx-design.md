# MBM Clip GFX — Design

**Date:** 2026-07-09
**Status:** Approved. Framework decided: **Remotion** (2026-07-10). Bakeoff dropped —
see "Framework decision" below.
**Owner:** Shane

## Problem

MBM clips ship with no motion graphics. Hiring a GFX editor is expensive and doesn't
scale with clip volume. We want to generate explainer graphics programmatically —
graphics that illustrate what the speaker is saying.

Canonical example: the speaker says "five media buyers, three do this well, two don't."
Five figures appear on screen; three turn green, two turn red.

## Goal

Produce, for a given finished vertical clip, a **transparent overlay video** containing
motion graphics timed to the speech, which the existing human editor drops onto their
timeline as a single layer.

Long-term: the graphics are chosen by Claude from a transcript. Short-term: Shane
chooses them by hand, in order to develop the taste that the automated version will
later encode.

## Non-goals (explicitly deferred)

- Whisper transcription (Phase 2)
- Claude-authored cues (Phase 3)
- Any dashboard UI
- Palmier integration / dead-space cutting — a genuinely separate project that shares
  no code with this one
- Longform video graphics
- Cloud rendering (Lambda or otherwise)
- Burning graphics into a final MP4. We emit a layer; the editor keeps veto power and
  their master is never re-encoded by us.

## Key insight: the renderer does not decide

The system is two halves with a hard seam between them:

1. **The library** — parameterized GFX primitives. `FigureGroup` takes
   `{count, states}` and animates itself. Pure, deterministic, framework-level.
2. **The director** — whatever chooses the props and timings, and emits a cue file.

Phase 1 the director is Shane, typing JSON. Phase 3 the director is Claude, emitting
the same JSON. **The cue file is the seam.** Getting its schema right now means Phase 3
is a prompt plus a validator, not a rewrite.

Every hand-authored cue file from Phase 1 becomes a worked example for Phase 3. Taste
accumulates as data rather than evaporating.

### Which clips get graphics

Not all of them, and that's correct. Graphics earn their place when the speaker
**enumerates, compares, or quantifies** — "five media buyers", "three good, two bad",
"we went from $2k to $40k", "there are two ways to do this". Purely narrative speech
with no countable structure gets nothing; forcing a graphic onto it reads as filler.
This distinction is itself detectable from a transcript, and is a far more tractable
problem than "invent a bespoke graphic for arbitrary speech."

## Framework decision — Remotion

Decided 2026-07-10: build on **Remotion**, no bakeoff. Rationale: it is React (the rest
of the stack), mature and stable, has confirmed alpha-export, ships an official agent
skill, and reaches the Phase 3 agent-authored endgame with only slightly more friction
than HyperFrames. The deciding factor was avoiding the cost of learning two frameworks
while also learning the underlying concept for the first time — not a claim that the two
are technically identical (they differ on license and agent-fit; see below).

The one thing this decision does **not** resolve is Remotion's license (see Risks). That
is a headcount/budget question, not a technical one.

The four bakeoff criteria below are retained not as a comparison but as **quality bars**
for the Remotion `FigureGroup`: alpha export must actually work end to end; the preview
loop must feel fast; Claude must be able to edit the graphic from plain-English requests;
and the file must be legible cold six months later.

### Framework comparison (retained for the record)

| | Remotion | HyperFrames |
|---|---|---|
| Version | 4.0.487 (mature, pre-dates hype) | v0.7.48 (Apr 2026, pre-1.0) |
| Model | React components, `useCurrentFrame()` | Plain HTML + `data-start` / `data-duration` / `data-track-index` |
| License | Free ≤3 employees; **paid company license above** | Apache 2.0 |
| Alpha export | **Confirmed**: `--codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png` | **Unconfirmed** — docs mention "transparent overlay", flags not verified |
| Bets on | React being the dominant UI language | Agents authoring HTML |
| Ecosystem fit | Matches our Next.js/React stack | Shares nothing with the dashboard |
| Churn risk | Low | 287 releases in <3 months |

Why the choice was non-obvious (and why it still went to Remotion): HyperFrames'
Apache 2.0 sidesteps Remotion's license entirely, and Phase 3's endgame — Claude
authoring graphics — is literally HyperFrames' design thesis. Both real advantages.
They were outweighed by Remotion's maturity, React-stack fit, confirmed alpha export,
and the cost of learning a second, pre-1.0, fast-moving tool during a first pass.

The circulating "HyperFrames renders 3× faster" benchmark is one blog, one prompt, and
conflates one-time build cost with per-render cost. Render speed is not the bottleneck.
Several "HyperFrames vs Remotion" posts sit on three different HyperFrames-branded
domains and should be treated as marketing.

### Quality bars for the Remotion FigureGroup

1. **Alpha overlay export works end to end.** Render, import to the editor, confirm true
   transparency. This is a gate, not a nicety — the whole deliverable is an overlay.
2. **Preview loop feels fast.** Edit a timing value, save, see the change without losing
   scrub position.
3. **Claude can edit it from plain English.** "Make them stagger in", "make the bad ones
   shake", "move it 400ms later" should yield correct output with little correction.
   This is the Phase 3 rehearsal.
4. **Legible cold.** Openable and comprehensible six months later.

## Architecture

### Location

A `gfx/` directory at the repo root with its own `package.json`. A sibling to `src/`,
not inside it. Rationale: the renderer needs its own entry point and pulls a headless
Chromium; the Next.js build must never see it.

Nothing crosses the boundary in Phase 1. The dashboard does not know `gfx/` exists,
and `gfx/` does not touch Supabase. This is deliberate — the dashboard runs four
production crons and the founder report, and this work must not be able to break it.

Source clips live in `gfx/public/` (or a symlink to `~/Movies`) so the renderer can
load them as static files. **Clips are not committed to git.**

### Two compositions, one component tree

The single structural decision that prevents pain later:

- **`ClipPreview`** — source video underneath, graphics on top. This is what you scrub.
  Timing is judged here, because a graphic landing 200ms late is obvious over video and
  invisible on a blank canvas.
- **`GfxOverlay`** — identical graphics, identical props, identical frames, but **no
  video and a transparent background**. This is what renders to ProRes 4444 `.mov`.

Same components, two wrappers. Preview against reality; ship a layer.

### Frame rate — load-bearing

Source clips are **1080×1920 @ 29.97fps** (`30000/1001`), verified via `ffprobe` on
`MBM015-CLIP-003-Headline.mp4` (41.07s). NTSC, not 30.

Consequences, both mandatory:

- **The overlay must be rendered at the source's exact fps.** Rendering at 30 against a
  29.97 master drifts ~0.1%, which compounds across longer clips and misaligns graphics
  from speech.
- **Cues are authored in seconds, never frames.** Frame numbers silently mean different
  instants at different frame rates. Seconds are the invariant; the renderer converts.

Do not assume 30fps. Read it from the source file per clip.

### Cue file schema

One JSON file per clip. This is the contract between the director and the renderer, and
the interface Phase 3 must satisfy.

```json
{
  "clip": "MBM015-CLIP-003",
  "source": "MBM015-CLIP-003-Headline.mp4",
  "fps": 29.97,
  "width": 1080,
  "height": 1920,
  "cues": [
    {
      "id": "c1",
      "component": "FigureGroup",
      "fromSeconds": 4.2,
      "durationSeconds": 3.5,
      "props": {
        "count": 5,
        "states": ["good", "good", "good", "bad", "bad"]
      }
    }
  ]
}
```

Constraints:

- `fps`, `width`, `height` are read from the source file, not assumed.
- `fps` is stored as an exact rational (`fpsNum: 30000, fpsDen: 1001`), not the decimal
  `29.97`. Rounding to two places reintroduces precisely the drift this section exists
  to prevent. The `"fps": 29.97` above is illustrative; the implementation carries the
  rational.
- Timing is in seconds. Always.
- `props` is validated against a per-component schema before render. In Phase 3 this
  validator is what stops a hallucinated cue from reaching the renderer.

### Phase 1 scope: exactly one graphic

`FigureGroup`. N figures appear; each carries a state of `neutral | good | bad`;
states transition on a schedule. Props: `count`, `states`, reveal stagger.

**Not five components.** One, taken the whole way: written, previewed over a real
MBM015 clip, rendered to `.mov`, imported by the editor, watched back on a phone.
That round trip teaches more than four more primitives on a blank canvas would.

`StatCounter`, `BarCompare`, and `Checklist` are the obvious next three. They come
after the pipeline is proven end to end, not before.

### Working loop

```bash
cd gfx && npx remotion studio
# scrub, edit cues/MBM015-CLIP-003.json, watch it update
npx remotion render GfxOverlay out/MBM015-CLIP-003-gfx.mov \
  --props=./cues/MBM015-CLIP-003.json \
  --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png
```

Hand the `.mov` to the editor.

## Later phases (sketches — deliberately not designed)

**Phase 2 — remove the timing labor.** Whisper (local, word-level timestamps) produces
a transcript. Authoring a cue becomes "click the word, choose a component" rather than
guessing a timestamp. Whisper was chosen over Palmier's `get_transcript`, platform
captions, and manual marking: it is free, offline, word-level, and needs only the mp4.

**Phase 3 — the director.** Claude reads the transcript, proposes cues, Shane approves
or rejects. Requires a corpus of hand-authored Phase 1 cue files as reference. Building
this before Phase 1 produces slop, because nothing defines "good".

These are sketches on purpose. Phase 1 will invalidate assumptions in them, and
designing them now is guessing.

## Risks

**Remotion licensing — the one open blocker.** Free for individuals and companies of ≤3
employees; paid company license above that. **Resolve MBM's headcount before building
on it.** This is the only risk that code can't fix, and it costs thirty seconds to
check. If MBM is over the threshold, price the license before Phase 1.

**Taste, not technology.** The framework will work. Whether an animated figure group
makes an MBM clip *better* is unproven. This is a design problem no framework solves,
and the fastest way to learn the answer is one graphic over one real clip. Discovering
it in Phase 1 is cheap; discovering it after building a director is not.

## Corrections to repo docs

`CLAUDE.md` states that `EditorView` performs client-side video processing with
FFmpeg.wasm. **This is stale.** There is no `EditorView.tsx` in `src/components/views/`
and no ffmpeg import anywhere in `src/`, though `@ffmpeg/ffmpeg` and `@ffmpeg/util`
remain in `package.json` dependencies. Fix the CLAUDE.md line; decide separately
whether to drop the unused dependencies.

## Facts verified for this design

- Node `v24.13.0`
- `remotion@4.0.487`; peer deps `react >=16.8.0` — compatible with the app's React 18
- Remotion transparent-render flags confirmed against official docs
- HyperFrames: `heygen-com/hyperframes`, Apache 2.0, `v0.7.48` (2026-07-10)
- 20 clip files in `~/Movies`; `MBM015-CLIP-003-Headline.mp4` is 1080×1920, 29.97fps, 41.07s
- `clip_details` already carries `headline_banner`, `question_banner`, `video_url`,
  `thumbnail_url` — unused by this design, but relevant to a future dashboard
  integration. Note the standing rule: never select `thumbnail_base64` from the
  anon/PostgREST client.

## Open questions

1. **MBM headcount** — determines whether Remotion is free. Must be answered before
   Phase 1 build starts; it is the only unresolved item on the framework choice.
2. **Visual language** — no brand motion system exists yet. `PLATFORM_COLORS` is
   analytics chrome (`#FF4444` YouTube, `#C855E8` Instagram), not a GFX palette. The
   bakeoff should not try to settle this; it only needs to be legible enough to judge.
   Deliberately left open: the graphic's look is Phase 1's real subject.
