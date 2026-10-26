import type { AreaUnit, DateFormat, DistanceUnit, MeterUnit } from "@/app/generated/prisma/client"

// The one place money, distances, areas and dates are written. Pure, so the
// server (getFormat) and the client (useFormat) share it. Label only: a unit
// setting says what stored numbers mean, it never converts them.

export type Regional = { currency: string; distanceUnit: DistanceUnit; areaUnit: AreaUnit; dateFormat: DateFormat; hour12: boolean }

export const DEFAULT_REGIONAL: Regional = { currency: "CNY", distanceUnit: "KM", areaUnit: "SQM", dateFormat: "ISO", hour12: false }

/** Shown first in the currency picker. */
export const COMMON_CURRENCIES = ["CNY", "USD", "EUR", "GBP", "JPY", "HKD", "CAD", "AUD"]

export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && Intl.supportedValuesOf("currency").includes(code)
}

const SHORT = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
const LONG = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
const pad = (n: number) => String(n).padStart(2, "0")

type When = Date | string | number
const toDate = (d: When) => (d instanceof Date ? d : new Date(d))

function ymd(d: Date, utc: boolean) {
  return utc
    ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() }
    : { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() }
}

function currencyFormat(currency: string, opts: Intl.NumberFormatOptions = {}): Intl.NumberFormat | null {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, ...opts })
  } catch {
    return null
  }
}

export function createFormatter(r: Regional) {
  const full = currencyFormat(r.currency)
  const whole = currencyFormat(r.currency, { maximumFractionDigits: 0, minimumFractionDigits: 0 })
  const currencySymbol = full?.formatToParts(0).find((p) => p.type === "currency")?.value ?? r.currency
  const km = r.distanceUnit === "KM"
  const sqm = r.areaUnit === "SQM"

  const money = (n: number) =>
    full ? full.format(n) : `${r.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const date = (d: When, opts: { utc?: boolean; long?: boolean } = {}) => {
    const { y, m, day } = ymd(toDate(d), !!opts.utc)
    const mon = (opts.long ? LONG : SHORT)[m]
    switch (r.dateFormat) {
      case "DMY_SHORT": return `${y}年${mon}${day}日`
      case "MDY_NUM": return `${pad(m + 1)}/${pad(day)}/${y}`
      case "DMY_NUM": return `${pad(day)}/${pad(m + 1)}/${y}`
      case "ISO": return `${y}-${pad(m + 1)}-${pad(day)}`
      default: return `${y}年${mon}${day}日`
    }
  }

  /** Numeric with a two-digit year, for tight spaces: "01/05/24". Text formats fall back on their numeric order. */
  const dateNumeric = (d: When, opts: { utc?: boolean } = {}) => {
    const { y, m, day } = ymd(toDate(d), !!opts.utc)
    const yy = pad(y % 100)
    switch (r.dateFormat) {
      case "DMY_SHORT":
      case "DMY_NUM": return `${pad(day)}/${pad(m + 1)}/${yy}`
      case "ISO": return `${y}-${pad(m + 1)}-${pad(day)}`
      default: return `${pad(m + 1)}/${pad(day)}/${yy}`
    }
  }

  const dayMonth = (d: When, opts: { utc?: boolean } = {}) => {
    const { m, day } = ymd(toDate(d), !!opts.utc)
    switch (r.dateFormat) {
      case "DMY_SHORT": return `${SHORT[m]}${day}日`
      case "MDY_NUM": return `${pad(m + 1)}/${pad(day)}`
      case "DMY_NUM": return `${pad(day)}/${pad(m + 1)}`
      case "ISO": return `${pad(m + 1)}-${pad(day)}`
      default: return `${SHORT[m]}${day}日`
    }
  }

  const hm = (h: number, min: number) =>
    r.hour12 ? `${h < 12 ? "上午" : "下午"}${h % 12 || 12}:${pad(min)}` : `${pad(h)}:${pad(min)}`

  const time = (d: When) => {
    const t = toDate(d)
    return hm(t.getHours(), t.getMinutes())
  }

  return {
    currency: r.currency,
    currencySymbol,
    money,
    moneyWhole: (n: number) => (whole ? whole.format(n) : `${r.currency} ${Math.round(n).toLocaleString()}`),
    /** Axis ticks and captions: "$12.5k", "€980". */
    moneyCompact: (n: number) =>
      Math.abs(n) >= 1000 ? `${currencySymbol}${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${currencySymbol}${Math.round(n)}`,
    distanceShort: km ? "公里" : "英里",
    distanceWord: km ? "公里" : "英里",
    distanceWords: km ? "公里" : "英里",
    distanceNoun: km ? "距离" : "里程",
    meterShort: (u: MeterUnit) => (u === "HOURS" ? "小时" : km ? "公里" : "英里"),
    meterWord: (u: MeterUnit) => (u === "HOURS" ? "小时" : km ? "公里" : "英里"),
    meterNoun: (u: MeterUnit) => (u === "HOURS" ? "小时数" : km ? "距离" : "里程"),
    areaShort: sqm ? "m²" : "ft²",
    areaWords: sqm ? "平方米" : "平方英尺",
    areaLabel: sqm ? "建筑面积（m²）" : "建筑面积（平方英尺）",
    area: (n: number) => `${n.toLocaleString()} ${sqm ? "m²" : "ft²"}`,
    date,
    dateNumeric,
    dayMonth,
    time,
    /** A stored "HH:MM" wall-clock time. */
    clock: (hhmm: string | null | undefined) => {
      if (!hhmm) return ""
      const [h, min] = hhmm.split(":").map(Number)
      return hm(h, min)
    },
    dateTime: (d: When) => `${date(d)} ${time(d)}`,
  }
}

export type Formatter = ReturnType<typeof createFormatter>

export const DEFAULT_FORMAT: Formatter = createFormatter(DEFAULT_REGIONAL)
