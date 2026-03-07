import { CircleOff } from "lucide-react";

import { ChannelResult } from "@/lib/types";

type LiveTileProps = {
  channel: ChannelResult;
  activeAudio: boolean;
};

export function LiveTile({ channel, activeAudio }: LiveTileProps) {
  const isLive = channel.live.status === "live" && channel.live.videoId;

  return (
    <div className="group relative flex flex-col bg-black">
      {/* Video area fills all space */}
      <div className="flex-1">
        {isLive ? (
          <iframe
            className="size-full"
            src={`https://www.youtube.com/embed/${channel.live.videoId}?autoplay=1&mute=${
              activeAudio ? "0" : "1"
            }&rel=0&playsinline=1`}
            title={`${channel.title} live stream`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[#0a0a0f]">
            <div className="space-y-2 text-center text-xs text-muted-foreground">
              <CircleOff className="mx-auto size-5 opacity-40" />
              <p>{channel.title} is offline</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
