// The Twitch player only plays when `parent` lists the host of the page that
// embeds it, so every host we serve from (localhost, Vercel previews, prod and
// custom domains) has to be passed in.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

/** "https://Foo.vercel.app:443/x" -> "foo.vercel.app"; null when not a hostname. */
export function toHostname(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]
    .split(",")[0]
    .replace(/:\d+$/, "")

  return hostname.length <= 253 && HOSTNAME_PATTERN.test(hostname) ? hostname : null
}

export function twitchParentHosts(candidates: Array<string | null | undefined>) {
  return Array.from(
    new Set(candidates.map(toHostname).filter((host): host is string => Boolean(host)))
  )
}

export function twitchPlayerUrl(login: string, parents: string[], muted: boolean) {
  const params = new URLSearchParams({
    channel: login,
    autoplay: "true",
    muted: String(muted),
  })
  parents.forEach((parent) => params.append("parent", parent))

  return `https://player.twitch.tv/?${params}`
}

// Production host, always allowed so chat links shared from prod keep working.
export const TWITCH_PROD_PARENT = "project-view-rho.vercel.app"

export function twitchChatUrl(login: string, parents: string[], dark: boolean) {
  const params = new URLSearchParams()
  parents.forEach((parent) => params.append("parent", parent))

  // `darkpopout` is a bare flag, so it is appended by hand.
  return `https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?${params}${dark ? "&darkpopout" : ""}`
}
