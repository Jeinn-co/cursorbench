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

// The chip switches and the menu ticks are remembered in this browser only. Storage
// can be missing or blocked (private window, preview), so every access is guarded.
const STORAGE_KEY = "cursorbench:visibility"

function loadVisibility(): { providers: string[]; models: string[] } {
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")
    return {
      providers: Array.isArray(data.providers) ? data.providers : [],
      models: Array.isArray(data.models) ? data.models : [],
    }
  } catch {
    return { providers: [], models: [] }
  }
}

function saveVisibility(providers: ReadonlySet<ProviderId>, models: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providers: [...providers], models: [...models] }))
  } catch {
    // Not remembered this time; the page still works.
  }
}

export default function App() {
  const [source, setSource] = useState<SourceId>(initialSource)
  const [hidden, setHidden] = useState<ReadonlySet<ProviderId>>(
    () => new Set(loadVisibility().providers as ProviderId[]),
  )
  const [hiddenModels, setHiddenModels] = useState<ReadonlySet<string>>(() => new Set(loadVisibility().models))

  useEffect(() => saveVisibility(hidden, hiddenModels), [hidden, hiddenModels])
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

  // The chip only switches the whole CLI on or off; the ticks in its menu are kept.
  const toggle = (id: ProviderId) => {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
          Score vs. cost per task. Cheaper is further right. Every model the source lists for these five CLIs is drawn,
          every version of every line (Artificial Analysis: releases from the last eight months). The newest version of a
          line keeps its colour; older ones fade, paler the older they are. Each CLI has one colour family. Use ▾ on a chip to untick models.
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
