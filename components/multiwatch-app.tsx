"use client";

import * as React from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";

import {
  refreshSelectedChannelsAction,
  searchChannelsAction,
} from "@/app/actions";
import { ChannelCombobox } from "@/components/channel-combobox";
import { ChannelResults } from "@/components/channel-results";
import { ChatToggleButton, LiveChatPanel } from "@/components/live-chat";
import { LiveGrid } from "@/components/live-grid";
import { PlatformFilter } from "@/components/platform-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sortLiveFirst } from "@/lib/live";
import {
  ChannelResult,
  Platform,
  PlatformFilter as PlatformFilterValue,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type MultiwatchAppProps = {
  initialQuery: string;
  initialResults: ChannelResult[];
  initialSeedResults: ChannelResult[];
  initialSelectedChannels: ChannelResult[];
  initialUpdatedAt: string;
  configured: boolean;
  platforms: Platform[];
  // Hosts the Twitch player must allow as `parent`, from the request.
  twitchParents: string[];
};

function dedupeChannels(channels: ChannelResult[]) {
  return Array.from(
    new Map(channels.map((channel) => [channel.channelId, channel])).values(),
  );
}

function mergeChannel(target: ChannelResult[], incoming: ChannelResult) {
  return target.map((channel) =>
    channel.channelId === incoming.channelId ? incoming : channel,
  );
}

function buildUrl(nextQuery: string, nextSelectedChannels: ChannelResult[]) {
  const params = new URLSearchParams(window.location.search);
  const trimmedQuery = nextQuery.trim();
  const selectedIds = nextSelectedChannels.map((channel) => channel.channelId);

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  } else {
    params.delete("q");
  }

  if (selectedIds.length > 0) {
    params.set("channels", selectedIds.join(","));
  } else {
    params.delete("channels");
  }

  const queryString = params.toString();
  return queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;
}

