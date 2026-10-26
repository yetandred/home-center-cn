"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { updateFeatureSettings } from "@/lib/actions/feature-settings"

type Values = { healthEnabled: boolean; roomsEnabled: boolean; equipmentTabEnabled: boolean }

const FEATURE_NAMES = { healthEnabled: "健康", roomsEnabled: "房间", equipmentTabEnabled: "设备标签页" } as const

export function FeatureSettings({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial)
  const [pending, start] = useTransition()

  function save(next: Values) {
    const previous = values
    setValues(next)
    start(async () => {
      const r = await updateFeatureSettings(next)
      if ("error" in r) {
        setValues(previous)
        toast.error(r.error)
        return
      }
      // One switch changes per save: say which, and which way.
      const changed = (["healthEnabled", "roomsEnabled", "equipmentTabEnabled"] as const).find((k) => next[k] !== previous[k])
      if (changed) toast.success(`已${next[changed] ? "开启" : "关闭"}${FEATURE_NAMES[changed]}。`)
    })
  }

  const on = values.healthEnabled
  const roomsOn = values.roomsEnabled
  const equipmentTabOn = values.equipmentTabEnabled

  return (
    <div className="space-y-6">
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          健康
          {on ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}
        </CardTitle>
        <CardDescription>
          成员、供应商和保险，以及每个人的就诊、提醒、保修和健康记录。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={on}
            disabled={pending}
            onChange={(e) => save({ ...values, healthEnabled: e.target.checked })}
          />
          显示健康板块
        </label>
        <p className="ml-6 text-xs text-muted-foreground">
          关闭后，健康板块将从菜单、仪表盘、列表、搜索、通知和 AI 助手中消失。不会删除任何数据 — 重新开启后即可恢复。
        </p>
      </CardContent>
    </Card>

    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          房间
          {roomsOn ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}
        </CardTitle>
        <CardDescription>房产内的房间：油漆、地板、照片。</CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={roomsOn}
            disabled={pending}
            onChange={(e) => save({ ...values, roomsEnabled: e.target.checked })}
          />
          显示房间
        </label>
        <p className="ml-6 text-xs text-muted-foreground">
          关闭后，房间将从房产、设备和记录中消失。不会删除任何数据 — 重新开启后即可恢复。
        </p>
      </CardContent>
    </Card>

    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          设备标签页
          {equipmentTabOn ? <Badge variant="secondary">开启</Badge> : <Badge variant="outline">关闭</Badge>}
        </CardTitle>
        <CardDescription>在房产和各房间内列出并直接编辑设备。</CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={equipmentTabOn}
            disabled={pending}
            onChange={(e) => save({ ...values, equipmentTabEnabled: e.target.checked })}
          />
          在房产和房间页面显示设备标签页
        </label>
        <p className="ml-6 text-xs text-muted-foreground">
          关闭后，设备标签页将从房产和房间窗口中消失。设备本身不受影响，仍可从设备页面访问。
        </p>
      </CardContent>
    </Card>

    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>安装为应用</CardTitle>
        <CardDescription>
          将 HomeCenter 添加到 iPhone、iPad 或手机主屏幕，像应用一样打开。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <Link href="/settings/install" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          安装方法 →
        </Link>
      </CardContent>
    </Card>
    </div>
  )
}
