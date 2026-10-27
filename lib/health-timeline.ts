/// 医疗时间线：把成员的六类健康数据（就诊 / 观察 / 病症 / 用药 / 疫苗 / 过敏）
/// 合并成一条按时间排列的事件流，并做关键词提取与费用趋势统计。
/// 纯函数、不碰数据库和 React，保持可单测（见 health-timeline.test.ts）。

export type TimelineEventType =
  | "visit"
  | "observation"
  | "condition"
  | "medication"
  | "immunization"
  | "allergy"

export interface TimelineEvent {
  /** `${type}:${源记录 id}`，用作 React key 与去重。 */
  id: string
  type: TimelineEventType
  /** ISO 日期串（过敏等无日期的事件用创建时间兜底）。 */
  date: string
  title: string
  detail: string | null
  /** 仅就诊记录有费用。 */
  cost: number | null
  /** 仅观察记录有严重度 1-5。 */
  severity: number | null
  keywords: string[]
  /** 过敏置顶。 */
  pinned: boolean
  /** 补充说明，如医生/机构、剂量、疫苗针次。 */
  meta: string | null
}

// —— 输入形状（结构化最小字段，Prisma 查询结果天然兼容） ——

export interface VisitInput {
  id: string
  date: Date
  title: string
  description: string | null
  cost: number | null
  vendor: string | null
  conditionId: string | null
}

export interface ObservationInput {
  id: string
  date: Date
  type: string
  severity: number | null
  notes: string | null
  tags: string | null
  conditionId: string | null
}

export interface ConditionInput {
  id: string
  name: string
  status: string
  diagnosedDate: Date | null
  resolvedDate: Date | null
  notes: string | null
}

export interface MedicationInput {
  id: string
  name: string
  dosage: string | null
  startDate: Date | null
  endDate: Date | null
  notes: string | null
  conditionId: string | null
}

export interface ImmunizationInput {
  id: string
  vaccine: string
  dateGiven: Date
  dose: string | null
  givenBy: string | null
  notes: string | null
}

export interface AllergyInput {
  id: string
  substance: string
  reaction: string | null
  severity: string
  notes: string | null
  createdAt: Date
}

export interface TimelineInput {
  visits: VisitInput[]
  observations: ObservationInput[]
  conditions: ConditionInput[]
  medications: MedicationInput[]
  immunizations: ImmunizationInput[]
  allergies: AllergyInput[]
}

// —— 关键词提取 ——

/** 常见医疗场景词库：命中即成为关键词。顺序即优先级（靠前优先保留）。 */
const KEYWORD_DICTIONARY = [
  // 诊疗场景
  "体检", "复查", "随访", "复诊", "初诊", "会诊", "转诊", "急诊", "住院", "出院", "手术", "术后",
  // 检查检验
  "血常规", "尿常规", "便常规", "血糖", "血脂", "肝功", "肾功", "甲功", "心电图", "B超", "彩超",
  "CT", "核磁", "MRI", "X光", "胸片", "拍片", "造影", "骨密度", "幽门螺杆菌",
  // 处置
  "输液", "打针", "换药", "拆线", "理疗", "针灸", "接种", "疫苗",
  // 科室
  "眼科", "牙科", "口腔", "耳鼻喉", "皮肤科", "儿科", "妇科", "骨科", "内科", "外科", "中医",
  // 日常
  "视力", "验光", "洗牙", "补牙", "拔牙", "根管", "配镜",
]

/**
 * 从一段文本中提取关键词：词库命中 + 额外词（该成员的病症名 / 用药名）命中。
 * 疫苗名支持组合词，如“流感疫苗接种”会提取出“流感疫苗”。
 */
