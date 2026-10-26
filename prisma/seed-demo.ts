/**
 * Demo data seeder — wipes the database and rebuilds it with a realistic,
 * lived-in dataset for screenshots.
 *
 * Every date is written relative to the moment you run it, so re-running months
 * from now refreshes the whole timeline: overdue stays overdue, "due soon"
 * stays soon, and recent service stays recent.
 *
 *   npx tsx prisma/seed-demo.ts             # prompts before wiping
 *   npx tsx prisma/seed-demo.ts --yes       # no prompt (CI / scripted use)
 *   npx tsx prisma/seed-demo.ts --no-images # skip photo downloads
 *
 * See DEMO-DATA.md.
 */
import { PrismaClient, type EquipmentCategory, type PropertyType } from "../app/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import bcrypt from "bcryptjs"
import { mkdir, writeFile, readFile, rm } from "fs/promises"
import { existsSync } from "fs"
import { createInterface } from "readline"
import path from "path"
import zlib from "zlib"

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db"
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) })

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads"
const MANAGED_DIRS = ["properties", "vehicles", "equipment", "people", "service", "warranty", "maintenance", "condition", "insurance"]

const ADMIN_EMAIL = process.env.DEMO_EMAIL ?? "demo@homecenter.local"
const ADMIN_PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234"
const ADMIN_NAME = process.env.DEMO_NAME ?? "李伟"

const args = new Set(process.argv.slice(2))
const SKIP_PROMPT = args.has("--yes") || args.has("-y")
const SKIP_IMAGES = args.has("--no-images")
const REFRESH_PHOTOS = args.has("--refresh-photos")

// Downloaded photos are cached outside the uploads folder so re-seeding is fast
// and works offline. Wikimedia throttles anonymous traffic hard enough that the
// first run takes a couple of minutes; every run after that is instant.
const PHOTO_CACHE = process.env.DEMO_PHOTO_CACHE ?? "prisma/.demo-photos"

const DAY = 86_400_000
const START = Date.now()
/** Days from now — negative is the past. */
const at = (days: number, hour = 10) => {
  const d = new Date(START + days * DAY)
  d.setHours(hour, (Math.abs(days) * 7) % 60, 0, 0)
  return d
}

// ─── Confirmation ────────────────────────────────────────────────────────────

async function confirmWipe() {
  const counts = {
    users: await prisma.user.count(),
    properties: await prisma.property.count(),
    vehicles: await prisma.vehicle.count(),
    equipment: await prisma.equipment.count(),
    serviceRecords: await prisma.serviceRecord.count(),
    warranties: await prisma.warranty.count(),
    maintenance: await prisma.maintenanceSchedule.count(),
    attachments: await prisma.attachment.count(),
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  console.log("\n\x1b[1m\x1b[31m  警告——此操作将清空整个数据库\x1b[0m\n")
  console.log(`  数据库：   ${url}`)
  console.log(`  上传目录： ${path.resolve(UPLOAD_DIR)}`)
  console.log("\n  下列所有数据都将被删除并替换为演示数据。")
  console.log("  所有上传的文件都会被删除，用户账户（包括您的）也会被删除。\n")
  for (const [name, n] of Object.entries(counts)) {
    console.log(`    ${name.padEnd(16)} ${String(n).padStart(5)}`)
  }
  console.log(`    ${"总行数".padEnd(16)} ${String(total).padStart(5)}\n`)

  if (SKIP_PROMPT) {
    console.log("  已指定 --yes，跳过确认直接继续。\n")
    return
  }

  if (!process.stdin.isTTY) {
    console.error("  拒绝清空：当前不是交互式终端。确认无误请加 --yes 重新运行。\n")
    process.exit(1)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((resolve) =>
    rl.question("  输入 WIPE 继续，输入其他内容则中止：", resolve)
  )
  rl.close()

  if (answer.trim() !== "WIPE") {
    console.log("\n  已中止，未做任何更改。\n")
    process.exit(0)
  }
  console.log()
}

async function wipe() {
  // Children first — attachments and notifications hold the foreign keys.
  await prisma.attachment.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.serviceRecord.deleteMany()
  await prisma.warranty.deleteMany()
  await prisma.maintenanceSchedule.deleteMany()
  await prisma.medication.deleteMany()
  await prisma.healthCondition.deleteMany()
  await prisma.allergy.deleteMany()
  await prisma.immunization.deleteMany()
  await prisma.insurancePolicy.deleteMany()
  await prisma.person.deleteMany()
  await prisma.provider.deleteMany()
  await prisma.equipment.deleteMany()
  await prisma.vehicle.deleteMany()
  await prisma.property.deleteMany()
  await prisma.user.deleteMany()

  for (const dir of MANAGED_DIRS) {
    await rm(path.join(UPLOAD_DIR, dir), { recursive: true, force: true })
  }
}

// ─── Images ──────────────────────────────────────────────────────────────────

/** Solid-ish PNG used when a download fails, so the demo still has artwork. */
function fallbackPng(size: number, hue: number) {
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const a = 0.55 * 0.45
    return Math.round(255 * (0.55 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))))
  }
  const [r, g, b] = [f(0), f(8), f(4)]

  const raw = Buffer.alloc(size * (size * 3 + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      const band = (x + y) % 40 < 20 ? 1 : 0.82
      raw[o++] = Math.round(r * band)
      raw[o++] = Math.round(g * band)
      raw[o++] = Math.round(b * band)
    }
  }

  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  const crc32 = (buf: Buffer) => {
    let c = -1
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

type PhotoJob = {
  kind: "properties" | "vehicles" | "equipment"
  id: string
  /** Wikimedia Commons search query. */
  query: string
  /** Broader query tried when the specific one finds nothing usable. */
  fallbackQuery: string
  /** Distinguishes items sharing a query so two water heaters aren't identical. */
  variant: number
}

let downloaded = 0
let generated = 0

// Wikimedia Commons: no API key, searchable by subject, and the files are
// unwatermarked. (loremflickr was the obvious alternative, but its tag matching
// is loose enough to return a building for "car", and it burns an attribution
// stamp into every image — both fatal for screenshots.)
const COMMONS_API = "https://commons.wikimedia.org/w/api.php"
const USER_AGENT = "HomeCenter-demo-seed/1.0 (local development seed script)"
const NON_PHOTO = /\b(plan|blueprint|diagram|drawing|map|patent|sketch|logo|seal|icon|chart|schematic|poster|stamp|coat[_ ]of[_ ]arms)\b/i

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Wikimedia rate-limits anonymous callers on both the API and the file host.
// Every request — search and download alike — goes through one gate with a gap
// and 429 retries. Running these in parallel gets most of them throttled, and a
// throttled download looks like a tiny file rather than an error, so it silently
// degrades into a pile of placeholder images.
const REQUEST_GAP_MS = 800
let lastRequestAt = 0

async function wikimediaFetch(url: string, attempt = 0): Promise<Response | null> {
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  })

  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt)
    return wikimediaFetch(url, attempt + 1)
  }
  return res.ok ? res : null
}

