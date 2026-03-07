import "server-only";

import { getRequiredEnv, hasYouTubeEnv } from "@/lib/env";
import { BaseChannel, LiveStatus } from "@/lib/types";

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

type SearchResponse = {
  items?: Array<{
    id?: {
      channelId?: string;
      videoId?: string;
    };
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
};

type ChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
};

function pickThumbnailUrl(
  thumbnails:
    | {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      }
    | undefined,
) {
  return (
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ""
  );
}

async function youtubeFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const apiKey = getRequiredEnv("YOUTUBE_API_KEY");
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  searchParams.set("key", apiKey);

  const response = await fetch(
    `${YOUTUBE_API_BASE_URL}${path}?${searchParams}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function youtubeConfigured() {
  return hasYouTubeEnv();
}

export async function searchChannels(query: string, maxResults = 5) {
  const payload = await youtubeFetch<SearchResponse>("/search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults,
  });

  return (payload.items ?? [])
    .map((item): BaseChannel | null => {
      const channelId = item.id?.channelId;
      const title = item.snippet?.title?.trim();

      if (!channelId || !title) {
        return null;
      }

      return {
        channelId,
        title,
        description: item.snippet?.description?.trim() ?? "",
        thumbnailUrl: pickThumbnailUrl(item.snippet?.thumbnails),
      };
    })
    .filter((channel): channel is BaseChannel => Boolean(channel));
}

export async function getChannelsByIds(channelIds: string[]) {
  if (channelIds.length === 0) {
    return [];
  }

  const payload = await youtubeFetch<ChannelsResponse>("/channels", {
    part: "snippet",
    id: channelIds.join(","),
    maxResults: channelIds.length,
  });

  return (payload.items ?? [])
    .map((item): BaseChannel | null => {
      const channelId = item.id;
      const title = item.snippet?.title?.trim();

      if (!channelId || !title) {
        return null;
      }

      return {
        channelId,
        title,
        description: item.snippet?.description?.trim() ?? "",
        thumbnailUrl: pickThumbnailUrl(item.snippet?.thumbnails),
      };
    })
    .filter((channel): channel is BaseChannel => Boolean(channel));
}

export async function getLiveVideoForChannel(
  channelId: string,
): Promise<LiveStatus> {
  const payload = await youtubeFetch<SearchResponse>("/search", {
    part: "snippet",
    type: "video",
    eventType: "live",
    channelId,
    maxResults: 1,
  });

  const item = payload.items?.[0];
  const videoId = item?.id?.videoId;
  const checkedAt = new Date().toISOString();

  if (!videoId) {
    return {
      status: "offline",
      checkedAt,
    };
  }

  return {
    status: "live",
    checkedAt,
    videoId,
    title: item?.snippet?.title?.trim() ?? "Live now",
    thumbnailUrl: pickThumbnailUrl(item?.snippet?.thumbnails),
    startedAt: item?.snippet?.publishedAt,
  };
}
