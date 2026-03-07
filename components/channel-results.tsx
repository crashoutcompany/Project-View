import { Plus, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
  onAddChannel: (channel: ChannelResult) => void;
  onRemoveChannel: (channelId: string) => void;
};

function initials(label: string) {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ChannelResults({
  title,
  description,
  channels,
  selectedIds,
  emptyMessage,
  onAddChannel,
  onRemoveChannel,
}: ChannelResultsProps) {
  return (
    <Card className="border-border/70 bg-card/75 backdrop-blur-sm">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {channels.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-6 text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : null}
        {channels.map((channel) => {
          const isSelected = selectedIds.includes(channel.channelId);
          const isLive = channel.live.status === "live";

          return (
            <Card
              key={channel.channelId}
              size="sm"
              className="border border-border/70 bg-background/70 relative overflow-visible"
            >
              <CardHeader>
                <Badge
                  variant={isLive ? "default" : "secondary"}
                  className="uppercase absolute top-0 -left-2 z-10"
                >
                  {channel.live.status}
                </Badge>
                <div
                  className="flex min-w-0 items-start gap-3"
                  title={`${channel.title}\n${channel.description || "No description available."}`}
                >
                  <Avatar size="lg" className="shrink-0">
                    <AvatarImage
                      src={channel.thumbnailUrl}
                      alt={channel.title}
                    />
                    <AvatarFallback>{initials(channel.title)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">{channel.title}</CardTitle>
                    <CardDescription className="mt-1 truncate">
                      {channel.description || "No description available."}
                    </CardDescription>
                  </div>
                </div>
                <CardAction className="flex items-center gap-2">
                  {isSelected ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemoveChannel(channel.channelId)}
                      aria-label={`Remove ${channel.title}`}
                    >
                      <Trash2 />
                    </Button>
                  ) : (
                    <Button
                      variant={isLive ? "default" : "outline"}
                      size="sm"
                      onClick={() => onAddChannel(channel)}
                    >
                      <Plus />
                      Add
                    </Button>
                  )}
                </CardAction>
              </CardHeader>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}
