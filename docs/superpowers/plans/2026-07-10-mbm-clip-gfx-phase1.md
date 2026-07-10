# MBM Clip GFX — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a hand-authored motion-graphic (`FigureGroup`) as a transparent ProRes 4444 overlay `.mov`, timed to one real MBM clip, that a human editor drops onto their timeline as one layer.

**Architecture:** A self-contained Remotion project in `gfx/` (its own `package.json`, never seen by the Next.js build). A cue JSON file is the composition's input props. Two compositions share one component tree: `ClipPreview` (source video + graphics, for judging timing) and `GfxOverlay` (graphics only, transparent, for rendering). One graphic exists: `FigureGroup`. Timing is authored in seconds and converted to frames at the source's exact fps.

**Tech Stack:** Remotion 4.0.487, React 18, TypeScript, Zod (cue validation), Vitest (unit tests for the two pure modules), ffprobe (alpha-channel gate).

## Global Constraints

- **Framework: Remotion only.** No HyperFrames, no bakeoff.
- **Isolation:** `gfx/` has its own `package.json`. Nothing in `src/` imports from `gfx/` and nothing in `gfx/` imports from `src/` or touches Supabase.
- **fps is a rational, never a decimal literal.** Source is `30000/1001` (29.97002997…). Store `fpsNum: 30000, fpsDen: 1001`; compute `fps = fpsNum/fpsDen` at runtime. Never write `29.97` into code or the cue file.
- **All cue timing is in seconds.** Frames are derived, never authored.
- **Overlay renders at the source fps** (from the cue file), not 30.
- **Clips are not committed.** `gfx/public/*.mp4`, `gfx/out/`, `gfx/node_modules` are gitignored.
- **Cue-file `component` is a literal `"FigureGroup"`** in Phase 1; it becomes a discriminated union when more graphics are added. Do not build for graphics that don't exist yet (YAGNI).
- **No `any` types.** Type everything explicitly (project ESLint rule, though `gfx/` is outside the Next lint root, keep the discipline).
- **Colors are placeholders.** `good #22C55E`, `bad #EF4444`, `neutral #64748B`. Tuning the look is Phase 1's real subject, done by eye in Studio — not settled by this plan.
- **Do not `git push`.** Commit only; Shane pushes.

**Reference clip:** `~/Movies/MBM015-CLIP-003-Headline.mp4` — 1080×1920, `30000/1001` fps, 41.074367 s (verified via ffprobe 2026-07-10).

---

## File Structure

```
gfx/
  .gitignore              # node_modules, out/, public/*.mp4
  package.json            # own deps + scripts; not part of Next build
  tsconfig.json
  vitest.config.ts
  src/
    index.ts              # registerRoot(RemotionRoot)
    Root.tsx              # registers ClipPreview + GfxOverlay, calculateMetadata
    cues/
      schema.ts           # Zod CueFile schema + inferred types
      schema.test.ts
    timing.ts             # secondsToFrames, fpsFromRational, cueToSequenceTiming
    timing.test.ts
    components/
      FigureGroup.tsx     # the one graphic
      CueRenderer.tsx     # switches cue.component -> component
    compositions/
      GfxScene.tsx        # maps cues[] to <Sequence>s (shared by both comps)
      ClipPreview.tsx     # OffthreadVideo + GfxScene
      GfxOverlay.tsx      # GfxScene only, transparent bg
  cues/
    MBM015-CLIP-003.json  # hand-authored cue file (committed)
  public/
    .gitkeep              # MBM015-CLIP-003-Headline.mp4 copied here, gitignored
  out/                    # rendered .mov (gitignored)
```

---

## Task 1: Scaffold `gfx/` package + timing module (TDD)

Establishes the isolated package and toolchain, proven by the first real unit — the seconds→frames math that the fps-drift constraint depends on.

**Files:**
- Create: `gfx/package.json`
- Create: `gfx/tsconfig.json`
- Create: `gfx/vitest.config.ts`
- Create: `gfx/.gitignore`
- Create: `gfx/src/timing.ts`
- Test: `gfx/src/timing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fpsFromRational(num: number, den: number): number`
  - `secondsToFrames(seconds: number, fps: number): number` — rounds to nearest integer frame
  - `cueToSequenceTiming(cue: { fromSeconds: number; durationSeconds: number }, fps: number): { from: number; durationInFrames: number }` — `durationInFrames` is at least 1

