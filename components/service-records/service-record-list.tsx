"use client"

import { Fragment, useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronDown, Pencil, Trash2 } from "lucide-react"
import { deleteServiceRecord } from "@/lib/actions/service-records"
import { ServiceRecordFormDialog } from "./service-record-form-dialog"
import { AddSplitButton } from "@/components/inbox/add-split-button"
import { useFormat } from "@/components/regional-provider"
import { emptyStateCopy } from "@/lib/intake-ui"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { SortableTableHead } from "@/components/ui/sortable-table-head"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { useClientTable, type Accessor } from "@/lib/use-client-table"
import type { SortDir } from "@/lib/table-params"
import { ScopeToggle } from "@/components/rooms/scope-toggle"
import { scopeRecords, type HistoryScope } from "@/lib/rooms"
import type { Attachment,ServiceRecord, MeterUnit, AssetType } from "@/app/generated/prisma/client"
import type { RoomOption } from "@/lib/rooms-server"

type RecordWithAttachments = ServiceRecord & { attachments: Attachment[] }

// Module scope on purpose — a new object each render would re-sort every render.
const ACCESSORS: Record<string, Accessor<RecordWithAttachments>> = {
  date: (r) => new Date(r.date).getTime(),
  title: (r) => r.title,
  cost: (r) => r.cost,
  mileage: (r) => r.mileageAtService,
}

const INITIAL_DIRS: Record<string, SortDir> = { date: "desc", cost: "desc", mileage: "desc" }

interface Props {
  records: RecordWithAttachments[]
  assetId: string
  assetType: AssetType
  /** Property's equipment, for the Source column and the "For" picker when adding/editing. */
  equipment?: { id: string; name: string; roomId: string | null }[]
  propertyName?: string
  /** Rooms of the property, for the room select and the rows' room badges. Empty with Rooms off. */
  roomOptions?: RoomOption[]
  /** A new record's room (on an equipment page: the equipment's own). */
  defaultRoomId?: string | null
  /** Vehicle's odometer unit, for the Mileage column header/suffix. Defaults to miles. */
  meterUnit?: MeterUnit
  /** People only: the provider directory and this person's conditions. */
  providerOptions?: { id: string; name: string }[]
  conditionOptions?: { id: string; name: string }[]
  /** Active reminders a new record can mark complete. */
  reminders?: { id: string; title: string; assetType: AssetType; assetId: string }[]
  openId?: string
  /** Property only: show a "this property / with its equipment" filter, labelled as given. */
  scopeToggle?: { ownLabel: string; withLabel: string }
}

