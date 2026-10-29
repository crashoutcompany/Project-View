import { describe, expect, it } from "vitest"

import {
  compareLiveFirst,
  formatUptime,
  sortLiveFirst,
} from "@/lib/live"
import type { LiveStatus } from "@/lib/types"

function channel(id: string, live: Partial<LiveStatus> = {}) {
  return {
    channelId: id,
    live: { status: "offline", checkedAt: "x", ...live } as LiveStatus,
  }
}

describe("sortLiveFirst", () => {
  it("puts live channels first", () => {
    const sorted = sortLiveFirst([
      channel("offline-1"),
      channel("live-1", { status: "live" }),
      channel("unknown-1", { status: "unknown" }),
      channel("live-2", { status: "live", startedAt: "2026-03-06T00:00:00.000Z" }),
    ])

    expect(sorted.map((item) => item.channelId)).toEqual([
      "live-1",
      "live-2",
      "offline-1",
      "unknown-1",
    ])
  })

  it("keeps the existing order for ties and treats unknown like offline", () => {
    const sorted = sortLiveFirst([
      channel("unknown-1", { status: "unknown" }),
      channel("offline-1"),
      channel("live-a", { status: "live" }),
      channel("live-b", { status: "live" }),
      channel("offline-2"),
    ])

    expect(sorted.map((item) => item.channelId)).toEqual([
      "live-a",
      "live-b",
      "unknown-1",
      "offline-1",
      "offline-2",
    ])
  })

  it("does not mutate its input", () => {
    const input = [channel("offline-1"), channel("live-1", { status: "live" })]

    sortLiveFirst(input)

    expect(input.map((item) => item.channelId)).toEqual(["offline-1", "live-1"])
  })

  it("ranks offline and unknown channels equally", () => {
    expect(
      compareLiveFirst(
        { status: "offline", checkedAt: "x" },
        { status: "unknown", checkedAt: "x" }
      )
    ).toBe(0)
  })
})

describe("formatUptime", () => {
  const now = Date.parse("2026-03-06T02:14:30.000Z")

  it("formats hours and minutes", () => {
    expect(formatUptime("2026-03-06T00:00:00.000Z", now)).toBe("2h 14m")
    expect(formatUptime("2026-03-05T02:14:00.000Z", now)).toBe("24h 0m")
  })

  it("formats minutes under an hour", () => {
    expect(formatUptime("2026-03-06T02:00:00.000Z", now)).toBe("14m")
    expect(formatUptime("2026-03-06T02:14:10.000Z", now)).toBe("0m")
  })

  it("returns null for missing, invalid or future start times", () => {
    expect(formatUptime(undefined, now)).toBeNull()
    expect(formatUptime("not a date", now)).toBeNull()
    expect(formatUptime("2026-03-06T03:00:00.000Z", now)).toBeNull()
  })
})
