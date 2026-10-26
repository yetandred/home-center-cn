import { TemplatePickerPage } from "@/components/maintenance/template-picker-page"

export const metadata = { title: "添加提醒" }

export default async function PropertyRemindersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TemplatePickerPage assetType="PROPERTY" assetId={id} />
}
