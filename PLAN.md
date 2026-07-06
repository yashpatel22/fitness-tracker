# Fitness Tracker — Standalone Web App · Project Plan

**This is a separate project from `../code-app`** (the Power Apps / Dataverse version). The two share React UI code but are built, hosted, and stored completely independently. Keep changes to each project scoped to its own folder.

## Goal

Host the Fitness Tracker as a public static website (GitHub Pages, `yashpatel22` account) with:
- No Dataverse, no Microsoft 365, no authentication.
- All exercise/workout data stored locally on the device (persistent).
- Installable to iPhone home screen as a PWA.

## Architecture decision

The app already funnels **all** data access through one thin layer (`src/lib/dataverse.ts`, exposing `list / getOne / create / update / remove`). So the port is a **single-file backend swap** — every screen and `fitness.ts` are unchanged.

- **Storage:** IndexedDB via `localForage` (async — matches the app's already-Promise-based data layer; large capacity; stores objects directly).
- **Preset content:** exported from Dataverse once into `src/data/seed.json`; loaded into IndexedDB on first run.
- **Routing:** `HashRouter` (already used) → works on any static host with no rewrite rules.
- **Base path:** Vite `base: './'` (relative) → works under any GitHub Pages sub-path without hard-coding the repo name.

## Task list (all complete)

- [x] **scaffold** — copy `code-app/src` → `web-app/`, new `package.json` (drop `@microsoft/power-apps`, add `localforage`), new `vite.config.ts`, `tsconfig`.
- [x] **seed** — export active plan + 8 split days + 55 planned exercises from Dataverse → `src/data/seed.json`.
- [x] **localdb** — rewrite `src/lib/dataverse.ts` as an IndexedDB adapter (OData-lite `eq` filter, `orderby`, `top`, `@odata.bind` → `_x_value` on create, seed-on-first-run, `navigator.storage.persist()`), plus `exportAll` / `importAll`.
- [x] **depower** — strip Power SDK from `main.tsx` and `appContext.tsx` (getContext → local display-name); delete `src/generated`.
- [x] **backup UI** — Profile: name field + Export/Import backup card.
- [x] **build + verify** — `npm run build`, `vite preview`, Playwright: seeded presets render, workout logs, PR derives, **data persists across reload**, export produces valid JSON.
- [x] **pages** — `.github/workflows/deploy.yml`, `public/.nojekyll`, `public/manifest.webmanifest`, PWA `<meta>`, README with deploy steps.

## How the local adapter maps Dataverse concepts

| Dataverse | Local adapter |
|---|---|
| Entity set (e.g. `fit_workoutsessions`) | a keyed array in IndexedDB |
| `$filter=field eq value` | `parseFilter` predicate (bool/number/string/guid) |
| `$orderby=field asc\|desc` | `applyOrder` |
| `X@odata.bind: "/set(<id>)"` (create) | `_X_value: "<id>"` |
| GUID primary keys | `crypto.randomUUID()` (Dataverse GUIDs kept for seeded rows) |

## Things intentionally NOT carried over

- The user's personal Dataverse workout history/sessions/logs/PRs — the public app starts fresh; only preset **content** is seeded.
- The Power Apps SDK, generated services, `power.config.json`, `.power/` schemas.

## Deploy

See `README.md`. Push this folder to `github.com/yashpatel22/<repo>`, enable Pages → Source: GitHub Actions. Live at `https://yashpatel22.github.io/<repo>/`.

## Known limitations / future

- Data is per-browser/device. Backup via Profile → Export/Import. iOS eviction mitigated by home-screen install + `storage.persist()`.
- Initial JS bundle is ~4.9 MB because exercise images are base64-embedded (cached after first load). Could later serve images as separate files to shrink first load.
- No PWA icon yet (iOS uses a snapshot). Could add `apple-touch-icon` + manifest icons.
- Optional future: repoint `dataverse.ts` at a $0 cloud backend for cross-device sync (no other code changes needed).
