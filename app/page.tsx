import { Suspense } from "react"

import { MultiwatchApp } from "@/components/multiwatch-app"
import {
  getSearchResults,
  getSeedResults,
  getSelectedChannels,
  projectConfigured,
} from "@/lib/search-service"

type PageProps = {
  searchParams: Promise<{
    q?: string | string[]
    channels?: string | string[]
  }>
}

export function PageFallback() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-[#050507] text-foreground">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 px-3">
        <div className="size-6 bg-muted/30" />
        <div className="h-4 w-px bg-border/50" />
        <div className="h-4 w-20 bg-muted/30" />
        <div className="flex-1" />
        <div className="h-4 w-32 bg-muted/20" />
      </div>
      <div className="flex-1 bg-[#050507]" />
    </div>
  )
}

export async function PageContent({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const configured = projectConfigured()
  const query =
    typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : ""
  const channelIds =
    typeof resolvedSearchParams.channels === "string"
      ? resolvedSearchParams.channels.split(",").filter(Boolean)
      : []

  const [seedPayload, searchPayload, selectedChannels] = configured
    ? await Promise.all([
        getSeedResults(),
        getSearchResults(query),
        getSelectedChannels(channelIds),
      ])
    : [
        { query: "", channels: [], cached: false, source: "seed" as const },
        { query, channels: [], cached: false, source: "search" as const },
        [],
      ]

  return (
    <MultiwatchApp
      initialQuery={query}
      initialResults={searchPayload.channels}
      initialSeedResults={seedPayload.channels}
      initialSelectedChannels={selectedChannels}
      initialUpdatedAt={new Date().toISOString()}
      configured={configured}
    />
  )
}

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={<PageFallback />}>
      <PageContent searchParams={props.searchParams} />
    </Suspense>
  )
}
