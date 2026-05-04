# Design System: MediaBuyer.com

> **Updated — verification flow lock.** This revision folds in everything
> that came out of the application + vetting flow work: the verification
> UI kit (`StepShell`, `RadioCard` / `RadioCardGroup`,
> `RecommendedChoiceGroup`, `Field` / `FieldGroup` primitives, `Segmented`,
> `Toggle`, `Textarea`, `FormCombobox`, `OTPInput`, `PhasedProgressBar`,
> `LiteHeaderA`), the **step-template naming convention**, the
> **heading + subtitle rules**, the **floating-label input pattern**, the
> **Pill Button** chrome control, and the updated **Lite Header A /
> Sticky Footer / Progress Bar** specs. Earlier sections (color, type,
> cards, marketing/platform headers, brand voice) are unchanged in
> intent but cross-linked where the verification work touched them.

---

## 1. Visual Theme & Atmosphere

MediaBuyer.com is a vetted talent marketplace for media buyers — the Toptal of paid advertising. The design communicates one thing: elite competence, made obvious. When someone encounters any surface of the brand, their reaction should be: "These people are operating on a different level — and I want in."

The visual direction is **Engineered Calm** — a light canvas (`#FFFFFF`) with dark navy accents (`#111827`), data-forward layouts, and generous whitespace. Two blues with distinct roles: a deeper brand blue (`#204AC2`) for the wordmark, and an action blue (`#3358D4`) for all interactive UI. The system uses two typefaces with non-overlapping roles: DIN Bold declares (headlines, titles, stats), Inter communicates (body, UI, buttons). Nothing else.

The design sits between Stripe's architectural precision and Airbnb's marketplace warmth, with Starlink's brand conviction. It is not dark-mode by default, not playful or rounded, not aggressive or salesy. The precision of the vetting process should be visible in the precision of the design.

**Brand Triangle:** Precision → Conviction → Warmth (weighted in that order).

**Key Characteristics**
- DIN Bold for all declarations: headlines, card titles, profile names, stat numbers
- Inter for everything that communicates: body text, UI elements, buttons, labels
- Two blues: Brand blue (`#204AC2`) for the wordmark only, Action blue (`#3358D4`) for all UI elements — buttons, links, badges
- Navy-tinted dark (`#111827`) for text and dark sections — not pure black
- Blue-tinted secondary gray (`#64748D`) that connects back to the brand blue family
- One additional semantic color: gold (`#F5B800`) reserved exclusively for "personal value / marked for me" affordances (saved/bookmarked items). Not interchangeable with action blue.
- Three border-radius tokens: 8px (interactive), 12px (containers), 999px (pills) — nothing else
- Light card shadows (`0px 1px 9px rgba(0,0,0,0.05)`) — subtle, not floating
- Data displayed prominently — stats, numbers, credentials are primary content

---

## 2. Color Palette & Roles

### Primary Accent — Two Blues
- **Brand Blue / Wordmark** (`#204AC2`): Logo wordmark "MEDIABUYER" only. Deeper, more authoritative. Never used for UI elements.
- **Action Blue** (`#3358D4`): Buttons, links, CTAs, active states, badges, status indicators. All interactive UI.
- **Hover Blue** (`#2B4ABF`): Primary button hover. Inline link active/pressed state.
- **Link Text** (`#3358D4`): Inline links in body copy. Same as action blue.
- **Rule:** Brand blue is for the logo only. Action blue is for everything else.

### Text
- **Primary Text** (`#111827`): Headings, body text, strong labels.
- **Secondary Text** (`#64748D`): Descriptions, subtitles, metadata, captions, ghost button text, secondary action buttons (Cancel, Skip, Maybe later), bookmark default state, header chrome icons. The workhorse gray.
- **Tertiary Text** (`#9CA3AF`): Filter counts, timestamps, fine print, muted labels, placeholders.

### Backgrounds & Surfaces
- **Page Background** (`#FFFFFF`): Primary canvas.
- **Product Background** (`#FFFFFF` or `#F9FAFB`): Decide during page design — white is cleanest, off-white is fallback if shadows alone don't create card separation.
- **Email Wrapper** (`#F7F8F9`)
- **Card Surface** (`#FFFFFF`): Separation via shadow, not background.
- **Ghost Button / Disabled** (`#E9E9E9`)
- **Hover Surface** (`#F3F4F6`): Universal "this element is hover-active" affordance — header icon containers, bookmark, avatar, filter button, pill button.
- **Selected Card Surface** (`#F9FAFB`): RadioCard / RecommendedRadioCard selected fill.

### Dark Accents
- **Dark Section** (`#111827`): Footer, nav bar, dark accent sections, profile card backgrounds, RadioCard selected outline.

### Saved / Personal Value
- **Saved Gold** (`#F5B800`): Bookmark filled, favorited items. Token: `--color-saved`. Separate semantic category from action blue.

### Semantic Status Badges

| Status | Text/Dot | Background |
|---|---|---|
| Draft | `#606060` | `#E9E9E9` |
| Pending Review | `#BB841D` | `#FFF3CE` |
| Open / Success | `#24975D` | `#ECFDF3` |
| Hired / Active | `#3358D4` | `#ECF2FD` |
| Error | `#DC2626` | `#FFE9EA` |

### Shadow
- **Card Shadow** (`0px 1px 9px rgba(0,0,0,0.05)`)
- **Search Shadow** (`0px 2px 9px rgba(0,0,0,0.15)`)
- **Menu Shadow** (`0px 4px 16px rgba(0,0,0,0.12)`)
- **Focus Halo** (`0 0 0 3px rgba(51, 88, 212, 0.12)`): brand-blue soft halo around focused inputs / dropdowns / radio cards (keyboard-only via `:focus-visible`).

### Deprecated Colors (Kill List)
Remove on sight: `#2B4EBC`, `#3654A8`, `#5A5A5A`, `#909090`, `#76778E`, `#FCFCFC`, `#FDFDFD`, `#42D159`, `#E8B931`, any red/coral CTA button, any green "NEW" accent. `#204AC2` is NOT deprecated — it is the wordmark blue.

---

## 3. Typography Rules

### Font Families
- **DIN Bold** (700): Headlines, titles, profile names, stat numbers, logo. Self-hosted `.otf`.
- **Inter** (400, 500, 600): Body text, UI, buttons, labels, form fields.
- **Rule:** DIN declares. Inter communicates. No Roboto / Calibri / system fallbacks in production.

### DIN Bold — Heading Scale

