import { describe, expect, it } from "vitest"
import { createFormatter, DEFAULT_REGIONAL, isValidCurrency, type Regional } from "./regional"

const fmt = (o: Partial<Regional> = {}) => createFormatter({ ...DEFAULT_REGIONAL, ...o })
const DAY = new Date("2026-01-05T00:00:00Z") // a stored day (UTC midnight)

describe("defaults", () => {
  const f = fmt()
  it("money", () => {
    expect(f.money(1234.5)).toBe((1234.5).toLocaleString(undefined, { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  })
  it("compact money", () => {
    expect(f.moneyCompact(12480)).toBe("¥12.5k")
    expect(f.moneyCompact(12000)).toBe("¥12k")
    expect(f.moneyCompact(980.4)).toBe("¥980")
  })
  it("whole money", () => {
    expect(f.moneyWhole(1234.56)).toBe((1234.56).toLocaleString(undefined, { style: "currency", currency: "CNY", maximumFractionDigits: 0 }))
  })
  it("units", () => {
    expect(f.meterShort("MILES")).toBe("公里")
    expect(f.meterShort("HOURS")).toBe("小时")
    expect(f.meterNoun("MILES")).toBe("距离")
    expect(f.meterNoun("HOURS")).toBe("小时数")
    expect(f.meterWord("MILES")).toBe("公里")
    expect(f.meterWord("HOURS")).toBe("小时")
    expect(f.areaShort).toBe("m²")
  })
  it("date (UTC day)", () => {
    expect(f.date(DAY, { utc: true })).toBe("2026-01-05")
    expect(f.date(DAY, { utc: true, long: true })).toBe("2026-01-05")
  })
  it("clock", () => {
    expect(f.clock("14:30")).toBe("14:30")
    expect(f.clock("00:05")).toBe("00:05")
    expect(f.clock(null)).toBe("")
  })
})

describe("date presets", () => {
  it.each([
    ["MDY_SHORT", "2026年1月5日", "1月5日"],
    ["DMY_SHORT", "2026年1月5日", "1月5日"],
    ["MDY_NUM", "01/05/2026", "01/05"],
    ["DMY_NUM", "05/01/2026", "05/01"],
    ["ISO", "2026-01-05", "01-05"],
  ] as const)("%s", (dateFormat, full, short) => {
    const f = fmt({ dateFormat })
    expect(f.date(DAY, { utc: true })).toBe(full)
    expect(f.dayMonth(DAY, { utc: true })).toBe(short)
  })
  it("long only changes the word presets", () => {
    expect(fmt({ dateFormat: "DMY_SHORT" }).date(DAY, { utc: true, long: true })).toBe("2026年1月5日")
    expect(fmt({ dateFormat: "ISO" }).date(DAY, { utc: true, long: true })).toBe("2026-01-05")
  })
  it("accepts ISO strings and numbers", () => {
    expect(fmt().date("2026-01-05T00:00:00Z", { utc: true })).toBe("2026-01-05")
    expect(fmt().date(DAY.getTime(), { utc: true })).toBe("2026-01-05")
  })
})

describe("stored day display", () => {
  it("shows the stored UTC day, whatever the local zone", () => {
    const shown = fmt().date(new Date("2026-01-05"), { utc: true })
    expect(shown).toContain("2026")
    expect(shown).toContain("5")
    expect(shown).not.toContain("4,")
  })
})

describe("utc vs local", () => {
  it("utc reads UTC fields; default reads local fields", () => {
    const d = new Date("2026-01-05T03:30:00Z")
    const f = fmt({ dateFormat: "ISO" })
    expect(f.date(d, { utc: true })).toBe("2026-01-05")
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    expect(f.date(d)).toBe(local)
  })
})

describe("time", () => {
  const d = new Date(2026, 0, 5, 14, 7)
  it("12h", () => {
    const f = fmt({ hour12: true })
    expect(f.time(d)).toBe("下午2:07")
    expect(f.clock("00:05")).toBe("上午12:05")
  })
  it("24h", () => expect(fmt({ hour12: false }).time(d)).toBe("14:07"))
  it("24h clock", () => expect(fmt({ hour12: false }).clock("09:05")).toBe("09:05"))
  it("clock", () => {
    expect(fmt().clock("00:05")).toBe("00:05")
    expect(fmt().clock("14:30")).toBe("14:30")
    expect(fmt().clock(null)).toBe("")
  })
  it("dateTime", () => expect(fmt({ dateFormat: "ISO", hour12: false }).dateTime(d)).toBe("2026-01-05 14:07"))
})

describe("currencies", () => {
  it("uses the currency's own decimals", () => {
    expect(fmt({ currency: "JPY" }).money(1234.56)).toBe((1235).toLocaleString(undefined, { style: "currency", currency: "JPY" }))
    expect(fmt({ currency: "KWD" }).money(1.5)).toBe((1.5).toLocaleString(undefined, { style: "currency", currency: "KWD" }))
    expect(fmt({ currency: "EUR" }).money(2)).toBe((2).toLocaleString(undefined, { style: "currency", currency: "EUR" }))
  })
  it("compact uses the symbol", () => {
    const f = fmt({ currency: "EUR" })
    expect(f.moneyCompact(12480)).toBe(`${f.currencySymbol}12.5k`)
    expect(f.currencySymbol).toBe("€")
  })
  it("falls back for a code Intl rejects", () => {
    expect(fmt({ currency: "ZZ" }).money(1234.5)).toBe(`ZZ ${(1234.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    expect(fmt({ currency: "ZZ" }).currencySymbol).toBe("ZZ")
  })
  it("validates codes", () => {
    expect(isValidCurrency("EUR")).toBe(true)
    expect(isValidCurrency("eur")).toBe(false)
    expect(isValidCurrency("ZZZ")).toBe(false)
    expect(isValidCurrency("")).toBe(false)
  })
})

describe("metric units", () => {
  const f = fmt({ distanceUnit: "KM", areaUnit: "SQM" })
  it("distance", () => {
    expect(f.meterShort("MILES")).toBe("公里")
    expect(f.meterNoun("MILES")).toBe("距离")
    expect(f.meterWord("MILES")).toBe("公里")
    expect(f.distanceWords).toBe("公里")
    expect(f.meterShort("HOURS")).toBe("小时")
  })
  it("area", () => {
    expect(f.areaShort).toBe("m²")
    expect(f.area(1200)).toBe(`${(1200).toLocaleString()} m²`)
    expect(f.areaWords).toBe("平方米")
  })
})
