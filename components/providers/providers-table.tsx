"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { EntityTable, type EntityColumn } from "@/components/forms/entity-table"
import { createProvider, deleteProvider, updateProvider } from "@/lib/actions/providers"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Provider } from "@/app/generated/prisma/client"
import { useFormat } from "@/components/regional-provider"

const FIELDS: FieldConfig[] = [
  { name: "name", label: "姓名", kind: "text", required: true, placeholder: "李医生", wide: true },
  { name: "specialty", label: "专长", kind: "text", placeholder: "家庭医学" },
  { name: "practice", label: "执业机构", kind: "text", placeholder: "河滨家庭医疗中心" },
  { name: "phone", label: "电话", kind: "tel", placeholder: "555-555-5555" },
  { name: "email", label: "邮箱", kind: "email" },
  { name: "address", label: "地址", kind: "text", wide: true },
  { name: "notes", label: "备注", kind: "textarea", wide: true },
]

function initialFor(p: Provider | null): FormValues {
  return {
    name: p?.name ?? "", specialty: p?.specialty ?? "", practice: p?.practice ?? "",
    phone: p?.phone ?? "", email: p?.email ?? "", address: p?.address ?? "", notes: p?.notes ?? "",
  }
}

interface Props {
  providers: Provider[]
  stats: Record<string, { visits: number; spend: number }>
}

export function ProvidersTable({ providers, stats }: Props) {
  const fmt = useFormat()
  const [editing, setEditing] = useState<Provider | null>(null)
  const [open, setOpen] = useState(false)

  const columns: EntityColumn<Provider>[] = [
    {
      key: "name", label: "供应商",
      cell: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          {p.specialty && <div className="text-xs text-muted-foreground">{p.specialty}</div>}
        </div>
      ),
    },
    { key: "practice", label: "执业机构", className: "text-muted-foreground", cell: (p) => p.practice ?? "—" },
    {
      key: "phone", label: "电话", className: "whitespace-nowrap",
      cell: (p) => (p.phone ? <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{p.phone}</a> : "—"),
    },
    { key: "visits", label: "就诊次数", className: "text-right text-muted-foreground", cell: (p) => stats[p.id]?.visits ?? 0 },
    { key: "spend", label: "支出", className: "text-right whitespace-nowrap", cell: (p) => fmt.money(stats[p.id]?.spend ?? 0) },
  ]

  async function handleDelete(p: Provider) {
    if (!confirm(`删除“${p.name}”？就诊、病症和处方将保留历史记录，但会取消关联。`)) return
    const result = await deleteProvider(p.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("供应商已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">供应商</h1>
          <p className="text-sm text-muted-foreground mt-0.5">家庭常用的医生、牙医、治疗师和诊所。</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>添加供应商</Button>
      </div>

      <EntityTable
        rows={providers}
        columns={columns}
        describe={(p) => p.name}
        onEdit={(p) => { setEditing(p); setOpen(true) }}
        onDelete={handleDelete}
        empty="暂无供应商。添加家庭就诊的医生和诊所。"
        renderExpanded={(p) => (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {p.email && <span>邮箱：<a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a></span>}
            {p.address && <span>地址：{p.address}</span>}
            {p.notes && <span className="whitespace-pre-wrap">{p.notes}</span>}
          </div>
        )}
      />

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑供应商" : "添加供应商"}
        submitLabel={editing ? "保存更改" : "添加供应商"}
        successMessage={editing ? "供应商已更新。" : "供应商已添加。"}
        fields={FIELDS}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateProvider(editing.id, values) : createProvider(values))}
      />
    </>
  )
}