async function commonsCandidates(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: query,
    gsrnamespace: "6", gsrlimit: "10",
    prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "900", format: "json",
  })
  try {
    const res = await wikimediaFetch(`${COMMONS_API}?${params}`)
    if (!res) return []
    const json = (await res.json()) as {
      query?: {
        pages?: Record<string, {
          title?: string
          imageinfo?: { thumburl?: string; mime?: string; width?: number }[]
        }>
      }
    }
    return Object.values(json.query?.pages ?? {})
      // Commons is full of plans, diagrams, maps and patent drawings that match
      // these queries perfectly well and look nothing like a photo.
      .filter((page) => !NON_PHOTO.test(page.title ?? ""))
      .map((page) => page.imageinfo?.[0])
      .filter((info): info is { thumburl: string; mime: string; width: number } =>
        !!info?.thumburl && info.mime === "image/jpeg" && (info.width ?? 0) >= 640
      )
      .map((info) => info.thumburl)
  } catch {
    return []
  }
}

async function download(url: string) {
  try {
    const res = await wikimediaFetch(url)
    if (!res) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length > 5000 ? bytes : null
  } catch {
    return null
  }
}

const cachePath = (job: PhotoJob) =>
  path.join(PHOTO_CACHE, `${job.query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${job.variant}.jpg`)

let cached = 0

async function photoFor(job: PhotoJob): Promise<{ filename: string; bytes: Buffer }> {
  const cacheFile = cachePath(job)

  if (!REFRESH_PHOTOS && existsSync(cacheFile)) {
    cached++
    return { filename: "photo.jpg", bytes: await readFile(cacheFile) }
  }

  if (!SKIP_IMAGES) {
    for (const query of [job.query, job.fallbackQuery]) {
      const urls = await commonsCandidates(query)
      // Start at the variant offset so repeated subjects get different photos.
      for (let i = 0; i < urls.length; i++) {
        const bytes = await download(urls[(job.variant + i) % urls.length])
        if (bytes) {
          await mkdir(PHOTO_CACHE, { recursive: true })
          await writeFile(cacheFile, bytes)
          downloaded++
          return { filename: "photo.jpg", bytes }
        }
      }
    }
  }

  generated++
  return { filename: "photo.png", bytes: fallbackPng(96, (job.variant * 47) % 360) }
}

async function writePhotos(jobs: PhotoJob[]) {
  const results = new Map<string, string>()

  for (const [i, job] of jobs.entries()) {
    const { filename, bytes } = await photoFor(job)
    const dir = path.join(UPLOAD_DIR, job.kind, job.id)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), bytes)
    results.set(job.id, filename)
    if ((i + 1) % 10 === 0) console.log(`    ${i + 1}/${jobs.length} (${cached} cached, ${downloaded} fetched, ${generated} generated)`)
  }

  return results
}

// ─── Attachments (small generated PDFs, so records look documented) ──────────

function receiptPdf(lines: string[]) {
  const content =
    "BT /F1 14 Tf 60 720 Td (" +
    lines[0].replace(/[()\\]/g, "") +
    ") Tj /F1 10 Tf 0 -28 Td " +
    lines
      .slice(1)
      .map((l) => `(${l.replace(/[()\\]/g, "")}) Tj 0 -16 Td `)
      .join("") +
    "ET"

  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
  ]

  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

async function attach(
  recordType: "SERVICE" | "WARRANTY" | "MAINTENANCE",
  recordId: string,
  userId: string,
  originalName: string,
  lines: string[]
) {
  const bytes = receiptPdf(lines)
  const filename = `${recordType.toLowerCase()}-${recordId.slice(-6)}.pdf`
  const dir = path.join(UPLOAD_DIR, recordType.toLowerCase(), recordId)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), bytes)

  await prisma.attachment.create({
    data: {
      recordType,
      filename,
      originalName,
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      uploadedById: userId,
      serviceRecordId: recordType === "SERVICE" ? recordId : null,
      warrantyId: recordType === "WARRANTY" ? recordId : null,
      maintenanceScheduleId: recordType === "MAINTENANCE" ? recordId : null,
    },
  })
}

// ─── The dataset ─────────────────────────────────────────────────────────────

const PROPERTIES: {
  name: string; type: PropertyType; address: string; sqFt: number | null
  yearBuilt: number | null; boughtDaysAgo: number; price: number; notes: string; photo: string
}[] = [
  {
    name: "枫叶街住宅", type: "HOUSE", address: "春田市枫叶街 412 号",
    sqFt: 2400, yearBuilt: 1998, boughtDaysAgo: 2540, price: 342000, photo: "single family house exterior",
    notes: "主要居所。屋顶 2021 年更换（30 年沥青瓦）。北侧原装窗户即将到期需要更换。",
  },
  {
    name: "湖畔小屋", type: "HOUSE", address: "日内瓦湖岸线路 88 号",
    sqFt: 1150, yearBuilt: 1975, boughtDaysAgo: 1290, price: 268000, photo: "log cabin lake",
    notes: "季节性居住。每年 11 月关闭水源并吹空水管——见冬季防护提醒。",
  },
  {
    name: "雪松街出租屋", type: "TOWNHOUSE", address: "皮奥里亚市雪松街 B 座 155 号",
    sqFt: 1320, yearBuilt: 1962, boughtDaysAgo: 810, price: 158000, photo: "brick townhouse",
    notes: "已出租，租约每年 6 月续签。HVAC 和家电维修由房东承担。",
  },
]

