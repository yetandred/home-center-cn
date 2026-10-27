import { describe, expect, it } from "vitest"
import { boundingRect, groupIntoRows, joinRowTexts, toText, type RecognizedLine } from "./layout"

const line = (x: number, y: number, width: number, height: number, text: string): RecognizedLine => ({
  rect: { x, y, width, height },
  text,
})

describe("boundingRect", () => {
  it("四点四边形取外接矩形", () => {
    const rect = boundingRect([
      { x: 10, y: 20 },
      { x: 110, y: 22 },
      { x: 108, y: 62 },
      { x: 12, y: 60 },
    ])
    expect(rect).toEqual({ x: 10, y: 20, width: 100, height: 42 })
  })

  it("空点集返回零矩形", () => {
    expect(boundingRect([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe("groupIntoRows", () => {
  it("同一视觉行里的几段（表格的列）归成一行，按 x 排序", () => {
    const rows = groupIntoRows([line(500, 100, 60, 24, "结果"), line(20, 102, 80, 24, "项目名称")])
    expect(rows).toHaveLength(1)
    expect(rows[0].map((r) => r.text)).toEqual(["项目名称", "结果"])
  })

  it("行距较大时分成两行", () => {
    const rows = groupIntoRows([line(20, 10, 80, 24, "第一行"), line(20, 60, 80, 24, "第二行")])
    expect(rows.map((r) => r.map((x) => x.text))).toEqual([["第一行"], ["第二行"]])
  })

  it("字号不同但基线重叠的仍算同一行", () => {
    const rows = groupIntoRows([line(20, 100, 40, 30, "大"), line(70, 108, 30, 18, "小")])
    expect(rows).toHaveLength(1)
  })

  it("空文本的框被忽略", () => {
    expect(groupIntoRows([line(20, 10, 40, 20, "   ")])).toHaveLength(0)
  })
})

describe("joinRowTexts", () => {
  it("列之间留一个空格", () => {
    expect(joinRowTexts(["生化全项", "1", "180.00"])).toBe("生化全项 1 180.00")
  })

  it("多余空白被压成一个空格", () => {
    expect(joinRowTexts([" 项目 ", "  结果 "])).toBe("项目 结果")
  })

  it("空串不参与拼接", () => {
    expect(joinRowTexts(["项目", "", "结果"])).toBe("项目 结果")
  })
})

describe("toText", () => {
  it("整页按行输出，行内按列拼接", () => {
    const text = toText([
      line(20, 10, 200, 24, "检验报告单"),
      line(20, 50, 60, 24, "姓名"),
      line(90, 50, 40, 24, "李伟"),
      line(20, 90, 60, 24, "日期"),
      line(90, 90, 120, 24, "2026-10-18"),
    ])
    expect(text).toBe("检验报告单\n姓名 李伟\n日期 2026-10-18")
  })
})
