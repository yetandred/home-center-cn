"use client"

import { useMemo, useState } from "react"
import { ChevronRight, ClipboardList } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ServiceRecordList } from "@/components/service-records/service-record-list"
import { HealthTimeline } from "@/components/health/health-timeline"
import { useFormat } from "@/components/regional-provider"
import type { TimelineEvent } from "@/lib/health-timeline"
import type { Attachment, AssetType, ServiceRecord } from "@/app/generated/prisma/client"

type RecordWithAttachments = ServiceRecord & { attachments: Attachment[] }

interface Props {
  /** 合并后的医疗时间线事件（六类数据）。 */
  events: TimelineEvent[]
  /** 就诊记录（ServiceRecordList 的完整功能保留在展开视图里）。 */
  records: RecordWithAttachments[]
  assetId: string
  assetType: AssetType
  providerOptions?: { id: string; name: string }[]
  conditionOptions?: { id: string; name: string }[]
  reminders?: { id: string; title: string; assetType: AssetType; assetId: string }[]
  openId?: string
}

/**
 * 「就诊与支出」标签页的新布局：医疗时间线作为主体，占大部分宽度；
 * 原就诊表格压缩为右侧缩略栏，点击后以弹窗展开完整列表（增删改不受影响）。
 */
export function VisitsTabWithTimeline({ events, records, assetId, assetType, providerOptions, conditionOptions, reminders, openId }: Props) {
  const fmt = useFormat()
  // 深链（?tab=visits&open=…）进来时直接展开完整列表，让原编辑弹窗逻辑生效。
  const [expanded, setExpanded] = useState(openId !== undefined)

  const totalCost = useMemo(() => records.reduce((sum, r) => sum + (r.cost ?? 0), 0), [records])
  const recent = useMemo(() => [...records].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8), [records])

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 主体：医疗时间线 */}
        <div className="min-w-0 flex-1">
          <HealthTimeline events={events} />
        </div>

        {/* 右侧缩略栏：原就诊列表的压缩视图，点击展开 */}
        <aside className="shrink-0 lg:w-64">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="group flex w-full flex-col rounded-lg border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
            aria-haspopup="dialog"
            aria-expanded={expanded}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> 就诊记录
              </div>
              <span className="text-xs text-muted-foreground">{records.length} 次</span>
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              累计支出 <span className="font-semibold text-foreground">{fmt.money(totalCost)}</span>
            </div>
            {recent.length > 0 ? (
              <ul className="divide-y border-t">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-2 px-3 py-1.5">
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {fmt.dayMonth(r.date, { utc: true })}
                    </span>
                    <span className="min-w-0 truncate text-xs">{r.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t px-3 py-3 text-xs text-muted-foreground">暂无就诊记录</div>
            )}
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs font-medium text-primary">
              展开完整列表
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
          </button>
        </aside>
      </div>

      {/* 展开的完整就诊列表 */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-h-[85vh] max-w-[95vw] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>就诊记录</DialogTitle>
            <DialogDescription>新增、编辑或删除就诊记录，改动会同步到左侧时间线。</DialogDescription>
          </DialogHeader>
          <ServiceRecordList
            records={records}
            assetId={assetId}
            assetType={assetType}
            providerOptions={providerOptions}
            conditionOptions={conditionOptions}
            reminders={reminders}
            openId={openId}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
