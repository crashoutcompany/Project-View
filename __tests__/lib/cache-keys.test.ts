import { describe, expect, it } from "vitest"

import {
  channelCacheKey,
  liveCacheKey,
  MAX_QUERY_LENGTH,
  parseChannelId,
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

describe("channel id prefixes", () => {
  it("parses tw: and yt: ids and treats unprefixed ids as YouTube", () => {
    expect(parseChannelId("tw:12345")).toEqual({ platform: "twitch", id: "12345", channelId: "tw:12345" })
    expect(parseChannelId("yt:UC123")).toEqual({ platform: "youtube", id: "UC123", channelId: "UC123" })
    expect(parseChannelId("UC123")).toEqual({ platform: "youtube", id: "UC123", channelId: "UC123" })
    expect(parseChannelId("tw:login")).toBeNull()
    expect(parseChannelId("tw:")).toBeNull()
    expect(parseChannelId("yt:../x")).toBeNull()
  })

  it("canonicalizes mixed URL ids and dedupes yt:/bare duplicates", () => {
    expect(sanitizeChannelIds(["yt:UC1", "tw:9", "UC1", "tw:9", "tw:x"])).toEqual(["UC1", "tw:9"])
  })

  it("caps both platforms together", () => {
    const ids = Array.from({ length: MAX_SELECTED_CHANNELS }, (_, i) => (i % 2 ? `UC${i}` : `tw:${i}`))

    expect(sanitizeChannelIds([...ids, "tw:999999", "UCextra"])).toHaveLength(MAX_SELECTED_CHANNELS)
  })

  it("keeps YouTube cache keys unchanged and namespaces Twitch ones", () => {
    expect(channelCacheKey("UC1")).toBe("yt:channel:v1:UC1")
    expect(liveCacheKey("UC1")).toBe("yt:live:v1:UC1")
    expect(channelCacheKey("tw:9")).toBe("tw:channel:v1:9")
    expect(liveCacheKey("tw:9")).toBe("tw:live:v1:9")
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
