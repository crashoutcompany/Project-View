"use client"

import * as React from "react"
import { CircleAlert, RadioTower, RefreshCcw } from "lucide-react"

import {
  refreshSelectedChannelsAction,
  searchChannelsAction,
} from "@/app/actions"
import { ChannelCombobox } from "@/components/channel-combobox"
import { ChannelResults } from "@/components/channel-results"
import { LiveGrid } from "@/components/live-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChannelResult } from "@/lib/types"

type MultiwatchAppProps = {
  initialQuery: string
  initialResults: ChannelResult[]
  initialSeedResults: ChannelResult[]
  initialSelectedChannels: ChannelResult[]
  initialUpdatedAt: string
  configured: boolean
}

function dedupeChannels(channels: ChannelResult[]) {
  return Array.from(new Map(channels.map((channel) => [channel.channelId, channel])).values())
}

function mergeChannel(target: ChannelResult[], incoming: ChannelResult) {
  return target.map((channel) =>
    channel.channelId === incoming.channelId ? incoming : channel
  )
}

function buildUrl(nextQuery: string, nextSelectedChannels: ChannelResult[]) {
  const params = new URLSearchParams(window.location.search)
  const trimmedQuery = nextQuery.trim()
  const selectedIds = nextSelectedChannels.map((channel) => channel.channelId)

  if (trimmedQuery) {
    params.set("q", trimmedQuery)
  } else {
    params.delete("q")
  }

  if (selectedIds.length > 0) {
    params.set("channels", selectedIds.join(","))
  } else {
    params.delete("channels")
  }

  const queryString = params.toString()
  return queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname
}

