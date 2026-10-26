// What a medical summary includes. Lives in the URL (?allergies=1&obs=90...) so
// a configured report can be bookmarked and the page stays a plain server
// render. Pure and client-safe: the sidebar and the page share it.

export const OBS_RANGES = [
  { value: "off", label: "关闭" },
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "365", label: "12 个月" },
  { value: "730", label: "2 年" },
  { value: "1095", label: "3 年" },
  { value: "1825", label: "5 年" },
  { value: "all", label: "全部时间" },
] as const
export const HISTORY_RANGES = [
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "365", label: "12 个月" },
  { value: "730", label: "2 年" },
  { value: "1095", label: "3 年" },
  { value: "1825", label: "5 年" },
  { value: "all", label: "全部时间" },
] as const
export const MED_NOTES = [
  { value: "off", label: "不含备注" },
  { value: "last", label: "仅最新一条" },
  { value: "all", label: "全部条目" },
] as const
export const OBS_VIEWS = [
  { value: "heatmap", label: "热力图" },
  { value: "histogram", label: "每日严重度直方图" },
  { value: "none", label: "无图表" },
] as const
export const VISIT_MODES = [
  { value: "off", label: "关闭" },
  { value: "cost", label: "包含，含费用" },
  { value: "nocost", label: "包含，不含费用" },
] as const

export type ObsRange = (typeof OBS_RANGES)[number]["value"]
export type HistoryRange = (typeof HISTORY_RANGES)[number]["value"]
export type MedNotes = (typeof MED_NOTES)[number]["value"]
export type ObsView = (typeof OBS_VIEWS)[number]["value"]
export type VisitMode = (typeof VISIT_MODES)[number]["value"]

export type ReportOptions = {
  allergies: boolean
  conditions: boolean
  medications: boolean
  immunizations: boolean
  insurance: boolean
  careTeam: boolean
  review: boolean
  history: boolean
  historyRange: HistoryRange
  medList: boolean
  medListNotes: MedNotes
  changes: boolean
  obs: ObsRange
  obsView: ObsView
  obsList: boolean
  obsNotes: boolean
  expense: boolean
  visits: VisitMode
  reminders: boolean
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  allergies: false,
  conditions: true,
  medications: true,
  immunizations: false,
  insurance: false,
  careTeam: false,
  review: false,
  history: true,
  historyRange: "all",
  medList: false,
  medListNotes: "off",
  changes: false,
  obs: "off",
  obsView: "heatmap",
  obsList: true,
  obsNotes: false,
  expense: false,
  visits: "off",
  reminders: false,
}

const BOOLEAN_KEYS = [
  "allergies", "conditions", "medications", "immunizations", "insurance", "careTeam",
  "review", "history", "medList", "changes", "obsList", "obsNotes", "expense", "reminders",
] as const

type Params = Record<string, string | string[] | undefined>

function pick<T extends string>(raw: string | string[] | undefined, choices: readonly { value: T }[], fallback: T): T {
  const v = Array.isArray(raw) ? raw[0] : raw
  return choices.find((c) => c.value === v)?.value ?? fallback
}

export function parseReportOptions(params: Params): ReportOptions {
  const out: ReportOptions = { ...DEFAULT_REPORT_OPTIONS }
  for (const k of BOOLEAN_KEYS) {
    const v = Array.isArray(params[k]) ? params[k]![0] : params[k]
    if (v === "1") out[k] = true
    else if (v === "0") out[k] = false
  }
  out.obs = pick(params.obs, OBS_RANGES, DEFAULT_REPORT_OPTIONS.obs)
  out.historyRange = pick(params.historyRange, HISTORY_RANGES, DEFAULT_REPORT_OPTIONS.historyRange)
  out.medListNotes = pick(params.medListNotes, MED_NOTES, DEFAULT_REPORT_OPTIONS.medListNotes)
  out.obsView = pick(params.obsView, OBS_VIEWS, DEFAULT_REPORT_OPTIONS.obsView)
  out.visits = pick(params.visits, VISIT_MODES, DEFAULT_REPORT_OPTIONS.visits)
  return out
}

export function reportOptionsQuery(o: ReportOptions): string {
  const q = new URLSearchParams()
  for (const k of BOOLEAN_KEYS) q.set(k, o[k] ? "1" : "0")
  q.set("obs", o.obs)
  q.set("historyRange", o.historyRange)
  q.set("medListNotes", o.medListNotes)
  q.set("obsView", o.obsView)
  q.set("visits", o.visits)
  return q.toString()
}

/// Days to show; `null` when observations are off, `"all"` for all time.
export const obsDays = (o: ReportOptions): number | "all" | null =>
  o.obs === "off" ? null : o.obs === "all" ? "all" : Number(o.obs)

export const rangeLabel = (days: number | "all") =>
  days === "all" ? "全部时间"
    : days === 365 ? "最近 12 个月"
    : days > 365 && days % 365 === 0 ? `最近 ${days / 365} 年`
    : `最近 ${days} 天`
