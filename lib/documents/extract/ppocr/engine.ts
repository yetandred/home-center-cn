import { readFile } from "fs/promises"
import os from "os"
import { buildDictionary, columnInk, ctcDecode, planChunks, REC_MAX_RATIO } from "./decode"
import { boundingRect, toText, type RecognizedLine } from "./layout"

// PP-OCRv4（PaddleOCR 的中文识别模型）跑在 onnxruntime-node 上。
//
// 分工：检测（找文本行框）用 paddleocr 这个纯 TS 运行时——它把 DB 后处理、
// 轮廓、unclip 都实现了，且不依赖 OpenCV；识别自己实现，因为它的识别对每个框
// 按「最长宽高比」统一 padding，一张 A4 里只要有一条长行，整批张量就会撑到
// 1100px 宽（实测 33 个框要 13 秒）。这里改成按行裁切、动态宽度、长行按空白列
// 分块（见 decode.ts），单条推理约 35ms，同样的页面 2 秒左右。
//
// 模型文件随 @gutenye/ocr-models 这个 npm 包分发（PaddleOCR 官方权重，Apache-2.0），
// 不联网、不写数据目录，镜像里就有。

/** 检测阶段的输入长边上限（PP-OCR 官方默认 960；调小更快、小字更容易漏）。 */
export const DEFAULT_DET_MAX_SIDE = 960
/** 识别网络输入高度（模型固定）。 */
const REC_HEIGHT = 48
/** 识别网络输入宽度上限：动态给到 1024，长行不必压扁（见 decode.ts 的说明）。 */
const REC_MAX_WIDTH = 1024
/** 空闲这么久之后释放会话，把内存还给系统。 */
const IDLE_MS = 5 * 60_000

type DetectionBox = { points: Array<{ x: number; y: number }>; width: number; height: number }

type Runtime = {
  ort: typeof import("onnxruntime-node")
  detection: { run(img: unknown, options: unknown): Promise<DetectionBox[]> }
  recognition: import("onnxruntime-node").InferenceSession
  detectionSession: import("onnxruntime-node").InferenceSession
  dictionary: string[]
}

let runtime: Promise<Runtime> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let inFlight = 0

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleRelease() {
  clearIdleTimer()
  if (inFlight > 0) return
  idleTimer = setTimeout(() => {
    idleTimer = null
    void releasePpocr()
  }, IDLE_MS)
  idleTimer.unref?.()
}

/** 释放 ONNX 会话（超时、切换引擎、退出时调用）。下次识别会重新加载。 */
export async function releasePpocr(): Promise<void> {
  clearIdleTimer()
  const pending = runtime
  runtime = null
  if (!pending) return
  const rt = await pending.catch(() => null)
  if (!rt) return
  await Promise.all([rt.recognition.release(), rt.detectionSession.release()]).catch(() => {})
}

async function loadRuntime(): Promise<Runtime> {
  const [{ default: models }, ortModule, paddle] = await Promise.all([
    import("@gutenye/ocr-models/node"),
    import("onnxruntime-node"),
    import("paddleocr"),
  ])
  const { detectionPath, recognitionPath, dictionaryPath } = models as {
    detectionPath: string
    recognitionPath: string
    dictionaryPath: string
  }
  const [detBuf, recBuf, dictText] = await Promise.all([
    readFile(detectionPath),
    readFile(recognitionPath),
    readFile(dictionaryPath, "utf8"),
  ])
  const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

  // 线程数：小模型开满核反而互相抢，4 条线程已经吃满（实测 1 线程 75ms → 4 线程 34ms）。
  const threads = Math.max(1, Math.min(4, os.cpus().length))
  const sessionOptions = { intraOpNumThreads: threads, interOpNumThreads: 1 }
  const [detSession, recSession] = await Promise.all([
    ortModule.InferenceSession.create(toArrayBuffer(detBuf), sessionOptions),
    ortModule.InferenceSession.create(toArrayBuffer(recBuf), sessionOptions),
  ])

  const maxSide = Number(process.env.PPOCR_DET_MAX_SIDE ?? DEFAULT_DET_MAX_SIDE)
  const DetectionService = paddle.DetectionService as unknown as new (ort: unknown, session: unknown, options: Record<string, unknown>) => Runtime["detection"]
  const detection = new DetectionService(ortModule, detSession, {
    channelOrder: "bgr",
    maxSideLength: Number.isFinite(maxSide) && maxSide > 0 ? maxSide : DEFAULT_DET_MAX_SIDE,
    limitType: "max",
    maxSideLimit: 4000,
    textPixelThreshold: 0.3,
    boxScoreThreshold: 0.6,
    maxCandidates: 1000,
    unclipRatio: 1.5,
  })

  return { ort: ortModule, detection, recognition: recSession, detectionSession: detSession, dictionary: buildDictionary(dictText) }
}

