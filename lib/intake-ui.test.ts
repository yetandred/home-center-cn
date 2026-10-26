import { describe, expect, it } from "vitest"
import { emptyStateCopy, intakeSummary, receiptTipDue } from "./intake-ui"

const item = (id: string, iso: string, files = 1) => ({ id, createdAt: new Date(iso), attachments: Array.from({ length: files }) })

describe("intakeSummary", () => {
  it("is empty for no items", () => {
    expect(intakeSummary([])).toEqual({ count: 0, newest: [] })
  })

  it("counts every item with a file and keeps the three newest, newest first", () => {
    const items = [
      item("a", "2026-01-01T00:00:00Z"),
      item("b", "2026-03-01T00:00:00Z"),
      item("c", "2026-02-01T00:00:00Z"),
      item("d", "2026-04-01T00:00:00Z"),
    ]
    const s = intakeSummary(items)
    expect(s.count).toBe(4)
    expect(s.newest.map((i) => i.id)).toEqual(["d", "b", "c"])
  })

  it("ignores items whose upload hasn't landed (same rule as the sidebar badge)", () => {
    const s = intakeSummary([item("a", "2026-01-01T00:00:00Z"), item("b", "2026-05-01T00:00:00Z", 0)])
    expect(s.count).toBe(1)
    expect(s.newest.map((i) => i.id)).toEqual(["a"])
  })

  it("respects a smaller take and does not reorder its input", () => {
    const items = [item("a", "2026-01-01T00:00:00Z"), item("b", "2026-02-01T00:00:00Z")]
    expect(intakeSummary(items, 1).newest.map((i) => i.id)).toEqual(["b"])
    expect(items.map((i) => i.id)).toEqual(["a", "b"])
  })
})

describe("emptyStateCopy", () => {
  it("words each context", () => {
    expect(emptyStateCopy("records")).toBe("暂无记录——可添加一条，或将收据拖放到此处。")
    expect(emptyStateCopy("service")).toBe("暂无记录——可添加一条，或将收据拖放到此处。")
    expect(emptyStateCopy("visits")).toBe("暂无就诊记录——可添加一条，或将收据拖放到此处。")
    expect(emptyStateCopy("documents")).toBe("暂无文档——可拖入说明书或保修卡，或使用“添加附件”。")
  })
})

describe("receiptTipDue", () => {
  it("shows once, after a new record saved without files", () => {
    expect(receiptTipDue({ isNew: true, hadFiles: false, seen: false })).toBe(true)
  })
  it("not after an edit, with files, or when already seen", () => {
    expect(receiptTipDue({ isNew: false, hadFiles: false, seen: false })).toBe(false)
    expect(receiptTipDue({ isNew: true, hadFiles: true, seen: false })).toBe(false)
    expect(receiptTipDue({ isNew: true, hadFiles: false, seen: true })).toBe(false)
  })
})
