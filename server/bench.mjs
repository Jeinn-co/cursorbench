import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const PAGE = "https://cursor.com/cursorbench"
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "bench-cache.json")
const EFFORTS = ["Extra High", "Minimal", "Medium", "High", "Low", "Max"]

function decode(value) {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function splitLabel(label) {
  for (const effort of EFFORTS) {
    const suffix = ` ${effort}`
    if (label.endsWith(suffix)) return { model: label.slice(0, -suffix.length), effort }
  }
  return { model: label, effort: null }
}

const KEEP = new Set(["Opus 5.5", "Grok 4.7", "Muse Spark 1.3", "Gemini 3.8 Flash"])
const GPT_LINES = ["Astra", "Sol", "Terra"]

function providerOf(model) {
  if (/^(Opus|Fable) /.test(model)) return "claude"
  if (/^GPT-(?:6|5\.6) (Astra|Sol|Terra)$/.test(model)) return "codex"
  if (model.startsWith("Grok ")) return "grok"
  if (model.startsWith("Muse ")) return "muse"
  if (model.startsWith("Gemini ")) return "gemini"
  return null
}

export function selectRows(rows) {
  const present = new Set(rows.map((row) => row.model))
  const gpt = new Set(
    GPT_LINES.map((line) => {
      if (present.has(`GPT-6 ${line}`)) return `GPT-6 ${line}`
      if (present.has(`GPT-5.6 ${line}`)) return `GPT-5.6 ${line}`
      return null
    }).filter(Boolean),
  )
  return rows.filter((row) => KEEP.has(row.model) || gpt.has(row.model))
}

export function rowsFromHtml(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/)
  if (!table) return []
  const rows = []
  for (const tr of [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].slice(1)) {
    const cells = [...tr[0].matchAll(/>([^<]+)</g)]
      .map((match) => decode(match[1]).trim())
      .filter(Boolean)
    if (cells.length < 8) continue
    const rank = Number(cells[0])
    const score = Number(cells[2])
    const cost = Number(cells[5])
    if (![rank, score, cost].every(Number.isFinite)) continue
    const { model, effort } = splitLabel(cells[1])
    const provider = providerOf(model)
    if (!provider) continue
    rows.push({ rank, label: cells[1], model, effort, score, cost, provider })
  }
  return rows
}

async function readCache() {
  try {
    const data = JSON.parse(await readFile(CACHE, "utf8"))
    if (!data?.fetchedAt || !Array.isArray(data.rows)) return null
    return data
  } catch {
    return null
  }
}

function tableHash(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/)
  if (!table) return ""
  const text = [...table[0].matchAll(/>([^<]+)</g)]
    .map((match) => decode(match[1]).trim())
    .filter(Boolean)
    .join("\n")
  return createHash("sha256").update(text).digest("hex")
}

export async function loadBench() {
  const cached = await readCache()
  try {
    const response = await fetch(PAGE, { headers: { "user-agent": "cursorbench-local" } })
    if (!response.ok) throw new Error(String(response.status))
    const html = await response.text()
    const hash = tableHash(html)
    if (cached?.tableHash === hash && Array.isArray(cached.shown)) {
      return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, rows: cached.shown }
    }
    const rows = rowsFromHtml(html)
    if (rows.length === 0) throw new Error("empty")
    const shown = selectRows(rows)
    const payload = {
      fetchedAt: new Date().toISOString(),
      source: PAGE,
      tableHash: hash,
      rows,
      shown,
    }
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, JSON.stringify(payload))
    return { changed: true, fetchedAt: payload.fetchedAt, source: PAGE, rows: shown }
  } catch (error) {
    if (cached?.shown) return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, rows: cached.shown }
    if (cached?.rows) return { changed: false, fetchedAt: cached.fetchedAt, source: PAGE, rows: selectRows(cached.rows) }
    throw error
  }
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}

export function benchPlugin() {
  const handle = (req, res, next) => {
    const url = req.url ?? ""
    if (!url.startsWith("/api/bench")) return next()
    loadBench().then(
      (payload) => send(res, 200, payload),
      (error) => send(res, 502, { error: error instanceof Error ? error.message : "fetch failed" }),
    )
  }
  return {
    name: "bench-source",
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}
