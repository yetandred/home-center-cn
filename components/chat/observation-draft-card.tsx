"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ClipboardList, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createObservation } from "@/lib/actions/health"
import type { ActionResult } from "@/lib/form-types"
import type { CardPatch } from "@/lib/observation-cards"
import { severityLabel, toFormValues, type DraftCard } from "@/lib/observation-draft"
import { cn } from "@/lib/utils"

function errorText(r: ActionResult): string {
  if (typeof r.error === "string") return r.error
  const all = Object.values(r.error ?? {}).flat().filter(Boolean)
  return all.length ? all.join(" ") : "保存失败，请重试。"
}

/// One drafted observation in the chat. Nothing is written until Save, which
/// goes through the same server action as the Observations form.
export function ObservationDraftCard({
  card, onChange, live = false,
}: {
  card: DraftCard
  onChange?: (patch: CardPatch) => void
  /// Still streaming: shown, but Save waits for the answer to finish.
  live?: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const d = card.draft

  if (card.state === "discarded") {
    return <p className="text-xs text-muted-foreground">已放弃草稿 · {d.personName} · {d.type} · {d.date}</p>
  }

  async function save() {
    if (saving || !onChange) return
    setSaving(true)
    try {
      const r = await createObservation(d.personId, toFormValues(d))
      if (r.success && r.id) {
        onChange({ state: "saved", savedId: r.id, error: undefined })
        router.refresh()
      } else onChange({ error: errorText(r) })
    } catch {
      onChange({ error: "无法连接服务器，请重试。" })
    } finally {
      setSaving(false)
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  )

  return (
    <div className={cn("max-w-md rounded-lg border bg-card text-sm shadow-sm", card.state === "saved" && "border-[var(--chart-4)]/50")}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">{card.state === "saved" ? "观察记录已保存" : "观察记录草稿"}</span>
        {card.state !== "saved" && <span className="ml-auto text-xs text-muted-foreground">尚未保存</span>}
      </div>
      <dl className="space-y-1 px-3 py-2 text-xs">
        {row("成员", d.personName)}
        {row("时间", `${d.date}${d.time ? ` · ${d.time}` : ""}`)}
        {row("事项", d.type)}
        {row("严重程度", (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {severityLabel(d.severity)}
            {d.severitySource === "estimated" && (
              <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">估计</span>
            )}
          </span>
        ))}
        {d.durationMinutes != null && row("持续时间", `${d.durationMinutes} 分钟`)}
        {d.notes && row("备注", <span className="whitespace-pre-wrap">{d.notes}</span>)}
        {d.tags.length > 0 && row("标签", d.tags.join("、"))}
      </dl>
      {card.error && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{card.error}</p>}
      <div className="flex items-center gap-2 border-t px-3 py-2">
        {card.state === "saved" ? (
          <>
            <Check className="h-4 w-4 text-[var(--chart-4)]" aria-hidden="true" />
            <span className="text-xs">已保存</span>
            <Link className="ml-auto text-xs font-medium underline-offset-2 hover:underline" href={`/assets/people/${d.personId}?tab=observations&open=${card.savedId}`}>
              打开记录
            </Link>
          </>
        ) : (
          <>
            <Button size="sm" onClick={save} disabled={saving || live || !onChange}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              保存
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange?.({ state: "discarded", error: undefined })} disabled={saving || live || !onChange}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              放弃
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">{live ? "即将完成……" : "或告诉我需要修改什么"}</span>
          </>
        )}
      </div>
    </div>
  )
}
