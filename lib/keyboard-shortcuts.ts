// Keyboard shortcuts for the stream wall. Keys pressed inside a cross-origin
// player or chat iframe never reach the page, so these only work while the
// page itself has focus.

export type Shortcut =
  | { type: "focus"; index: number }
  | { type: "step"; delta: 1 | -1 }
  | { type: "mute" }
  | { type: "fullscreen" }
  | { type: "help" }

// Put on any area whose keys belong to it, such as the chat panel.
export const SHORTCUTS_IGNORE_ATTRIBUTE = "data-shortcuts-ignore"

const TYPING_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="textbox"]',
  "[cmdk-root]",
  `[${SHORTCUTS_IGNORE_ATTRIBUTE}]`,
].join(",")

// Widgets that move their own selection with the arrow keys.
const ARROW_WIDGET_SELECTOR = [
  '[role="dialog"]',
  '[role="radiogroup"]',
  '[role="tablist"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="slider"]',
].join(",")

/** True when keys typed at this element are text or belong to a widget. */
export function isTypingTarget(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true
  }

  return target.closest(TYPING_SELECTOR) !== null
}

type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing" | "defaultPrevented" | "target"
>

/** The shortcut a keydown asks for, or null when it should be left alone. */
export function shortcutForKey(event: ShortcutKeyEvent): Shortcut | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    isTypingTarget(event.target)
  ) {
    return null
  }

  if (event.key === "?") {
    return { type: "help" }
  }

  if (/^[1-9]$/.test(event.key)) {
    return { type: "focus", index: Number(event.key) - 1 }
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (event.target instanceof Element && event.target.closest(ARROW_WIDGET_SELECTOR)) {
      return null
    }
    return { type: "step", delta: event.key === "ArrowRight" ? 1 : -1 }
  }

  switch (event.key.toLowerCase()) {
    case "m":
      return { type: "mute" }
    case "f":
      return { type: "fullscreen" }
    default:
      return null
  }
}

export const SHORTCUT_LIST: { keys: string[]; label: string }[] = [
  { keys: ["1", "–", "9"], label: "Focus stream 1 to 9, or switch to it in fullscreen" },
  { keys: ["←", "→"], label: "Previous or next stream" },
  { keys: ["M"], label: "Mute or unmute the focused stream" },
  { keys: ["F"], label: "Fullscreen the focused stream, or go back" },
  { keys: ["?"], label: "Show or hide this help" },
  { keys: ["Esc"], label: "Close this help or exit fullscreen" },
]
