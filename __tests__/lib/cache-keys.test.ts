import { describe, expect, it } from "@jest/globals"

import {
  MAX_QUERY_LENGTH,
  MAX_SELECTED_CHANNELS,
  normalizeQuery,
  sanitizeChannelIds,
} from "@/lib/cache-keys"

describe("sanitizeChannelIds", () => {
  it("dedupes and drops blank or malformed ids", () => {
    expect(
      sanitizeChannelIds(["UC123", "", "UC123", "../x", "a b", 7, "chan-2"])
    ).toEqual(["UC123", "chan-2"])
  })

  it("caps URL-supplied ids so one request cannot fan out without bound", () => {
    const ids = Array.from({ length: MAX_SELECTED_CHANNELS + 25 }, (_, i) => `chan-${i}`)

    expect(sanitizeChannelIds(ids)).toHaveLength(MAX_SELECTED_CHANNELS)
  })
})

describe("normalizeQuery", () => {
  it("caps query length", () => {
    expect(normalizeQuery("a".repeat(MAX_QUERY_LENGTH + 50))).toHaveLength(MAX_QUERY_LENGTH)
  })

  it("keeps existing normalization", () => {
    expect(normalizeQuery("  @Some   Channel ")).toBe("some channel")
  })
})
