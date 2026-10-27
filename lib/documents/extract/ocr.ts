import fs from "fs"
import os from "os"
import path from "path"
import { createWorker, type Worker } from "tesseract.js"

// One Tesseract worker per language set, created on first use and terminated
// when the queue goes idle (each holds ~100 MB). Language data comes from the
// @tesseract.js-data/* packages on disk — never downloaded at runtime.
//
// Tesseract loads every language of e.g. "chi_sim+eng" from ONE langPath, but
// each npm package ships its own folder. So on first use we assemble a combined
// tessdata directory (one .traineddata.gz per language) in the OS temp dir and
// point the worker there. TESSDATA_PATH overrides that directory.

/** 本分支支持的语言包（与 package.json 的 @tesseract.js-data/* 对应）。 */
export const OCR_LANGUAGES = ["eng", "chi_sim"] as const

/** 设置页下拉的选项值 → 传给 Tesseract 的语言串（主语言在前，影响识别优先级）。 */
export const OCR_LANGUAGE_OPTIONS = {
  eng: "eng",
  "chi_sim+eng": "chi_sim+eng",
} as const

export type OcrLanguageSetting = keyof typeof OCR_LANGUAGE_OPTIONS

export const DEFAULT_OCR_LANGUAGE: OcrLanguageSetting = "chi_sim+eng"

/** 把设置值规整成有效的语言串；未知值回退到默认（中英混合）。 */
export function normalizeOcrLanguage(value: string | null | undefined): string {
  return OCR_LANGUAGE_OPTIONS[value as OcrLanguageSetting] ?? OCR_LANGUAGE_OPTIONS[DEFAULT_OCR_LANGUAGE]
}

function sourceDir(lang: string): string {
  return path.join(process.cwd(), "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int")
}

/** 组合好的 tessdata 目录：每个语言一个 .traineddata.gz。 */
export async function ensureTessdata(langs: string[]): Promise<string> {
  // 显式指定 TESSDATA_PATH 时直接使用，不做拷贝（由部署方保证里面有所需语言）。
  if (process.env.TESSDATA_PATH) return process.env.TESSDATA_PATH
  const target = path.join(os.tmpdir(), "homecenter-tessdata")
  await fs.promises.mkdir(target, { recursive: true })
  for (const lang of langs) {
    const dest = path.join(target, `${lang}.traineddata.gz`)
    if (fs.existsSync(dest)) continue
    const src = path.join(sourceDir(lang), `${lang}.traineddata.gz`)
    await fs.promises.copyFile(src, dest)
  }
  return target
}

// Keyed by language string: switching languages in settings must not reuse a
// worker trained for the old one. terminateOcr() clears the whole map.
const workers = new Map<string, Promise<Worker>>()

function getWorker(langs: string): Promise<Worker> {
  const existing = workers.get(langs)
  if (existing) return existing
  const created = (async () => {
    const langPath = await ensureTessdata(langs.split("+"))
    return createWorker(langs, 1, {
      langPath,
      gzip: true,
      cacheMethod: "none",
      logger: () => {},
      errorHandler: () => {},
    })
  })().catch((error) => {
    workers.delete(langs)
    throw error
  })
  workers.set(langs, created)
  return created
}

export async function ocrImage(image: Buffer, langs = "eng"): Promise<string> {
  const { data } = await (await getWorker(langs)).recognize(image)
  return data.text
}

export async function terminateOcr(): Promise<void> {
  const pending = [...workers.values()]
  workers.clear()
  await Promise.all(pending.map((w) => w.then((x) => x.terminate()).catch(() => {})))
}
