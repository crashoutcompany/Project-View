"use client";

import * as React from "react";
import { MessageSquare, MessageSquareOff, X } from "lucide-react";
import { useTheme } from "next-themes";

import { PlatformBadge, PLATFORM_LABELS } from "@/components/platform-badge";
import { Button } from "@/components/ui/button";
import { chatEmbedUrl } from "@/lib/chat-embed";
import { isLive } from "@/lib/live";
import { ChannelResult } from "@/lib/types";
import { cn } from "@/lib/utils";

function subscribeNoop() {
  return () => {};
}

// The embeds need the page's own hostname, which only exists in the browser.
// Null on the server, so no iframe renders until after hydration.
function useHostname() {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => window.location.hostname,
    () => null,
  );
}

/** Active tab, falling back to the first live channel when it was removed. */
export function resolveActiveChatId(
  channels: ChannelResult[],
  requestedId: string | null,
) {
  if (requestedId && channels.some((channel) => channel.channelId === requestedId)) {
    return requestedId;
  }

  return (
    channels.find((channel) => isLive(channel.live))?.channelId ??
    channels[0]?.channelId ??
    null
  );
}

type ChatToggleButtonProps = {
  onClick: () => void;
};

// Sits above the bottom-right tile's player control bar so it never covers
// the fullscreen or volume buttons.
export function ChatToggleButton({ onClick }: ChatToggleButtonProps) {
  return (
    <Button
      onClick={onClick}
      aria-label="Open chat"
      className="fixed right-4 bottom-16 z-40 size-12 rounded-full p-0 shadow-lg shadow-black/40"
    >
      <MessageSquare className="size-5" />
    </Button>
  );
}

type LiveChatPanelProps = {
  open: boolean;
  channels: ChannelResult[];
  twitchParents: string[];
  onClose: () => void;
};

export function LiveChatPanel({
  open,
  channels,
  twitchParents,
  onClose,
}: LiveChatPanelProps) {
  const [requestedId, setRequestedId] = React.useState<string | null>(null);
  const hostname = useHostname();
  const { resolvedTheme } = useTheme();
  const activeId = resolveActiveChatId(channels, requestedId);
  const activeChannel = channels.find(
    (channel) => channel.channelId === activeId,
  );
  // Lazy: only the active tab gets an iframe, and only while the panel is open.
  const src =
    open && activeChannel && hostname
      ? chatEmbedUrl(activeChannel, {
          twitchParents,
          hostname,
          dark: resolvedTheme === "dark",
        })
      : null;

  return (
    <>
      <aside
        data-open={open}
        aria-label="Live chat"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "absolute inset-y-0 right-0 z-30 flex w-full translate-x-full flex-col border-l border-border/40 bg-background transition-transform duration-200 ease-out data-[open=true]:translate-x-0 sm:w-96 lg:relative lg:z-auto lg:translate-x-0 lg:overflow-hidden lg:transition-[width] lg:duration-200 lg:ease-out",
          open ? "lg:w-80 xl:w-96" : "lg:w-0 lg:border-l-0",
        )}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/30 px-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MessageSquare className="size-3.5" />
            Live chat
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="pointer-coarse:size-11"
            aria-label="Close chat"
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {channels.length > 0 ? (
          <div
            role="tablist"
            aria-label="Chats"
            className="flex shrink-0 gap-1 overflow-x-auto overscroll-contain border-b border-border/30 p-1.5"
          >
            {channels.map((channel) => {
              const selected = channel.channelId === activeId;

              return (
                <button
                  key={channel.channelId}
                  type="button"
                  role="tab"
                  id={`chat-tab-${channel.channelId}`}
                  aria-selected={selected}
                  aria-controls="chat-tabpanel"
                  onClick={() => setRequestedId(channel.channelId)}
                  className={cn(
                    "inline-flex h-7 max-w-40 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors pointer-coarse:h-9",
                    selected
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <PlatformBadge platform={channel.platform} />
                  <span className="truncate">{channel.title}</span>
                  {isLive(channel.live) ? (
                    <span
                      aria-label="live"
                      className="size-1.5 shrink-0 rounded-full bg-red-600"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div
          id="chat-tabpanel"
          role="tabpanel"
          aria-labelledby={activeId ? `chat-tab-${activeId}` : undefined}
          className="min-h-0 flex-1"
        >
          {src && activeChannel ? (
            <iframe
              key={src}
              className="size-full"
              src={src}
              title={`${activeChannel.title} ${PLATFORM_LABELS[activeChannel.platform]} chat`}
            />
          ) : (
            <ChatEmptyState channel={activeChannel} />
          )}
        </div>
      </aside>

      {/* Backdrop for the drawer below desktop widths. */}
      {open ? (
        <div
          className="absolute inset-0 z-20 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      ) : null}
    </>
  );
}

function ChatEmptyState({ channel }: { channel?: ChannelResult }) {
  const message = !channel
    ? "Add a live channel to see its chat."
    : isLive(channel.live)
      ? "Chat isn't available for this stream."
      : `${channel.title} isn't live, so there's no chat right now.`;

  return (
    <div className="flex size-full items-center justify-center p-6 text-center">
      <div className="space-y-3 text-muted-foreground">
        <MessageSquareOff className="mx-auto size-7 opacity-40" />
        <p className="text-sm text-foreground/70">No chat</p>
        <p className="text-xs">{message}</p>
      </div>
    </div>
  );
}
