import { describe, expect, it } from "vitest"

import { recordLiveCheck, seedOfflineState } from "@/lib/offline-tracker"
import type { LiveState } from "@/lib/types"

function check(statuses: Record<string, LiveState>) {
  return Object.entries(statuses).map(([channelId, status]) => ({
    channelId,
    live: { status, checkedAt: "2026-10-30T00:00:00.000Z" },
  }))
}

describe("offline tracker", () => {
  it("removes a stream only after two missed checks in a row", () => {
    let state = seedOfflineState(check({ a: "live" }))

    let result = recordLiveCheck(state, check({ a: "offline" }))
    expect(result.expired).toEqual([])
    state = result.state

    result = recordLiveCheck(state, check({ a: "offline" }))
    expect(result.expired).toEqual(["a"])
    expect(result.state.a).toBeUndefined()
  })

  it("resets the count when the stream comes back", () => {
    let state = seedOfflineState(check({ a: "live" }))
    state = recordLiveCheck(state, check({ a: "offline" })).state
    state = recordLiveCheck(state, check({ a: "live" })).state

    expect(recordLiveCheck(state, check({ a: "offline" })).expired).toEqual([])
  })

  it("never removes streams that were not seen live", () => {
    let state = seedOfflineState(check({ a: "offline" }))
    for (let index = 0; index < 5; index += 1) {
      const result = recordLiveCheck(state, check({ a: "offline" }))
      expect(result.expired).toEqual([])
      state = result.state
    }
  })

  it("does not count failed (unknown) checks as misses", () => {
    let state = seedOfflineState(check({ a: "live" }))
    state = recordLiveCheck(state, check({ a: "offline" })).state
    state = recordLiveCheck(state, check({ a: "unknown" })).state

    expect(recordLiveCheck(state, check({ a: "offline" })).expired).toEqual(["a"])
  })

  it("starts tracking channels added after the seed", () => {
    let state = seedOfflineState([])
    state = recordLiveCheck(state, check({ b: "live" })).state
    state = recordLiveCheck(state, check({ b: "offline" })).state

    expect(recordLiveCheck(state, check({ b: "offline" })).expired).toEqual(["b"])
  })
})
