"use client"

import * as React from "react"

import { Shortcut, shortcutForKey } from "@/lib/keyboard-shortcuts"

/** One window keydown listener that turns keys into shortcuts. */
export function useKeyboardShortcuts(onShortcut: (shortcut: Shortcut) => void) {
  const handleShortcut = React.useEffectEvent(onShortcut)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = shortcutForKey(event)
      if (!shortcut) {
        return
      }

      event.preventDefault()
      handleShortcut(shortcut)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
