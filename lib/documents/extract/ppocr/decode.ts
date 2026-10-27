// PP-OCRv4 的解码与文本整理，全部是纯函数——不碰 ONNX、不碰文件系统，
// 这样规则本身能单测，引擎层只负责把张量喂进来。

/** 字典最大字符数（PP-OCRv4 中文模型 6623 个字 + 结尾补的空格）。 */
export type DecodeResult = { text: string; confidence: number }

/**
 * PP-OCR 的字典文件每行一个字，模型输出多一维 CTC blank。
 * 训练时字典末尾补了一个空格字符，所以解码表 = 字典 + " "。
 */
export function buildDictionary(fileText: string): string[] {
  const chars = fileText.replace(/\r\n?/g, "\n").split("\n")
  // 文件通常以换行结尾，最后一项是空串，不能当成字符。
  while (chars.length > 0 && chars[chars.length - 1] === "") chars.pop()
  chars.push(" ")
  return chars
}

/**
 * CTC 贪心解码。
 *
 * @param logits 形状为 [1, T, C] 的展平数组（softmax 后的概率或 logits 皆可，只比大小）
 * @param seqLen T
 * @param classes C
 * @param dictionary 见 buildDictionary；长度须为 C - 1（blank 占第 0 位）
 */
export function ctcDecode(logits: Float32Array, seqLen: number, classes: number, dictionary: string[]): DecodeResult {
  if (classes !== dictionary.length + 1) {
    throw new Error(`PP-OCR 字典与模型不匹配：模型输出 ${classes} 类，字典 ${dictionary.length} 个字（应正好少 1 个 blank）`)
  }
  let text = ""
  let last = -1
  let sum = 0
  let counted = 0
  for (let t = 0; t < seqLen; t++) {
    const offset = t * classes
    let best = -Infinity
    let bestIdx = 0
    for (let i = 0; i < classes; i++) {
      const v = logits[offset + i]
      if (v > best) {
        best = v
        bestIdx = i
      }
    }
    // 重复字符合并，blank 跳过——CTC 的标准规则。
    if (bestIdx === last) continue
    last = bestIdx
    if (bestIdx === 0) continue
    text += dictionary[bestIdx - 1] ?? ""
    sum += best
    counted++
  }
  return { text, confidence: counted > 0 ? sum / counted : 0 }
}

/**
 * 识别网络是全卷积 + CTC，输入宽度可以动态给：只要保持「高 48、宽按比例放大」，
 * 长行的字不会被压扁。官方实现把宽度钉在 320 是为了批量对齐，代价是长行被横向压缩
 * （实测「叁佰捌拾元整（￥380.00）」会掉字）。这里放宽到 1024（约 48×21），
 * 覆盖整行宽度；超过才退回分块。
 */
export const REC_MAX_RATIO = 1024 / 48

/** 每一列有多少个"墨点"（越小的列越像字间空白）。 */
export function columnInk(data: Uint8Array, channels: number, width: number, height: number): number[] {
  const ink = new Array<number>(width).fill(0)
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * channels
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * channels
      // 取最暗通道：抗锯齿的边缘也有值，比只看 R 稳。
      const darkest = Math.min(data[i], data[i + 1] ?? data[i], data[i + 2] ?? data[i])
      if (darkest < 200) ink[x] += 200 - darkest
    }
  }
  return ink
}

/**
 * 把一段过长的裁剪切成若干块。
 *
 * 切点不按等分硬切：先在理想位置附近找一个"墨水最少"的列（字与字之间、表格列的缝隙），
 * 在空白处下刀，就不会把字切两半，也不需要靠文本重叠去猜边界（猜错会重复或漏字）。
 * 不给 ink 时就退化成等分。
 */
export function planChunks(width: number, height: number, ink?: number[], maxRatio = REC_MAX_RATIO): Array<{ x: number; width: number }> {
  if (width <= 0 || height <= 0) return []
  const ratio = width / height
  if (ratio <= maxRatio) return [{ x: 0, width }]
  const count = Math.ceil(ratio / maxRatio)
  const cuts: number[] = []
  for (let i = 1; i < count; i++) {
    const ideal = Math.round((width * i) / count)
    cuts.push(ink ? findBlankColumn(ink, ideal, Math.round(width / count / 3)) : ideal)
  }
  const bounds = [0, ...cuts.sort((a, b) => a - b), width]
  const chunks: Array<{ x: number; width: number }> = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const x = bounds[i]
    const w = bounds[i + 1] - x
    if (w > 0) chunks.push({ x, width: w })
  }
  return chunks
}

/** 在 ideal 附近 ±radius 内找墨水最少的列；并列时取离理想位置最近的。 */
function findBlankColumn(ink: number[], ideal: number, radius: number): number {
  const from = Math.max(1, ideal - radius)
  const to = Math.min(ink.length - 2, ideal + radius)
  let best = ideal
  let bestScore = Infinity
  for (let x = from; x <= to; x++) {
    const score = ink[x] + Math.abs(x - ideal) * 0.01
    if (score < bestScore) {
      bestScore = score
      best = x
    }
  }
  return best
}
