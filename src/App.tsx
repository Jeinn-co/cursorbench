import { useEffect, useMemo, useState } from "react"
import {
  APP_VERSION,
  SOURCES,
  defaultTicked,
  previousGenerations,
  type ProviderId,
  type Row,
  type SourceId,
} from "./bench"
import Chart from "./Chart"
import Legend from "./Legend"

function initialSource(): SourceId {
  return new URLSearchParams(window.location.search).get("source") === "cursorbench" ? "cursorbench" : "aa"
}

// Chip switches and menu ticks are remembered in this browser only. Ticks are kept per
// source, since the two list different models; `seen` marks the models already given a
// default, so a model that shows up later starts unticked. Storage can be missing or
// blocked (private window, preview), so every access is guarded.
const STORAGE_KEY = "cursorbench:visibility:v2"

type Ticks = { hidden: ReadonlySet<string>; seen: ReadonlySet<string> }
type PerSource = Record<SourceId, Ticks>

const EMPTY: Ticks = { hidden: new Set(), seen: new Set() }

function loadVisibility(): { providers: ProviderId[]; perSource: PerSource } {
  const perSource: PerSource = { aa: EMPTY, cursorbench: EMPTY }
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")
    for (const id of Object.keys(perSource) as SourceId[]) {
      const saved = data.sources?.[id]
      if (Array.isArray(saved?.hidden) && Array.isArray(saved?.seen)) {
        perSource[id] = { hidden: new Set(saved.hidden), seen: new Set(saved.seen) }
      }
    }
    return { providers: Array.isArray(data.providers) ? data.providers : [], perSource }
  } catch {
    return { providers: [], perSource }
  }
}

function saveVisibility(providers: ReadonlySet<ProviderId>, perSource: PerSource) {
  try {
    const sources = Object.fromEntries(
      Object.entries(perSource).map(([id, ticks]) => [id, { hidden: [...ticks.hidden], seen: [...ticks.seen] }]),
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providers: [...providers], sources }))
  } catch {
    // Not remembered this time; the page still works.
  }
}

export default function App() {
  const [source, setSource] = useState<SourceId>(initialSource)
  const [hidden, setHidden] = useState<ReadonlySet<ProviderId>>(() => new Set(loadVisibility().providers))
  const [perSource, setPerSource] = useState<PerSource>(() => loadVisibility().perSource)
  const hiddenModels = perSource[source].hidden

  useEffect(() => saveVisibility(hidden, perSource), [hidden, perSource])
  const [rows, setRows] = useState<Row[]>([])
  // The source `rows` came from: right after a switch the old source's rows are still on
  // screen, and defaults must not be worked out from them.
  const [rowsSource, setRowsSource] = useState<SourceId | null>(null)
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
        setRowsSource(source)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : "Failed to load")
      })
    return () => controller.abort()
  }, [source])

  // A model this source has not shown before gets its default tick once.
  useEffect(() => {
    if (rows.length === 0 || rowsSource !== source) return
    setPerSource((current) => {
      const ticks = current[source]
      const unseen = [...new Set(rows.map((row) => row.model))].filter((model) => !ticks.seen.has(model))
      if (unseen.length === 0) return current
      const ticked = defaultTicked(rows)
      return {
        ...current,
        [source]: {
          hidden: new Set([...ticks.hidden, ...unseen.filter((model) => !ticked.has(model))]),
          seen: new Set([...ticks.seen, ...unseen]),
        },
      }
    })
  }, [rows, rowsSource, source])

  const pickSource = (next: SourceId) => {
    if (next === source) return
    const url = new URL(window.location.href)
    if (next === "aa") url.searchParams.delete("source")
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
    setPerSource((current) => {
      const next = new Set(current[source].hidden)
      for (const model of models) {
        if (show) next.delete(model)
        else next.add(model)
      }
      return { ...current, [source]: { ...current[source], hidden: next } }
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
          Score vs. cost per task at API prices. Cheaper is further right. One model per CLI is ticked to start; ▾ on a chip lists every
          version of every line the source has (Artificial Analysis: releases from the last eight months). Each CLI has one
          colour family; the newest version of a line keeps its colour and older ones fade, paler the older they are.
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
