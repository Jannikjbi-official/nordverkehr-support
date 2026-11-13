import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, DiscordLogo } from "@phosphor-icons/react/ssr";
import { hostOf, publicEnv } from "@/lib/env";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { UserMenu } from "@/components/layout/UserMenu";
import { PortalNavLinks } from "@/components/layout/PortalNavLinks";

/** Kopfzeile: Support-Navigation + Links zur Hauptseite, zum Bewerbungsportal und zu Discord. */
export function SiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-40">
      <div className="h-[2px] bg-red" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-3 sm:pt-4">
        <nav
          aria-label="Hauptnavigation"
          className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 sm:px-5 py-2.5 backdrop-blur-xl"
          style={{ background: "var(--nv-overlay)" }}
        >
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Nordverkehr Support-Center – Startseite">
              <Image src="/Nord-Verkehr-Wordmark.png" alt="Nordverkehr" width={753} height={148} loading="eager" fetchPriority="high" className="h-[22px] sm:h-[24px] w-auto" />
              <span className="hidden sm:inline nv-mono !text-[0.65rem] border-l border-line pl-3">Support</span>
            </Link>
            <PortalNavLinks />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden xl:flex items-center gap-0.5 mr-1">
              <a href={publicEnv.mainSiteUrl} className="nv-btn nv-btn-quiet nv-btn-sm !px-2.5 whitespace-nowrap">
                {hostOf(publicEnv.mainSiteUrl)} <ArrowUpRight size={12} aria-hidden />
              </a>
              <a href={publicEnv.bewerbungUrl} className="nv-btn nv-btn-quiet nv-btn-sm !px-2.5 whitespace-nowrap">
                Bewerbung <ArrowUpRight size={12} aria-hidden />
              </a>
            </div>
            <ThemeToggle />
            <Suspense fallback={<div className="h-9 w-9 rounded-full nv-skeleton" aria-hidden />}>
              <UserMenu />
            </Suspense>
            <a href={publicEnv.discordInvite} target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex nv-btn nv-btn-discord nv-btn-sm !px-3.5 !py-2">
              <DiscordLogo weight="fill" size={16} aria-hidden />
              Discord
            </a>
            <MobileMenu discordInvite={publicEnv.discordInvite} mainSiteUrl={publicEnv.mainSiteUrl} bewerbungUrl={publicEnv.bewerbungUrl} />
          </div>
        </nav>
      </div>
    </header>
  );
}
