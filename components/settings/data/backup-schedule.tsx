"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveBackupSchedule } from "@/lib/actions/backup"
import type { BackupOverview } from "@/lib/backup/overview-server"
import { WEEKDAYS } from "./format"

export function BackupSchedule({ data, onSaved }: { data: BackupOverview; onSaved: () => Promise<void> }) {
  const s = data.settings
  const [schedule, setSchedule] = useState(s.schedule)
  const [time, setTime] = useState(s.time)
  const [weekday, setWeekday] = useState(String(s.weekday))
  const [folder, setFolder] = useState(s.folderIsDefault ? "" : s.folder)
  const [keep, setKeep] = useState(String(s.keep))
  const [pending, start] = useTransition()

  function save(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await saveBackupSchedule({ schedule, time, weekday, folder, keep })
      if ("error" in r) return void toast.error(r.error)
      toast.success("备份计划已保存。")
      if (r.warning) toast.warning(r.warning)
      await onSaved()
    })
  }

  const select = "h-9 rounded-md border bg-background px-2 text-sm"
  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>计划</CardTitle>
        <CardDescription>备份在服务器时间的该时刻于后台运行。超过最新 {s.keep} 份的旧备份会被删除。</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bk-schedule">频率</Label>
            <select id="bk-schedule" className={select} value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)}>
              <option value="OFF">关闭</option>
              <option value="DAILY">每天</option>
              <option value="WEEKLY">每周</option>
            </select>
          </div>
          <div className="flex gap-3">
            {schedule === "WEEKLY" && (
              <div className="space-y-1.5">
                <Label htmlFor="bk-day">星期</Label>
                <select id="bk-day" className={select} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bk-time">时间</Label>
              <Input id="bk-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={schedule === "OFF"} />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bk-folder">文件夹</Label>
            <Input id="bk-folder" placeholder={`${s.folderIsDefault ? s.folder : "/data/backups"}（默认）`} value={folder} onChange={(e) => setFolder(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              容器内的路径。要做真正的备份，请在 docker-compose 中挂载其他磁盘或 NAS 共享目录（例如 <code>/backups</code>）。
              {data.folderStatus.sameDevice && data.folderStatus.exists ? " 当前文件夹与数据位于同一块磁盘上。" : ""}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-keep">保留最新</Label>
            <Input id="bk-keep" type="number" min={1} max={365} value={keep} onChange={(e) => setKeep(e.target.value)} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存计划"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
