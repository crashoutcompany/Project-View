"use client"

import * as React from "react"
import { Check, FolderOpen, Pencil, RotateCcw, Settings2, Trash2, X } from "lucide-react"
import { Dialog, RadioGroup, Switch } from "radix-ui"

import { Button } from "@/components/ui/button"
import {
  addGroup,
  deleteGroup,
  GridLayout,
  MAX_GROUP_NAME_LENGTH,
  MAX_SAVED_GROUPS,
  renameGroup,
  SavedGroup,
  Settings,
  StreamQuality,
} from "@/lib/settings"
import { resetSettings, updateSettings, useSettings } from "@/lib/use-settings"
import { cn } from "@/lib/utils"

type SettingsPanelProps = {
  // The streams on the wall now, for "Save as group".
  currentChannelIds: string[]
  onOpenGroup: (channelIds: string[]) => void
  // Groups need the live lookup, which is off when the project is unconfigured.
  groupsEnabled?: boolean
}

const QUALITY_OPTIONS: { value: StreamQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

const LAYOUT_OPTIONS: { value: GridLayout; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "one-column", label: "1 column" },
  { value: "two-columns", label: "2 columns" },
  { value: "featured", label: "Big + small" },
]

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  updateSettings((current) => ({ ...current, [key]: value }))
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border/50 px-4 py-4 last:border-b-0">
      <h3 className="text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ToggleRow({
  settingKey,
  label,
  description,
}: {
  settingKey: BooleanKey
  label: string
  description: string
}) {
  const settings = useSettings()
  const id = `setting-${settingKey}`

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </label>
        <p id={`${id}-description`} className="text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch.Root
        id={id}
        checked={settings[settingKey]}
        onCheckedChange={(checked) => setSetting(settingKey, checked)}
        aria-describedby={`${id}-description`}
        className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border border-transparent bg-input transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=checked]:bg-primary dark:bg-input/80 dark:data-[state=checked]:bg-primary"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[1.125rem] dark:bg-foreground" />
      </Switch.Root>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4"
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className="h-8 bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground pointer-coarse:h-11"
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

function GroupRow({
  group,
  onOpen,
  disabled,
}: {
  group: SavedGroup
  onOpen: () => void
  disabled: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(group.name)

  function commitRename() {
    updateSettings((current) => renameGroup(current, group.id, draft))
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1">
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            commitRename()
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={MAX_GROUP_NAME_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                setDraft(group.name)
                setEditing(false)
              }
            }}
            aria-label={`New name for ${group.name}`}
            className="h-8 min-w-0 flex-1 border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60 pointer-coarse:h-11"
          />
          <Button
            type="submit"
            size="icon-sm"
            variant="ghost"
            aria-label="Save name"
            disabled={!draft.trim()}
            className="pointer-coarse:size-11"
          >
            <Check />
          </Button>
        </form>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Cancel rename"
          onClick={() => {
            setDraft(group.name)
            setEditing(false)
          }}
          className="pointer-coarse:size-11"
        >
          <X />
        </Button>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-label={`Open ${group.name}`}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 border border-border px-2 text-left text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 pointer-coarse:h-11"
      >
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{group.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {group.channelIds.length} {group.channelIds.length === 1 ? "stream" : "streams"}
        </span>
      </button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Rename ${group.name}`}
        onClick={() => {
          setDraft(group.name)
          setEditing(true)
        }}
        className="pointer-coarse:size-11"
      >
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${group.name}`}
        onClick={() => updateSettings((current) => deleteGroup(current, group.id))}
        className="text-muted-foreground hover:text-destructive pointer-coarse:size-11"
      >
        <Trash2 />
      </Button>
    </li>
  )
}

function SavedGroups({
  currentChannelIds,
  onOpenGroup,
  groupsEnabled,
}: Required<SettingsPanelProps>) {
  const settings = useSettings()
  const [name, setName] = React.useState("")
  const full = settings.savedGroups.length >= MAX_SAVED_GROUPS
  const canSave = Boolean(name.trim()) && currentChannelIds.length > 0 && !full

  return (
    <div className="space-y-3">
      <form
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          if (!canSave) {
            return
          }
          updateSettings((current) => addGroup(current, name, currentChannelIds))
          setName("")
        }}
      >
        <input
          value={name}
          maxLength={MAX_GROUP_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            currentChannelIds.length > 0 ? "Name this set of streams" : "Add streams to save a group"
          }
          aria-label="Group name"
          disabled={currentChannelIds.length === 0 || full}
          className="h-8 min-w-0 flex-1 border border-input bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 pointer-coarse:h-11"
        />
        <Button type="submit" size="sm" disabled={!canSave} className="h-8 pointer-coarse:h-11">
          Save
        </Button>
      </form>
      {full ? (
        <p className="text-[11px] text-muted-foreground">
          {MAX_SAVED_GROUPS} groups is the limit. Delete one to save another.
        </p>
      ) : null}
      {settings.savedGroups.length > 0 ? (
        <ul className="space-y-1" aria-label="Saved groups">
          {settings.savedGroups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              disabled={!groupsEnabled}
              onOpen={() => onOpenGroup(group.channelIds)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No saved groups yet. Saved groups open in one tap.
        </p>
      )}
    </div>
  )
}