Line-height ratio ~1.22. Uppercase reserved for Display Hero and logo only.

| Role | Size | Weight | Line Height | Letter Spacing | Case | Usage |
|---|---|---|---|---|---|---|
| Display Hero | 72px | 700 | 88px | +0.5px | Uppercase | Homepage hero only |
| H1 | 52px | 700 | 63px | -0.5px | Title case | Page titles |
| H2 | 34px | 700 | 41px | -0.3px | Title case | Section headings, **multi-step form step headings** |
| Feature Title | 28px | 700 | 34px | -0.2px | Title case | Job hero banner, feature cards |
| H3 | 24px | 700 | 29px | normal | Title case | Sub-sections, profile names |
| Card Title | 22px | 700 | 27px | normal | Title case | Job card titles |

**Multi-step form step headings use H2 (34px), not H1.** Each step is a section within a single task; H1 at 52px in a 640px column overpowers the form.

### DIN Bold — Stat Numbers

| Role | Size | Weight | Line Height | Letter Spacing | Usage |
|---|---|---|---|---|---|
| Stat Hero | 48px | 700 | 1.0 | -0.5px | Big homepage stats |
| Stat Medium | 32px | 700 | 1.0 | -0.3px | Profile card stats |
| Stat Small | 22px | 700 | 1.0 | normal | Inline stats |

### Inter — Body Text Scale

| Role | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| Body Large | 18px | 500 | 1.6 (29px) | Hero subtitles, intro paragraphs |
| **Step Subtitle** | 18px | 400 | 1.4 (25px) | **Multi-step form step subtitles only** — recedes from H2 step heading. NOT interchangeable with Body Large. |
| Body | 16px | 400 | 1.6 / 1.5 | Standard reading text — 1.6 marketing, 1.5 product |
| Body Small | 14px | 400 | 1.5 (21px) | Card detail, secondary descriptions |

### Inter — UI Element Scale

| Role | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| Section Label | 20px | 600 | 1.3 | "Recent posts", sidebar headings |
| Content Sub-heading | 18px | 600 | 1.4 | "Description", "Responsibilities" |
| RadioCard Title | 18px | 600 | 1.4 | RadioCard / RecommendedRadioCard titles |
| Nav Link | 16px | 500 | 1.0 | Header navigation |
| FieldGroup Label | 16px | 600 | 1.4 | Bold label above a FieldGroup |
| Tag/Pill Text | 16px | 500 | 1.5 | Inside platform/category pills |
| Field Value | 16px | 400 | 1.4 | Filled value in form inputs |
| Floating Label (rest) | 16px | 400 | 1.4 | Field placeholder/label when empty + unfocused |
| **Floating Label (lifted)** | 12px | 500 | 1.3 | **Field label above value when filled or focused** |
| Label | 14px | 500 | 1.4 | Form labels (legacy non-floating), metadata |
| RadioCard Description | 14px | 400 | 1.5 | RadioCard secondary copy |
| Eyebrow Label | 14px | 500 | 1.4 | Sentence case, color `#64748D`. **Never uppercase.** |
| Filter Pill | 14px | 500 | 1.5 | Filter chips |
| Helper / Error Text | 14px | 500 | 1.4 | Below FieldGroups |
| Caption | 13px | 400 | 1.4 | Stat labels, character counter |
| Caption Small | 12px | 400 | 1.5 | Badges, status labels |

### Typography Principles
- DIN at every title level; Inter at every communication level.
- **Uppercase only in Display Hero and logo.** Buttons, eyebrow labels, RadioCard titles all use sentence/title case.
- Two line-height modes: 1.6 marketing, 1.5 product.
- Weight as hierarchy within Inter: 600 (labels, headings), 500 (nav, metadata), 400 (body).

---

## 4. Component Styles

### Buttons

Three sizes with fixed heights. All sentence case. Inter weight 600.

**Primary (Filled)**

| Size | Height | Font | Padding | Radius | Usage |
|---|---|---|---|---|---|
| Large | 54px | 18px | 16px 32px | 12px | Marketing hero CTAs |
| Default | 48px | 16px | 14px 24px | 8px | Product actions, form submissions, **`Continue` in Sticky Footer** |
| Small | 37px | 14px | 10px 20px | 8px | Card actions, secondary inline actions |

- Background `#3358D4`, text `#FFFFFF`, hover `#2B4ABF`.
- Disabled: `#E9E9E9` background, `#9CA3AF` text, no hover.
- Transition: `var(--motion-base)` (180ms) on background-color.

**Ghost / Secondary** — same heights. Background `#E9E9E9`, text `#64748D`, hover background `#DBDBDB`.

**Outline / Tertiary** — same heights. White bg, `2px solid #E4E4E4`, text `#64748D`. Hover: border `#C4C4C4`, text `#111827` (border width stays 2px).

**Text / Link Button** — Cancel, Skip, Maybe later, **Back in Sticky Footer**.
- Transparent, no border, padding `8px 12px`, Inter SemiBold 16px, color `#64748D` → `#111827` on hover, no underline.
- Focus: `2px solid #3358D4` outline with 2px offset.
- Critical: gray, NOT blue. Blue would compete with primary CTAs.

**When to use each**
- Primary (blue) = main action.
- Ghost = secondary on dark/colored backgrounds.
- Outline = secondary on white backgrounds (lightest weight).
- Text button = secondary paired with a primary (Cancel next to Save; Back next to Continue).

### Links

**Inline Link** — `#3358D4` no underline → underline appears on hover (`text-decoration-thickness: 1.5px`, `text-underline-offset: 3px`); active color shifts to `#2B4ABF`.

**Standalone Link with Arrow** — `#3358D4` → `#2B4ABF`, no underline, Lucide `ArrowRight` 16px right of text (6px gap), arrow `translateX(2px)` on hover.

### Pill Button

Secondary chrome action used in Lite Header A (`Need help?`, `Save & exit`). NOT a primary button — receeds from buttons. NOT a filter chip — different role.

- White bg, `1.5px solid #E4E4E4`, **999px** radius, `12px 20px` padding, Inter SemiBold 14px, text `#64748D`.
- Optional 16px icon (2px stroke) right of text, 8px gap, color matches text.
- Hover: bg `#F3F4F6`, text/icon stay `#64748D`.
- Focus: `2px solid #3358D4` outline with 2px offset.

### Cards & Containers

**All cards use 12px border radius.**

**Padding rule**
- 24px all sides — list cards, sidebar widgets, scannable content.
- 24px top/bottom, 32px left/right — content detail cards, reading surfaces.

