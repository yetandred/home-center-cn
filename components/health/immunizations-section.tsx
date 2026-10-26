"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { createImmunization, deleteImmunization, updateImmunization } from "@/lib/actions/health"
import { useFormat } from "@/components/regional-provider"
import { daysUntil, HEALTH_WINDOWS, isSupersededImmunization, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Attachment, Immunization } from "@/app/generated/prisma/client"

export type ImmunizationRow = Immunization & { attachments: Attachment[] }

const FIELDS: FieldConfig[] = [
  { name: "vaccine", label: "疫苗", kind: "text", required: true, placeholder: "Tdap", wide: true },
  { name: "dateGiven", label: "接种日期", kind: "date", required: true },
  { name: "nextDueDate", label: "下次到期", kind: "date" },
  { name: "dose", label: "剂次", kind: "text", placeholder: "加强针" },
  { name: "givenBy", label: "接种单位", kind: "text", placeholder: "社区药房" },
  { name: "notes", label: "备注", kind: "textarea", wide: true },
]

function initialFor(i: ImmunizationRow | null): FormValues {
  return {
    vaccine: i?.vaccine ?? "",
    dateGiven: toDateInput(i?.dateGiven) || toDateInput(new Date()),
    nextDueDate: toDateInput(i?.nextDueDate),
    dose: i?.dose ?? "",
    givenBy: i?.givenBy ?? "",
    notes: i?.notes ?? "",
  }
}

function DueBadge({ date, superseded }: { date: Date | null; superseded: boolean }) {
  const fmt = useFormat()
  if (!date) return <span className="text-muted-foreground">—</span>
  const shown = fmt.date(date, { utc: true })
  if (superseded) return <span className="text-muted-foreground">{shown}</span>
  const days = daysUntil(date, new Date())
  if (days < 0) return <Badge variant="destructive">已逾期 · {shown}</Badge>
  if (days <= HEALTH_WINDOWS.immunizationDays) return <Badge variant="secondary">即将到期 {shown}</Badge>
  return <span className="text-muted-foreground">{shown}</span>
}

export function ImmunizationsSection({ personId, immunizations, openId }: { personId: string; immunizations: ImmunizationRow[]; openId?: string }) {
  const fmt = useFormat()
  const [editing, setEditing] = useState<ImmunizationRow | null>(null)
  const [open, setOpen] = useState(false)

  const [prevOpenId, setPrevOpenId] = useState<string | undefined>(undefined)
  if (openId !== prevOpenId) {
    setPrevOpenId(openId)
    const match = openId ? immunizations.find((i) => i.id === openId) : undefined
    if (match) { setEditing(match); setOpen(true) }
  }

  // Superseded doses (an older row for the same vaccine, now replaced by a
  // later one) never nag — computed here since this is the full per-person list.
  const COLUMNS: EntityColumn<ImmunizationRow>[] = [
    { key: "vaccine", label: "疫苗", cell: (i) => <div><div className="font-medium">{i.vaccine}</div>{i.dose && <div className="text-xs text-muted-foreground">{i.dose}</div>}</div> },
    { key: "given", label: "接种日期", className: "whitespace-nowrap text-muted-foreground", cell: (i) => (i.dateGiven ? fmt.date(i.dateGiven, { utc: true }) : "—") },
    { key: "by", label: "接种单位", className: "text-muted-foreground", cell: (i) => i.givenBy ?? "—" },
    { key: "next", label: "下次到期", className: "whitespace-nowrap", cell: (i) => <DueBadge date={i.nextDueDate} superseded={isSupersededImmunization(i, immunizations)} /> },
    { key: "files", label: "附件", cell: (i) => <AttachmentCount attachments={i.attachments} /> },
  ]

  async function handleDelete(i: ImmunizationRow) {
    if (!confirm(`确定删除 ${i.vaccine} 于 ${i.dateGiven ? fmt.date(i.dateGiven, { utc: true }) : "—"} 的接种记录吗？`)) return
    const result = await deleteImmunization(i.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("疫苗接种记录已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{immunizations.length} 条疫苗接种记录</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>添加疫苗接种</Button>
      </div>

      <EntityTable
        rows={immunizations}
        columns={COLUMNS}
        describe={(i) => `${i.vaccine} 疫苗接种`}
        onEdit={(i) => { setEditing(i); setOpen(true) }}
        onDelete={handleDelete}
        empty="暂无疫苗接种记录。"
        renderExpanded={(i) => <AttachmentList recordId={i.id} recordType="IMMUNIZATION" attachments={i.attachments} />}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑疫苗接种" : "添加疫苗接种"}
        submitLabel={editing ? "保存更改" : "添加疫苗接种"}
        successMessage={editing ? "疫苗接种记录已更新。" : "疫苗接种记录已添加。"}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateImmunization(editing.id, values) : createImmunization(personId, values))}
        attachmentRecordType="IMMUNIZATION"
        recordId={editing?.id}
        attachments={editing?.attachments}
      />
    </>
  )
}