function ResetButton() {
  const [confirming, setConfirming] = React.useState(false)

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] text-muted-foreground">
        {confirming
          ? "This also deletes saved groups and the remembered streams."
          : "Settings are saved in this browser only."}
      </p>
      <Button
        size="sm"
        variant={confirming ? "destructive" : "outline"}
        onClick={() => {
          if (confirming) {
            resetSettings()
            setConfirming(false)
          } else {
            setConfirming(true)
          }
        }}
        onBlur={() => setConfirming(false)}
        className="shrink-0 pointer-coarse:h-11"
      >
        <RotateCcw />
        {confirming ? "Confirm reset" : "Reset"}
      </Button>
    </div>
  )
}

export function SettingsPanel({
  currentChannelIds,
  onOpenGroup,
  groupsEnabled = true,
}: SettingsPanelProps) {
  const [open, setOpen] = React.useState(false)
  const settings = useSettings()

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          className="pointer-coarse:size-11"
        >
          <Settings2 />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:bg-black/20" />
        {/* A bottom drawer on phones, a right-hand panel from md up. */}
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col border-border bg-background text-foreground shadow-xl outline-none",
            "inset-x-0 bottom-0 max-h-[88svh] border-t pb-[env(safe-area-inset-bottom)]",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            "md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:max-h-none md:w-96 md:border-t-0 md:border-l md:pb-0",
            "md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right"
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 bg-muted-foreground/30 md:hidden" aria-hidden />
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 pr-2 pl-4">
            <Dialog.Title className="text-sm font-medium">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close settings"
                className="pointer-coarse:size-11"
              >
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Audio, playback, layout and saved stream groups. Saved in this browser.
          </Dialog.Description>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Section title="Audio">
              <ToggleRow
                settingKey="audioFollowsFocus"
                label="Audio follows focus"
                description="Only the stream you tap or click plays sound. The rest are muted."
              />
              <ToggleRow
                settingKey="muteOthersOnFullscreen"
                label="Mute others in fullscreen"
                description="A fullscreen stream plays alone. Audio comes back when you exit."
              />
            </Section>

            <Section title="Full screen">
              <ToggleRow
                settingKey="saveResourcesOnFullscreen"
                label="Save resources while full screen"
                description="Other Twitch streams drop to the lowest quality and YouTube streams pause. Restored when you exit."
              />
              <ToggleRow
                settingKey="pauseOthersOnFullscreen"
                label="Pause others in full screen"
                description="Every other stream pauses instead, with no quality change. Only streams paused here resume."
              />
            </Section>

            <Section title="Streams">
              <ToggleRow
                settingKey="autoRemoveOffline"
                label="Remove streams that go offline"
                description="After 2 missed live checks in a row, with an undo."
              />
              <ToggleRow
                settingKey="rememberLastStreams"
                label="Remember my streams"
                description="Reopen the last streams on your next visit."
              />
            </Section>

            <Section title="Playback quality">
              <Segmented
                label="Default stream quality"
                value={settings.defaultQuality}
                options={QUALITY_OPTIONS}
                onChange={(value) => setSetting("defaultQuality", value)}
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                A request for this device. Players can still pick their own quality.
              </p>
            </Section>

            <Section title="Grid layout">
              <Segmented
                label="Default grid layout"
                value={settings.gridLayout}
                options={LAYOUT_OPTIONS}
                onChange={(value) => setSetting("gridLayout", value)}
              />
            </Section>

            <Section title="Saved groups">
              <SavedGroups
                currentChannelIds={currentChannelIds}
                groupsEnabled={groupsEnabled}
                onOpenGroup={(channelIds) => {
                  onOpenGroup(channelIds)
                  setOpen(false)
                }}
              />
            </Section>

            <Section title="Reset">
              <ResetButton />
            </Section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