- [ ] **Step 1: Create `gfx/package.json`**

```json
{
  "name": "mbm-gfx",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "studio": "remotion studio",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "render:preview": "remotion render ClipPreview out/MBM015-CLIP-003-preview.mp4 --props=./cues/MBM015-CLIP-003.json",
    "render:overlay": "remotion render GfxOverlay out/MBM015-CLIP-003-gfx.mov --props=./cues/MBM015-CLIP-003.json --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png"
  },
  "dependencies": {
    "@remotion/cli": "4.0.487",
    "react": "^18",
    "react-dom": "^18",
    "remotion": "4.0.487",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `gfx/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "cues"]
}
```

- [ ] **Step 3: Create `gfx/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `gfx/.gitignore`**

```gitignore
node_modules
out
public/*.mp4
public/*.mov
```

- [ ] **Step 5: Write the failing test — `gfx/src/timing.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { fpsFromRational, secondsToFrames, cueToSequenceTiming } from './timing';

describe('timing', () => {
  it('derives fps from a rational', () => {
    expect(fpsFromRational(30000, 1001)).toBeCloseTo(29.97003, 4);
  });

  it('rounds seconds to nearest frame at NTSC fps', () => {
    const fps = fpsFromRational(30000, 1001);
    expect(secondsToFrames(3.5, fps)).toBe(105); // 104.895 -> 105
    expect(secondsToFrames(4.2, fps)).toBe(126); // 125.874 -> 126
    expect(secondsToFrames(0, fps)).toBe(0);
  });

  it('maps a cue to sequence timing with a floor of 1 frame', () => {
    const fps = fpsFromRational(30000, 1001);
    expect(cueToSequenceTiming({ fromSeconds: 4.2, durationSeconds: 3.5 }, fps)).toEqual({
      from: 126,
      durationInFrames: 105,
    });
    expect(cueToSequenceTiming({ fromSeconds: 0, durationSeconds: 0.001 }, fps).durationInFrames).toBe(1);
  });
});
```

- [ ] **Step 6: Install deps and run the test to verify it fails**

Run:
```bash
cd gfx && npm install && npm test
```
Expected: install succeeds; Vitest FAILS with a module-resolution / "does not provide an export named 'fpsFromRational'" error (because `timing.ts` does not exist yet).

- [ ] **Step 7: Write minimal implementation — `gfx/src/timing.ts`**

```ts
export const fpsFromRational = (num: number, den: number): number => num / den;

export const secondsToFrames = (seconds: number, fps: number): number =>
  Math.round(seconds * fps);

export const cueToSequenceTiming = (
  cue: { fromSeconds: number; durationSeconds: number },
  fps: number,
): { from: number; durationInFrames: number } => ({
  from: secondsToFrames(cue.fromSeconds, fps),
  durationInFrames: Math.max(1, secondsToFrames(cue.durationSeconds, fps)),
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd gfx && npm test`
Expected: PASS, 3 tests green.

- [ ] **Step 9: Commit**

```bash
cd /Users/shane/clip-dashboard
git add gfx/package.json gfx/package-lock.json gfx/tsconfig.json gfx/vitest.config.ts gfx/.gitignore gfx/src/timing.ts gfx/src/timing.test.ts
git commit -m "feat(gfx): scaffold Remotion package + fps-exact timing helpers"
```

---

## Task 2: Cue-file schema + validation (TDD)

The cue file is the contract between the director (Shane now, Claude later) and the renderer. Getting it validated and typed here is what makes Phase 3 a validator swap rather than a rewrite.

**Files:**
- Create: `gfx/src/cues/schema.ts`
- Test: `gfx/src/cues/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CueFileSchema` (Zod schema) and `parseCueFile(raw: unknown): CueFile`
  - Types `CueFile`, `Cue`, `FigureGroupProps`, `FigureState` (`'neutral' | 'good' | 'bad'`)