export function ServiceRecordList({ records: initialRecords, assetId, assetType, equipment, propertyName, roomOptions = [], defaultRoomId, meterUnit = "MILES", providerOptions, conditionOptions, reminders, openId, scopeToggle }: Props) {
  const fmt = useFormat()
  const isPerson = assetType === "PERSON"
  const equipmentNames = equipment ? Object.fromEntries(equipment.map((e) => [e.id, e.name])) : undefined
  const roomNames: Record<string, string> = Object.fromEntries(roomOptions.map((r) => [r.id, r.name]))
  const [records, setRecords] = useState(initialRecords)
  const [prevInitialRecords, setPrevInitialRecords] = useState(initialRecords)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (initialRecords !== prevInitialRecords) {
    setPrevInitialRecords(initialRecords)
    setRecords(initialRecords)
  }

  const [prevOpenId, setPrevOpenId] = useState<string | undefined>(undefined)
  if (openId !== prevOpenId) {
    setPrevOpenId(openId)
    // "new" opens a blank form: the Records page sends people here to add one.
    if (openId === "new") { setEditingId(null); setDialogOpen(true) }
    else if (openId && initialRecords.some((r) => r.id === openId)) { setEditingId(openId); setDialogOpen(true) }
  }

  const [scope, setScope] = useState<HistoryScope>("withEquipment")
  // Memoized: the table re-sorts whenever its rows array changes identity.
  const scopedRecords = useMemo(
    () => (scopeToggle ? scopeRecords(records, scope, { assetType: "PROPERTY", assetId }) : records),
    [records, scope, scopeToggle, assetId],
  )

  const table = useClientTable({
    rows: scopedRecords,
    accessors: ACCESSORS,
    defaultSort: "date",
    defaultDir: "desc",
    initialDirs: INITIAL_DIRS,
  })

  const editing = editingId ? records.find((r) => r.id === editingId) ?? null : null
  const showSource = !!equipmentNames
  const isProperty = assetType === "PROPERTY"
  // The property listing trades Notes for Room (the dialog still shows notes).
  const showNotes = !isProperty
  const showRoom = isProperty && roomOptions.length > 0
  const equipmentRooms = equipment ? Object.fromEntries(equipment.map((e) => [e.id, e.roomId])) : {}
  const columnCount = 5 + (assetType === "VEHICLE" ? 1 : 0) + (showSource ? 1 : 0) + (showNotes ? 1 : 0) + (showRoom ? 1 : 0)

  const handleAttachmentDeleted = useCallback((recordId: string, attachmentId: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? { ...r, attachments: r.attachments.filter((a) => a.id !== attachmentId) }
          : r
      )
    )
  }, [])

  async function handleDelete(record: ServiceRecord) {
    if (!confirm(`删除“${record.title}”？`)) return
    await deleteServiceRecord(record.id, record.assetType, record.assetId)
    toast.success("记录已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">{scopedRecords.length} {isPerson ? "次就诊" : "条记录"}</p>
          {scopeToggle && <ScopeToggle scope={scope} onChange={(s) => { setScope(s); table.setPage(1) }} ownLabel={scopeToggle.ownLabel} withLabel={scopeToggle.withLabel} />}
        </div>
        <AddSplitButton
          label={isPerson ? "添加就诊" : "添加记录"}
          menuLabel={isPerson ? "更多添加就诊的方式" : "更多添加记录的方式"}
          onAdd={() => { setEditingId(null); setDialogOpen(true) }}
          asset={{ assetType, assetId }}
        />
      </div>

      {scopedRecords.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyStateCopy(isPerson ? "visits" : "service")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="date" label="日期" sortState={table.sortState} onToggle={table.toggleSort} />
                <SortableTableHead column="title" label="标题" sortState={table.sortState} onToggle={table.toggleSort} />
                {showNotes && <TableHead>备注</TableHead>}
                {showSource && <TableHead>来源</TableHead>}
                {showRoom && <TableHead>房间</TableHead>}
                <SortableTableHead column="cost" label="费用" sortState={table.sortState} onToggle={table.toggleSort} />
                {assetType === "VEHICLE" && (
                  <SortableTableHead column="mileage" label={fmt.meterNoun(meterUnit)} sortState={table.sortState} onToggle={table.toggleSort} />
                )}
                <TableHead>文件</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((record) => {
                const expanded = expandedId === record.id
                const isForeign = showSource && record.assetType !== assetType
                // A record's own room, else the room its equipment sits in.
                const roomId = record.roomId ?? (record.assetType === "EQUIPMENT" ? equipmentRooms[record.assetId] : null)
                const roomName = roomId ? roomNames[roomId] : undefined
                return (
                  <Fragment key={record.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => { setEditingId(record.id); setDialogOpen(true) }}
                    >
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {fmt.date(record.date, { utc: true })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{record.title}</span>
                          {!showRoom && record.roomId && roomNames[record.roomId] && <Badge variant="outline" className="text-xs">{roomNames[record.roomId]}</Badge>}
                        </div>
                        {record.vendor && <div className="text-xs text-muted-foreground">{record.vendor}</div>}
                      </TableCell>
                      {showNotes && (
                        <TableCell className="max-w-[220px]">
                          {record.description ? (
                            <Tooltip>
                              <TooltipTrigger className="block w-full truncate border-0 bg-transparent p-0 text-left text-muted-foreground">
                                {record.description}
                              </TooltipTrigger>
                              <TooltipContent align="start" className="whitespace-pre-wrap">{record.description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {showSource && (
                        <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {isForeign ? (
                            <Link
                              href={`/assets/equipment/${record.assetId}`}
                              className="text-sm hover:underline"
                            >
                              {equipmentNames?.[record.assetId] ?? "设备"}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">房产</span>
                          )}
                        </TableCell>
                      )}
                      {showRoom && (
                        <TableCell className="whitespace-nowrap text-sm">
                          {roomName ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">
                        {record.cost != null ? fmt.money(record.cost) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {assetType === "VEHICLE" && (
                        <TableCell className="whitespace-nowrap">
                          {record.mileageAtService != null ? `${record.mileageAtService.toLocaleString()} ${fmt.meterShort(meterUnit)}` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <AttachmentCount
                          attachments={record.attachments}
                          onClick={() => setExpandedId(expanded ? null : record.id)}
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`编辑“${record.title}”`}
                            onClick={() => { setEditingId(record.id); setDialogOpen(true) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`删除“${record.title}”`}
                            onClick={() => handleDelete(record)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={expanded ? "隐藏附件" : "显示附件"} aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : record.id)}>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columnCount} className="bg-muted/30 whitespace-normal">
                          <AttachmentList
                            recordId={record.id}
                            recordType="SERVICE"
                            attachments={record.attachments}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>

          <PaginationBar
            page={table.page}
            pageCount={table.pageCount}
            total={table.total}
            per={table.per}
            onPage={table.setPage}
            onPer={table.setPer}
            label="记录"
          />
        </div>
      )}

      <ServiceRecordFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        assetId={assetId}
        assetType={assetType}
        record={editing}
        attachments={editing?.attachments ?? []}
        onAttachmentDeleted={handleAttachmentDeleted}
        equipmentOptions={equipment}
        propertyName={propertyName}
        roomOptions={roomOptions}
        defaultRoomId={defaultRoomId}
        meterUnit={meterUnit}
        providerOptions={providerOptions}
        conditionOptions={conditionOptions}
        reminderOptions={reminders}
      />
    </>
  )
}