const VEHICLES: {
  name: string; make: string; model: string; year: number; color: string; vin: string
  mileage: number; boughtDaysAgo: number; notes: string; photo: string
}[] = [
  { name: "日常代步车", make: "丰田", model: "RAV4 XLE", year: 2019, color: "银色", vin: "JTMRFREV8KJ012845", mileage: 62400, boughtDaysAgo: 1870, notes: "通勤用车。冬季轮胎存放在车库阁架上。", photo: "Toyota RAV4" },
  { name: "通勤车", make: "本田", model: "Civic Sport", year: 2021, color: "蓝色", vin: "2HGFE2F52MH512087", mileage: 28900, boughtDaysAgo: 1130, notes: "仍在动力总成保修期内。", photo: "Honda Civic" },
  { name: "工作皮卡", make: "福特", model: "F-150 XLT", year: 2017, color: "白色", vin: "1FTEW1EP7HFA24193", mileage: 96300, boughtDaysAgo: 1520, notes: "用于拖船。2022 年加装了拖车控制器。", photo: "Ford F-150" },
  { name: "湖畔车", make: "斯巴鲁", model: "Outback", year: 2014, color: "绿色", vin: "4S4BRBCC4E3271108", mileage: 138700, boughtDaysAgo: 980, notes: "一年中大部分时间停在湖边。", photo: "Subaru Outback" },
  { name: "家用 MPV", make: "本田", model: "Odyssey EX-L", year: 2020, color: "灰色", vin: "5FNRL6H73LB033921", mileage: 51200, boughtDaysAgo: 1420, notes: "第三排座椅已拆除以便载货。", photo: "Honda Odyssey" },
]

const EQUIPMENT: {
  house: number; name: string; category: EquipmentCategory; manufacturer: string; model: string
  location: string; installedDaysAgo: number; price: number | null; photo: string; notes?: string
}[] = [
  // ── 枫叶街住宅 ──
  { house: 0, name: "厨房冰箱", category: "APPLIANCE", manufacturer: "LG", model: "LRFVS3006S", location: "厨房", installedDaysAgo: 640, price: 2499, photo: "refrigerator kitchen" },
  { house: 0, name: "洗碗机", category: "APPLIANCE", manufacturer: "博世", model: "SHPM88Z75N", location: "厨房", installedDaysAgo: 1180, price: 1049, photo: "dishwasher" },
  { house: 0, name: "燃气灶", category: "APPLIANCE", manufacturer: "GE", model: "JGB735SPSS", location: "厨房", installedDaysAgo: 1180, price: 899, photo: "gas stove kitchen" },
  { house: 0, name: "灶台上方微波炉", category: "APPLIANCE", manufacturer: "松下", model: "NN-SN67KS", location: "厨房", installedDaysAgo: 420, price: 289, photo: "microwave oven" },
  { house: 0, name: "洗衣机", category: "APPLIANCE", manufacturer: "惠而浦", model: "WFW5620HW", location: "洗衣房", installedDaysAgo: 1460, price: 799, photo: "washing machine top load" },
  { house: 0, name: "烘干机", category: "APPLIANCE", manufacturer: "惠而浦", model: "WED5620HW", location: "洗衣房", installedDaysAgo: 1460, price: 749, photo: "clothes dryer" },
  { house: 0, name: "燃气暖风炉", category: "HVAC", manufacturer: "开利", model: "59SC5A100", location: "地下室", installedDaysAgo: 2190, price: 4200, photo: "gas furnace", notes: "96% AFUE。滤网规格 16x25x4——使用厚型介质滤网，不要用便宜的。" },
  { house: 0, name: "中央空调", category: "HVAC", manufacturer: "特灵", model: "XR16", location: "侧院", installedDaysAgo: 2190, price: 5100, photo: "air conditioner condenser unit" },
  { house: 0, name: "全屋加湿器", category: "HVAC", manufacturer: "Aprilaire", model: "700M", location: "地下室", installedDaysAgo: 1830, price: 320, photo: "humidifier" },
  { house: 0, name: "热水器", category: "WATER", manufacturer: "Rheem", model: "XE50T10H45U0", location: "地下室", installedDaysAgo: 1290, price: 1450, photo: "water heater tank" },
  { house: 0, name: "软水机", category: "WATER", manufacturer: "康丽根", model: "HE 1.25", location: "地下室", installedDaysAgo: 980, price: 1890, photo: "water softener" },
  { house: 0, name: "污水泵", category: "WATER", manufacturer: "Zoeller", model: "M53", location: "地下室", installedDaysAgo: 730, price: 240, photo: "sump pump", notes: "电池备份同时加装——电池是易老化的部件。" },
  { house: 0, name: "车库门开启器", category: "SECURITY", manufacturer: "Chamberlain", model: "B4643T", location: "车库", installedDaysAgo: 560, price: 329, photo: "garage door opener" },
  { house: 0, name: "门铃摄像头", category: "SECURITY", manufacturer: "Ring", model: "Pro 2", location: "前门廊", installedDaysAgo: 410, price: 249, photo: "video doorbell" },

  // ── 湖畔小屋 ──
  { house: 1, name: "小屋冰箱", category: "APPLIANCE", manufacturer: "Frigidaire", model: "FFTR1835VS", location: "厨房", installedDaysAgo: 1150, price: 749, photo: "refrigerator" },
  { house: 1, name: "丙烷灶", category: "APPLIANCE", manufacturer: "Unique", model: "UGP-24V", location: "厨房", installedDaysAgo: 1150, price: 1299, photo: "propane stove" },
  { house: 1, name: "燃木炉", category: "HVAC", manufacturer: "Jøtul", model: "F 602 V2", location: "客厅", installedDaysAgo: 1290, price: 1850, photo: "wood burning stove", notes: "每个供暖季首次使用前需清扫烟囱。" },
  { house: 1, name: "迷你分体热泵", category: "HVAC", manufacturer: "三菱", model: "MSZ-FH12NA", location: "主厅", installedDaysAgo: 870, price: 3400, photo: "ductless mini split air conditioner" },
  { house: 1, name: "井水泵", category: "WATER", manufacturer: "Goulds", model: "10GS05", location: "井房", installedDaysAgo: 1620, price: 1240, photo: "water well pump" },
  { house: 1, name: "小屋热水器", category: "WATER", manufacturer: "Bradford White", model: "RG240T6N", location: "杂物间", installedDaysAgo: 1620, price: 980, photo: "water heater tank" },
  { house: 1, name: "码头升降机", category: "OUTDOOR", manufacturer: "ShoreStation", model: "SSV30108", location: "码头", installedDaysAgo: 1290, price: 6800, photo: "boat lift dock" },
  { house: 1, name: "备用发电机", category: "OUTDOOR", manufacturer: "Generac", model: "Guardian 18kW", location: "侧院", installedDaysAgo: 690, price: 5600, photo: "standby generator" },
  { house: 1, name: "链锯", category: "TOOL", manufacturer: "斯蒂尔", model: "MS 271 Farm Boss", location: "工具棚", installedDaysAgo: 1450, price: 449, photo: "chainsaw" },

  // ── 雪松街出租屋 ──
  { house: 2, name: "出租屋冰箱", category: "APPLIANCE", manufacturer: "GE", model: "GTS18GTHWW", location: "厨房", installedDaysAgo: 760, price: 699, photo: "refrigerator white" },
  { house: 2, name: "出租屋灶具", category: "APPLIANCE", manufacturer: "Hotpoint", model: "RBS360DMWW", location: "厨房", installedDaysAgo: 760, price: 549, photo: "electric stove" },
  { house: 2, name: "出租屋洗衣机", category: "APPLIANCE", manufacturer: "Maytag", model: "MVWC565FW", location: "地下室", installedDaysAgo: 520, price: 679, photo: "washing machine top load" },
  { house: 2, name: "出租屋烘干机", category: "APPLIANCE", manufacturer: "Maytag", model: "MEDC465HW", location: "地下室", installedDaysAgo: 520, price: 629, photo: "clothes dryer laundry room" },
  { house: 2, name: "锅炉", category: "HVAC", manufacturer: "Weil-McLain", model: "CGa-4-PIDN", location: "地下室", installedDaysAgo: 2920, price: 3900, photo: "boiler heating", notes: "铸铁材质，1990 年代改造时的原装设备。这个年头每年保养必不可少。" },
  { house: 2, name: "出租屋热水器", category: "WATER", manufacturer: "A. O. Smith", model: "GCR-40", location: "地下室", installedDaysAgo: 1980, price: 890, photo: "water heater basement" },
  { house: 2, name: "烟雾与一氧化碳报警器", category: "SECURITY", manufacturer: "First Alert", model: "SC9120B", location: "走廊", installedDaysAgo: 760, price: 180, photo: "smoke detector" },
]

