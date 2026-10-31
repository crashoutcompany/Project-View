import { Plus, Trash2 } from "lucide-react";

import { ChannelAvatar } from "@/components/channel-avatar";
import { LiveBadge } from "@/components/live-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChannelResult } from "@/lib/types";

type ChannelResultsProps = {
  title: string;
  description: string;
  channels: ChannelResult[];
  selectedIds: string[];
  emptyMessage: string;
  now: number;
  onAddChannel: (channel: ChannelResult) => void;
  onRemoveChannel: (channelId: string) => void;
};

export function ChannelResults({
  title,
  description,
  channels,
  selectedIds,
  emptyMessage,
  now,
  onAddChannel,
  onRemoveChannel,
}: ChannelResultsProps) {
  return (
    <Card className="border-border/70 bg-card/75 backdrop-blur-sm">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        {channels.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-6 text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : null}
        <ul className="-mx-2 space-y-0.5">
          {channels.map((channel) => {
            const isSelected = selectedIds.includes(channel.channelId);

            return (
              <li
                key={channel.channelId}
                title={`${channel.title}\n${channel.description || "No description available."}`}
                // No layout transition: live re-sorts should jump, not animate.
                className="group/row relative flex min-h-14 items-center gap-3 px-2 py-2 transition-[background-color,scale] duration-[120ms] ease-out hover:bg-muted/60 has-[[data-row-add]:active]:scale-[0.97] pointer-coarse:min-h-16"
              >
                <ChannelAvatar
                  title={channel.title}
                  thumbnailUrl={channel.thumbnailUrl}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <PlatformBadge platform={channel.platform} />
                    <span className="truncate text-sm font-medium">
                      {channel.title}
                    </span>
                  </div>
                  <LiveBadge live={channel.live} now={now} className="mt-1" />
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {channel.description || "No description available."}
                  </p>
                </div>
                {isSelected ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemoveChannel(channel.channelId)}
                    aria-label={`Remove ${channel.title}`}
                    // Always visible on touch; hover-revealed for mouse users.
                    // Opacity (not display) keeps the description's space reserved.
                    className="relative shrink-0 transition-[opacity,scale,background-color] duration-[120ms] ease-out active:scale-[0.97] pointer-coarse:size-11 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                ) : (
                  <Button
                    data-row-add
                    variant="outline"
                    size="sm"
                    onClick={() => onAddChannel(channel)}
                    aria-label={`Add ${channel.title}`}
                    // Stretched over the row so the whole row adds the channel.
                    className="shrink-0 bg-transparent after:absolute after:inset-0 after:content-[''] pointer-coarse:h-11"
                  >
                    <Plus />
                    Add
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