- [ ] **Step 1: Write the failing test — `gfx/src/cues/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseCueFile } from './schema';

const valid = {
  clip: 'MBM015-CLIP-003',
  source: 'MBM015-CLIP-003-Headline.mp4',
  fpsNum: 30000,
  fpsDen: 1001,
  width: 1080,
  height: 1920,
  durationSeconds: 41.074367,
  cues: [
    {
      id: 'c1',
      component: 'FigureGroup',
      fromSeconds: 4.2,
      durationSeconds: 3.5,
      props: { count: 5, states: ['good', 'good', 'good', 'bad', 'bad'] },
    },
  ],
};

describe('parseCueFile', () => {
  it('accepts a valid cue file and defaults optional FigureGroup props', () => {
    const parsed = parseCueFile(valid);
    expect(parsed.cues[0].props.staggerSeconds).toBe(0.15);
    expect(parsed.cues[0].props.colorDelaySeconds).toBe(0.8);
  });

  it('rejects a cue whose states length does not equal count', () => {
    const bad = structuredClone(valid);
    bad.cues[0].props.states = ['good', 'bad'];
    expect(() => parseCueFile(bad)).toThrow();
  });

  it('rejects an unknown component', () => {
    const bad = structuredClone(valid);
    (bad.cues[0] as { component: string }).component = 'Explosion';
    expect(() => parseCueFile(bad)).toThrow();
  });

  it('rejects a decimal fps field (fps must be rational)', () => {
    const bad = structuredClone(valid) as Record<string, unknown>;
    delete bad.fpsNum;
    expect(() => parseCueFile(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gfx && npm test -- schema`
Expected: FAIL — cannot resolve `./schema` / no `parseCueFile` export.

- [ ] **Step 3: Write minimal implementation — `gfx/src/cues/schema.ts`**

```ts
import { z } from 'zod';

export const FigureStateSchema = z.enum(['neutral', 'good', 'bad']);
export type FigureState = z.infer<typeof FigureStateSchema>;

export const FigureGroupPropsSchema = z
  .object({
    count: z.number().int().positive(),
    states: z.array(FigureStateSchema),
    staggerSeconds: z.number().nonnegative().default(0.15),
    colorDelaySeconds: z.number().nonnegative().default(0.8),
  })
  .refine((d) => d.states.length === d.count, {
    message: 'states length must equal count',
    path: ['states'],
  });
export type FigureGroupProps = z.infer<typeof FigureGroupPropsSchema>;

export const CueSchema = z.object({
  id: z.string().min(1),
  component: z.literal('FigureGroup'),
  fromSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive(),
  props: FigureGroupPropsSchema,
});
export type Cue = z.infer<typeof CueSchema>;

export const CueFileSchema = z.object({
  clip: z.string().min(1),
  source: z.string().min(1),
  fpsNum: z.number().int().positive(),
  fpsDen: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  cues: z.array(CueSchema),
});
export type CueFile = z.infer<typeof CueFileSchema>;

export const parseCueFile = (raw: unknown): CueFile => CueFileSchema.parse(raw);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd gfx && npm test`
Expected: PASS — all timing + schema tests green (7 total).

- [ ] **Step 5: Commit**

```bash
cd /Users/shane/clip-dashboard
git add gfx/src/cues/schema.ts gfx/src/cues/schema.test.ts
git commit -m "feat(gfx): Zod cue-file schema — the director/renderer contract"
```

---

## Task 3: FigureGroup graphic + compositions + Root

