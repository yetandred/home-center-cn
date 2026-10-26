"use client"

import { useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Minus, Play, RotateCcw, Square } from "lucide-react"
import { useFormat } from "@/components/regional-provider"
import type { Formatter } from "@/lib/regional"
import {
  medicationEffects, medicationEvents, STEADY_DELTA, type MedicationEffect, type MedicationEventKind,
} from "@/lib/medication-effects"
import { buildTimeline, daysBetween, formatSpan, type TimelineMedication } from "@/lib/medication-timeline"
import { niceMax } from "@/components/charts/primitives/scale"
import { cn } from "@/lib/utils"

// The first few rows tell the story; the rest are a click away.
const LIMIT = 8
// Height a full detail card can need; below this much room it opens upward.
const CARD_ROOM = 320

type Sort = "biggest" | "newest"

const KIND_ICON: Record<MedicationEventKind, React.ElementType> = {
  up: ArrowUp, down: ArrowDown, start: Play, restart: RotateCcw, stop: Square,
}

const KIND_WORD: Record<MedicationEventKind, string> = {
  up: "剂量增加", down: "剂量减少", start: "开始用药", restart: "中断后重新开始", stop: "停药",
}
const KIND_ORDER: MedicationEventKind[] = ["up", "down", "start", "restart", "stop"]

function direction(e: MedicationEffect): "more" | "fewer" | "steady" {
  return e.delta >= STEADY_DELTA ? "more" : e.delta <= -STEADY_DELTA ? "fewer" : "steady"
}

// Harder days afterwards are drawn in the destructive hue and easier ones in the
// green chart hue, always with an arrow and a word, so the direction never
// rests on colour.
const TONE = {
  more: { stroke: "var(--destructive)", label: "更高" },
  fewer: { stroke: "var(--chart-4)", label: "更低" },
  steady: { stroke: "var(--muted-foreground)", label: "基本持平" },
} as const

/// The Medications tab's "Before & after" view: works the comparison out from
/// the raw rows, with `now` pinned to the end of today (UTC) so the server
/// render and hydration agree.
export function MedicationEffectsView({
  medications,
  observations,
}: {
  medications: TimelineMedication[]
  observations: { date: Date; type: string; severity?: number | null }[]
}) {
  const [now] = useState(() => {
    const t = new Date()
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) + 86_400_000)
  })
  const effects = useMemo(
    () => medicationEffects(medicationEvents(buildTimeline(medications, now)), observations, now),
    [medications, observations, now]
  )
  if (!observations.length || !effects.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {observations.length
          ? "为用药添加开始日期，即可对比每次变化前后的情况。"
          : "记录观察，即可查看每次用药变化前后各天的状态。"}
      </div>
    )
  }
  return <MedicationEffects effects={effects} />
}

