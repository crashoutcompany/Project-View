/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { LiveBadge } from "@/components/live-badge"

const now = Date.parse("2026-03-06T02:14:00.000Z")

describe("LiveBadge", () => {
  it("shows the LIVE pill, viewer count and uptime when known", () => {
    render(
      <LiveBadge
        live={{
          status: "live",
          checkedAt: "x",
          startedAt: "2026-03-06T00:00:00.000Z",
          viewerCount: 1234,
        }}
        now={now}
      />
    )

    expect(screen.getByText("Live")).toBeInTheDocument()
    expect(screen.getByTitle("1234 watching")).toHaveTextContent("1.2K watching")
    expect(screen.getByText("live 2h 14m")).toBeInTheDocument()
  })

  it("shows only the pill when viewer count and start time are unknown", () => {
    const { container } = render(
      <LiveBadge live={{ status: "live", checkedAt: "x" }} now={now} />
    )

    expect(screen.getByText("Live")).toBeInTheDocument()
    expect(screen.queryByText(/watching/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^live \d/)).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="live-badge"]')).toBeInTheDocument()
  })

  it.each(["offline", "unknown"] as const)("renders nothing when %s", (status) => {
    const { container } = render(
      <LiveBadge
        live={{ status, checkedAt: "x", viewerCount: 10, startedAt: "2026-03-06T00:00:00.000Z" }}
        now={now}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
