"use client"

import { useState } from "react"
import { ChartGantt, GitCompareArrows, List } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import {
  createMedication, deleteMedication, markMedicationRefilled, updateMedication,
} from "@/lib/actions/health"
import { useFormat } from "@/components/regional-provider"
import type { Formatter } from "@/lib/regional"
import { daysUntil, isMedicationActive, refillDue, toDateInput } from "@/lib/health"
import { MEDICATION_VIEW_COOKIE, sortChronologically, type MedicationView } from "@/lib/medication-timeline"
import { ASSET_VIEW_COOKIE_MAX_AGE } from "@/lib/asset-view"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import { cn } from "@/lib/utils"
import type { Attachment, Medication } from "@/app/generated/prisma/client"
import { MedicationTimeline } from "./medication-timeline"
import { MedicationEffectsView } from "./medication-effects"

export type MedicationRow = Medication & { attachments: Attachment[]; prescriber: { name: string } | null; condition: { name: string } | null }

const VIEWS: { value: MedicationView; label: string; icon: React.ElementType }[] = [
  { value: "list", label: "列表", icon: List },
  { value: "timeline", label: "时间线", icon: ChartGantt },
  { value: "effects", label: "前后对比", icon: GitCompareArrows },
]

function ViewToggle({ value, onChange }: { value: MedicationView; onChange: (v: MedicationView) => void }) {
  return (
    <div role="group" aria-label="用药视图" className="inline-flex items-center rounded-lg border bg-card p-0.5">
      {VIEWS.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-sidebar-primary/10 text-sidebar-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function RefillCell({ m }: { m: MedicationRow }) {
  const fmt = useFormat()
  if (!m.nextRefillDate) return <span className="text-muted-foreground">—</span>
  const shown = fmt.date(m.nextRefillDate, { utc: true })
  const now = new Date()
  if (!refillDue(m, now)) return <span className="text-muted-foreground">{shown}</span>
  return daysUntil(m.nextRefillDate, now) < 0
    ? <Badge variant="destructive">已逾期 · {shown}</Badge>
    : <Badge variant="secondary">即将到期 {shown}</Badge>
}

const columnsFor = (fmt: Formatter): EntityColumn<MedicationRow>[] => [
  {
    key: "name", label: "用药",
    cell: (m) => (
      <div>
        <div className="font-medium">{m.name}</div>
        {(m.dosage || m.frequency) && (
          <div className="text-xs text-muted-foreground">{[m.dosage, m.frequency].filter(Boolean).join(" · ")}</div>
        )}
      </div>
    ),
  },
  { key: "started", label: "开始日期", className: "whitespace-nowrap text-muted-foreground", cell: (m) => (m.startDate ? fmt.date(m.startDate, { utc: true }) : "—") },
  { key: "for", label: "针对病症", className: "text-muted-foreground", cell: (m) => m.condition?.name ?? "—" },
  { key: "prescriber", label: "处方医生", className: "text-muted-foreground", cell: (m) => m.prescriber?.name ?? "—" },
  { key: "refill", label: "下次续药", className: "whitespace-nowrap", cell: (m) => <RefillCell m={m} /> },
  { key: "files", label: "附件", cell: (m) => <AttachmentCount attachments={m.attachments} /> },
]

const pastColumnsFor = (fmt: Formatter): EntityColumn<MedicationRow>[] => {
  const COLUMNS = columnsFor(fmt)
  return [
  COLUMNS[0],
  COLUMNS[1],
  { key: "ended", label: "停用日期", className: "whitespace-nowrap text-muted-foreground", cell: (m) => (m.endDate ? fmt.date(m.endDate, { utc: true }) : "—") },
  COLUMNS[2],
  COLUMNS[COLUMNS.length - 1],
  ]
}

function initialFor(m: MedicationRow | null): FormValues {
  return {
    name: m?.name ?? "",
    dosage: m?.dosage ?? "",
    frequency: m?.frequency ?? "",
    prescriberId: m?.prescriberId ?? "",
    conditionId: m?.conditionId ?? "",
    pharmacy: m?.pharmacy ?? "",
    startDate: toDateInput(m?.startDate),
    endDate: toDateInput(m?.endDate),
    refillIntervalDays: m?.refillIntervalDays?.toString() ?? "",
    nextRefillDate: toDateInput(m?.nextRefillDate),
    notes: m?.notes ?? "",
  }
}

interface Props {
  personId: string
  medications: MedicationRow[]
  providers: { id: string; name: string }[]
  conditions: { id: string; name: string }[]
  /// Observation dates for the same person, drawn under the timeline so dose
  /// changes can be read against how often things were logged.
  observations?: { date: Date; type: string; severity?: number | null }[]
  initialView?: MedicationView
  openId?: string
}

export function MedicationsSection({ personId, medications, providers, conditions, observations = [], initialView = "list", openId }: Props) {
  const fmt = useFormat()
  const [editing, setEditing] = useState<MedicationRow | null>(null)
  const [open, setOpen] = useState(false)

  const [prevOpenId, setPrevOpenId] = useState<string | undefined>(undefined)
  if (openId !== prevOpenId) {
    setPrevOpenId(openId)
    const match = openId ? medications.find((m) => m.id === openId) : undefined
    if (match) { setEditing(match); setOpen(true) }
  }

  // Seeded from the cookie the page already read, like the asset list layouts,
  // so the first paint is the saved view and no effect has to correct it.
  const [view, setView] = useState<MedicationView>(initialView)
  function chooseView(v: MedicationView) {
    setView(v)
    document.cookie = `${MEDICATION_VIEW_COOKIE}=${v}; Path=/; Max-Age=${ASSET_VIEW_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  const now = new Date()
  const active = medications.filter((m) => isMedicationActive(m, now))
  const past = sortChronologically(medications.filter((m) => !isMedicationActive(m, now)), "desc")

  const fields: FieldConfig[] = [
    { name: "name", label: "用药", kind: "text", required: true, placeholder: "二甲双胍", wide: true },
    { name: "dosage", label: "剂量", kind: "text", placeholder: "500 mg" },
    { name: "frequency", label: "频次", kind: "text", placeholder: "每日两次" },
    { name: "prescriberId", label: "处方医生", kind: "select", options: providers.map((p) => ({ value: p.id, label: p.name })) },
    { name: "conditionId", label: "针对病症", kind: "select", options: conditions.map((c) => ({ value: c.id, label: c.name })) },
    { name: "startDate", label: "开始日期", kind: "date" },
    { name: "endDate", label: "停用日期", kind: "date" },
    { name: "refillIntervalDays", label: "续药间隔（天）", kind: "number", placeholder: "30" },
    { name: "nextRefillDate", label: "下次续药", kind: "date" },
    { name: "pharmacy", label: "药房", kind: "text", placeholder: "市中心药店", wide: true },
    { name: "notes", label: "备注", kind: "textarea", wide: true },
  ]

  async function handleDelete(m: MedicationRow) {
    if (!confirm(`确定删除“${m.name}”吗？如需保留历史，可改为设置停用日期。`)) return
    const result = await deleteMedication(m.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("用药记录已删除。")
  }

  async function handleRefilled(m: MedicationRow) {
    const result = await markMedicationRefilled(m.id)
    if (result.error) { toast.error(typeof result.error === "string" ? result.error : "更新失败。"); return }
    toast.success(`${m.name}：${m.refillIntervalDays} 天后需再次续药。`)
  }

  const openEdit = (m: MedicationRow) => { setEditing(m); setOpen(true) }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={chooseView} />
          <p className="whitespace-nowrap text-sm text-muted-foreground">在用 {active.length} · 已停用 {past.length}</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>添加用药</Button>
      </div>

      {view === "timeline" ? (
        <MedicationTimeline
          medications={medications}
          observations={observations}
          onSelect={(id) => { const m = medications.find((x) => x.id === id); if (m) openEdit(m) }}
        />
      ) : view === "effects" ? (
        <MedicationEffectsView medications={medications} observations={observations} />
      ) : (
      <>
      <EntityTable
        rows={active}
        columns={columnsFor(fmt)}
        describe={(m) => m.name}
        onEdit={openEdit}
        onDelete={handleDelete}
        empty="暂无在用药物。"
        extraActions={(m) =>
          m.refillIntervalDays ? (
            <Button variant="outline" size="sm" className="h-7" onClick={() => handleRefilled(m)}>已续药</Button>
          ) : null
        }
        renderExpanded={(m) => <AttachmentList recordId={m.id} recordType="MEDICATION" attachments={m.attachments} />}
      />

      {past.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">历史用药</h3>
          <EntityTable rows={past} columns={pastColumnsFor(fmt)} describe={(m) => m.name} onEdit={openEdit} onDelete={handleDelete} empty="" renderExpanded={(m) => <AttachmentList recordId={m.id} recordType="MEDICATION" attachments={m.attachments} />} />
        </div>
      )}
      </>
      )}

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑用药" : "添加用药"}
        submitLabel={editing ? "保存更改" : "添加用药"}
        successMessage={editing ? "用药记录已更新。" : "用药记录已添加。"}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateMedication(editing.id, values) : createMedication(personId, values))}
        attachmentRecordType="MEDICATION"
        recordId={editing?.id}
        attachments={editing?.attachments}
      />
    </>
  )
}
