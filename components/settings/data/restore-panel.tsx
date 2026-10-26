"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Upload, RotateCcw, TriangleAlert, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { dismissRestoreNotice, restoreCancel, restoreCancelStaged, restoreConfirm, restoreDryRun, restoreRestart, restoreUndo } from "@/lib/actions/backup"
import type { BackupOverview } from "@/lib/backup/overview-server"
import type { DryRun, RestoreResult } from "@/lib/backup/restore"
import { useFormat } from "@/components/regional-provider"

export type RestoreSource = { upload: string } | { file: string }

const LABELS: Record<string, string> = {
  Property: "房产", Vehicle: "车辆", Equipment: "设备", Person: "成员", ServiceRecord: "维护记录",
  Warranty: "保修", MaintenanceSchedule: "提醒", Attachment: "文件", User: "账户", InsurancePolicy: "保险单",
  Medication: "用药", HealthCondition: "病症", Observation: "观察记录", Allergy: "过敏", Immunization: "疫苗接种",
  Provider: "供应商", InboxItem: "收件箱条目",
}
const SECRETS: Record<string, string> = {
  carried: "邮件密码和 AI 密钥包含在此备份中。",
  "same-secret": "邮件密码和 AI 密钥仍然可用（AUTH_SECRET 相同）。",
  "re-enter": "之后需要重新输入邮件密码和 AI 密钥。",
  none: "",
}
const MANUAL_RESTART = "请自行重启 HomeCenter 以完成恢复：停止后重新启动，或重启容器。"

export function RestorePanel({ data, source, setSource, onChanged }: {
  data: BackupOverview
  source: RestoreSource | null
  setSource: (s: RestoreSource | null) => void
  onChanged: () => Promise<void>
}) {
  const fmt = useFormat()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const r = data.restore

  function upload(file: File) {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/backup/upload")
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      setProgress(null)
      if (input.current) input.current.value = ""
      if (xhr.status !== 200) {
        const msg = (() => { try { return (JSON.parse(xhr.responseText) as { error?: string }).error } catch { return undefined } })()
        return void toast.error(msg ?? "上传未完成。")
      }
      setSource({ upload: (JSON.parse(xhr.responseText) as { id: string }).id })
    }
    xhr.onerror = () => {
      setProgress(null)
      toast.error("上传未完成。")
    }
    setProgress(0)
    xhr.send(file)
  }

  async function cancelStaged() {
    try {
      const res = await restoreCancelStaged()
      if ("error" in res) return void toast.error(res.error, { duration: 15000 })
      toast.success(res.keptIn ? `已取消。暂存的数据保留在 ${res.keptIn}。` : "已取消。未做任何更改。", res.keptIn ? { duration: Infinity } : undefined)
    } catch {
      toast.error("无法取消恢复，请重试。")
    }
    await onChanged()
  }

  async function dismiss() {
    try {
      const res = await dismissRestoreNotice()
      if ("error" in res) toast.error(res.error)
    } catch {
      toast.error("无法关闭提示，请重试。")
    }
    await onChanged()
  }

  async function restart() {
    const { restarting, reason } = await restoreRestart()
    if (reason === "busy") return void toast.error("有备份或导出正在运行，完成后再试。")
    if (reason === "nothing-staged") return void toast.error("当前没有等待恢复的内容，无需重启。")
    if (!restarting) return void toast.info(MANUAL_RESTART, { duration: Infinity })
    await waitForRestart()
  }

  return (
    <Card className="py-5" id="restore">
      <CardHeader className="px-5">
        <CardTitle>恢复</CardTitle>
        <CardDescription>用备份替换 HomeCenter 中的全部数据。在任何更改发生前，你都会先看到变更内容。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {r?.pending && (
          <div className="space-y-2 rounded-md border p-3 text-sm" role="status">
            <p className="font-medium">恢复已就绪，正在等待重启。</p>
            <p className="text-muted-foreground">{MANUAL_RESTART} 如果 HomeCenter 会自行重启，请使用下方按钮。</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pending} onClick={() => start(restart)}>立即重启</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(cancelStaged)}>取消暂存的恢复</Button>
            </div>
          </div>
        )}
        {r?.result && !r.pending && !r.result.seenAt && <ResultNotice result={r.result} onDismiss={pending ? undefined : () => start(dismiss)} />}
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" className="hidden" accept=".hcbackup,.age,.zip" aria-label="备份文件" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button variant="outline" disabled={progress !== null || r?.pending} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {progress !== null ? `上传中… ${progress}%` : "从文件恢复"}
          </Button>
          {r?.undoAvailableUntil && !r.pending && (
            <Button variant="ghost" disabled={pending} onClick={() => start(async () => {
              if (!window.confirm("恢复到上次恢复之前的状态？")) return
              const res = await restoreUndo()
              if ("error" in res) return void toast.error(res.error, { duration: 15000 })
              await onChanged()
              await restart()
            })}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />撤销上次恢复
            </Button>
          )}
        </div>
        {r?.undoAvailableUntil && !r.pending && <p className="text-xs text-muted-foreground">在 {fmt.dateTime(r.undoAvailableUntil)} 之前可以撤销上次恢复。</p>}
        <p className="text-xs text-muted-foreground">也可以使用上方列表中某个备份的“恢复”按钮。</p>
      </CardContent>
      {source && (
        <RestoreDialog
          source={source}
          onClose={() => { void restoreCancel(); setSource(null) }}
          onStaged={async () => { setSource(null); await onChanged() }}
          restart={restart}
        />
      )}
    </Card>
  )
}

