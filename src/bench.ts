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

export const SOURCE_URL = "https://cursor.com/cursorbench"

export const APP_VERSION = "1.1.0"

export function providerById(id: ProviderId) {
  const found = PROVIDERS.find((item) => item.id === id)
  if (!found) throw new Error(id)
  return found
}

export function seriesColor(model: string, provider: ProviderId) {
  if (model.startsWith("Opus")) return "#0ea5e9"
  if (model.startsWith("Sonnet")) return "#c4552a"
  if (model.startsWith("Fable")) return "#9a3412"
  if (model.includes("Sol")) return "#059669"
  if (model.includes("Terra")) return "#d97706"
  if (model.includes("Astra")) return "#0f766e"
  if (model.includes("Luna")) return "#65a30d"
  return providerById(provider).color
}

export function formatScore(score: number) {
  return `${score.toFixed(1)}%`
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
