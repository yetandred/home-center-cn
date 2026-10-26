"use client"

import { useFormat } from "@/components/regional-provider"
import { Fragment, useCallback, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AddSplitButton } from "@/components/inbox/add-split-button"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronDown, Pencil, Trash2 } from "lucide-react"
import { deleteWarranty } from "@/lib/actions/warranties"
import { WarrantyFormDialog } from "./warranty-form-dialog"
import { AttachmentList } from "@/components/attachments/attachment-list"
import { AttachmentCount } from "@/components/attachments/attachment-count"
import { SortableTableHead } from "@/components/ui/sortable-table-head"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { useClientTable, type Accessor } from "@/lib/use-client-table"
import type { SortDir } from "@/lib/table-params"
import type { Attachment, Warranty, AssetType } from "@/app/generated/prisma/client"

type WarrantyWithAttachments = Warranty & { attachments: Attachment[] }

// Status is derived from expirationDate and shares its ordering, so both tokens
// read the same value.
const ACCESSORS: Record<string, Accessor<WarrantyWithAttachments>> = {
  product: (w) => w.productName,
  purchased: (w) => (w.purchaseDate ? new Date(w.purchaseDate).getTime() : null),
  expires: (w) => (w.expirationDate ? new Date(w.expirationDate).getTime() : null),
  status: (w) => (w.expirationDate ? new Date(w.expirationDate).getTime() : null),
}

const INITIAL_DIRS: Record<string, SortDir> = { purchased: "desc" }

interface Props {
  warranties: WarrantyWithAttachments[]
  assetId: string
  assetType: AssetType
  /** Property's equipment, for the Source column and the "For" picker when adding/editing. */
  equipment?: { id: string; name: string }[]
  propertyName?: string
  openId?: string
}

function warrantyStatus(expirationDate: Date | null) {
  if (!expirationDate) return null
  // Same -0 guard as the global warranties page: Math.ceil of a small negative
  // is -0, which is not < 0, so a warranty that lapsed hours ago would show
  // "0d left" instead of "Expired".
  const ms = new Date(expirationDate).getTime() - Date.now()
  if (ms < 0) return { label: "已过期", variant: "destructive" as const }
  const daysLeft = Math.ceil(ms / 86400000)
  if (daysLeft <= 60) return { label: `剩余 ${daysLeft} 天`, variant: "secondary" as const }
  return { label: "生效中", variant: "outline" as const }
}

export function WarrantyList({ warranties: initialWarranties, assetId, assetType, equipment, propertyName, openId }: Props) {
  const fmt = useFormat()
  const [warranties, setWarranties] = useState(initialWarranties)
  const [prevInitialWarranties, setPrevInitialWarranties] = useState(initialWarranties)
  const [editing, setEditing] = useState<WarrantyWithAttachments | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [prevOpenId, setPrevOpenId] = useState<string | undefined>(undefined)
  if (openId !== prevOpenId) {
    setPrevOpenId(openId)
    const match = openId ? initialWarranties.find((w) => w.id === openId) : undefined
    if (match) { setEditing(match); setDialogOpen(true) }
  }

  if (initialWarranties !== prevInitialWarranties) {
    setPrevInitialWarranties(initialWarranties)
    setWarranties(initialWarranties)
  }

  const table = useClientTable({
    rows: warranties,
    accessors: ACCESSORS,
    defaultSort: "expires",
    defaultDir: "asc",
    initialDirs: INITIAL_DIRS,
  })

  const showSource = !!equipment
  const equipmentNames = equipment ? Object.fromEntries(equipment.map((e) => [e.id, e.name])) : undefined
  const columnCount = 7 + (showSource ? 1 : 0)

  const handleAttachmentDeleted = useCallback((warrantyId: string, attachmentId: string) => {
    setWarranties((prev) =>
      prev.map((w) =>
        w.id === warrantyId
          ? { ...w, attachments: w.attachments.filter((a) => a.id !== attachmentId) }
          : w
      )
    )
  }, [])

  async function handleDelete(w: Warranty) {
    if (!confirm(`删除“${w.productName}”的保修？`)) return
    await deleteWarranty(w.id, w.assetType, w.assetId)
    toast.success("保修已删除。")
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{warranties.length} 项保修</p>
        <AddSplitButton
          label="添加保修"
          menuLabel="更多添加保修的方式"
          fromFileLabel="从收据或保修卡…"
          onAdd={() => { setEditing(null); setDialogOpen(true) }}
          asset={{ assetType, assetId }}
        />
      </div>

      {warranties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          暂无保修。
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="product" label="产品" sortState={table.sortState} onToggle={table.toggleSort} />
                <TableHead>备注</TableHead>
                {showSource && <TableHead>来源</TableHead>}
                <SortableTableHead column="purchased" label="购买日期" sortState={table.sortState} onToggle={table.toggleSort} />
                <SortableTableHead column="expires" label="到期日期" sortState={table.sortState} onToggle={table.toggleSort} />
                <SortableTableHead column="status" label="状态" sortState={table.sortState} onToggle={table.toggleSort} />
                <TableHead>文件</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((w) => {
                const status = warrantyStatus(w.expirationDate)
                const expanded = expandedId === w.id
                return (
                  <Fragment key={w.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => { setEditing(w); setDialogOpen(true) }}
                    >
                      <TableCell>
                        <div className="font-medium">{w.productName}</div>
                        {w.vendor && <div className="text-xs text-muted-foreground">{w.vendor}</div>}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {w.notes ? (
                          <Tooltip>
                            <TooltipTrigger className="block w-full truncate border-0 bg-transparent p-0 text-left text-muted-foreground">
                              {w.notes}
                            </TooltipTrigger>
                            <TooltipContent align="start" className="whitespace-pre-wrap">{w.notes}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {showSource && (
                        <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {w.assetType === "EQUIPMENT" ? (
                            <Link href={`/assets/equipment/${w.assetId}`} className="text-sm hover:underline">
                              {equipmentNames?.[w.assetId] ?? "设备"}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">房产</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {w.purchaseDate ? fmt.date(w.purchaseDate) : <span>—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {w.expirationDate ? fmt.date(w.expirationDate) : <span>—</span>}
                      </TableCell>
                      <TableCell>
                        {status && <Badge variant={status.variant}>{status.label}</Badge>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <AttachmentCount
                          attachments={w.attachments}
                          onClick={() => setExpandedId(expanded ? null : w.id)}
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`编辑“${w.productName}”的保修`}
                            onClick={() => { setEditing(w); setDialogOpen(true) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`删除“${w.productName}”的保修`}
                            onClick={() => handleDelete(w)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={expanded ? "隐藏详情" : "显示详情"} aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : w.id)}>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columnCount} className="bg-muted/30 whitespace-normal">
                          <div className="space-y-3">
                            {(w.vendorPhone || w.vendorEmail) && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                {w.vendorPhone && <span>电话：{w.vendorPhone}</span>}
                                {w.vendorEmail && <span>邮箱：{w.vendorEmail}</span>}
                              </div>
                            )}
                            <AttachmentList recordId={w.id} recordType="WARRANTY" attachments={w.attachments} />
                          </div>
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
            label="保修"
          />
        </div>
      )}

      <WarrantyFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        assetId={assetId}
        assetType={assetType}
        warranty={editing}
        attachments={editing?.attachments ?? []}
        onAttachmentDeleted={handleAttachmentDeleted}
        equipmentOptions={equipment}
        propertyName={propertyName}
      />
    </>
  )
}