type Ref = { kind: "property" | "vehicle" | "equipment"; index: number }
const P = (i: number): Ref => ({ kind: "property", index: i })
const V = (i: number): Ref => ({ kind: "vehicle", index: i })
const E = (i: number): Ref => ({ kind: "equipment", index: i })

const SERVICE: {
  ref: Ref; daysAgo: number; title: string; vendor: string | null; cost: number | null
  description?: string; mileage?: number; receipt?: string
}[] = [
  // Recent — these fill the dashboard's "Recent Service" panel
  { ref: E(6), daysAgo: 4, title: "暖风炉年度保养", vendor: "春田暖通空调", cost: 189, description: "清理燃烧器，检查热交换器，更换 16x25x4 介质滤网。引风机电机有早期轴承异响——已标记到下个供暖季处理。", receipt: "furnace-service-invoice.pdf" },
  { ref: V(0), daysAgo: 9, title: "换机油与轮胎换位", vendor: "捷飞络", cost: 82.4, mileage: 62180, description: "0W-20 全合成机油。后刹车片剩余 5mm。" },
  { ref: E(11), daysAgo: 12, title: "更换污水泵备用电池", vendor: "自行处理", cost: 164.99, description: "原电池已用五年，自检不通过。" },
  { ref: E(0), daysAgo: 18, title: "制冰机维修", vendor: "家电维修通", cost: 245, description: "更换进水阀。配件在制造商保修范围内，人工另计。", receipt: "icemaker-repair.pdf" },
  { ref: V(2), daysAgo: 23, title: "前刹车片与刹车盘更换", vendor: "美达斯", cost: 612.35, mileage: 95980, receipt: "brake-invoice.pdf" },
  { ref: P(0), daysAgo: 27, title: "清理排水沟", vendor: "一流外墙服务", cost: 225 },
  { ref: E(28), daysAgo: 31, title: "锅炉年度检查", vendor: "皮奥里亚机械", cost: 210, description: "燃烧测试通过。建议两年内更换膨胀水箱。" },

  // Last few months
  { ref: V(1), daysAgo: 44, title: "换机油", vendor: "春田本田", cost: 74.2, mileage: 27600 },
  { ref: E(9), daysAgo: 52, title: "冲洗热水器", vendor: "自行处理", cost: 0, description: "排出约 15 升沉积物。阳极棒还有余量。" },
  { ref: P(1), daysAgo: 61, title: "码头季节性拆除", vendor: "湖畔船务", cost: 480 },
  { ref: E(21), daysAgo: 66, title: "发电机负载测试", vendor: "Generac 授权服务", cost: 295, receipt: "generator-service.pdf" },
  { ref: E(16), daysAgo: 74, title: "烟囱清扫与检查", vendor: "灰烬烟囱服务", cost: 260, description: "一级检查，无焦油结壁。更换了顶盖防护网。" },
  { ref: V(4), daysAgo: 88, title: "变速箱油保养", vendor: "春田本田", cost: 268.5, mileage: 49900 },
  { ref: E(4), daysAgo: 96, title: "更换洗衣机排水泵", vendor: "家电维修通", cost: 318, description: "泵壳里有只袜子。又是。" },
  { ref: V(3), daysAgo: 112, title: "更换缸垫", vendor: "湖畔汽修", cost: 2340, mileage: 136400, description: "EJ25 发动机的通病。拆解时一并更换了缸盖研磨、正时皮带和水泵。", receipt: "head-gasket-invoice.pdf" },
  { ref: E(7), daysAgo: 128, title: "空调冷凝器盘管清洗", vendor: "春田暖通空调", cost: 145 },
  { ref: P(2), daysAgo: 140, title: "租客更替——刷漆铺毯", vendor: "雪松物业服务", cost: 2180, receipt: "turnover-invoice.pdf" },
  { ref: E(10), daysAgo: 155, title: "更换软水机树脂床", vendor: "康丽根", cost: 640 },

  // Older history
  { ref: V(0), daysAgo: 178, title: "换机油与空调滤芯", vendor: "捷飞络", cost: 96.8, mileage: 57400 },
  { ref: E(18), daysAgo: 192, title: "井水泵压力开关", vendor: "日内瓦井泵服务", cost: 385 },
  { ref: P(0), daysAgo: 205, title: "车道密封涂层", vendor: "黑顶兄弟", cost: 540 },
  { ref: E(6), daysAgo: 218, title: "更换暖风炉点火器", vendor: "春田暖通空调", cost: 232, description: "一年中最冷的晚上没了暖气——意料之中。" },
  { ref: V(2), daysAgo: 236, title: "换机油", vendor: "快车道养护", cost: 89.95, mileage: 91200 },
  { ref: E(24), daysAgo: 250, title: "更换出租屋灶具加热盘", vendor: "雪松物业服务", cost: 145 },
  { ref: V(1), daysAgo: 268, title: "更换四条轮胎", vendor: "折扣轮胎", cost: 812.6, mileage: 24100, receipt: "tire-invoice.pdf" },
  { ref: E(17), daysAgo: 288, title: "迷你分体深度清洗", vendor: "北林暖通", cost: 340, description: "风轮上积满了霉菌。风量明显改善。" },
  { ref: P(1), daysAgo: 310, title: "冬季防护——吹空水管", vendor: "日内瓦井泵服务", cost: 195 },
  { ref: E(2), daysAgo: 340, title: "更换灶具点火器", vendor: "自行处理", cost: 42.5 },
  { ref: V(4), daysAgo: 366, title: "换机油与四轮定位", vendor: "春田本田", cost: 214.3, mileage: 44800 },
  { ref: E(29), daysAgo: 392, title: "更换热水器安全阀", vendor: "皮奥里亚机械", cost: 165 },
  { ref: P(0), daysAgo: 430, title: "移除枯死白蜡树", vendor: "树木养护", cost: 1450, receipt: "tree-removal.pdf" },
  { ref: V(3), daysAgo: 468, title: "换机油", vendor: "湖畔汽修", cost: 78.5, mileage: 131900 },
  { ref: E(12), daysAgo: 505, title: "更换车库门弹簧", vendor: "顶棚门业", cost: 289 },
  { ref: E(1), daysAgo: 548, title: "洗碗机不排水", vendor: "家电维修通", cost: 198, description: "更换了止回阀。" },
  { ref: V(0), daysAgo: 590, title: "更换刹车油", vendor: "春田丰田", cost: 149, mileage: 51200 },
  { ref: P(2), daysAgo: 640, title: "屋顶维修——风灾损坏", vendor: "皮奥里亚屋顶工程", cost: 1875, receipt: "roof-repair.pdf" },
  { ref: E(20), daysAgo: 700, title: "码头升降机电机大修", vendor: "湖畔船务", cost: 720 },
  { ref: E(26), daysAgo: 760, title: "安装出租屋洗衣机", vendor: "雪松物业服务", cost: 0, description: "租客反映漏水后更换了原机。" },
]