export function MedicationEffects({
  effects,
  onFocusDate,
}: {
  effects: MedicationEffect[]
  /// Points a timeline's day readout at a change while its row is hovered.
  onFocusDate?: (t: number | null) => void
}) {
  const fmt = useFormat()
  const [sort, setSort] = useState<Sort>("biggest")
  // The detail card for the hovered or focused row, placed under it. It lives
  // outside the scroll box so it isn't clipped on the last rows.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<{ e: MedicationEffect; top: number; above: boolean } | null>(null)
  const openDetail = (e: MedicationEffect, row: HTMLElement) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const r = row.getBoundingClientRect()
    const w = wrap.getBoundingClientRect()
    // Opens downward, or upward when the window doesn't have room below the
    // row for a full card and has more room above it.
    const below = window.innerHeight - r.bottom
    const above = below < CARD_ROOM && r.top > below
    setDetail({ e, above, top: above ? r.top - w.top - 4 : r.bottom - w.top + 4 })
    onFocusDate?.(e.at)
  }
  const closeDetail = () => { setDetail(null); onFocusDate?.(null) }
  const [showAll, setShowAll] = useState(false)

  const readable = effects.filter((e) => e.status === "ok")
  const pool = showAll ? effects : readable
  const sorted = [...pool].sort((a, b) =>
    sort === "newest" ? b.at - a.at : Math.abs(b.delta) - Math.abs(a.delta) || b.at - a.at
  )
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? sorted : sorted.slice(0, LIMIT)
  const max = niceMax(Math.max(1, ...pool.flatMap((e) => [e.before.avg, e.after.avg])))
  const ticks = [0, max / 2, max]
  const hidden = effects.length - readable.length

  if (effects.length === 0) return null

  return (
    <figure className="rounded-lg border bg-card">
      <figcaption className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b px-4 py-3">
        <div className="max-w-xl">
          <div className="text-sm font-medium">每次变化前后的对比</div>
          <div className="text-xs text-muted-foreground">
            变化前 4 周与变化后 4 周的日均状态。每天按当日最严重的一条观察记录评分，从 0（无记录）到 5（严重）；未填严重程度的记录按轻微计。
            记录习惯本身也会变化，临近的其他变化会分摊影响。
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
            {KIND_ORDER.map((k) => {
              const Icon = KIND_ICON[k]
              return (
                <span key={k} className="flex items-center gap-1">
                  <Icon className="h-3 w-3" strokeWidth={2.25} />
                  {KIND_WORD[k]}
                </span>
              )
            })}
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border-2 border-[var(--muted-foreground)]" /> 前
              <span className="ml-1 h-2 w-2 rounded-full bg-[var(--muted-foreground)]" /> 后
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="排序方式">
            {(["biggest", "newest"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                onClick={() => setSort(s)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  sort === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "biggest" ? "差异最大" : "最新在前"}
              </button>
            ))}
          </div>
          {hidden > 0 && (
            <button
              type="button"
              aria-pressed={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {showAll ? "隐藏" : "显示"} {hidden} 条数据不足的变化
            </button>
          )}
        </div>
      </figcaption>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          还没有变化在前后各有四周的观察记录。
        </p>
      ) : (
        <div ref={wrapRef} className="relative" onPointerLeave={closeDetail}>
        <div className="overflow-x-auto">
          <div className="min-w-[680px] px-4 pb-2">
            {/* Scale */}
            <div className="grid grid-cols-[minmax(0,17rem)_1fr_9.5rem] gap-4 pt-2 text-[11px] text-muted-foreground">
              <div>变化</div>
              <div className="relative h-4">
                {ticks.map((t) => (
                  <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(t / max) * 100}%` }}>
                    {Number.isInteger(t) ? t : t.toFixed(1)}
                  </span>
                ))}
                <span className="absolute right-0 translate-x-full pl-1.5">日均</span>
              </div>
              <div className="text-right">前 → 后</div>
            </div>

            <ul>
              {rows.map((e) => {
                const dir = direction(e)
                const tone = TONE[dir]
                const KindIcon = KIND_ICON[e.kind]
                const muted = e.status !== "ok"
                const a = (e.before.avg / max) * 100
                const b = (e.after.avg / max) * 100
                return (
                  <li
                    key={`${e.medId}-${e.kind}-${e.at}`}
                    className={cn(
                      "grid grid-cols-[minmax(0,17rem)_1fr_9.5rem] items-center gap-4 border-b border-[var(--chart-grid)] py-2.5 last:border-b-0",
                      "transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
                      muted && "opacity-60"
                    )}
                    tabIndex={0}
                    aria-label={`${e.name}, ${e.label}, ${periodText(e, fmt)}`}
                    onPointerEnter={(ev) => openDetail(e, ev.currentTarget)}
                    onFocus={(ev) => openDetail(e, ev.currentTarget)}
                    onBlur={closeDetail}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <KindIcon className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
                        <span className="truncate font-medium">{e.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{e.label}</span>
                      </div>
                      <div className="truncate pl-[18px] text-xs text-muted-foreground tabular-nums">
                        {periodText(e, fmt)}
                        {nearbyCount(e) > 0 && <> · 另有 {nearbyCount(e)} 处临近变化</>}
                      </div>
                    </div>

                    {/* Dumbbell: hollow = before, filled = after, joined in the direction's hue. */}
                    <div className="relative h-5" aria-hidden="true">
                      {ticks.map((t) => (
                        <div key={t} className="absolute inset-y-0 w-px bg-[var(--chart-grid)]" style={{ left: `${(t / max) * 100}%` }} />
                      ))}
                      {e.status !== "no-baseline" && (
                        <div
                          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
                          style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%`, background: tone.stroke }}
                        />
                      )}
                      {e.status !== "no-baseline" && (
                        <span
                          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
                          style={{ left: `${a}%`, borderColor: "var(--muted-foreground)" }}
                        />
                      )}
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--card)]"
                        style={{ left: `${b}%`, background: tone.stroke }}
                      />
                    </div>

                    <div className="text-right">
                      <div className="text-sm tabular-nums">
                        {e.status === "no-baseline" ? "—" : e.before.avg} → <span className="font-medium">{e.after.avg}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        {e.status === "no-baseline" ? (
                          "当时尚未开始记录"
                        ) : e.status === "too-recent" ? (
                          `目前仅 ${e.after.days} 天`
                        ) : (
                          <>
                            {dir === "more" ? <ArrowUp className="h-3 w-3" style={{ color: tone.stroke }} aria-hidden="true" />
                              : dir === "fewer" ? <ArrowDown className="h-3 w-3" style={{ color: tone.stroke }} aria-hidden="true" />
                              : <Minus className="h-3 w-3" aria-hidden="true" />}
                            <span className="tabular-nums">{dir === "steady" ? "" : `${Math.abs(e.delta)} `}</span>
                            {tone.label}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {sorted.length > LIMIT && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 w-full rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {expanded ? "收起" : `显示全部 ${sorted.length} 条变化`}
              </button>
            )}
          </div>
        </div>
        {detail && <DetailCard e={detail.e} top={detail.top} above={detail.above} />}
        </div>
      )}

      <table className="sr-only">
        <caption>每次用药变化前后的日均评分（0 到 5）</caption>
        <thead><tr><th>日期</th><th>用药</th><th>变化</th><th>变化前日均</th><th>变化后日均</th><th>变化前严重天数</th><th>变化后严重天数</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={`${e.medId}-${e.kind}-${e.at}`}>
              <td>{fmt.date(new Date(e.at), { utc: true })}</td><td>{e.name}</td><td>{e.label}</td>
              <td>{e.status === "no-baseline" ? "无数据" : e.before.avg}</td><td>{e.after.avg}</td>
              <td>{e.status === "no-baseline" ? "无数据" : e.before.severe}</td><td>{e.after.severe}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const DAY = 86_400_000