**Variants**
- **Standard Card** — white bg, 12px radius, `--shadow-card`, no border.
- **Border Card** — white bg, 12px radius, `1px solid #E4E4E4`, optional shadow.
- **Dark Card** — `#111827` bg, 12px radius, `--shadow-card`. Text: `#FFFFFF` / `#E9EDF9` / `#CFCFCF`. Stat labels are single-word only.
- **Dark Header Banner** — `#111827`, 12px (top corners only when nested) or 8px when nested in a padded card.
- **Job Post Card** — composed component, 760px wide (`--width-feed`), 24px padding all sides. See full spec in original section if needed.

### Status Badges / Pills

- Padding `4px 12px` (left 10px for dot), 16px radius, dot 8px (6px filled + 1px margin), Inter Medium 14px. Colors per the Semantic table in §2.

### Tag / Platform Pills

**Platform Tags** — platform-tinted bg + 16–22px logo + Inter Medium 14/16px text, `8px 14px` padding, 999px radius.

| Platform | BG | | Platform | BG |
|---|---|---|---|---|
| Meta | `#E8EEFF` | | YouTube | `#FFEBEE` |
| TikTok | `#E5FBF9` | | LinkedIn | `#E3F2FD` |
| Google | `#FEF0C7` | | X | `#ECECEC` |

Logos required — no text-only platform tags.

**Category Tags** — `#F1F1F1` bg, no icon, otherwise identical.

### Filter Chips

- White bg / `#111827` (active). Border `1px solid #E4E4E4` (inactive). Text `#9CA3AF` / `#FFFFFF`. Inter Medium 14px, `12px 16px` padding, 999px radius. Hover (inactive): border `#C4C4C4`, text `#64748D`.

**Filter Button** — Lucide `SlidersHorizontal` 16px (2px stroke) on the LEFT of text, 8px gap. Hover bg `#F3F4F6`. Selected (filters applied): icon, text, border become `#3358D4`.

### Inputs & Search

The verification flow uses **floating-label inputs** as the canonical form-field pattern (see *Field / FieldGroup* below). The legacy "label-above-field" form input below remains valid for non-vetting flows; both share base chrome.

**Form Inputs (legacy / dashboard contexts)**
- 48px height, white bg, `1.5px solid #E7E7E9`, 8px radius, 16px horizontal padding.
- Placeholder `#9CA3AF` / Filled value `#111827`, Inter Regular 16px.
- Label above: Inter Medium 14px `#111827`.
- Focus: border `1.5px #3358D4` + `--shadow-focus-halo`.
- Error: border `1.5px #DC2626`, error text below `#DC2626` Inter Medium 14px.

**Search Bar**
- 56px height, 12px radius, `1.5px solid #E7E7E9`, `--shadow-search`.
- Search icon Lucide 20px `#9CA3AF` left, 16px padding.

**Textarea**
- Same chrome family as inputs, with three differences:

| Property | Standard Input | Textarea |
|---|---|---|
| Height | 48px | 186px min (autoresize OK) |
| Vertical padding | 0 | 12px |
| Border color | `#E7E7E9` | **`#C4C4C4`** |

**Why darker on textareas:** A whisper-thin border reads as "vague rectangle" at 186px scale. `#C4C4C4` gives presence without heaviness. Single-line inputs don't need the darker treatment.

**Character counter** — below textarea, left-aligned, 12px gap. Format `0 / N`. Inter Medium 13px `#64748D`. Live update. Turns red at/over the limit.

### Field / FieldGroup / FormCombobox / OTPInput — Verification Form Primitives

> **Living source of truth: `verification/` and `_for-design-system/ui_kits/verification/` in the prototype project.** These specs override the "Form Inputs (legacy)" section above whenever you're building a step in the application + vetting flow.

**`Field` — single text input with floating label**
- Always-visible 12px Medium label above the 16px Regular value.
- Default border `1px #E7E7E9` (`--color-border-input`).
- Focus: `1.5px #111827` border + `--shadow-focus-halo` (keyboard via `:focus-visible`).
- Error: `1.5px #DC2626` border + `#FFE9EA` fill.

**`FieldGroup` — fused container that wraps 1+ Fields**
- Single 12px outer radius, 1px outer border, 1px internal dividers.
- Children get auto-assigned `inGroup` prop (`first` / `middle` / `last` / `only`) so they suppress their own borders.
- Airbnb-style "stack of related inputs as one unit."

**`Select` (within FieldGroup)** — same shape as Field, native `<select>` + chevron. Stacks inside FieldGroup like any other Field (country dropdown above address fields is canonical).

**`FormCombobox` — custom dropdown matching the Figma spec.**
- Brand-blue open-state ring + custom popover menu.
- Keyboard: ↑/↓/Enter/Esc/Backspace, type-to-jump.
- Use instead of native `<select>` whenever the design calls for the bespoke open-state ring + custom row treatment.

**`FieldGroupLabel`** — small bold label above a FieldGroup. Optional `help` slot for one-line description (can include inline `<a>` for "Why we ask" / "Learn more").

**`HelperText`** — gray supplementary copy below a FieldGroup ("Standard message and data rates may apply.").

**`ErrorMessage`** — red supplementary copy with alert icon. Use when validation fails.

**`OTPInput`** — six-cell single-character input for email/SMS verification codes. Base chrome inherits Field; cells are independently focusable and auto-advance on input, backspace-jumps-back.

**Why floating labels (and not placeholder-only)?**
Floating labels stay visible at all times, eliminating the "what was this field?" moment placeholder-only inputs cause when the user is mid-typing. They serve all three brand values: **Precision** (the question is always answerable from the field itself), **Conviction** (no ambiguity once typed), **Warmth** (strictly more usable for older or screen-reader users). The system also pre-defines `--color-border-input` (a slightly lighter input-specific border).

**Why the tinted error styling?**
The system pre-defines both `--color-error` (`#DC2626`) AND `--color-error-bg` (`#FFE9EA`). Going quieter (border-only, no fill) would ignore explicit tokens.

### RadioCard / RadioCardGroup / RecommendedChoiceGroup

Selectable option cards used in **Single-select Step** and **Recommended-choice Step** templates. The whole card is the radio target.

