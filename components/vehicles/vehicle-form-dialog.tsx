"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createVehicle, updateVehicle } from "@/lib/actions/vehicles"
import { AddRemindersSubmit, remindersHref } from "@/components/maintenance/add-reminders-submit"
import type { Vehicle } from "@/app/generated/prisma/client"
import { useFormat } from "@/components/regional-provider"

const schema = z.object({
  name: z.string().min(1, "名称必填"),
  make: z.string().min(1, "品牌必填"),
  model: z.string().min(1, "型号必填"),
  year: z.string().min(1, "年份必填"),
  vin: z.string().optional(),
  color: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.string().optional(),
  currentMileage: z.string().optional(),
  meterUnit: z.enum(["MILES", "HOURS"]),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  vehicle?: Vehicle | null
}

export function VehicleFormDialog({ open, onClose, vehicle }: Props) {
  const router = useRouter()
  const fmt = useFormat()
  const milesLabel = fmt.distanceWords.charAt(0).toUpperCase() + fmt.distanceWords.slice(1)
  const meterUnitLabels: Record<string, string> = { MILES: milesLabel, HOURS: "小时" }
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", make: "", model: "", year: new Date().getFullYear().toString(),
      vin: "", color: "", purchaseDate: "", purchasePrice: "", currentMileage: "", meterUnit: "MILES", notes: "",
    },
  })

  useEffect(() => {
    if (vehicle) {
      form.reset({
        name: vehicle.name,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year.toString(),
        vin: vehicle.vin ?? "",
        color: vehicle.color ?? "",
        purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split("T")[0] : "",
        purchasePrice: vehicle.purchasePrice?.toString() ?? "",
        currentMileage: vehicle.currentMileage?.toString() ?? "",
        meterUnit: vehicle.meterUnit,
        notes: vehicle.notes ?? "",
      })
    } else {
      form.reset({
        name: "", make: "", model: "", year: new Date().getFullYear().toString(),
        vin: "", color: "", purchaseDate: "", purchasePrice: "", currentMileage: "", meterUnit: "MILES", notes: "",
      })
    }
  }, [vehicle, open, form])

  async function onSubmit(values: FormValues, then: "close" | "reminders" = "close") {
    const result = vehicle
      ? await updateVehicle(vehicle.id, values as unknown as Parameters<typeof updateVehicle>[1])
      : await createVehicle(values as unknown as Parameters<typeof createVehicle>[0])

    if (result?.error) {
      toast.error("请修正错误后重试。")
      return
    }
    toast.success(vehicle ? "车辆已更新。" : "车辆已添加。")
    onClose()
    if (then === "reminders" && result && "id" in result && typeof result.id === "string") router.push(remindersHref("VEHICLE", result.id))
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "编辑车辆" : "添加车辆"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>昵称 *</FormLabel>
                  <FormControl><Input placeholder="家用 SUV" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel>年份 *</FormLabel>
                  <FormControl><Input type="number" placeholder="2022" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="make" render={({ field }) => (
                <FormItem>
                  <FormLabel>品牌 *</FormLabel>
                  <FormControl><Input placeholder="Toyota" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>型号 *</FormLabel>
                  <FormControl><Input placeholder="RAV4" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem>
                  <FormLabel>颜色</FormLabel>
                  <FormControl><Input placeholder="银色" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="purchaseDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>购买日期</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>{`购买价格（${fmt.currencySymbol}）`}</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="28500" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="currentMileage" render={({ field }) => (
                <FormItem>
                  <FormLabel>当前{fmt.meterNoun(form.watch("meterUnit"))}</FormLabel>
                  <FormControl><Input type="number" placeholder={form.watch("meterUnit") === "HOURS" ? "1250" : "45000"} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="meterUnit" render={({ field }) => (
                <FormItem>
                  <FormLabel>计量单位</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue>{(v: string) => meterUnitLabels[v] ?? v}</SelectValue></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="MILES">{milesLabel}</SelectItem>
                      <SelectItem value="HOURS">小时</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="vin" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>VIN</FormLabel>
                  <FormControl><Input placeholder="1HGCM82633A123456" className="font-mono text-sm" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>备注</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              {!vehicle && <AddRemindersSubmit pending={form.formState.isSubmitting} onClick={form.handleSubmit((v) => onSubmit(v, "reminders"))} />}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "保存中…" : vehicle ? "保存更改" : "添加车辆"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
