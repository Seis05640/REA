import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isAllowedHost } from "@/lib/server";

import "./globals.css";

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-family",
});
const sans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-sans-family",
});
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono-family",
});

export const metadata: Metadata = {
  title: "Reall",
  description: "Clone and enhance applications with REA and the model you choose.",
};

const NAV = [
  { href: "/", label: "Jobs", index: "01" },
  { href: "/jobs/new", label: "New clone", index: "02" },
  { href: "/models", label: "Models", index: "03" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Pages are local-only too, so another Host header cannot read them.
  if (!isAllowedHost((await headers()).get("host"))) notFound();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col gap-8 border-rule px-6 py-6 md:sticky md:top-0 md:h-screen md:w-56 md:border-r md:py-10">
            <Link href="/" className="group flex flex-col leading-none">
              <span className="font-display text-[2.6rem] tracking-tight">
                Reall<span className="text-signal">.</span>
              </span>
            </Link>
            <nav className="flex gap-4 md:flex-col md:gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-baseline gap-3 py-1.5 text-sm text-ink-2 hover:text-ink"
                >
                  <span className="font-mono text-[0.65rem] text-ink-3 group-hover:text-signal">
                    {item.index}
                  </span>
                  <span className="border-b border-transparent group-hover:border-signal">
                    {item.label}
                  </span>
                </Link>
              ))}
            </nav>
            <p className="mt-auto hidden text-[0.7rem] leading-relaxed text-ink-3 md:block">
              Runs locally. Keys and target credentials stay encrypted on this machine and
              are never sent to the model.
            </p>
          </aside>
          <main className="min-w-0 flex-1 px-6 py-8 md:px-12 md:py-12">{children}</main>
        </div>
      </body>
    </html>
  );
}