**`RadioCard`**
- **Unselected:** white, `inset 0 0 0 1px #E4E4E4`. Hover: outline darkens to `#C4C4C4`.
- **Selected:** `#F9FAFB` bg, `inset 0 0 0 2px #111827`.
- Outline rendered via `box-shadow: inset` so the 1→2px transition causes no geometry shift.
- Title: Inter SemiBold 18 / 1.4 / `#111827`.
- Description: Inter Regular 14 / 1.5 / `#64748D`.
- Icon: 24px Lucide, 1.5px stroke, `#111827`, right-aligned.
- 12px gap between cards.
- `:focus-within` shows the brand-blue halo for keyboard users.

**`RecommendedChoiceGroup` + `RecommendedRadioCard`** — binary choice with one recommended default. **Use only when the platform has a recommendation** — not as a generic 2-option Single-select.
- Both cards live inside one rounded container with a 1px border.
- Unselected cards have NO individual border (the container provides it).
- A 1px divider sits between the two cards (24px horizontal inset).
- Selected card draws a 2px `#111827` outline that "lifts" out of the container — same dark-on-product-bg pattern as RadioCard.
- Recommended card carries an inline `Recommended` label in `--color-success` between title and description.
- Group defaults to selecting the first option (which should be the recommended one); caller can override via `value`.
- Subtitle on this template typically includes a `Learn more` link because the decision is higher-stakes than a profile question.

### Segmented

Inline N-option button group. Use for short binary/ternary questions where radio cards would be visual overkill ("Yes / No", "Domestic / International / Both"). Selected option uses `--color-bg-ghost` (`#E9E9E9`) fill, others stay white.

### Toggle

iOS-style switch. 44×26 track. On = `--color-text-primary` (`#111827`) fill. Use for binary settings inline with descriptive copy ("Show your home's precise location"). **Don't use for required questions** — use Segmented or RadioCardGroup instead.

### CheckCard family (saved listings, results)

`CheckCard`, `CheckCardCompact`, `CheckCardWide`, `CheckCardGrid`, `CheckRow` — the marketplace-side selectable card set used outside the verification flow. Rules and tokens match RadioCard (`#F9FAFB` selected fill, `inset 0 0 0 2px #111827` selected outline, 12px radius, 12px gap).

### Logo System

**Wordmark** — MEDIABUYER.COM, DIN Bold, outlined SVG (never live text).

**Two-tone (light bg):** "MEDIABUYER" `#204AC2`, ".COM" `#111827`. **Reversed (dark bg):** all `#FFFFFF`. Letter-spacing ~16%.

| Context | Height |
|---|---|
| Header (Marketing / Platform) | ~16px |
| **Lite Header A** | **20px** (was 16px — needs more vertical presence at this header layout) |
| Compact (footer, email) | ~12px |
| Minimum | ~9px |

**Hyperlink behavior**
| Header | Clickable? | href |
|---|---|---|
| Marketing | Yes | `/` |
| Platform | Yes | `/dashboard` |
| Lite Header A (pre-auth) | Yes | `/` |
| Lite Header B (post-auth focused task) | **No — intentionally non-clickable** | — |
| Lite Header C (minimal/auth pages) | Yes | `/` |

Logo on Lite Header B is decorative — focused workflows shouldn't surface accidental navigation paths. "Save & exit" is the explicit, labeled exit.

**Hover (clickable variants):** `opacity: 0.85`, cursor pointer, `var(--motion-fast)` (120ms).

### Navigation — Header System

Five header variants across three roles:

| Variant | Where | Auth |
|---|---|---|
| Marketing Header | mediabuyer.com, blog, landing | Public |
| Platform Header | Dashboard, jobs, profiles | Auth |
| Lite Header A | Onboarding, applications, vetting forms | Pre-auth |
| Lite Header B | Profile setup, KYC, payment setup | Post-auth focused task |
| Lite Header C | Login, signup, password reset, errors | Auth pages |

Settings, dashboard, and any authenticated nav context use **Platform Header** — not a Lite variant.

**Marketing Header** — 80px, max-width 1440px, side padding 80/24, `1px solid #F1F1F1` bottom border. Left: logo + 48px gap + nav (How It Works · Results · Insights · Catalyst). Right: Login + 24px gap + "Hire Top Media Buyers" CTA + hamburger (<1120px).

**Platform Header** — 80px, same chrome. Left: logo + nav (Find Work · My Profile · Refer n Earn). Right: MessageSquare → Bell → 38px Avatar (each in 44px hover container, fills `#F3F4F6`). 8px red dot indicator replaces the old "9+" numbered badge. Hamburger appears <1120px AFTER avatar.

**Nav link states:**
- Default: Inter Medium 16px `#111827`.
- Hover: text → `#3358D4`.
- Active (current page): Inter SemiBold 16px `#111827` + 2px `#3358D4` underline.

#### Lite Header A — Pre-auth focused workflow (verification, onboarding, applications)

Used wherever a focused, distraction-free flow is needed before the user has an account.

- Height: **80px** (matches Marketing/Platform — the "lite" feel comes from simpler content, not shorter chrome).
- Side padding: **48px** (focused-workflow chrome — Marketing/Platform stay at 80px because they frame the entire experience).
- Top padding: **32px** (logo + pill cluster anchor to y=32 — Airbnb asymmetric pattern).
- Bottom padding: **~7px** (chrome feels grounded at the top, pills near the bottom edge).
- **No bottom border.** Visual separation comes from the 64px gap below the header, not a hairline.
- Background: `#FFFFFF`.

**Logo:** two-tone wordmark, clickable, 20px height, anchored at y=32, x=48 from viewport left.

**Right cluster:** **Pill buttons** anchored at y=32, 48px from viewport right, 8px gap.
- Default: one pill — `Need help?` with Lucide `HelpCircle` icon on the right.
- Optional second pill: `Save & exit` — **only when save-and-resume is implemented**. Showing it without backing functionality is a UX promise the system can't keep. Default Lite Header A has only `Need help?`.

**Lite Header B — Post-auth focused task** (profile completion, payment setup, KYC)
- Logo NOT clickable (see Logo System).
- Right side: `Save & exit` text-style button (Inter SemiBold 16px, `#64748D` → `#111827`, no underline, transparent bg).
- No avatar (intentionally — clicking your own face mid-flow creates ambiguity about exit vs. profile settings).

**Lite Header C — Minimal** (login, signup, errors, legal pages)
- Logo only, clickable, left-aligned. No right-side content.

**Responsive:** Lite Headers don't need responsive nav transformations — already simple enough at any viewport.

#### Progress Bar — Multi-Step Form Flows (`PhasedProgressBar`)

Sits at the **top edge of the Sticky Footer** (NOT below the header — that was the earlier spec). Replaces the footer's top border — it IS the visual separator between content and footer chrome.

