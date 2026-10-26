"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveRegionalSettings } from "@/lib/actions/regional-settings"
import { COMMON_CURRENCIES, createFormatter, type Regional } from "@/lib/regional"

const DATE_FORMATS = ["MDY_SHORT", "DMY_SHORT", "MDY_NUM", "DMY_NUM", "ISO"] as const

const DISTANCE_LABELS: Record<Regional["distanceUnit"], string> = { MILES: "英里（mi）", KM: "千米（km）" }
const AREA_LABELS: Record<Regional["areaUnit"], string> = { SQFT: "平方英尺（ft²）", SQM: "平方米（m²）" }

function currencyOptions(): string[] {
  const all = Intl.supportedValuesOf("currency")
  return [...COMMON_CURRENCIES, ...all.filter((c) => !COMMON_CURRENCIES.includes(c))]
}

export function RegionalSettingsForm({ initial }: { initial: Regional }) {
  const [value, setValue] = useState<Regional>(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const preview = useMemo(() => createFormatter(value), [value])
  const now = useMemo(() => new Date(), [])
  const currencies = useMemo(() => currencyOptions(), [])
  const set = <K extends keyof Regional>(k: K, v: Regional[K]) => setValue((p) => ({ ...p, [k]: v }))
  const currencyLabel = (code: string) => `${code} (${createFormatter({ ...value, currency: code }).currencySymbol})`
  const dateLabel = (f: Regional["dateFormat"]) => createFormatter({ ...value, dateFormat: f }).date(now)

  const save = () =>
    start(async () => {
      const r = await saveRegionalSettings(value)
      setError("error" in r ? r.error : null)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success("区域设置已保存。")
    })

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>区域</CardTitle>
        <CardDescription>全站使用的货币、单位以及日期和时间的书写方式。</CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-4">
        <div className="space-y-1.5">
          <Label>货币</Label>
          <Select value={value.currency} onValueChange={(v) => v && set("currency", v)}>
            <SelectTrigger className="w-full sm:w-64" disabled={pending}>
              <SelectValue suppressHydrationWarning>{(v: string) => currencyLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>{currencyLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>距离</Label>
          <Select value={value.distanceUnit} onValueChange={(v) => v && set("distanceUnit", v)}>
            <SelectTrigger className="w-full sm:w-64" disabled={pending}>
              <SelectValue>{(v: Regional["distanceUnit"]) => DISTANCE_LABELS[v]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MILES">{DISTANCE_LABELS.MILES}</SelectItem>
              <SelectItem value="KM">{DISTANCE_LABELS.KM}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>面积</Label>
          <Select value={value.areaUnit} onValueChange={(v) => v && set("areaUnit", v)}>
            <SelectTrigger className="w-full sm:w-64" disabled={pending}>
              <SelectValue>{(v: Regional["areaUnit"]) => AREA_LABELS[v]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SQFT">{AREA_LABELS.SQFT}</SelectItem>
              <SelectItem value="SQM">{AREA_LABELS.SQM}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">更改单位只会改变已有数值的显示方式，不会进行换算。</p>
        </div>

        <div className="space-y-1.5">
          <Label>日期格式</Label>
          <Select value={value.dateFormat} onValueChange={(v) => v && set("dateFormat", v)}>
            <SelectTrigger className="w-full sm:w-64" disabled={pending}>
              <SelectValue>{(v: Regional["dateFormat"]) => dateLabel(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((f) => (
                <SelectItem key={f} value={f} suppressHydrationWarning>{dateLabel(f)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={!value.hour12}
            disabled={pending}
            onChange={(e) => set("hour12", !e.target.checked)}
          />
          24 小时制
        </label>

        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          预览：{preview.money(1234.56)} · {(12345).toLocaleString()} {preview.distanceShort} · {preview.area(1200)} · {preview.dateTime(now)}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={save} disabled={pending}>{pending ? "保存中…" : "保存"}</Button>
      </CardContent>
    </Card>
  )
}
