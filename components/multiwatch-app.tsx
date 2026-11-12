"use client";

import * as React from "react";
import {
  Maximize,
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
import { FullscreenSwitcher } from "@/components/fullscreen-switcher";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { ChatToggleButton, LiveChatPanel } from "@/components/live-chat";
import { LiveGrid } from "@/components/live-grid";
import { PlatformFilter } from "@/components/platform-filter";
import { RemovedStreamsToast } from "@/components/settings/removed-streams-toast";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { useStreamSettings } from "@/components/settings/use-stream-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Shortcut } from "@/lib/keyboard-shortcuts";
import { sortLiveFirst } from "@/lib/live";
import {
  ChannelResult,
  Platform,
  PlatformFilter as PlatformFilterValue,
} from "@/lib/types";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

type MultiwatchAppProps = {
  initialQuery: string;
  initialResults: ChannelResult[];
  initialSelectedChannels: ChannelResult[];
  initialUpdatedAt: string;
  configured: boolean;
  // Shown in the sidebar, e.g. when the visitor is rate limited.
  notice?: string;
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

function subscribeNothing() {
  return () => {};
}

// False on the server and in browsers without element fullscreen (iPhone
// Safari), so the button only shows where it works.
function useFullscreenSupported() {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => document.fullscreenEnabled === true,
    () => false,
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
  initialSelectedChannels,
  initialUpdatedAt,
  configured,
  notice: initialNotice,
  platforms,
  twitchParents,
}: MultiwatchAppProps) {
  const [query, setQuery] = React.useState(initialQuery);
  const [notice, setNotice] = React.useState(initialNotice);
  const [platformFilter, setPlatformFilter] =
    React.useState<PlatformFilterValue>("all");
  const [results, setResults] = React.useState(
    initialQuery ? initialResults : [],
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
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  // Starts from the server timestamp so uptime text hydrates without a
  // mismatch, then ticks once a minute.
  const [now, setNow] = React.useState(() => Date.parse(initialUpdatedAt));
  const searchTimeoutRef = React.useRef<number | null>(null);
  // State rather than a ref: the help dialog renders inside it in fullscreen.
  const [streamsElement, setStreamsElement] =
    React.useState<HTMLElement | null>(null);
  const fullscreenSupported = useFullscreenSupported();

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
    const kept = streamSettings.recordCheck(refreshed);
    setSelectedChannels(kept);
    if (kept.length === 0) {
      setChatOpen(false);
    }
    if (kept.length !== refreshed.length) {
      replaceUrl(query, kept);
    }
    setResults((current) =>
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
      setResults([]);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const payload = await searchChannelsAction(
            trimmedQuery,
            nextPlatform,
          );

          setNotice(payload.notice);
          setResults(payload.channels);
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

  // Opens a saved group or the remembered streams in place of the selection.
  function handleOpenChannels(channelIds: string[]) {
    if (!configured || channelIds.length === 0) {
      return;
    }

    startTransition(async () => {
      try {
        const opened = await refreshSelectedChannelsAction(channelIds);
        setSelectedChannels(opened);
        setActiveAudioChannelId(
          opened.find((channel) => channel.live.status === "live")?.channelId ??
            opened[0]?.channelId ??
            null,
        );
        replaceUrl(query, opened);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function handleRestoreChannels(channels: ChannelResult[]) {
    const nextSelectedChannels = dedupeChannels([
      ...selectedChannels,
      ...channels,
    ]);
    setSelectedChannels(nextSelectedChannels);
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

  // Only the streams area goes fullscreen, so the header, sidebar and chat
  // stay hidden until the viewer exits (Esc or the browser's own control).
  // A single stream is the wall plus a spotlight, so switching streams never
  // needs another fullscreen request.
  function enterFullscreen(spotlightChannelId: string | null) {
    if (!streamsElement) {
      return;
    }

    streamSettings.setSpotlight(
      spotlightChannelId
        ? { channelId: spotlightChannelId, fromWall: false }
        : null,
    );
    streamsElement.requestFullscreen().catch((error) => {
      streamSettings.setSpotlight(null);
      console.error(error);
    });
  }

  function handleEnterFullscreen() {
    enterFullscreen(null);
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

  const streamSettings = useStreamSettings({
    channels: selectedChannels,
    activeAudioChannelId,
    onLiveCheck: handleManualRefresh,
    onRestoreChannels: handleRestoreChannels,
  });

  // What M and F act on: the fullscreen stream, then the last clicked or
  // numbered one, then the one with audio, then the first.
  const shortcutChannelId =
    streamSettings.fullscreenChannelId ??
    streamSettings.focusedChannelId ??
    streamSettings.audioChannelId ??
    (selectedChannels.some(
      (channel) => channel.channelId === activeAudioChannelId,
    )
      ? activeAudioChannelId
      : null) ??
    selectedChannels[0]?.channelId ??
    null;

  function findTile(channelId: string) {
    const tiles = streamsElement?.querySelectorAll<HTMLElement>("[data-tile]");
    return (
      Array.from(tiles ?? []).find(
        (tile) => tile.dataset.channelId === channelId,
      ) ?? null
    );
  }

  const { spotlight } = streamSettings;

  // Same path as clicking a stream, so audio follows focus the same way. DOM
  // focus stays on the page: moving it into a player would swallow later keys.
  // In fullscreen the spotlight moves with the focus.
  function showStream(channelId: string) {
    streamSettings.focusStream(channelId);
    if (spotlight) {
      streamSettings.setSpotlight({ ...spotlight, channelId });
      return;
    }

    findTile(channelId)?.scrollIntoView({ block: "nearest" });
  }

  function handleFocusShortcut(index: number) {
    const channel = selectedChannels[index];
    if (channel) {
      showStream(channel.channelId);
    }
  }

  // Wraps around at either end.
  function handleStep(delta: 1 | -1) {
    const count = selectedChannels.length;
    if (count === 0) {
      return;
    }

    const current = selectedChannels.findIndex(
      (channel) => channel.channelId === shortcutChannelId,
    );
    const next = current === -1 ? 0 : (current + delta + count) % count;
    showStream(selectedChannels[next].channelId);
  }

  function handleMuteShortcut() {
    if (!shortcutChannelId) {
      return;
    }

    if (streamSettings.audioChannelId === shortcutChannelId) {
      streamSettings.setAudioMuted(true);
      return;
    }

    setActiveAudioChannelId(shortcutChannelId);
    streamSettings.focusStream(shortcutChannelId);
    streamSettings.setAudioMuted(false);
  }

  function exitFullscreen() {
    document.exitFullscreen().catch((error) => {
      console.error(error);
    });
  }

  // F toggles one stream: from the page it fullscreens the focused stream and
  // back out; on the fullscreen wall it spotlights the focused stream and
  // back to the wall. The fullscreen saver and mute-others treat a spotlit
  // stream like a player's own fullscreen.
  function handleFullscreenShortcut() {
    if (streamSettings.wallFullscreen) {
      if (spotlight) {
        if (spotlight.fromWall) {
          streamSettings.setSpotlight(null);
        } else {
          exitFullscreen();
        }
      } else if (shortcutChannelId) {
        streamSettings.setSpotlight({
          channelId: shortcutChannelId,
          fromWall: true,
        });
      }
      return;
    }

    if (document.fullscreenElement) {
      exitFullscreen();
      return;
    }

    if (fullscreenSupported && shortcutChannelId) {
      enterFullscreen(shortcutChannelId);
    }
  }

  useKeyboardShortcuts((shortcut: Shortcut) => {
    if (shortcut.type === "help") {
      setShortcutsOpen((open) => !open);
      return;
    }

    // The help dialog is modal, so nothing behind it reacts.
    if (shortcutsOpen) {
      return;
    }

    if (shortcut.type === "focus") {
      handleFocusShortcut(shortcut.index);
    } else if (shortcut.type === "step") {
      handleStep(shortcut.delta);
    } else if (shortcut.type === "mute") {
      handleMuteShortcut();
    } else {
      handleFullscreenShortcut();
    }
  });

  // Reopen the last streams once, unless the link already names some.
  const { restoreChannelIds, onRestoreHandled } = streamSettings;
  const restoreLastStreams = React.useEffectEvent((channelIds: string[]) => {
    onRestoreHandled();
    if (!new URLSearchParams(window.location.search).has("channels")) {
      handleOpenChannels(channelIds);
    }
  });
  React.useEffect(() => {
    if (restoreChannelIds) {
      restoreLastStreams(restoreChannelIds);
    }
  }, [restoreChannelIds]);

  const liveCount = selectedChannels.filter(
    (channel) => channel.live.status === "live",
  ).length;
  // Display order only: the grid and URL keep the order channels were added,
  // so iframes don't remount when a channel goes live.
  // Also filtered here so stale results from another filter never flash.
  const displayedResults = sortLiveFirst(
    query.trim() ? results : [],
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
            {/* Hidden on phones so the settings button fits the bar. */}
            <span className="hidden text-border/60 sm:inline">/</span>
            <span className="hidden sm:inline">
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

          {fullscreenSupported ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleEnterFullscreen}
              disabled={selectedChannels.length === 0}
              aria-label="Fullscreen streams"
              title="Fullscreen streams (Esc to exit)"
              className="pointer-coarse:size-11"
            >
              <Maximize />
            </Button>
          ) : null}

          <SettingsPanel
            currentChannelIds={selectedIds}
            onOpenGroup={handleOpenChannels}
            groupsEnabled={configured}
          />
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

              {notice ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {notice}
                </p>
              ) : null}

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

              {query.trim() ? (
                <ChannelResults
                  title="Results"
                  description="Matched channels."
                  channels={unselectedResults}
                  selectedIds={selectedIds}
                  emptyMessage="No channels found."
                  now={now}
                  onAddChannel={handleAddChannel}
                  onRemoveChannel={handleRemoveChannel}
                />
              ) : null}
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
        <main
          ref={setStreamsElement}
          // STREAM_WALL_ATTRIBUTE: tells the wall's fullscreen from a player's.
          data-stream-wall=""
          className="flex-1 overflow-y-auto bg-[#050507]"
        >
          {/* Before the grid, so Tab reaches the arrows before the player. */}
          {spotlight && streamSettings.settings.fullscreenSwitcher ? (
            <FullscreenSwitcher
              channels={selectedChannels}
              channelId={spotlight.channelId}
              onStep={handleStep}
            />
          ) : null}
          <LiveGrid
            channels={selectedChannels}
            activeAudioChannelId={streamSettings.audioChannelId}
            twitchParents={twitchParents}
            layout={streamSettings.settings.gridLayout}
            quality={streamSettings.settings.defaultQuality}
            fit={streamSettings.settings.streamFit}
            audioSyncKey={streamSettings.audioSyncKey}
            onFocusAudio={streamSettings.onFocusAudio}
            fullscreenChannelId={streamSettings.fullscreenChannelId}
            focusedChannelId={streamSettings.focusedChannelId}
            spotlightChannelId={spotlight?.channelId ?? null}
            saverSettings={streamSettings.settings}
          />
        </main>

        <LiveChatPanel
          open={chatOpen && selectedChannels.length > 0}
          channels={selectedChannels}
          twitchParents={twitchParents}
          onClose={() => setChatOpen(false)}
        />
      </div>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        // Anything outside the fullscreen element is hidden behind it.
        container={streamSettings.wallFullscreen ? streamsElement : null}
      />

      <RemovedStreamsToast
        toast={streamSettings.removedToast}
        onUndo={streamSettings.undoRemove}
        onDismiss={streamSettings.dismissRemovedToast}
      />

      {selectedChannels.length > 0 && !chatOpen ? (
        <ChatToggleButton onClick={() => setChatOpen(true)} />
      ) : null}
    </div>
  );
}