- Height: **6px** (was 4px).
- Corner radius: **3px** (height/2 — proper pill ends).
- Width: full bleed (edge-to-edge, no horizontal padding).
- Empty segment: `#F1F1F1`. Filled: `#3358D4`. Segment gap: 8px.

**Segments represent phases (not steps).** Phases group related sub-steps. Verification flow uses 3 segments (3 phases) regardless of underlying step count — Airbnb host-onboarding pattern.

**Partial-fill (2-color, not 3-color):** When a phase has multiple sub-steps, the active segment fills proportionally to completed sub-steps within the phase. Filled portion: `#3358D4`, rounded LEFT edge only. Gray portion: `#F1F1F1`, rounded RIGHT edge only. Width split = (completed sub-steps / total sub-steps in phase) × segment width. Implemented as a hard-stop linear-gradient so the rounded corners stay clean at any fill ratio.

**Why 2-color partial fill, not 3-color (completed/active/future):** A third color introduces visual complexity without information weight — the user already knows which phase they're in. Partial fill conveys *more* information using *fewer* colors. Aligns with Precision and quiet authority.

#### Sticky Footer — Multi-Step Form Flows

- Position: fixed to bottom of viewport. Height: 86px. Background: `#FFFFFF`. **No top border** — progress bar IS the separator. Side padding: 48px (matches Lite Header A).
- Layout: progress bar across the top edge (6px, full bleed), 80px content area below holds the buttons:
  - **Back text-link button** on the left: frame at x=50, 12px internal padding so visible text starts at x=62 (optical alignment with logo at x=48).
  - **Continue primary button** on the right: frame edge sits 48px from viewport right (symmetric with header pill cluster).
- Buttons vertically centered within the 80px below-progress area.

**Button labels:** Use **"Continue"** not "Next" for primary navigation between vetting steps. "Continue" for committed processes (Stripe Atlas, Linear, Vercel pattern); "Next" is for lighter consumer-app onboarding. **No arrow icon** on Continue — buttons are already a primary affordance.

### Iconography

**Library:** Lucide Icons (MIT). Plugin: Lucide Icons v1.11.0+.

**Stroke-by-size**
| Size | Stroke |
|---|---|
| 16px | **2px** |
| 20px | 1.5px |
| 24px | 1.5px |

Different sizes get different stroke weights — correct icon design, not inconsistency.

**Color rules**
- Light bg: `#111827` (primary) or `#64748D` (chrome).
- Dark bg: `#E9EDF9` (primary) or `#9CA3AF` (muted).
- Interactive state-change: `#3358D4`.
- Saved state: `var(--color-saved)` `#F5B800` (bookmarks only).
- Header icons stay `#64748D` even on hover (background container fill is the affordance).

**Bookmark Icon** — full state machine in 32×32 touch target (8px radius). Default Lucide `Bookmark` outline 22px `#64748D` → hover container fills `#F3F4F6` → saved state Lucide `BookmarkCheck` (or filled Bookmark) 22px `#F5B800`. Click: brief `scale(1.1)` returning to `scale(1)` over 200ms.

**Commonly used icons:** MapPin, Clock, Calendar, Briefcase, CreditCard, SlidersHorizontal, Search, ChevronDown/Up, Check, Bookmark/BookmarkCheck, MessageSquare, Bell, HelpCircle, Menu, X, Plus, ArrowRight, Settings.

**Platform logos are NOT icons** — Meta, TikTok, Google, YouTube, LinkedIn, X are brand assets, imported separately as SVGs/PNGs.

---

## 5. Layout Principles

### Spacing System
Base unit: 4px.

| Token | Value | Usage |
|---|---|---|
| xs | 4px | Tight gaps (dot to badge text) |
| sm | 8px | Inline spacing (tag gap, badge padding, header cluster gap, label-to-field) |
| md | 16px | Standard component padding, **step heading → subtitle** |
| lg | 24px | Card internal padding, **field-block → next field-block** |
| xl | 32px | Section gaps, nav item gap, **subtitle → first field block** |
| 2xl | 48px | Major section spacing, header logo→nav, Lite Header / Sticky Footer side padding |
| 3xl | 80px | Page-level section padding, Marketing/Platform side padding |

**Vertical rhythm (style-guide page)**
| Token | Value | Usage |
|---|---|---|
| --space-specimen | 32px | Within a scale group |
| --space-group | 64px | Between scale groups |
| --space-section | 96px | Between top-level page sections |

**Multi-step form vertical rhythm**
- Header bottom → top of content area: 64px (or whatever optical centering produces — see *Vertical Content Positioning*).
- Step heading → step subtitle: **16px**.
- Step subtitle → first field block: **32px**. Earlier work used 48px; 32px is correct semantically (subtitle and field are within-group) and matches Airbnb's ~33px gap.
- **Heading-only step:** heading → first field: **40px** (vs 32px when subtitle present) — keeps cards from feeling cramped against the larger heading without the subtitle as connective tissue. Implemented automatically via CSS sibling selector (`.heading + .field { margin-top: 40px }`).
- Field label → field input: **8px** (legacy non-floating; floating-label inputs handle internally).
- Field input → helper / counter: **8px** (inputs/dropdowns) or **12px** (textareas).
- Sibling field block → next field block: **24px**.

### Motion Tokens

| Token | Value | Usage |
|---|---|---|
| --motion-fast | 120ms | Icon transitions, hover container fills |
| --motion-base | 180ms | Buttons, links, nav, chips, focus states |
| --motion-slow | 250ms | Cards, modals, dropdown menus |

Easing: `cubic-bezier(0, 0, 0.2, 1)` (ease-out) — universal.

### Border Radius Scale (Locked)
"Click = 8. Contain = 12. Pill = 999. Circle = 50%."

| Token | Value | Usage |
|---|---|---|
| sm | 8px | Buttons (Default/Small), form inputs, dropdowns, hamburger touch target |
| md | 12px | All cards, sidebar widgets, modals, search bar, FieldGroup, RadioCard, Large buttons |
| pill | 999px | Status badges, tag pills, filter chips, **Pill Button** |

Plus `border-radius: 50%` for avatars / circular elements.

### Content Width

| Token | Value | Usage |
|---|---|---|
| --width-narrow | 480px | Auth forms, focused single-column flows. Do NOT use for multi-step form steps. |
| **--width-form** | **640px** | **Default for multi-step form columns (verification, application, onboarding).** |
| --width-feed | 760px | Job feed, content reading, **and** dense form contexts (selectable card grids, multi-input rows like name + email + phone, references blocks). When 640 is too narrow, this is the wide variant. |
| --width-sidebar | 320px | Sidebar widgets |
| --width-content | 1120px | Main content max-width |

