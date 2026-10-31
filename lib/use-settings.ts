"use client"

import * as React from "react"

import {
  DEFAULT_SETTINGS,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
  Settings,
} from "@/lib/settings"

// A tiny external store over localStorage, so every component that reads
// settings sees the same value without a provider in the layout. Other tabs
// stay in sync through the `storage` event.

const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedSettings: Settings = DEFAULT_SETTINGS
// Set when a write fails, so this visit keeps the in-memory value instead of
// re-reading the stale stored one.
let memoryOnly = false

function readRaw() {
  try {
    return window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  } catch {
    // Storage can throw in private modes or when blocked by policy.
    return null
  }
}

function getSnapshot() {
  if (memoryOnly) {
    return cachedSettings
  }

  const raw = readRaw()

  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSettings = parseStoredSettings(raw)
  }

  return cachedSettings
}

function getServerSnapshot() {
  return DEFAULT_SETTINGS
}

function emit() {
  listeners.forEach((listener) => listener())
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === SETTINGS_STORAGE_KEY) {
    emit()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage)
    }
  }
}

/** The current stored value, read outside of render (in effects and events). */
export function readSettings() {
  return getSnapshot()
}

export function writeSettings(next: Settings) {
  cachedRaw = JSON.stringify(next)
  cachedSettings = next

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, cachedRaw)
  } catch {
    // Quota or blocked storage: keep the in-memory value for this visit.
    memoryOnly = true
  }

  emit()
}

export function updateSettings(update: (current: Settings) => Settings) {
  writeSettings(update(getSnapshot()))
}

export function resetSettings() {
  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
  } catch {
    // Ignore; the in-memory reset below still applies.
  }

  cachedRaw = null
  cachedSettings = DEFAULT_SETTINGS
  emit()
}

export function useSettings() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