const WARRANTIES: {
  ref: Ref; productName: string; vendor: string; phone?: string; email?: string
  boughtDaysAgo: number; expiresInDays: number | null; notes?: string; receipt?: string
}[] = [
  // Expired
  { ref: E(3), productName: "微波炉——1 年有限保修", vendor: "松下", boughtDaysAgo: 420, expiresInDays: -55, phone: "800-211-7262" },
  { ref: E(13), productName: "门铃摄像头——1 年", vendor: "Ring", boughtDaysAgo: 410, expiresInDays: -45, email: "support@ring.com" },
  { ref: V(3), productName: "动力总成——5 年 / 6 万公里", vendor: "斯巴鲁（美国）", boughtDaysAgo: 980, expiresInDays: -190 },

  // Expiring soon — these drive the dashboard panel
  { ref: E(0), productName: "冰箱——密封系统", vendor: "LG 电子", boughtDaysAgo: 640, expiresInDays: 18, phone: "800-243-0000", notes: "仅限密封系统。压缩机保修 10 年，其余部件已过期。", receipt: "lg-warranty.pdf" },
  { ref: E(21), productName: "备用发电机——5 年有限保修", vendor: "Generac", boughtDaysAgo: 690, expiresInDays: 34, phone: "888-436-3722" },
  { ref: E(12), productName: "车库门开启器——仅零件", vendor: "Chamberlain", boughtDaysAgo: 560, expiresInDays: 52 },

  // Comfortably active
  { ref: E(9), productName: "热水器内胆——6 年", vendor: "Rheem", boughtDaysAgo: 1290, expiresInDays: 900, phone: "800-621-5622", receipt: "rheem-warranty.pdf" },
  { ref: E(6), productName: "暖风炉热交换器——20 年", vendor: "开利", boughtDaysAgo: 2190, expiresInDays: 5110, notes: "90 天内完成了注册，20 年保修期因此得以保留。" },
  { ref: E(7), productName: "空调压缩机——10 年", vendor: "特灵", boughtDaysAgo: 2190, expiresInDays: 1460 },
  { ref: E(17), productName: "迷你分体——12 年压缩机", vendor: "三菱电机", boughtDaysAgo: 870, expiresInDays: 3510 },
  { ref: E(10), productName: "软水机——5 年零件", vendor: "康丽根", boughtDaysAgo: 980, expiresInDays: 845 },
  { ref: V(1), productName: "动力总成——5 年 / 6 万公里", vendor: "美国本田", boughtDaysAgo: 1130, expiresInDays: 695 },
  { ref: V(4), productName: "动力总成——5 年 / 6 万公里", vendor: "美国本田", boughtDaysAgo: 1420, expiresInDays: 405 },
  { ref: E(20), productName: "码头升降机——结构保修", vendor: "ShoreStation", boughtDaysAgo: 1290, expiresInDays: 1360 },
  { ref: P(0), productName: "屋顶——30 年沥青瓦", vendor: "GAF / 一流外墙服务", boughtDaysAgo: 1620, expiresInDays: 9330, receipt: "gaf-roof-warranty.pdf" },
  { ref: E(24), productName: "出租屋灶具——1 年零件与人工", vendor: "Hotpoint", boughtDaysAgo: 760, expiresInDays: null, notes: "安装商的保修文件一直没寄回来——按无保修处理。" },
]

