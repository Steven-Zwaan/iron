# Iron — Personal Gym Assistant
## Technical & Functional Design Specification

**Version** 1.0
**Target** Installable PWA (offline-first, mobile-first), single user
**Later** Native iOS wrapper for Live Activities / Dynamic Island rest timer

> This document is written to be handed to a code-generating model as the complete
> source of truth. Everything needed to build v1 is here: data model, algorithms,
> screen specs, interaction budgets, SVG asset data, and acceptance criteria.
> Where a decision is deliberately left open it is marked **OPEN**.

---

## Table of contents

1. [Product intent](#1-product-intent)
2. [Scope](#2-scope)
3. [Core concepts and vocabulary](#3-core-concepts-and-vocabulary)
4. [Functional design](#4-functional-design)
5. [Screen specifications](#5-screen-specifications)
6. [The logging flow (detailed)](#6-the-logging-flow-detailed)
7. [Interaction budget](#7-interaction-budget)
8. [Visual design system](#8-visual-design-system)
9. [Data model](#9-data-model)
10. [Algorithms](#10-algorithms)
11. [Technical architecture](#11-technical-architecture)
12. [AI layer](#12-ai-layer)
13. [Non-functional requirements](#13-non-functional-requirements)
14. [Acceptance criteria](#14-acceptance-criteria)
15. [Build order](#15-build-order)
16. [Appendix A — Seed data](#appendix-a--seed-data)
17. [Appendix B — Body map SVG](#appendix-b--body-map-svg)

---

## 1. Product intent

A private training log for one person who trains to failure, does not count reps
religiously, and wants to *see* whether their body is covered rather than read a
spreadsheet.

### Design principles

| # | Principle | Consequence |
|---|---|---|
| P1 | **Logging a set is one tap.** | Weight carries over from last time. Reps are optional. Nothing blocks. |
| P2 | **The body map is the product.** | It is the home hero, the session summary, and the progress screen. Colour is the reward. |
| P3 | **Deterministic by default, AI at the edges.** | Plans, logging, timers, scores, debt: all local logic. AI only for advice, alternatives, cues, and natural-language log parsing. The app is fully usable with AI switched off. |
| P4 | **Reality beats the plan.** | Machines are busy, days shift, motivation varies. The app lets you reorder, swap, and skip — then remembers what you owe. |
| P5 | **Offline is the normal case.** | Gyms have no signal. Every feature except AI works with the network off. |
| P6 | **Thumb-reachable.** | All primary actions live in the bottom third of the screen. Nothing critical in a corner. |

### Anti-goals

- No social feed, no sharing, no leaderboards.
- No rep/RPE prescriptions. The user trains to failure; the app does not tell them "3×8".
- No mandatory numbers. A session logged with zero weights entered is still a valid session and still scores.
- No account, no login, no server for core functionality.

---

## 2. Scope

### v1 (this document)

- One-time **gym setup**: which exercises exist at your gym, and what the weight increments are.
- **Exercise library** of ~120 seeded exercises with muscle contribution maps, plus custom exercises.
- **Plans**: named training days, each an ordered list of exercises with a set scheme.
- **Session builder**: choose and order today's exercises from muscle-group lists before you start.
- **Runner**: one exercise at a time, one-tap set logging, weight scrubber, dropset chaining, rest timer.
- **Skip debt**: skipping an exercise carries it to the next session.
- **Body map**: 17 muscle groups, front and back, coloured by a 4-tier score ladder.
- **Progress**: body score over 7/30/90 days, weakest-first ranking, per-lift trend.
- **Coach** (optional, needs network): pre-workout brief, weak-point fixes, alternatives, cues, natural-language logging.
- **Backup**: JSON export/import.
- Installable, offline-capable PWA.

### v2 / later

- Native iOS shell (Capacitor or SwiftUI) for ActivityKit Live Activity rest timer.
- Cross-device sync.
- Barbell plate visualiser.
- Apple Health / Google Fit write.
- Photo progress.

---

## 3. Core concepts and vocabulary

| Term | Meaning |
|---|---|
| **Muscle** | One of 17 tracked muscle groups. The unit of scoring and colouring. |
| **Muscle category** | UI grouping of muscles: Chest, Back, Shoulders, Arms, Legs, Core. Used in pickers, never in scoring. |
| **Exercise** | A movement with a muscle contribution map, an equipment type, and a default rest. |
| **Gym profile** | The one-time setup: which exercises are available, and the weight increments/ranges of the equipment. |
| **Plan** | A set of named **days**. A day is an ordered list of **plan items**. |
| **Plan item** | An exercise plus its set scheme (`work` sets to failure, `drops` dropsets). |
| **Session** | One actual workout: a queue of exercises, each with logged sets. |
| **Set** | One working effort. Contains one or more **segments**. |
| **Segment** | One continuous effort at one weight: `{weight, reps}`. A normal set has one segment. A dropset or a mid-set weight change has several. |
| **Effective sets** | The scoring currency. A work set = 1.0, a warm-up = 0.25, each extra segment = 0.4. Multiplied by the exercise's contribution to each muscle. |
| **Debt** | An exercise skipped in its last scheduled appearance. Carries forward. |
| **Tier** | Score band: none / Okay (green) / Good (blue) / Amazing (purple) / Perfect (gold). |

### The 17 muscles and their categories

| Category | Muscles | Weekly target (effective sets) |
|---|---|---|
| Chest | `chest` | 12 |
| Back | `lats` 12, `upper_back` 10, `lower_back` 6 | — |
| Shoulders | `delts_front` 8, `delts_side` 10, `delts_rear` 8, `traps` 8 | — |
| Arms | `biceps` 10, `triceps` 10, `forearms` 6 | — |
| Legs | `quads` 12, `hamstrings` 10, `glutes` 10, `calves` 10 | — |
| Core | `abs` 8, `obliques` 6 | — |

Targets are per week and user-editable in Settings (advanced).

---

## 4. Functional design

### 4.1 Onboarding and gym setup

Runs once on first launch. Skippable, resumable, re-enterable from Settings.

**Step 1 — Units and increments**

- Unit: kg / lb.
- Equipment increments, pre-filled with sensible defaults, all editable:

  | Equipment | Default step | Notes |
  |---|---|---|
  | `machine_stack` | 5 | Selectorised machine |
  | `cable_stack` | 2.5 | Cable tower |
  | `plate_loaded` | 1.25 | Per side, doubled for display total |
  | `barbell` | 2.5 | Includes 20 kg bar by default |
  | `dumbbell` | — | Uses the dumbbell rack list instead (below) |
  | `bodyweight` | 0 | Optional added weight |

- **Dumbbell rack**: a list of the weights that physically exist at their gym.
  Default `2,4,6,8,10,12,14,16,18,20,22.5,25,27.5,30,32.5,35,40,45,50`.
  Editable as a comma list or by tapping a generated grid to toggle.
  The weight scrubber snaps to these values only, so you can never enter a dumbbell that doesn't exist.

**Step 2 — Gym inventory (the "1 setup")**

A checklist of every exercise in the library, grouped by **muscle category** then by **equipment**.
Each row: exercise name, equipment icon, primary muscle. Tap to toggle.

- Header per group: `Select all` / `Select none` and a count `14 of 22`.
- Search box filters live.
- A "Typical commercial gym" preset is pre-applied, so the default state is already sensible and the user is *editing*, not building from zero.
- `+ Add exercise not in this list` → custom exercise form (§4.2).
- Footer: `18 exercises across 6 categories — Continue`.

Result is stored in `GymProfile.available: Set<ExerciseId>`.

Everywhere the app offers an exercise (session builder, plan editor, swap sheet), it shows
**available exercises only**, with a `Show everything` toggle that reveals the rest greyed out;
picking a greyed one asks *"Add to your gym?"* and adds it to the inventory in one tap.

**Step 3 — Starting plan**

Three choices:
- `Use my current split` → a form to paste/enter days (pre-filled with the user's Monday/Thursday plan, see [Appendix A](#appendix-a--seed-data)).
- `Start from a template` → 3 templates: Upper/Lower, Push/Pull/Legs, Full body ×3.
- `Skip — I'll build as I go` → empty plan; the session builder becomes the primary path.

---

### 4.2 Exercise library

**Seeded catalogue** (~120 entries, see [Appendix A](#appendix-a--seed-data) for the full seed and the schema).

Each exercise:

```
id, name, aliases[], equipment, defaultRestSec,
muscles: { [MuscleId]: contribution 0..1 },
unilateral: boolean,
measure: 'weight' | 'stack_level' | 'bodyweight' | 'assisted'
```

- `contribution` is how much one set of this exercise loads that muscle.
  The primary muscle is 1.0. Synergists get 0.2–0.6.
- `measure: 'stack_level'` is for machines labelled 1–15 rather than kg — the scrubber
  then shows integers and the progress screen says "level 9" instead of "45 kg".
  Per-exercise override, set from the exercise detail sheet.

**Custom exercise form**

- Name (required)
- Equipment (picker)
- Measure mode (picker)
- Default rest (stepper, seconds)
- Muscles: a category-grouped list of the 17 muscles with a 0–100% slider each.
  Quick presets: `Primary only`, `Copy from…` (pick an existing exercise).
- If AI is enabled, a `Fill this in for me` button posts the name and gets back a
  suggested muscle map the user can adjust before saving (§12.3).

---

### 4.3 Plans

A plan is a list of **days**. A day is `{ id, label, weekday?, items[] }`.

- `label` is free text ("Monday", "Push A", "Heavy day").
- `weekday` is optional (0–6). Used only to suggest what's due.
- `items` is an ordered list of `{ exerciseId, workSets, dropSets, note? }`.

**Set scheme.** The user trains to failure. The scheme is therefore just counts:

- `workSets` — number of sets taken to failure (default 2).
- `dropSets` — number of dropset-style sets performed *before* the work sets (default 0).

**Automatic warm-ups.** The user's rule: *"every new muscle group per day gets 1 light warmup set."*
This is computed, never stored and never entered by hand:

```
warmupNeeded(day, itemIndex):
  primary = argmax(muscles) of item.exerciseId
  seen    = { argmax(muscles) of items[0..itemIndex-1] }
  return primary ∉ seen
```

The generated set list for an item is therefore:
`[warmup?] + [drop × dropSets] + [work × workSets]`

**Plan editor**
- Day cards with an ordered item list. Drag handle to reorder; also ↑/↓ buttons for accessibility.
- Tap an item → item sheet: set counts, rest override, measure mode, alternatives, remove.
- `+ Add exercise` → the same picker as the session builder (§4.4), filtered to the gym.
- `+ Add day`, rename, delete, duplicate day.
- `Build with Claude` (if AI enabled, §12.2).

---

### 4.4 Starting a workout — the Session Builder

> **Changed from the prototype.** The plan no longer dictates the order. The plan is a
> *suggestion* that pre-fills the queue; the user assembles and orders the actual session
> from muscle-group lists before starting.

**Entry points**
- Home → `Start` (pre-fills from the due day)
- Home → `Start empty session`
- Plan → day → `Start this day`

**Layout** — two zones, split screen, bottom zone is the queue.

```
┌─────────────────────────────────────────┐
│  ← Build session          Monday  ⌄      │   day picker (or "Freestyle")
├─────────────────────────────────────────┤
│  ▼ CHEST                    ●62   2/12   │   category header:
│    ✓ Inclined chest press    ⟲ last 60kg │   tier dot, eff sets / target
│    ✓ Chest fly                           │   ✓ = already in queue
│      Machine press                       │
│      Push-up                             │
│  ▶ BACK                     ●54   3/22   │   collapsed
│  ▶ SHOULDERS                ●91   5/26   │
│  ▶ ARMS                     ●62   4/26   │   ⚠ owed badge shown here
│  ▶ LEGS                     ○ 0   0/42   │   grey dot = untrained
│  ▶ CORE                     ○ 0   0/14   │
│                                          │
│  [ Search exercises            🔍 ]      │
├═════════════════════════════════════════┤
│  QUEUE · 8 exercises · ~52 min      ⌃    │   drag the handle to expand
│  ① Inclined chest press   ⋮⋮   ✕         │   drag to reorder
│  ② Lat pulldown           ⋮⋮   ✕         │
│  ③ Calf raises        ⚠owed ⋮⋮ ✕         │
│  …                                       │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │        START WORKOUT              │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Behaviour**

1. **Pre-fill.** Opening the builder from a plan day pre-fills the queue in plan order.
   A `Reset to plan order` link appears whenever the queue diverges.
2. **Category headers** show the live weekly tier dot and `effectiveSets / weeklyTarget`
   summed across the muscles in that category. This is the whole point: you decide what to
   train by *looking at what's grey*.
3. **Expanding a category** lists the gym-available exercises whose **primary** muscle is in
   that category, sorted:
   - owed (debt > 0) first, with a ⚠ badge,
   - then exercises in the current plan day,
   - then by most recently performed,
   - then alphabetically.
   Each row shows a ghost of last performance (`last 60kg × 9`) when available.
4. **Tapping a row** toggles it in/out of the queue. Adding appends to the end.
5. **Owed exercises are force-added.** Any exercise with `debt > 0` is added to the queue
   automatically on open and cannot be removed without a confirm ("You already skipped this
   last time"). Removing it still leaves the debt.
6. **Queue** is drag-to-reorder. Long-press lifts a row; auto-scroll at edges.
   Swipe left on a row to remove. Tap the sheet handle to expand the queue to full screen.
7. **Duration estimate** = Σ over queue of `(setCount × (workDurationEst + restSec))`,
   with `workDurationEst = 45 s`. Rounded to 5 min.
8. **Search** filters across all categories at once, matching name and aliases.
9. **Freestyle mode**: choosing "Freestyle" in the day picker starts with an empty queue.
   The session is logged with `dayId: null` and the label "Freestyle".
10. You can start with an empty queue and add exercises mid-session (§6.7).

---

### 4.5 Skip debt

Rules, evaluated when a session is finalised:

```
for each exercise in the session queue:
    performed = any set with done=true and type != 'warmup'
    if not performed:  debt[ex] += 1
    else:              debt[ex] = max(0, debt[ex] - 1)
```

Exercises that were in the plan day but never added to the queue also incur debt
(the user chose not to do them) — unless the session was Freestyle.

**Surfacing**
- Home card: `⚠ 2 owed` chip and a one-line plain-language explanation naming them.
- Session builder: owed exercises auto-added, pinned to the top of their category with a badge.
- Runner: `owed from last time` pill under the exercise name.
- Skipping an owed exercise requires a confirmation sheet: *"You skipped this last time too.
  Skipping again makes it two sessions missed."* → `Skip anyway` / `I'll do it`.
- Settings → `Owed exercises` list with a per-item `Clear` (forgiveness valve).

Debt is capped at 3 to avoid a doom spiral.

---

### 4.6 Body map and scoring

See [§10.1](#101-scoring) for the formulas and [Appendix B](#appendix-b--body-map-svg) for the asset.

- 17 muscles, front and back view side by side, always both visible (no toggle = no tap).
- Colour ladder: none `#2A2F3C`, Okay `#3FB950`, Good `#3D8BFD`, Amazing `#A371F7`, Perfect `#E3B341`.
- Tier 3 gets a 4 px `drop-shadow`, tier 4 gets 7 px. Nothing else glows.
- Tapping a muscle opens a small readout: name, effective sets vs target, tier, and the
  three exercises that contributed most in the window.
- The same component renders at three sizes: home hero, progress screen, session-complete summary.

---

### 4.7 Progress

- Range chips: `7d` (default) / `30d` / `90d`.
- **Body score** 0–100 headline, coloured by its own tier.
- Body map for the range.
- **Weakest first**: all 17 muscles as horizontal bars sorted ascending by score.
  This is the actionable list — it directly feeds what you open in the session builder.
- **Lifts**: per exercise, the top-set weight over the last 10 sessions as a sparkline,
  plus `now` / `best` / `delta`. Exercises measured as `stack_level` show levels.
- **History**: reverse-chronological session list → tap for a read-only session detail sheet.
- **Consistency**: sessions per week for the last 8 weeks as a small bar row.

---

### 4.8 Settings

- Units (kg/lb), theme (auto/dark/light).
- Rest timer: auto-start on/off, sound on/off, vibration on/off, default rest per equipment type.
- Gym profile → re-enter setup (§4.1).
- Weekly muscle targets (advanced, collapsed).
- Owed exercises list with clear.
- **Backup**: `Export JSON` (downloads a dated file), `Import JSON` (merge or replace).
- AI: on/off, and the endpoint URL if self-hosted.
- Reset everything (double confirm).

---

## 5. Screen specifications

### Navigation

Bottom tab bar, four tabs: **Today**, **Plan**, **Progress**, **Coach**.
The Runner and Session Builder are full-screen modals over the tabs; the tab bar is hidden there.

### 5.1 Today (home)

```
┌─────────────────────────────────────────┐
│ TUESDAY 22 SEPTEMBER              ⚙     │
│ Today                                   │
├─────────────────────────────────────────┤
│ ╭─────────────────────────────────────╮ │
│ │ THIS WEEK                  Details  │ │
│ │ 34 / 100                            │ │
│ │       ╭────────╮  ╭────────╮        │ │
│ │       │ FRONT  │  │  BACK  │        │ │  ← hero, ~300 px tall
│ │       ╰────────╯  ╰────────╯        │ │
│ │ ● Okay ● Good ● Amazing ● Perfect   │ │
│ ╰─────────────────────────────────────╯ │
│ ╭─────────────────────────────────────╮ │
│ │ UP NEXT              ⚠ 1 owed       │ │
│ │ Monday                              │ │
│ │ ① Inclined chest press  warm-up+2   │ │
│ │ ② Lat pulldown          warm-up+2   │ │
│ │ …                                   │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │          START                  │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │ [ Do Thursday ]  [ Freestyle ]      │ │
│ ╰─────────────────────────────────────╯ │
│ ╭─────────────────────────────────────╮ │
│ │ CARRIED OVER                        │ │
│ │ You skipped tricep extension last   │ │
│ │ time. It's already in tonight's     │ │
│ │ queue.                              │ │
│ ╰─────────────────────────────────────╯ │
│ ╭─────────────────────────────────────╮ │
│ │ RECENT              12 sessions     │ │
│ │ Monday · 18 Sep · 23 sets · 7 ex    │ │
│ ╰─────────────────────────────────────╯ │
└─────────────────────────────────────────┘
```

- **Which day is "up next"** = the plan day whose last completion is oldest,
  unless today's weekday matches a plan day that hasn't been done today.
- If a session is in progress, the primary button becomes `Resume workout` and shows elapsed time.

### 5.2 Session builder

See [§4.4](#44-starting-a-workout--the-session-builder).

### 5.3 Runner

See [§6](#6-the-logging-flow-detailed).

### 5.4 Plan

See [§4.3](#43-plans).

### 5.5 Progress

See [§4.7](#47-progress).

### 5.6 Coach

- Four one-tap prompts: `What should I train?`, `Fix my weak points`, `Tips for today`, `Log what I did`.
- Free-text box. Messages stream in.
- If the text looks like a workout log (contains a digit and one of `did / logged / sets / reps / skipped / kg / lb`),
  it routes to the parser (§12.4) instead of chat, and shows a **confirmation sheet** with the
  parsed sets before writing anything.
- If AI is disabled or offline: the tab shows what it would do and a note that everything
  else works without it. No dead-end.

---

## 6. The logging flow (detailed)

> **This is the part the user asked to be redesigned.** The goal: logging a normal set is
> one tap; adjusting weight is one gesture; a dropset is the same button pressed again;
> and reps get captured during rest when the hands are free.

### 6.1 Runner layout

```
┌─────────────────────────────────────────┐
│  ✕        2 of 8            ⋯           │  ✕ = pause, ⋯ = menu
│  Inclined chest press              ▾    │  ▾ opens the queue sheet
│  chest · front delts · triceps          │
│  ▓▓░░░░░░                               │  per-exercise progress dots
├─────────────────────────────────────────┤
│                                         │
│  ○  Warm-up          40 × —             │  SET STACK
│  ●  Set 1            60 × 9             │  done rows are compact
│  ▸  Set 2                               │  active row is highlighted
│         last time: 60 × 7               │  ghost of previous session
│                                         │
├─────────────────────────────────────────┤
│                                         │
│         ⌄ 57.5    60.0    62.5 ⌄        │  WEIGHT SCRUBBER
│    ─────┼────┼────┼──▮─┼────┼────┼───   │  drag; snaps to real weights
│                 ▲ last   ★ best         │  markers
│     ⊖                            ⊕      │  precision buttons
│                                         │
│  ┌───────────────────────────────────┐  │
│  │           LOG SET                 │  │  PRIMARY — 56 px tall
│  └───────────────────────────────────┘  │
│   ⤵ Drop weight      ⇄ Swap      ⤳ Skip │  SECONDARY
└─────────────────────────────────────────┘
```

Vertical priority: everything that needs a thumb is in the bottom 45%.

### 6.2 The weight scrubber

A horizontal ruler, full width, ~72 px tall.

- **Snapping.** Ticks are the weights that actually exist for this exercise's equipment,
  from `GymProfile`:
  - `dumbbell` → the dumbbell rack list (2, 4, 6, … 32.5, 35, 40)
  - `machine_stack` / `cable_stack` → multiples of the configured step
  - `barbell` / `plate_loaded` → bar weight + 2 × plate combinations
  - `stack_level` measure → integers 1…20
  - `bodyweight` → `BW`, then `BW +2.5`, `BW +5`, …
- **Gesture.** Drag left/right to scrub. One tick per `16 px` of travel. Haptic tick
  (`navigator.vibrate(8)`) on each notch change if vibration is enabled. Momentum is
  *disabled* — this is a precision control, not a fling.
- **Markers.** A `▲` at last session's working weight and a `★` at the all-time best.
  Passing the `▲` while scrubbing gives a double haptic. This is the progression cue,
  and it needs no chart.
- **Precision.** `⊖` / `⊕` buttons at the ends move exactly one tick. 48 px hit targets.
- **Direct entry.** Tapping the big number opens a numeric keypad sheet.
- **Unknown weight.** The scrubber can sit at `—`. Logging with `—` is allowed and scores
  normally; it just contributes nothing to the lift trend.
- **Carry-over.** On entering an exercise the scrubber is pre-set to the last weight used
  for that exercise. On entering a *warm-up* set it pre-sets to `round(lastWeight × 0.5)`
  snapped to a real tick.

### 6.3 Logging a normal set

1. Tap `LOG SET`.
2. The active row fills in with the scrubbed weight and `× —` for reps.
3. The row collapses to done (`●`), the next row becomes active.
4. The rest timer opens automatically (§6.6).

That is the whole interaction. **One tap.**

### 6.4 Dropsets and mid-set weight changes — one mechanic

The user described two situations that are mechanically identical:

- a *planned* dropset: "2× dropset → 3× till failure"
- an *unplanned* drop: "1 set was too heavy so after 3 reps I lightened the weight"

Both are **a set with more than one segment**. The UI treats them the same.

**Flow**

```
Active row:  ▸ Set 2

  tap  ⤵ Drop weight
       ↓
  • the current weight + reps are committed as segment 1
  • the scrubber auto-drops one "drop step" (default −20%, snapped to a real tick)
  • the active row becomes a chain:   ▸ Set 2   60×5 →  ▮48.0
  • the primary button relabels to    LOG DROP 2
  • a new button appears:             ✓ Finish set

  tap  LOG DROP 2   → commits segment 2, drops the weight again, button → LOG DROP 3
  tap  ✓ Finish set → closes the chain, row shows  ● Set 2  60×5 → 48×6 → 40×4
                      rest timer starts
```

- If the set scheme says this set is a `drop` type (from `dropSets` in the plan), the row
  starts in chain mode automatically and the primary button reads `LOG DROP 1` from the
  outset. Nothing extra to tap.
- `⤵ Drop weight` optionally asks for the reps you got at the previous weight via a
  3-chip quick picker (`3 4 5` centred on a sensible guess) — tappable but dismissible.
  **OPEN:** default this to on or off. Recommendation: on, because the reps *before* a drop
  are the only ones the user said they care about.
- The drop step percentage is a per-exercise setting, default 20%, editable in the exercise sheet.

### 6.5 Reps — captured during rest, never blocking

Reps are optional everywhere. The trick is *when* they are asked for.

- Logging never asks for reps. The set is written with `reps: null` = "to failure".
- The moment the rest timer opens, the timer panel shows a **rep chip row** for the set
  just completed:

```
┌─────────────────────────────────────────┐
│   ◔ 1:22      Set 2 · 60 kg             │
│   How many?   [6] [7] [8] [9] [10] [11] │   ← centred on last time's reps
│                              [ other ]  │
│   −15    +30    Skip rest               │
└─────────────────────────────────────────┘
```

- Tapping a chip writes the reps and the row updates. One tap, during dead time.
- Ignoring it costs nothing. The chips fade out when the timer ends.
- The chip range is `lastReps − 3 … lastReps + 2`, or `6…11` with no history.
- `other` opens the keypad.

### 6.6 Rest timer

- **Auto-start** after every logged set (setting; default on). Duration =
  exercise `defaultRestSec`, overridable per plan item, and shortened to 80% after the
  final set of an exercise.
- Presented as a bottom sheet that slides up over the secondary actions. The primary
  `LOG SET` button stays reachable — you can always start the next set early.
- Circular progress ring + large countdown, plus the rep chips (§6.5).
- Controls: `−15`, `+30`, `Skip rest`.
- **At zero**: double chime (Web Audio, 784 Hz then 1046 Hz) + `vibrate([120,70,120])`.
- **Screen Wake Lock** is requested while a session is active, released on pause/finish.
- **Backgrounding.** A web timer is not reliable when the tab is hidden. Mitigations:
  - Store `endsAt` as an absolute timestamp, recompute on `visibilitychange` so the
    countdown is always correct when you come back.
  - Fire a `Notification` at `endsAt` via the service worker when permission is granted
    (works on Android; not on iOS Safari unless the PWA is installed to the home screen).
  - **Native path**: this is the single feature that justifies the iOS wrapper.
    Implement as an ActivityKit Live Activity so the countdown lives in the Dynamic Island.
    See §11.6.

### 6.7 Mid-session control

Reached from the `▾` next to the exercise name, or the `⋯` menu.

- **Queue sheet**: the remaining exercises, drag to reorder, `Jump to` any one,
  `+ Add exercise` (opens the category picker from §4.4 as a sheet).
  This is the "machine is busy" escape hatch and it must be fast: two taps to promote
  a different exercise to next.
- **Swap**: replaces the current exercise with an alternative that hits the same muscles.
  Uses the cached alternatives list if present, otherwise offers gym-available exercises
  ranked by muscle-map similarity (cosine similarity over the contribution vectors) —
  **no AI needed**. The AI list is an enhancement, not a dependency.
- **Skip**: §4.5.
- **Edit a logged set**: tap any done row → inline editor with weight and reps per segment,
  `Add segment`, `Delete set`, `Un-log`.
- **Pause**: closes the runner, session persists, Home shows `Resume workout`.
  A session left open for >12 h is auto-finalised on next launch, with a toast.

### 6.8 Finishing

On `Finish workout`:
1. Compute debt changes (§4.5).
2. Write the session.
3. Show the summary sheet: sets, duration, the body map animating from its pre-session
   colours to its new ones over 600 ms, the new weekly score, and the carried/cleared lists.
4. `Close` returns to Home.

---

## 7. Interaction budget

Build to these. They are testable.

| Action | Max taps | Notes |
|---|---|---|
| Log a normal set at the same weight | **1** | `LOG SET` |
| Log a set at a different weight | **2** | scrub (1 gesture) + `LOG SET` |
| Log reps for a set | **1** | chip during rest |
| Log a 3-stage dropset | **4** | `LOG DROP 1` → `LOG DROP 2` → `LOG DROP 3` → `✓ Finish set` |
| Record "too heavy, stripped it" | **3** | `⤵ Drop weight` → rep chip → `✓ Finish set` |
| Move to the next exercise | **1** | `Next exercise` (or automatic after the last set) |
| Skip an exercise | **1** | (2 if owed — the confirm is deliberate) |
| Swap a busy machine | **2** | `⇄ Swap` → pick |
| Reorder the session before starting | **1 drag** | per move |
| Start today's workout as planned | **2** | `Start` → `Start workout` |
| Open the body map detail for a muscle | **1** | tap the muscle |

---

## 8. Visual design system

### 8.1 Tokens

```css
/* dark is the default: gyms are dim and OLED is cheap */
--bg:#0F1116;  --surf:#171A22;  --surf2:#1E222C;  --surf3:#262B37;
--line:#2A2F3B; --text:#E8EAF0; --dim:#8C93A6;   --dim2:#5A6173;
--mbase:#2A2F3C;  /* untrained muscle + silhouette */
--mstroke:#12141A;

--t0:#2A2F3C;  /* none    */
--t1:#3FB950;  /* Okay    */
--t2:#3D8BFD;  /* Good    */
--t3:#A371F7;  /* Amazing */
--t4:#E3B341;  /* Perfect */

--danger:#F0603A; --ok:#3FB950;
--r:14px; --r2:20px;   /* radii: controls / cards */
```

Light theme (`prefers-color-scheme: light` and an explicit override):

```css
--bg:#F2F4F8; --surf:#FFFFFF; --surf2:#F7F8FC; --surf3:#EBEEF5;
--line:#DFE3EC; --text:#151922; --dim:#666E82; --dim2:#98A0B4;
--mbase:#D2D8E4; --mstroke:#FFFFFF;
--t1:#2A9C42; --t2:#1E6FE0; --t3:#7D45D6; --t4:#B0791A;
```

### 8.2 Type

- **Archivo** (400/500/600/700) for UI and body.
- **Archivo Black** for the score number, the rest countdown, and the scrubber weight.
  Those three places only — the heavy face is the accent, used sparingly.
- Load from Google Fonts with a `system-ui` fallback stack; self-host for full offline.
- Scale: 10.5 / 12 / 13.5 / 15 (base) / 17 / 19 / 23 / 30 / 44.
- Tabular numerals (`font-variant-numeric: tabular-nums`) on every weight, rep, timer and score.
- Sentence case throughout. No all-caps except the tiny section eyebrows (11.5 px, 0.05em tracking).

### 8.3 Motion

- The one orchestrated moment is the **body map recolour** on session completion: each
  muscle transitions `color` over 500 ms with a 12 ms stagger by muscle index.
- Everything else: 150–200 ms, only in response to a tap. No scroll-triggered reveals.
- `prefers-reduced-motion: reduce` disables all transitions and the stagger.

### 8.4 Layout and safe areas

- Content max-width 520 px, centred; the app is mobile-first but must not look broken on desktop.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` on the root, the fixed tab bar, and
  the rest-timer sheet.
- Minimum touch target 44 × 44 px. The primary `LOG SET` button is 56 px tall, full width.
- One-screen layouts use `height: 100%` on `html, body`, never `100vh`.

### 8.5 Accessibility

- Colour is never the only signal: every tier is also stated as text in the muscle detail
  and the weakest-first list shows a numeric score.
- All interactive SVG muscles are `role="button"` with an `aria-label` of
  `"{name}, {tier}, {eff} of {target} sets"`.
- Visible focus rings (2 px `--t2`, 2 px offset).
- The rest timer announces via `aria-live="polite"` at 10 s and 0 s.

---

## 9. Data model

TypeScript. All persisted objects are plain JSON-serialisable.

```ts
// ---------- muscles ----------
type MuscleId =
  | 'traps' | 'delts_front' | 'delts_side' | 'delts_rear'
  | 'chest' | 'lats' | 'upper_back' | 'lower_back'
  | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques'
  | 'glutes' | 'quads' | 'hamstrings' | 'calves';

type MuscleCategory = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

interface MuscleDef {
  id: MuscleId;
  name: string;
  category: MuscleCategory;
  weeklyTarget: number;      // effective sets per week
}

// ---------- equipment ----------
type Equipment =
  | 'machine_stack' | 'cable_stack' | 'plate_loaded'
  | 'barbell' | 'dumbbell' | 'bodyweight' | 'other';

type MeasureMode = 'weight' | 'stack_level' | 'bodyweight' | 'assisted';

// ---------- exercises ----------
interface Exercise {
  id: string;
  name: string;
  aliases?: string[];
  equipment: Equipment;
  measure: MeasureMode;
  defaultRestSec: number;
  muscles: Partial<Record<MuscleId, number>>;  // contribution 0..1
  unilateral?: boolean;
  dropStepPct?: number;      // default 20
  custom?: boolean;
  createdAt?: number;
}

// ---------- gym ----------
interface GymProfile {
  id: 'default';
  name: string;
  unit: 'kg' | 'lb';
  available: string[];                       // Exercise ids
  increments: Record<Equipment, number>;     // step size per equipment
  dumbbells: number[];                       // the rack, ascending
  barWeight: number;                         // default 20 (kg) / 45 (lb)
  plates: number[];                          // per-side plates available
  updatedAt: number;
}

// ---------- plans ----------
interface PlanItem {
  exerciseId: string;
  workSets: number;      // to failure, default 2
  dropSets: number;      // default 0
  restSecOverride?: number;
  note?: string;
}
interface PlanDay {
  id: string;
  label: string;
  weekday?: number;      // 0=Sun .. 6=Sat
  items: PlanItem[];
}
interface Plan {
  id: 'default';
  days: PlanDay[];
  updatedAt: number;
}

// ---------- sessions ----------
type SetType = 'warmup' | 'work' | 'drop';

interface Segment {
  weight: number | null;   // null = not recorded
  reps: number | null;     // null = to failure / not counted
}
interface SetLog {
  id: string;
  type: SetType;
  segments: Segment[];     // 1 = normal, >1 = dropset or mid-set change
  done: boolean;
  at?: number;
}
interface ExerciseLog {
  exerciseId: string;
  sets: SetLog[];
  skipped: boolean;
  addedMidSession?: boolean;
}
interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  date: string;            // ISO date, local day the session belongs to
  dayId: string | null;    // null = freestyle
  label: string;
  queue: string[];         // exercise ids, in performed order
  logs: Record<string, ExerciseLog>;
  cursor: { exIndex: number; setIndex: number };  // for resume
  scratch?: { weight: number | null; pendingSegments: Segment[] };
}

// ---------- derived / state ----------
interface AppState {
  debt: Record<string, number>;               // exerciseId -> count, capped at 3
  lastPerformance: Record<string, {
    weight: number | null; reps: number | null; at: number; best: number | null;
  }>;
  coachCache: Record<string, {                // exerciseId -> cached AI output
    alternatives: { name: string; why: string; exerciseId?: string }[];
    cues: string[];
    fetchedAt: number;
  }>;
  settings: Settings;
}
interface Settings {
  theme: 'auto' | 'dark' | 'light';
  restAutoStart: boolean;
  restSound: boolean;
  restVibrate: boolean;
  repChipsOnRest: boolean;
  askRepsBeforeDrop: boolean;
  aiEnabled: boolean;
  aiEndpoint: string;
  weeklyTargets?: Partial<Record<MuscleId, number>>;  // overrides
}

interface MuscleScore {
  muscle: MuscleId;
  effectiveSets: number;
  target: number;
  score: number;      // 0..100
  tier: 0 | 1 | 2 | 3 | 4;
  topContributors: { exerciseId: string; effectiveSets: number }[];
}
interface BodyScore {
  overall: number;                        // 0..100
  muscles: Record<MuscleId, MuscleScore>;
  rangeDays: number;
}
```

### Storage layout (IndexedDB via Dexie)

```
db.version(1).stores({
  exercises:  'id, name, equipment',
  gym:        'id',
  plans:      'id',
  sessions:   'id, date, dayId, endedAt',
  state:      'id',            // single row, id='app'
  meta:       'key'            // schema version, lastBackupAt
})
```

Sessions are individual rows (not bucketed) — IndexedDB handles thousands fine.
Everything is read into memory at boot (a year of training is well under 1 MB) and
written through on mutation, so all reads are synchronous.

---

## 10. Algorithms

### 10.1 Scoring

```ts
const SET_VALUE = { warmup: 0.25, work: 1.0, drop: 1.0 };
const EXTRA_SEGMENT_VALUE = 0.4;

function setValue(s: SetLog): number {
  if (!s.done) return 0;
  return SET_VALUE[s.type] + Math.max(0, s.segments.length - 1) * EXTRA_SEGMENT_VALUE;
}

function effectiveSets(sessions: Session[], sinceMs: number): Record<MuscleId, number> {
  const acc = Object.fromEntries(MUSCLE_IDS.map(m => [m, 0]));
  for (const s of sessions) {
    if (Date.parse(s.date) < sinceMs || !s.endedAt) continue;
    for (const log of Object.values(s.logs)) {
      const map = exerciseById(log.exerciseId).muscles;
      for (const set of log.sets) {
        const v = setValue(set);
        if (!v) continue;
        for (const [m, contribution] of Object.entries(map)) acc[m] += v * contribution;
      }
    }
  }
  return acc;
}

const HEADROOM = 1.15;   // you hit 100 slightly above target, not exactly at it

function score(eff: number, weeklyTarget: number, rangeDays: number): number {
  const weeks = Math.max(1, rangeDays / 7);
  return clamp(Math.round(100 * eff / (weeklyTarget * weeks * HEADROOM)), 0, 100);
}

function tier(score: number): 0|1|2|3|4 {
  if (score <= 0) return 0;
  if (score < 40)  return 1;   // Okay      — green
  if (score < 70)  return 2;   // Good      — blue
  if (score < 90)  return 3;   // Amazing   — purple
  return 4;                    // Perfect   — gold
}

function overall(scores: Record<MuscleId, MuscleScore>): number {
  // weighted by target, so chest and quads matter more than forearms
  let num = 0, den = 0;
  for (const m of MUSCLE_IDS) {
    const t = targetFor(m);
    num += scores[m].score * t;
    den += 100 * t;
  }
  return Math.round(100 * num / den);
}
```

**Sanity check.** The user's current Monday + Thursday split, run twice in one week,
produces: side delts 91 (gold), biceps 70 (purple), chest 62, upper back 55, triceps 55,
lats 52 (blue), calves 39, front delts 38, traps 29, rear delts 27, forearms 26 (green),
and **0 for quads, hamstrings, glutes, abs, obliques and lower back**.
Overall **34 / 100**. If your implementation returns roughly these numbers, the scoring is wired correctly.

### 10.2 Warm-up derivation

See §4.3. Pure function of the day's item order — never persisted, recomputed on render.

### 10.3 Due-day selection

```ts
function dueDay(plan: Plan, sessions: Session[]): PlanDay | null {
  if (!plan.days.length) return null;
  const todayWd = new Date().getDay();
  const scheduled = plan.days.find(d => d.weekday === todayWd);
  const doneToday = scheduled && sessions.some(
    s => s.dayId === scheduled.id && s.endedAt && isSameLocalDay(s.date, Date.now()));
  if (scheduled && !doneToday) return scheduled;
  return [...plan.days].sort((a, b) => lastCompleted(a.id) - lastCompleted(b.id))[0];
}
```

### 10.4 Weight tick generation

```ts
function ticksFor(ex: Exercise, gym: GymProfile): number[] {
  switch (ex.measure) {
    case 'stack_level': return range(1, 20);
    case 'bodyweight':  return [0, ...multiples(gym.increments.plate_loaded, 0, 60)];
    default:
      switch (ex.equipment) {
        case 'dumbbell':   return gym.dumbbells;
        case 'barbell':    return plateCombinations(gym.barWeight, gym.plates);
        case 'plate_loaded': return plateCombinations(0, gym.plates);
        default:           return multiples(gym.increments[ex.equipment], 0, 250);
      }
  }
}
```

`plateCombinations(base, plates)` returns `base + 2 × (every achievable sum of plates)`,
deduplicated and sorted ascending.

### 10.5 Swap ranking without AI

```ts
// cosine similarity over the 17-dimensional muscle contribution vector,
// restricted to gym-available exercises, excluding the current one
function rankAlternatives(ex: Exercise, gym: GymProfile): Exercise[] {
  return gym.available
    .map(id => exerciseById(id))
    .filter(e => e.id !== ex.id)
    .map(e => ({ e, sim: cosine(vector(e.muscles), vector(ex.muscles)) }))
    .filter(x => x.sim > 0.6)
    .sort((a, b) => b.sim - a.sim)
    .map(x => x.e);
}
```

### 10.6 Debt

See §4.5. Applied once, at session finalisation, inside a single transaction with the
session write so it can never double-apply.

---

## 11. Technical architecture

### 11.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite** | Fast, zero-config PWA plugin, static output |
| Framework | **React 18 + TypeScript** | Most reliably generated; the state here is small |
| Styling | **Tailwind CSS** with the tokens in §8.1 as CSS variables | Tokens stay authoritative |
| State | **Zustand** (or React context + reducer) | No server state to manage |
| Storage | **Dexie** (IndexedDB) | Local-first, transactional, well-typed |
| PWA | **vite-plugin-pwa** (Workbox) | Manifest + service worker generation |
| Drag & drop | **@dnd-kit/core** | Touch-friendly reordering for the queue |
| Charts | Hand-rolled inline SVG | Sparklines and bars only; a chart library is overkill |
| Hosting | Any static host (Netlify / Vercel / Cloudflare Pages) | HTTPS is required for service workers |

> **Alternative if you prefer zero dependencies:** the whole app fits in one HTML file with
> vanilla JS and hand-written IndexedDB calls. The prototype proved that. Use the stack above
> only if you want the project to stay maintainable.

### 11.2 Project structure

```
src/
  main.tsx
  app/
    routes.tsx            Today | Plan | Progress | Coach + modal routes
    store.ts              Zustand store, all mutations
    db.ts                 Dexie schema, load-all-at-boot, write-through
  domain/
    muscles.ts            MUSCLE_DEFS, categories, targets
    exercises.seed.ts     the catalogue (Appendix A)
    scoring.ts            §10.1
    warmups.ts            §10.2
    weights.ts            §10.4 tick generation, snapping, formatting
    alternatives.ts       §10.5
    debt.ts               §10.6
  ui/
    BodyMap.tsx           Appendix B
    WeightScrubber.tsx    §6.2
    SetStack.tsx          §6.1
    RestTimer.tsx         §6.6
    ExercisePicker.tsx    §4.4, reused in plan editor and swap sheet
    SessionQueue.tsx      drag-to-reorder
    Sheet.tsx, Chip.tsx, Bar.tsx, Sparkline.tsx
  screens/
    Today.tsx  Builder.tsx  Runner.tsx  Plan.tsx  Progress.tsx  Coach.tsx
    Onboarding.tsx  Settings.tsx
  ai/
    client.ts             fetch wrapper for the proxy, with cache + graceful failure
    prompts.ts            §12
public/
  manifest.webmanifest
  icons/  (192, 512, maskable 512, apple-touch-icon 180)
  fonts/  (self-hosted Archivo for offline)
```

### 11.3 PWA configuration

`manifest.webmanifest`:

```json
{
  "name": "Iron — training log",
  "short_name": "Iron",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0F1116",
  "theme_color": "#0F1116",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Start workout", "url": "/?action=start" },
    { "name": "Progress",      "url": "/progress" }
  ]
}
```

Service worker (Workbox, `registerType: 'autoUpdate'`):

- **Precache** the entire app shell, fonts, and icons. The app must launch with the network off.
- **Runtime cache**: none needed — there are no remote assets at runtime except AI calls,
  which must *not* be cached by the SW (the AI client does its own caching).
- **Update flow**: on `waiting`, show a small toast `New version — reload`. Never auto-reload
  mid-session.

Also required in `index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0F1116">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

### 11.4 Platform APIs used

| API | Use | Fallback |
|---|---|---|
| IndexedDB | All storage | none — required |
| Screen Wake Lock | Keep the screen on during a session | silently skip |
| Vibration | Scrubber ticks, rest end | silently skip (iOS Safari has none) |
| Web Audio | Rest chime | silently skip |
| Notifications + SW | Rest timer when backgrounded | in-app only |
| `visibilitychange` | Recompute timer from absolute `endsAt` | — |
| File System Access / `<a download>` | JSON backup | `<a download>` everywhere |

### 11.5 Sync (deferred, but design for it)

Every record carries `updatedAt`. Sessions are immutable once finalised. That makes a
last-writer-wins sync trivial to bolt on later against any document store. Do **not** build
it in v1; do keep the timestamps.

### 11.6 Native path (v2)

The only feature that genuinely needs native is the background rest timer.

- Wrap the same web build with **Capacitor**; the PWA becomes the app shell unchanged.
- Add a small Swift plugin exposing `startRest(seconds, exerciseName)` / `stopRest()`.
- Implement with **ActivityKit**: a `Live Activity` with a countdown `Text(timerInterval:)`
  so the Dynamic Island and Lock Screen update without the app running.
- Compact leading: exercise name. Compact trailing: remaining time. Expanded: ring +
  `+30` / `Skip` buttons via `AppIntent` (iOS 17+).
- The web `RestTimer` component calls a thin abstraction (`platform.rest.start(...)`) that
  is a no-op shim on web and the plugin call in the native build. **No other code changes.**

---

## 12. AI layer

AI is **optional**. Every AI-backed feature has a deterministic fallback or degrades to hidden.
Never block a screen on an AI call.

### 12.1 Transport

The API key must never reach the client. Ship a single serverless endpoint.

```
POST /api/coach
{ "task": "brief" | "weakpoints" | "cues" | "alternatives" | "plan" | "parselog" | "chat",
  "payload": { ... },
  "context": { ...see §12.2... } }

200 → { "ok": true,  "data": <task-specific JSON> | { "text": string } }
4xx → { "ok": false, "code": "rate_limited" | "bad_request" | "refused", "message": string }
```

- Cloudflare Worker or Vercel Edge Function, ~60 lines.
- Rate-limit per IP. Set a hard monthly spend cap.
- Model: a fast tier for cues/alternatives/parsing, a stronger tier for plan building.
- Responses that must be structured are requested as JSON-only and validated against a
  schema on the server; invalid JSON returns `bad_request` rather than reaching the client.

### 12.2 Shared context block

Every task except `parselog` and `alternatives` includes:

```
Lifter context (kg). Trains to failure. Default 2 work sets per exercise,
1 light warm-up set per new muscle group per day. Rarely counts reps.
Today: {date}. Next session: {dayLabel} — {exercise names}.
Weekly body score {overall}/100. Weakest: {top 5 muscles with scores}.
Owed (skipped last time): {names or "none"}.
Gym has: {count} exercises; notable equipment: {equipment types present}.
Recent sessions:
{last 4 sessions, one line each: date, label, "exercise ×N sets" or "SKIPPED"}
```

### 12.3 Tasks

| Task | Input | Output | Cached |
|---|---|---|---|
| `brief` | context | ≤90 words, plain prose, no headers | 5 min |
| `weakpoints` | context | ≤90 words, 2 areas + 1 concrete fix each | 5 min |
| `cues` | exercise name + muscles | `string[3]`, ≤12 words each | **forever, on the exercise** |
| `alternatives` | exercise + gym inventory names | `{name, why, equipment, muscles}[4]`, why ≤9 words | **forever, on the exercise** |
| `musclemap` | custom exercise name | `Partial<Record<MuscleId, number>>` | n/a |
| `plan` | context + request + current plan | `PlanDay[]` with exercise names and muscle maps | n/a |
| `parselog` | free text + known exercise ids | `Session`-shaped draft | n/a |
| `chat` | context + turn history | prose ≤110 words | no |

`cues` and `alternatives` are fetched **once per exercise**, at plan-edit time or first use,
and stored in `AppState.coachCache`. During a workout they render instantly from cache with
zero network. This is what the user asked for: *"these are done while building the workout
and remembered for future use."*

### 12.4 Natural-language logging

```
Convert this training note into JSON. Known exercise ids: {id=name, ...}.
Note: """{text}"""
Reply with only JSON:
{"date":"YYYY-MM-DD","entries":[{"ex":"<id or plain name>","skipped":false,
 "sets":[{"w":40,"r":12}]}]}
Rules: w is weight in {unit}, null if unknown. r is reps, null if not stated or
"to failure". One object per set. A set where the weight dropped mid-way becomes
two set objects. Default date {today}. Prefer an existing id when it matches.
```

**The result is never written directly.** It renders as a confirmation sheet:
the parsed exercises and sets, each editable, with `Discard` / `Save session`.
Unknown exercise names become custom exercises only on save, and prompt for a muscle map.

---

## 13. Non-functional requirements

| # | Requirement |
|---|---|
| N1 | Cold launch to interactive **< 1.5 s** on a mid-range Android over 3G, and **< 400 ms** when installed and offline. |
| N2 | Every screen works fully offline except Coach. |
| N3 | Zero data leaves the device unless the user uses Coach or exports a backup. |
| N4 | Logging a set must never wait on IO. Write-through is fire-and-forget; the UI updates from memory. |
| N5 | A crash or force-quit mid-session must lose at most the currently-active (unlogged) set. Persist after every set. |
| N6 | The rest countdown must be correct after backgrounding, computed from an absolute timestamp. |
| N7 | Total bundle **< 300 KB** gzipped excluding self-hosted fonts. |
| N8 | Works one-handed in portrait on a 375 px viewport. |
| N9 | No layout shift when the rest timer opens — it overlays, it does not push. |
| N10 | All data is exportable and re-importable as a single JSON file, with schema version. |

---

## 14. Acceptance criteria

Write these as automated tests where possible. They are derived from a working prototype.

### Setup and library
- [ ] First launch shows onboarding; completing it stores a `GymProfile` with `available.length > 0`.
- [ ] Exercise pickers show only gym-available exercises by default.
- [ ] Toggling `Show everything` reveals the rest; picking one adds it to the gym in one tap.
- [ ] A custom exercise with a muscle map appears in pickers and contributes to scoring.

### Plans and warm-ups
- [ ] The seeded Monday day lists 8 exercises in the user's order.
- [ ] Inclined chest press shows `warm-up + 2 to failure`.
- [ ] Chest fly shows `2 to failure` (no warm-up — chest was already hit that day).
- [ ] Cable lateral raise shows `warm-up + 2 dropset + 3 to failure`.
- [ ] Reordering items so chest fly comes first moves the warm-up to chest fly.

### Session builder
- [ ] Opening from a plan day pre-fills the queue in plan order.
- [ ] Category headers show a tier dot and `effective / target` for the current week.
- [ ] Expanding Legs on a fresh account shows a grey dot and `0 / 42`.
- [ ] Tapping an exercise adds it to the queue; tapping again removes it.
- [ ] An exercise with `debt > 0` is auto-added and shows a ⚠ badge.
- [ ] Removing an owed exercise requires a confirm.
- [ ] The queue reorders by drag and the runner follows the new order.

### Runner and logging
- [ ] `LOG SET` with no other interaction logs a set at the carried-over weight with `reps: null`.
- [ ] The rest timer opens automatically after logging.
- [ ] Scrubbing the weight snaps to ticks derived from the gym profile; dumbbells snap to the rack list.
- [ ] The `▲ last` marker sits at the previous session's working weight.
- [ ] `⤵ Drop weight` commits a segment, lowers the weight by the drop step, and relabels the button.
- [ ] `✓ Finish set` closes a chain and the row renders `60×5 → 48×6 → 40×4`.
- [ ] A plan item with `dropSets: 2` starts those sets in chain mode automatically.
- [ ] Rep chips appear during rest and writing one updates the set row.
- [ ] After the last set the primary button becomes `Next exercise`.
- [ ] Skipping an exercise with no debt advances immediately; with debt it asks first.
- [ ] `Jump to` from the queue sheet switches exercise in two taps and preserves progress.
- [ ] `Swap` offers alternatives ranked by muscle similarity with AI switched off.
- [ ] Tapping a completed set opens an editor; editing weight updates the lift trend.
- [ ] Pausing and relaunching restores the session at the same exercise and set.

### Scoring and map
- [ ] All 17 muscles render on the map, front and back, mirrored.
- [ ] Untrained muscles use `--t0` and no glow.
- [ ] After the user's Monday session, side delts are the highest-scoring muscle.
- [ ] A full week of their split yields overall **≈34/100** and quads/hamstrings/glutes/abs/obliques/lower back at **0**.
- [ ] Tier boundaries: 39→green, 40→blue, 69→blue, 70→purple, 89→purple, 90→gold.
- [ ] Tapping a muscle shows its name, effective sets, target and top contributors.

### Debt
- [ ] Skipping tricep extension on Monday sets `debt.tricep_ext = 1`.
- [ ] Home shows an owed chip naming it.
- [ ] Completing it on Thursday clears the debt to 0.
- [ ] Debt never exceeds 3.

### Progress and data
- [ ] Range chips recompute the map and the weakest-first list.
- [ ] Per-lift sparklines show the top-set weight over the last 10 sessions.
- [ ] Export produces a JSON file that, imported into a fresh install, reproduces every screen.

### PWA
- [ ] Lighthouse PWA audit passes; the install prompt appears on Android Chrome.
- [ ] With the network disabled, a cold launch reaches Today and a full session can be logged.
- [ ] Rest countdown is correct after 60 s in the background.
- [ ] Safe areas respected on a notched device: nothing under the status bar or home indicator.

---

## 15. Build order

Ship in this order; each milestone is independently usable.

| # | Milestone | Contents |
|---|---|---|
| **M1** | Skeleton + data | Vite/React/TS/Tailwind, Dexie schema, tokens, tab shell, exercise seed, muscle defs |
| **M2** | Body map | `BodyMap.tsx` from Appendix B, scoring functions, Today hero with a hardcoded score |
| **M3** | Gym setup | Onboarding, gym profile, exercise pickers filtered to available |
| **M4** | Plans | Plan editor, warm-up derivation, due-day logic, Today card |
| **M5** | **Session builder** | Category lists, queue, drag-to-reorder, duration estimate |
| **M6** | **Runner + logging** | Set stack, weight scrubber, one-tap logging, dropset chaining, set editing |
| **M7** | Rest timer | Auto-start, ring, rep chips, chime/vibrate, wake lock, absolute-time correctness |
| **M8** | Debt + finish | Finalisation, debt rules, summary sheet with the animated recolour |
| **M9** | Progress | Ranges, weakest-first, sparklines, history, export/import |
| **M10** | PWA | Manifest, icons, service worker, self-hosted fonts, offline verification |
| **M11** | Coach | Proxy endpoint, the seven tasks, caching of cues/alternatives, parse-log confirm sheet |
| **M12** | Polish | Motion, accessibility pass, Lighthouse, the acceptance list in §14 |

M1–M10 have **no network dependency at all**. Build them first and the app is already
complete against the original brief; M11 is additive.

---
## Appendix A — Seed data

### A.1 Muscle definitions

```ts
export const MUSCLE_DEFS: MuscleDef[] = [
  { id:'chest',       name:'Chest',       category:'chest',     weeklyTarget:12 },
  { id:'lats',        name:'Lats',        category:'back',      weeklyTarget:12 },
  { id:'upper_back',  name:'Upper back',  category:'back',      weeklyTarget:10 },
  { id:'lower_back',  name:'Lower back',  category:'back',      weeklyTarget:6  },
  { id:'traps',       name:'Traps',       category:'shoulders', weeklyTarget:8  },
  { id:'delts_front', name:'Front delts', category:'shoulders', weeklyTarget:8  },
  { id:'delts_side',  name:'Side delts',  category:'shoulders', weeklyTarget:10 },
  { id:'delts_rear',  name:'Rear delts',  category:'shoulders', weeklyTarget:8  },
  { id:'biceps',      name:'Biceps',      category:'arms',      weeklyTarget:10 },
  { id:'triceps',     name:'Triceps',     category:'arms',      weeklyTarget:10 },
  { id:'forearms',    name:'Forearms',    category:'arms',      weeklyTarget:6  },
  { id:'quads',       name:'Quads',       category:'legs',      weeklyTarget:12 },
  { id:'hamstrings',  name:'Hamstrings',  category:'legs',      weeklyTarget:10 },
  { id:'glutes',      name:'Glutes',      category:'legs',      weeklyTarget:10 },
  { id:'calves',      name:'Calves',      category:'legs',      weeklyTarget:10 },
  { id:'abs',         name:'Abs',         category:'core',      weeklyTarget:8  },
  { id:'obliques',    name:'Obliques',    category:'core',      weeklyTarget:6  },
];
```

Category totals used by the session-builder headers: chest 12, back 28, shoulders 34,
arms 26, legs 42, core 14.

### A.2 Exercise catalogue

Compact tuple form to keep the seed readable. Hydrate into `Exercise` objects at boot.

```ts
// [ id, name, equipment, defaultRestSec, muscles, measure? ]
type Seed = [string, string, Equipment, number, Partial<Record<MuscleId, number>>, MeasureMode?];

export const CATALOGUE: Seed[] = [
// ───────────────────────────── CHEST ─────────────────────────────
['bench_press','Barbell bench press','barbell',150,{chest:1,triceps:.5,delts_front:.45}],
['incline_bench_press','Incline barbell bench press','barbell',150,{chest:1,delts_front:.6,triceps:.45}],
['db_bench_press','Dumbbell bench press','dumbbell',120,{chest:1,triceps:.45,delts_front:.4}],
['incline_db_press','Incline dumbbell press','dumbbell',120,{chest:1,delts_front:.6,triceps:.4}],
['machine_chest_press','Machine chest press','machine_stack',100,{chest:1,triceps:.4,delts_front:.35}],
['incline_machine_press','Inclined chest press','machine_stack',100,{chest:1,delts_front:.5,triceps:.4}],
['decline_machine_press','Decline chest press','machine_stack',100,{chest:1,triceps:.45}],
['smith_bench_press','Smith machine bench press','barbell',120,{chest:1,triceps:.5,delts_front:.4}],
['pec_deck','Chest fly','machine_stack',75,{chest:1,delts_front:.3}],
['cable_fly_mid','Cable fly','cable_stack',75,{chest:1,delts_front:.3}],
['cable_fly_low','Low-to-high cable fly','cable_stack',70,{chest:1,delts_front:.4}],
['cable_fly_high','High-to-low cable fly','cable_stack',70,{chest:1,delts_front:.2}],
['pushup','Push-up','bodyweight',60,{chest:1,triceps:.5,delts_front:.4,abs:.25},'bodyweight'],
['chest_dip','Chest dip','bodyweight',110,{chest:1,triceps:.8,delts_front:.4},'bodyweight'],

// ───────────────────────────── BACK ──────────────────────────────
['lat_pulldown','Lat pulldown','cable_stack',95,{lats:1,biceps:.4,upper_back:.4,delts_rear:.2}],
['wide_pulldown','Wide-grip lat pulldown','cable_stack',95,{lats:1,upper_back:.45,biceps:.3,delts_rear:.25}],
['neutral_pulldown','Neutral-grip pulldown','cable_stack',95,{lats:1,biceps:.5,upper_back:.35}],
['straight_arm_pulldown','Straight-arm pulldown','cable_stack',70,{lats:1,triceps:.25,abs:.2}],
['pullup','Pull-up','bodyweight',120,{lats:1,biceps:.5,upper_back:.45,forearms:.3},'bodyweight'],
['chinup','Chin-up','bodyweight',120,{lats:1,biceps:.75,upper_back:.35},'bodyweight'],
['assisted_pullup','Assisted pull-up machine','machine_stack',110,{lats:1,biceps:.5,upper_back:.4},'assisted'],
['seated_cable_row','Seated cable row','cable_stack',95,{upper_back:1,lats:.6,biceps:.4,delts_rear:.35}],
['seated_row_machine','Seated row machine','machine_stack',95,{upper_back:1,lats:.6,biceps:.4,delts_rear:.35}],
['chest_supported_row','Chest-supported row','machine_stack',95,{upper_back:1,lats:.55,delts_rear:.45,biceps:.35}],
['barbell_row','Barbell row','barbell',120,{upper_back:1,lats:.8,lower_back:.5,biceps:.35,forearms:.3}],
['db_row','Dumbbell row','dumbbell',90,{upper_back:1,lats:.9,biceps:.35,forearms:.25}],
['tbar_row','T-bar row','plate_loaded',120,{upper_back:1,lats:.8,lower_back:.4,biceps:.35}],
['inverted_row','Inverted row','bodyweight',75,{upper_back:1,lats:.6,biceps:.4},'bodyweight'],
['deadlift','Deadlift','barbell',180,{lower_back:1,glutes:.9,hamstrings:.9,traps:.6,forearms:.5,upper_back:.5}],
['rack_pull','Rack pull','barbell',150,{traps:1,lower_back:.8,upper_back:.6,forearms:.5,glutes:.4}],
['back_extension','Back extension','bodyweight',70,{lower_back:1,glutes:.5,hamstrings:.45},'bodyweight'],
['good_morning','Good morning','barbell',110,{hamstrings:1,lower_back:.9,glutes:.6}],

// ─────────────────────────── SHOULDERS ───────────────────────────
['ohp','Overhead press','barbell',120,{delts_front:1,delts_side:.5,triceps:.5,abs:.25}],
['db_shoulder_press','Dumbbell shoulder press','dumbbell',110,{delts_front:1,delts_side:.55,triceps:.45}],
['machine_shoulder_press','Machine shoulder press','machine_stack',100,{delts_front:1,delts_side:.5,triceps:.4}],
['arnold_press','Arnold press','dumbbell',110,{delts_front:1,delts_side:.6,triceps:.4}],
['db_lateral_raise','Dumbbell lateral raise','dumbbell',60,{delts_side:1,traps:.25}],
['cable_lateral_raise','Cable lateral raise','cable_stack',60,{delts_side:1,traps:.25}],
['machine_lateral_raise','Machine lateral raise','machine_stack',60,{delts_side:1,traps:.2}],
['front_raise','Front raise','dumbbell',60,{delts_front:1,delts_side:.2}],
['rear_delt_fly','Rear delt fly','dumbbell',60,{delts_rear:1,upper_back:.45,traps:.25}],
['reverse_pec_deck','Reverse pec deck','machine_stack',60,{delts_rear:1,upper_back:.5,traps:.3}],
['face_pull','Face pull','cable_stack',60,{delts_rear:1,upper_back:.5,traps:.35}],
['upright_row','Upright row','barbell',75,{delts_side:1,traps:.7,biceps:.25}],
['bb_shrug','Barbell shrug','barbell',60,{traps:1,forearms:.35}],
['db_shrug','Dumbbell shrug','dumbbell',60,{traps:1,forearms:.35}],

// ───────────────────────────── ARMS ──────────────────────────────
['bb_curl','Barbell curl','barbell',60,{biceps:1,forearms:.4}],
['db_curl','Bicep curl','dumbbell',60,{biceps:1,forearms:.4}],
['hammer_curl','Hammer curl','dumbbell',60,{forearms:1,biceps:.8}],
['preacher_curl','Preacher curl','plate_loaded',70,{biceps:1,forearms:.3}],
['incline_curl','Incline dumbbell curl','dumbbell',60,{biceps:1,forearms:.3}],
['cable_curl','Cable curl','cable_stack',60,{biceps:1,forearms:.35}],
['machine_curl','Machine curl','machine_stack',60,{biceps:1,forearms:.25}],
['concentration_curl','Concentration curl','dumbbell',55,{biceps:1,forearms:.25}],
['reverse_curl','Reverse curl','barbell',55,{forearms:1,biceps:.6}],
['tricep_pushdown','Tricep pushdown','cable_stack',60,{triceps:1}],
['rope_pushdown','Rope pushdown','cable_stack',60,{triceps:1}],
['cable_overhead_extension','Tricep extension','cable_stack',60,{triceps:1}],
['db_overhead_extension','Dumbbell overhead extension','dumbbell',70,{triceps:1}],
['skullcrusher','Skull crusher','barbell',75,{triceps:1}],
['close_grip_bench','Close-grip bench press','barbell',120,{triceps:1,chest:.6,delts_front:.3}],
['tricep_dip','Tricep dip','bodyweight',100,{triceps:1,chest:.5,delts_front:.3},'bodyweight'],
['machine_tricep_ext','Machine tricep extension','machine_stack',60,{triceps:1}],
['wrist_curl','Wrist curl','dumbbell',45,{forearms:1}],
['farmers_carry','Farmer\'s carry','dumbbell',90,{forearms:1,traps:.7,abs:.4,obliques:.4}],

// ───────────────────────────── LEGS ──────────────────────────────
['back_squat','Back squat','barbell',180,{quads:1,glutes:.8,lower_back:.4,hamstrings:.35,abs:.3}],
['front_squat','Front squat','barbell',170,{quads:1,glutes:.6,abs:.45,upper_back:.3}],
['hack_squat','Hack squat','plate_loaded',150,{quads:1,glutes:.6,hamstrings:.25}],
['smith_squat','Smith machine squat','barbell',150,{quads:1,glutes:.7,hamstrings:.3}],
['leg_press','Leg press','plate_loaded',130,{quads:1,glutes:.65,hamstrings:.35}],
['goblet_squat','Goblet squat','dumbbell',110,{quads:1,glutes:.6,abs:.35}],
['bulgarian_split_squat','Bulgarian split squat','dumbbell',110,{quads:1,glutes:.85,hamstrings:.35}],
['walking_lunge','Walking lunge','dumbbell',110,{quads:1,glutes:.85,hamstrings:.4,calves:.25}],
['step_up','Step-up','dumbbell',90,{quads:1,glutes:.8,calves:.25}],
['leg_extension','Leg extension','machine_stack',75,{quads:1}],
['rdl','Romanian deadlift','barbell',140,{hamstrings:1,glutes:.8,lower_back:.7,forearms:.3}],
['db_rdl','Dumbbell Romanian deadlift','dumbbell',110,{hamstrings:1,glutes:.75,lower_back:.55}],
['lying_leg_curl','Lying leg curl','machine_stack',75,{hamstrings:1,calves:.2}],
['seated_leg_curl','Seated leg curl','machine_stack',75,{hamstrings:1,calves:.2}],
['hip_thrust','Hip thrust','barbell',110,{glutes:1,hamstrings:.5}],
['glute_bridge','Glute bridge','plate_loaded',90,{glutes:1,hamstrings:.45}],
['cable_kickback','Cable kickback','cable_stack',55,{glutes:1,hamstrings:.3}],
['hip_abduction','Hip abduction machine','machine_stack',60,{glutes:1}],
['hip_adduction','Hip adduction machine','machine_stack',60,{quads:.5,glutes:.4}],
['standing_calf_raise','Calf raises','machine_stack',55,{calves:1}],
['seated_calf_raise','Seated calf raise','plate_loaded',55,{calves:1}],
['leg_press_calf_raise','Leg press calf raise','plate_loaded',55,{calves:1}],

// ───────────────────────────── CORE ──────────────────────────────
['cable_crunch','Cable crunch','cable_stack',55,{abs:1,obliques:.4}],
['machine_crunch','Machine crunch','machine_stack',55,{abs:1,obliques:.3}],
['hanging_leg_raise','Hanging leg raise','bodyweight',70,{abs:1,obliques:.45,forearms:.3},'bodyweight'],
['captains_chair_raise','Knee raise','bodyweight',60,{abs:1,obliques:.4},'bodyweight'],
['decline_situp','Decline sit-up','bodyweight',60,{abs:1,obliques:.35},'bodyweight'],
['ab_wheel','Ab wheel','bodyweight',70,{abs:1,obliques:.4,lats:.3},'bodyweight'],
['plank','Plank','bodyweight',50,{abs:1,obliques:.5},'bodyweight'],
['side_plank','Side plank','bodyweight',45,{obliques:1,abs:.5},'bodyweight'],
['russian_twist','Russian twist','dumbbell',50,{obliques:1,abs:.6}],
['pallof_press','Pallof press','cable_stack',45,{obliques:1,abs:.5}],
['cable_woodchop','Cable woodchop','cable_stack',55,{obliques:1,abs:.55}],
];
```

**Notes for the implementer**

- 98 entries. Extend freely; the only hard requirement is that every exercise has at
  least one muscle at contribution 1.0 (its primary), which the warm-up rule depends on.
- `measure` defaults to `'weight'` when omitted.
- Names are the user-facing labels. Where the user's own wording differs from the
  conventional name, the user's wording wins (`Inclined chest press`, `Calf raises`,
  `Chest fly`, `Bicep curl`, `Tricep extension`).
- Contribution values are deliberately coarse. They only need to be right relative to
  each other, since scoring divides by a target that is itself an estimate.

### A.3 Default gym profile

```ts
export const DEFAULT_GYM: GymProfile = {
  id: 'default',
  name: 'My gym',
  unit: 'kg',
  available: CATALOGUE.map(e => e[0]),   // typical commercial gym: everything on
  increments: {
    machine_stack: 5, cable_stack: 2.5, plate_loaded: 1.25,
    barbell: 2.5, dumbbell: 2, bodyweight: 2.5, other: 2.5,
  },
  dumbbells: [2,4,6,8,10,12,14,16,18,20,22.5,25,27.5,30,32.5,35,40,45,50],
  barWeight: 20,
  plates: [1.25,2.5,5,10,15,20,25],
  updatedAt: Date.now(),
};
```

### A.4 The user's starting plan

Transcribed from their own words. Monday and Thursday are identical.

> Monday & Thursday — inclined chestpress, latpulldown, calveraises, seated row machine,
> chestfly, cable lat raises (2× dropset → 3× till failure), bicep curl, tricep extension.
> Everything is 2× till failure and every new muscle group per day gets 1 light warm-up set.

```ts
const DAY_ITEMS: PlanItem[] = [
  { exerciseId:'incline_machine_press',     workSets:2, dropSets:0 },
  { exerciseId:'lat_pulldown',              workSets:2, dropSets:0 },
  { exerciseId:'standing_calf_raise',       workSets:2, dropSets:0 },
  { exerciseId:'seated_row_machine',        workSets:2, dropSets:0 },
  { exerciseId:'pec_deck',                  workSets:2, dropSets:0 },
  { exerciseId:'cable_lateral_raise',       workSets:3, dropSets:2 },
  { exerciseId:'db_curl',                   workSets:2, dropSets:0 },
  { exerciseId:'cable_overhead_extension',  workSets:2, dropSets:0 },
];

export const SEED_PLAN: Plan = {
  id: 'default',
  days: [
    { id:'mon', label:'Monday',   weekday:1, items: structuredClone(DAY_ITEMS) },
    { id:'thu', label:'Thursday', weekday:4, items: structuredClone(DAY_ITEMS) },
  ],
  updatedAt: Date.now(),
};
```

**Two interpretations baked in — surface both during onboarding so they can be corrected in one tap:**

1. *"cable lat raises"* is read as cable **lateral** raises (side delts), not a lat exercise.
   The position in the list (after chest fly, before arms) and the dropset scheme both support this.
2. *"2× dropset → 3× till failure"* is read as two dropset-style sets **followed by** three
   straight sets to failure, i.e. `dropSets: 2, workSets: 3`.

**Derived warm-ups for this day** (computed, not stored). Primary muscles in order:
chest, lats, calves, upper_back, chest(seen), delts_side, biceps, triceps →
warm-up sets are added to inclined chest press, lat pulldown, calf raises, seated row,
cable lateral raise, bicep curl and tricep extension — but **not** chest fly.
Total 23 sets per session.

---

## Appendix B — Body map SVG

The figure below is **already built and visually verified**. Use it verbatim; do not
re-author the anatomy. It is a stylised lifter drawn as a half-body that is mirrored,
so every muscle shape is written once and appears on both sides.

### B.1 Composition

- Coordinate space: each body occupies `200 × 420` units with the centre line at `x = 100`.
- The front body sits at `x 0–200`, the back body at `x 200–400`.
- Render each body as: **head/neck** (drawn once, centred) → **half-body group** →
  **the same half-body group mirrored** with `transform="translate(200,0) scale(-1,1)"`.
- Emit the mirrored half as a real duplicated group of elements, **not** `<use>`.
  `<use>` clones live in a shadow tree, so they cannot be hit-tested or styled
  individually, and per-muscle tap targets are a requirement (§4.6).
- Recommended viewBox with view labels: `26 14 348 398`. Without labels: `26 14 348 382`.

```jsx
const side = (half, dx, spineLine) => (
  <g transform={`translate(${dx},0)`}>
    {HEAD}
    <g>{half}</g>
    <g transform="translate(200,0) scale(-1,1)">{half}</g>
    <path className="mline" d={spineLine} />
  </g>
);
// front: side(FRONT_HALF, 0,   'M100,139 L100,192')
// back:  side(BACK_HALF,  200, 'M100,123 L100,193')
```

### B.2 Styling contract

Muscle colour is driven by `currentColor` so a single `style.color` assignment
recolours a shape, whether it is a filled region or a stroked limb.

```css
.base   { fill: var(--mbase); }                                    /* silhouette      */
.limb   { stroke: var(--mbase); fill: none; stroke-linecap: round; } /* limb underlay  */
.mf     { fill: currentColor; stroke: var(--mstroke);
          stroke-width: 1.6; stroke-linejoin: round; }              /* filled muscle   */
.ms     { stroke: currentColor; fill: none; stroke-linecap: round; } /* stroked muscle */
.mline  { stroke: var(--mstroke); stroke-width: 1.6; fill: none;
          opacity: .75; stroke-linecap: round; }                    /* ab / spine detail */

[data-m]       { color: var(--t0); transition: color .5s ease; }
[data-m].glow3 { filter: drop-shadow(0 0 4px currentColor); }       /* tier 3 */
[data-m].glow4 { filter: drop-shadow(0 0 7px currentColor); }       /* tier 4 */
```

Painting:

```ts
for (const el of svgRoot.querySelectorAll<SVGElement>('[data-m]')) {
  const s = scores.muscles[el.dataset.m as MuscleId];
  el.style.color = TIER_COLOUR[s.tier];
  el.classList.toggle('glow3', s.tier === 3);
  el.classList.toggle('glow4', s.tier === 4);
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label',
    `${muscleName(el.dataset.m)}, ${TIER_NAME[s.tier]}, ` +
    `${s.effectiveSets.toFixed(1)} of ${s.target} sets`);
}
```

Each of the 17 muscles appears twice per body (left and right), so
`querySelectorAll('[data-m]')` returns **40 nodes** across both views. That is expected:
front carries 11 muscle shapes per half, back carries 9.

### B.3 Head and neck (drawn once per body, not mirrored)

```svg
<path class="base" d="M93,58 L107,58 L106,76 L94,76 Z"/><ellipse class="base" cx="100" cy="41" rx="16" ry="20"/>
```

### B.4 Front half-body

```svg
<path class="base" d="M100,70 C91,70 83,75 77,84 C72,92 67,98 63,106 C62,117 63,125 65,133 C70,149 75,159 77,172 C75,185 71,191 70,201 C75,211 87,215 100,215 Z"/>
<path class="limb" stroke-width="23" d="M56,114 L48,172"/>
<path class="limb" stroke-width="19" d="M47,177 L41,231"/>
<path class="limb" stroke-width="16" d="M41,234 L39,250"/>
<path class="base" d="M98,209 C77,209 67,221 65,243 C64,264 67,281 70,295 L91,295 C93,271 95,244 98,223 Z"/>
<path class="base" d="M70,299 C65,315 66,338 71,354 L72,372 L82,372 C83,350 85,325 88,301 Z"/>
<path class="base" d="M72,372 C64,375 58,381 58,388 L83,388 L83,372 Z"/>
<path class="mf" data-m="traps"       d="M100,70 C91,71 83,77 77,88 L82,98 C87,88 93,83 100,83 Z"/>
<path class="mf" data-m="delts_side"  d="M80,85 C64,89 53,100 50,114 C49,125 53,134 59,137 C66,134 68,121 69,107 C70,97 75,89 80,85 Z"/>
<path class="mf" data-m="delts_front" d="M86,87 C76,87 70,93 68,103 C66,113 68,123 72,128 C80,127 84,119 85,107 C86,98 86,91 86,87 Z"/>
<path class="mf" data-m="chest"       d="M100,91 C92,89 86,91 83,97 C79,106 79,120 83,130 C90,135 96,134 100,129 Z"/>
<path class="mf" data-m="abs"         d="M99,136 L85,139 C83,153 83,174 86,192 L99,196 Z"/>
<path class="mf" data-m="obliques"    d="M84,141 C77,150 74,164 77,180 C79,189 84,194 86,192 C82,174 82,153 84,141 Z"/>
<path class="ms" data-m="biceps"      stroke-width="18" d="M54,122 L47,166"/>
<path class="ms" data-m="forearms"    stroke-width="14" d="M46,187 L42,223"/>
<path class="mf" data-m="quads"       d="M95,223 C81,223 73,233 71,251 C69,269 71,282 73,291 L88,291 C90,268 92,243 95,223 Z"/>
<path class="mf" data-m="calves"      d="M87,300 C78,303 72,315 72,333 C72,346 74,354 76,362 L82,362 C83,339 85,318 87,300 Z"/>
<path class="mline" d="M87,153 L99,155 M86,169 L99,171 M86,184 L99,186"/>
```

### B.5 Back half-body

```svg
<path class="base" d="M100,70 C91,70 83,75 77,84 C72,92 67,98 63,106 C62,117 63,125 65,133 C70,149 75,159 77,172 C75,185 71,191 70,201 C75,211 87,215 100,215 Z"/>
<path class="limb" stroke-width="23" d="M56,114 L48,172"/>
<path class="limb" stroke-width="19" d="M47,177 L41,231"/>
<path class="limb" stroke-width="16" d="M41,234 L39,250"/>
<path class="base" d="M98,209 C77,209 67,221 65,243 C64,264 67,281 70,295 L91,295 C93,271 95,244 98,223 Z"/>
<path class="base" d="M70,299 C65,315 66,338 71,354 L72,372 L82,372 C83,350 85,325 88,301 Z"/>
<path class="base" d="M72,372 C64,375 58,381 58,388 L83,388 L83,372 Z"/>
<path class="mf" data-m="traps"      d="M99,72 C90,73 83,79 78,90 C83,99 88,108 91,118 L99,121 Z"/>
<path class="mf" data-m="delts_rear" d="M81,85 C65,89 53,100 50,115 C49,126 53,136 60,139 C70,140 75,130 76,115 C77,100 79,90 81,85 Z"/>
<path class="mf" data-m="lats"       d="M76,106 C70,113 67,123 67,135 C67,151 72,167 80,181 L95,177 C96,159 93,139 87,123 C84,114 80,107 76,106 Z"/>
<path class="mf" data-m="upper_back" d="M99,123 L93,120 C89,130 88,142 90,152 L99,155 Z"/>
<path class="mf" data-m="lower_back" d="M99,158 L91,155 C89,167 90,180 93,191 L99,194 Z"/>
<path class="mf" data-m="glutes"     d="M99,196 L84,195 C75,197 70,205 70,215 C70,228 79,236 92,236 L99,234 Z"/>
<path class="ms" data-m="triceps"    stroke-width="18" d="M55,120 L48,167"/>
<path class="ms" data-m="forearms"   stroke-width="14" d="M46,187 L42,223"/>
<path class="mf" data-m="hamstrings" d="M95,241 C83,241 75,250 73,264 C71,277 72,284 73,291 L88,291 C90,273 93,254 95,241 Z"/>
<path class="mf" data-m="calves"     d="M88,296 C77,299 70,311 70,329 C70,343 73,353 75,362 L83,362 C84,338 86,316 88,296 Z"/>
```

### B.6 Notes

- Muscles rendered as `.ms` strokes (biceps, triceps, forearms) sit on top of a wider
  `.limb` underlay, which is what produces the visible outline around them. Keep the
  underlay wider than the muscle stroke or the limbs lose their silhouette.
- Untrained muscles resolve to `--t0`, which equals `--mbase`. They read as empty
  outlines waiting to be filled, which is the intended effect: on a fresh account the
  quads, glutes and abs are visible as unfilled shapes.
- The `.mline` paths are the ab segment lines and the spine. They are decoration and
  carry no `data-m`.
- The front view's `calves` shape represents the whole shin so calf work lights up on
  both views. It is not anatomically the tibialis.
