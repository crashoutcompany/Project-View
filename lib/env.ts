import "server-only";

function optionalEnv(name: string) {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

export function hasRedisEnv() {
  return Boolean(
    optionalEnv("KV_REST_API_URL") && optionalEnv("KV_REST_API_TOKEN"),
  );
}

export function hasYouTubeEnv() {
  return Boolean(optionalEnv("YOUTUBE_API_KEY"));
}

export function getRequiredEnv(name: string) {
  const value = optionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
