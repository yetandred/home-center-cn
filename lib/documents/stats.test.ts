import { describe, expect, it } from "vitest"
import { formatIndexStats } from "./stats"

describe("formatIndexStats", () => {
  it("lists only the non-zero groups after the searchable count", () => {
    expect(formatIndexStats({ DONE: 412, PENDING: 6, FAILED: 3, UNSUPPORTED: 9 }, true)).toBe("412 个可搜索 · 6 个等待中 · 3 个失败 · 9 个不支持")
    expect(formatIndexStats({}, true)).toBe("0 个可搜索")
    expect(formatIndexStats({ DONE: 1, EMPTY: 2 }, true)).toBe("1 个可搜索 · 2 个无文本")
  })
  it("says indexing is off, with the backlog", () => {
    expect(formatIndexStats({ DONE: 4, PENDING: 6 }, false)).toBe("索引已关闭 — 6 个文件等待处理。")
    expect(formatIndexStats({ PENDING: 1 }, false)).toBe("索引已关闭 — 1 个文件等待处理。")
    expect(formatIndexStats({ DONE: 4 }, false)).toBe("索引已关闭。")
  })

  it("shows meaning-vector progress while embedding, and readiness when done", () => {
    expect(formatIndexStats({ DONE: 3 }, true, { withVectors: 40, chunks: 100 })).toBe("3 个可搜索 · 已生成 40 / 100 个语义向量")
    expect(formatIndexStats({ DONE: 3 }, true, { withVectors: 100, chunks: 100 })).toBe("3 个可搜索 · 语义搜索就绪")
    expect(formatIndexStats({ DONE: 3 }, true, null)).toBe("3 个可搜索")
  })
})
