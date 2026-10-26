// Where a couple of entry points sit in the layout, chosen per device under
// Settings → Appearance and kept in cookies (like the sidebar's collapse) so
// the server renders them in place without a jump.

type Option<T extends string> = { value: T; label: string; hint: string }

export type AssistantPlacement = "floating" | "header"
export type IntakePlacement = "header" | "sidebar"

const ASSISTANT_OPTIONS: Option<AssistantPlacement>[] = [
  { value: "floating", label: "悬浮按钮", hint: "位于右下角的圆形按钮。" },
  { value: "header", label: "顶栏", hint: "顶栏中的图标，位于通知铃铛旁。" },
]

const INTAKE_OPTIONS: Option<IntakePlacement>[] = [
  { value: "header", label: "顶栏", hint: "通知铃铛旁的图标，带数量角标。" },
  { value: "sidebar", label: "侧边菜单", hint: "仪表盘下方的菜单项，带数量角标。" },
]

export const PLACEMENTS = {
  assistant: { cookie: "hc-assistant", fallback: "floating" as AssistantPlacement, options: ASSISTANT_OPTIONS },
  intake: { cookie: "hc-intake", fallback: "header" as IntakePlacement, options: INTAKE_OPTIONS },
}

export type PlacementKey = keyof typeof PLACEMENTS
export type PlacementValue<K extends PlacementKey> = (typeof PLACEMENTS)[K]["fallback"]

const YEAR_SECONDS = 60 * 60 * 24 * 365

/** The cookie's choice if it's one of the options, else the default. */
export function readPlacement<K extends PlacementKey>(key: K, value: string | undefined): PlacementValue<K> {
  const pref = PLACEMENTS[key]
  const options: Option<string>[] = pref.options
  return (options.some((o) => o.value === value) ? value : pref.fallback) as PlacementValue<K>
}

/** A document.cookie assignment for the choice. */
export function placementCookie<K extends PlacementKey>(key: K, value: PlacementValue<K>): string {
  return `${PLACEMENTS[key].cookie}=${value}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`
}

/** Browser only: remember the choice for this device. */
export function savePlacement<K extends PlacementKey>(key: K, value: PlacementValue<K>): void {
  document.cookie = placementCookie(key, value)
}