Header max-width: 1440px (centered, fluid below).

### Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| ≥1120px | Full nav + Login visible |
| 640–1119px | Nav + Login hide, hamburger appears |
| <640px | Mobile-specific text shortening ("Hire Top Media Buyers" → "Hire Now") |
| Side padding | 80px above `lg:` (1024px), 24px below |

Marketing Header minimum render width is ~1125px; breakpoint set to 1120px to transition just before cramming.

### Cards vs Open Sections
- **Card-wrap discrete units** — feed items, profile widgets, sidebar modules.
- **Use dividers (no card) for continuous reading content** — job detail pages, profile detail pages. Wrapping each section in its own card adds visual weight where the user just wants to read.
- Principle: **cards bundle, dividers separate.**

### Vertical Content Positioning — Multi-Step Forms (StepShell behavior)

Multi-step form content uses **optical centering**, not top-anchoring or mathematical centering. Position the content block (heading + subtitle + fields) such that its center sits at **40% of available space** between header bottom and footer top.

```
opticalCenterY = headerBottom + (availableSpace × 0.40)
contentTop     = opticalCenterY − (contentHeight / 2)
```

For a 1200px frame with 80px Lite Header A + 86px sticky footer: availableSpace = 1034, opticalCenterY = 80 + 414 = 494. For 236px content: contentTop = 376.

**Why 40%, not 50%:** mathematical center pushes content too far down for short steps; the form floats awkwardly. 45% felt one notch too low; 40% gives noticeable breathing room above without sliding into "form floats too low."

**Why optical centering at all:** Self-adjusting across step content lengths. Short content centers visually; tall content (case-study textarea + screenshots) naturally top-anchors because there's no centering room. One rule covers all step heights, keeping the user's eye in roughly the same vertical zone across every step in a flow. Verified against Airbnb host onboarding.

`StepShell` implements this via a 1:2 spacer ratio (or true optical-center math) above/below the content column.

---

## 6. Step Templates — Verification & Application Flow

Each step page is an instance of a **template**. We name templates by *intent* — what the user is being asked to do — not by control type. **Don't name templates after their controls** ("Textarea step," "Radio step"); controls change, intent doesn't.

| Template | Use when |
|---|---|
| **Open Response Step** | One open-ended question, large textarea, character ceiling |
| **Single-select Step** | One question, 2–5 mutually exclusive options as RadioCards |
| **Multi-select Step** | Same shape as Single-select, but checkboxes (planned) |
| **Recommended-choice Step** | Binary choice (2 options) where the platform has a recommendation. Cards visually grouped in one container; recommended option pre-selected and labeled. |
| **Single-field Step** | One question, one fused FieldGroup (1–2 fields). Phone, monthly spend, business name. |
| **Stacked-fields Step** | One question, multiple related fields fused into one or more FieldGroups. Address, identity, payout. |
| **Multi-section Step** | One page, multiple distinct sub-questions. Section dividers between groups. **Reserve for genuinely related sub-questions** — don't use to compress unrelated steps onto one page. |
| **OTP Verification Step** | Email/SMS code entry. Uses `OTPInput`. |
| **Path Fork Screen** | Branching screen between flows (e.g., independent freelancer vs. agency vs. vendor). Larger, more illustrative cards. |
| _(planned)_ Connect-accounts Step | OAuth cards for ad-platform connections |
| _(planned)_ List-builder Step | User adds N rows (e.g. references) |
| _(planned)_ Review Step | Summary of submitted data, "Pending review" confirmation |

### Headings & Subtitles — When to Use a Subtitle

Every step has a heading. **Subtitles are optional and functional, not decorative.** Default to heading-only. Add a subtitle only when it does work the heading can't.

**Use a subtitle when it…**
1. **Disambiguates the question.** "What's your role?" → "Pick the closest match — we use this to tailor follow-ups."
2. **Reassures the user.** Money, exclusivity, commitment questions → "You can change this later." / "Only your matches see this."
3. **Sets scope.** "How much do you spend?" → "Largest single-account monthly spend in the last 90 days."
4. **Explains a non-obvious mechanic.** Multi-select with a max → "Choose up to 3."
5. **Sets stakes.** Tells the user how the answer will be used so they invest the right amount of effort. → "Vetters use this to gauge fit. Be specific."

**Don't use a subtitle when it…**
- Restates the heading. ("How do you operate?" / "Tell us how you operate.")
- Tells the user to do what the cards already make obvious. ("Pick one.")
- Is generic onboarding filler. ("This helps us personalize your experience.")

### Composition rule

Every step page is:

```jsx
<StepShell progress={…} onBack={…} onContinue={…}>
  <h1 className="heading">…</h1>
  <p className="subtitle">…</p>          {/* optional, functional */}
  <div className="field"> /* one or more form controls */ </div>
</StepShell>
```

Don't re-implement chrome per step.

### Verification UI Kit — Components

| Component | Role |
|---|---|
| `StepShell` | Page chrome composing `LiteHeaderA` + `PhasedProgressBar` + content area + footer (Back / Continue). 640px content column, optical 40% placement. |
| `LiteHeaderA` | 80px header, wordmark at y=32 / x=48, pill cluster (`Need help?` + optional `Save & exit`) at y=32 / 48px from viewport right. |
| `PhasedProgressBar` | 6px full-bleed segmented bar. N phases × M steps. Current phase fills proportionally; completed phases full-fill; upcoming stay empty. |
| `Field` | Floating-label single-line text input. |
| `FieldGroup` | Fused container that wraps 1+ Fields with internal 1px dividers. |
| `FieldGroupLabel` | Small bold label above a FieldGroup with optional `help` slot. |
| `HelperText` / `ErrorMessage` | Below-FieldGroup supplementary copy. |
| `Select` | Native `<select>` styled to match Field; stacks inside FieldGroup. |
| `FormCombobox` | Custom dropdown matching Figma spec — brand-blue open ring, custom popover, full keyboard support. |
| `Textarea` | Multi-line input. `1.5px #C4C4C4` border (heavier than Field). Character counter built in — turns red at/over limit. Default 186px, no resize. |
| `RadioCard` + `RadioCardGroup` | Single-select option cards. Whole card is the radio target. |
| `RecommendedRadioCard` + `RecommendedChoiceGroup` | Binary choice with one recommended default. Two cards in one rounded container with internal divider. |
| `Segmented` | Inline N-option button group for short binary/ternary questions. |
| `Toggle` | iOS-style switch for binary settings inline with descriptive copy. |
| `OTPInput` | Six-cell single-character input with auto-advance + backspace-jump-back. |

