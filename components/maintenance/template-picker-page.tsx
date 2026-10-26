import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { TemplatePicker } from "@/components/maintenance/template-picker"
import { assetHref } from "@/lib/assets"
import { templatesFor } from "@/lib/maintenance-templates"
import { loadTemplateTarget } from "@/lib/maintenance-templates-server"
import type { AssetType } from "@/app/generated/prisma/client"

/** Body of /assets/{type}/[id]/reminders: pick default reminders for one asset. */
export async function TemplatePickerPage({ assetType, assetId }: { assetType: AssetType; assetId: string }) {
  const target = await loadTemplateTarget(assetType, assetId)
  if (!target) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href={assetHref(assetType, assetId)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {target.name}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">添加默认提醒</h1>
        <p className="text-sm text-muted-foreground">
          以下是常用间隔，供起步参考，并非厂商保养周期。取消勾选不适用的项，其余可自行调整。
          每项的首次到期时间为今天起一个间隔后。
        </p>
      </div>
      <TemplatePicker
        assetType={assetType}
        assetId={assetId}
        templates={templatesFor(target.asset)}
        existingTitles={target.existingTitles}
        meterUnit={target.asset.type === "VEHICLE" ? target.asset.meterUnit : null}
      />
    </div>
  )
}
