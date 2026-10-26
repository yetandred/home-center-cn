"use client"

import { useState } from "react"
import { NotebookPen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { createObservation, updateObservation } from "@/lib/actions/health"
import { toDateInput } from "@/lib/health"
import { SEVERITIES } from "@/lib/observations"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Attachment, Observation } from "@/app/generated/prisma/client"

export type ObservationRow = Observation & {
  attachments: Attachment[]
  condition: { name: string } | null
  createdBy: { name: string } | null
}

export type ConditionOption = { id: string; name: string }

/** Today on the viewer's calendar, as the date input wants it. */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function initialFor(o: ObservationRow | null): FormValues {
  return {
    date: o ? toDateInput(o.date) : localToday(),
    time: o?.time ?? "",
    type: o?.type ?? "",
    severity: o?.severity?.toString() ?? "",
    durationMinutes: o?.durationMinutes?.toString() ?? "",
    conditionId: o?.conditionId ?? "",
    tags: o?.tags ?? "",
    notes: o?.notes ?? "",
  }
}

function fieldsFor(typeOptions: string[], conditions: ConditionOption[]): FieldConfig[] {
  return [
    {
      name: "type", label: "发生了什么", kind: "text", required: true, wide: true,
      placeholder: "情绪崩溃、睡不好、头疼……", suggestions: typeOptions,
    },
    { name: "date", label: "日期", kind: "date", required: true },
    { name: "time", label: "时间（可选）", kind: "time" },
    { name: "severity", label: "严重程度（可选）", kind: "select", options: SEVERITIES },
    { name: "durationMinutes", label: "持续时间（分钟，可选）", kind: "number", placeholder: "20" },
    {
      name: "conditionId", label: "关联病症（可选）", kind: "select", wide: true,
      options: conditions.map((c) => ({ value: c.id, label: c.name })),
    },
    { name: "tags", label: "标签（可选）", kind: "text", wide: true, placeholder: "逗号分隔，如：学校、疲劳、过渡期" },
    { name: "notes", label: "备注", kind: "textarea", wide: true, placeholder: "起因是什么、什么方法有帮助……" },
  ]
}

interface DialogProps {
  personId: string
  open: boolean
  onClose: () => void
  /** null = logging a new observation. */
  editing: ObservationRow | null
  typeOptions: string[]
  conditions: ConditionOption[]
}

export function ObservationDialog({ personId, open, onClose, editing, typeOptions, conditions }: DialogProps) {
  return (
    <EntityFormDialog
      open={open}
      onClose={onClose}
      title={editing ? "编辑观察记录" : "记录观察"}
      submitLabel={editing ? "保存更改" : "记录"}
      successMessage={editing ? "观察记录已更新。" : "观察记录已保存。"}
      fields={fieldsFor(typeOptions, conditions)}
      initial={initialFor(editing)}
      onSubmit={(values) => (editing ? updateObservation(editing.id, values) : createObservation(personId, values))}
      attachmentRecordType="OBSERVATION"
      recordId={editing?.id}
      attachments={editing?.attachments}
    />
  )
}

/** The one-click "Log observation" button in a person's header. */
export function LogObservationButton(props: { personId: string; typeOptions: string[]; conditions: ConditionOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" /> 记录观察
      </Button>
      <ObservationDialog {...props} open={open} onClose={() => setOpen(false)} editing={null} />
    </>
  )
}
