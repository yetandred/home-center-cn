"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlarmClockOff, BellRing, Pause, Play, SkipForward } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { setMaintenanceScheduleActive, skipMaintenanceSchedule, snoozeMaintenanceSchedule } from "@/lib/actions/maintenance"
import { canSkip } from "@/lib/maintenance-complete"
import { SNOOZE_OPTIONS, isSnoozed, type SnoozeFor } from "@/lib/maintenance-due"
import { cn } from "@/lib/utils"
import type { Formatter } from "@/lib/regional"
import { useFormat } from "@/components/regional-provider"

interface Props {
  schedule: {
    id: string
    title: string
    isActive: boolean
    snoozedUntil: Date | null
    intervalDays: number | null
    intervalMiles: number | null
    nextDueDate: Date | null
    nextDueMileage: number | null
  }
  /** Just the clock icon, for tight rows. */
  iconOnly?: boolean
  className?: string
}

type ScheduleRef = Props["schedule"]

/**
 * Runs a reminder's snooze and pause actions with a toast and a refresh. Shared
 * by the menu below and the notification bell, which nests the choices in its
 * own menu instead.
 */
export function useReminderActions(schedule: Pick<ScheduleRef, "id" | "title">, onDone?: () => void) {
  const router = useRouter()
  const fmt = useFormat()
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ error?: string } | undefined>, done: string) {
    startTransition(async () => {
      const result = await action()
      if (!result || result.error) { toast.error("出错了，请稍后重试。"); return }
      toast.success(done)
      onDone?.()
      router.refresh()
    })
  }

  return {
    pending,
    run,
    snooze: (value: SnoozeFor, label: string) =>
      run(() => snoozeMaintenanceSchedule(schedule.id, value), `“${schedule.title}”已稍后提醒（${label}）。`),
    // Paused reminders leave the dashboard and the bell, so say where to find them.
    pause: () =>
      run(() => setMaintenanceScheduleActive(schedule.id, false), `“${schedule.title}”已暂停。可在其页面恢复。`),
    skip: () =>
      startTransition(async () => {
        const result = await skipMaintenanceSchedule(schedule.id)
        if (!result || "error" in result) { toast.error(result?.error ?? "出错了，请稍后重试。"); return }
        toast.success(`“${schedule.title}”已跳过。${nextDueText(result, fmt)}`)
        onDone?.()
        router.refresh()
      }),
  }
}

/** "Next due Nov 19, 2026." / "…or at 55,000." for the skip toast. */
function nextDueText(next: { nextDueDate: Date | null; nextDueMileage: number | null }, fmt: Formatter) {
  const parts = [
    next.nextDueDate ? fmt.date(next.nextDueDate) : null,
    next.nextDueMileage != null ? `里程 ${next.nextDueMileage.toLocaleString()}` : null,
  ].filter(Boolean)
  return parts.length ? `下次到期 ${parts.join(" 或 ")}。` : ""
}

/** The menu entry for skipping, shared with the bell's own menu. Hidden when there's nothing to skip to. */
export function SkipItem({ schedule, onSkip }: { schedule: Props["schedule"]; onSkip: () => void }) {
  if (!canSkip(schedule)) return null
  return (
    <DropdownMenuItem onClick={onSkip}>
      <SkipForward className="mr-2 h-4 w-4" /> 本次跳过
    </DropdownMenuItem>
  )
}

/** Snooze a reminder for a while, wake it early, or pause it outright. */
export function SnoozeMenu({ schedule, iconOnly = false, className }: Props) {
  const { pending, run, snooze, pause, skip } = useReminderActions(schedule)
  const snoozed = isSnoozed(schedule)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`稍后提醒“${schedule.title}”`}
        disabled={pending}
        className={cn(
          "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50",
          iconOnly ? "w-7" : "px-2",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <AlarmClockOff className="h-3.5 w-3.5" />
        {!iconOnly && "稍后提醒"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {schedule.isActive && SNOOZE_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => snooze(o.value, o.label)}>
            {o.label}
          </DropdownMenuItem>
        ))}
        {schedule.isActive && snoozed && (
          <DropdownMenuItem onClick={() => run(() => snoozeMaintenanceSchedule(schedule.id, null), `“${schedule.title}”已恢复提醒。`)}>
            <BellRing className="mr-2 h-4 w-4" /> 取消稍后提醒
          </DropdownMenuItem>
        )}
        {schedule.isActive && <DropdownMenuSeparator />}
        {schedule.isActive && <SkipItem schedule={schedule} onSkip={skip} />}
        {schedule.isActive ? (
          <DropdownMenuItem onClick={pause}>
            <Pause className="mr-2 h-4 w-4" /> 暂停
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => run(() => setMaintenanceScheduleActive(schedule.id, true), `“${schedule.title}”已恢复。`)}>
            <Play className="mr-2 h-4 w-4" /> 恢复
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