function getRuntime(): Promise<Runtime> {
  if (!runtime) {
    runtime = loadRuntime().catch((error) => {
      runtime = null
      throw error
    })
  }
  return runtime
}

type ImageLike = {
  width: number
  height: number
  channels: number
  data: Uint8Array
  cropRotated(points: Array<{ x: number; y: number }>): ImageLike
  crop(rect: { x: number; y: number; width: number; height: number }): ImageLike
  resize(size: { width: number; height: number }): ImageLike
  tensor(options: { mean_values: number[]; norm_values: number[]; channel_order: "rgb" | "bgr" }): Float32Array
}

/** PNG/JPEG 字节 → 检测服务要的 RGB 像素。解码用 @napi-rs/canvas，和 PDF 渲染同一条路径。 */
async function decodePixels(data: Buffer): Promise<{ width: number; height: number; data: Uint8Array }> {
  const { loadImage, createCanvas } = await import("@napi-rs/canvas")
  const image = await loadImage(data)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(image, 0, 0)
  const { data: rgba } = ctx.getImageData(0, 0, image.width, image.height)
  return { width: image.width, height: image.height, data: new Uint8Array(rgba.buffer.slice(0)) }
}

async function recognizeCrop(rt: Runtime, crop: ImageLike): Promise<string> {
  const ink = crop.width / crop.height > REC_MAX_RATIO ? columnInk(crop.data, crop.channels, crop.width, crop.height) : undefined
  const chunks = planChunks(crop.width, crop.height, ink)
  if (chunks.length === 0) return ""
  const inputName = rt.recognition.inputNames[0]
  let text = ""
  for (const chunk of chunks) {
    const piece = chunk.x === 0 && chunk.width === crop.width ? crop : crop.crop({ x: chunk.x, y: 0, width: chunk.width, height: crop.height })
    const ratio = piece.width / Math.max(1, piece.height)
    const width = Math.max(8, Math.min(REC_MAX_WIDTH, Math.ceil(REC_HEIGHT * ratio)))
    const tensor = piece.resize({ width, height: REC_HEIGHT }).tensor({
      mean_values: [127.5, 127.5, 127.5],
      norm_values: [1 / 127.5, 1 / 127.5, 1 / 127.5],
      channel_order: "bgr",
    })
    const feeds = { [inputName]: new rt.ort.Tensor("float32", tensor, [1, 3, REC_HEIGHT, width]) }
    const out = await rt.recognition.run(feeds)
    const first = out[rt.recognition.outputNames[0]]
    const dims = first.dims
    const seqLen = dims[dims.length - 2]
    const classes = dims[dims.length - 1]
    text += ctcDecode(first.data as Float32Array, seqLen, classes, rt.dictionary).text
  }
  return text.trim()
}

/** 识别一张图片（PNG/JPEG），返回按阅读顺序排好的文本。 */
export async function recognizePng(data: Buffer): Promise<string> {
  const rt = await getRuntime()
  inFlight++
  clearIdleTimer()
  try {
    const paddle = await import("paddleocr")
    const pixels = await decodePixels(data)
    const image = paddle.normalizeInputToRgb(pixels) as unknown as ImageLike
    const boxes = await rt.detection.run(image, {})
    const debug = process.env.PPOCR_DEBUG === "1"
    if (debug) console.log(`[ppocr] image ${image.width}x${image.height} boxes=${boxes.length}`)
    const lines: RecognizedLine[] = []
    for (const box of boxes) {
      if (!box.points?.length || box.width < 2 || box.height < 4) continue
      const crop = image.cropRotated(box.points)
      if (crop.height < 4 || crop.width < 4) continue
      const text = await recognizeCrop(rt, crop)
      if (debug) console.log(`[ppocr] box ${Math.round(box.points[0].x)},${Math.round(box.points[0].y)} crop ${crop.width}x${crop.height} → ${JSON.stringify(text)}`)
      if (!text.trim()) continue
      lines.push({ rect: boundingRect(box.points), text })
    }
    return toText(lines)
  } finally {
    inFlight--
    scheduleIdleRelease()
  }
}
