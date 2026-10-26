"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { createCondition, deleteCondition, updateCondition } from "@/lib/actions/health"
import { CONDITION_STATUSES, labelFor, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import { useFormat } from "@/components/regional-provider"
import type { Formatter } from "@/lib/regional"
import { filterObservations, type ObservationLike } from "@/lib/observations"
import type { Attachment, HealthCondition } from "@/app/generated/prisma/client"

export type ConditionRow = HealthCondition & { attachments: Attachment[]; provider: { name: string } | null }

const STATUS_VARIANT = { ACTIVE: "destructive", MANAGED: "secondary", RESOLVED: "outline" } as const

const columnsFor = (fmt: Formatter): EntityColumn<ConditionRow>[] => [
  { key: "name", label: "病症", cell: (c) => <span className="font-medium">{c.name}</span> },
  { key: "status", label: "状态", cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{labelFor(CONDITION_STATUSES, c.status)}</Badge> },
  { key: "diagnosed", label: "确诊日期", className: "whitespace-nowrap text-muted-foreground", cell: (c) => (c.diagnosedDate ? fmt.date(c.diagnosedDate, { utc: true }) : "—") },
  { key: "provider", label: "医生", className: "text-muted-foreground", cell: (c) => c.provider?.name ?? "—" },
  { key: "files", label: "附件", cell: (c) => <AttachmentCount attachments={c.attachments} /> },
]

function initialFor(c: ConditionRow | null): FormValues {
  return {
    name: c?.name ?? "",
    status: c?.status ?? "ACTIVE",
    providerId: c?.providerId ?? "",
    diagnosedDate: toDateInput(c?.diagnosedDate),
    resolvedDate: toDateInput(c?.resolvedDate),
    notes: c?.notes ?? "",
  }
}

interface Props {
  personId: string
  conditions: ConditionRow[]
  providers: { id: string; name: string }[]
  /** Newest first; the expanded row shows the ones linked to each condition. */
  observations?: ObservationLike[]
}

export function ConditionsSection({ personId, conditions, providers, observations = [] }: Props) {
  const fmt = useFormat()
  const [editing, setEditing] = useState<ConditionRow | null>(null)
  const [open, setOpen] = useState(false)

  const fields: FieldConfig[] = [
    { name: "name", label: "病症", kind: "text", required: true, placeholder: "2 型糖尿病", wide: true },
    { name: "status", label: "状态", kind: "select", required: true, options: CONDITION_STATUSES },
    { name: "providerId", label: "主治医生", kind: "select", options: providers.map((p) => ({ value: p.id, label: p.name })) },
    { name: "diagnosedDate", label: "确诊日期", kind: "date" },
    { name: "resolvedDate", label: "痊愈日期", kind: "date" },
    { name: "notes", label: "备注", kind: "textarea", wide: true },
  ]

  async function handleDelete(c: ConditionRow) {
    if (!confirm(`确定删除“${c.name}”及其附件吗？关联的就诊和用药记录会保留。`)) return
    const result = await deleteCondition(c.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("病症已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{conditions.length} 项病症</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>添加病症</Button>
      </div>

      <EntityTable
        rows={conditions}
        columns={columnsFor(fmt)}
        describe={(c) => c.name}
        onEdit={(c) => { setEditing(c); setOpen(true) }}
        onDelete={handleDelete}
        empty="暂无病症记录。"
        renderExpanded={(c) => (
          <div className="space-y-3">
            {c.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
            {c.resolvedDate && <p className="text-sm text-muted-foreground">痊愈于 {fmt.date(c.resolvedDate, { utc: true })}</p>}
            <LinkedObservations rows={observations.filter((o) => o.conditionId === c.id)} />
            <AttachmentList recordId={c.id} recordType="CONDITION" attachments={c.attachments} />
          </div>
        )}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑病症" : "添加病症"}
        submitLabel={editing ? "保存更改" : "添加病症"}
        successMessage={editing ? "病症已更新。" : "病症已添加。"}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateCondition(editing.id, values) : createCondition(personId, values))}
        attachmentRecordType="CONDITION"
        recordId={editing?.id}
        attachments={editing?.attachments}
      />
    </>
  )
}

function LinkedObservations({ rows }: { rows: ObservationLike[] }) {
  const fmt = useFormat()
  if (!rows.length) return null
  const recent = filterObservations(rows, { range: "30" }, new Date()).length
  return (
    <div className="text-sm">
      <p className="text-muted-foreground">
        {rows.length} 条观察记录已关联 · 最近 30 天 {recent} 条（见“观察记录”标签页）
      </p>
      <ul className="mt-1 space-y-0.5">
        {rows.slice(0, 5).map((o, i) => (
          <li key={i}>
            {fmt.date(o.date, { utc: true })}{o.time ? ` ${fmt.clock(o.time)}` : ""} — {o.type}
            {o.severity ? <span className="text-muted-foreground"> ({o.severity}/5)</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
