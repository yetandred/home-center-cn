import { describe, expect, it } from "vitest"
import { buildStamp, shortSha } from "./build-info"

describe("buildStamp", () => {
  it("日期 + 短提交号", () => {
    expect(buildStamp("cc8b0bb1234567890", "20261027")).toBe("2026.10.27 · cc8b0bb")
  })

  it("接受 ISO 日期", () => {
    expect(buildStamp("abcdef1234", "2026-10-27T02:00:00Z")).toBe("2026.10.27 · abcdef1")
  })

  it("只有日期时只显示日期", () => {
    expect(buildStamp("", "20261027")).toBe("2026.10.27")
  })

  it("只有提交号时只显示提交号", () => {
    expect(buildStamp("cc8b0bb", "")).toBe("cc8b0bb")
  })

  it("本地开发（两者皆空）返回空串", () => {
    expect(buildStamp("", "")).toBe("")
  })
})

describe("shortSha", () => {
  it("截断到 7 位并去空白", () => {
    expect(shortSha("  cc8b0bb1234  ")).toBe("cc8b0bb")
    expect(shortSha("")).toBe("")
  })
})
