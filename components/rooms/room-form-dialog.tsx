"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { useFormat } from "@/components/regional-provider"
import { useDropTarget } from "@/components/drop/drop-provider"
import { createRoom, updateRoom, deleteRoom } from "@/lib/actions/rooms"
import { FLOORING_SUGGESTIONS, PAINT_SURFACES, type RoomInput } from "@/lib/rooms"
import { uploadAll } from "@/lib/upload-client"
import { Plus, Trash2 } from "lucide-react"
import { RoomEquipment, RoomFiles, RoomReminders, RoomServiceRecords, StagedFiles } from "./room-panels"
import { ServiceRecordFormDialog } from "@/components/service-records/service-record-form-dialog"
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog"
import type { RoomOption } from "@/lib/rooms-server"
import type { AssetType } from "@/app/generated/prisma/client"
import type { RoomSchedule, RoomServiceRecord, RoomWithDetails } from "./room-list"

const paintSchema = z
  .object({ surface: z.string(), brand: z.string(), colorName: z.string(), colorCode: z.string(), finish: z.string() })
  .refine((p) => p.surface.trim() || !(p.brand.trim() || p.colorName.trim() || p.colorCode.trim() || p.finish.trim()), {
    message: "请选择涂刷表面",
    path: ["surface"],
  })

const schema = z.object({
  propertyId: z.string(),
  name: z.string().trim().min(1, "请填写名称"),
  level: z.string(),
  area: z.string(),
  dimensions: z.string(),
  flooringType: z.string(),
  flooringProduct: z.string(),
  flooringInstalled: z.string(),
  notes: z.string(),
  paints: z.array(paintSchema),
})

type FormValues = z.infer<typeof schema>
type Paint = FormValues["paints"][number]

const FIELDS = ["name", "level", "area", "dimensions", "flooringType", "flooringProduct", "flooringInstalled", "notes", "paints"] as const

function toValues(propertyId: string, room: RoomWithDetails | null): FormValues {
  return {
    propertyId,
    name: room?.name ?? "",
    level: room?.level ?? "",
    area: room?.area?.toString() ?? "",
    dimensions: room?.dimensions ?? "",
    flooringType: room?.flooringType ?? "",
    flooringProduct: room?.flooringProduct ?? "",
    flooringInstalled: room?.flooringInstalled ? new Date(room.flooringInstalled).toISOString().split("T")[0] : "",
    notes: room?.notes ?? "",
    paints: (room?.paints ?? []).map((p) => ({ surface: p.surface, brand: p.brand ?? "", colorName: p.colorName ?? "", colorCode: p.colorCode ?? "", finish: p.finish ?? "" })),
  }
}

const isBlank = (p: Paint) => !(p.surface.trim() || p.brand.trim() || p.colorName.trim() || p.colorCode.trim() || p.finish.trim())

interface Props {
  open: boolean
  onClose: () => void
  propertyId: string
  /** null adds a room. */
  room: RoomWithDetails | null
  serviceRecords: RoomServiceRecord[]
  schedules: RoomSchedule[]
  propertyName: string
  /** The property's rooms: location suggestions in the equipment dialog, the room select in the record dialog. */
  roomOptions: RoomOption[]
  propertyEquipment: { id: string; name: string; roomId: string | null }[]
  reminderOptions: { id: string; title: string; assetType: AssetType; assetId: string }[]
  showEquipment: boolean
}

export function RoomFormDialog({ open, onClose, propertyId, room, serviceRecords, schedules, propertyName, roomOptions, propertyEquipment, reminderOptions, showEquipment }: Props) {
  const [filePickerOpen, setFilePickerOpen] = useState(false)

  // The native OS file picker moves focus outside the dialog's DOM, which would
  // otherwise trigger Base UI's modal focus-out dismissal and close the dialog
  // before the file selection is even processed.
  function openFilePicker(input: HTMLInputElement | null) {
    setFilePickerOpen(true)
    window.addEventListener("focus", () => setFilePickerOpen(false), { once: true })
    input?.click()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} disablePointerDismissal={filePickerOpen}>
      {/* An existing room has tabs of different lengths: a fixed height keeps the dialog from resizing as you switch. */}
      <DialogContent className={room ? "h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-5xl" : "sm:max-w-5xl max-h-[90vh] overflow-y-auto"}>
        {/* Keyed so the form, tab and staged files start fresh for each room. */}
        <RoomDialogBody
          key={room?.id ?? "new"}
          open={open}
          onClose={onClose}
          propertyId={propertyId}
          room={room}
          serviceRecords={serviceRecords}
          schedules={schedules}
          propertyName={propertyName}
          roomOptions={roomOptions}
          propertyEquipment={propertyEquipment}
          reminderOptions={reminderOptions}
          showEquipment={showEquipment}
          openFilePicker={openFilePicker}
        />
      </DialogContent>
    </Dialog>
  )
}

