"use client"

import { X } from "lucide-react"

import type { RemovedToast } from "@/components/settings/use-stream-settings"
import { Button } from "@/components/ui/button"

type RemovedStreamsToastProps = {
  toast: RemovedToast | null
  onUndo: () => void
  onDismiss: () => void
}

export function RemovedStreamsToast({ toast, onUndo, onDismiss }: RemovedStreamsToastProps) {
  if (!toast) {
    return null
  }

  const names = toast.channels.map((channel) => channel.title)
  const label =
    names.length === 1 ? `${names[0]} went offline` : `${names.length} streams went offline`

  return (
    <div
      role="status"
      aria-live="polite"
      // Bottom-left, clear of the chat button (fixed bottom-right) and the
      // chat panel, which both live on the right edge.
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-20 z-50 flex max-w-sm items-center gap-2 border border-border bg-popover py-2 pr-2 pl-3 text-xs text-popover-foreground shadow-lg sm:bottom-4 sm:left-4 sm:right-auto sm:w-sm"
    >
      <span className="min-w-0 flex-1 truncate">
        {label} and {names.length === 1 ? "was" : "were"} removed.
      </span>
      <Button size="sm" variant="outline" onClick={onUndo} className="pointer-coarse:h-11">
        Undo
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="pointer-coarse:size-11"
      >
        <X />
      </Button>
    </div>
  )
}
