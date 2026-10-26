"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { FileDown, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { exportStatus, startExport } from "@/lib/actions/backup"
import { passwordProblem } from "@/lib/backup/protect-shared"
import type { AssetKind } from "@/lib/backup/format"
import type { BackupOverview } from "@/lib/backup/overview-server"

const GROUPS: { type: AssetKind; label: string }[] = [
  { type: "PROPERTY", label: "房产" },
  { type: "VEHICLE", label: "车辆" },
  { type: "EQUIPMENT", label: "设备" },
  { type: "PERSON", label: "成员" },
]

/** Checks first, so a gone or refused download shows a toast instead of replacing the page with an error. */
async function download(runId: string) {
  const url = `/api/backup/export/${runId}`
  const head = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null)
  if (!head?.ok) {
    toast.error(head?.status === 410 ? "该导出文件已被下载过，请重新创建。" : "导出文件无法下载，请重新创建。")
    return
  }
  window.location.href = url
  toast.success("导出已就绪。只下载一次，不会保留在服务器上。")
}

export function ExportPanel({ data }: { data: BackupOverview }) {
  const [scope, setScope] = useState("all")
  const [includeHealth, setIncludeHealth] = useState(false)
  const [protect, setProtect] = useState(false)
  const [pw, setPw] = useState("")
  const [again, setAgain] = useState("")
  const [runId, setRunId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!runId) return
    const finish = () => {
      clearInterval(t)
      setRunId(null)
      setProgress(null)
    }
    const t = setInterval(async () => {
      try {
        const s = await exportStatus(runId)
        setProgress({ done: s.done, total: s.total })
        if (s.status === "OK" || s.status === "WARN") {
          finish()
          setPw("")
          setAgain("")
          await download(runId)
        } else if (s.status !== "RUNNING") {
          finish()
          toast.error(s.error ?? "导出未完成。")
        }
      } catch {
        finish()
        toast.error("与导出任务的连接已丢失，请重试。")
      }
    }, 1000)
    return () => clearInterval(t)
  }, [runId])

  const pwProblem = protect && pw ? passwordProblem(pw) : null
  const blocked = protect && (!pw || !!pwProblem || pw !== again)
  const busy = pending || !!runId || !!data.running

  function go() {
    start(async () => {
      const [type, id] = scope.split(":")
      try {
        const r = await startExport({
          scope: scope === "all" ? "all" : { assetType: type as AssetKind, assetId: id },
          includeHealth, password: protect ? pw : "",
        })
        if ("error" in r) return void toast.error(r.error)
        setRunId(r.runId)
      } catch {
        toast.error("无法开始导出，请重试。")
      }
    })
  }

  const select = "h-9 w-full rounded-md border bg-background px-2 text-sm"
  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>导出</CardTitle>
        <CardDescription>
          生成一个可在任何电脑上打开的 zip：包含可离线浏览全部数据的页面、电子表格（CSV），以及按可读文件夹整理的所有文件。导出文件无法用于恢复，如需恢复请使用备份。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ex-scope">范围</Label>
          <select id="ex-scope" className={select} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">全部</option>
            {GROUPS.map((g) => {
              const items = data.assets.filter((a) => a.type === g.type)
              return items.length === 0 ? null : (
                <optgroup key={g.type} label={g.label}>
                  {items.map((a) => <option key={`${a.type}:${a.id}`} value={`${a.type}:${a.id}`}>{a.name}</option>)}
                </optgroup>
              )
            })}
          </select>
        </div>
        {scope === "all" && data.healthEnabled && (
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={includeHealth} onChange={(e) => setIncludeHealth(e.target.checked)} />
            包含健康记录
          </label>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
          使用密码保护（请将密码与文件分开发送）
        </label>
        {protect && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ex-pw">密码</Label>
              <Input id="ex-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              {pwProblem && <p className="text-xs text-destructive">{pwProblem}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-pw2">再次输入密码</Label>
              <Input id="ex-pw2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
              {again && pw !== again && <p className="text-xs text-destructive">两次输入的密码不一致。</p>}
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <Button onClick={go} disabled={busy || blocked}>
            {runId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
            {runId ? (progress?.total ? `正在导出… ${progress.done} / ${progress.total} 个文件` : "正在导出…") : "创建导出"}
          </Button>
          {data.running && !runId && <p className="mt-2 text-xs text-muted-foreground">请等待正在运行的备份或导出完成。</p>}
        </div>
      </CardContent>
    </Card>
  )
}