export function MultiwatchApp({
  initialQuery,
  initialResults,
  initialSeedResults,
  initialSelectedChannels,
  initialUpdatedAt,
  configured,
  platforms,
  twitchParents,
}: MultiwatchAppProps) {
  const [query, setQuery] = React.useState(initialQuery);
  const [platformFilter, setPlatformFilter] =
    React.useState<PlatformFilterValue>("all");
  const [seedResults, setSeedResults] = React.useState(initialSeedResults);
  const [results, setResults] = React.useState(
    initialQuery ? initialResults : initialSeedResults,
  );
  const [selectedChannels, setSelectedChannels] = React.useState(
    initialSelectedChannels,
  );
  const [activeAudioChannelId, setActiveAudioChannelId] = React.useState<
    string | null
  >(
    initialSelectedChannels.find((channel) => channel.live.status === "live")
      ?.channelId ??
      initialSelectedChannels[0]?.channelId ??
      null,
  );
  const [lastUpdated, setLastUpdated] = React.useState(initialUpdatedAt);
  const [isPending, startTransition] = React.useTransition();
  const [sidebarOpen, setSidebarOpen] = React.useState(
    initialSelectedChannels.length === 0,
  );
  // Hidden by default; only reachable once a channel is selected.
  const [chatOpen, setChatOpen] = React.useState(false);
  // Starts from the server timestamp so uptime text hydrates without a
  // mismatch, then ticks once a minute.
  const [now, setNow] = React.useState(() => Date.parse(initialUpdatedAt));
  const searchTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  function replaceUrl(
    nextQuery: string,
    nextSelectedChannels: ChannelResult[],
  ) {
    window.history.replaceState(
      null,
      "",
      buildUrl(nextQuery, nextSelectedChannels),
    );
  }

  function applyRefreshedChannels(refreshed: ChannelResult[]) {
    setSelectedChannels(refreshed);
    setResults((current) =>
      refreshed.reduce(
        (accumulator, channel) => mergeChannel(accumulator, channel),
        current,
      ),
    );
    setSeedResults((current) =>
      refreshed.reduce(
        (accumulator, channel) => mergeChannel(accumulator, channel),
        current,
      ),
    );
    setLastUpdated(new Date().toISOString());
  }

  function runSearch(
    nextQuery: string,
    nextPlatform: PlatformFilterValue = platformFilter,
  ) {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = nextQuery.trim();

    if (!configured || !trimmedQuery) {
      setResults(seedResults);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const payload = await searchChannelsAction(
            trimmedQuery,
            nextPlatform,
          );

          setResults(payload.channels);
          setSeedResults((current) =>
            dedupeChannels([...payload.channels, ...current]).slice(0, 8),
          );
          setLastUpdated(new Date().toISOString());
        } catch (error) {
          console.error(error);
        }
      });
    }, 300);
  }

  function handleAddChannel(channel: ChannelResult) {
    let nextSelectedChannels = selectedChannels;

    if (
      !selectedChannels.some((item) => item.channelId === channel.channelId)
    ) {
      nextSelectedChannels = [...selectedChannels, channel];
      setSelectedChannels(nextSelectedChannels);
    }

    if (!activeAudioChannelId) {
      setActiveAudioChannelId(channel.channelId);
    }

    replaceUrl(query, nextSelectedChannels);
  }

  function handleRemoveChannel(channelId: string) {
    const nextSelectedChannels = selectedChannels.filter(
      (channel) => channel.channelId !== channelId,
    );
    setSelectedChannels(nextSelectedChannels);

    if (activeAudioChannelId === channelId) {
      setActiveAudioChannelId(nextSelectedChannels[0]?.channelId ?? null);
    }

    if (nextSelectedChannels.length === 0) {
      setChatOpen(false);
    }

    replaceUrl(query, nextSelectedChannels);
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    replaceUrl(nextQuery, selectedChannels);
    runSearch(nextQuery);
  }

  function handlePlatformChange(nextPlatform: PlatformFilterValue) {
    setPlatformFilter(nextPlatform);
    if (query.trim()) {
      runSearch(query, nextPlatform);
    }
  }

  function handleManualRefresh() {
    if (!configured || selectedChannels.length === 0) {
      return;
    }

    startTransition(async () => {
      try {
        const refreshed = await refreshSelectedChannelsAction(
          selectedChannels.map((channel) => channel.channelId),
        );
        applyRefreshedChannels(refreshed);
      } catch (error) {
        console.error(error);
      }
    });
  }

  const liveCount = selectedChannels.filter(
    (channel) => channel.live.status === "live",
  ).length;
  // Display order only: the grid and URL keep the order channels were added,
  // so iframes don't remount when a channel goes live.
  // Also filtered here so stale results from another filter never flash.
  const displayedResults = sortLiveFirst(
    query.trim() ? results : seedResults,
  ).filter(
    (channel) =>
      platformFilter === "all" || channel.platform === platformFilter,
  );
  const sortedSelectedChannels = sortLiveFirst(selectedChannels);
  const selectedIds = selectedChannels.map((channel) => channel.channelId);
  // Selected channels already have their own list above.
  const unselectedResults = displayedResults.filter(
    (channel) => !selectedIds.includes(channel.channelId),
  );

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-[#050507] text-foreground">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 bg-background/80 px-3 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-11"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>

        <div className="h-4 w-px bg-border/50" />

        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-[0.15em]"
        >
          Project View
        </Badge>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <RadioTower className="size-3.5 text-primary" />
            <span>
              <span className="font-medium text-foreground">{liveCount}</span>{" "}
              live
            </span>
            <span className="text-border/60">/</span>
            <span>
              <span className="font-medium text-foreground">
                {selectedChannels.length}
              </span>{" "}
              selected
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleManualRefresh}
            disabled={!configured || selectedChannels.length === 0 || isPending}
            aria-label="Refresh live state"
            className="pointer-coarse:size-11"
          >
            <RefreshCcw className={isPending ? "animate-spin" : ""} />
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          data-open={sidebarOpen}
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex w-80 shrink-0 translate-x-[-100%] flex-col border-r border-border/40 bg-background/95 backdrop-blur-xl transition-transform duration-200 ease-out data-[open=true]:translate-x-0 lg:relative lg:z-auto lg:translate-x-0 lg:overflow-hidden lg:transition-[width] lg:duration-200 lg:ease-out",
            sidebarOpen ? "lg:w-80" : "lg:w-0 lg:border-r-0",
          )}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/30 px-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Search className="size-3.5" />
              Channel finder
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden pointer-coarse:size-11"
              aria-label="Close sidebar"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-4 p-3">
              <ChannelCombobox
                query={query}
                results={displayedResults}
                loading={isPending}
                now={now}
                disabled={!configured}
                onQueryChange={handleQueryChange}
                onAddChannel={handleAddChannel}
              />

              <PlatformFilter
                platforms={platforms}
                value={platformFilter}
                onChange={handlePlatformChange}
              />

              <div className="text-[10px] text-muted-foreground/60">
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </div>

              <ChannelResults
                title="Selected"
                description="Streams on the wall."
                channels={sortedSelectedChannels}
                selectedIds={selectedIds}
                emptyMessage="Add channels to start."
                now={now}
                onAddChannel={handleAddChannel}
                onRemoveChannel={handleRemoveChannel}
              />

              <ChannelResults
                title={query.trim() ? "Results" : "Suggestions"}
                description={
                  query.trim() ? "Matched channels." : "From recent searches."
                }
                channels={unselectedResults}
                selectedIds={selectedIds}
                emptyMessage="Search to find channels."
                now={now}
                onAddChannel={handleAddChannel}
                onRemoveChannel={handleRemoveChannel}
              />
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        {sidebarOpen ? (
          <div
            className="absolute inset-0 z-20 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {/* Streams area - fills all remaining space */}
        <main className="flex-1 overflow-y-auto">
          <LiveGrid
            channels={selectedChannels}
            activeAudioChannelId={activeAudioChannelId}
            twitchParents={twitchParents}
          />
        </main>

        <LiveChatPanel
          open={chatOpen && selectedChannels.length > 0}
          channels={selectedChannels}
          twitchParents={twitchParents}
          onClose={() => setChatOpen(false)}
        />
      </div>

      {selectedChannels.length > 0 && !chatOpen ? (
        <ChatToggleButton onClick={() => setChatOpen(true)} />
      ) : null}
    </div>
  );
}
