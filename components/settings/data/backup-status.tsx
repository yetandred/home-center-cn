"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { backUpNow, dismissBackupHint } from "@/lib/actions/backup"
import type { BackupOverview } from "@/lib/backup/overview-server"
import { formatBytes, PROTECTION_LABEL } from "./format"
import { useFormat } from "@/components/regional-provider"

const TONE = {
  ok: { icon: CheckCircle2, text: "备份已是最新", cls: "text-emerald-600 dark:text-emerald-400" },
  stale: { icon: AlertTriangle, text: "备份需要关注", cls: "text-amber-600 dark:text-amber-400" },
  failed: { icon: XCircle, text: "上次备份失败", cls: "text-destructive" },
  none: { icon: Info, text: "暂无备份", cls: "text-muted-foreground" },
} as const

export function BackupStatus({ data, onStarted }: { data: BackupOverview; onStarted: () => Promise<void> }) {
  const fmt = useFormat()
  const [pending, start] = useTransition()
  const tone = TONE[data.tone]
  const newest = data.backups[0]
  const run = data.running

  function now() {
    start(async () => {
      try {
        const r = await backUpNow()
        if ("error" in r) toast.error(r.error)
        else toast.success("备份已开始，你可以离开此页面。")
      } catch {
        toast.error("无法启动备份，请重试。")
      }
      await onStarted()
    })
  }

  async function dismissHint() {
    try {
      await dismissBackupHint()
    } catch {
      return void toast.error("无法关闭提示，请重试。")
    }
    await onStarted()
  }

  const busyLabel = run?.kind === "EXPORT" ? "正在导出" : "正在备份"

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className={cn("flex items-center gap-2", tone.cls)}>
          <tone.icon className="h-5 w-5" aria-hidden="true" />
          {tone.text}
        </CardTitle>
        <CardDescription>
          {newest
            ? `上次备份 ${fmt.dateTime(newest.createdAt)} · ${formatBytes(newest.size)} · ${PROTECTION_LABEL[newest.protection]}`
            : "立即创建第一个备份，或在下方开启定时备份。"}
          {data.nextRunAt && data.settings.schedule !== "OFF" ? ` · 下次 ${fmt.dateTime(data.nextRunAt)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {data.lastRun?.status === "FAILED" || data.lastRun?.status === "INTERRUPTED" ? (
          <p className="text-sm text-destructive">{data.lastRun.error}</p>
        ) : null}
        {data.lastRun?.status === "WARN" && (
          <details className="text-sm text-amber-700 dark:text-amber-400">
            <summary>上次备份时缺失 {data.lastRun.warnings.length} 个文件</summary>
            <ul className="mt-1 list-disc pl-5 text-xs">{data.lastRun.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </details>
        )}
        {data.settings.protection === "NONE" && (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            备份文件可被任何拿到文件的人读取。{" "}
            {data.healthEnabled ? "其中包含健康记录和文档。" : "其中包含你的记录和文档。"}{" "}
            可以在“保护”中为备份加密。
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={now} disabled={pending || !!run}>
            {run ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {run ? (run.total ? `${busyLabel}… ${run.done} / ${run.total} 个文件` : `${busyLabel}…`) : "立即备份"}
          </Button>
          <span className="text-xs text-muted-foreground">保存到 {data.settings.folder}</span>
        </div>
        {!newest && !data.settings.hintDismissed && data.settings.schedule === "OFF" && (
          <p className="text-xs text-muted-foreground">
            提示：每天备份到另一块磁盘（NAS 共享或 USB 硬盘）可以防范磁盘故障。{" "}
            <button type="button" className="underline" onClick={() => void dismissHint()}>关闭提示</button>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