export function MultiwatchApp({
  initialQuery,
  initialResults,
  initialSeedResults,
  initialSelectedChannels,
  initialUpdatedAt,
  configured,
}: MultiwatchAppProps) {
  const [query, setQuery] = React.useState(initialQuery)
  const [seedResults, setSeedResults] = React.useState(initialSeedResults)
  const [results, setResults] = React.useState(
    initialQuery ? initialResults : initialSeedResults
  )
  const [selectedChannels, setSelectedChannels] = React.useState(initialSelectedChannels)
  const [activeAudioChannelId, setActiveAudioChannelId] = React.useState<string | null>(
    initialSelectedChannels.find((channel) => channel.live.status === "live")?.channelId ??
      initialSelectedChannels[0]?.channelId ??
      null
  )
  const [lastUpdated, setLastUpdated] = React.useState(initialUpdatedAt)
  const [isPending, startTransition] = React.useTransition()
  const searchTimeoutRef = React.useRef<number | null>(null)

  function replaceUrl(nextQuery: string, nextSelectedChannels: ChannelResult[]) {
    window.history.replaceState(null, "", buildUrl(nextQuery, nextSelectedChannels))
  }

  function applyRefreshedChannels(refreshed: ChannelResult[]) {
    setSelectedChannels(refreshed)
    setResults((current) =>
      refreshed.reduce((accumulator, channel) => mergeChannel(accumulator, channel), current)
    )
    setSeedResults((current) =>
      refreshed.reduce((accumulator, channel) => mergeChannel(accumulator, channel), current)
    )
    setLastUpdated(new Date().toISOString())
  }

  function runSearch(nextQuery: string) {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    const trimmedQuery = nextQuery.trim()

    if (!configured || !trimmedQuery) {
      setResults(seedResults)
      return
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const payload = await searchChannelsAction(trimmedQuery)

          setResults(payload.channels)
          setSeedResults((current) =>
            dedupeChannels([...payload.channels, ...current]).slice(0, 8)
          )
          setLastUpdated(new Date().toISOString())
        } catch (error) {
          console.error(error)
        }
      })
    }, 300)
  }

  function handleAddChannel(channel: ChannelResult) {
    let nextSelectedChannels = selectedChannels

    if (!selectedChannels.some((item) => item.channelId === channel.channelId)) {
      nextSelectedChannels = [...selectedChannels, channel]
      setSelectedChannels(nextSelectedChannels)
    }

    if (!activeAudioChannelId) {
      setActiveAudioChannelId(channel.channelId)
    }

    replaceUrl(query, nextSelectedChannels)
  }

  function handleRemoveChannel(channelId: string) {
    const nextSelectedChannels = selectedChannels.filter(
      (channel) => channel.channelId !== channelId
    )
    setSelectedChannels(nextSelectedChannels)

    if (activeAudioChannelId === channelId) {
      setActiveAudioChannelId(nextSelectedChannels[0]?.channelId ?? null)
    }

    replaceUrl(query, nextSelectedChannels)
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery)
    replaceUrl(nextQuery, selectedChannels)
    runSearch(nextQuery)
  }

  function handleMakeActive(channelId: string) {
    setActiveAudioChannelId(channelId)
  }

  function handleManualRefresh() {
    if (!configured || selectedChannels.length === 0) {
      return
    }

    startTransition(async () => {
      try {
        const refreshed = await refreshSelectedChannelsAction(
          selectedChannels.map((channel) => channel.channelId)
        )
        applyRefreshedChannels(refreshed)
      } catch (error) {
        console.error(error)
      }
    })
  }

  const liveCount = selectedChannels.filter((channel) => channel.live.status === "live").length
  const displayedResults = query.trim() ? results : seedResults

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,#88133722,transparent_32%),linear-gradient(180deg,#050505_0%,#111827_52%,#050505_100%)] text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 lg:px-10">
        <section className="grid gap-6 border border-border/70 bg-background/70 p-6 backdrop-blur-sm lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <Badge variant="outline" className="uppercase tracking-[0.2em]">
              YouTube Multiwatch
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl font-serif text-4xl font-semibold tracking-tight text-balance">
                Build a live wall from creator names instead of raw stream URLs.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Search channels, reuse cached suggestions, and pin the streams you want
                in a single command center.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="border border-border/70 bg-card/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Selected
              </div>
              <div className="mt-2 text-3xl font-semibold">{selectedChannels.length}</div>
            </div>
            <div className="border border-border/70 bg-card/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Live now
              </div>
              <div className="mt-2 text-3xl font-semibold text-primary">{liveCount}</div>
            </div>
            <div className="border border-border/70 bg-card/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Cache
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Warmed from Redis seed results and refreshed per live tile.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="space-y-3 border border-border/70 bg-card/75 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Channel finder</div>
                  <p className="text-xs text-muted-foreground">
                    Cached suggestions appear before you type.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={!configured || selectedChannels.length === 0 || isPending}
                >
                  <RefreshCcw className={isPending ? "animate-spin" : ""} />
                  Refresh live state
                </Button>
              </div>
              <ChannelCombobox
                query={query}
                results={displayedResults}
                loading={isPending}
                disabled={!configured}
                onQueryChange={handleQueryChange}
                onAddChannel={handleAddChannel}
              />
              <div className="text-[11px] text-muted-foreground">
                Last updated {new Date(lastUpdated).toLocaleTimeString()}
              </div>
            </div>

            {!configured ? (
              <div className="border border-dashed border-amber-500/50 bg-amber-500/10 p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium text-amber-200">
                  <CircleAlert className="size-4" />
                  Environment variables required
                </div>
                <p className="text-amber-50/80">
                  Add your YouTube API key and Upstash Redis credentials to start
                  searching and caching results.
                </p>
              </div>
            ) : null}

            <ChannelResults
              title="Selected channels"
              description="These channels power the live wall on the right."
              channels={selectedChannels}
              selectedIds={selectedChannels.map((channel) => channel.channelId)}
              emptyMessage="Add one or more channels to start watching."
              onAddChannel={handleAddChannel}
              onRemoveChannel={handleRemoveChannel}
            />

            <ChannelResults
              title={query.trim() ? "Search results" : "Cached suggestions"}
              description={
                query.trim()
                  ? "Top matched channels with per-channel live state."
                  : "Prepopulated from recent successful searches."
              }
              channels={displayedResults}
              selectedIds={selectedChannels.map((channel) => channel.channelId)}
              emptyMessage="Search results will appear here."
              onAddChannel={handleAddChannel}
              onRemoveChannel={handleRemoveChannel}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 border border-border/70 bg-card/75 px-4 py-3 backdrop-blur-sm">
              <div className="space-y-1">
                <div className="text-sm font-medium">Live wall</div>
                <p className="text-xs text-muted-foreground">
                  Click focus audio to make one stream the active feed.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RadioTower className="size-4 text-primary" />
                {liveCount} live / {selectedChannels.length} selected
              </div>
            </div>
            <LiveGrid
              channels={selectedChannels}
              activeAudioChannelId={activeAudioChannelId}
              onMakeActive={handleMakeActive}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
