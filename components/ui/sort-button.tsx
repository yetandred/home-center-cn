"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SortDir } from "@/lib/table-params"

export type SortState = SortDir | null

export function ariaSort(state: SortState) {
  return state === "asc" ? "ascending" : state === "desc" ? "descending" : "none"
}

export function SortButton({
  label,
  state,
  onClick,
  className,
}: {
  label: string
  state: SortState
  onClick: () => void
  className?: string
}) {
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ChevronsUpDown
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        state
          ? `已按${label}${state === "asc" ? "升序" : "降序"}排序，点击可切换为${state === "asc" ? "降序" : "升序"}。`
          : `按${label}排序`
      }
      className={cn(
        "group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium transition-colors",
        "hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        state && "text-foreground",
        className
      )}
    >
      {label}
      <Icon
        aria-hidden="true"
        className={cn(
          "h-3 w-3 shrink-0 transition-opacity",
          state ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        )}
      />
    </button>
  )
}
