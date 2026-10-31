import type { ChannelResult } from "@/lib/types"

// Auto-remove bookkeeping. A stream is only removed after it was seen live in
// this visit and then missed `grace` live checks in a row, so a brief blip or
// a channel that was added while offline never disappears on its own.

export const OFFLINE_GRACE_CHECKS = 2

export type OfflineEntry = { seenLive: boolean; misses: number }
export type OfflineState = Record<string, OfflineEntry>

export function recordLiveCheck(
  previous: OfflineState,
  channels: Pick<ChannelResult, "channelId" | "live">[],
  grace = OFFLINE_GRACE_CHECKS
) {
  const state: OfflineState = {}
  const expired: string[] = []

  for (const channel of channels) {
    const entry = previous[channel.channelId] ?? { seenLive: false, misses: 0 }

    if (channel.live.status === "live") {
      state[channel.channelId] = { seenLive: true, misses: 0 }
      continue
    }

    // "unknown" means the check itself failed, so it is not a miss.
    if (channel.live.status === "unknown" || !entry.seenLive) {
      state[channel.channelId] = entry
      continue
    }

    const misses = entry.misses + 1
    if (misses >= grace) {
      expired.push(channel.channelId)
    } else {
      state[channel.channelId] = { seenLive: true, misses }
    }
  }

  return { state, expired }
}

/** Starts tracking from what is on screen now: live channels count as seen. */
export function seedOfflineState(channels: Pick<ChannelResult, "channelId" | "live">[]) {
  return Object.fromEntries(
    channels.map((channel) => [
      channel.channelId,
      { seenLive: channel.live.status === "live", misses: 0 },
    ])
  ) satisfies OfflineState
}
