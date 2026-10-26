"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { deleteObservation } from "@/lib/actions/health"
import { useFormat } from "@/components/regional-provider"
import type { Formatter } from "@/lib/regional"
import {
  filterObservations, formatDuration, RANGES, summarizeObservations, typeSuggestions, weeklyCounts,
  type RangeValue,
} from "@/lib/observations"
import { cn } from "@/lib/utils"
import { ObservationDialog, type ConditionOption, type ObservationRow } from "./observation-form"
import { ObservationPattern } from "./observation-pattern"
import { ObservationCalendar } from "./observation-calendar"
import { X } from "lucide-react"
import { buildTimeline, type TimelineMedication } from "@/lib/medication-timeline"
import { medicationEvents } from "@/lib/medication-effects"
import { utcDay } from "@/lib/observation-calendar"

const ALL = "__all__"

const columnsFor = (fmt: Formatter): EntityColumn<ObservationRow>[] => [
  {
    key: "when", label: "时间", className: "whitespace-nowrap",
    cell: (o) => (
      <span>
        {fmt.date(o.date, { utc: true })}
        {o.time && <span className="text-muted-foreground"> · {fmt.clock(o.time)}</span>}
      </span>
    ),
  },
  { key: "type", label: "事项", cell: (o) => <span className="font-medium">{o.type}</span> },
  {
    key: "severity", label: "严重程度", className: "whitespace-nowrap",
    cell: (o) => (o.severity ? <Badge variant={o.severity >= 4 ? "destructive" : "secondary"}>{o.severity} / 5</Badge> : "—"),
  },
  { key: "duration", label: "持续时间", className: "whitespace-nowrap text-muted-foreground", cell: (o) => formatDuration(o.durationMinutes) },
  { key: "condition", label: "病症", className: "text-muted-foreground", cell: (o) => o.condition?.name ?? "—" },
  { key: "by", label: "记录人", className: "text-muted-foreground", cell: (o) => o.createdBy?.name ?? "—" },
  { key: "files", label: "附件", cell: (o) => <AttachmentCount attachments={o.attachments} /> },
]

interface Props {
  personId: string
  observations: ObservationRow[]
  conditions: ConditionOption[]
  /// The same person's medications, marked on the year calendar.
  medications?: TimelineMedication[]
  openId?: string
}

export function ObservationsSection({ personId, observations, conditions, medications = [], openId }: Props) {
  const fmt = useFormat()
  const [editing, setEditing] = useState<ObservationRow | null>(null)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>(ALL)
  const [conditionId, setConditionId] = useState<string>(ALL)
  const [range, setRange] = useState<RangeValue>("90")
  const [pickedDay, setPickedDay] = useState<number | null>(null)

  // A ?open= link (e.g. from a notification or the assistant) opens that entry once.
  const [handledOpenId, setHandledOpenId] = useState<string | undefined>(undefined)
  if (openId !== handledOpenId) {
    setHandledOpenId(openId)
    const match = openId ? observations.find((o) => o.id === openId) : undefined
    if (match) { setEditing(match); setOpen(true) }
  }

  const typeOptions = useMemo(() => typeSuggestions(observations), [observations])
  const now = new Date()
  const base = { type: type === ALL ? null : type, conditionId: conditionId === ALL ? null : conditionId }
  const matching = filterObservations(observations, base, now)
  // A day picked on the calendar overrides the time range until it's cleared.
  const shown = pickedDay != null
    ? matching.filter((o) => utcDay(o.date) === pickedDay)
    : filterObservations(observations, { ...base, range }, now)
  const summary = summarizeObservations(shown)
  const weeks = weeklyCounts(matching, 12, now)
  const events = useMemo(() => medicationEvents(buildTimeline(medications, new Date())), [medications])
  const linkedConditions = conditions.filter((c) => observations.some((o) => o.conditionId === c.id))

  async function handleDelete(o: ObservationRow) {
    if (!confirm(`确定删除 ${fmt.date(o.date, { utc: true })} 的“${o.type}”记录及其附件吗？`)) return
    const result = await deleteObservation(o.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("观察记录已删除。")
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          情绪崩溃、睡不好、症状……任何你想日后回看的事。
        </p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>记录观察</Button>
      </div>

      {observations.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={(v) => setType(v ?? ALL)}>
              <SelectTrigger className="w-44" aria-label="按事项筛选">
                <SelectValue>{(v: string) => (v === ALL ? "全部" : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部</SelectItem>
                {typeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {linkedConditions.length > 0 && (
              <Select value={conditionId} onValueChange={(v) => setConditionId(v ?? ALL)}>
                <SelectTrigger className="w-44" aria-label="按病症筛选">
                  <SelectValue>{(v: string) => (v === ALL ? "所有病症" : conditions.find((c) => c.id === v)?.name ?? "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>所有病症</SelectItem>
                  {linkedConditions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="时间范围">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={range === r.value}
                  onClick={() => { setRange(r.value); setPickedDay(null) }}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    range === r.value && pickedDay == null ?"bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <ObservationCalendar observations={matching} events={events} pickedDay={pickedDay} onPickDay={setPickedDay} />

          <ObservationPattern weeks={weeks} label={type === ALL ? "全部观察记录" : type} />

          <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            {pickedDay != null && (
              <button
                type="button"
                onClick={() => setPickedDay(null)}
                className="mr-1 inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                {fmt.date(new Date(pickedDay), { utc: true })}
                <X className="h-3 w-3" aria-label="清除所选日期" />
              </button>
            )}
            <span className="font-medium text-foreground">{summary.count}</span> 条 · {pickedDay != null ? "当天" : range === "all" ? "全部" : `最近 ${RANGES.find((r) => r.value === range)!.label}`}
            {summary.avgSeverity != null && <> · 平均严重度 {summary.avgSeverity} / 5</>}
            {summary.totalMinutes != null && <> · 共计 {formatDuration(summary.totalMinutes)}</>}
            {type === ALL && summary.byType.length > 1 && (
              <> · {summary.byType.slice(0, 3).map((t) => `${t.type} ${t.count}`).join(", ")}</>
            )}
          </p>
        </div>
      )}

      <EntityTable
        rows={shown}
        columns={columnsFor(fmt)}
        describe={(o) => `${fmt.date(o.date, { utc: true })} · ${o.type}`}
        onEdit={(o) => { setEditing(o); setOpen(true) }}
        onDelete={handleDelete}
        empty={observations.length ? "没有符合筛选条件的记录。" : "暂无观察记录。有事发生时，点击“记录观察”。"}
        renderExpanded={(o) => (
          <div className="space-y-3">
            {o.notes && <p className="text-sm whitespace-pre-wrap">{o.notes}</p>}
            {o.tags && (
              <div className="flex flex-wrap gap-1">
                {o.tags.split(", ").map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
              </div>
            )}
            <AttachmentList recordId={o.id} recordType="OBSERVATION" attachments={o.attachments} />
          </div>
        )}
      />

      <ObservationDialog
        personId={personId}
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        typeOptions={typeOptions}
        conditions={conditions}
      />
    </>
  )
}
