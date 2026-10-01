import { useEffect, useMemo, useState } from "react"
import {
  APP_VERSION,
  SOURCES,
  previousGenerations,
  type ProviderId,
  type Row,
  type SourceId,
} from "./bench"
import Chart from "./Chart"
import Legend from "./Legend"

function initialSource(): SourceId {
  return new URLSearchParams(window.location.search).get("source") === "aa" ? "aa" : "cursorbench"
}

export default function App() {
  const [source, setSource] = useState<SourceId>(initialSource)
  const [hidden, setHidden] = useState<ReadonlySet<ProviderId>>(() => new Set())
  const [hiddenModels, setHiddenModels] = useState<ReadonlySet<string>>(() => new Set())
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
    () => rows.filter((row) => !hidden.has(row.provider) && !hiddenModels.has(row.model)),
    [rows, hidden, hiddenModels],
  )
  // Grey marks GPT versions behind the newest of their line in this source, even when the newer is unticked.
  const previous = useMemo(() => previousGenerations([...new Set(rows.map((row) => row.model))]), [rows])
  const active = pinned ?? hover

  // A chip is off when its provider is hidden or every one of its models is unticked;
  // turning it back on shows the provider with all of its models.
  const toggle = (id: ProviderId) => {
    const models = [...new Set(rows.filter((row) => row.provider === id).map((row) => row.model))]
    const off = hidden.has(id) || models.every((model) => hiddenModels.has(model))
    setHidden((current) => {
      const next = new Set(current)
      if (off) next.delete(id)
      else next.add(id)
      return next
    })
    if (off) {
      setHiddenModels((current) => new Set([...current].filter((model) => !models.includes(model))))
    }
    setPinned(null)
  }

  const setModels = (models: readonly string[], show: boolean) => {
    setHiddenModels((current) => {
      const next = new Set(current)
      for (const model of models) {
        if (show) next.delete(model)
        else next.add(model)
      }
      return next
    })
    if (show) {
      const providers = new Set(rows.filter((row) => models.includes(row.model)).map((row) => row.provider))
      setHidden((current) => new Set([...current].filter((id) => !providers.has(id))))
    }
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
          Gemini 3.8 Flash, plus Fable 5.1 and Gemini 4 Argon where listed, and every listed version of the GPT Astra, Sol,
          Terra and Luna lines. Older GPT versions are grey, lighter the older they are.
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

      <Legend
        rows={rows}
        previous={previous}
        hiddenProviders={hidden}
        hiddenModels={hiddenModels}
        onToggleProvider={toggle}
        onSetModels={setModels}
      />

      {error ? (
        <p className="empty">Could not load this page ({error}).</p>
      ) : rows.length === 0 ? (
        <p className="empty">Loading {meta.name}…</p>
      ) : (
        <Chart rows={visible} previous={previous} unit={meta.unit} scoreName={meta.scoreName} active={active} onHover={setHover} onPick={(label) => setPinned((current) => (current === label ? null : label))} />
      )}

      <p className="foot">
        <a href={meta.url}>{meta.url}</a> · v{APP_VERSION}
      </p>
    </main>
  )
}