const nearbyCount = (e: MedicationEffect) => new Set(e.nearby.map((n) => n.name)).size

/// "Mar 3 → Aug 12, 2026 · 5 months": the period the change began, or for a
/// stop the period it ended (the row label already says "Stopped").
function periodText(e: MedicationEffect, fmt: Formatter): string {
  const last = e.period.end - DAY
  // The year is said once when both ends share it: "Aug 29 → Oct 10, 2026".
  const sameYear = !e.period.ongoing && new Date(e.period.start).getUTCFullYear() === new Date(last).getUTCFullYear()
  const from = sameYear ? fmt.dayMonth(new Date(e.period.start), { utc: true }) : fmt.date(new Date(e.period.start), { utc: true })
  const to = e.period.ongoing ? "现在" : fmt.date(new Date(last), { utc: true })
  const span = formatSpan(daysBetween(e.period.start, e.period.end))
  return `${from} → ${to} · ${span}${e.period.ongoing ? "（至今）" : ""}`
}

function DetailCard({ e, top, above }: { e: MedicationEffect; top: number; above: boolean }) {
  const fmt = useFormat()
  const day = (t: number) => fmt.dayMonth(new Date(t), { utc: true })
  const side = (label: string, w: MedicationEffect["before"]) => (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{label} · {day(w.from)} – {day(w.to - DAY)}</span>
        <span className="shrink-0 font-medium tabular-nums">日均 {w.avg}</span>
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        记录了 {w.rough}/{w.days} 天 · <span className={w.severe ? "font-medium text-foreground" : undefined}>{w.severe} 个严重日（4–5）</span> · {w.count} 条记录
      </div>
      {w.topTypes.length > 0 && (
        <div className="truncate text-[11px] text-muted-foreground">
          记录最多：{w.topTypes.map((t) => `${t.type}${t.count > 1 ? ` ×${t.count}` : ""}`).join(", ")}
        </div>
      )}
    </div>
  )
  return (
    <div
      role="status"
      className="chart-fade pointer-events-none absolute right-4 z-20 w-80 max-w-[calc(100%-2rem)] space-y-2 rounded-lg border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-md"
      style={{ top, transform: above ? "translateY(-100%)" : undefined }}
    >
      <div>
        <div className="font-medium">{e.name} · {e.label}</div>
        <div className="text-muted-foreground tabular-nums">
          {periodText(e, fmt)}{e.frequency ? ` · ${e.frequency}` : ""}
        </div>
      </div>
      {e.status === "no-baseline" ? (
        <div className="text-muted-foreground">此变化前 4 周尚未开始记录，因此没有可对比的数据。</div>
      ) : (
        side("前", e.before)
      )}
      {side(e.status === "too-recent" ? `后（目前 ${e.after.days} 天）` : "后", e.after)}
      {e.nearby.length > 0 && (
        <div>
          <div className="text-muted-foreground">4 周内也有变化</div>
          {e.nearby.map((n) => (
            <div key={`${n.medId}-${n.kind}`} className="flex justify-between gap-2">
              <span className="truncate">{n.name} · {n.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{day(n.at)}</span>
            </div>
          ))}
        </div>
      )}
      {e.notes && (
        <div className="border-t pt-2">
          <div className="text-muted-foreground">备注</div>
          <p className="line-clamp-4 whitespace-pre-wrap">{e.notes}</p>
        </div>
      )}
    </div>
  )
}
