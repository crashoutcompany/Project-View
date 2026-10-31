import {
  playbackMessage,
  PlayerMessage,
  PlayerState,
  TWITCH_LOWEST_QUALITY,
  twitchQualityMessage,
  twitchRequestedQuality,
} from "@/lib/embed-control"
import type { Settings, StreamQuality } from "@/lib/settings"
import type { Platform } from "@/lib/types"

// While one stream is fullscreen, the others can pause or drop to the lowest
// quality to save bandwidth and CPU. Each tile keeps a memo of what this
// feature changed, so on exit it undoes only that: it restores the quality it
// lowered and resumes only the players it paused itself.

export type SaverAction = "pause" | "lower-quality"

export type SaverMemo = {
  action: SaverAction | null
  // The Twitch quality the player reported before we lowered it, if any.
  previousQuality: string | null
  // True only when this feature paused a playing stream.
  pausedByUs: boolean
}

export const IDLE_SAVER_MEMO: SaverMemo = Object.freeze({
  action: null,
  previousQuality: null,
  pausedByUs: false,
})

type SaverSettings = Pick<Settings, "saveResourcesOnFullscreen" | "pauseOthersOnFullscreen">

/**
 * What to do with one stream while another may be fullscreen. Pausing wins
 * when it is on, and a paused stream never has its quality touched. Otherwise
 * Twitch drops to the lowest quality and YouTube pauses, since YouTube embeds
 * no longer accept quality requests.
 */
export function fullscreenSaverAction({
  channelId,
  platform,
  fullscreenChannelId,
  settings,
}: {
  channelId: string
  platform: Platform
  fullscreenChannelId: string | null
  settings: SaverSettings
}): SaverAction | null {
  if (!fullscreenChannelId || fullscreenChannelId === channelId) {
    return null
  }

  if (settings.pauseOthersOnFullscreen) {
    return "pause"
  }

  if (settings.saveResourcesOnFullscreen) {
    return platform === "twitch" ? "lower-quality" : "pause"
  }

  return null
}

type TransitionContext = {
  platform: Platform
  // What the player last reported about itself.
  player: PlayerState
  // The quality the app asks for (the default quality setting).
  requestedQuality: StreamQuality
}

function undo(memo: SaverMemo, { platform, requestedQuality }: TransitionContext) {
  const commands: PlayerMessage[] = []

  if (memo.action === "lower-quality") {
    commands.push(
      twitchQualityMessage(memo.previousQuality ?? twitchRequestedQuality(requestedQuality))
    )
  }

  if (memo.pausedByUs) {
    commands.push(playbackMessage(platform, true))
  }

  return commands
}

function apply(action: SaverAction | null, { platform, player }: TransitionContext) {
  if (action === "lower-quality") {
    return {
      memo: { action, previousQuality: player.quality ?? null, pausedByUs: false },
      commands: [twitchQualityMessage(TWITCH_LOWEST_QUALITY)],
    }
  }

  if (action === "pause") {
    // A stream the viewer already paused stays theirs: we don't pause it and
    // so won't resume it. Unknown state counts as playing (players autoplay).
    const pausedByUs = player.playing !== false
    return {
      memo: { action, previousQuality: null, pausedByUs },
      commands: pausedByUs ? [playbackMessage(platform, false)] : [],
    }
  }

  return { memo: IDLE_SAVER_MEMO, commands: [] }
}

/**
 * Moves one stream from what the saver did last to `next`. Returns the new
 * memo and the player commands to send. Calling it with the same action again
 * returns the same memo and re-sends the apply commands, for players that
 * weren't ready the first time.
 */
export function transitionSaver(
  memo: SaverMemo,
  next: SaverAction | null,
  context: TransitionContext
): { memo: SaverMemo; commands: PlayerMessage[] } {
  if (memo.action === next) {
    if (next === "lower-quality") {
      return { memo, commands: [twitchQualityMessage(TWITCH_LOWEST_QUALITY)] }
    }
    return { memo, commands: memo.pausedByUs ? [playbackMessage(context.platform, false)] : [] }
  }

  const undone = undo(memo, context)
  const applied = apply(next, context)

  return { memo: applied.memo, commands: [...undone, ...applied.commands] }
}