**Tokens used (all components)** pull from `colors_and_type.css` via CSS variables: `--color-primary`, `--color-text-primary`, `--color-text-secondary`, `--color-border`, `--color-border-input`, `--color-border-soft`, `--color-bg-product`, `--color-bg-hover`, `--color-bg-ghost`, `--color-success`, `--color-error`, `--color-error-bg`, `--font-display`, `--font-body`, `--shadow-focus-halo`, `--radius-md`.

### Not yet in the verification kit
- `OAuthConnectCard` — for the ad-account connect step.
- `ReferenceRow` / `ReferenceList` — for the references step.
- `ReviewSummary` — for the final "pending review" confirmation.

Add these as we mock each subsequent step, **not speculatively.**

---

## 7. Brand Voice (For Content Implementation)

### Voice Test
- "These people clearly know what they're doing" = working.
- "They're trying to convince me" = off.

### Three Registers
1. **Authority** (website, marketing): Numbers over claims. State the bar, don't sell it. Short sentences. No all-caps. "We" sparingly.
2. **Practitioner** (insights, coaching): Operator-to-operator. Framework-driven. Real numbers. Points of view welcome.
3. **Human** (emails, support): "Hey [Name]," always. Under 200 words. One ask per email. Never recap the prospect's problems.

### Vocabulary
**Use:** verified, vetted, scaled, managed spend, proven, [specific number], operator, practitioner.
**Never use:** world-class, best-in-class, game-changer, innovative, solutions, leverage, synergy, unlock, guaranteed, crushing it.

### Sign-offs
- Operational emails: "The MediaBuyer.com Team"
- Milestone/warm emails: "Your friends, The MediaBuyer.com Team"
- Support email: `help@mediabuyer.com` (never `support@`)

### Verification Flow Voice Specifics
- Headings: short, declarative, second-person where natural ("How do you operate?", "Tell us about your largest account").
- Subtitles: practitioner register — assume the reader is an operator. Set scope, never pad ("Largest single-account monthly spend in the last 90 days.").
- Continue button label: **"Continue"** (committed process, Stripe Atlas pattern), not "Next."
- Help affordance: "Need help?" pill (not "Help" or "?" alone — labeled affordance > glyph alone in a chrome surface that has space).

---

## 8. Figma & Implementation Reference

### Style Tile
Figma file: `MB-Platform` → Page: "Style Tile". Locked specimens for: color palette, DIN heading scale, stat numbers, Inter body scale, Inter UI elements, button system (Primary + Ghost + Outline + Text/link), inline + standalone links, cards, tags + pills, filter chips, form inputs, dropdown (closed/focus/open), border radius, icons, all five header variants + progress bar.

The **Lovable design system page** is the canonical implementation reference. The Figma Style Tile is the canonical visual reference for designers mocking new pages — keep them in sync.

### Key Mockup Pages
- Discover Opportunities (Home Dashboard) — card layouts, search, filters, sidebar.
- Job Post (Published) — content hierarchy, section headings, tag pills.
- Job Post Form — input styling, progress indicators.
- **Verification flow** (this project) — `Open Response Step.html`, `Single-select Step.html`, `Single-field Step.html`, `Stacked-fields Step.html`, `Multi-select Step.html`, `OTP Verification Step.html`, `Fork Screen.html`, `Path Fork Screen.html`. Reference for `StepShell` placement, optical centering, FieldGroup composition, and the pill-button + sticky-footer pattern.

### Design-System Promotion Status

**Promoted (live in the design-system project, `ui_kits/verification/`)**
- `FormField.jsx`, `FormCombobox.jsx`, `LiteHeaderA.jsx` (Save & Exit-only "B" variant), `PhasedProgressBar.jsx`, `OTPInput.jsx`, `PlatformLogos.jsx`.

**Staged for paste-in (in `_for-design-system/ui_kits/verification/` in this project)**
- `FormCombobox.jsx` — custom dropdown matching the Figma spec. Fills the biggest dropdown gap in the design system.
- `StepShell.jsx` — page-shell composing `LiteHeader` + `ProgressBar` + upper-third content placement.

**Held back (let bake in 1–2 more flows before promoting)**
- `RadioCard.jsx` + `RadioCardGroup.jsx` — selectable card group with optional "Recommended" tag (used on Single-select / Recommended-choice steps).
- `Segmented.jsx` — small Yes/No segmented control (used on Multi-section steps).
- `PhasedProgressBar.jsx` — phase-grouped variant of the existing `ProgressBar.jsx`. Likely worth merging via a prop on the original.
- `LiteHeaderA.jsx` — `Need help? + Save & exit` header. The system has `LiteHeader.jsx` (the "B" variant with just Save & exit). Merge into a single component with a prop.

### Design Tokens (For Developer Handoff)

> **⚠️ Implementation status — for Sean & Mike.**
>
> Lovable's `src/index.css` does NOT yet implement most of these tokens — it currently uses a shadcn-derived HSL token set (e.g. `--primary: 220 82% 58%`) that doesn't match this spec, plus inline hex values throughout components. The design system page renders correctly because specimens are using inline hex (`bg-[#3358D4]`, `text-[#64748D]`, etc.), not the variables.
>
> **The token block below is the canonical specification.** Before production page work begins, `src/index.css` needs a refactor to:
> 1. Implement every token below as a proper CSS variable (using hex, not HSL).
> 2. Replace shadcn `--primary` (`#3C71EA`) with `--color-primary: #3358D4`. The current `--primary` is the wrong blue — anyone using Tailwind's `bg-primary` gets it wrong.
> 3. Add the missing tokens: `--color-saved`, `--color-bg-hover`, all platform tag tints, all semantic status colors and backgrounds, all shadow tokens, `--shadow-focus-halo`, all icon stroke values, all dark card tokens, all card padding tokens.
> 4. Refactor design-system page specimens to consume tokens instead of inline hex. Once variables exist and components consume them, the design-system page becomes self-validating.
> 5. Preserve existing shadcn structure where it doesn't conflict.
>
> **April 2026 update — verification flow scope.** The refactor scope has grown. `src/index.css` now also needs to implement: `--width-form: 640px`, `--color-input-border-textarea: #C4C4C4`, the **Pill Button** component (§4), the updated **Lite Header A** (80px tall, 48px side padding, 32/7 asymmetric padding, no bottom border, 20px logo), the **Sticky Footer** pattern (no top border, progress bar at top edge), the **Progress Bar** spec change (6px tall, 3px radius, partial-fill UX), and the new floating-label `Field` / `FieldGroup` chrome. Until this lands, components built off the new spec will need a hex→token sweep when variables exist.

