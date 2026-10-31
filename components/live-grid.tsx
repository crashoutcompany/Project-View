import type * as React from "react";
import { PanelLeftOpen, RadioTower } from "lucide-react";

import { LiveTile } from "@/components/live-tile";
import { fullscreenSaverAction } from "@/lib/fullscreen-saver";
import type { GridLayout, Settings, StreamQuality } from "@/lib/settings";
import { ChannelResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type LiveGridProps = {
  channels: ChannelResult[];
  activeAudioChannelId: string | null;
  twitchParents: string[];
  layout?: GridLayout;
  quality?: StreamQuality;
  audioSyncKey?: string;
  onFocusAudio?: (channelId: string) => void;
  // The stream whose player is fullscreen, if it is one of these.
  fullscreenChannelId?: string | null;
  saverSettings?: Pick<Settings, "saveResourcesOnFullscreen" | "pauseOthersOnFullscreen">;
};

const SAVER_OFF = { saveResourcesOnFullscreen: false, pauseOthersOnFullscreen: false };

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
  audioSyncKey,
  onFocusAudio,
  fullscreenChannelId = null,
  saverSettings = SAVER_OFF,
}: LiveGridProps) {
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

  return (
    <div
      data-layout={layout}
      className={cn(
        "grid h-full auto-rows-fr gap-px bg-border/20",
        getGridClass(channels.length, layout),
      )}
    >
      {channels.map((channel, index) => (
        <LiveTile
          key={channel.channelId}
          channel={channel}
          activeAudio={activeAudioChannelId === channel.channelId}
          twitchParents={twitchParents}
          quality={quality}
          audioSyncKey={audioSyncKey}
          onFocusAudio={onFocusAudio}
          saverAction={fullscreenSaverAction({
            channelId: channel.channelId,
            platform: channel.platform,
            fullscreenChannelId,
            settings: saverSettings,
          })}
          // One big plus small: the first stream spans the left column and
          // the rest stack on the right. Placement is by CSS, not DOM order,
          // so no iframe remounts.
          className={
            layout === "featured" && channels.length > 1
              ? index === 0
                ? "md:col-start-1 md:row-start-1 md:[grid-row-end:span_var(--featured-span)]"
                : "md:col-start-2"
              : undefined
          }
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
