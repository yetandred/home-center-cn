"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, Trash2 } from "lucide-react"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { createInsurancePolicy, deleteInsurancePolicy, updateInsurancePolicy } from "@/lib/actions/insurance"
import { daysUntil, HEALTH_WINDOWS, INSURANCE_KINDS, labelFor, toDateInput } from "@/lib/health"
import type { FieldConfig, FormValues } from "@/lib/form-types"
import type { Attachment, InsurancePolicy } from "@/app/generated/prisma/client"
import { useFormat } from "@/components/regional-provider"

export type PolicyRow = InsurancePolicy & { members: { id: string; name: string }[]; attachments: Attachment[] }

function coverageStatus(p: PolicyRow) {
  if (!p.endDate) return { label: "生效中", variant: "outline" as const }
  const days = daysUntil(p.endDate, new Date())
  if (days < 0) return { label: "已结束", variant: "secondary" as const }
  if (days <= HEALTH_WINDOWS.insuranceDays) return { label: days === 0 ? "今天结束" : `${days} 天后结束`, variant: "destructive" as const }
  return { label: "生效中", variant: "outline" as const }
}

function initialFor(p: PolicyRow | null): FormValues {
  return {
    carrier: p?.carrier ?? "",
    planName: p?.planName ?? "",
    kind: p?.kind ?? "MEDICAL",
    memberId: p?.memberId ?? "",
    groupNumber: p?.groupNumber ?? "",
    policyNumber: p?.policyNumber ?? "",
    phone: p?.phone ?? "",
    startDate: toDateInput(p?.startDate),
    endDate: toDateInput(p?.endDate),
    deductible: p?.deductible?.toString() ?? "",
    outOfPocketMax: p?.outOfPocketMax?.toString() ?? "",
    memberIds: p?.members.map((m) => m.id).join(",") ?? "",
    notes: p?.notes ?? "",
  }
}

interface Props {
  policies: PolicyRow[]
  people: { id: string; name: string }[]
  openId?: string
}

export function InsuranceList({ policies, people, openId }: Props) {
  const fmt = useFormat()
  const [editing, setEditing] = useState<PolicyRow | null>(null)
  const [open, setOpen] = useState(false)

  const [prevOpenId, setPrevOpenId] = useState<string | undefined>(undefined)
  if (openId !== prevOpenId) {
    setPrevOpenId(openId)
    const match = openId ? policies.find((p) => p.id === openId) : undefined
    if (match) { setEditing(match); setOpen(true) }
  }

  const fields: FieldConfig[] = [
    { name: "carrier", label: "保险公司", kind: "text", required: true, placeholder: "蓝十字" },
    { name: "planName", label: "计划", kind: "text", placeholder: "PPO 家庭计划" },
    { name: "kind", label: "类型", kind: "select", required: true, options: INSURANCE_KINDS },
    { name: "memberId", label: "会员号", kind: "text" },
    { name: "groupNumber", label: "团体号", kind: "text" },
    { name: "policyNumber", label: "保单号", kind: "text" },
    { name: "phone", label: "会员服务电话", kind: "tel" },
    { name: "startDate", label: "保障开始", kind: "date" },
    { name: "endDate", label: "保障结束", kind: "date" },
    { name: "deductible", label: `免赔额（${fmt.currencySymbol}）`, kind: "number" },
    { name: "outOfPocketMax", label: `自付上限（${fmt.currencySymbol}）`, kind: "number" },
    { name: "memberIds", label: "涵盖成员", kind: "checkboxes", options: people.map((p) => ({ value: p.id, label: p.name })), wide: true },
    { name: "notes", label: "备注", kind: "textarea", wide: true },
  ]

  async function handleDelete(p: PolicyRow) {
    if (!confirm(`删除 ${p.carrier} 的保单及其文件？`)) return
    const result = await deleteInsurancePolicy(p.id)
    if (result.error) { toast.error("删除失败。"); return }
    toast.success("保单已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">保险</h1>
          <p className="text-sm text-muted-foreground mt-0.5">医疗、牙科和视力保险，支持上传保险卡照片。</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>添加保单</Button>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">暂无保单</p>
          <p className="text-sm mt-1">添加保单，然后上传保险卡正反面照片。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {policies.map((p) => {
            const status = coverageStatus(p)
            const rows: [string, string | null][] = [
              ["会员号", p.memberId],
              ["团体号", p.groupNumber],
              ["保单号", p.policyNumber],
              ["电话", p.phone],
              ["免赔额", p.deductible != null ? fmt.money(p.deductible) : null],
              ["自付上限", p.outOfPocketMax != null ? fmt.money(p.outOfPocketMax) : null],
              ["保障期", p.startDate || p.endDate ? `${p.startDate ? fmt.date(p.startDate, { utc: true }) : "—"} – ${p.endDate ? fmt.date(p.endDate, { utc: true }) : "—"}` : null],
              ["涵盖成员", p.members.length > 0 ? p.members.map((m) => m.name).join(", ") : "暂无"],
            ]
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{p.carrier}{p.planName ? ` · ${p.planName}` : ""}</CardTitle>
                      <div className="mt-1 flex gap-1.5">
                        <Badge variant="secondary">{labelFor(INSURANCE_KINDS, p.kind)}</Badge>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`编辑 ${p.carrier} 保单`} onClick={() => { setEditing(p); setOpen(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`删除 ${p.carrier} 保单`} onClick={() => handleDelete(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {rows.filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className={label === "会员号" || label === "团体号" || label === "保单号" ? "font-mono" : undefined}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <AttachmentList recordId={p.id} recordType="INSURANCE" attachments={p.attachments} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <EntityFormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑保单" : "添加保单"}
        submitLabel={editing ? "保存更改" : "添加保单"}
        successMessage={editing ? "保单已更新。" : "保单已添加。可在卡片上上传保险卡照片。"}
        fields={fields}
        initial={initialFor(editing)}
        onSubmit={(values) => (editing ? updateInsurancePolicy(editing.id, values) : createInsurancePolicy(values))}
      />
    </>
  )
}