```css
:root {
  /* Brand */
  --color-brand: #204AC2;
  --color-primary: #3358D4;
  --color-primary-hover: #2B4ABF;

  /* Text */
  --color-text-primary: #111827;
  --color-text-secondary: #64748D;
  --color-text-tertiary: #9CA3AF;

  /* Backgrounds & surfaces */
  --color-bg-page: #FFFFFF;
  --color-bg-product: #FFFFFF;       /* Product surface (verification flow uses white) */
  --color-bg-email: #F7F8F9;
  --color-bg-card: #FFFFFF;
  --color-bg-card-selected: #F9FAFB; /* RadioCard selected fill */
  --color-bg-ghost: #E9E9E9;
  --color-bg-dark: #111827;
  --color-bg-hover: #F3F4F6;         /* Universal hover surface */

  /* Borders */
  --color-border: #E4E4E4;
  --color-border-soft: #F1F1F1;
  --color-border-input: #E7E7E9;             /* Field default */
  --color-input-border-textarea: #C4C4C4;    /* Textarea default — heavier */
  --color-pill-border: #E4E4E4;              /* Pill Button */

  /* Saved / personal value */
  --color-saved: #F5B800;

  /* Semantic */
  --color-success: #24975D;
  --color-success-bg: #ECFDF3;
  --color-warning: #BB841D;
  --color-warning-bg: #FFF3CE;
  --color-error: #DC2626;
  --color-error-bg: #FFE9EA;
  --color-info: #3358D4;
  --color-info-bg: #ECF2FD;
  --color-draft: #606060;
  --color-draft-bg: #E9E9E9;

  /* Shadows */
  --shadow-card: 0px 1px 9px rgba(0, 0, 0, 0.05);
  --shadow-search: 0px 2px 9px rgba(0, 0, 0, 0.15);
  --shadow-menu: 0px 4px 16px rgba(0, 0, 0, 0.12);
  --shadow-focus-halo: 0 0 0 3px rgba(51, 88, 212, 0.12);

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-pill: 999px;

  /* Spacing — component */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 80px;

  /* Spacing — vertical rhythm (style-guide page) */
  --space-specimen: 32px;
  --space-group: 64px;
  --space-section: 96px;

  /* Card padding */
  --card-padding-scan: 24px;
  --card-padding-read-v: 24px;
  --card-padding-read-h: 32px;

  /* Width tokens */
  --width-narrow: 480px;
  --width-form: 640px;               /* Default for multi-step form columns */
  --width-feed: 760px;
  --width-sidebar: 320px;
  --width-content: 1120px;
  --width-header-max: 1440px;

  /* Motion */
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 250ms;
  --motion-easing: cubic-bezier(0, 0, 0.2, 1);

  /* Typography */
  --font-display: 'DIN', sans-serif;
  --font-body: 'Inter', sans-serif;

  /* Icons (Lucide) — stroke is size-dependent */
  --icon-stroke-default: 1.5px;      /* For 20px and 24px sizes */
  --icon-stroke-compact: 2px;        /* For 16px size */
  --icon-sm: 16px;
  --icon-md: 20px;
  --icon-lg: 24px;

  /* Platform tag backgrounds */
  --color-tag-meta: #E8EEFF;
  --color-tag-tiktok: #E5FBF9;
  --color-tag-google: #FEF0C7;
  --color-tag-youtube: #FFEBEE;
  --color-tag-linkedin: #E3F2FD;
  --color-tag-x: #ECECEC;
  --color-tag-category: #F1F1F1;

  /* Dark card */
  --color-dark-card: #111827;
  --color-dark-text-primary: #FFFFFF;
  --color-dark-text-secondary: #E9EDF9;
  --color-dark-text-tertiary: #CFCFCF;
  --color-dark-separator: #2D3348;

  /* Responsive breakpoints (use as arbitrary values or add to Tailwind config) */
  /* nav: 1120px - hamburger transition */
  /* sm:  640px  - mobile CTA text shortening */
}
```

### Open Items / Directional (Refine During Page Design)

**Token & design-system page housekeeping (Lovable)**
1. Refactor `src/index.css` per the callout above.
2. Update Buttons specimen: Default height 47px → 48px.
3. Header Hover States subsection: avatar 36px → 38px; remove "icon darkens to #111827 on hover" copy (locked behavior is icon stays `#64748D`, only background fills).
4. Icons section: replace universal "1.5px stroke" caption with the stroke-by-size rule.
5. Marketing Header: delete leftover responsive caption referencing 1024px.
6. Border Card description: "10px radius" → "12px radius".
7. Color Palette swatches: add Brand Blue `#204AC2` to the Accents row with "wordmark only" annotation.
8. Add new specimens: Pill Button, updated Lite Header A, Sticky Footer with progress bar, partial-fill progress bar, Step Subtitle typography, textarea variant, FieldGroup, RadioCard, RecommendedChoiceGroup, Segmented, OTPInput. **Defer all of these to a single batched update pass once the `src/index.css` refactor lands.**

**Behavioral / scope decisions still open**
- Product page background `#FFFFFF` vs `#F9FAFB` — decide during dashboard build.
- Card shadow elevation hierarchy — single level for now.
- Mobile menu drawer/dropdown UX — own design round.
- Logo mark (icon-only version) — planned later this quarter.
- Dark card stat separator color `#2D3348` — confirm during page implementation.
- **Save-and-resume mechanism for multi-step forms.** Decides whether `Save & exit` pill appears in Lite Header A. Verification form is the first concrete decision needed.
- Hover/focus states for the Pill Button — verify in live Lovable build.
- Mobile responsive treatment for sticky footer + progress bar at <640px.
- `Save & exit` confirmation modal — modal asking confirmation, or immediate save? Tied to save-and-resume.
- Should the textarea border darkening (`#C4C4C4`) propagate to other large inputs (file upload zones, drop areas)? Defer until those components are designed.
- Combobox vs Select architectural split — `FormCombobox` handles bespoke open-state ring + custom rows; native `<Select>` stacks inside FieldGroups. Promote `FormCombobox` first, evaluate whether native Select needs a typing-to-filter variant.
