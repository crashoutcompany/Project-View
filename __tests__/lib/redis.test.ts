/**
 * @jest-environment node
 */

import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals"

// Uses the real @upstash/redis client against a server that never answers, to
// check that our per-request abort signal rejects instead of hanging or
// resolving the abort reason as a value.
describe("getRedis", () => {
  let server: Server
  const originalEnv = { ...process.env }

  beforeAll(async () => {
    server = createServer(() => {
      // Never respond.
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as AddressInfo
    process.env.KV_REST_API_URL = `http://127.0.0.1:${port}`
    process.env.KV_REST_API_TOKEN = "token"
  })

  afterAll(async () => {
    process.env = originalEnv
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  it("aborts each hung request after REDIS_TIMEOUT_MS", async () => {
    const { getRedis, REDIS_TIMEOUT_MS } = await import("@/lib/redis")
    const redis = getRedis()
    expect(redis).not.toBeNull()

    // Twice: each request needs its own signal, not one that already fired.
    for (const key of ["first", "second"]) {
      const started = Date.now()
      await expect(redis!.get(key)).rejects.toThrow()
      const elapsed = Date.now() - started

      expect(elapsed).toBeGreaterThanOrEqual(REDIS_TIMEOUT_MS - 50)
      expect(elapsed).toBeLessThan(REDIS_TIMEOUT_MS * 2)
    }
  })
})
