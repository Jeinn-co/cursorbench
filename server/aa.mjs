import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { providerOf, shownModels } from "./bench.mjs"

const BASE = "https://artificialanalysis.ai/models/releases"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "aa-cache.json")
// AA pages are large and slow; reuse a fetch for this long before asking again.
const TTL_MS = 6 * 60 * 60 * 1000
const EFFORT_BY_LEVEL = { 10: "Minimal", 20: "Low", 30: "Medium", 40: "High", 50: "Extra High", 60: "Max" }

async function page(url) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "cursorbench-local" },
        signal: AbortSignal.timeout(40_000),
      })
      if (!response.ok) throw new Error(`${url}: ${response.status}`)
      // The data sits in an escaped JSON payload inside the HTML.
      return (await response.text()).replaceAll('\\"', '"').replaceAll("\\\\", "\\")
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

// End index (exclusive) of the JSON object that opens at `start`, or -1.
function objectEnd(text, start) {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return i + 1
  }
  return -1
}

// Every JSON object whose text starts with `prefix` (a RegExp source).
function objects(text, prefix) {
  const out = []
  for (const match of text.matchAll(new RegExp(prefix, "g"))) {
    const end = objectEnd(text, match.index)
    if (end === -1) continue
    try {
      out.push(JSON.parse(text.slice(match.index, end)))
    } catch {
      // A malformed fragment is skipped rather than guessed at.
    }
  }
  return out
}

// AA names Claude models "Claude Opus 5.5"; the chart uses CursorBench's "Opus 5.5".
const displayName = (name) => name.replace(/^Claude /, "")

// Releases to show, as [{ slug, model }], picked from AA's full release list.
export function pickReleases(html) {
  const releases = new Map()
  for (const release of objects(html, '\\{"slug":"[a-z0-9-]+","name":"[^"]+","releaseDate"')) {
    if (release.intelligenceIndex == null || releases.has(release.slug)) continue
    releases.set(release.slug, { slug: release.slug, model: displayName(release.name) })
  }
  const shown = shownModels([...releases.values()].map((release) => release.model))
  return [...releases.values()].filter((release) => shown.has(release.model) && providerOf(release.model))
}

// One row per effort of a release, from its own variant objects only. A variant
// without an index score or a cost per task is left out, never filled from a neighbour.
export function releaseRows(html, release) {
  const rows = new Map()
  for (const variant of objects(html, '\\{"id":"[0-9a-f-]+","slug":"')) {
    if (variant.release?.slug !== release.slug || rows.has(variant.slug)) continue
    const effort = EFFORT_BY_LEVEL[variant.effort?.level]
    const score = variant.intelligenceIndex
    const cost = variant.intelligenceIndexCostPerTask?.cost?.total
    if (!effort || score == null || !(cost > 0)) continue
    rows.set(variant.slug, {
      rank: 0,
      label: `${release.model} ${effort}`,
      model: release.model,
      effort,
      score,
      cost,
      provider: providerOf(release.model),
    })
  }
  return [...rows.values()]
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    return data?.fetchedAt && data.releases ? data : null
  } catch {
    return null
  }
}

function payload(data, changed) {
  const rows = Object.values(data.releases).flat()
  rows.sort((a, b) => b.score - a.score)
  rows.forEach((row, index) => (row.rank = index + 1))
  return { changed, fetchedAt: data.fetchedAt, source: BASE, rows }
}

export async function loadAa() {
  const cached = await readCache()
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return payload(cached, false)
  try {
    const picked = pickReleases(await page(BASE))
    if (picked.length === 0) throw new Error("no releases")
    const releases = {}
    for (const release of picked) {
      try {
        releases[release.slug] = releaseRows(await page(`${BASE}/${release.slug}`), release)
      } catch (error) {
        // Keep the last good rows for a release whose page failed this time.
        if (!cached?.releases?.[release.slug]) throw error
        releases[release.slug] = cached.releases[release.slug]
      }
    }
    const data = { fetchedAt: new Date().toISOString(), releases }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(data))
    return payload(data, true)
  } catch (error) {
    if (cached) return payload(cached, false)
    throw error
  }
}
