"use client"

import { ChevronsUpDown, LoaderCircle, SearchIcon, TvMinimalPlay } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
  disabled?: boolean
  onQueryChange: (value: string) => void
  onAddChannel: (channel: ChannelResult) => void
}

export function ChannelCombobox({
  query,
  results,
  loading,
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
            placeholder="Type a YouTube channel name..."
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
                  className="items-start gap-3 px-3 py-3"
                >
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center border border-border bg-muted/40">
                    {channel.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={channel.thumbnailUrl}
                        alt={channel.title}
                        className="size-full object-cover"
                      />
                    ) : (
                      <TvMinimalPlay className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{channel.title}</span>
                      <Badge
                        variant={channel.live.status === "live" ? "default" : "secondary"}
                        className="shrink-0 uppercase"
                      >
                        {channel.live.status}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {channel.description || "No channel description available."}
                    </p>
                  </div>
                  <SearchIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
