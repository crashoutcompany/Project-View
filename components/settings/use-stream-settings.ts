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

// Live checks while auto-remove is on. They read the server's live cache
// (60s while live, 10 min while offline), so most polls cost no API quota.
export const LIVE_CHECK_INTERVAL_MS = 90_000
const UNDO_TOAST_MS = 10_000

type UseStreamSettingsOptions = {
  channels: ChannelResult[]
  activeAudioChannelId: string | null
  // Runs a live check; the results come back through `recordCheck`.
  onLiveCheck: () => void
  // Puts removed channels back (undo).
  onRestoreChannels: (channels: ChannelResult[]) => void
}

export type RemovedToast = { id: number; channels: ChannelResult[] }

// Marks the stream wall, the one element the app itself puts in fullscreen.
export const STREAM_WALL_ATTRIBUTE = "data-stream-wall"

// One stream shown over the fullscreen wall. `fromWall` says where F goes
// back to: the wall, or out of fullscreen when it started from the page.
export type Spotlight = { channelId: string; fromWall: boolean }

type FullscreenState = {
  // Set when a player's own button made its iframe fullscreen.
  channelId: string | null
  wall: boolean
}

const NOT_FULLSCREEN: FullscreenState = { channelId: null, wall: false }

function readFullscreen(): FullscreenState {
  const element = document.fullscreenElement
  if (!(element instanceof HTMLElement)) {
    return NOT_FULLSCREEN
  }

  return {
    channelId: element.dataset.channelId ?? null,
    wall: element.hasAttribute(STREAM_WALL_ATTRIBUTE),
  }
}

/**
 * Wires the stored settings into the multiwatch page: which stream has audio,
 * auto-removing streams that went offline, and remembering the selection.
 */
export function useStreamSettings({
  channels,
  activeAudioChannelId,
  onLiveCheck,
  onRestoreChannels,
}: UseStreamSettingsOptions) {
  const settings = useSettings()
  const [focusedChannelId, setFocusedChannelId] = React.useState<string | null>(null)
  const [fullscreen, setFullscreen] = React.useState(NOT_FULLSCREEN)
  const [spotlightState, setSpotlight] = React.useState<Spotlight | null>(null)
  // Set by the mute shortcut: every stream stays muted until it is cleared.
  const [audioMuted, setAudioMuted] = React.useState(false)
  const [removedToast, setRemovedToast] = React.useState<RemovedToast | null>(null)
  const offlineStateRef = React.useRef<OfflineState | null>(null)
  const channelIds = channels.map((channel) => channel.channelId)
  const channelKey = channelIds.join(",")

  // Fullscreen from a player's own button makes its iframe the fullscreen
  // element, which the parent page can see even across origins. Leaving
  // fullscreen entirely (Esc) ends the spotlight; a player's own fullscreen on
  // top of the wall keeps it for when the player exits.
  React.useEffect(() => {
    function onFullscreenChange() {
      const next = readFullscreen()
      setFullscreen(next)
      if (!next.wall && !next.channelId) {
        setSpotlight(null)
      }
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
          setAudioMuted(false)
        }
      }, 0)
    }

    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [settings.audioFollowsFocus])

  // Only valid while the wall is fullscreen and the stream is still on it.
  const spotlight =
    fullscreen.wall && spotlightState && channelIds.includes(spotlightState.channelId)
      ? spotlightState
      : null
  // A spotlit stream counts as fullscreen, for audio and the resource saver.
  const fullscreenId = fullscreen.channelId ?? spotlight?.channelId ?? null

  const resolvedAudioChannelId = resolveAudioChannelId({
    channelIds,
    activeAudioChannelId,
    focusedChannelId,
    fullscreenChannelId: fullscreenId,
    settings,
  })
  const audioChannelId = audioMuted ? null : resolvedAudioChannelId

  // Clicking a stream, or its number key, focuses it. When audio follows
  // focus, that also brings the sound back after a mute.
  function focusStream(channelId: string) {
    setFocusedChannelId(channelId)
    if (settings.audioFollowsFocus) {
      setAudioMuted(false)
    }
  }

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

      const expiredIds = new Set(expired)
      setRemovedToast({
        id: Date.now(),
        channels: refreshed.filter((channel) => expiredIds.has(channel.channelId)),
      })
      return refreshed.filter((channel) => !expiredIds.has(channel.channelId))
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

  // Remember the last streams. The ids to reopen are returned as data, only
  // while the page opened empty and nothing has been picked yet; the caller
  // opens them and marks the restore handled.
  const [openedEmpty] = React.useState(channelKey === "")
  const [restoreHandled, setRestoreHandled] = React.useState(false)
  const restoreChannelIds =
    openedEmpty &&
    !restoreHandled &&
    channelKey === "" &&
    settings.rememberLastStreams &&
    settings.lastChannelIds.length > 0
      ? settings.lastChannelIds
      : null

  const seenSelectionRef = React.useRef(false)
  const remember = settings.rememberLastStreams
  React.useEffect(() => {
    if (channelKey) {
      seenSelectionRef.current = true
    }

    // Turning the setting off forgets the list.
    if (!remember) {
      if (readSettings().lastChannelIds.length > 0) {
        updateSettings((current) => ({ ...current, lastChannelIds: [] }))
      }
      return
    }

    // An empty selection on load must not wipe the list we are restoring.
    if (!seenSelectionRef.current) {
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
    // Only a stream on this wall counts as fullscreen.
    fullscreenChannelId: fullscreenId && channelIds.includes(fullscreenId) ? fullscreenId : null,
    // True while the wall itself is the fullscreen element.
    wallFullscreen: fullscreen.wall,
    spotlight,
    setSpotlight,
    // Re-sync mutes on every fullscreen change while that setting is on.
    audioSyncKey: settings.muteOthersOnFullscreen ? (fullscreenId ?? "") : "",
    onFocusAudio: settings.audioFollowsFocus ? focusStream : undefined,
    // The last clicked or keyed stream, if it is still on this wall.
    focusedChannelId:
      focusedChannelId && channelIds.includes(focusedChannelId) ? focusedChannelId : null,
    focusStream,
    setAudioMuted,
    recordCheck,
    restoreChannelIds,
    onRestoreHandled: () => setRestoreHandled(true),
    removedToast,
    undoRemove,
    dismissRemovedToast: () => setRemovedToast(null),
  }
}