const MAINTENANCE: {
  ref: Ref; title: string; description?: string; intervalDays: number | null; dueInDays: number | null
  intervalMiles?: number; dueInMiles?: number; reminderDaysBefore?: number
}[] = [
  // Overdue
  { ref: E(8), title: "更换加湿器水膜", description: "Aprilaire #35 水膜。十分钟搞定。", intervalDays: 365, dueInDays: -21 },
  { ref: E(23), title: "出租屋烟雾报警器电池检查", intervalDays: 182, dueInDays: -9, reminderDaysBefore: 14 },
  { ref: V(2), title: "换机油", intervalDays: 180, dueInDays: -4, intervalMiles: 7500, dueInMiles: 500 },

  // Due soon
  { ref: E(6), title: "更换暖风炉滤网", description: "16x25x4 介质滤网——厚的那种。", intervalDays: 90, dueInDays: 6, reminderDaysBefore: 14 },
  { ref: E(11), title: "测试污水泵", description: "往集水坑倒一桶水，确认泵能自动启动。", intervalDays: 90, dueInDays: 11 },
  { ref: P(1), title: "小屋冬季防护——吹空水管", description: "首次强冻前完成。日内瓦井泵服务承接，需提前两周预约。", intervalDays: 365, dueInDays: 19, reminderDaysBefore: 30 },
  { ref: E(16), title: "烟囱清扫", intervalDays: 365, dueInDays: 24, reminderDaysBefore: 30 },
  { ref: V(0), title: "换机油", intervalDays: 180, dueInDays: 27, intervalMiles: 7500, dueInMiles: 4900 },

  // Comfortably ahead
  { ref: E(10), title: "补充软水机盐", intervalDays: 60, dueInDays: 38 },
  { ref: E(9), title: "冲洗热水器", intervalDays: 365, dueInDays: 52 },
  { ref: P(0), title: "清理排水沟", description: "一年两次——春季和落叶之后。", intervalDays: 182, dueInDays: 61 },
  { ref: E(21), title: "发电机机油与滤芯", intervalDays: 365, dueInDays: 74, reminderDaysBefore: 21 },
  { ref: E(7), title: "入夏前空调保养", intervalDays: 365, dueInDays: 96 },
  { ref: V(1), title: "换机油", intervalDays: 180, dueInDays: 104, intervalMiles: 7500, dueInMiles: 6100 },
  { ref: E(28), title: "锅炉年度保养", description: "这个年头没得商量。", intervalDays: 365, dueInDays: 118, reminderDaysBefore: 30 },
  { ref: E(18), title: "井水水质检测", description: "大肠杆菌和硝酸盐检测。", intervalDays: 365, dueInDays: 132 },
  { ref: P(2), title: "HVAC 滤网——出租屋", intervalDays: 90, dueInDays: 41 },
  { ref: E(5), title: "清理烘干机通风管道", description: "从机体一直通到室外风口，不只是清理绒毛网。", intervalDays: 365, dueInDays: 147 },
  { ref: V(4), title: "轮胎换位", intervalDays: 180, dueInDays: 158, intervalMiles: 7500, dueInMiles: 5200 },
  { ref: E(19), title: "小屋热水器阳极棒检查", intervalDays: 730, dueInDays: 186 },
  { ref: E(20), title: "码头升降机钢缆检查", intervalDays: 365, dueInDays: 205 },
  { ref: E(22), title: "打磨链锯链条", intervalDays: 180, dueInDays: 74 },
  { ref: V(3), title: "正时皮带——10.5 万公里周期", intervalDays: null, dueInDays: null, intervalMiles: 105000, dueInMiles: 3200 },
  { ref: E(1), title: "清洗洗碗机滤网", intervalDays: 90, dueInDays: 33 },
]

// ─── People ──────────────────────────────────────────────────────────────────

type VisitSeed = {
  personId: string
  providerId: string | null
  conditionId: string | null
  vendor: string
  days: number
  title: string
  category: "OFFICE_VISIT" | "DENTAL" | "PRESCRIPTION"
  cost: number
}

