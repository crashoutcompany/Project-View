import { MAX_SELECTED_CHANNELS, parseChannelId } from "@/lib/cache-keys"

// Viewer preferences, stored per device in localStorage. Everything read back
// is validated field by field, so a corrupt or hand-edited value only loses
// the bad field, never the whole page.

export const SETTINGS_STORAGE_KEY = "view:settings:v1"
export const SETTINGS_VERSION = 1

export const STREAM_QUALITIES = ["auto", "high", "medium", "low"] as const
export type StreamQuality = (typeof STREAM_QUALITIES)[number]

export const GRID_LAYOUTS = ["auto", "one-column", "two-columns", "featured"] as const
export type GridLayout = (typeof GRID_LAYOUTS)[number]

export const MAX_SAVED_GROUPS = 20
export const MAX_GROUP_NAME_LENGTH = 40

export type SavedGroup = {
  id: string
  name: string
  channelIds: string[]
}

export type Settings = {
  version: typeof SETTINGS_VERSION
  muteOthersOnFullscreen: boolean
  autoRemoveOffline: boolean
  audioFollowsFocus: boolean
  defaultQuality: StreamQuality
  gridLayout: GridLayout
  rememberLastStreams: boolean
  lastChannelIds: string[]
  savedGroups: SavedGroup[]
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  version: SETTINGS_VERSION,
  muteOthersOnFullscreen: true,
  autoRemoveOffline: false,
  audioFollowsFocus: false,
  defaultQuality: "auto",
  gridLayout: "auto",
  rememberLastStreams: false,
  lastChannelIds: [],
  savedGroups: [],
}) as Settings

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function sanitizeChannelIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const ids = value.filter(
    (id): id is string => typeof id === "string" && parseChannelId(id) !== null
  )

  return Array.from(new Set(ids)).slice(0, MAX_SELECTED_CHANNELS)
}

export function normalizeGroupName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, MAX_GROUP_NAME_LENGTH)
}

function readGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const groups: SavedGroup[] = []

  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
      continue
    }

    const name = typeof entry.name === "string" ? normalizeGroupName(entry.name) : ""
    const channelIds = sanitizeChannelIds(entry.channelIds)

    if (!name || channelIds.length === 0 || seen.has(entry.id)) {
      continue
    }

    seen.add(entry.id)
    groups.push({ id: entry.id, name, channelIds })
  }

  return groups.slice(0, MAX_SAVED_GROUPS)
}

/**
 * Turns whatever is stored into valid settings. Unknown versions, non-objects
 * and bad fields fall back to the defaults. Future versions add their
 * migration step here, keyed on `version`.
 */
export function migrateSettings(raw: unknown): Settings {
  if (!isRecord(raw)) {
    return DEFAULT_SETTINGS
  }

  // A newer build may have written a shape we don't understand; keep safe
  // defaults rather than guessing.
  if (raw.version !== undefined && raw.version !== SETTINGS_VERSION) {
    return DEFAULT_SETTINGS
  }

  return {
    version: SETTINGS_VERSION,
    muteOthersOnFullscreen: readBoolean(
      raw.muteOthersOnFullscreen,
      DEFAULT_SETTINGS.muteOthersOnFullscreen
    ),
    autoRemoveOffline: readBoolean(raw.autoRemoveOffline, DEFAULT_SETTINGS.autoRemoveOffline),
    audioFollowsFocus: readBoolean(raw.audioFollowsFocus, DEFAULT_SETTINGS.audioFollowsFocus),
    defaultQuality: readEnum(raw.defaultQuality, STREAM_QUALITIES, DEFAULT_SETTINGS.defaultQuality),
    gridLayout: readEnum(raw.gridLayout, GRID_LAYOUTS, DEFAULT_SETTINGS.gridLayout),
    rememberLastStreams: readBoolean(
      raw.rememberLastStreams,
      DEFAULT_SETTINGS.rememberLastStreams
    ),
    lastChannelIds: sanitizeChannelIds(raw.lastChannelIds),
    savedGroups: readGroups(raw.savedGroups),
  }
}

export function parseStoredSettings(stored: string | null): Settings {
  if (!stored) {
    return DEFAULT_SETTINGS
  }

  try {
    return migrateSettings(JSON.parse(stored))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function createGroupId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function addGroup(settings: Settings, name: string, channelIds: string[], id = createGroupId()) {
  const cleanName = normalizeGroupName(name)
  const cleanIds = sanitizeChannelIds(channelIds)

  if (!cleanName || cleanIds.length === 0 || settings.savedGroups.length >= MAX_SAVED_GROUPS) {
    return settings
  }

  return {
    ...settings,
    savedGroups: [...settings.savedGroups, { id, name: cleanName, channelIds: cleanIds }],
  }
}

export function renameGroup(settings: Settings, id: string, name: string) {
  const cleanName = normalizeGroupName(name)

  if (!cleanName) {
    return settings
  }

  return {
    ...settings,
    savedGroups: settings.savedGroups.map((group) =>
      group.id === id ? { ...group, name: cleanName } : group
    ),
  }
}

export function deleteGroup(settings: Settings, id: string) {
  return {
    ...settings,
    savedGroups: settings.savedGroups.filter((group) => group.id !== id),
  }
}
