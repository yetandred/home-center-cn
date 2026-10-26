"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { createAllergy, deleteAllergy, updateAllergy } from "@/lib/actions/health"
import { ALLERGY_SEVERITIES, labelFor } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Allergy, Attachment } from "@/app/generated/prisma/client"

export type AllergyRow = Allergy & { attachments: Attachment[] }

const FIELDS: FieldConfig[] = [
  { name: "substance", label: "过敏原", kind: "text", required: true, placeholder: "青霉素" },
  { name: "severity", label: "严重程度", kind: "select", required: true, options: ALLERGY_SEVERITIES },
  { name: "reaction", label: "反应", kind: "text", placeholder: "荨麻疹、肿胀", wide: true },
  { name: "notes", label: "备注", kind: "textarea", wide: true },
]

const SEVERITY_VARIANT = { MILD: "outline", MODERATE: "secondary", SEVERE: "destructive" } as const

const COLUMNS: EntityColumn<AllergyRow>[] = [
  { key: "substance", label: "过敏原", cell: (a) => <span className="font-medium">{a.substance}</span> },
  { key: "severity", label: "严重程度", cell: (a) => <Badge variant={SEVERITY_VARIANT[a.severity]}>{labelFor(ALLERGY_SEVERITIES, a.severity)}</Badge> },
  { key: "reaction", label: "反应", className: "text-muted-foreground", cell: (a) => a.reaction ?? "—" },
  { key: "files", label: "附件", cell: (a) => <AttachmentCount attachments={a.attachments} /> },
]

function initialFor(a: AllergyRow | null): FormValues {
  return { substance: a?.substance ?? "", severity: a?.severity ?? "MODERATE", reaction: a?.reaction ?? "", notes: a?.notes ?? "" }
}

export function AllergiesSection({ personId, allergies }: { personId: string; allergies: AllergyRow[] }) {
  const [editing, setEditing] = useState<AllergyRow | null>(null)
  const [open, setOpen] = useState(false)

  async function handleDelete(a: AllergyRow) {
    if (!confirm(`确定删除“${a.substance}”的过敏记录吗？`)) return
    const result = await deleteAllergy(a.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("过敏记录已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{allergies.length} 项过敏记录</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>添加过敏</Button>
      </div>

      <EntityTable
        rows={allergies}
        columns={COLUMNS}
        describe={(a) => `${a.substance} 过敏`}
        onEdit={(a) => { setEditing(a); setOpen(true) }}
        onDelete={handleDelete}
        empty="暂无过敏记录。"
        renderExpanded={(a) => <AttachmentList recordId={a.id} recordType="ALLERGY" attachments={a.attachments} />}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑过敏" : "添加过敏"}
        submitLabel={editing ? "保存更改" : "添加过敏"}
        successMessage={editing ? "过敏记录已更新。" : "过敏记录已添加。"}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateAllergy(editing.id, values) : createAllergy(personId, values))}
        attachmentRecordType="ALLERGY"
        recordId={editing?.id}
        attachments={editing?.attachments}
      />
    </>
  )
}
