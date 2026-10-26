import type { EquipmentCategory } from "@/app/generated/prisma/client"

export const EQUIPMENT_CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: "APPLIANCE", label: "家电" },
  { value: "HVAC", label: "供暖与制冷" },
  { value: "WATER", label: "供水与管道" },
  { value: "ELECTRONICS", label: "电子产品" },
  { value: "TOOL", label: "工具" },
  { value: "OUTDOOR", label: "户外与草坪" },
  { value: "SECURITY", label: "安防" },
  { value: "OTHER", label: "其他" },
]

const labels = Object.fromEntries(EQUIPMENT_CATEGORIES.map((c) => [c.value, c.label])) as Record<EquipmentCategory, string>

export function categoryLabel(category: EquipmentCategory) {
  return labels[category] ?? "其他"
}
