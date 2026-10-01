import { useEffect, useMemo, useState } from "react"
import {
  APP_VERSION,
  PROVIDERS,
  SOURCES,
  type ProviderId,
  type Row,
  type SourceId,
} from "./bench"
import Chart from "./Chart"

function initialSource(): SourceId {
  return new URLSearchParams(window.location.search).get("source") === "aa" ? "aa" : "cursorbench"
}

export default function App() {
  const [source, setSource] = useState<SourceId>(initialSource)
  const [hidden, setHidden] = useState<ReadonlySet<ProviderId>>(() => new Set())
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setRows([])
    setError(null)
    fetch(`/api/bench?source=${source}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { rows?: Row[]; changed?: boolean; error?: string }
        if (!response.ok || !body.rows?.length) throw new Error(body.error ?? String(response.status))
        setRows((current) => (body.changed === false && current.length > 0 ? current : body.rows ?? current))
        setError(null)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : "Failed to load")
      })
    return () => controller.abort()
  }, [source])

  const pickSource = (next: SourceId) => {
    if (next === source) return
    const url = new URL(window.location.href)
    if (next === "cursorbench") url.searchParams.delete("source")
    else url.searchParams.set("source", next)
    window.history.replaceState(null, "", url)
    setPinned(null)
    setHover(null)
    setSource(next)
  }
  const meta = SOURCES[source]

  const visible = useMemo(
    () => rows.filter((row) => !hidden.has(row.provider)),
    [rows, hidden],
  )
  const active = pinned ?? hover

  const toggle = (id: ProviderId) => {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPinned(null)
  }

  return (
    <main className="sheet">
      <header className="head">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h1>Five CLIs</h1>
        </div>
        <p className="deck">
          Score vs. cost per task. Cheaper is further right. Pinned to Opus 5.5, Sonnet 5.5, Grok 4.7, Muse Spark 1.3, and
          Gemini 3.8 Flash. Each GPT line (Astra, Sol, Terra, Luna) shows its newest listed version, so GPT-6.1 Sol would
          replace GPT-6 Sol, which replaces GPT-5.6 Sol.
          {source === "aa"
            ? " AA scores a general intelligence index on another test set; do not compare them with CursorBench percentages."
            : null}
        </p>
      </header>

      <div className="sources" role="group" aria-label="Data source">
        {(Object.keys(SOURCES) as SourceId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={id === source ? "source on" : "source"}
            aria-pressed={id === source}
            onClick={() => pickSource(id)}
          >
            {SOURCES[id].name}
          </button>
        ))}
      </div>

      <div className="legend" role="group" aria-label="Visible providers">
        {PROVIDERS.map((provider) => {
          const count = rows.filter((row) => row.provider === provider.id).length
          if (count === 0) return null
          const off = hidden.has(provider.id)
          return (
            <button
              key={provider.id}
              type="button"
              className={off ? "chip off" : "chip"}
              aria-pressed={!off}
              onClick={() => toggle(provider.id)}
            >
              <span className="swatch" style={{ background: provider.color }} />
              {provider.name}
              <span className="count">{count}</span>
            </button>
          )
        })}
      </div>

      {error ? (
        <p className="empty">Could not load this page ({error}).</p>
      ) : rows.length === 0 ? (
        <p className="empty">Loading {meta.name}…</p>
      ) : (
        <Chart rows={visible} unit={meta.unit} scoreName={meta.scoreName} active={active} onHover={setHover} onPick={(label) => setPinned((current) => (current === label ? null : label))} />
      )}

      <p className="foot">
        <a href={meta.url}>{meta.url}</a> · v{APP_VERSION}
      </p>
    </main>
  )
}