function ResultNotice({ result, onDismiss }: { result: RestoreResult; onDismiss?: () => void }) {
  const fmt = useFormat()
  const close = (
    <button type="button" className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label="关闭此提示" disabled={!onDismiss} onClick={onDismiss}>
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  )
  if (result.status === "ok") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <p>{result.source === "undo" ? "已撤销恢复" : `已从 ${result.backupCreatedAt ? fmt.dateTime(result.backupCreatedAt) : "更早状态"} 的备份恢复`}，应用时间 {fmt.dateTime(result.appliedAt)}。</p>
        {close}
      </div>
    )
  }
  if (result.rolledBack) {
    return (
      <div className="flex items-start gap-2 text-sm">
        <p className="text-destructive">上次恢复未完成（{fmt.dateTime(result.appliedAt)}）：{result.error} 未做任何更改。</p>
        {close}
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-md border border-destructive p-3 text-sm" role="alert">
      <div className="flex items-start gap-2">
        <p className="flex items-center gap-2 font-medium text-destructive"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />上次恢复中途失败（{fmt.dateTime(result.appliedAt)}）。</p>
        {/* Only once someone has dealt with the displaced data (npm run restore -- --ack). */}
        {result.acknowledgedAt && close}
      </div>
      <p>{result.error}</p>
      <p>你之前的数据已被移开，HomeCenter 当前显示的内容可能不完整。数据保留在{result.recoveryDirs.length === 1 ? "此文件夹" : "这些文件夹"}中：</p>
      {result.recoveryDirs.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {result.recoveryDirs.map((d) => <li key={d} className="break-all font-mono text-xs">{d}</li>)}
        </ul>
      )}
      <p>请将数据移回原位，或联系服务器管理员处理。</p>
    </div>
  )
}

/** Waits for the old process to go and the new one to answer, then reloads at the login page. */
async function waitForRestart() {
  toast.loading("正在重启 HomeCenter…", { duration: Infinity })
  await new Promise((r) => setTimeout(r, 2000))
  for (;;) {
    try {
      if ((await fetch("/api/health", { cache: "no-store" })).ok) break
    } catch {
      // still restarting
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  window.location.href = "/login"
}

function RestoreDialog({ source, onClose, onStaged, restart }: {
  source: RestoreSource
  onClose: () => void
  onStaged: () => Promise<void>
  restart: () => Promise<void>
}) {
  const fmt = useFormat()
  const [report, setReport] = useState<DryRun | null>(null)
  const [key, setKey] = useState("")
  const [password, setPassword] = useState("")
  const [word, setWord] = useState("")
  const [pending, start] = useTransition()

  function check() {
    start(async () => {
      const r = await restoreDryRun({ source, key: key || undefined, password: password || undefined })
      setReport(r)
      if (r.ok) { setKey(""); setPassword("") } // not kept once the backup is open
    })
  }
  // First check as soon as the dialog opens; Unlock re-runs it with the key or password.
  const first = useRef(false)
  useEffect(() => {
    if (first.current) return
    first.current = true
    check()
  })

  const needs = report && !report.ok ? report.needs : undefined
  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>恢复备份</DialogTitle>
          <DialogDescription>在任何更改发生前先校验备份。</DialogDescription>
        </DialogHeader>

        {pending && !report?.ok && <p className="text-sm text-muted-foreground">校验中…</p>}

        {report && !report.ok && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{report.error}</p>
            {needs === "key" && (
              <div className="space-y-1.5">
                <Label htmlFor="rs-key">恢复密钥（粘贴内容，或选择密钥文件）</Label>
                <Textarea id="rs-key" rows={3} value={key} onChange={(e) => setKey(e.target.value)} placeholder="AGE-SECRET-KEY-1…" />
                <Input type="file" accept=".txt" aria-label="恢复密钥文件" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setKey(await f.text()) }} />
              </div>
            )}
            {needs === "password" && (
              <div className="space-y-1.5">
                <Label htmlFor="rs-pw">密码</Label>
                <Input id="rs-pw" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {report?.ok && (
          <div className="space-y-3 text-sm">
            <p>备份创建于 <strong>{fmt.dateTime(report.manifest.createdAt)}</strong>（HomeCenter {report.manifest.appVersion}）。</p>
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground"><th className="text-left font-normal">内容</th><th className="text-right font-normal">当前</th><th className="text-right font-normal">恢复后</th></tr></thead>
              <tbody>
                {Object.keys(LABELS).filter((k) => report.backupCounts[k] || report.currentCounts[k]).map((k) => (
                  <tr key={k}><td>{LABELS[k]}</td><td className="text-right tabular-nums">{report.currentCounts[k] ?? 0}</td><td className="text-right tabular-nums">{report.backupCounts[k] ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
            {SECRETS[report.secrets] && <p className="text-xs">{SECRETS[report.secrets]}</p>}
            {report.warnings.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">创建此备份时已有 {report.warnings.length} 个文件缺失。</p>}
            <p className="rounded-md border border-destructive/40 p-2 text-xs">
              HomeCenter 中现有的全部数据将被替换。所有成员都会退出登录，登录账户将变为此备份中的账户。
              7 天内可以撤销。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="rs-word">输入 RESTORE 以继续</Label>
              <Input id="rs-word" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>取消</Button>
          {needs && <Button disabled={pending || (needs === "key" ? !key : !password)} onClick={check}>解锁</Button>}
          {report?.ok && (
            <Button variant="destructive" disabled={pending || word.trim() !== "RESTORE"} onClick={() => start(async () => {
              const r = await restoreConfirm({ word })
              if ("error" in r) return void toast.error(r.error, { duration: 15000 })
              await onStaged()
              await restart()
            })}>
              恢复并重启
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
