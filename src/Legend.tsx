import { useEffect, useRef, useState } from "react"
import { PROVIDERS, modelLine, seriesColor, type ProviderId, type Row } from "./bench"

type Props = {
  rows: Row[]
  previous: ReadonlyMap<string, number>
  hiddenProviders: ReadonlySet<ProviderId>
  hiddenModels: ReadonlySet<string>
  onToggleProvider: (id: ProviderId) => void
  onSetModels: (models: readonly string[], visible: boolean) => void
}

// Menu order, newest generation first so older ones sink to the bottom; it does not
// reshuffle when scores move. Line order breaks ties: Fable, Opus, Sonnet; GPT Astra, Sol,
// Terra, Luna; Grok, Grok Build; Muse Spark, Glimmer; Gemini Argon, Flash, Flash-Lite, Pro.
const LINE_ORDER = [
  "Fable", "Opus", "Sonnet",
  "Astra", "Sol", "Terra", "Luna",
  "Grok", "Grok Build",
  "Muse Spark", "Muse Glimmer",
  "Gemini Argon", "Gemini Flash", "Gemini Flash-Lite", "Gemini Pro Preview",
]

const rank = (line: string) => (LINE_ORDER.includes(line) ? LINE_ORDER.indexOf(line) : LINE_ORDER.length)

// Gemini numbers every line on one shared track, so the higher number is the newer
// generation (both Gemini 3.1 models sit at the bottom). Claude and GPT lines each step on
// their own, so a generation is the major version, then how many versions a model trails
// the newest of its line: Fable 5.1, Opus 5.5, Sonnet 5.5, then Fable 5, Opus 5, Sonnet 5,
// then Opus 4.8, Sonnet 4.6.
function compareModels(a: string, b: string, provider: ProviderId, behind: ReadonlyMap<string, number>) {
  const x = modelLine(a)
  const y = modelLine(b)
  if (provider === "gemini") return y.version - x.version || rank(x.line) - rank(y.line) || b.localeCompare(a)
  return (
    Math.floor(y.version) - Math.floor(x.version) ||
    (behind.get(a) ?? 0) - (behind.get(b) ?? 0) ||
    rank(x.line) - rank(y.line) ||
    x.line.localeCompare(y.line) ||
    y.version - x.version ||
    b.localeCompare(a)
  )
}

// Models of one provider in menu order, with how many points each has.
function modelsOf(rows: Row[], provider: ProviderId, behind: ReadonlyMap<string, number>) {
  const byModel = new Map<string, { model: string; points: number }>()
  for (const row of rows) {
    if (row.provider !== provider) continue
    const entry = byModel.get(row.model) ?? { model: row.model, points: 0 }
    entry.points++
    byModel.set(row.model, entry)
  }
  return [...byModel.values()].sort((a, b) => compareModels(a.model, b.model, provider, behind))
}

export default function Legend({ rows, previous, hiddenProviders, hiddenModels, onToggleProvider, onSetModels }: Props) {
  const [open, setOpen] = useState<ProviderId | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="legend" role="group" aria-label="Visible providers" ref={ref}>
      {PROVIDERS.map((provider) => {
        const models = modelsOf(rows, provider.id, previous)
        if (models.length === 0) return null
        const total = models.reduce((sum, item) => sum + item.points, 0)
        const shown = models.filter((item) => !hiddenModels.has(item.model))
        const shownPoints = shown.reduce((sum, item) => sum + item.points, 0)
        const off = hiddenProviders.has(provider.id)
        const isOpen = open === provider.id
        return (
          <div key={provider.id} className={isOpen ? "chip-group open" : "chip-group"}>
            <button
              type="button"
              className={off ? "chip off" : "chip"}
              aria-pressed={!off}
              onClick={() => onToggleProvider(provider.id)}
            >
              <span className="swatch" style={{ background: provider.color }} />
              {provider.name}
              <span className="count">{shownPoints === total ? total : `${shownPoints}/${total}`}</span>
            </button>
            <button
              type="button"
              className="chip-caret"
              aria-label={`Choose ${provider.name} models`}
              aria-haspopup="true"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : provider.id)}
            >
              ▾
            </button>
            {isOpen ? (
              <div className="menu" role="group" aria-label={`${provider.name} models`}>
                <label className="menu-row menu-all">
                  <input
                    type="checkbox"
                    checked={shown.length === models.length}
                    ref={(input) => {
                      if (input) input.indeterminate = shown.length > 0 && shown.length < models.length
                    }}
                    onChange={(event) => onSetModels(models.map((item) => item.model), event.target.checked)}
                  />
                  All models
                </label>
                {models.map((item) => (
                  <label key={item.model} className="menu-row">
                    <input
                      type="checkbox"
                      checked={!hiddenModels.has(item.model)}
                      onChange={(event) => onSetModels([item.model], event.target.checked)}
                    />
                    <span
                      className="swatch"
                      style={{ background: seriesColor(item.model, provider.id, previous.get(item.model)) }}
                    />
                    <span className="menu-name">{item.model}</span>
                    <span className="count">{item.points}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
