import { describe, expect, it } from "vitest"
import { buildDictionary, columnInk, ctcDecode, planChunks, REC_MAX_RATIO } from "./decode"

describe("buildDictionary", () => {
  it("逐行取字并补上训练时追加的空格", () => {
    const dict = buildDictionary("a\nb\nc\n")
    expect(dict).toEqual(["a", "b", "c", " "])
  })

  it("没有结尾换行时也不会把最后一个字丢掉", () => {
    expect(buildDictionary("a\nb\nc")).toEqual(["a", "b", "c", " "])
  })

  it("兼容 CRLF", () => {
    expect(buildDictionary("中\r\n文\r\n")).toEqual(["中", "文", " "])
  })
})

describe("ctcDecode", () => {
  // 字典只有两个真字 + 一个空格，模型输出 4 类（blank + a + b + 空格）。
  const dict = ["a", "b", " "]
  const classes = dict.length + 1

  function logits(indices: number[]): Float32Array {
    const out = new Float32Array(indices.length * classes)
    indices.forEach((idx, t) => {
      out[t * classes + idx] = 1
    })
    return out
  }

  it("按索引取字，跳过 blank、合并重复", () => {
    // 0=blank, 1=a, 2=b, 3=空格
    const data = logits([1, 1, 0, 2, 3, 1])
    expect(ctcDecode(data, 6, classes, dict).text).toBe("ab a")
  })

  it("全 blank 得空串，置信度为 0", () => {
    const r = ctcDecode(logits([0, 0, 0]), 3, classes, dict)
    expect(r.text).toBe("")
    expect(r.confidence).toBe(0)
  })

  it("字典长度与模型输出对不上时直接报错（避免静默乱码）", () => {
    expect(() => ctcDecode(new Float32Array(8), 2, 4, ["a"])).toThrow(/字典与模型不匹配/)
  })
})

describe("columnInk", () => {
  it("数每一列的墨量：白底为 0，黑字列为正", () => {
    // 3x2 的 RGBA 图，第二列是黑的
    const data = new Uint8Array([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
    ])
    const ink = columnInk(data, 4, 3, 2)
    expect(ink[0]).toBe(0)
    expect(ink[1]).toBeGreaterThan(0)
    expect(ink[2]).toBe(0)
  })
})

describe("planChunks", () => {
  it("比例没超限时整行一次识别", () => {
    expect(planChunks(300, 48)).toEqual([{ x: 0, width: 300 }])
  })

  it("超长行会切成多块，且覆盖整行不重叠", () => {
    const width = 3000
    const chunks = planChunks(width, 48)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].x).toBe(0)
    expect(chunks[chunks.length - 1].x + chunks[chunks.length - 1].width).toBe(width)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].x).toBe(chunks[i - 1].x + chunks[i - 1].width)
      expect(chunks[i].width / 48).toBeLessThanOrEqual(REC_MAX_RATIO)
    }
  })

  it("有墨水分布时，切点落在空白列上（不把字切两半）", () => {
    const width = 2000
    const height = 48
    // 每 100px 一段文字，段间留 20px 空白
    const ink = Array.from({ length: width }, (_, x) => (x % 100 < 80 ? 500 : 0))
    const chunks = planChunks(width, height, ink)
    for (const chunk of chunks.slice(1)) {
      expect(ink[chunk.x]).toBe(0)
    }
  })
})
