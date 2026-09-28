# cursorbench

A small local viewer for the [CursorBench](https://cursor.com/cursorbench) leaderboard. It plots **score vs. cost per task** for the models behind five coding CLIs, so you can see at a glance which model and effort level gives the most score per dollar.

| CLI         | Models shown                                   |
| ----------- | ---------------------------------------------- |
| Claude Code | Opus 5.5                                       |
| Codex       | GPT-5.6 Sol, GPT-5.6 Terra (see below)         |
| Grok        | Grok 4.7                                       |
| Muse        | Muse Spark 1.3                                 |
| Gemini      | Gemini 3.8 Flash                               |

Every effort level listed on CursorBench (Minimal → Max) appears as its own point, and each model's points are connected into one line.

**GPT upgrade rule:** Codex starts with GPT-5.6 Sol and Terra. When the leaderboard lists GPT-6 Astra, Sol, or Terra, each one replaces its same-named 5.6 entry automatically. No code change is needed.

## Quick start

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

## Using the chart

- **Legend chips:** click to show or hide a CLI. The number is how many points it has.
- **Hover** a point to highlight its label, score, and cost.
- **Click** a point to pin it. Click again to unpin.

## How the data works

CursorBench has no public API or data file, so the dev server scrapes the leaderboard page itself.

1. The browser calls `/api/bench`, served by a Vite plugin in [server/bench.mjs](server/bench.mjs).
2. The plugin fetches https://cursor.com/cursorbench (English page) and parses the leaderboard table.
3. It hashes the table text and compares it to `data/bench-cache.json`.
   - **Same hash:** the cached rows are returned as-is, with no re-parsing.
   - **Different hash:** rows are re-parsed, filtered to the models above, and the cache is rewritten.
4. If cursor.com is unreachable, the last cached rows are served instead.

`data/` is git-ignored, so the cache is created on your first run.

## Scripts

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Start the dev server with live data            |
| `npm run build`   | Type-check and build to `dist/`                |
| `npm run preview` | Serve the build, with `/api/bench` still live  |
| `npm run lint`    | Run ESLint                                     |

`/api/bench` only exists inside the Vite dev and preview servers. Hosting `dist/` as plain static files will not load any data.

## Project layout

```
server/bench.mjs   Scraper, model filter, cache, and the /api/bench Vite plugin
src/App.tsx        Page layout, legend chips, data loading
src/Chart.tsx      SVG scatter/line chart (score vs. cost)
src/bench.ts       Shared types, provider colors, formatting helpers
```

## Changing which models are shown

Edit `KEEP` and `GPT_LINES` in [server/bench.mjs](server/bench.mjs), then delete `data/bench-cache.json` so the next load rebuilds the cache.