export function extractKeywords(text: string | null | undefined, extraTerms: string[] = []): string[] {
  if (!text) return []
  const found: string[] = []
  const push = (kw: string) => {
    if (kw && !found.includes(kw)) found.push(kw)
  }
  // 1. 组合疫苗名优先（避免只命中到泛化的“疫苗”）
  const vaccineMatches = text.match(/[\u4e00-\u9fa5A-Za-z]{1,8}疫苗/g) ?? []
  for (const m of vaccineMatches) push(m)
  // 2. 该成员的病症名 / 用药名
  for (const term of extraTerms) {
    if (term && term.length >= 2 && text.includes(term)) push(term)
  }
  // 3. 通用词库
  for (const term of KEYWORD_DICTIONARY) {
    if (text.includes(term)) push(term)
  }
  return found
}

// —— 事件构建 ——

const ALLERGY_SEVERITY_LABEL: Record<string, string> = {
  MILD: "轻度",
  MODERATE: "中度",
  SEVERE: "重度",
}

/** 每条事件最多保留的关键词个数，防止胶囊挤爆节点。 */
const MAX_KEYWORDS = 4

export function buildTimelineEvents(input: TimelineInput): TimelineEvent[] {
  const conditionNames = new Map(input.conditions.map((c) => [c.id, c.name]))
  const conditionNameList = input.conditions.map((c) => c.name)
  const medicationNameList = input.medications.map((m) => m.name)
  const extraTerms = [...conditionNameList, ...medicationNameList]

  const events: TimelineEvent[] = []

  for (const v of input.visits) {
    const ownCondition = v.conditionId ? conditionNames.get(v.conditionId) : undefined
    const text = `${v.title} ${v.description ?? ""} ${ownCondition ?? ""}`
    events.push({
      id: `visit:${v.id}`,
      type: "visit",
      date: v.date.toISOString(),
      title: v.title,
      detail: v.description,
      cost: v.cost,
      severity: null,
      keywords: extractKeywords(text, extraTerms).slice(0, MAX_KEYWORDS),
      pinned: false,
      meta: v.vendor || null,
    })
  }

  for (const o of input.observations) {
    const ownCondition = o.conditionId ? conditionNames.get(o.conditionId) : undefined
    const text = [o.type, o.notes, ownCondition, o.tags].filter(Boolean).join(" ")
    const tagKeywords = (o.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
    const keywords = [...new Set([...extractKeywords(text, extraTerms), ...tagKeywords])]
    events.push({
      id: `observation:${o.id}`,
      type: "observation",
      date: o.date.toISOString(),
      title: o.type,
      detail: o.notes,
      cost: null,
      severity: o.severity,
      keywords: keywords.slice(0, MAX_KEYWORDS),
      pinned: false,
      meta: ownCondition || null,
    })
  }

  for (const c of input.conditions) {
    // 已确诊的病症以确诊日期入线；未填日期的退回创建时间无意义，跳过。
    if (!c.diagnosedDate) continue
    events.push({
      id: `condition:${c.id}`,
      type: "condition",
      date: c.diagnosedDate.toISOString(),
      title: c.name,
      detail: c.notes,
      cost: null,
      severity: null,
      keywords: [c.name, ...extractKeywords(`${c.name} ${c.notes ?? ""}`, extraTerms)]
        .filter((kw, i, arr) => arr.indexOf(kw) === i)
        .slice(0, MAX_KEYWORDS),
      pinned: false,
      meta: c.status === "RESOLVED" ? "已痊愈" : c.status === "MANAGED" ? "已控制" : "治疗中",
    })
  }

  for (const m of input.medications) {
    if (!m.startDate) continue
    const ownCondition = m.conditionId ? conditionNames.get(m.conditionId) : undefined
    const active = !m.endDate
    events.push({
      id: `medication:${m.id}`,
      type: "medication",
      date: m.startDate.toISOString(),
      title: m.name,
      detail: m.notes,
      cost: null,
      severity: null,
      keywords: [m.name, ...extractKeywords(`${m.name} ${m.notes ?? ""} ${ownCondition ?? ""}`, extraTerms)]
        .filter((kw, i, arr) => arr.indexOf(kw) === i)
        .slice(0, MAX_KEYWORDS),
      pinned: false,
      meta: [m.dosage, active ? "在服" : "已停用"].filter(Boolean).join(" · ") || null,
    })
  }

  for (const im of input.immunizations) {
    events.push({
      id: `immunization:${im.id}`,
      type: "immunization",
      date: im.dateGiven.toISOString(),
      title: im.vaccine,
      detail: im.notes,
      cost: null,
      severity: null,
      keywords: [im.vaccine, ...extractKeywords(`${im.vaccine} ${im.notes ?? ""}`, extraTerms)]
        .filter((kw, i, arr) => arr.indexOf(kw) === i)
        .slice(0, MAX_KEYWORDS),
      pinned: false,
      meta: [im.dose, im.givenBy].filter(Boolean).join(" · ") || null,
    })
  }

  for (const a of input.allergies) {
    events.push({
      id: `allergy:${a.id}`,
      type: "allergy",
      date: a.createdAt.toISOString(),
      title: a.substance,
      detail: a.reaction ?? a.notes,
      cost: null,
      severity: null,
      keywords: [a.substance, ...extractKeywords(`${a.substance} ${a.reaction ?? ""} ${a.notes ?? ""}`, extraTerms)]
        .filter((kw, i, arr) => arr.indexOf(kw) === i)
        .slice(0, MAX_KEYWORDS),
      pinned: true,
      meta: ALLERGY_SEVERITY_LABEL[a.severity] ?? null,
    })
  }

  // 新的在前；同为 pinned 的过敏单独置顶，这里按时间排即可。
  events.sort((a, b) => (a.date < b.date ? 1 : -1))
  return events
}

// —— 分组与趋势 ——

export interface MonthGroup {
  month: number // 1-12
  events: TimelineEvent[]
  cost: number
}

export interface YearGroup {
  year: number
  months: MonthGroup[]
  events: TimelineEvent[]
  cost: number
}

/** 事件按年 → 月分组（费用按月累加）。events 需已按新→旧排序。 */
export function groupByYearMonth(events: TimelineEvent[]): YearGroup[] {
  const yearMap = new Map<number, Map<number, TimelineEvent[]>>()
  for (const e of events) {
    const d = new Date(e.date)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    if (!yearMap.has(year)) yearMap.set(year, new Map())
    const monthMap = yearMap.get(year)!
    if (!monthMap.has(month)) monthMap.set(month, [])
    monthMap.get(month)!.push(e)
  }
  const years = [...yearMap.keys()].sort((a, b) => b - a)
  return years.map((year) => {
    const monthMap = yearMap.get(year)!
    const months = [...monthMap.keys()].sort((a, b) => b - a).map((month) => {
      const monthEvents = monthMap.get(month)!
      return {
        month,
        events: monthEvents,
        cost: monthEvents.reduce((sum, e) => sum + (e.cost ?? 0), 0),
      }
    })
    return {
      year,
      months,
      events: months.flatMap((m) => m.events),
      cost: months.reduce((sum, m) => sum + m.cost, 0),
    }
  })
}

/** 时间线头部「近 N 个月就诊费用」趋势数据，缺月补 0。旧→新排列。 */
export function recentMonthlyCosts(
  events: TimelineEvent[],
  now: Date,
  months = 12,
): { year: number; month: number; cost: number }[] {
  const buckets = new Map<string, number>()
  for (const e of events) {
    if (e.cost == null) continue
    const d = new Date(e.date)
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`
    buckets.set(key, (buckets.get(key) ?? 0) + e.cost)
  }
  const out: { year: number; month: number; cost: number }[] = []
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  for (let i = 0; i < months; i++) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    out.push({ year, month, cost: buckets.get(`${year}-${month}`) ?? 0 })
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }
  return out.reverse()
}

/** 关键词出现频次（用于顶部胶囊排序），频次高在前。 */
export function keywordFrequencies(events: TimelineEvent[]): { keyword: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    for (const kw of e.keywords) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "zh-Hans-CN"))
}
