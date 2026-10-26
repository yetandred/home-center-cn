import { prisma } from "@/lib/prisma"
import { categoryLabel as equipmentCategoryLabel } from "@/components/equipment/categories"
import type { AssetType, MeterUnit, Prisma, Provider } from "@/app/generated/prisma/client"
import type { CostRow } from "@/lib/costs"
import { getFormat } from "@/lib/regional-server"
import type { Formatter } from "@/lib/regional"
import { ageFrom } from "@/lib/health"
import { loadFeatures } from "@/lib/features-server"
import { locationLabel } from "@/lib/rooms"

// Everything the printable asset report needs, in one place.
//
// The three detail pages each assemble this themselves and each branch on their
// own asset shape. The report should not: it renders one document whatever the
// asset is, so the type-specific part is flattened to a list of labelled rows
// here and the component below stays type-agnostic.

/// URL segment -> enum, the same mapping the download route uses. Returns null
/// for anything else, which is what makes the `[type]` route parameter safe to
/// take from the URL.
export function parseAssetSegment(segment: string): AssetType | null {
  if (segment === "properties") return "PROPERTY"
  if (segment === "vehicles") return "VEHICLE"
  if (segment === "equipment") return "EQUIPMENT"
  if (segment === "people") return "PERSON"
  return null
}

export type DetailRow = { label: string; value: string }

export type ReportAsset = {
  type: AssetType
  id: string
  name: string
  /// The one line that identifies the thing under its name — an address, a
  /// year/make/model, a category and location.
  subtitle: string | null
  imageFilename: string | null
  purchaseDate: Date | null
  purchasePrice: number | null
  notes: string | null
  details: DetailRow[]
  /// Vehicles only; drives the mileage column and the cost-per-unit figure.
  meterUnit: MeterUnit | null
  currentMeter: number | null
}

const withAttachments = { attachments: { orderBy: { originalName: "asc" } } } as const

export type ReportService = Prisma.ServiceRecordGetPayload<{ include: typeof withAttachments }>
export type ReportWarranty = Prisma.WarrantyGetPayload<{ include: typeof withAttachments }>
export type ReportSchedule = Prisma.MaintenanceScheduleGetPayload<{ include: typeof withAttachments }>

const healthInclude = {
  primaryProvider: true,
  allergies: { orderBy: [{ severity: "desc" }, { substance: "asc" }] },
  conditions: {
    include: { provider: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  },
  medications: { include: { prescriber: { select: { name: true } } }, orderBy: { name: "asc" } },
  immunizations: { orderBy: { dateGiven: "desc" } },
  insurancePolicies: { orderBy: { carrier: "asc" } },
  observations: { include: { condition: { select: { name: true } } }, orderBy: [{ date: "desc" }, { time: "desc" }] },
} satisfies Prisma.PersonInclude

const roomInclude = { paints: { orderBy: { sortOrder: "asc" } } } as const

export type ReportRoom = Prisma.RoomGetPayload<{ include: typeof roomInclude }>

export type ReportPerson = Prisma.PersonGetPayload<{ include: typeof healthInclude }>
export type ReportHealth = { person: ReportPerson; careTeam: Provider[] }

export type ReportData = {
  asset: ReportAsset
  /// Oldest first. A printed service history reads as a history — it starts at
  /// the beginning. The app's own lists stay newest-first, where the question is
  /// "what happened lately" rather than "what has this thing been through".
  services: ReportService[]
  warranties: ReportWarranty[]
  schedules: ReportSchedule[]
  costRows: CostRow[]
  health: ReportHealth | null
  /// A property's rooms; empty for other assets and while Rooms is off.
  rooms: ReportRoom[]
  generatedAt: Date
}

function formatDate(date: Date | null | undefined, fmt: Formatter): string {
  if (!date) return "—"
  return fmt.date(date, { utc: true, long: true })
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  HOUSE: "独立屋",
  CONDO: "公寓",
  TOWNHOUSE: "联排别墅",
  LOT: "地块",
  OTHER: "其他",
}

export async function loadReport(assetType: AssetType, assetId: string): Promise<ReportData | null> {
  const [services, warranties, schedules] = await Promise.all([
    prisma.serviceRecord.findMany({
      where: { assetId, assetType },
      include: withAttachments,
      orderBy: { date: "asc" },
    }),
    prisma.warranty.findMany({
      where: { assetId, assetType },
      include: withAttachments,
      // Longest-lived first, so whatever still covers the asset leads.
      orderBy: { expirationDate: "desc" },
    }),
    prisma.maintenanceSchedule.findMany({
      where: { assetId, assetType },
      include: withAttachments,
      orderBy: { nextDueDate: "asc" },
    }),
  ])

  const asset = await loadAsset(assetType, assetId)
  if (!asset) return null

  // Reuses the cost layer's row shape so the report's figures are computed by
  // the same functions the /costs page uses, not a second implementation.
  const costRows: CostRow[] = services
    .filter((s) => s.cost != null)
    .map((s) => ({
      id: s.id,
      assetId,
      assetType,
      date: s.date,
      cost: s.cost!,
      category: s.category,
      vendor: s.vendor,
      title: s.title,
      mileageAtService: s.mileageAtService,
    }))

  const health = assetType === "PERSON" ? await loadHealth(assetId) : null
  const rooms =
    assetType === "PROPERTY" && (await loadFeatures()).rooms
      ? await prisma.room.findMany({ where: { propertyId: assetId }, include: roomInclude, orderBy: { name: "asc" } })
      : []

  return { asset, services, warranties, schedules, costRows, health, rooms, generatedAt: new Date() }
}

async function loadHealth(personId: string): Promise<ReportHealth | null> {
  const [person, careTeam] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, include: healthInclude }),
    // Everyone involved in this person's care, from any direction.
    prisma.provider.findMany({
      where: {
        OR: [
          { primaryFor: { some: { id: personId } } },
          { conditions: { some: { personId } } },
          { prescriptions: { some: { personId } } },
          { serviceRecords: { some: { assetType: "PERSON", assetId: personId } } },
        ],
      },
      orderBy: { name: "asc" },
    }),
  ])
  return person ? { person, careTeam } : null
}

