import type { CaptureParser } from "@/app/generated/prisma/client"

// Settings → Receipt reading: the three choices as a ladder, weakest first.

export type FillLevel = "yes" | "sometimes" | "no"
export type CaptureOption = {
  value: CaptureParser
  label: string
  /** Bars lit on the three-bar meter. */
  strength: 0 | 1 | 2 | 3
  /** What it fills in on a new Intake item. */
  fills: { field: "Date" | "Total" | "Shop"; level: FillLevel }[]
  hint: string
  best?: boolean
}

const fills = (date: FillLevel, total: FillLevel, shop: FillLevel): CaptureOption["fills"] => [
  { field: "Date", level: date },
  { field: "Total", level: total },
  { field: "Shop", level: shop },
]

export const CAPTURE_OPTIONS: CaptureOption[] = [
  { value: "OFF", label: "关闭", strength: 0, fills: fills("no", "no", "no"), hint: "所有字段由您手动填写。" },
  { value: "BASIC", label: "基础", strength: 2, fills: fills("yes", "yes", "sometimes"), hint: "内置解析，离线即时可用。" },
  {
    value: "LLM",
    label: "本地 AI",
    strength: 3,
    fills: fills("yes", "yes", "yes"),
    hint: "使用“AI 助手”中配置的模型读取文本。模型不可用时回退为基础模式。",
    best: true,
  },
]

/** Local AI needs the assistant's model set up and on; the others are always allowed. */
export function captureParserAllowed(mode: CaptureParser, llmReady: boolean): boolean {
  return mode !== "LLM" || llmReady
}

/** What actually reads receipts: a saved Local AI choice runs as Basic while the model isn't ready. */
export function effectiveCaptureParser(mode: CaptureParser, llmReady: boolean): CaptureParser {
  return captureParserAllowed(mode, llmReady) ? mode : "BASIC"
}

export function captureOption(value: CaptureParser): CaptureOption {
  return CAPTURE_OPTIONS.find((o) => o.value === value) ?? CAPTURE_OPTIONS[1]
}
