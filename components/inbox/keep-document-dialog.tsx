"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AssetSelect, type InboxAssetOption } from "@/components/inbox/asset-select"
import { keepAsDocument } from "@/lib/actions/inbox"
import { parseAssetKey } from "@/lib/inbox-form"

/** "Keep as document": moves the files to an asset's Documents tab (a manual, a title, a warranty card). Mounted only while open. */
export function KeepDocumentDialog({
  itemId,
  fileName,
  initialAssetKey,
  assets,
  onClose,
}: {
  itemId: string
  fileName: string
  initialAssetKey: string
  assets: InboxAssetOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [key, setKey] = useState(initialAssetKey)
  const [pending, start] = useTransition()
  const asset = parseAssetKey(key)

  function submit() {
    if (!asset) return
    start(async () => {
      const r = await keepAsDocument(itemId, asset.assetType, asset.assetId)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      const name = assets.find((a) => a.type === asset.assetType && a.id === asset.assetId)?.name ?? "该资产"
      toast.success(`已保存到 ${name}。`, { action: { label: "查看", onClick: () => router.push(r.href) } })
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存为文档</DialogTitle>
          <DialogDescription>
            将 <span className="font-medium text-foreground">{fileName}</span> 移动到该资产的文档中，不创建维护记录。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`keep-${itemId}`}>所属</Label>
          <AssetSelect id={`keep-${itemId}`} assets={assets} value={key} onChange={setKey} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="button" disabled={!asset || pending} onClick={submit}>
            {pending ? "移动中……" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
