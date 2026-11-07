"use client";

import * as React from "react";
import { PanelLeftOpen, RadioTower } from "lucide-react";

import { LiveTile, TILE_HEADER_HEIGHT } from "@/components/live-tile";
import { fullscreenSaverAction } from "@/lib/fullscreen-saver";
import { packGrid } from "@/lib/grid-pack";
import type {
  GridLayout,
  Settings,
  StreamFit,
  StreamQuality,
} from "@/lib/settings";
import { ChannelResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type LiveGridProps = {
  channels: ChannelResult[];
  activeAudioChannelId: string | null;
  twitchParents: string[];
  layout?: GridLayout;
  quality?: StreamQuality;
  fit?: StreamFit;
  audioSyncKey?: string;
  onFocusAudio?: (channelId: string) => void;
  // The stream whose player is fullscreen, if it is one of these.
  fullscreenChannelId?: string | null;
  // The stream the keyboard shortcuts act on.
  focusedChannelId?: string | null;
  // The stream shown alone over the fullscreen wall.
  spotlightChannelId?: string | null;
  saverSettings?: Pick<Settings, "saveResourcesOnFullscreen" | "pauseOthersOnFullscreen">;
};

const SAVER_OFF = { saveResourcesOnFullscreen: false, pauseOthersOnFullscreen: false };

// Matches the grid's gap-px.
const GRID_GAP = 1;

type Size = { width: number; height: number };

// The element's content size, or null before the first measure (and on the
// server), when the grid falls back to its CSS layout.
function useElementSize() {
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const [size, setSize] = React.useState<Size | null>(null);

  React.useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current?.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, size] as const;
}

function getGridClass(count: number, layout: GridLayout) {
  if (count <= 1) return "";
  // Fixed layouts scroll instead of squeezing every tile into the viewport.
  if (layout === "one-column") return "auto-rows-[minmax(min(60svh,24rem),1fr)]";
  if (layout === "two-columns") {
    return "auto-rows-[minmax(min(40svh,16rem),1fr)] sm:grid-cols-2";
  }
  if (layout === "featured") {
    return "auto-rows-[minmax(min(40svh,12rem),1fr)] md:grid-cols-[3fr_1fr] md:auto-rows-fr";
  }
  if (count === 2) return "md:grid-cols-2";
  if (count <= 4) return "md:grid-cols-2";
  if (count <= 6) return "md:grid-cols-2 xl:grid-cols-3";
  return "md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
}

export function LiveGrid({
  channels,
  activeAudioChannelId,
  twitchParents,
  layout = "auto",
  quality,
  fit = "fit",
  audioSyncKey,
  onFocusAudio,
  fullscreenChannelId = null,
  focusedChannelId = null,
  spotlightChannelId = null,
  saverSettings = SAVER_OFF,
}: LiveGridProps) {
  const [setGridElement, size] = useElementSize();

  if (channels.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div className="space-y-4 text-muted-foreground">
          <RadioTower className="mx-auto size-8 opacity-30" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground/60">
              No streams yet
            </p>
            <p className="text-xs">
              Open the sidebar{" "}
              <PanelLeftOpen className="mb-0.5 inline size-3.5" /> and search
              for channels to watch.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fit on the auto layout packs exact 16:9 players, so no tile letterboxes
  // and spare space gathers around the grid. Fixed layouts keep their rows.
  const pack =
    fit === "fit" && layout === "auto" && size
      ? packGrid({
          count: channels.length,
          width: size.width,
          height: size.height,
          headerHeight: TILE_HEADER_HEIGHT,
          gap: GRID_GAP,
        })
      : null;

  return (
    <div
      ref={setGridElement}
      data-layout={layout}
      data-packed={pack ? "" : undefined}
      className={cn(
        "grid h-full gap-px",
        pack
          ? // Safe, so rows that overflow scroll from the top.
            "[place-content:safe_center]"
          : cn("auto-rows-fr bg-border/20", getGridClass(channels.length, layout)),
      )}
      style={
        pack
          ? {
              gridTemplateColumns: `repeat(${pack.columns}, ${pack.tileWidth}px)`,
              gridAutoRows: `${pack.tileHeight}px`,
            }
          : undefined
      }
    >
      {channels.map((channel, index) => (
        <LiveTile
          key={channel.channelId}
          channel={channel}
          activeAudio={activeAudioChannelId === channel.channelId}
          twitchParents={twitchParents}
          quality={quality}
          fit={fit}
          audioSyncKey={audioSyncKey}
          onFocusAudio={onFocusAudio}
          // A ring only helps tell streams apart when there is more than one,
          // and not while a single stream fills the screen.
          focused={
            channels.length > 1 &&
            !spotlightChannelId &&
            focusedChannelId === channel.channelId
          }
          covered={
            spotlightChannelId !== null && spotlightChannelId !== channel.channelId
          }
          saverAction={fullscreenSaverAction({
            channelId: channel.channelId,
            platform: channel.platform,
            fullscreenChannelId,
            settings: saverSettings,
          })}
          // One big plus small: the first stream spans the left column and
          // the rest stack on the right. Placement is by CSS, not DOM order,
          // so no iframe remounts.
          // The spotlit tile covers the screen in place rather than moving
          // in the DOM, so no player reloads when the spotlight switches.
          className={cn(
            layout === "featured" && channels.length > 1
              ? index === 0
                ? "md:col-start-1 md:row-start-1 md:[grid-row-end:span_var(--featured-span)]"
                : "md:col-start-2"
              : undefined,
            spotlightChannelId === channel.channelId && "fixed inset-0 z-10",
          )}
          style={
            layout === "featured" && index === 0
              ? ({ "--featured-span": Math.max(channels.length - 1, 1) } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </div>
  );
}
