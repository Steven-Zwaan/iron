# Porting Iron to SwiftUI

The PWA was built so that the native iOS version is a **re-implementation of the UI layer only**.
Three things carry over unchanged or almost unchanged:

1. **The data files** in `shared/data/*.json` — bundle them as resources and decode them with `Codable`.
2. **The persisted schema** (`src/domain/types.ts`) — one `Codable` struct per interface. A backup exported
   from the PWA (`Settings → Export JSON`, `schemaVersion: 1`) imports straight into the Swift app, and vice versa.
3. **The domain algorithms** in `src/domain/*.ts` — small, pure functions over value types, with a test suite
   (`tests/*.test.ts`) whose expectations you can port to XCTest one-to-one.

Nothing in `src/domain` imports React, Zustand or Dexie. Everything platform-specific sits behind `src/app/platform.ts`.

## Module map

| TypeScript (PWA) | Swift (native) | Notes |
|---|---|---|
| `domain/types.ts` | `Models/*.swift` — `struct Exercise: Codable`, `GymProfile`, `Plan`, `PlanDay`, `PlanItem`, `Session`, `ExerciseLog`, `SetLog`, `Segment`, `AppState`, `Settings`, `Backup` | Keep JSON key names identical (`snake_case` ids, `camelCase` fields). `MuscleId`, `Equipment`, `MeasureMode`, `SetType` become `String`-backed enums. Timestamps are epoch **milliseconds** (`Double`), dates are `"YYYY-MM-DD"` local strings. |
| `domain/muscles.ts` | `Muscles.swift` | Load `muscles.json`; `targetFor(id, overrides)`; category grouping. |
| `domain/exercises.ts` | `Catalogue.swift` | Load `catalogue.json`; `primaryMuscle` = argmax contribution; search over name + aliases (diacritic-insensitive, `folding:`). |
| `domain/scoring.ts` | `Scoring.swift` | `setValue`, `effectiveSets`, `score` (HEADROOM 1.15), `tier`, `overall`, `computeBodyScore`. Port the sanity test: the seeded Monday + Thursday in one week → overall **34**, side delts 91, biceps 70, chest 62. |
| `domain/warmups.ts` | `Warmups.swift` | `warmupFlags(queue)` and `setTypes(scheme, warmup)`. Never persisted. |
| `domain/weights.ts` | `Weights.swift` | `ticksFor`, `plateCombinations` (DP over 0.25 units), `snap`, `stepTick`, `dropWeight`, `formatWeight`. |
| `domain/alternatives.ts` | `Alternatives.swift` | Cosine similarity over the 17-vector; threshold 0.6 with fallback. |
| `domain/debt.ts` | `Debt.swift` | Applied once at finalisation, cap 3. |
| `domain/plan.ts` | `Planning.swift` | `dueDay`, templates, `move`. |
| `domain/session.ts` | `SessionEngine.swift` | All mutations are `func f(_ s: Session, ...) -> Session`. Keep them pure; the store applies and persists. |
| `domain/backup.ts` | `Backup.swift` | `makeBackup`, `parseBackup`, `applyBackup(mode: .merge/.replace)`. |
| `app/store.ts` | `@Observable final class AppModel` | Same action names. Persist with write-through after each mutation. |
| `app/db.ts` (Dexie / IndexedDB) | SwiftData **or** one JSON file per table in Application Support | The data is small (a year of training is well under 1 MB) and always fully loaded in memory, so plain `JSONEncoder` files with atomic writes are enough. SwiftData is fine if you want queries later. |
| `app/router.ts` | `TabView` + `NavigationStack` + `.fullScreenCover` (Builder, Runner) | Tabs: Today, Plan, Progress, Coach. Sheets → `.sheet` with detents. |
| `app/platform.ts` | see below | The only file that changes shape. |
| `ui/BodyMap.tsx` | `BodyMapView` (see below) | Same geometry file. |
| `ui/WeightScrubber.tsx` | `WeightScrubberView` | `DragGesture` with 16 pt per tick, `UISelectionFeedbackGenerator` per notch, double tick when crossing the "last" marker. |
| `ui/SetStack.tsx`, `ui/RestTimer.tsx`, pickers, sheets | SwiftUI views | Straightforward; React component props map to view inits. |
| `sw.ts` | — | Not needed natively. |
| `api/coach.ts` | unchanged | The Swift app calls the same proxy with the same JSON. |

