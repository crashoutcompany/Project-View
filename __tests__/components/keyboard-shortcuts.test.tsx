/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"

import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, Settings } from "@/lib/settings"
import type { ChannelResult } from "@/lib/types"

vi.doMock("@/app/actions", () => ({
  searchChannelsAction: vi.fn(),
  refreshSelectedChannelsAction: vi.fn(),
}))

vi.doMock("@/components/channel-combobox", () => ({
  ChannelCombobox: () => <input aria-label="Search channels" />,
}))
vi.doMock("@/components/channel-results", () => ({ ChannelResults: () => null }))
// Tiles keep the attributes the app looks for, plus the props under test.
vi.doMock("@/components/live-grid", () => ({
  LiveGrid: ({
    channels,
    activeAudioChannelId,
    focusedChannelId,
  }: {
    channels: ChannelResult[]
    activeAudioChannelId: string | null
    focusedChannelId: string | null
  }) => (
    <div data-testid="live-grid" data-audio={activeAudioChannelId ?? ""}>
      {channels.map((channel) => (
        <div
          key={channel.channelId}
          data-tile=""
          data-channel-id={channel.channelId}
          data-testid={`tile-${channel.channelId}`}
          data-focused={focusedChannelId === channel.channelId || undefined}
        />
      ))}
    </div>
  ),
}))

let MultiwatchApp: typeof import("@/components/multiwatch-app").MultiwatchApp

beforeAll(async () => {
  ;({ MultiwatchApp } = await import("@/components/multiwatch-app"))
})

function makeChannel(channelId: string): ChannelResult {
  return {
    platform: "youtube",
    channelId,
    title: `Channel ${channelId}`,
    description: "",
    thumbnailUrl: "",
    live: { status: "live", checkedAt: "2026-11-01T00:00:00.000Z", videoId: `v-${channelId}` },
  }
}

function store(settings: Partial<Settings>) {
  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...DEFAULT_SETTINGS, ...settings })
  )
  window.dispatchEvent(new StorageEvent("storage", { key: SETTINGS_STORAGE_KEY }))
}

function renderApp(channelIds = ["a", "b", "c"]) {
  return render(
    <MultiwatchApp
      initialQuery=""
      initialResults={[]}
      initialSeedResults={[]}
      initialSelectedChannels={channelIds.map(makeChannel)}
      initialUpdatedAt="2026-11-01T00:00:00.000Z"
      configured
      platforms={["youtube"]}
      twitchParents={["localhost"]}
    />
  )
}

function press(key: string, target: Element = document.body, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(target, { key, ...init })
}

function audio() {
  return screen.getByTestId("live-grid").dataset.audio
}

function focused() {
  return document.querySelector<HTMLElement>("[data-focused]")?.dataset.channelId ?? null
}

describe("keyboard shortcuts", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, "", "/")
  })

  afterEach(() => {
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled
    delete (document as { fullscreenElement?: Element | null }).fullscreenElement
    delete (document as { exitFullscreen?: unknown }).exitFullscreen
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen
  })

  it("focuses streams by number in grid order, and ignores numbers past the last stream", () => {
    renderApp()

    press("2")
    expect(focused()).toBe("b")

    press("3")
    expect(focused()).toBe("c")

    press("4")
    press("9")
    expect(focused()).toBe("c")
  })

  it("moves audio with the focus when audio follows focus", () => {
    renderApp()
    act(() => store({ audioFollowsFocus: true }))

    expect(audio()).toBe("a")
    press("2")
    expect(audio()).toBe("b")
  })

  it("leaves audio alone on focus when audio does not follow focus", () => {
    renderApp()

    press("2")
    expect(audio()).toBe("a")
  })

  it("mutes and unmutes the focused stream with M", () => {
    renderApp()

    press("m")
    expect(audio()).toBe("")
    press("M")
    expect(audio()).toBe("a")

    // Unmuting a stream that wasn't playing moves the audio to it.
    press("3")
    press("m")
    expect(audio()).toBe("c")
    press("m")
    expect(audio()).toBe("")
  })

  it("fullscreens the focused stream's tile with F, and exits with F again", () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true })
    const requestFullscreen = vi.fn(() => Promise.resolve())
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    })
    const exitFullscreen = vi.fn(() => Promise.resolve())
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen })

    renderApp()
    press("2")
    press("f")

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(requestFullscreen.mock.contexts[0]).toBe(screen.getByTestId("tile-b"))

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: screen.getByTestId("tile-b"),
    })
    press("F")

    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it("does nothing on F where the browser can't fullscreen an element", () => {
    const requestFullscreen = vi.fn(() => Promise.resolve())
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    })

    renderApp()
    press("f")

    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it("opens the help with ?, closes it with Esc or ?, and blocks other keys while open", () => {
    renderApp()

    press("?")
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    expect(within(dialog).getByText(/separate sites/)).toBeInTheDocument()
    // Radix moves focus into the dialog.
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    press("2", document.activeElement!)
    expect(focused()).toBeNull()

    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument()

    press("?")
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument()
    press("?", document.activeElement!)
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument()
  })

  it("ignores keys typed in search or chat, or with a modifier held", () => {
    renderApp()

    press("2", screen.getByRole("textbox", { name: "Search channels" }))
    press("m", screen.getByRole("textbox", { name: "Search channels" }))
    expect(focused()).toBeNull()
    expect(audio()).toBe("a")

    // The chat panel opens from its floating button.
    fireEvent.click(screen.getByRole("button", { name: /chat/i }))
    const chat = screen.getByRole("complementary", { name: "Live chat" })
    press("2", within(chat).getByRole("button", { name: "Close chat" }))
    press("?", chat)
    expect(focused()).toBeNull()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    press("2", document.body, { ctrlKey: true })
    press("m", document.body, { metaKey: true })
    press("f", document.body, { altKey: true })
    expect(focused()).toBeNull()
    expect(audio()).toBe("a")
  })

  it("mentions the shortcuts in the settings panel", () => {
    renderApp()

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))

    expect(screen.getByRole("dialog", { name: "Settings" })).toHaveTextContent(
      "Press ? for shortcuts."
    )
  })
})
