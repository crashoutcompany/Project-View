/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"

import { SettingsPanel } from "@/components/settings/settings-panel"
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "@/lib/settings"

function stored() {
  return JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null")
}

function openPanel(props: Partial<React.ComponentProps<typeof SettingsPanel>> = {}) {
  const onOpenGroup = vi.fn()
  render(<SettingsPanel currentChannelIds={["UCabc", "tw:1"]} onOpenGroup={onOpenGroup} {...props} />)
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
  return { onOpenGroup, dialog: screen.getByRole("dialog", { name: "Settings" }) }
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Other tabs' writes arrive this way; it also resets the store between tests.
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }))
    })
  })

  it("opens from the settings icon and shows the defaults", () => {
    const { dialog } = openPanel()

    expect(within(dialog).getByRole("switch", { name: "Mute others in fullscreen" })).toBeChecked()
    expect(within(dialog).getByRole("switch", { name: "Audio follows focus" })).not.toBeChecked()
    const quality = within(dialog).getByRole("radiogroup", { name: "Default stream quality" })
    const layout = within(dialog).getByRole("radiogroup", { name: "Default grid layout" })
    expect(within(quality).getByRole("radio", { name: "Auto" })).toBeChecked()
    expect(within(layout).getByRole("radio", { name: "Auto" })).toBeChecked()
  })

  it("persists toggles and choices under the versioned key", () => {
    const { dialog } = openPanel()

    fireEvent.click(within(dialog).getByRole("switch", { name: "Audio follows focus" }))
    fireEvent.click(within(dialog).getByRole("switch", { name: "Remove streams that go offline" }))
    fireEvent.click(within(dialog).getByRole("radio", { name: "Low" }))
    fireEvent.click(within(dialog).getByRole("radio", { name: "Big + small" }))

    expect(stored()).toMatchObject({
      version: 1,
      audioFollowsFocus: true,
      autoRemoveOffline: true,
      defaultQuality: "low",
      gridLayout: "featured",
    })
  })

  it("recovers from corrupt storage", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{oops")
    const { dialog } = openPanel()

    expect(within(dialog).getByRole("switch", { name: "Mute others in fullscreen" })).toBeChecked()
    fireEvent.click(within(dialog).getByRole("switch", { name: "Remember my streams" }))
    expect(stored().rememberLastStreams).toBe(true)
  })

  it("creates, opens, renames and deletes saved groups", () => {
    const { dialog, onOpenGroup } = openPanel()

    fireEvent.change(within(dialog).getByLabelText("Group name"), { target: { value: "Main wall" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(stored().savedGroups).toEqual([
      { id: expect.any(String), name: "Main wall", channelIds: ["UCabc", "tw:1"] },
    ])

    fireEvent.click(within(dialog).getByRole("button", { name: "Rename Main wall" }))
    fireEvent.change(within(dialog).getByLabelText("New name for Main wall"), {
      target: { value: "Weekend" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save name" }))
    expect(stored().savedGroups[0].name).toBe("Weekend")

    fireEvent.click(within(dialog).getByRole("button", { name: "Open Weekend" }))
    expect(onOpenGroup).toHaveBeenCalledWith(["UCabc", "tw:1"])
    // Opening a group closes the panel.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete Weekend" }))
    expect(stored().savedGroups).toEqual([])
  })

  it("can't save a group without streams", () => {
    const { dialog } = openPanel({ currentChannelIds: [] })

    expect(within(dialog).getByLabelText("Group name")).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("resets everything after a confirm", () => {
    const { dialog } = openPanel()
    fireEvent.click(within(dialog).getByRole("switch", { name: "Audio follows focus" }))

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }))
    expect(stored().audioFollowsFocus).toBe(true)
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reset" }))

    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
    expect(within(dialog).getByRole("switch", { name: "Audio follows focus" })).toHaveAttribute(
      "aria-checked",
      String(DEFAULT_SETTINGS.audioFollowsFocus)
    )
  })
})
