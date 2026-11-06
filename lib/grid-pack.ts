// Packs 16:9 stream tiles into a box, like a video call's gallery view: try
// every column count and keep the one with the biggest tiles. Each tile is a
// header strip on top of a 16:9 player, so the player never letterboxes and
// any spare space collects around the grid instead of inside every tile.

export const VIDEO_ASPECT = 16 / 9

// Below this the tiles stop shrinking and the wall scrolls instead.
export const MIN_TILE_WIDTH = 280

export type GridPack = {
  columns: number
  tileWidth: number
  tileHeight: number
}

type PackInput = {
  count: number
  width: number
  height: number
  // Height of the strip above each player.
  headerHeight: number
  gap?: number
}

export function packGrid({ count, width, height, headerHeight, gap = 0 }: PackInput): GridPack | null {
  if (count < 1 || width <= 0 || height <= 0) {
    return null
  }

  let columns = 1
  let tileWidth = 0

  for (let candidate = 1; candidate <= count; candidate += 1) {
    const rows = Math.ceil(count / candidate)
    const widthLimit = (width - gap * (candidate - 1)) / candidate
    const heightLimit = ((height - gap * (rows - 1)) / rows - headerHeight) * VIDEO_ASPECT
    const candidateWidth = Math.min(widthLimit, heightLimit)

    if (candidateWidth > tileWidth) {
      columns = candidate
      tileWidth = candidateWidth
    }
  }

  // Too many streams to fit at a watchable size: keep a readable width and
  // let the rows scroll.
  if (tileWidth < Math.min(MIN_TILE_WIDTH, width)) {
    columns = Math.min(count, Math.max(1, Math.floor((width + gap) / (MIN_TILE_WIDTH + gap))))
    tileWidth = (width - gap * (columns - 1)) / columns
  }

  const roundedWidth = Math.floor(tileWidth)

  return {
    columns,
    tileWidth: roundedWidth,
    tileHeight: Math.round(roundedWidth / VIDEO_ASPECT) + headerHeight,
  }
}
