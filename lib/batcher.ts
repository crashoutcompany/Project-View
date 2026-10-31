// Coalesces lookups made within a short window into one batched call, so the
// seed, search and selected lists on one page load (or one refresh action)
// share a single upstream request instead of one each.
export const BATCH_WINDOW_MS = 10

// value is undefined when the call worked but had nothing for the key.
export type BatchResult<V> = { ok: true; value: V | undefined } | { ok: false }

type Waiter<V> = (result: BatchResult<V>) => void

export function createBatcher<V>(
  // Resolves to the values found (missing keys mean "not found"), or null when
  // the whole call failed.
  fetchMany: (keys: string[]) => Promise<Map<string, V> | null>,
  maxBatchSize: number
) {
  let pending = new Map<string, Waiter<V>[]>()
  let timer: ReturnType<typeof setTimeout> | null = null

  async function flush() {
    const batch = pending
    pending = new Map()
    timer = null

    const keys = [...batch.keys()]
    for (let start = 0; start < keys.length; start += maxBatchSize) {
      const chunk = keys.slice(start, start + maxBatchSize)
      const found = await fetchMany(chunk).catch(() => null)

      for (const key of chunk) {
        const result: BatchResult<V> = found
          ? { ok: true, value: found.get(key) }
          : { ok: false }
        batch.get(key)?.forEach((resolve) => resolve(result))
      }
    }
  }

  return {
    load(key: string) {
      return new Promise<BatchResult<V>>((resolve) => {
        const waiters = pending.get(key)
        if (waiters) {
          waiters.push(resolve)
        } else {
          pending.set(key, [resolve])
        }

        timer ??= setTimeout(() => void flush(), BATCH_WINDOW_MS)
      })
    },
  }
}
