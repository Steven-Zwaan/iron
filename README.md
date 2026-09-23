# Iron — personal gym assistant

A private, offline-first training log for one person who trains to failure and wants to
*see* whether their body is covered. Built from [gym-assistant-design.md](gym-assistant-design.md).

- **PWA today**: React 19 + TypeScript + Vite 8, installable, works with the network off.
- **Swift tomorrow**: the app is split so a SwiftUI port reuses the data files and re-implements a
  small, pure domain layer. See [docs/PORTING-SWIFT.md](docs/PORTING-SWIFT.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 51 domain tests (scoring sanity check, warm-ups, debt, ticks, sessions, backup)
npm run build      # typecheck + production bundle in dist/ (about 165 KB gzipped + fonts)
npm run preview    # serve dist/ locally to test the service worker
```

First launch opens a three-step setup (units and increments, gym inventory, starting plan).
Everything is skippable; the defaults are a typical commercial gym and the Monday/Thursday split from the spec.

## Layout

```
shared/data/            Platform-neutral JSON used by the PWA and the future Swift app
  muscles.json            17 muscles, categories, weekly targets
  catalogue.json          98 seeded exercises with muscle maps and aliases
  plan-seed.json          the user's Monday/Thursday split
  plan-templates.json     Upper/Lower, Push/Pull/Legs, Full body x3
  gym-defaults.json       increments, dumbbell rack, plates for kg and lb
  bodymap.json            body map geometry traced from design/reference/body-front.png and body-back.png (absolute M/L/C/Z only)
design/reference/       Your two reference figures; run `node scripts/trace-bodymap.mjs` after changing them
scripts/trace-bodymap.mjs  Colour-quantise + trace both figures into bodymap.json (also writes design/bodymap-preview.svg)
src/domain/             Pure TypeScript, no framework imports — the part that gets ported
  types.ts                every persisted object (1:1 with Codable structs)
  scoring.ts              effective sets, 0–100 score, tiers, body score
  warmups.ts              "one light warm-up per new muscle group" + set-scheme labels
  weights.ts              tick generation, snapping, drop step, formatting
  alternatives.ts         cosine-similarity swap ranking (no AI)
  debt.ts                 skip debt rules
  plan.ts                 due-day selection, templates
  session.ts              create / log / dropset chain / edit / swap / reorder / finalise
  backup.ts               export / import with merge or replace
src/app/                React glue: Zustand store, Dexie persistence, hash router, platform shims
src/ui/                 Body map, weight scrubber, set stack, rest timer, pickers, sheets
src/screens/            Today, Builder, Runner, Plan, Progress, Coach, Onboarding, Settings…
src/sw.ts               Service worker: precache the shell, rest notification, update prompt
api/coach.ts            Optional AI proxy (Vercel Function). The API key never reaches the client.
tests/                  Vitest suite for the domain layer
```

## Deploying

Any static host works for the app itself (HTTPS is required for the service worker).
`vercel.json` is included; on Vercel the `api/coach.ts` function is deployed alongside `dist/`.

Environment variables for the coach proxy (all optional except the key when you enable the coach):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for the coach. Set a monthly spend cap in the Anthropic console. |
| `COACH_SECRET` | Optional bearer token. Enter the same value under Settings → Coach → Access token. |
| `COACH_MODEL_STRONG` | Model for briefs, chat and plan building. Default `claude-opus-5`. |
| `COACH_MODEL_FAST` | Model for cues, alternatives, muscle maps and log parsing. Default `claude-haiku-4-5`. |

The coach is off by default. Everything except the Coach tab works fully offline (§13 N2).

## Where the implementation deviates from the spec, and why

- **26 sets per seeded day, not 23.** The spec's arithmetic slip: 7 warm-ups + 2 dropsets + 17 work sets = 26.
  The spec's own scoring sanity check (side delts 91, biceps 70, overall 34) only reproduces with 26, and the test suite pins those numbers.
- **`✓ Finish set` commits the current weight as the final segment**, matching the worked example
  (`60×5 → 48×6 → 40×4`). A planned dropset therefore takes one tap fewer than the budget table's four.
- **Hash routes.** Tabs and modals live in the URL hash so the Android back gesture works without server rewrites.
  PWA shortcuts use `/?action=start` and `/?tab=progress`.
- **Background rest notification is best effort on the web.** The countdown itself is always correct
  (absolute `endsAt`); the notification fires via the service worker when the tab is hidden and permission was granted.
  The Swift port replaces this with a Live Activity, which is the one feature that needs native code.
- **Refusal fallbacks** are enabled on the Opus 5 calls in the proxy (`fallbacks: 'default'`), as recommended for that model.
- **`hip_adduction`** deliberately has no 1.0 primary (it is an accessory movement); every other catalogue entry does.
