"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertTriangle, MoreHorizontal, Pencil, Pill, Stethoscope, Trash2 } from "lucide-react"
import { AssetCollection, type AssetColumn } from "@/components/assets/asset-collection"
import { AssetViewToggle } from "@/components/assets/asset-view-toggle"
import { useAssetView } from "@/components/assets/use-asset-view"
import { EntityFormDialog } from "@/components/forms/entity-form-dialog"
import { createPerson, deletePerson, updatePerson } from "@/lib/actions/people"
import { ageFrom, labelFor, RELATIONSHIPS } from "@/lib/health"
import { personFields, personInitial } from "./person-fields"
import type { Accessor } from "@/lib/use-client-table"
import type { AssetView } from "@/lib/asset-view"
import type { Person } from "@/app/generated/prisma/client"

export type PersonRow = Person & { _count: { conditions: number; medications: number; allergies: number } }

interface Props {
  people: PersonRow[]
  providers: { id: string; name: string }[]
  initialView: AssetView
}

export function PeopleList({ people, providers, initialView }: Props) {
  const router = useRouter()
  const [view, setView] = useAssetView("people", initialView)
  const [editing, setEditing] = useState<PersonRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const age = (p: PersonRow) => (p.dateOfBirth ? ageFrom(p.dateOfBirth, new Date()) : null)

  // Memoized because the sort in useClientTable keys off this object's identity.
  const accessors = useMemo<Record<string, Accessor<PersonRow>>>(
    () => ({
      name: (p) => p.name,
      relationship: (p) => labelFor(RELATIONSHIPS, p.relationship),
      age: (p) => (p.dateOfBirth ? ageFrom(p.dateOfBirth, new Date()) : null),
      conditions: (p) => p._count.conditions,
      medications: (p) => p._count.medications,
    }),
    []
  )

  const columns: AssetColumn<PersonRow>[] = [
    { key: "name", label: "姓名", cell: (p) => <span className="font-medium">{p.name}</span> },
    { key: "relationship", label: "关系", cell: (p) => <Badge variant="secondary" className="text-xs">{labelFor(RELATIONSHIPS, p.relationship)}</Badge> },
    { key: "age", label: "年龄", className: "text-muted-foreground", cell: (p) => age(p) ?? "—" },
    { key: "conditions", label: "现有病症", className: "text-muted-foreground", cell: (p) => p._count.conditions },
    { key: "medications", label: "用药", className: "text-muted-foreground", cell: (p) => p._count.medications },
    {
      key: "allergy", label: "过敏", sortable: false,
      cell: (p) => (p._count.allergies > 0 ? <Badge variant="destructive" className="text-xs">严重</Badge> : "—"),
    },
  ]

  function toCard(p: PersonRow) {
    const a = age(p)
    return {
      name: p.name,
      badge: labelFor(RELATIONSHIPS, p.relationship),
      subtitle: a != null ? `${a} 岁` : null,
      meta: [
        ...(p._count.conditions > 0 ? [{ icon: Stethoscope, text: `${p._count.conditions} 项病症` }] : []),
        ...(p._count.medications > 0 ? [{ icon: Pill, text: `${p._count.medications} 种用药` }] : []),
        ...(p._count.allergies > 0 ? [{ icon: AlertTriangle, text: "有严重过敏记录" }] : []),
      ],
    }
  }

  async function handleDelete(p: PersonRow) {
    if (!confirm(`确定删除“${p.name}”吗？其就诊、提醒、病症、用药和文件也会一并删除。`)) return
    const result = await deletePerson(p.id)
    if (result.error) { toast.error(typeof result.error === "string" ? result.error : "删除失败。"); return }
    toast.success(`已删除“${p.name}”。`)
  }

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(p: PersonRow) { setEditing(p); setDialogOpen(true) }

  function renderActions(p: PersonRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`“${p.name}”的更多操作`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted transition-colors"
          onClick={(evt) => evt.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(evt) => evt.stopPropagation()}>
          <DropdownMenuItem onClick={() => openEdit(p)}>
            <Pencil className="h-4 w-4 mr-2" /> 编辑
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(p)}>
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
          <h1 className="font-heading text-2xl font-semibold">成员</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{people.length} 名成员</p>
        </div>
        <div className="flex items-center gap-2">
          {people.length > 0 && <AssetViewToggle value={view} onChange={setView} />}
          <Button onClick={openNew}>添加成员</Button>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">还没有成员</p>
          <p className="text-sm mt-1">添加家庭成员，记录就诊、医疗收据、病症和用药。</p>
        </div>
      ) : (
        <AssetCollection
          items={people}
          view={view}
          assetType="PERSON"
          imageFilenameOf={(p) => p.imageFilename}
          toCard={toCard}
          columns={columns}
          accessors={accessors}
          defaultSort="name"
          defaultDir="asc"
          renderActions={renderActions}
          onOpen={(p) => router.push(`/assets/people/${p.id}`)}
          label="people"
        />
      )}

      <EntityFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "编辑成员" : "添加成员"}
        submitLabel={editing ? "保存更改" : "添加成员"}
        successMessage={editing ? "成员已更新。" : "成员已添加。"}
        fields={personFields(providers)}
        initial={personInitial(editing)}
        onSubmit={(values) => (editing ? updatePerson(editing.id, values) : createPerson(values))}
      />
    </>
  )
}
