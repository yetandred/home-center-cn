import type { EquipmentCategory, MeterUnit, PropertyType } from "@/app/generated/prisma/client"

// Generic starting reminders offered after an asset is created. They're common
// rules of thumb, not manufacturer schedules: the picker says so, and every
// interval can be changed before (and after) the reminders are made.

export type MaintenanceTemplate = {
  /** Stable id within its asset kind; the picker posts these back. */
  key: string
  title: string
  description?: string
  intervalDays?: number
  /** Miles, or hours for a vehicle tracked in hours. */
  intervalMiles?: number
  /** Warning window on the meter side; the schedule default (500) suits miles only. */
  reminderMilesBefore?: number
}

/** What the template list depends on, per asset kind. People get none. */
export type TemplateAsset =
  | { type: "PROPERTY"; propertyType: PropertyType }
  | { type: "VEHICLE"; meterUnit: MeterUnit }
  | { type: "EQUIPMENT"; category: EquipmentCategory }

const HOUSE: MaintenanceTemplate[] = [
  { key: "hvac-filter", title: "更换 HVAC 滤网", intervalDays: 90 },
  { key: "smoke-co-test", title: "测试烟雾与一氧化碳报警器", intervalDays: 180 },
  { key: "gutters", title: "清理排水沟", intervalDays: 180 },
  { key: "water-heater-flush", title: "冲洗热水器", intervalDays: 365 },
  { key: "dryer-vent", title: "清理烘干机通风管道", intervalDays: 365 },
  { key: "hvac-service", title: "HVAC 专业保养", intervalDays: 365 },
]

// A condo's roof, gutters and usually its central plant belong to the building.
const CONDO_SKIP = new Set(["gutters", "hvac-service"])

const LOT: MaintenanceTemplate[] = [
  { key: "property-walk", title: "巡查地块边界", description: "检查围栏、排水和界桩。", intervalDays: 180 },
]

const VEHICLE_MILES: MaintenanceTemplate[] = [
  { key: "oil", title: "更换机油", intervalDays: 180, intervalMiles: 5000 },
  { key: "tire-rotation", title: "轮胎换位", intervalDays: 180, intervalMiles: 6000 },
  { key: "engine-air-filter", title: "更换发动机空气滤芯", intervalDays: 365, intervalMiles: 15000 },
  { key: "cabin-air-filter", title: "更换空调滤芯", intervalDays: 365, intervalMiles: 15000 },
  { key: "brake-inspection", title: "刹车检查", intervalDays: 365, intervalMiles: 12000 },
  { key: "registration", title: "车辆年检续期", intervalDays: 365 },
]

const VEHICLE_HOURS: MaintenanceTemplate[] = [
  { key: "oil", title: "更换机油", intervalDays: 365, intervalMiles: 100, reminderMilesBefore: 10 },
  { key: "air-filter", title: "更换空气滤芯", intervalDays: 365, intervalMiles: 200, reminderMilesBefore: 20 },
  { key: "annual-service", title: "年度保养", intervalDays: 365 },
  { key: "registration", title: "车辆年检续期", intervalDays: 365 },
]

const EQUIPMENT: Record<EquipmentCategory, MaintenanceTemplate[]> = {
  APPLIANCE: [
    { key: "clean-inspect", title: "清洁与检查", description: "线圈、滤网、密封条和排水口。", intervalDays: 365 },
  ],
  HVAC: [
    { key: "filter", title: "更换滤网", intervalDays: 90 },
    { key: "service", title: "专业保养", intervalDays: 365 },
  ],
  WATER: [
    { key: "flush", title: "冲洗或除垢", intervalDays: 365 },
    { key: "filter", title: "更换滤芯", intervalDays: 180 },
  ],
  ELECTRONICS: [
    { key: "dust-update", title: "除尘并检查更新", intervalDays: 180 },
  ],
  TOOL: [
    { key: "inspect", title: "检查并润滑", intervalDays: 365 },
  ],
  OUTDOOR: [
    { key: "season-service", title: "换季保养", description: "机油、刀片或链条、火花塞。", intervalDays: 365 },
    { key: "winterize", title: "冬季防护处理", intervalDays: 365 },
  ],
  SECURITY: [
    { key: "test", title: "测试系统与电池", intervalDays: 180 },
  ],
  OTHER: [
    { key: "inspect", title: "例行检查", intervalDays: 365 },
  ],
}

export function templatesFor(asset: TemplateAsset): MaintenanceTemplate[] {
  switch (asset.type) {
    case "PROPERTY":
      if (asset.propertyType === "LOT") return LOT
      if (asset.propertyType === "CONDO") return HOUSE.filter((t) => !CONDO_SKIP.has(t.key))
      return HOUSE
    case "VEHICLE":
      return asset.meterUnit === "HOURS" ? VEHICLE_HOURS : VEHICLE_MILES
    case "EQUIPMENT":
      return EQUIPMENT[asset.category]
  }
}

/**
 * First due point for a new reminder: one interval from today, and one interval
 * past the current reading when it's known. Without a reading only the date
 * side is set; the next completion fills in the meter.
 */
export function firstDue(
  interval: { intervalDays?: number | null; intervalMiles?: number | null },
  today: Date,
  currentReading: number | null
): { nextDueDate: Date | null; nextDueMileage: number | null } {
  const nextDueDate = interval.intervalDays ? new Date(today.getTime() + interval.intervalDays * 86400000) : null
  const nextDueMileage = interval.intervalMiles && currentReading != null ? currentReading + interval.intervalMiles : null
  return { nextDueDate, nextDueMileage }
}
