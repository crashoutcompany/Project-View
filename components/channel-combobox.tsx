"use client"

import { ChevronsUpDown, LoaderCircle, Plus } from "lucide-react"

import { ChannelAvatar } from "@/components/channel-avatar"
import { LiveBadge } from "@/components/live-badge"
import { PlatformBadge } from "@/components/platform-badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChannelResult } from "@/lib/types"

type ChannelComboboxProps = {
  query: string
  results: ChannelResult[]
  loading: boolean
  now: number
  disabled?: boolean
  onQueryChange: (value: string) => void
  onAddChannel: (channel: ChannelResult) => void
}

export function ChannelCombobox({
  query,
  results,
  loading,
  now,
  disabled = false,
  onQueryChange,
  onAddChannel,
}: ChannelComboboxProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-11 w-full justify-between px-4 text-left text-sm"
          disabled={disabled}
        >
          <span className="truncate text-foreground/80">
            {query ? `Search: ${query}` : "Search channels, handles, or live creators"}
          </span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={onQueryChange}
            placeholder="Type a YouTube or Twitch channel name..."
            disabled={disabled}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Looking up channels and checking who is live...
              </div>
            ) : null}
            {!loading ? (
              <CommandEmpty>
                <div className="space-y-1">
                  <p>No channels found.</p>
                  <p className="text-muted-foreground">
                    Try a different creator name or handle.
                  </p>
                </div>
              </CommandEmpty>
            ) : null}
            <CommandGroup heading={query ? "Matches" : "Cached suggestions"}>
              {results.map((channel) => (
                <CommandItem
                  key={channel.channelId}
                  value={`${channel.title} ${channel.channelId}`}
                  onSelect={() => onAddChannel(channel)}
                  className="min-h-14 items-center gap-3 px-3 py-2 transition-[background-color,scale] duration-[120ms] ease-out active:scale-[0.97]"
                >
                  <ChannelAvatar title={channel.title} thumbnailUrl={channel.thumbnailUrl} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={channel.platform} />
                      <span className="truncate text-sm font-medium">{channel.title}</span>
                      <LiveBadge live={channel.live} now={now} />
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {channel.description || "No channel description available."}
                    </p>
                  </div>
                  <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
