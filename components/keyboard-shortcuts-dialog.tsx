"use client"

import type * as React from "react"
import { X } from "lucide-react"
import { Dialog } from "radix-ui"

import { Button } from "@/components/ui/button"
import { SHORTCUT_LIST } from "@/lib/keyboard-shortcuts"

type KeyboardShortcutsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-border bg-muted px-1 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border border-border bg-background text-foreground shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 pr-2 pl-4">
            <Dialog.Title className="text-sm font-medium">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close shortcuts">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <ul className="space-y-2 px-4 py-4">
            {SHORTCUT_LIST.map((shortcut) => (
              <li key={shortcut.label} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{shortcut.label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {shortcut.keys.map((key) =>
                    key === "–" ? (
                      <span key={key} aria-label="to">
                        –
                      </span>
                    ) : (
                      <Kbd key={key}>{key}</Kbd>
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Dialog.Description className="border-t border-border/50 px-4 py-3 text-[11px] leading-snug text-muted-foreground">
            Shortcuts don&apos;t work while you type in search or chat. Players and chats are
            separate sites, so after you click into one it keeps your keys: click outside it,
            for example on the top bar, to use shortcuts again.
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
