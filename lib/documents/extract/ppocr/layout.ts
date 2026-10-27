// 把检测框整理成「行」。检测框是按文本行给的，但同一视觉行常被切成几段
// （表格的列、行内不同字号），直接按 y 排序会串行，所以先聚成行、再按 x 排。

export type Point = { x: number; y: number }
export type OcrBox = { points: Point[]; width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type RecognizedLine = { rect: Rect; text: string }

/** 检测框是四点四边形，取外接矩形即可（扫描件基本水平，倾斜由 unclip 吸收）。 */
export function boundingRect(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) }
}

type Band = { y: number; height: number }

function verticalOverlap(a: Band, b: Band): number {
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return Math.max(0, bottom - top)
}

/**
 * 按视觉行聚合，行内从左到右，行间从上到下。
 * 判定同一行：两框的垂直重叠 > 较矮者高度的一半（容忍一行内字号不一致）。
 */
export function groupIntoRows(lines: RecognizedLine[]): RecognizedLine[][] {
  const usable = lines.filter((l) => l.text.trim().length > 0).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
  const rows: RecognizedLine[][] = []
  for (const line of usable) {
    const row = rows[rows.length - 1]
    if (row) {
      const band = row.reduce(
        (acc, r) => ({
          y: Math.min(acc.y, r.rect.y),
          height: Math.max(acc.y + acc.height, r.rect.y + r.rect.height) - Math.min(acc.y, r.rect.y),
        }),
        { y: row[0].rect.y, height: row[0].rect.height },
      )
      const minHeight = Math.min(band.height, line.rect.height)
      if (verticalOverlap(band, line.rect) > minHeight * 0.5) {
        row.push(line)
        continue
      }
    }
    rows.push([line])
  }
  for (const row of rows) row.sort((a, b) => a.rect.x - b.rect.x)
  return rows
}

/**
 * 行内拼接：检测框之间留一个空格。同一句被切开时不至于粘字，表格的列也分得开
 * （「生化全项 1 180.00」而不是「生化全项1 180.00」）。行内多余空格会被压掉。
 */
export function joinRowTexts(texts: string[]): string {
  return texts
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
}

/** 框 → 文本，按阅读顺序用换行连接。 */
export function toText(lines: RecognizedLine[]): string {
  return groupIntoRows(lines)
    .map((row) => joinRowTexts(row.map((r) => r.text)))
    .filter((t) => t.length > 0)
    .join("\n")
}
