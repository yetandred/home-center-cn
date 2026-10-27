import { describe, expect, it } from "vitest"
import {
  buildTimelineEvents,
  extractKeywords,
  groupByYearMonth,
  keywordFrequencies,
  recentMonthlyCosts,
  type TimelineInput,
} from "./health-timeline"

const utc = (iso: string) => new Date(iso)

const baseInput = (): TimelineInput => ({
  visits: [],
  observations: [],
  conditions: [],
  medications: [],
  immunizations: [],
  allergies: [],
})

describe("extractKeywords", () => {
  it("命中通用词库", () => {
    expect(extractKeywords("年度体检报告，血常规正常")).toContain("体检")
    expect(extractKeywords("年度体检报告，血常规正常")).toContain("血常规")
  })

  it("提取组合疫苗名而不只留泛化词", () => {
    const kws = extractKeywords("流感疫苗接种")
    expect(kws[0]).toBe("流感疫苗")
  })

  it("额外词（成员病症/用药名）优先于词库", () => {
    const kws = extractKeywords("原发性高血压复诊", ["原发性高血压"])
    expect(kws[0]).toBe("原发性高血压")
  })

  it("空文本返回空数组", () => {
    expect(extractKeywords(null)).toEqual([])
    expect(extractKeywords("")).toEqual([])
  })
})

describe("buildTimelineEvents", () => {
  it("六类数据合并并按时间新→旧排序", () => {
    const input = baseInput()
    input.visits = [{ id: "v1", date: utc("2026-01-10T00:00:00Z"), title: "体检", description: null, cost: 350, vendor: "市一医院", conditionId: null }]
    input.immunizations = [{ id: "i1", vaccine: "流感疫苗", dateGiven: utc("2026-10-01T00:00:00Z"), dose: null, givenBy: null, notes: null }]
    const events = buildTimelineEvents(input)
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe("immunization:i1")
    expect(events[1].id).toBe("visit:v1")
    expect(events[1].cost).toBe(350)
    expect(events[1].meta).toBe("市一医院")
  })

  it("过敏事件置顶标记并带严重度中文标签", () => {
    const input = baseInput()
    input.allergies = [{ id: "a1", substance: "青霉素", reaction: "皮疹", severity: "SEVERE", notes: null, createdAt: utc("2025-03-01T00:00:00Z") }]
    const events = buildTimelineEvents(input)
    expect(events[0].pinned).toBe(true)
    expect(events[0].meta).toBe("重度")
    expect(events[0].keywords).toContain("青霉素")
  })

  it("未填确诊日期的病症不入线；已停用/在服用药标注正确", () => {
    const input = baseInput()
    input.conditions = [{ id: "c1", name: "高血压", status: "ACTIVE", diagnosedDate: null, resolvedDate: null, notes: null }]
    input.medications = [
      { id: "m1", name: "氨氯地平", dosage: "5mg", startDate: utc("2026-02-01T00:00:00Z"), endDate: null, notes: null, conditionId: null },
      { id: "m2", name: "布洛芬", dosage: null, startDate: utc("2026-01-01T00:00:00Z"), endDate: utc("2026-01-15T00:00:00Z"), notes: null, conditionId: null },
    ]
    const events = buildTimelineEvents(input)
    expect(events.map((e) => e.id)).toEqual(["medication:m1", "medication:m2"])
    expect(events[0].meta).toContain("在服")
    expect(events[1].meta).toContain("已停用")
  })

  it("就诊文本中的成员病症名成为关键词", () => {
    const input = baseInput()
    input.conditions = [{ id: "c1", name: "过敏性鼻炎", status: "ACTIVE", diagnosedDate: utc("2025-01-01T00:00:00Z"), resolvedDate: null, notes: null }]
    input.visits = [{ id: "v1", date: utc("2026-03-01T00:00:00Z"), title: "鼻塞复诊", description: "过敏性鼻炎复查", cost: null, vendor: null, conditionId: "c1" }]
    const events = buildTimelineEvents(input)
    const visit = events.find((e) => e.id === "visit:v1")!
    expect(visit.keywords).toContain("过敏性鼻炎")
    expect(visit.keywords).toContain("复查")
  })

  it("观察记录的标签成为关键词", () => {
    const input = baseInput()
    input.observations = [{ id: "o1", date: utc("2026-05-01T00:00:00Z"), type: "发烧", severity: 4, notes: null, tags: "咳嗽, 夜醒", conditionId: null }]
    const events = buildTimelineEvents(input)
    const obs = events[0]
    expect(obs.keywords).toContain("咳嗽")
    expect(obs.keywords).toContain("夜醒")
    expect(obs.severity).toBe(4)
  })
})

describe("groupByYearMonth", () => {
  it("按年→月分组，费用逐级累加", () => {
    const input = baseInput()
    input.visits = [
      { id: "v1", date: utc("2026-01-10T00:00:00Z"), title: "A", description: null, cost: 100, vendor: null, conditionId: null },
      { id: "v2", date: utc("2026-01-20T00:00:00Z"), title: "B", description: null, cost: 50, vendor: null, conditionId: null },
      { id: "v3", date: utc("2026-03-05T00:00:00Z"), title: "C", description: null, cost: 200, vendor: null, conditionId: null },
      { id: "v4", date: utc("2025-12-01T00:00:00Z"), title: "D", description: null, cost: 999, vendor: null, conditionId: null },
    ]
    const events = buildTimelineEvents(input)
    const groups = groupByYearMonth(events)
    expect(groups.map((g) => g.year)).toEqual([2026, 2025])
    const y2026 = groups[0]
    expect(y2026.cost).toBe(350)
    expect(y2026.months.map((m) => m.month)).toEqual([3, 1]) // 月也是新→旧
    expect(y2026.months.find((m) => m.month === 1)!.cost).toBe(150)
  })
})

describe("recentMonthlyCosts", () => {
  it("近 12 个月缺月补零，旧→新排列", () => {
    const input = baseInput()
    input.visits = [
      { id: "v1", date: utc("2026-10-01T00:00:00Z"), title: "A", description: null, cost: 120, vendor: null, conditionId: null },
      { id: "v2", date: utc("2026-10-15T00:00:00Z"), title: "B", description: null, cost: 80, vendor: null, conditionId: null },
      { id: "v3", date: utc("2026-05-02T00:00:00Z"), title: "C", description: null, cost: 300, vendor: null, conditionId: null },
    ]
    const events = buildTimelineEvents(input)
    const trend = recentMonthlyCosts(events, utc("2026-10-27T00:00:00Z"))
    expect(trend).toHaveLength(12)
    expect(trend[0].year).toBe(2025)
    expect(trend[0].month).toBe(11)
    expect(trend[11]).toEqual({ year: 2026, month: 10, cost: 200 })
    const may = trend.find((t) => t.month === 5)!
    expect(may.cost).toBe(300)
    expect(trend.filter((t) => t.cost === 0)).toHaveLength(10)
  })
})

describe("keywordFrequencies", () => {
  it("按出现次数排序", () => {
    const input = baseInput()
    input.visits = [
      { id: "v1", date: utc("2026-01-10T00:00:00Z"), title: "体检", description: "体检", cost: null, vendor: null, conditionId: null },
      { id: "v2", date: utc("2026-02-10T00:00:00Z"), title: "体检", description: null, cost: null, vendor: null, conditionId: null },
    ]
    const freq = keywordFrequencies(buildTimelineEvents(input))
    expect(freq[0]).toEqual({ keyword: "体检", count: 2 }) // 单条事件内去重，两条记录各计 1
  })
})
