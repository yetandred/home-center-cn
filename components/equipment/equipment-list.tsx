"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, MapPin, Building2, Pencil, Trash2 } from "lucide-react"
import { deleteEquipment } from "@/lib/actions/equipment"
import { EquipmentFormDialog, type EquipmentWithRoom as Equipment } from "./equipment-form-dialog"
import { categoryLabel } from "./categories"
import { AssetCollection, type AssetColumn } from "@/components/assets/asset-collection"
import { AssetViewToggle } from "@/components/assets/asset-view-toggle"
import { useAssetView } from "@/components/assets/use-asset-view"
import type { Accessor } from "@/lib/use-client-table"
import type { AssetView } from "@/lib/asset-view"
import type { PropertyWithRooms } from "@/lib/rooms-server"
import { locationLabel } from "@/lib/rooms"

// Everything except `property`, whose value comes from the property lookup and
// so has to be built inside the component.
const BASE_ACCESSORS: Record<string, Accessor<Equipment>> = {
  name: (e) => e.name,
  category: (e) => categoryLabel(e.category),
  manufacturer: (e) => [e.manufacturer, e.modelNumber].filter(Boolean).join(" ") || null,
  location: (e) => locationLabel(e),
  serialNumber: (e) => e.serialNumber,
  purchaseDate: (e) => (e.purchaseDate ? new Date(e.purchaseDate).getTime() : null),
}

const INITIAL_DIRS = { purchaseDate: "desc" as const }

interface Props {
  equipment: Equipment[]
  properties: PropertyWithRooms[]
  initialView: AssetView
}

export function EquipmentList({ equipment, properties, initialView }: Props) {
  const router = useRouter()
  const [view, setView] = useAssetView("equipment", initialView)
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const propertyNames = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p.name])),
    [properties]
  )

  // Memoized because the sort in useClientTable keys off this object's identity.
  // Unassigned equipment yields null, which the sort puts last either way.
  const accessors = useMemo(
    () => ({
      ...BASE_ACCESSORS,
      property: (e: Equipment) => (e.propertyId ? propertyNames[e.propertyId] ?? null : null),
    }),
    [propertyNames]
  )

  // Depends on `properties`, so it can't sit at module scope like the others.
  const columns: AssetColumn<Equipment>[] = [
    { key: "name", label: "名称", cell: (e) => <span className="font-medium">{e.name}</span> },
    { key: "category", label: "分类", cell: (e) => <Badge variant="secondary" className="text-xs">{categoryLabel(e.category)}</Badge> },
    { key: "manufacturer", label: "品牌 / 型号", className: "text-muted-foreground", cell: (e) => [e.manufacturer, e.modelNumber].filter(Boolean).join(" ") || "—" },
    { key: "location", label: "位置", className: "text-muted-foreground", cell: (e) => locationLabel(e) ?? "—" },
    { key: "property", label: "房产", className: "text-muted-foreground", cell: (e) => (e.propertyId ? propertyNames[e.propertyId] ?? "—" : "—") },
    { key: "serialNumber", label: "序列号", className: "text-muted-foreground font-mono text-xs max-w-[160px] truncate", cell: (e) => e.serialNumber ?? "—" },
  ]

  function toCard(e: Equipment) {
    const location = locationLabel(e)
    return {
      name: e.name,
      badge: categoryLabel(e.category),
      subtitle: [e.manufacturer, e.modelNumber].filter(Boolean).join(" ") || null,
      meta: [
        ...(location ? [{ icon: MapPin, text: location }] : []),
        ...(e.propertyId && propertyNames[e.propertyId] ? [{ icon: Building2, text: propertyNames[e.propertyId] }] : []),
      ],
      mono: e.serialNumber ? `序列号：${e.serialNumber}` : null,
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`删除“${name}”？将同时删除所有关联记录。`)) return
    await deleteEquipment(id)
    toast.success(`“${name}”已删除。`)
  }

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(e: Equipment) { setEditing(e); setDialogOpen(true) }

  function renderActions(e: Equipment) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`“${e.name}”的更多操作`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted transition-colors"
          onClick={(evt) => evt.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(evt) => evt.stopPropagation()}>
          <DropdownMenuItem onClick={() => openEdit(e)}>
            <Pencil className="h-4 w-4 mr-2" /> 编辑
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(e.id, e.name)}>
            <Trash2 className="h-4 w-4 mr-2" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">设备</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{equipment.length} 项</p>
        </div>
        <div className="flex items-center gap-2">
          {equipment.length > 0 && <AssetViewToggle value={view} onChange={setView} />}
          <Button onClick={openNew}>添加设备</Button>
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">暂无设备</p>
          <p className="text-sm mt-1">记录家电、冷暖设备、热水器、工具——任何需要维护记录的物品。</p>
        </div>
      ) : (
        <AssetCollection
          items={equipment}
          view={view}
          assetType="EQUIPMENT"
          imageFilenameOf={(e) => e.imageFilename}
          toCard={toCard}
          columns={columns}
          accessors={accessors}
          defaultSort="name"
          defaultDir="asc"
          initialDirs={INITIAL_DIRS}
          renderActions={renderActions}
          onOpen={(e) => router.push(`/assets/equipment/${e.id}`)}
          label="条目"
        />
      )}

      <EquipmentFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        equipment={editing}
        properties={properties}
      />
    </>
  )
}
