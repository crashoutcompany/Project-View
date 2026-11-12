import { describe, expect, it } from "vitest"

import { MAX_SELECTED_CHANNELS } from "@/lib/cache-keys"

import {
  addGroup,
  DEFAULT_SETTINGS,
  deleteGroup,
  MAX_GROUP_NAME_LENGTH,
  MAX_SAVED_GROUPS,
  migrateSettings,
  parseStoredSettings,
  renameGroup,
  SETTINGS_STORAGE_KEY,
} from "@/lib/settings"

describe("settings store", () => {
  it("uses a versioned storage key", () => {
    expect(SETTINGS_STORAGE_KEY).toBe("view:settings:v1")
  })

  it("falls back to defaults when nothing is stored or the JSON is corrupt", () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseStoredSettings("")).toEqual(DEFAULT_SETTINGS)
    expect(parseStoredSettings("{not json")).toEqual(DEFAULT_SETTINGS)
    expect(parseStoredSettings("42")).toEqual(DEFAULT_SETTINGS)
    expect(parseStoredSettings("[]")).toEqual(DEFAULT_SETTINGS)
    expect(parseStoredSettings("null")).toEqual(DEFAULT_SETTINGS)
  })

  it("round-trips valid settings", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      audioFollowsFocus: true,
      autoRemoveOffline: true,
      muteOthersOnFullscreen: false,
      saveResourcesOnFullscreen: false,
      pauseOthersOnFullscreen: true,
      fullscreenSwitcher: false,
      defaultQuality: "low" as const,
      gridLayout: "featured" as const,
      streamFit: "fill" as const,
      rememberLastStreams: true,
      lastChannelIds: ["UCabcxxxxxxxxxxxxxxxxxxx", "tw:123"],
      savedGroups: [{ id: "g1", name: "Speedruns", channelIds: ["tw:42"] }],
    }

    expect(parseStoredSettings(JSON.stringify(settings))).toEqual(settings)
  })

  it("replaces only the invalid fields with defaults", () => {
    const migrated = migrateSettings({
      version: 1,
      audioFollowsFocus: "yes",
      autoRemoveOffline: true,
      defaultQuality: "8k",
      gridLayout: "two-columns",
      saveResourcesOnFullscreen: "no",
    })

    expect(migrated.audioFollowsFocus).toBe(DEFAULT_SETTINGS.audioFollowsFocus)
    expect(migrated.autoRemoveOffline).toBe(true)
    expect(migrated.defaultQuality).toBe("auto")
    expect(migrated.gridLayout).toBe("two-columns")
    expect(migrated.streamFit).toBe("fit")
    expect(migrated.saveResourcesOnFullscreen).toBe(true)
    expect(migrated.pauseOthersOnFullscreen).toBe(false)
    // Stored before the switcher setting existed.
    expect(migrated.fullscreenSwitcher).toBe(true)
  })

  it("migrates an unversioned (pre-v1) value and ignores unknown versions", () => {
    expect(migrateSettings({ gridLayout: "one-column" }).gridLayout).toBe("one-column")
    expect(migrateSettings({ version: 99, gridLayout: "one-column" })).toEqual(DEFAULT_SETTINGS)
  })

  it("drops invalid and duplicate channel ids and caps the list", () => {
    const migrated = migrateSettings({
      lastChannelIds: ["UCabcxxxxxxxxxxxxxxxxxxx", "UCabcxxxxxxxxxxxxxxxxxxx", "tw:abc", "bad id!", 7, "tw:9"],
    })
    expect(migrated.lastChannelIds).toEqual(["UCabcxxxxxxxxxxxxxxxxxxx", "tw:9"])

    const many = Array.from({ length: 80 }, (_, index) => `UC${String(index).padStart(22, "0")}`)
    expect(migrateSettings({ lastChannelIds: many }).lastChannelIds).toHaveLength(MAX_SELECTED_CHANNELS)
  })

  it("drops broken saved groups and trims names", () => {
    const migrated = migrateSettings({
      savedGroups: [
        { id: "a", name: "  Main   wall ", channelIds: ["UCabcxxxxxxxxxxxxxxxxxxx"] },
        { id: "a", name: "Duplicate id", channelIds: ["UCabcxxxxxxxxxxxxxxxxxxx"] },
        { id: "b", name: "", channelIds: ["UCabcxxxxxxxxxxxxxxxxxxx"] },
        { id: "c", name: "No channels", channelIds: ["bad id!"] },
        { name: "No id", channelIds: ["UCabcxxxxxxxxxxxxxxxxxxx"] },
        "nope",
      ],
    })

    expect(migrated.savedGroups).toEqual([{ id: "a", name: "Main wall", channelIds: ["UCabcxxxxxxxxxxxxxxxxxxx"] }])
  })
})

describe("saved groups", () => {
  it("creates, renames and deletes groups", () => {
    let settings = addGroup(DEFAULT_SETTINGS, " Friday ", ["UCabcxxxxxxxxxxxxxxxxxxx", "tw:1"], "g1")
    expect(settings.savedGroups).toEqual([{ id: "g1", name: "Friday", channelIds: ["UCabcxxxxxxxxxxxxxxxxxxx", "tw:1"] }])

    settings = renameGroup(settings, "g1", "Saturday")
    expect(settings.savedGroups[0].name).toBe("Saturday")

    // A blank rename keeps the old name.
    expect(renameGroup(settings, "g1", "   ")).toBe(settings)

    settings = deleteGroup(settings, "g1")
    expect(settings.savedGroups).toEqual([])
  })

  it("refuses empty names, empty selections and more than the cap", () => {
    expect(addGroup(DEFAULT_SETTINGS, "  ", ["UCabcxxxxxxxxxxxxxxxxxxx"])).toBe(DEFAULT_SETTINGS)
    expect(addGroup(DEFAULT_SETTINGS, "Name", [])).toBe(DEFAULT_SETTINGS)

    let settings = DEFAULT_SETTINGS
    for (let index = 0; index < MAX_SAVED_GROUPS + 3; index += 1) {
      settings = addGroup(settings, `Group ${index}`, ["UCabcxxxxxxxxxxxxxxxxxxx"], `g${index}`)
    }
    expect(settings.savedGroups).toHaveLength(MAX_SAVED_GROUPS)
  })

  it("caps group names", () => {
    const settings = addGroup(DEFAULT_SETTINGS, "x".repeat(100), ["UCabcxxxxxxxxxxxxxxxxxxx"], "g1")
    expect(settings.savedGroups[0].name).toHaveLength(MAX_GROUP_NAME_LENGTH)
  })
})
