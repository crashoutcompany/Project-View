import { PanelLeftOpen, RadioTower } from "lucide-react";

import { LiveTile } from "@/components/live-tile";
import { ChannelResult } from "@/lib/types";

type LiveGridProps = {
  channels: ChannelResult[];
  activeAudioChannelId: string | null;
};

function getGridClass(count: number) {
  if (count <= 1) return "";
  if (count === 2) return "md:grid-cols-2";
  if (count <= 4) return "md:grid-cols-2";
  if (count <= 6) return "md:grid-cols-2 xl:grid-cols-3";
  return "md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
}

export function LiveGrid({ channels, activeAudioChannelId }: LiveGridProps) {
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
      className={`grid h-full auto-rows-fr gap-px bg-border/20 ${getGridClass(channels.length)}`}
    >
      {channels.map((channel) => (
        <LiveTile
          key={channel.channelId}
          channel={channel}
          activeAudio={activeAudioChannelId === channel.channelId}
        />
      ))}
    </div>
  );
}
