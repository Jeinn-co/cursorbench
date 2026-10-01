export type ProviderId = "claude" | "codex" | "grok" | "muse" | "gemini"

export type Row = {
  rank: number
  label: string
  model: string
  effort: string | null
  score: number
  cost: number
  provider: ProviderId
}

export const PROVIDERS: readonly {
  id: ProviderId
  name: string
  color: string
}[] = [
  { id: "claude", name: "Claude Code", color: "#c4552a" },
  { id: "codex", name: "Codex", color: "#0c8f72" },
  { id: "grok", name: "Grok", color: "#1a1a1a" },
  { id: "muse", name: "Muse", color: "#5b4db7" },
  { id: "gemini", name: "Gemini", color: "#1a73c7" },
]

export type SourceId = "cursorbench" | "aa"

export const SOURCES: Record<
  SourceId,
  { id: SourceId; name: string; eyebrow: string; url: string; unit: string; scoreName: string }
> = {
  cursorbench: {
    id: "cursorbench",
    name: "CursorBench",
    eyebrow: "CursorBench 4.0",
    url: "https://cursor.com/cursorbench",
    unit: "%",
    scoreName: "CursorBench 4.0 score",
  },
  aa: {
    id: "aa",
    name: "Artificial Analysis",
    eyebrow: "AA Intelligence Index",
    url: "https://artificialanalysis.ai/models/releases",
    unit: "",
    scoreName: "Artificial Analysis Intelligence Index",
  },
}

export const APP_VERSION = "1.7.2"

export function providerById(id: ProviderId) {
  const found = PROVIDERS.find((item) => item.id === id)
  if (!found) throw new Error(id)
  return found
}

// A model's line and version: "GPT-6.1 Sol" -> Sol 6.1, "Opus 5.5" -> Opus 5.5,
// "Grok 4.20 0309 v2" -> Grok 4.2, "Gemini 3.5 Flash-Lite" -> Gemini Flash-Lite 3.5,
// "Muse Spark" -> Muse Spark 0. Versions compare as decimals, so Grok 4.20 (March)
// sits below Grok 4.7 (September); build dates and "v2" tags are not part of the line.
export function modelLine(model: string) {
  const gpt = model.match(/^GPT-(\d+(?:\.\d+)?) (\w+)$/)
  if (gpt) return { line: gpt[2], version: parseFloat(gpt[1]) }
  const tokens = model.split(/\s+/)
  const at = tokens.findIndex((token) => /^\d+(?:\.\d+)?$/.test(token))
  const version = at >= 0 ? parseFloat(tokens[at]) : 0
  const line = tokens.filter((token, i) => i !== at && !/^\d+$/.test(token) && !/^v\d+$/i.test(token)).join(" ")
  return { line, version }
}

// How many versions behind the newest of its line each older model is (Opus 5 is 1
// behind Opus 5.5, GPT-5.6 Sol is 2 behind GPT-6.1 Sol). Older ones get grey so the
// newest of every line stands out.
export function previousGenerations(models: readonly string[]) {
  const versions = new Map<string, Set<number>>()
  for (const model of models) {
    const { line, version } = modelLine(model)
    versions.set(line, (versions.get(line) ?? new Set()).add(version))
  }
  const behind = new Map<string, number>()
  for (const model of models) {
    const { line, version } = modelLine(model)
    const newer = [...(versions.get(line) ?? [])].filter((value) => value > version).length
    if (newer > 0) behind.set(model, newer)
  }
  return behind
}

export function seriesColor(model: string, provider: ProviderId, behind = 0) {
  if (behind === 1) return "#64748b"
  if (behind > 1) return "#a3afbd"
  if (model.startsWith("Opus")) return "#0ea5e9"
  if (model.startsWith("Sonnet")) return "#c4552a"
  if (model.startsWith("Fable")) return "#9a3412"
  if (model.includes("Argon")) return "#1e3a8a"
  if (model.includes("Flash-Lite")) return "#60a5fa"
  if (model.includes(" Pro")) return "#4338ca"
  if (model.startsWith("Grok Build")) return "#78716c"
  if (model.startsWith("Muse Glimmer")) return "#a855f7"
  if (model.includes("Sol")) return "#059669"
  if (model.includes("Terra")) return "#d97706"
  if (model.includes("Astra")) return "#0f766e"
  if (model.includes("Luna")) return "#65a30d"
  return providerById(provider).color
}

export function formatScore(score: number, unit = "%") {
  return `${score.toFixed(1)}${unit}`
}

export function formatCost(cost: number) {
  return `$${cost.toFixed(2)}`
}

export function formatCostTick(value: number) {
  if (value === 0) return "$0"
  const digits = value >= 10 ? 0 : value < 1 ? 2 : 1
  return `$${value.toFixed(digits).replace(/\.0$/, "")}`
}

export function niceCeil(value: number) {
  if (value <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  const scaled = value / pow
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const nice = steps.find((step) => step >= scaled - 1e-9) ?? 10
  return nice * pow
}

export function tickValues(min: number, max: number, count: number) {
  const span = max - min
  if (span <= 0) return [min]
  const raw = span / Math.max(1, count - 1)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const err = raw / pow
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * pow
  const start = Math.ceil((min - step * 1e-6) / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }
  return ticks
}
