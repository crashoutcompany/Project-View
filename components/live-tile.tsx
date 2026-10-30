import { ChannelAvatar } from "@/components/channel-avatar";
import { PlatformBadge } from "@/components/platform-badge";
import { twitchPlayerUrl } from "@/lib/twitch-embed";
import { ChannelResult } from "@/lib/types";

type LiveTileProps = {
  channel: ChannelResult;
  activeAudio: boolean;
  twitchParents: string[];
};

function embedUrl(
  channel: ChannelResult,
  activeAudio: boolean,
  twitchParents: string[],
) {
  if (channel.live.status !== "live") {
    return null;
  }

  if (channel.platform === "twitch") {
    return channel.login && twitchParents.length > 0
      ? twitchPlayerUrl(channel.login, twitchParents, !activeAudio)
      : null;
  }

  return channel.live.videoId
    ? `https://www.youtube.com/embed/${channel.live.videoId}?autoplay=1&mute=${
        activeAudio ? "0" : "1"
      }&rel=0&playsinline=1`
    : null;
}

export function LiveTile({ channel, activeAudio, twitchParents }: LiveTileProps) {
  const src = embedUrl(channel, activeAudio, twitchParents);

  return (
    <div className="group relative flex flex-col bg-black">
      {/* Video area fills all space */}
      <div className="flex-1">
        {src ? (
          <iframe
            className="size-full"
            src={src}
            title={`${channel.title} live stream`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          // The tile is always dark, so text uses fixed light tones, not theme colors.
          <div className="flex size-full items-center justify-center bg-[#0a0a0f] p-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <ChannelAvatar
                title={channel.title}
                thumbnailUrl={channel.thumbnailUrl}
                size="default"
                className="size-14 opacity-80"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/85">
                  {channel.title}
                </p>
                <p className="text-xs font-medium tracking-wide text-white/50 uppercase">
                  {channel.live.status === "unknown" ? "Status unknown" : "Offline"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Fades on hover so it never covers the player's own controls. */}
      <PlatformBadge
        platform={channel.platform}
        showLabel
        className="pointer-events-none absolute top-2 left-2 transition-opacity duration-150 ease-out group-hover:opacity-0"
      />
    </div>
  );
}
