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
    spotlightChannelId,
  }: {
    channels: ChannelResult[]
    activeAudioChannelId: string | null
    focusedChannelId: string | null
    spotlightChannelId: string | null
  }) => (
    <div
      data-testid="live-grid"
      data-audio={activeAudioChannelId ?? ""}
      data-spotlight={spotlightChannelId ?? ""}
    >
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

function spotlight() {
  return screen.getByTestId("live-grid").dataset.spotlight
}

function wall() {
  return screen.getByTestId("live-grid").closest("main")!
}

// Stubs the Fullscreen API. The browser fires fullscreenchange once a request
// settles, so `setFullscreenElement` does the same.
function stubFullscreen() {
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true })
  let element: Element | null = null
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => element,
  })
  const requestFullscreen = vi.fn(() => Promise.resolve())
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  })
  const exitFullscreen = vi.fn(() => Promise.resolve())
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen })

  function setFullscreenElement(next: Element | null) {
    element = next
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"))
    })
  }

  return { requestFullscreen, exitFullscreen, setFullscreenElement }
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

  it("fullscreens the focused stream with F as a spotlight on the wall, and exits with F again", () => {
    const { requestFullscreen, exitFullscreen, setFullscreenElement } = stubFullscreen()

    renderApp()
    press("2")
    press("f")

    // The wall goes fullscreen, never a tile, so switching needs no new request.
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(requestFullscreen.mock.contexts[0]).toBe(wall())
    setFullscreenElement(wall())
    expect(spotlight()).toBe("b")

    press("F")

    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it("switches the fullscreen stream with numbers and arrows, wrapping at the ends", () => {
    const { requestFullscreen, setFullscreenElement } = stubFullscreen()

    renderApp()
    press("f")
    setFullscreenElement(wall())
    expect(spotlight()).toBe("a")
    // Mute others in fullscreen is on by default, so the audio follows.
    expect(audio()).toBe("a")

    press("3")
    expect(spotlight()).toBe("c")
    expect(audio()).toBe("c")

    press("ArrowRight")
    expect(spotlight()).toBe("a")
    press("ArrowLeft")
    expect(spotlight()).toBe("c")
    press("ArrowLeft")
    expect(spotlight()).toBe("b")

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it("spotlights a stream on the fullscreen wall with F, and goes back to the wall with F", () => {
    const { requestFullscreen, exitFullscreen, setFullscreenElement } = stubFullscreen()

    renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen streams" }))
    setFullscreenElement(wall())
    expect(spotlight()).toBe("")

    // On the wall, numbers only move the focus.
    press("2")
    expect(spotlight()).toBe("")
    expect(focused()).toBe("b")

    press("f")
    expect(spotlight()).toBe("b")
    press("ArrowRight")
    expect(spotlight()).toBe("c")

    press("f")
    expect(spotlight()).toBe("")
    expect(focused()).toBe("c")
    expect(exitFullscreen).not.toHaveBeenCalled()
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it("ends the spotlight when the browser leaves fullscreen, e.g. on Esc", () => {
    const { setFullscreenElement } = stubFullscreen()

    renderApp()
    press("f")
    setFullscreenElement(wall())
    expect(spotlight()).toBe("a")

    setFullscreenElement(null)
    expect(spotlight()).toBe("")
    expect(screen.queryByRole("button", { name: "Next stream" })).not.toBeInTheDocument()
  })

  it("keeps the spotlight under a player's own fullscreen", () => {
    const { setFullscreenElement } = stubFullscreen()

    renderApp()
    press("f")
    setFullscreenElement(wall())
    setFullscreenElement(screen.getByTestId("tile-a"))
    setFullscreenElement(wall())

    expect(spotlight()).toBe("a")
  })

  it("drops the spotlight when the fullscreen request fails", async () => {
    const { requestFullscreen } = stubFullscreen()
    requestFullscreen.mockImplementationOnce(() => Promise.reject(new Error("denied")))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      renderApp()
      press("f")
      await act(async () => {})

      expect(consoleError).toHaveBeenCalled()
      // A later wall fullscreen from the button starts without a spotlight.
      fireEvent.click(screen.getByRole("button", { name: "Fullscreen streams" }))
      expect(spotlight()).toBe("")
    } finally {
      consoleError.mockRestore()
    }
  })

  it("shows switcher arrows over a fullscreen stream unless the setting is off", () => {
    const { setFullscreenElement } = stubFullscreen()

    renderApp()
    press("f")
    setFullscreenElement(wall())

    expect(screen.getByText("1 / 3").closest("p")).toHaveTextContent("1 / 3 · Channel a")
    fireEvent.click(screen.getByRole("button", { name: "Next stream" }))
    expect(spotlight()).toBe("b")
    fireEvent.click(screen.getByRole("button", { name: "Previous stream" }))
    expect(spotlight()).toBe("a")

    act(() => store({ fullscreenSwitcher: false }))
    expect(screen.queryByRole("button", { name: "Next stream" })).not.toBeInTheDocument()
    // The keys still switch.
    press("ArrowRight")
    expect(spotlight()).toBe("b")
  })

  it("renders the help inside the wall while it is fullscreen", () => {
    const { setFullscreenElement } = stubFullscreen()

    renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen streams" }))
    setFullscreenElement(wall())
    press("?")

    expect(wall()).toContainElement(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
  })

  it("moves the focus with the arrow keys outside fullscreen", () => {
    renderApp()

    press("ArrowRight")
    expect(focused()).toBe("b")
    press("ArrowLeft")
    press("ArrowLeft")
    expect(focused()).toBe("c")
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