async function loadAsset(assetType: AssetType, assetId: string): Promise<ReportAsset | null> {
  const fmt = await getFormat()
  if (assetType === "PERSON") {
    const p = await prisma.person.findUnique({
      where: { id: assetId },
      include: { primaryProvider: { select: { name: true } } },
    })
    if (!p) return null
    const age = p.dateOfBirth ? ageFrom(p.dateOfBirth, new Date()) : null
    return {
      type: "PERSON",
      id: p.id,
      name: p.name,
      subtitle: age != null ? `${age} 岁` : null,
      imageFilename: p.imageFilename,
      purchaseDate: null,
      purchasePrice: null,
      notes: p.notes,
      meterUnit: null,
      currentMeter: null,
      details: [
        ...(p.dateOfBirth ? [{ label: "出生日期", value: fmt.date(p.dateOfBirth, { utc: true }) }] : []),
        ...(p.sex ? [{ label: "性别", value: p.sex }] : []),
        ...(p.bloodType ? [{ label: "血型", value: p.bloodType }] : []),
        ...(p.primaryProvider ? [{ label: "主治医生", value: p.primaryProvider.name }] : []),
      ],
    }
  }

  if (assetType === "PROPERTY") {
    const p = await prisma.property.findUnique({
      where: { id: assetId },
      include: { equipment: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    })
    if (!p) return null
    return {
      type: "PROPERTY",
      id: p.id,
      name: p.name,
      subtitle: p.address,
      imageFilename: p.imageFilename,
      purchaseDate: p.purchaseDate,
      purchasePrice: p.purchasePrice,
      notes: p.notes,
      meterUnit: null,
      currentMeter: null,
      details: [
        { label: "类型", value: PROPERTY_TYPE_LABELS[p.type] ?? "其他" },
        { label: "地址", value: p.address },
        ...(p.yearBuilt ? [{ label: "建造年份", value: String(p.yearBuilt) }] : []),
        ...(p.sqFt ? [{ label: fmt.areaWords, value: p.sqFt.toLocaleString() }] : []),
        { label: "购置日期", value: formatDate(p.purchaseDate, fmt) },
        ...(p.purchasePrice != null
          ? [{ label: "购置价格", value: fmt.moneyWhole(p.purchasePrice) }]
          : []),
        ...(p.equipment.length > 0
          ? [{ label: "所属设备", value: p.equipment.map((e) => e.name).join("、") }]
          : []),
      ],
    }
  }

  if (assetType === "VEHICLE") {
    const v = await prisma.vehicle.findUnique({ where: { id: assetId } })
    if (!v) return null
    const unit = v.meterUnit === "HOURS" ? "小时" : fmt.distanceWords
    return {
      type: "VEHICLE",
      id: v.id,
      name: v.name,
      subtitle: `${v.year} ${v.make} ${v.model}`,
      imageFilename: v.imageFilename,
      purchaseDate: v.purchaseDate,
      purchasePrice: v.purchasePrice,
      notes: v.notes,
      meterUnit: v.meterUnit,
      currentMeter: v.currentMileage,
      details: [
        { label: "品牌", value: v.make },
        { label: "型号", value: v.model },
        { label: "年份", value: String(v.year) },
        ...(v.vin ? [{ label: "VIN", value: v.vin }] : []),
        ...(v.color ? [{ label: "颜色", value: v.color }] : []),
        ...(v.currentMileage != null
          ? [{ label: `当前${unit}`, value: v.currentMileage.toLocaleString() }]
          : []),
        { label: "购置日期", value: formatDate(v.purchaseDate, fmt) },
        ...(v.purchasePrice != null
          ? [{ label: "购置价格", value: fmt.moneyWhole(v.purchasePrice) }]
          : []),
      ],
    }
  }

  const e = await prisma.equipment.findUnique({
    where: { id: assetId },
    include: { property: { select: { name: true } }, room: { select: { name: true } } },
  })
  if (!e) return null
  const location = locationLabel(e)
  return {
    type: "EQUIPMENT",
    id: e.id,
    name: e.name,
    subtitle: [equipmentCategoryLabel(e.category), location].filter(Boolean).join(" · ") || null,
    imageFilename: e.imageFilename,
    purchaseDate: e.purchaseDate,
    purchasePrice: e.purchasePrice,
    notes: e.notes,
    meterUnit: null,
    currentMeter: null,
    details: [
      { label: "分类", value: equipmentCategoryLabel(e.category) },
      ...(e.manufacturer ? [{ label: "制造商", value: e.manufacturer }] : []),
      ...(e.modelNumber ? [{ label: "型号", value: e.modelNumber }] : []),
      ...(e.serialNumber ? [{ label: "序列号", value: e.serialNumber }] : []),
      ...(location ? [{ label: "位置", value: location }] : []),
      ...(e.property ? [{ label: "所属房产", value: e.property.name }] : []),
      ...(e.installDate ? [{ label: "安装日期", value: formatDate(e.installDate, fmt) }] : []),
      { label: "购置日期", value: formatDate(e.purchaseDate, fmt) },
      ...(e.purchasePrice != null
        ? [{ label: "购置价格", value: fmt.moneyWhole(e.purchasePrice) }]
        : []),
    ],
  }
}
