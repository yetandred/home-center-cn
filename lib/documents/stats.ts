export type StatusCounts = Partial<Record<"DONE" | "PENDING" | "EMPTY" | "UNSUPPORTED" | "FAILED", number>>

/** The status line under the Documents settings card. */
export function formatIndexStats(
  c: StatusCounts,
  indexingEnabled: boolean,
  vectors?: { withVectors: number; chunks: number } | null
): string {
  const n = (k: keyof StatusCounts) => c[k] ?? 0
  if (!indexingEnabled) {
    const waiting = n("PENDING")
    return waiting ? `索引已关闭 — ${waiting} 个文件等待处理。` : "索引已关闭。"
  }
  const parts = [`${n("DONE")} 个可搜索`]
  if (n("PENDING")) parts.push(`${n("PENDING")} 个等待中`)
  if (n("FAILED")) parts.push(`${n("FAILED")} 个失败`)
  if (n("UNSUPPORTED")) parts.push(`${n("UNSUPPORTED")} 个不支持`)
  if (n("EMPTY")) parts.push(`${n("EMPTY")} 个无文本`)
  if (vectors && vectors.chunks > 0) {
    parts.push(vectors.withVectors >= vectors.chunks ? "语义搜索就绪" : `已生成 ${vectors.withVectors} / ${vectors.chunks} 个语义向量`)
  }
  return parts.join(" · ")
}
