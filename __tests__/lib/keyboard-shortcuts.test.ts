/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"

import { isTypingTarget, shortcutForKey } from "@/lib/keyboard-shortcuts"

function keyEvent(key: string, overrides: Partial<Parameters<typeof shortcutForKey>[0]> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: document.body,
    ...overrides,
  }
}

function element(html: string, selector: string) {
  document.body.innerHTML = html
  return document.querySelector(selector)!
}

describe("shortcutForKey", () => {
  it("maps 1 to 9 to a zero-based stream index", () => {
    expect(shortcutForKey(keyEvent("1"))).toEqual({ type: "focus", index: 0 })
    expect(shortcutForKey(keyEvent("9"))).toEqual({ type: "focus", index: 8 })
    expect(shortcutForKey(keyEvent("0"))).toBeNull()
  })

  it("maps M, F and ? in either case", () => {
    expect(shortcutForKey(keyEvent("m"))).toEqual({ type: "mute" })
    expect(shortcutForKey(keyEvent("M"))).toEqual({ type: "mute" })
    expect(shortcutForKey(keyEvent("f"))).toEqual({ type: "fullscreen" })
    expect(shortcutForKey(keyEvent("F"))).toEqual({ type: "fullscreen" })
    expect(shortcutForKey(keyEvent("?"))).toEqual({ type: "help" })
    expect(shortcutForKey(keyEvent("x"))).toBeNull()
    expect(shortcutForKey(keyEvent("Escape"))).toBeNull()
  })

  it("maps the left and right arrows to a step back or forward", () => {
    expect(shortcutForKey(keyEvent("ArrowRight"))).toEqual({ type: "step", delta: 1 })
    expect(shortcutForKey(keyEvent("ArrowLeft"))).toEqual({ type: "step", delta: -1 })
    expect(shortcutForKey(keyEvent("ArrowUp"))).toBeNull()
  })

  it("leaves the arrows to widgets that use them, and to dialogs", () => {
    const radio = element('<div role="radiogroup"><button role="radio"></button></div>', "button")
    expect(shortcutForKey(keyEvent("ArrowRight", { target: radio }))).toBeNull()

    const dialogButton = element('<div role="dialog"><button></button></div>', "button")
    expect(shortcutForKey(keyEvent("ArrowLeft", { target: dialogButton }))).toBeNull()
  })

  it.each(["ctrlKey", "metaKey", "altKey"] as const)("ignores keys with %s held", (modifier) => {
    expect(shortcutForKey(keyEvent("f", { [modifier]: true }))).toBeNull()
    expect(shortcutForKey(keyEvent("1", { [modifier]: true }))).toBeNull()
  })

  it("ignores held-down repeats, IME composition and handled keys", () => {
    expect(shortcutForKey(keyEvent("f", { repeat: true }))).toBeNull()
    expect(shortcutForKey(keyEvent("m", { isComposing: true }))).toBeNull()
    expect(shortcutForKey(keyEvent("?", { defaultPrevented: true }))).toBeNull()
  })

  it("ignores keys typed into a text field", () => {
    const input = element("<input />", "input")
    expect(shortcutForKey(keyEvent("m", { target: input }))).toBeNull()
  })
})

describe("isTypingTarget", () => {
  it.each([
    ["an input", "<input id='t' />"],
    ["a textarea", "<textarea id='t'></textarea>"],
    ["a select", "<select id='t'></select>"],
    ["a contenteditable child", "<div contenteditable='true'><span id='t'></span></div>"],
    ["a combobox", "<button id='t' role='combobox'></button>"],
    ["the channel search", "<div cmdk-root><button id='t'></button></div>"],
    ["the chat panel", "<aside data-shortcuts-ignore><button id='t'></button></aside>"],
  ])("is true inside %s", (_name, html) => {
    expect(isTypingTarget(element(html, "#t"))).toBe(true)
  })

  it("is false for buttons, the page and non-elements", () => {
    expect(isTypingTarget(element("<button id='t'></button>", "#t"))).toBe(false)
    expect(isTypingTarget(element("<div contenteditable='false'><span id='t'></span></div>", "#t"))).toBe(
      false
    )
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
