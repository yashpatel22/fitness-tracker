# Fitness Tracker — Standalone Web App

A self-contained, offline-first version of the Fitness Tracker. **No Dataverse, no Microsoft 365, no auth.** All data (workouts, sets, presets, personal records) is stored locally in the browser via **IndexedDB** (through `localForage`). It runs as a static site — perfect for GitHub Pages — and installs to the iPhone home screen as a PWA.

This is a sibling of the Power Apps Code App in `../code-app` and shares the same UI/React code. The **only** difference is the data layer: `src/lib/dataverse.ts` here is a local IndexedDB adapter instead of the Dataverse connector.

## What's different from the Code App

| | code-app (Power Apps) | web-app (this) |
|---|---|---|
| Backend | Dataverse connector | IndexedDB via localForage |
| Auth | Microsoft 365 | none |
| Preset content | lives in Dataverse | seeded from `src/data/seed.json` on first run |
| Hosting | Power Apps player | any static host (GitHub Pages) |
| Data scope | per user, cloud | per browser/device, local |

The preset library (Push/Pull/Legs/Upper/Chest/Back/Shoulders/Arms + exercises) is baked into `src/data/seed.json` and loaded into IndexedDB the first time the app runs. The exercise library with animations/instructions is already bundled in `src/data/exercises.bundled.json`, so the app is fully offline-capable.

## Run locally

```bash
npm install
npm run dev       # http://localhost:3000
# or test the production build:
npm run build
npm run preview   # http://localhost:4173
```

## Deploy to GitHub Pages (account: yashpatel22)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys automatically on every push to `main`.

1. **Create a repo** on the `yashpatel22` account, e.g. `fitness-tracker`.
2. **Push this folder** as the repo root:
   ```bash
   cd "web-app"
   git init
   git add .
   git commit -m "Fitness Tracker standalone web app"
   git branch -M main
   git remote add origin https://github.com/yashpatel22/fitness-tracker.git
   git push -u origin main
   ```
3. In the repo on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. The workflow runs on push; when it finishes, your app is live at:
   **`https://yashpatel22.github.io/fitness-tracker/`**

The Vite `base` is set to `./` (relative), so it works under any repo sub-path with no extra config. Routing uses `HashRouter`, so no `404.html` / rewrite rules are needed.

## Install on iPhone (PWA)

Open the Pages URL in Safari → Share → **Add to Home Screen**. It launches full-screen like a native app. Installed PWAs also get more durable local storage (see below).

## About data persistence

Data is stored **on the device, in this browser only**. It survives closing the app and reboots. It can be lost if you:
- clear the browser's site data,
- use Private/Incognito mode,
- (iOS Safari) don't open the site for ~7 days *and* it isn't added to the home screen.

The app calls `navigator.storage.persist()` to request durable storage, which — combined with installing it to the home screen — makes eviction unlikely.

**Backups:** Profile → **Backup & data** → *Export backup* downloads a JSON of everything. *Import backup* restores it (also how you move data to another device). Do this periodically if the data matters to you.

If you later want true cross-device sync without adding auth, the same `src/lib/dataverse.ts` interface can be repointed at a `$0` managed backend (Supabase / Firebase / Cloudflare KV) with no changes to the rest of the app.

## Project structure

```
web-app/
├─ .github/workflows/deploy.yml   # GitHub Pages CI/CD
├─ public/
│  ├─ .nojekyll                   # let Pages serve all files
│  └─ manifest.webmanifest        # PWA manifest
├─ src/
│  ├─ lib/dataverse.ts            # ← LOCAL IndexedDB adapter (the swap)
│  ├─ lib/fitness.ts              # data layer (unchanged from code-app)
│  ├─ data/seed.json              # preset content seeded on first run
│  ├─ data/exercises.bundled.json # exercise library + images (offline)
│  ├─ pages/ …                    # screens (shared with code-app)
│  └─ …
├─ index.html                     # PWA meta + manifest
├─ vite.config.ts                 # base: './'
└─ package.json
```
