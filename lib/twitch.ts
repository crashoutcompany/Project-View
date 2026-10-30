import "server-only";

import { readCache, writeCache } from "@/lib/cache";
import { twitchChannelId, twitchTokenCacheKey } from "@/lib/cache-keys";
import { getRequiredEnv, hasTwitchEnv } from "@/lib/env";
import { BaseChannel, LiveStatus } from "@/lib/types";

const HELIX_BASE_URL = "https://api.twitch.tv/helix";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
// A hung Twitch request shouldn't stall rendering; callers fall back on errors.
export const TWITCH_TIMEOUT_MS = 5000;
// Helix accepts up to 100 ids per /users or /streams call.
export const HELIX_MAX_IDS = 100;
// Refresh the app token a while before Twitch expires it (about 60 days).
const TOKEN_EXPIRY_MARGIN_SECONDS = 60 * 60;
const STREAM_THUMBNAIL_SIZE = { width: "640", height: "360" };

type StoredToken = { accessToken: string; expiresAt: number };

type TokenResponse = { access_token?: string; expires_in?: number };

type SearchChannelsResponse = {
  data?: Array<{
    id?: string;
    broadcaster_login?: string;
    display_name?: string;
    thumbnail_url?: string;
  }>;
};

type UsersResponse = {
  data?: Array<{
    id?: string;
    login?: string;
    display_name?: string;
    description?: string;
    profile_image_url?: string;
  }>;
};

type StreamsResponse = {
  data?: Array<{
    user_id?: string;
    type?: string;
    title?: string;
    started_at?: string;
    thumbnail_url?: string;
  }>;
};

// Kept in memory as well so the app works (one token per instance) when
// Redis is off.
let memoryToken: StoredToken | null = null;
let pendingToken: Promise<string> | null = null;

export function resetTwitchTokenForTests() {
  memoryToken = null;
  pendingToken = null;
}

export function twitchConfigured() {
  return hasTwitchEnv();
}

function isFresh(token: StoredToken | null): token is StoredToken {
  return Boolean(token?.accessToken) && (token?.expiresAt ?? 0) > Date.now();
}

async function requestAppToken() {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getRequiredEnv("TWITCH_CLIENT_ID"),
      client_secret: getRequiredEnv("TWITCH_CLIENT_SECRET"),
      grant_type: "client_credentials",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Twitch token request failed with ${response.status}`);
  }

  const body = (await response.json()) as TokenResponse;
  if (!body.access_token || !body.expires_in) {
    throw new Error("Twitch token response was missing fields");
  }

  const ttlSeconds = Math.max(60, body.expires_in - TOKEN_EXPIRY_MARGIN_SECONDS);
  const token = {
    accessToken: body.access_token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };

  memoryToken = token;
  await writeCache(twitchTokenCacheKey, token, ttlSeconds);

  return token.accessToken;
}

// Client-credentials app token: no user login. Concurrent callers share one
// token request.
async function getAppToken(forceRefresh = false) {
  if (!forceRefresh) {
    if (isFresh(memoryToken)) {
      return memoryToken.accessToken;
    }

    const cached = await readCache<StoredToken>(twitchTokenCacheKey);
    if (isFresh(cached)) {
      memoryToken = cached;
      return cached.accessToken;
    }
  }

  pendingToken ??= requestAppToken().finally(() => {
    pendingToken = null;
  });

  return pendingToken;
}

async function helixFetch<T>(
  path: string,
  params: Array<[string, string]>,
  retried = false,
): Promise<T> {
  const accessToken = await getAppToken(retried);
  const response = await fetch(
    `${HELIX_BASE_URL}${path}?${new URLSearchParams(params)}`,
    {
      headers: {
        "Client-Id": getRequiredEnv("TWITCH_CLIENT_ID"),
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS),
    },
  );

  // The token was revoked or expired early: refresh it once and retry.
  if (response.status === 401 && !retried) {
    memoryToken = null;
    return helixFetch<T>(path, params, true);
  }

  if (!response.ok) {
    throw new Error(`Twitch request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function toChannel(user: {
  id?: string;
  login?: string;
  displayName?: string;
  description?: string;
  thumbnailUrl?: string;
}): BaseChannel | null {
  const title = user.displayName?.trim() || user.login?.trim();
  if (!user.id || !user.login || !title) {
    return null;
  }

  return {
    platform: "twitch",
    channelId: twitchChannelId(user.id),
    login: user.login,
    title,
    description: user.description?.trim() ?? "",
    thumbnailUrl: user.thumbnailUrl ?? "",
  };
}

// /users for many ids in one call. Keys of the result are Twitch user ids.
export async function getUsersByIds(userIds: string[]) {
  const users = new Map<string, BaseChannel>();
  if (userIds.length === 0) {
    return users;
  }

  const payload = await helixFetch<UsersResponse>(
    "/users",
    userIds.slice(0, HELIX_MAX_IDS).map((id) => ["id", id]),
  );

  for (const item of payload.data ?? []) {
    const channel = toChannel({
      id: item.id,
      login: item.login,
      displayName: item.display_name,
      description: item.description,
      thumbnailUrl: item.profile_image_url,
    });
    if (channel && item.id) {
      users.set(item.id, channel);
    }
  }

  return users;
}

// search/channels has no descriptions, so they come from one /users call.
export async function searchChannels(query: string, maxResults = 5) {
  const payload = await helixFetch<SearchChannelsResponse>("/search/channels", [
    ["query", query],
    ["first", String(maxResults)],
  ]);

  const matches = (payload.data ?? []).flatMap((item) => {
    const channel = toChannel({
      id: item.id,
      login: item.broadcaster_login,
      displayName: item.display_name,
      thumbnailUrl: item.thumbnail_url,
    });
    return channel && item.id ? [{ userId: item.id, channel }] : [];
  });

  if (matches.length === 0) {
    return [];
  }

  const users = await getUsersByIds(matches.map((match) => match.userId));

  return matches.map((match) => users.get(match.userId) ?? match.channel);
}

// One /streams call for up to 100 users. Users missing from the result are
// offline. Keys of the result are Twitch user ids.
export async function getStreamsByUserIds(
  userIds: string[],
): Promise<Map<string, LiveStatus>> {
  const statuses = new Map<string, LiveStatus>();
  if (userIds.length === 0) {
    return statuses;
  }

  const ids = userIds.slice(0, HELIX_MAX_IDS);
  const payload = await helixFetch<StreamsResponse>("/streams", [
    ...ids.map((id): [string, string] => ["user_id", id]),
    ["first", String(ids.length)],
  ]);
  const checkedAt = new Date().toISOString();

  for (const id of ids) {
    statuses.set(id, { status: "offline", checkedAt });
  }

  for (const stream of payload.data ?? []) {
    if (!stream.user_id || stream.type !== "live") {
      continue;
    }

    statuses.set(stream.user_id, {
      status: "live",
      checkedAt,
      title: stream.title?.trim() || "Live now",
      thumbnailUrl: (stream.thumbnail_url ?? "")
        .replace("{width}", STREAM_THUMBNAIL_SIZE.width)
        .replace("{height}", STREAM_THUMBNAIL_SIZE.height),
      startedAt: stream.started_at,
    });
  }

  return statuses;
}