The visual layer. Correctness here is judged by eye in Studio (that's the point of Phase 1), so the automated gate is a **1-frame render smoke test** proving the compositions mount and export without error — plus `tsc`. Full visual tuning happens in Task 4.

**Files:**
- Create: `gfx/src/components/FigureGroup.tsx`
- Create: `gfx/src/components/CueRenderer.tsx`
- Create: `gfx/src/compositions/GfxScene.tsx`
- Create: `gfx/src/compositions/ClipPreview.tsx`
- Create: `gfx/src/compositions/GfxOverlay.tsx`
- Create: `gfx/src/Root.tsx`
- Create: `gfx/src/index.ts`
- Create: `gfx/cues/MBM015-CLIP-003.json` (minimal, so Studio/render have props; expanded in Task 4)
- Create: `gfx/public/.gitkeep`

**Interfaces:**
- Consumes: `parseCueFile`, `CueFile`, `Cue`, `FigureGroupProps`, `FigureState` (Task 2); `fpsFromRational`, `cueToSequenceTiming` (Task 1).
- Produces:
  - `FigureGroup: React.FC<FigureGroupProps>` — renders inside a `<Sequence>`, uses `useCurrentFrame()` relative to sequence start.
  - `CueRenderer: React.FC<{ cue: Cue }>`
  - `GfxScene: React.FC<CueFile>`
  - `ClipPreview: React.FC<CueFile>`, `GfxOverlay: React.FC<CueFile>`
  - Registered composition ids `"ClipPreview"` and `"GfxOverlay"`.

- [ ] **Step 1: Create the minimal cue file — `gfx/cues/MBM015-CLIP-003.json`**

```json
{
  "clip": "MBM015-CLIP-003",
  "source": "MBM015-CLIP-003-Headline.mp4",
  "fpsNum": 30000,
  "fpsDen": 1001,
  "width": 1080,
  "height": 1920,
  "durationSeconds": 41.074367,
  "cues": [
    {
      "id": "c1",
      "component": "FigureGroup",
      "fromSeconds": 4.2,
      "durationSeconds": 3.5,
      "props": { "count": 5, "states": ["good", "good", "good", "bad", "bad"] }
    }
  ]
}
```

- [ ] **Step 2: Create `gfx/public/.gitkeep`** (empty file) and copy the clip in

Run:
```bash
mkdir -p gfx/public && touch gfx/public/.gitkeep
cp ~/Movies/MBM015-CLIP-003-Headline.mp4 gfx/public/
```
Expected: `gfx/public/MBM015-CLIP-003-Headline.mp4` exists (gitignored; the `.gitkeep` keeps the dir).

- [ ] **Step 3: Write `gfx/src/components/FigureGroup.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { FigureGroupProps, FigureState } from '../cues/schema';

const STATE_COLOR: Record<FigureState, string> = {
  neutral: '#64748B',
  good: '#22C55E',
  bad: '#EF4444',
};

const Figure: React.FC<{ state: FigureState; revealFrame: number; colorFrame: number }> = ({
  state,
  revealFrame,
  colorFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame: frame - revealFrame, fps, config: { damping: 14, mass: 0.6 } });
  const scale = interpolate(enter, [0, 1], [0.4, 1]);
  const opacity = interpolate(frame, [revealFrame, revealFrame + 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const colorMix = interpolate(frame, [colorFrame, colorFrame + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const color = colorMix < 0.5 ? STATE_COLOR.neutral : STATE_COLOR[state];

  return (
    <div style={{ opacity, transform: `scale(${scale})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 120, height: 120, borderRadius: '50%', backgroundColor: color, boxShadow: '0 8px 30px rgba(0,0,0,0.45)', transition: 'none' }} />
      <div style={{ width: 96, height: 150, marginTop: 14, borderRadius: 40, backgroundColor: color, boxShadow: '0 8px 30px rgba(0,0,0,0.45)' }} />
    </div>
  );
};

