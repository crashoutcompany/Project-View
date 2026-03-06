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

function PageFallback() {
  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,#88133722,transparent_32%),linear-gradient(180deg,#050505_0%,#111827_52%,#050505_100%)] text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 lg:px-10">
        <section className="grid gap-6 border border-border/70 bg-background/70 p-6 backdrop-blur-sm lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="h-5 w-36 bg-muted/40" />
            <div className="space-y-3">
              <div className="h-12 max-w-2xl bg-muted/40" />
              <div className="h-5 max-w-xl bg-muted/30" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="h-24 border border-border/70 bg-card/60" />
            <div className="h-24 border border-border/70 bg-card/60" />
            <div className="h-24 border border-border/70 bg-card/60" />
          </div>
        </section>
        <section className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="h-40 border border-border/70 bg-card/75 backdrop-blur-sm" />
            <div className="h-72 border border-border/70 bg-card/75 backdrop-blur-sm" />
          </div>
          <div className="h-[32rem] border border-border/70 bg-card/75 backdrop-blur-sm" />
        </section>
      </div>
    </div>
  )
}

async function PageContent({ searchParams }: PageProps) {
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
