# cursorbench

CursorBench 4.0. Pinned to Opus 5.5, Grok 4.7, Muse Spark 1.3, and Gemini 3.8 Flash. GPT uses 5.6 Sol and Terra; when the page lists GPT-6 Astra, Sol, or Terra, each replaces its same-named 5.6 entry.

```bash
npm install
npm run dev
```

`npm run dev` reads https://cursor.com/cursorbench on every load. If the table matches `data/bench-cache.json`, the cache is reused without recomputation. It is only updated on mismatch. CursorBench has no public GitHub data file.
