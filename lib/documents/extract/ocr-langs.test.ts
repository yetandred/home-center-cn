import { describe, expect, it } from "vitest"
import { DEFAULT_OCR_LANGUAGE, normalizeOcrLanguage, OCR_LANGUAGE_OPTIONS, OCR_LANGUAGES } from "./ocr"

describe("normalizeOcrLanguage", () => {
  it("认识设置页的两种选项", () => {
    expect(normalizeOcrLanguage("chi_sim+eng")).toBe("chi_sim+eng")
    expect(normalizeOcrLanguage("eng")).toBe("eng")
  })

  it("未知或空值回退到默认（中英混合）", () => {
    expect(normalizeOcrLanguage(null)).toBe("chi_sim+eng")
    expect(normalizeOcrLanguage("")).toBe("chi_sim+eng")
    expect(normalizeOcrLanguage("fra")).toBe("chi_sim+eng")
  })

  it("默认值是合法选项且包含中文包", () => {
    expect(OCR_LANGUAGE_OPTIONS[DEFAULT_OCR_LANGUAGE]).toBeTruthy()
    expect(OCR_LANGUAGES).toContain("chi_sim")
  })
})
