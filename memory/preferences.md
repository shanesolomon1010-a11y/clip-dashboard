# UI & Code Preferences

## Visual aesthetic
- Dark premium editorial look — deep dark backgrounds, subtle borders (`white/[0.05]`), gold accents
- CSS variables for all theme tokens: `var(--bg-base)`, `var(--bg-card)`, `var(--text-1/2/3)`, `var(--gold)`, `var(--gold-border)`, `var(--gold-hi)`
- No hard-coded hex values in component JSX — always use the CSS variable equivalents
- Rounded corners: `rounded-xl` (cards, inputs) or `rounded-2xl` (panels)

## Component patterns
- Cards: `bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl`
- Section headers inside cards: `px-4 py-3 border-b border-white/[0.04]`, 13px semibold
- Buttons (primary): gold background, dark text, `font-semibold`, disabled at 40% opacity
- Buttons (secondary): transparent with `border-white/[0.07]`, hover lightens slightly
- Textareas/inputs: `bg-white/[0.03] border border-white/[0.06]`, focus border switches to `var(--gold-border)`

## Interaction patterns
- Drag-to-reorder on clip lists (HTML5 drag API, `dragIndexRef`)
- Optimistic UI for Supabase mutations — update local state first, persist in background
- Log panels use monospace 11px text, color-coded: gold for events, red for errors, muted for info

## Accessibility & testability
- `data-testid` attributes on all interactive elements for Playwright selectors
- `'use client'` at top of every component that uses hooks or browser APIs

## Icons
- All icons are inline SVG in `src/components/Icons.tsx` — never install an icon library
- Add new icons to that file, don't create separate icon files

## TypeScript
- `@typescript-eslint/no-explicit-any` enforced — type Recharts tooltip props explicitly
- `@typescript-eslint/no-unused-vars` enforced — remove unused imports before committing
