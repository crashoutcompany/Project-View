import type { Settings } from "@/lib/settings"

type AudioInputs = {
  channelIds: string[]
  // The stream picked as the audio source (the existing default).
  activeAudioChannelId: string | null
  // The last tapped or hovered stream.
  focusedChannelId: string | null
  // The stream whose player is fullscreen, if any.
  fullscreenChannelId: string | null
  settings: Pick<Settings, "audioFollowsFocus" | "muteOthersOnFullscreen">
}

/**
 * Which stream should be unmuted. Fullscreen wins while it lasts (when the
 * setting is on), then focus (when on), then the active audio stream. On
 * fullscreen exit this falls back on its own, which restores the audio.
 */
export function resolveAudioChannelId({
  channelIds,
  activeAudioChannelId,
  focusedChannelId,
  fullscreenChannelId,
  settings,
}: AudioInputs) {
  const present = (id: string | null) => (id && channelIds.includes(id) ? id : null)

  if (settings.muteOthersOnFullscreen && present(fullscreenChannelId)) {
    return fullscreenChannelId
  }

  if (settings.audioFollowsFocus && present(focusedChannelId)) {
    return focusedChannelId
  }

  return present(activeAudioChannelId)
}
