import { ChannelResult, LiveStatus } from "@/lib/types"

// Provider-agnostic live helpers. Anything that produces a LiveStatus
// (YouTube today, Twitch later) gets the same ordering and badge text.

export function isLive(live: LiveStatus) {
  return live.status === "live"
}

// Live first. "unknown" ranks with "offline". Array.prototype.sort is stable,
// so ties keep the incoming order.
export function compareLiveFirst(a: LiveStatus, b: LiveStatus) {
  const liveA = isLive(a)
  const liveB = isLive(b)

  if (liveA === liveB) {
    return 0
  }

  return liveA ? -1 : 1
}

export function sortLiveFirst<T extends Pick<ChannelResult, "live">>(channels: T[]) {
  return [...channels].sort((a, b) => compareLiveFirst(a.live, b.live))
}

// "2h 14m", or "14m" under an hour. Null when the start time is missing,
// unparseable or in the future.
export function formatUptime(startedAt: string | undefined, now: number) {
  if (!startedAt) {
    return null
  }

  const started = Date.parse(startedAt)
  if (Number.isNaN(started) || started > now) {
    return null
  }

  const totalMinutes = Math.floor((now - started) / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
