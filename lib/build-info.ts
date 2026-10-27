/// 构建标识：让部署后能一眼看出跑的是哪次提交、哪天的镜像。
/// 由 CI 通过 Docker build-arg 注入（见 Dockerfile 与 .github/workflows/docker-zh-cn.yml），
/// 本地 `npm run dev` 时为空串，页脚自动隐藏这一段。

export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? ""
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? ""

/** 取短提交号：7 位足够定位。 */
export function shortSha(sha: string): string {
  return (sha ?? "").trim().slice(0, 7)
}

/**
 * 页脚用的构建标识，形如 `2026.10.27 · cc8b0bb`。
 * 日期接受 `YYYYMMDD` 或 ISO 串；两者都没有时返回空串（本地开发）。
 */
export function buildStamp(sha: string = BUILD_SHA, date: string = BUILD_DATE): string {
  const short = shortSha(sha)
  const d = (date ?? "").trim()
  let day = ""
  if (/^\d{8}$/.test(d)) day = `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
  else if (/^\d{4}-\d{2}-\d{2}/.test(d)) day = d.slice(0, 10).replace(/-/g, ".")
  if (day && short) return `${day} · ${short}`
  return day || short
}