export const FigureGroup: React.FC<FigureGroupProps> = ({ count, states, staggerSeconds, colorDelaySeconds }) => {
  const { fps } = useVideoConfig();
  const staggerFrames = staggerSeconds * fps;
  const colorDelayFrames = colorDelaySeconds * fps;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 48 }}>
        {Array.from({ length: count }).map((_, i) => {
          const revealFrame = i * staggerFrames;
          return (
            <Figure
              key={i}
              state={states[i]}
              revealFrame={revealFrame}
              colorFrame={revealFrame + colorDelayFrames}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Write `gfx/src/components/CueRenderer.tsx`**

```tsx
import React from 'react';
import type { Cue } from '../cues/schema';
import { FigureGroup } from './FigureGroup';

export const CueRenderer: React.FC<{ cue: Cue }> = ({ cue }) => {
  switch (cue.component) {
    case 'FigureGroup':
      return <FigureGroup {...cue.props} />;
    default: {
      const _exhaustive: never = cue.component;
      return _exhaustive;
    }
  }
};
```

- [ ] **Step 5: Write `gfx/src/compositions/GfxScene.tsx`**

```tsx
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import type { CueFile } from '../cues/schema';
import { cueToSequenceTiming } from '../timing';
import { CueRenderer } from '../components/CueRenderer';

export const GfxScene: React.FC<CueFile> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((cue) => {
        const { from, durationInFrames } = cueToSequenceTiming(cue, fps);
        return (
          <Sequence key={cue.id} from={from} durationInFrames={durationInFrames}>
            <CueRenderer cue={cue} />
          </Sequence>
        );
      })}
    </>
  );
};
```

- [ ] **Step 6: Write `gfx/src/compositions/ClipPreview.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import type { CueFile } from '../cues/schema';
import { GfxScene } from './GfxScene';

export const ClipPreview: React.FC<CueFile> = (props) => (
  <AbsoluteFill style={{ backgroundColor: 'black' }}>
    <OffthreadVideo src={staticFile(props.source)} />
    <GfxScene {...props} />
  </AbsoluteFill>
);
```

- [ ] **Step 7: Write `gfx/src/compositions/GfxOverlay.tsx`** (no background — transparency depends on this)

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { CueFile } from '../cues/schema';
import { GfxScene } from './GfxScene';

export const GfxOverlay: React.FC<CueFile> = (props) => (
  <AbsoluteFill>
    <GfxScene {...props} />
  </AbsoluteFill>
);
```

- [ ] **Step 8: Write `gfx/src/Root.tsx`**

```tsx
import React from 'react';
import { Composition } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import { ClipPreview } from './compositions/ClipPreview';
import { GfxOverlay } from './compositions/GfxOverlay';
import { parseCueFile, type CueFile } from './cues/schema';
import rawCues from '../cues/MBM015-CLIP-003.json';

const defaultProps: CueFile = parseCueFile(rawCues);

const calculateMetadata: CalculateMetadataFunction<CueFile> = ({ props }) => {
  const fps = props.fpsNum / props.fpsDen;
  return {
    fps,
    width: props.width,
    height: props.height,
    durationInFrames: Math.round(props.durationSeconds * fps),
  };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ClipPreview"
      component={ClipPreview}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="GfxOverlay"
      component={GfxOverlay}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
```

Note: the `durationInFrames`/`fps` literals on `<Composition>` are placeholders required by the API; `calculateMetadata` overrides them from the cue file at load. The `30` here is never used for rendering.

- [ ] **Step 9: Write `gfx/src/index.ts`**

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

- [ ] **Step 10: Typecheck**

Run: `cd gfx && npm run typecheck`
Expected: PASS, no errors. (If `rawCues` JSON import errors, confirm `resolveJsonModule` is set — it is, in Task 1's tsconfig.)

- [ ] **Step 11: Render-smoke gate — render a single frame of each composition**

Run:
```bash
cd gfx
npx remotion render GfxOverlay out/smoke-overlay.png --props=./cues/MBM015-CLIP-003.json --frames=150-150
npx remotion render ClipPreview out/smoke-preview.png --props=./cues/MBM015-CLIP-003.json --frames=150-150
ls -la out/smoke-overlay.png out/smoke-preview.png
```
Expected: both PNGs are written (first run downloads a Chromium — allow time). This proves both compositions mount, the JSON props validate, `staticFile` resolves the clip, and `FigureGroup` renders without throwing. Frame 150 (~5.0s) lands inside the `c1` cue window so figures are on screen.

- [ ] **Step 12: Commit**

```bash
cd /Users/shane/clip-dashboard
git add gfx/src/ gfx/cues/MBM015-CLIP-003.json gfx/public/.gitkeep
git commit -m "feat(gfx): FigureGroup graphic + ClipPreview/GfxOverlay compositions"
```

---

## Task 4: Author cues in Studio, render preview + transparent overlay, gate on alpha

Ships the actual Phase 1 deliverable: a `.mov` overlay whose transparency is verified by ffprobe, not assumed. Timing/look tuning happens by eye here — this task's automated gate is the alpha check.

**Files:**
- Modify: `gfx/cues/MBM015-CLIP-003.json` (final hand-tuned timings/states)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `gfx/out/MBM015-CLIP-003-gfx.mov` (transparent ProRes 4444), gitignored.

- [ ] **Step 1: Open Studio and tune the cue by eye**

Run: `cd gfx && npm run studio`
Then, in the browser Studio:
1. Select the **ClipPreview** composition.
2. Scrub to where the speaker enumerates people (adjust `fromSeconds` so figures appear on that beat).
3. Edit `gfx/cues/MBM015-CLIP-003.json` — `fromSeconds`, `durationSeconds`, `count`, `states`, and optionally `staggerSeconds` / `colorDelaySeconds` — saving to hot-reload until the timing reads right over the video.

This is judgment, not a fixed value. The quality bars from the spec apply: does the graphic actually improve the clip, and does it read cleanly over the footage.

- [ ] **Step 2: Confirm the tuned cue still validates**

Run: `cd gfx && npm test -- schema`
Expected: PASS — the hand-edited JSON still satisfies `parseCueFile` (guards against a typo like a `states`/`count` mismatch introduced while tuning).

- [ ] **Step 3: Render the preview (graphics burned over video) for a sanity watch**

Run: `cd gfx && npm run render:preview`
Expected: `out/MBM015-CLIP-003-preview.mp4` written. Open it; confirm the figures land on the right words and the color flip reads. This file is a throwaway for judging, not a deliverable.

- [ ] **Step 4: Render the transparent overlay**

Run: `cd gfx && npm run render:overlay`
Expected: `out/MBM015-CLIP-003-gfx.mov` written using ProRes 4444 with `yuva444p10le`.

- [ ] **Step 5: Alpha-channel gate (ffprobe)**

Run:
```bash
cd gfx
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt -of default=nw=1 out/MBM015-CLIP-003-gfx.mov
```
Expected output contains:
```
codec_name=prores
pix_fmt=yuva444p10le
```
The `yuva…` pixel format is the proof of a real alpha channel. If `pix_fmt` lacks the leading `a` (e.g. `yuv444p10le`), transparency did NOT export — stop and diagnose before declaring success (this is the spec's disqualifying gate; do not skip it).

- [ ] **Step 6: Human composite check (the real acceptance)**

Import `out/MBM015-CLIP-003-gfx.mov` into the editor (or any NLE) as a layer over the source clip. Confirm: the background is transparent (source video shows through), figures appear on the intended beat, three resolve green and two red. This is the end-to-end round trip the whole phase exists to prove.

- [ ] **Step 7: Commit the final cue file**

```bash
cd /Users/shane/clip-dashboard
git add gfx/cues/MBM015-CLIP-003.json
git commit -m "feat(gfx): hand-authored cue file for MBM015-CLIP-003"
```

(The `.mov` and `.mp4` outputs are gitignored and not committed.)

---

## Definition of done

- `cd gfx && npm test` passes (timing + schema).
- `cd gfx && npm run typecheck` passes.
- `npm run render:overlay` produces `out/MBM015-CLIP-003-gfx.mov`.
- ffprobe reports `pix_fmt=yuva444p10le` — alpha confirmed.
- The overlay, dropped over the source clip in an editor, shows transparent background with five figures resolving 3 green / 2 red on the intended beat.
- Nothing in `src/` references `gfx/`; the Next.js build is untouched (`cd /Users/shane/clip-dashboard && npm run build` still passes — run once as a regression check).

## Deferred to later phases (do NOT build now)

- Whisper transcription (Phase 2).
- Claude-authored cues (Phase 3) — the schema and validator built here are the seam it plugs into.
- `StatCounter`, `BarCompare`, `Checklist` — added only after this pipeline is proven; each extends `component` into a discriminated union and adds a `CueRenderer` case.
- Dashboard UI, Palmier dead-space cutting, longform, Lambda cloud rendering.

## Self-review notes

- **Spec coverage:** location `gfx/` sibling (Task 1) ✓; isolation, no cross-imports (constraint + DoD) ✓; two compositions sharing one tree (Task 3) ✓; single graphic `FigureGroup` (Task 3) ✓; cue schema as the seam (Task 2) ✓; fps rational, seconds-authored (Task 1 timing + schema `fpsNum/fpsDen`) ✓; transparent ProRes 4444 with confirmed flags + alpha gate (Task 4) ✓; clips uncommitted (Task 1 .gitignore) ✓; quality bars as human checks (Task 4 steps 1/6) ✓; deferrals honored ✓.
- **License open item** (MBM headcount → Remotion cost) is a business decision from the spec, not an implementation step; flagged, not tasked.
- **Type consistency:** `CueFile`/`Cue`/`FigureGroupProps`/`FigureState` names identical across Tasks 2–3; `cueToSequenceTiming` signature matches between Task 1 definition and Task 3 use; compositions all typed `React.FC<CueFile>`.
