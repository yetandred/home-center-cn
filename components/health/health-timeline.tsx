"use client"

import { useMemo, useState } from "react"
import { ChevronDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useFormat } from "@/components/regional-provider"
import {
  groupByYearMonth,
  keywordFrequencies,
  recentMonthlyCosts,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/health-timeline"

/** 各类型的展示元数据：文案与配色。类名写全，保证 Tailwind 扫描得到。 */
const TYPE_META: Record<TimelineEventType | "all", { label: string; dot: string; badge: string; soft: string }> = {
  all: { label: "全部", dot: "", badge: "", soft: "" },
  visit: {
    label: "就诊",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    soft: "bg-emerald-50/60",
  },
  observation: {
    label: "观察",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    soft: "bg-amber-50/60",
  },
  condition: {
    label: "病症",
    dot: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    soft: "bg-rose-50/60",
  },
  medication: {
    label: "用药",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    soft: "bg-violet-50/60",
  },
  immunization: {
    label: "疫苗",
    dot: "bg-sky-500",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    soft: "bg-sky-50/60",
  },
  allergy: {
    label: "过敏",
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
    soft: "bg-red-50/60",
  },
}

const TYPES = ["visit", "observation", "condition", "medication", "immunization", "allergy"] as const

function severityStyle(severity: number | null) {
  if (severity == null) return ""
  if (severity <= 2) return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (severity === 3) return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-red-200 bg-red-50 text-red-700"
}

interface Props {
  events: TimelineEvent[]
}

export function HealthTimeline({ events }: Props) {
  const fmt = useFormat()

  const [activeType, setActiveType] = useState<TimelineEventType | "all">("all")
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null)
  const [openYears, setOpenYears] = useState<Set<number> | null>(null) // null = 尚未手动操作，用默认值
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())

  const filtered = useMemo(
    () => (activeType === "all" ? events : events.filter((e) => e.type === activeType)),
    [events, activeType],
  )

  // 过敏已置顶展示，不参与时间线分组（否则月份里会出现只有计数没有卡片的空组）。
  const timelineSource = useMemo(() => filtered.filter((e) => !e.pinned), [filtered])
  const groups = useMemo(() => groupByYearMonth(timelineSource), [timelineSource])
  const defaultOpenYear = groups[0]?.year // 默认只展开最近一年，其余折叠

  const keywordCapsules = useMemo(() => keywordFrequencies(filtered).slice(0, 8), [filtered])
  const trend = useMemo(() => recentMonthlyCosts(events, new Date()), [events])
  const trendTotal = trend.reduce((s, t) => s + t.cost, 0)
  const trendMax = Math.max(...trend.map((t) => t.cost), 1)
  const visitCount = events.filter((e) => e.type === "visit").length

  const pinned = filtered.filter((e) => e.pinned)

  const isOpenYear = (year: number) => (openYears ? openYears.has(year) : year === defaultOpenYear)
  const toggleYear = (year: number) => {
    const next = new Set(openYears ?? (defaultOpenYear != null ? [defaultOpenYear] : []))
    if (next.has(year)) next.delete(year)
    else next.add(year)
    setOpenYears(next)
  }
  const toggleMonth = (key: string) => {
    const next = new Set(collapsedMonths)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsedMonths(next)
  }

  const matchesKeyword = (e: TimelineEvent) =>
    !activeKeyword || e.keywords.includes(activeKeyword)

  return (
    <div className="space-y-4">
      {/* 筛选胶囊 + 关键词 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...TYPES] as const).map((t) => {
            const count = t === "all" ? events.length : events.filter((e) => e.type === t).length
            const active = activeType === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setActiveType(t); setActiveKeyword(null) }}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {t !== "all" && <span className={`h-1.5 w-1.5 rounded-full ${TYPE_META[t].dot}`} aria-hidden="true" />}
                {TYPE_META[t].label} {count}
              </button>
            )
          })}
        </div>
        {keywordCapsules.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">关键词：</span>
            {keywordCapsules.map(({ keyword, count }) => {
              const active = activeKeyword === keyword
              return (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => setActiveKeyword(active ? null : keyword)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {keyword} <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 费用趋势（只统计就诊费用，不受筛选影响） */}
      {visitCount > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> 就诊费用趋势
            </div>
            <div className="text-sm text-muted-foreground">
              近 12 个月 <span className="font-semibold text-foreground">{fmt.money(trendTotal)}</span>
            </div>
          </div>
          <div className="mt-3 flex h-20 items-end gap-1.5">
            {trend.map(({ year, month, cost }) => (
              <div key={`${year}-${month}`} className="group relative flex h-full flex-1 flex-col justify-end" title={`${year}年${month}月：${fmt.money(cost)}`}>
                {cost > 0 && (
                  <div className="mb-1 text-center text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {fmt.moneyCompact(cost)}
                  </div>
                )}
                <div
                  className={`w-full rounded-sm transition-colors ${cost > 0 ? "bg-emerald-500/70 group-hover:bg-emerald-500" : "bg-muted"}`}
                  style={{ height: `${cost > 0 ? Math.max((cost / trendMax) * 100, 8) : 4}%` }}
                />
                <div className="mt-1 text-center text-[10px] text-muted-foreground">{month}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 过敏置顶 */}
      {activeType === "all" && pinned.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-700">
            过敏提示
            <span className="text-xs font-normal text-red-500/80">（长期有效，不受时间线折叠影响）</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {pinned.map((e) => (
              <div key={e.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${TYPE_META.allergy.badge}`}>
                <span className="font-medium">{e.title}</span>
                {e.meta && <span className="opacity-70">{e.meta}</span>}
                {e.detail && <span className="opacity-60">· {e.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 时间线主体 */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          暂无符合条件的记录。
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((year) => {
            const open = isOpenYear(year.year)
            return (
              <div key={year.year} className="rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => toggleYear(year.year)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  aria-expanded={open}
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
                    <span className="font-heading text-lg font-semibold">{year.year} 年</span>
                    <span className="text-xs text-muted-foreground">{year.events.length} 条记录</span>
                  </div>
                  {year.cost > 0 && (
                    <span className="text-sm text-muted-foreground">
                      年度费用 <span className="font-semibold text-foreground">{fmt.money(year.cost)}</span>
                    </span>
                  )}
                </button>
                {open && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <div className="space-y-4">
                      {year.months.map((month) => {
                        const monthKey = `${year.year}-${month.month}`
                        const monthOpen = !collapsedMonths.has(monthKey)
                        const shown = month.events.filter((e) => !e.pinned && matchesKeyword(e))
                        return (
                          <div key={monthKey}>
                            <button
                              type="button"
                              onClick={() => toggleMonth(monthKey)}
                              className="flex w-full items-center gap-2 py-1 text-left"
                              aria-expanded={monthOpen}
                            >
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${monthOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
                              <span className="text-sm font-medium">{month.month} 月</span>
                              <span className="text-xs text-muted-foreground">{month.events.length} 条</span>
                              {month.cost > 0 && <span className="text-xs text-muted-foreground">· {fmt.money(month.cost)}</span>}
                              <span className="ml-2 h-px flex-1 bg-border" aria-hidden="true" />
                            </button>
                            {monthOpen && shown.length > 0 && (
                              <ol className="relative ml-1 mt-1 space-y-3 border-l pl-5">
                                {shown.map((e) => {
                                  const meta = TYPE_META[e.type]
                                  const highlighted = !!activeKeyword && e.keywords.includes(activeKeyword)
                                  return (
                                    <li key={e.id} className="relative">
                                      <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${meta.dot}`} aria-hidden="true" />
                                      <div className={`rounded-md border px-3 py-2 transition-all ${highlighted ? `border-primary ${meta.soft}` : "bg-background"} ${activeKeyword && !highlighted ? "opacity-45" : ""}`}>
                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                          <span className="text-xs tabular-nums text-muted-foreground">
                                            {fmt.dayMonth(e.date, { utc: true })}
                                          </span>
                                          <span className="font-medium text-sm">{e.title}</span>
                                          <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${meta.badge}`}>
                                            {meta.label}
                                          </Badge>
                                          {e.type === "observation" && e.severity != null && (
                                            <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${severityStyle(e.severity)}`}>
                                              严重度 {e.severity}
                                            </Badge>
                                          )}
                                          {e.meta && <span className="text-xs text-muted-foreground">{e.meta}</span>}
                                          {e.cost != null && (
                                            <span className="ml-auto text-sm font-semibold tabular-nums">{fmt.money(e.cost)}</span>
                                          )}
                                        </div>
                                        {e.detail && (
                                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.detail}</p>
                                        )}
                                        {e.keywords.length > 0 && (
                                          <div className="mt-1.5 flex flex-wrap gap-1">
                                            {e.keywords.map((kw) => (
                                              <button
                                                key={kw}
                                                type="button"
                                                onClick={() => setActiveKeyword(activeKeyword === kw ? null : kw)}
                                                className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                                                  activeKeyword === kw ? "bg-primary text-primary-foreground" : "bg-muted/70 text-muted-foreground hover:bg-muted"
                                                }`}
                                              >
                                                {kw}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  )
                                })}
                              </ol>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