function RoomDialogBody({ open, onClose, propertyId, room, serviceRecords, schedules, propertyName, roomOptions, propertyEquipment, reminderOptions, showEquipment, openFilePicker }: Props & { openFilePicker: (input: HTMLInputElement | null) => void }) {
  const fmt = useFormat()
  const router = useRouter()
  const [tab, setTab] = useState("details")
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // "new" adds to this room; an id edits that item. Looked up per render so a refresh shows saved data.
  // The target outlives `open` so the dialog keeps its content while it fades out.
  const [equipmentDialog, setEquipmentDialog] = useState<"new" | string>("new")
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  // Same pattern for the service record dialog.
  const [recordTarget, setRecordTarget] = useState<"new" | string>("new")
  const [recordOpen, setRecordOpen] = useState(false)
  const editingRecord = recordTarget !== "new" ? serviceRecords.find((r) => r.id === recordTarget) ?? null : null
  const stagedInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(propertyId, room) })
  const paints = useFieldArray({ control: form.control, name: "paints" })

  async function uploadNow(files: File[]) {
    if (!room || files.length === 0) return
    setUploading(true)
    const failure = await uploadAll(files, "ROOM", room.id)
    setUploading(false)
    if (failure) toast.error(failure)
    else toast.success(files.length === 1 ? `已上传“${files[0].name}”。` : `已上传 ${files.length} 个文件。`)
    router.refresh()
  }

  // A file dropped anywhere while this is open: straight onto an existing room, or queued for a new one.
  useDropTarget({
    label: "添加到本房间的文件",
    onFiles: (files) => (room ? void uploadNow(files) : setStagedFiles((prev) => [...prev, ...files])),
    enabled: open,
  })

  function addPaint() {
    const used = new Set(form.getValues("paints").map((p) => p.surface))
    paints.append({ surface: PAINT_SURFACES.find((s) => !used.has(s)) ?? "", brand: "", colorName: "", colorCode: "", finish: "" })
  }

  async function onSubmit(values: FormValues) {
    const payload: RoomInput = { ...values, paints: values.paints.filter((p) => !isBlank(p)) }
    const existingId = room?.id ?? createdRoomId
    const result = existingId ? await updateRoom(existingId, payload) : await createRoom(payload)

    if (result.error) {
      if (typeof result.error === "string") { toast.error(result.error); return }
      for (const field of FIELDS) {
        const message = result.error[field]?.[0]
        if (message) form.setError(field, { message })
      }
      toast.error("请修正错误后重试。")
      return
    }

    const roomId = existingId ?? ("id" in result && typeof result.id === "string" ? result.id : undefined)
    if (roomId && !existingId) setCreatedRoomId(roomId)

    if (stagedFiles.length > 0 && roomId) {
      const failure = await uploadAll(stagedFiles, "ROOM", roomId)
      if (failure) {
        // Keep the queue so Save retries the uploads against the room just created.
        toast.error(failure)
        router.refresh()
        return
      }
    }

    toast.success(room ? "房间已更新。" : "房间已添加。")
    router.refresh()
    onClose()
  }

  async function handleDelete() {
    if (!room) return
    if (!confirm(`删除房间“${room.name}”？关联的设备会保留该房间名称作为位置。`)) return
    const result = await deleteRoom(room.id)
    if (result?.error) { toast.error(result.error); return }
    toast.success("房间已删除。")
    router.refresh()
    onClose()
  }

  const details = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>名称 *</FormLabel>
              <FormControl><Input placeholder="厨房" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="level" render={({ field }) => (
            <FormItem>
              <FormLabel>楼层</FormLabel>
              <FormControl><Input placeholder="一层" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="area" render={({ field }) => (
            <FormItem>
              <FormLabel>{fmt.areaLabel}</FormLabel>
              <FormControl><Input type="number" step="any" min="0" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="dimensions" render={({ field }) => (
            <FormItem>
              <FormLabel>尺寸</FormLabel>
              <FormControl><Input placeholder={`14 × 16 ${fmt.areaShort === "m²" ? "m" : "ft"}`} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="flooringType" render={({ field }) => (
            <FormItem>
              <FormLabel>地面</FormLabel>
              <FormControl><Input list="room-flooring-suggestions" autoComplete="off" placeholder="实木地板" {...field} /></FormControl>
              <datalist id="room-flooring-suggestions">
                {FLOORING_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="flooringProduct" render={({ field }) => (
            <FormItem>
              <FormLabel>地面材料</FormLabel>
              <FormControl><Input placeholder="品牌、产品、颜色" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="flooringInstalled" render={({ field }) => (
            <FormItem>
              <FormLabel>地面铺设日期</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">涂料</span>
            <Button type="button" variant="outline" size="sm" onClick={addPaint}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 添加涂料
            </Button>
          </div>
          <datalist id="room-paint-surfaces">
            {PAINT_SURFACES.map((s) => <option key={s} value={s} />)}
          </datalist>
          {paints.fields.length === 0 && <p className="text-sm text-muted-foreground">暂无涂料颜色。</p>}
          {paints.fields.map((row, index) => (
            <div key={row.id} className="grid grid-cols-2 items-start gap-2 rounded-md border p-2 sm:grid-cols-[8rem_1fr_1fr_6rem_6rem_auto]">
              <FormField control={form.control} name={`paints.${index}.surface`} render={({ field }) => (
                <FormItem>
                  <FormControl><Input list="room-paint-surfaces" autoComplete="off" placeholder="表面" aria-label="表面" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name={`paints.${index}.brand`} render={({ field }) => (
                <FormItem><FormControl><Input placeholder="品牌" aria-label="品牌" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={`paints.${index}.colorName`} render={({ field }) => (
                <FormItem><FormControl><Input placeholder="颜色名称" aria-label="颜色名称" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={`paints.${index}.colorCode`} render={({ field }) => (
                <FormItem><FormControl><Input placeholder="色号" aria-label="色号" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={`paints.${index}.finish`} render={({ field }) => (
                <FormItem><FormControl><Input placeholder="光泽" aria-label="光泽" {...field} /></FormControl></FormItem>
              )} />
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="移除涂料" onClick={() => paints.remove(index)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>备注</FormLabel>
            <FormControl><Textarea rows={3} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {!room && (
          <StagedFiles
            files={stagedFiles}
            inputRef={stagedInputRef}
            onPick={() => openFilePicker(stagedInputRef.current)}
            onAdd={(files) => setStagedFiles((prev) => [...prev, ...files])}
            onRemove={(index) => setStagedFiles((prev) => prev.filter((_, i) => i !== index))}
          />
        )}

        <DialogFooter className="sm:justify-between">
          {room ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> 删除房间
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "保存中…" : room ? "保存更改" : "添加房间"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>{room ? room.name : "添加房间"}</DialogTitle>
      </DialogHeader>
      {room ? (
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="min-h-0 flex-col">
          <TabsList variant="line" className="w-full justify-start border-b">
            <TabsTrigger value="details">详情</TabsTrigger>
            <TabsTrigger value="service">维护记录</TabsTrigger>
            {showEquipment && <TabsTrigger value="equipment">设备（{room.equipment.length}）</TabsTrigger>}
            <TabsTrigger value="reminders">维护提醒</TabsTrigger>
            <TabsTrigger value="files">文件（{room.attachments.length}）</TabsTrigger>
          </TabsList>
          {/* keepMounted so unsaved Details edits survive a look at another tab. */}
          <TabsContent value="details" keepMounted className="mt-4 min-h-0 overflow-y-auto">{details}</TabsContent>
          <TabsContent value="service" className="mt-4 min-h-0 overflow-y-auto">
            <RoomServiceRecords
              room={room}
              serviceRecords={serviceRecords}
              onAdd={() => { setRecordTarget("new"); setRecordOpen(true) }}
              onEdit={(r) => { setRecordTarget(r.id); setRecordOpen(true) }}
            />
          </TabsContent>
          {showEquipment && (
            <TabsContent value="equipment" className="mt-4 min-h-0 overflow-y-auto"><RoomEquipment room={room} onAdd={() => { setEquipmentDialog("new"); setEquipmentOpen(true) }} onEdit={(e) => { setEquipmentDialog(e.id); setEquipmentOpen(true) }} /></TabsContent>
          )}
          <TabsContent value="reminders" className="mt-4 min-h-0 overflow-y-auto">
            <RoomReminders room={room} schedules={schedules} />
          </TabsContent>
          <TabsContent value="files" className="mt-4 min-h-0 overflow-y-auto">
            <RoomFiles room={room} uploading={uploading} onUpload={uploadNow} onPick={openFilePicker} onChanged={() => router.refresh()} />
          </TabsContent>
        </Tabs>
      ) : details}
      {room && (
        // Stacked over this dialog like the equipment one: the user stays on the page. A new record starts in this room.
        <ServiceRecordFormDialog
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          assetId={propertyId}
          assetType="PROPERTY"
          record={editingRecord}
          attachments={editingRecord?.attachments ?? []}
          equipmentOptions={propertyEquipment}
          propertyName={propertyName}
          roomOptions={roomOptions}
          defaultRoomId={room.id}
          reminderOptions={reminderOptions}
        />
      )}
      {room && showEquipment && (
        // Stacked over this dialog, so the user stays on the page; the location starts as this room.
        <EquipmentFormDialog
          open={equipmentOpen}
          onClose={() => setEquipmentOpen(false)}
          equipment={equipmentDialog !== "new" ? room.equipment.find((e) => e.id === equipmentDialog) ?? null : null}
          properties={[{ id: propertyId, name: propertyName, rooms: roomOptions }]}
          defaultPropertyId={propertyId}
          defaultLocation={room.name}
        />
      )}
    </>
  )
}
