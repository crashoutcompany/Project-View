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

const UC1 = "UC1234567890abcdefghij_-"
const UC2 = "UCzyxwvutsrqponmlkjihg-_"
const ucId = (i: number) => `UC${String(i).padStart(22, "0")}`

describe("sanitizeChannelIds", () => {
  it("dedupes and drops blank or malformed ids", () => {
    expect(
      sanitizeChannelIds([UC1, "", UC1, "../x", "a b", 7, UC2])
    ).toEqual([UC1, UC2])
  })

  it("caps URL-supplied ids so one request cannot fan out without bound", () => {
    const ids = Array.from({ length: MAX_SELECTED_CHANNELS + 25 }, (_, i) => ucId(i))

    expect(sanitizeChannelIds(ids)).toHaveLength(MAX_SELECTED_CHANNELS)
  })
})

describe("channel id prefixes", () => {
  it("parses tw: and yt: ids and treats unprefixed ids as YouTube", () => {
    expect(parseChannelId("tw:12345")).toEqual({ platform: "twitch", id: "12345", channelId: "tw:12345" })
    expect(parseChannelId(`yt:${UC1}`)).toEqual({ platform: "youtube", id: UC1, channelId: UC1 })
    expect(parseChannelId(UC1)).toEqual({ platform: "youtube", id: UC1, channelId: UC1 })
    expect(parseChannelId("tw:login")).toBeNull()
    expect(parseChannelId("tw:")).toBeNull()
    expect(parseChannelId("yt:../x")).toBeNull()
  })

  it("canonicalizes mixed URL ids and dedupes yt:/bare duplicates", () => {
    expect(sanitizeChannelIds([`yt:${UC1}`, "tw:9", UC1, "tw:9", "tw:x"])).toEqual([UC1, "tw:9"])
  })

  it("caps both platforms together", () => {
    const ids = Array.from({ length: MAX_SELECTED_CHANNELS }, (_, i) => (i % 2 ? ucId(i) : `tw:${i}`))

    expect(sanitizeChannelIds([...ids, "tw:999999", ucId(99)])).toHaveLength(MAX_SELECTED_CHANNELS)
  })

  it("only accepts real YouTube channel ids: UC plus 22 id characters", () => {
    for (const bad of ["UC123", "chan-2", "uc1234567890abcdefghij_-", `${UC1}x`, UC1.slice(0, 23), "UC1234567890abcdefghij.-", "x".repeat(64), "yt:", ""]) {
      expect(parseChannelId(bad)).toBeNull()
    }
    expect(parseChannelId(UC1)?.platform).toBe("youtube")
  })

  it("caps URL ids at 12 channels", () => {
    expect(MAX_SELECTED_CHANNELS).toBe(12)
  })

  it("keeps YouTube cache keys unchanged and namespaces Twitch ones", () => {
    expect(channelCacheKey(UC1)).toBe(`yt:channel:v1:${UC1}`)
    expect(liveCacheKey(UC1)).toBe(`yt:live:v1:${UC1}`)
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