async function seedPeople(userId: string) {
  const drChen = await prisma.provider.create({ data: { name: "陈玛丽 医生", specialty: "全科医学", practice: "河畔家庭医疗", phone: "555-201-4410" } })
  const drPatel = await prisma.provider.create({ data: { name: "帕特尔 医生", specialty: "口腔科", practice: "明洁口腔", phone: "555-201-8832" } })
  const drOkafor = await prisma.provider.create({ data: { name: "奥卡佛 医生", specialty: "儿科", practice: "河畔家庭医疗", phone: "555-201-4411" } })

  const adult = await prisma.person.create({ data: { name: ADMIN_NAME, relationship: "SELF", dateOfBirth: new Date("1984-03-12"), bloodType: "O+", primaryProviderId: drChen.id } })
  const child = await prisma.person.create({ data: { name: "李小雨", relationship: "CHILD", dateOfBirth: new Date("2016-08-30"), primaryProviderId: drOkafor.id } })

  const hypertension = await prisma.healthCondition.create({ data: { personId: adult.id, name: "高血压", status: "MANAGED", diagnosedDate: at(-900), providerId: drChen.id } })
  await prisma.healthCondition.create({ data: { personId: child.id, name: "季节性哮喘", status: "ACTIVE", diagnosedDate: at(-500), providerId: drOkafor.id } })

  await prisma.medication.create({ data: { personId: adult.id, name: "赖诺普利", dosage: "10 mg", frequency: "每日一次", prescriberId: drChen.id, conditionId: hypertension.id, startDate: at(-890), refillIntervalDays: 30, nextRefillDate: at(4), pharmacy: "主街沃尔格林药房" } })
  await prisma.medication.create({ data: { personId: child.id, name: "阿莫西林", dosage: "250 mg", frequency: "每日三次", prescriberId: drOkafor.id, startDate: at(-200), endDate: at(-190) } })

  await prisma.allergy.create({ data: { personId: child.id, substance: "青霉素", severity: "SEVERE", reaction: "荨麻疹、面部肿胀" } })
  await prisma.allergy.create({ data: { personId: adult.id, substance: "花粉", severity: "MILD", reaction: "打喷嚏" } })

  await prisma.immunization.create({ data: { personId: adult.id, vaccine: "百白破（Tdap）", dateGiven: at(-3400), nextDueDate: at(250) } })
  await prisma.immunization.create({ data: { personId: child.id, vaccine: "流感疫苗", dateGiven: at(-340), nextDueDate: at(20) } })

  const both = { connect: [{ id: adult.id }, { id: child.id }] }
  await prisma.insurancePolicy.create({ data: { carrier: "蓝十字", planName: "PPO 家庭计划", kind: "MEDICAL", memberId: "XJH448201", groupNumber: "77120", phone: "800-555-0199", startDate: at(-600), endDate: at(45), deductible: 3000, outOfPocketMax: 8000, members: both } })
  await prisma.insurancePolicy.create({ data: { carrier: "Delta 牙科", kind: "DENTAL", memberId: "DD-5521", startDate: at(-600), members: both } })

  const visits: VisitSeed[] = [
    { personId: adult.id, providerId: drChen.id, conditionId: hypertension.id, vendor: drChen.name, days: -60, title: "血压复诊", category: "OFFICE_VISIT", cost: 45 },
    { personId: adult.id, providerId: drChen.id, conditionId: null, vendor: drChen.name, days: -200, title: "年度体检", category: "OFFICE_VISIT", cost: 0 },
    { personId: adult.id, providerId: drPatel.id, conditionId: null, vendor: drPatel.name, days: -120, title: "洗牙", category: "DENTAL", cost: 85 },
    { personId: child.id, providerId: drOkafor.id, conditionId: null, vendor: drOkafor.name, days: -195, title: "耳部感染", category: "OFFICE_VISIT", cost: 35 },
    { personId: child.id, providerId: null, conditionId: null, vendor: "主街沃尔格林药房", days: -194, title: "阿莫西林处方", category: "PRESCRIPTION", cost: 12.5 },
  ]
  for (const v of visits) {
    const record = await prisma.serviceRecord.create({
      data: {
        assetType: "PERSON", assetId: v.personId, date: at(v.days), title: v.title, category: v.category,
        cost: v.cost, vendor: v.vendor, providerId: v.providerId, conditionId: v.conditionId, createdById: userId,
      },
    })
    await attach("SERVICE", record.id, userId, `${v.title}.pdf`, [v.title, v.vendor, `Amount due: $${v.cost.toFixed(2)}`])
  }

  await prisma.maintenanceSchedule.create({ data: { assetType: "PERSON", assetId: adult.id, title: "年度体检", intervalDays: 365, nextDueDate: at(165) } })
  await prisma.maintenanceSchedule.create({ data: { assetType: "PERSON", assetId: child.id, title: "洗牙", intervalDays: 180, nextDueDate: at(10) } })
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  await confirmWipe()

  console.log("  正在清空数据库…")
  await wipe()

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  const user = await prisma.user.create({
    data: { name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash, role: "ADMIN", mustResetPassword: false },
  })

  console.log("  正在创建资产…")
  const properties: { id: string }[] = []
  for (const p of PROPERTIES) {
    properties.push(
      await prisma.property.create({
        data: {
          name: p.name, type: p.type, address: p.address, sqFt: p.sqFt, yearBuilt: p.yearBuilt,
          purchaseDate: at(-p.boughtDaysAgo), purchasePrice: p.price, notes: p.notes,
        },
      })
    )
  }

  const vehicles: { id: string; currentMileage: number | null }[] = []
  for (const v of VEHICLES) {
    vehicles.push(
      await prisma.vehicle.create({
        data: {
          name: v.name, make: v.make, model: v.model, year: v.year, color: v.color, vin: v.vin,
          currentMileage: v.mileage, purchaseDate: at(-v.boughtDaysAgo), notes: v.notes,
        },
      })
    )
  }

  const equipment: { id: string }[] = []
  for (const e of EQUIPMENT) {
    equipment.push(
      await prisma.equipment.create({
        data: {
          name: e.name, category: e.category, manufacturer: e.manufacturer, modelNumber: e.model,
          serialNumber: `${e.manufacturer.slice(0, 3).toUpperCase()}-${String(100000 + equipment.length * 7331).slice(0, 6)}`,
          location: e.location, propertyId: properties[e.house].id,
          purchaseDate: at(-e.installedDaysAgo - 3), installDate: at(-e.installedDaysAgo),
          purchasePrice: e.price, notes: e.notes ?? null,
        },
      })
    )
  }

  const resolve = (ref: Ref) =>
    ref.kind === "property"
      ? { assetId: properties[ref.index].id, assetType: "PROPERTY" as const }
      : ref.kind === "vehicle"
        ? { assetId: vehicles[ref.index].id, assetType: "VEHICLE" as const }
        : { assetId: equipment[ref.index].id, assetType: "EQUIPMENT" as const }

  console.log("  正在创建历史记录…")
  for (const s of SERVICE) {
    const record = await prisma.serviceRecord.create({
      data: {
        ...resolve(s.ref), date: at(-s.daysAgo), title: s.title, description: s.description ?? null,
        vendor: s.vendor, cost: s.cost, mileageAtService: s.mileage ?? null, createdById: user.id,
      },
    })
    if (s.receipt) {
      await attach("SERVICE", record.id, user.id, s.receipt, [
        "SERVICE INVOICE",
        `Work: ${s.title}`,
        `Vendor: ${s.vendor ?? "—"}`,
        `Date: ${at(-s.daysAgo).toLocaleDateString()}`,
        `Total: $${(s.cost ?? 0).toFixed(2)}`,
        "",
        "Demo document generated by seed-demo.ts",
      ])
    }
  }

  for (const w of WARRANTIES) {
    const warranty = await prisma.warranty.create({
      data: {
        ...resolve(w.ref), productName: w.productName, vendor: w.vendor,
        vendorPhone: w.phone ?? null, vendorEmail: w.email ?? null,
        purchaseDate: at(-w.boughtDaysAgo),
        expirationDate: w.expiresInDays === null ? null : at(w.expiresInDays),
        notes: w.notes ?? null,
      },
    })
    if (w.receipt) {
      await attach("WARRANTY", warranty.id, user.id, w.receipt, [
        "WARRANTY CERTIFICATE",
        `Coverage: ${w.productName}`,
        `Provider: ${w.vendor}`,
        `Purchased: ${at(-w.boughtDaysAgo).toLocaleDateString()}`,
        `Expires: ${w.expiresInDays === null ? "—" : at(w.expiresInDays).toLocaleDateString()}`,
        "",
        "Demo document generated by seed-demo.ts",
      ])
    }
  }

  for (const m of MAINTENANCE) {
    const asset = resolve(m.ref)
    const vehicle = m.ref.kind === "vehicle" ? vehicles[m.ref.index] : null
    await prisma.maintenanceSchedule.create({
      data: {
        ...asset, title: m.title, description: m.description ?? null,
        intervalDays: m.intervalDays, intervalMiles: m.intervalMiles ?? null,
        nextDueDate: m.dueInDays === null ? null : at(m.dueInDays),
        nextDueMileage: m.dueInMiles != null && vehicle?.currentMileage != null
          ? vehicle.currentMileage + m.dueInMiles
          : null,
        lastCompletedDate: m.dueInDays !== null && m.intervalDays !== null
          ? at(m.dueInDays - m.intervalDays)
          : null,
        lastCompletedMileage: m.intervalMiles != null && m.dueInMiles != null && vehicle?.currentMileage != null
          ? vehicle.currentMileage + m.dueInMiles - m.intervalMiles
          : null,
        reminderDaysBefore: m.reminderDaysBefore ?? 14,
        isActive: true,
      },
    })
  }

  console.log(SKIP_IMAGES ? "  正在生成占位图片…" : "  正在下载照片…")
  const categoryFallback: Record<EquipmentCategory, string> = {
    APPLIANCE: "home appliance", HVAC: "heating ventilation air conditioning", WATER: "plumbing",
    ELECTRONICS: "consumer electronics", TOOL: "power tool", OUTDOOR: "garden equipment",
    SECURITY: "home security", OTHER: "hardware",
  }

  console.log("  正在创建成员…")
  await seedPeople(user.id)

  const jobs: PhotoJob[] = [
    ...properties.map((p, i) => ({ kind: "properties" as const, id: p.id, query: PROPERTIES[i].photo, fallbackQuery: "house exterior", variant: i })),
    ...vehicles.map((v, i) => ({ kind: "vehicles" as const, id: v.id, query: VEHICLES[i].photo, fallbackQuery: "automobile", variant: i })),
    ...equipment.map((e, i) => ({ kind: "equipment" as const, id: e.id, query: EQUIPMENT[i].photo, fallbackQuery: categoryFallback[EQUIPMENT[i].category], variant: i })),
  ]
  const photos = await writePhotos(jobs)

  for (const p of properties) await prisma.property.update({ where: { id: p.id }, data: { imageFilename: photos.get(p.id) } })
  for (const v of vehicles) await prisma.vehicle.update({ where: { id: v.id }, data: { imageFilename: photos.get(v.id) } })
  for (const e of equipment) await prisma.equipment.update({ where: { id: e.id }, data: { imageFilename: photos.get(e.id) } })

  const overdue = await prisma.maintenanceSchedule.count({ where: { isActive: true, nextDueDate: { lt: new Date() } } })
  const dueSoon = await prisma.maintenanceSchedule.count({
    where: { isActive: true, nextDueDate: { gte: new Date(), lte: at(30) } },
  })
  const expiring = await prisma.warranty.count({ where: { expirationDate: { gte: new Date(), lte: at(60) } } })
  const expired = await prisma.warranty.count({ where: { expirationDate: { lt: new Date() } } })

  console.log(`
  \x1b[32m完成。\x1b[0m

    房产 ${properties.length} 处、车辆 ${vehicles.length} 辆、设备 ${equipment.length} 台
    维护记录 ${SERVICE.length} 条、保修 ${WARRANTIES.length} 条、提醒 ${MAINTENANCE.length} 条
    附件 ${await prisma.attachment.count()} 个
    成员 ${await prisma.person.count()} 位、医生 ${await prisma.provider.count()} 位、保单 ${await prisma.insurancePolicy.count()} 份
    照片：缓存 ${cached}、下载 ${downloaded}、生成 ${generated}

  时间线（相对今天）：
    维护已逾期 ${overdue} 条、30 天内到期 ${dueSoon} 条
    保修已过期 ${expired} 条、60 天内到期 ${expiring} 条

  登录：  ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