## `platform.ts` → native

| Web | iOS |
|---|---|
| `requestWakeLock()` | `UIApplication.shared.isIdleTimerDisabled = true` while a session is active |
| `vibrate(pattern)` | `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator`; Core Haptics for the double tick |
| `chime()` (784 Hz then 1046 Hz) | `AVAudioEngine` tones, or a bundled short sound via `AVAudioPlayer`, respecting the silent switch |
| `rest.start(endsAt, exerciseName)` / `rest.stop()` | **ActivityKit Live Activity** — this is the feature that justifies native. |
| `downloadText` / `pickTextFile` | `fileExporter` / `fileImporter` with the same JSON |

### The Live Activity (rest timer in the Dynamic Island)

```swift
struct RestAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable { var endsAt: Date }
    var exerciseName: String
}
```

- Start it from the same place the PWA calls `rest.start(...)`: right after a set is logged.
- Compact leading: exercise name. Compact trailing: `Text(timerInterval: .now...endsAt, countsDown: true)`.
- Expanded: the ring + `+30` and `Skip` buttons as `AppIntent`s (iOS 17+) that update the activity and the model.
- End it on `rest.stop()` (skip, next set, pause, finish). Update `endsAt` on `+30` / `−15`.
- Because the countdown is `Text(timerInterval:)`, the system renders it without the app running — which is exactly the
  web platform's weak spot (§6.6 Backgrounding).

## The body map

`shared/data/bodymap.json` is traced from the two reference figures in `design/reference/` (`body-front.png`,
`body-back.png`) by `scripts/trace-bodymap.mjs` (re-run it if a reference changes). Every region is an absolute SVG path using only
`M`, `L`, `C` and `Z` commands. That is deliberate: a ~60-line parser turns each `d` string into a SwiftUI `Path`
(`move(to:)`, `addLine(to:)`, `addCurve(to:control1:control2:)`, `closeSubpath()`).

Composition, exactly as in the JSON:

- `frame` is one body (200 × 392 units); `front` is drawn at the origin and `back` at `translate(frame.width + gap, 0)`;
- shapes are listed in paint order; `cls: "base"` is a silhouette part (head, hands, feet, tendons) filled with `mbase`,
  `cls: "mf"` is a muscle filled with its tier colour and carrying `m`, the muscle id. A muscle can appear several times
  (left/right, or several heads) — colour them all by the same score;
- `mf` shapes get a `mstroke` stroke of 0.9 so seams read as gaps in both themes; `base` shapes have no stroke;
- every `mf` shape is a tap target (`.onTapGesture`, `.accessibilityLabel("\(name), \(tier), \(eff) of \(target) sets")`);
- tiers 3 and 4 get `.shadow(color: tierColour, radius: 4 / 7)`; nothing else glows;
- animate colour changes with `.animation(.easeInOut(duration: 0.5).delay(Double(index) * 0.012))` — the 12 ms stagger by muscle index;
- both views are traced; the front figure's single shoulder cap is split at its centre into side and front delts,
  everything else maps one region to one muscle id (see `classifyFront` / `classifyBack` in the script);
- no colours are stored in the geometry: the references' colours only separated the regions while tracing.

Tier colours (dark / light) are in `src/styles.css` (`--t0…--t4`) and `src/domain/muscles.ts`.

## Interchange format

`Backup` (`schemaVersion: 1`):

```json
{ "app": "iron", "schemaVersion": 1, "exportedAt": 1758600000000,
  "exercises": [...], "gym": {...}, "plan": {...}, "sessions": [...], "state": {...} }
```

- `sessions[].date` is the local calendar day; `startedAt`/`endedAt` are epoch ms.
- `state.lastPerformance` is derived; recompute it from `sessions` after import (`derivePerformance`).
- Sessions are immutable once `endedAt` is set — the intended basis for a later last-writer-wins sync (§11.5).

## Suggested order

1. Models + JSON loading + the domain modules, with the ported tests green (the 34/100 sanity check first).
2. `AppModel` + persistence + import of a PWA backup — you now have your real data in the simulator.
3. Body map view, Today screen.
4. Builder and Runner (scrubber, set stack, dropset chain, rest timer with the Live Activity).
5. Plan, Progress, Settings, Coach (same proxy).

Everything in steps 1–2 is mechanical translation; the design work is in step 4, where the PWA already
settled the interaction model (one-tap logging, the drop chain, rep chips during rest).
