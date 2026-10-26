// Engine file: relative imports and npm packages only.
import path from "node:path"
import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { ArchiveReader } from "./archive"
import { DB_ENTRY, FORMAT_VERSION, type Manifest } from "./format"
import { integrityCheck } from "./snapshot"

export type VerifyResult = { ok: true; manifest: Manifest } | { ok: false; error: string }

/** Every listed entry present with the right size and hash; a backup's database passes integrity_check. */
export async function verifyArchive(plainPath: string, opts: { workDir: string; password?: string }): Promise<VerifyResult> {
  let r: ArchiveReader
  try {
    r = await ArchiveReader.open(plainPath, opts.password)
  } catch {
    return { ok: false, error: "不是 HomeCenter 归档（无法按 zip 打开）。" }
  }
  try {
    let manifest: Manifest
    try {
      manifest = await r.manifest()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    if (manifest.formatVersion > FORMAT_VERSION) {
      return { ok: false, error: `Made by a newer HomeCenter (archive format ${manifest.formatVersion}). Update HomeCenter first.` }
    }
    const names = new Set(r.entries())
    for (const f of manifest.files) {
      if (!names.has(f.path)) return { ok: false, error: `Missing from the archive: ${f.path}` }
      const got = await r.hash(f.path)
      if (got.size !== f.size || got.sha256 !== f.sha256) return { ok: false, error: `Damaged in the archive: ${f.path}` }
    }
    if (manifest.kind === "backup") {
      if (!names.has(DB_ENTRY)) return { ok: false, error: "备份中没有数据库。" }
      await mkdir(opts.workDir, { recursive: true })
      const tmp = path.join(opts.workDir, `verify-${randomUUID()}.db`)
      try {
        await r.extract(DB_ENTRY, tmp)
        const ic = await integrityCheck(tmp)
        if (ic !== "ok") return { ok: false, error: `The backup's database failed its check: ${ic}` }
      } finally {
        await rm(tmp, { force: true })
      }
    }
    return { ok: true, manifest }
  } finally {
    await r.close()
  }
}

export type Compat = { ok: true } | { ok: false; reason: string }

/** Older backups are upgraded by migrations at boot; newer or unknown ones are refused. */
export function checkCompatibility(manifest: Manifest, known: string[]): Compat {
  if (manifest.kind !== "backup") return { ok: false, reason: "这是一份导出文件，可浏览但无法恢复。" }
  if (!manifest.migration) return { ok: false, reason: "备份未注明其数据库版本。" }
  if (known.includes(manifest.migration)) return { ok: true }
  const latest = known.at(-1) ?? ""
  return manifest.migration > latest
    ? { ok: false, reason: "此备份由更新版本的 HomeCenter 创建，请先升级 HomeCenter 再恢复。" }
    : { ok: false, reason: "此备份的数据库版本超出了本 HomeCenter 的识别范围。" }
}
