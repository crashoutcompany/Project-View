import { describe, expect, it } from "vitest"

import { MIN_TILE_WIDTH, packGrid } from "@/lib/grid-pack"

const HEADER = 32

describe("packGrid", () => {
  it("fits four streams 2 by 2 on a 16:10 screen with no letterboxing", () => {
    const pack = packGrid({ count: 4, width: 1720, height: 1081, headerHeight: HEADER, gap: 1 })

    expect(pack).toEqual({ columns: 2, tileWidth: 859, tileHeight: 483 + HEADER })
    // The rows fit, with the spare height left over around the grid.
    expect(pack!.tileHeight * 2 + 1).toBeLessThanOrEqual(1081)
  })

  it("picks the column count with the biggest tiles", () => {
    // Wide and short: three side by side beats stacking.
    expect(packGrid({ count: 3, width: 1920, height: 500, headerHeight: HEADER })?.columns).toBe(3)
    // Tall and narrow: one column.
    expect(packGrid({ count: 3, width: 400, height: 1200, headerHeight: HEADER })?.columns).toBe(1)
  })

  it("gives one stream the whole width when the height allows", () => {
    expect(packGrid({ count: 1, width: 1600, height: 1000, headerHeight: HEADER })).toEqual({
      columns: 1,
      tileWidth: 1600,
      tileHeight: 900 + HEADER,
    })
  })

  it("stops shrinking at a minimum width and lets the rows scroll", () => {
    const pack = packGrid({ count: 20, width: 1200, height: 600, headerHeight: HEADER })

    expect(pack!.tileWidth).toBeGreaterThanOrEqual(MIN_TILE_WIDTH)
    expect(pack!.columns).toBe(4)
  })

  it("returns nothing for an empty wall or before the box has a size", () => {
    expect(packGrid({ count: 0, width: 800, height: 600, headerHeight: HEADER })).toBeNull()
    expect(packGrid({ count: 2, width: 0, height: 0, headerHeight: HEADER })).toBeNull()
  })
})
