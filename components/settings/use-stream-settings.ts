"use client"

import * as React from "react"

import { resolveAudioChannelId } from "@/lib/audio-focus"
import {
  OfflineState,
  recordLiveCheck,
  seedOfflineState,
} from "@/lib/offline-tracker"
import { ChannelResult } from "@/lib/types"
import { readSettings, updateSettings, useSettings } from "@/lib/use-settings"

// Live checks while auto-remove is on. Live status is cached for 60s on the
// server, so this mostly reads the cache rather than spending API quota.
export const LIVE_CHECK_INTERVAL_MS = 90_000
const UNDO_TOAST_MS = 10_000

type UseStreamSettingsOptions = {
  channels: ChannelResult[]
  activeAudioChannelId: string | null
  // Runs a live check; the results come back through `recordCheck`.
  onLiveCheck: () => void
  // Replaces the selection with these ids (restore last visit).
  onOpenChannels: (channelIds: string[]) => void
  // Puts removed channels back (undo).
  onRestoreChannels: (channels: ChannelResult[]) => void
}

export type RemovedToast = { id: number; channels: ChannelResult[] }

function fullscreenChannelId() {
  const element = document.fullscreenElement
  return element instanceof HTMLElement ? (element.dataset.channelId ?? null) : null
}

/**
 * Wires the stored settings into the multiwatch page: which stream has audio,
 * auto-removing streams that went offline, and remembering the selection.
 */
export function useStreamSettings({
  channels,
  activeAudioChannelId,
  onLiveCheck,
  onOpenChannels,
  onRestoreChannels,
}: UseStreamSettingsOptions) {
  const settings = useSettings()
  const [focusedChannelId, setFocusedChannelId] = React.useState<string | null>(null)
  const [fullscreenId, setFullscreenId] = React.useState<string | null>(null)
  const [removedToast, setRemovedToast] = React.useState<RemovedToast | null>(null)
  const offlineStateRef = React.useRef<OfflineState | null>(null)
  const channelIds = channels.map((channel) => channel.channelId)
  const channelKey = channelIds.join(",")

  // Fullscreen from a player's own button makes its iframe the fullscreen
  // element, which the parent page can see even across origins.
  React.useEffect(() => {
    function onFullscreenChange() {
      setFullscreenId(fullscreenChannelId())
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  // Clicking into a player blurs the page and focuses its iframe; some
  // browsers don't fire focus on the iframe element itself.
  React.useEffect(() => {
    if (!settings.audioFollowsFocus) {
      return
    }

    function onBlur() {
      window.setTimeout(() => {
        const element = document.activeElement
        if (element instanceof HTMLIFrameElement && element.dataset.channelId) {
          setFocusedChannelId(element.dataset.channelId)
        }
      }, 0)
    }

    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [settings.audioFollowsFocus])

  const audioChannelId = resolveAudioChannelId({
    channelIds,
    activeAudioChannelId,
    focusedChannelId,
    fullscreenChannelId: fullscreenId,
    settings,
  })

  // Auto-remove: start counting from what is on screen when it is turned on.
  const autoRemove = settings.autoRemoveOffline
  React.useEffect(() => {
    offlineStateRef.current = null
  }, [autoRemove])

  const recordCheck = React.useCallback(
    (refreshed: ChannelResult[]) => {
      if (!readSettings().autoRemoveOffline) {
        return refreshed
      }

      const previous = offlineStateRef.current ?? seedOfflineState(channels)
      const { state, expired } = recordLiveCheck(previous, refreshed)
      offlineStateRef.current = state

      if (expired.length === 0) {
        return refreshed
      }

      setRemovedToast({
        id: Date.now(),
        channels: refreshed.filter((channel) => expired.includes(channel.channelId)),
      })
      return refreshed.filter((channel) => !expired.includes(channel.channelId))
    },
    [channels]
  )

  const hasChannels = channels.length > 0
  const runLiveCheck = React.useEffectEvent(() => {
    if (document.visibilityState === "visible") {
      onLiveCheck()
    }
  })
  React.useEffect(() => {
    if (!autoRemove || !hasChannels) {
      return
    }

    const interval = window.setInterval(runLiveCheck, LIVE_CHECK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [autoRemove, hasChannels])

  React.useEffect(() => {
    if (!removedToast) {
      return
    }

    const timeout = window.setTimeout(() => setRemovedToast(null), UNDO_TOAST_MS)
    return () => window.clearTimeout(timeout)
  }, [removedToast])

  function undoRemove() {
    if (!removedToast) {
      return
    }

    // Restored streams wait until they go live again before they can be
    // auto-removed a second time.
    const state = offlineStateRef.current ?? {}
    removedToast.channels.forEach((channel) => {
      state[channel.channelId] = { seenLive: false, misses: 0 }
    })
    offlineStateRef.current = state
    onRestoreChannels(removedToast.channels)
    setRemovedToast(null)
  }

  // Remember the last streams: restore once on load when the URL has none.
  const seenSelectionRef = React.useRef(false)
  const restoreLastStreams = React.useEffectEvent(() => {
    const stored = readSettings()
    const urlHasChannels = new URLSearchParams(window.location.search).has("channels")
    if (
      stored.rememberLastStreams &&
      !urlHasChannels &&
      channelKey === "" &&
      stored.lastChannelIds.length > 0
    ) {
      onOpenChannels(stored.lastChannelIds)
    }
  })
  React.useEffect(() => {
    restoreLastStreams()
  }, [])

  const remember = settings.rememberLastStreams
  React.useEffect(() => {
    if (channelKey) {
      seenSelectionRef.current = true
    }

    // An empty selection on load must not wipe the list we are restoring.
    if (!remember || !seenSelectionRef.current) {
      return
    }

    if (readSettings().lastChannelIds.join(",") !== channelKey) {
      updateSettings((current) => ({
        ...current,
        lastChannelIds: channelKey ? channelKey.split(",") : [],
      }))
    }
  }, [remember, channelKey])

  return {
    settings,
    audioChannelId,
    // Re-sync mutes on every fullscreen change while that setting is on.
    audioSyncKey: settings.muteOthersOnFullscreen ? (fullscreenId ?? "") : "",
    onFocusAudio: settings.audioFollowsFocus ? setFocusedChannelId : undefined,
    recordCheck,
    removedToast,
    undoRemove,
    dismissRemovedToast: () => setRemovedToast(null),
  }
}
